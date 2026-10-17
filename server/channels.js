// Multi-Way Submission. Every channel is normalised into one shape before it
// reaches the triage pipeline, so a WhatsApp message and a web form produce
// the same ticket fields, and the channel is kept on every message.
//
// Live in this prototype: web form, live chat (the assistant), agent-created.
// Simulated: email, WhatsApp, phone transcript, social, in-app. Their
// adapters are real code, but the payloads come from the Channel simulator,
// not from Gmail, Meta or a telephony provider.

import { z } from 'zod';

export const CHANNELS = {
  web:      { label: 'Web form', live: true },
  chat:     { label: 'Live chat', live: true },
  agent:    { label: 'Agent-created', live: true },
  email:    { label: 'Email', live: false },
  whatsapp: { label: 'WhatsApp', live: false },
  phone:    { label: 'Phone call', live: false },
  social:   { label: 'Social media', live: false },
  in_app:   { label: 'In-app support', live: false },
};
export const CHANNEL_KEYS = Object.keys(CHANNELS);
export const channelLabel = (c) => CHANNELS[c]?.label || c;

const text = (min, max) => z.string().trim().min(min).max(max);
export const RAW = {
  email: z.object({ from: text(3, 200), subject: text(1, 140), body: text(10, 8000) }),
  whatsapp: z.object({ from: text(8, 20), profileName: text(1, 80).optional(), text: text(5, 4000) }),
  phone: z.object({ callerId: text(8, 20), customerName: text(1, 80).optional(), transcript: text(10, 8000), durationSec: z.coerce.number().int().min(0).max(36000).optional() }),
  social: z.object({ platform: z.enum(['twitter', 'instagram', 'facebook', 'linkedin']), handle: text(2, 60), customerEmail: z.email().optional().or(z.literal('')), post: text(5, 2000) }),
  in_app: z.object({ userEmail: z.email(), screen: text(1, 80).optional(), appVersion: text(1, 20).optional(), device: text(1, 80).optional(), text: text(5, 4000) }),
  agent: z.object({ customerEmail: z.email(), customerName: text(2, 80).optional(), subject: text(4, 140), message: text(15, 4000), via: z.enum(['phone', 'walk_in', 'email', 'other']).default('phone') }),
};

const firstSentence = (s, n = 70) => {
  const f = String(s).replace(/\s+/g, ' ').trim().split(/(?<=[.!?])\s/)[0];
  return f.length > n ? `${f.slice(0, n - 3).replace(/\s+\S*$/, '')}...` : f;
};
export const phoneKey = (p) => String(p || '').replace(/\D/g, '').slice(-10);

// raw payload -> { identity, subject, message, meta }
export function normalizeInbound(channel, payload) {
  const raw = RAW[channel].parse(payload);
  switch (channel) {
    case 'email': {
      const m = raw.from.match(/^\s*"?([^"<]*)"?\s*<([^>]+)>\s*$/);
      const email = (m ? m[2] : raw.from).trim().toLowerCase();
      // Drop the quoted thread and the signature: they repeat old text and
      // would skew both sentiment and similarity.
      const lines = [];
      for (const line of raw.body.split(/\r?\n/)) {
        if (/^\s*>/.test(line)) continue;
        if (/^On .+wrote:\s*$/.test(line) || /^--\s*$/.test(line) || /^Sent from my /i.test(line)) break;
        lines.push(line);
      }
      return { identity: { email, name: m?.[1]?.trim() || null }, subject: raw.subject.replace(/^(re|fwd?):\s*/i, ''), message: lines.join('\n').trim() || raw.body, meta: { from: email } };
    }
    case 'whatsapp':
      return { identity: { phone: phoneKey(raw.from), name: raw.profileName || null }, subject: firstSentence(raw.text), message: raw.text, meta: { from: `+91 ••••• ${phoneKey(raw.from).slice(-5)}` } };
    case 'phone': {
      // Keep only what the customer said; the agent's lines are not the complaint.
      const said = raw.transcript.split(/\r?\n/).map((l) => l.match(/^\s*(?:customer|caller|c)\s*:\s*(.+)$/i)?.[1]).filter(Boolean);
      const message = said.length ? said.join(' ') : raw.transcript;
      return { identity: { phone: phoneKey(raw.callerId), name: raw.customerName || null }, subject: firstSentence(message), message, meta: { durationSec: raw.durationSec ?? null, transcriptLines: raw.transcript.split(/\r?\n/).length } };
    }
    case 'social': {
      const message = raw.post.replace(/(^|\s)@\w+/g, ' ').replace(/\s+/g, ' ').trim();
      return { identity: { handle: `${raw.platform}:${raw.handle.replace(/^@/, '').toLowerCase()}`, email: raw.customerEmail || null }, subject: firstSentence(message), message, meta: { platform: raw.platform, public: true } };
    }
    case 'in_app':
      return { identity: { email: raw.userEmail.toLowerCase() }, subject: firstSentence(raw.text), message: raw.text, meta: { screen: raw.screen || null, appVersion: raw.appVersion || null, device: raw.device || null } };
    case 'agent':
      return { identity: { email: raw.customerEmail.toLowerCase(), name: raw.customerName || null }, subject: raw.subject, message: raw.message, meta: { via: raw.via } };
    default:
      throw new Error(`Unknown channel ${channel}`);
  }
}

// Find the customer the message is from, or create a contact record with no
// password (they can register later to see the ticket in the portal).
export function matchCustomer(users, identity) {
  const customers = users.filter((u) => u.role === 'customer');
  return (identity.email && customers.find((u) => u.email === identity.email))
    || (identity.phone && customers.find((u) => phoneKey(u.phone) === identity.phone))
    || (identity.handle && customers.find((u) => (u.handles || []).includes(identity.handle)))
    || null;
}
