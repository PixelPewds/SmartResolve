// Read-time computation and the write paths shared by the routes.
//
// Live priority, SLA clocks, escalations, the emotion trend and the
// escalation forecast are all functions of "now", so they are computed on
// every request rather than stored and left to go stale.
//
// Every way a complaint can arrive (web form, chat, simulated channels,
// agent-created) goes through createTicket(), and every customer follow-up
// through appendCustomerMessage(), so all channels share one pipeline.

import crypto from 'node:crypto';
import { livePriority, bandRank, assessIntake } from './ai/priority.js';
import { slaStatus, effectiveEscalation, SLA_POLICY } from './sla.js';
import { buildIndex, ticketText, cosine } from './ai/similarity.js';
import { detectClusters, overlap } from './ai/incidents.js';
import { recommendExperts } from './ai/experts.js';
import { emotionTrend, forecastEscalation } from './ai/forecast.js';
import { fingerprint, dnaMatch } from './ai/fingerprint.js';
import { analyzeMessage, describeMessage } from './ai/sentiment.js';
import { redact } from './ai/redact.js';
import { triage } from './ai/index.js';
import { ARTICLES } from './ai/kb.js';
import { channelLabel } from './channels.js';

const HOUR = 3600e3;
export const articleById = Object.fromEntries(ARTICLES.map(({ keywords, ...a }) => [a.id, a]));
export const newId = () => crypto.randomBytes(6).toString('hex');
export const nowIso = () => new Date().toISOString();
const teamFor = (routing) => (routing.team === 'Triage Review' ? 'Customer Care' : routing.team);

export async function addNotification(store, { to, type, title, body, ticketId = null, incidentId = null }) {
  await store.insert('notifications', { id: `n-${Date.now()}-${newId()}`, to, type, title, body, ticketId, incidentId, at: nowIso(), read: false });
}

/* ---------------------------------------------------------------- context */

export async function loadContext(store) {
  const [tickets, incidents, users] = await Promise.all([store.all('tickets'), store.all('incidents'), store.all('users')]);
  const agents = users.filter((u) => u.role === 'agent').map(({ passwordHash, ...a }) => a);
  return {
    now: Date.now(),
    tickets,
    incidents,
    incidentById: Object.fromEntries(incidents.map((i) => [i.id, i])),
    agents,
    users,
  };
}

const replaceInCtx = (ctx, t) => {
  const i = ctx.tickets.findIndex((x) => x.id === t.id);
  if (i >= 0) ctx.tickets[i] = t; else ctx.tickets.push(t);
};

export function enrich(t, ctx) {
  const sla = slaStatus(t, ctx.now);
  const incident = t.incidentId ? ctx.incidentById[t.incidentId] : null;
  const priority = livePriority(t, { now: ctx.now, sla, incident });
  const trend = emotionTrend(t.thread);
  const escalation = effectiveEscalation(t, sla, incident, trend);
  const forecast = forecastEscalation(t, { now: ctx.now, sla, trend, incident });
  return {
    ...t,
    priority, sla, escalation, trend, forecast,
    incident: incident ? { id: incident.id, title: incident.title, status: incident.status, severity: incident.severity } : null,
    flags: flagsFor(t, { sla, escalation, incident, trend, forecast }),
  };
}

function flagsFor(t, { sla, escalation, incident, trend, forecast }) {
  if (t.status === 'resolved') return [];
  const f = [];
  if (sla.state === 'breached') f.push({ key: 'sla', label: `SLA breached ${fmtDur(-sla.remainingMs)} ago` });
  else if (sla.state === 'warning') f.push({ key: 'sla-warn', label: `SLA due in ${fmtDur(sla.remainingMs)}` });
  if (escalation) f.push({ key: 'escalated', label: `Escalated ${escalation.level}${escalation.auto ? ` (rule ${escalation.rule})` : ''}` });
  if (forecast?.level === 'high') f.push({ key: 'risk', label: `Escalation risk ${forecast.score}` });
  if (trend?.review) f.push({ key: 'review', label: 'Frustration may be rising, check tone' });
  if (incident?.status === 'confirmed') f.push({ key: 'incident', label: `Incident ${incident.id}` });
  else if (incident?.status === 'candidate') f.push({ key: 'candidate', label: `Possible incident ${incident.id}` });
  if (!t.assigneeId) f.push({ key: 'unassigned', label: t.routingFallback ? 'No qualified agent free' : 'Unassigned' });
  if (t.customerTier === 'enterprise') f.push({ key: 'enterprise', label: 'Enterprise' });
  return f;
}

export function sortQueue(rows, sort = 'priority') {
  const by = {
    priority: (a, b) => (b.priority.pinned - a.priority.pinned) || (b.priority.score - a.priority.score) || a.createdAt.localeCompare(b.createdAt),
    risk: (a, b) => (b.forecast?.score ?? -1) - (a.forecast?.score ?? -1) || (b.priority.score - a.priority.score),
    sla: (a, b) => a.sla.remainingMs - b.sla.remainingMs,
    newest: (a, b) => b.createdAt.localeCompare(a.createdAt),
    oldest: (a, b) => a.createdAt.localeCompare(b.createdAt),
  };
  return rows.sort(by[sort] || by.priority);
}

export function listItem(t) {
  const { thread, message, notes, events, triage: _t, actions, articleIds, trend, forecast, fingerprint: fp, ...rest } = t;
  return {
    ...rest, snippet: message.slice(0, 160), messages: thread.length,
    trend: trend && { state: trend.state, worsening: trend.worsening, emotion: trend.latest.emotion, frustration: trend.latest.frustration, messages: trend.messages },
    forecast: forecast && { score: forecast.score, level: forecast.level, recommendation: forecast.recommendation },
    dna: fp && { code: fp.code, intent: fp.intent, services: fp.services, errorCodes: fp.errorCodes },
  };
}

/* -------------------------------------------------------------- similarity */

export function similarResolved(ticket, tickets, limit = 4) {
  const index = buildIndex(tickets);
  return index
    .similar(index.vecs.get(ticket.id) || index.vectorize(ticketText(ticket)), {
      exclude: ticket.id, filter: (d) => d.status === 'resolved' && d.resolution, limit, min: 0.15,
    })
    .map(({ doc, score }) => ({
      id: doc.id, subject: doc.subject, similarity: Number(score.toFixed(2)),
      category: doc.classification.category, team: doc.team, resolvedBy: doc.resolution.by,
      rootCause: doc.resolution.rootCause, fix: doc.resolution.fix,
      hoursToResolve: Number(((Date.parse(doc.resolvedAt) - Date.parse(doc.createdAt)) / HOUR).toFixed(1)),
      rating: doc.feedback?.rating ?? null,
    }));
}

// DNA Fingerprinting: complaints that share intent, service, error code or
// transaction reference, open or closed, from the last 14 days.
const RELATED_MIN = 0.35;
export function relatedTickets(ticket, ctx, limit = 8) {
  const index = buildIndex(ctx.tickets.some((x) => x.id === ticket.id) ? ctx.tickets : [...ctx.tickets, ticket]);
  const vec = index.vecs.get(ticket.id);
  const fp = ticket.fingerprint || fingerprint(ticket);
  const at = Date.parse(ticket.createdAt);
  const rows = [];
  for (const d of ctx.tickets) {
    if (d.id === ticket.id) continue;
    const hoursApart = Math.abs(Date.parse(d.createdAt) - at) / HOUR;
    if (hoursApart > 14 * 24) continue;
    const dfp = d.fingerprint || fingerprint(d);
    const m = dnaMatch(fp, dfp, { textSim: cosine(vec, index.vecs.get(d.id)), hoursApart });
    if (m.score < RELATED_MIN) continue;
    rows.push({
      id: d.id, subject: d.subject, status: d.status, createdAt: d.createdAt, team: d.team, band: d.triage.intakeBand,
      channel: d.channel, incidentId: d.incidentId, sameCustomer: d.customerId === ticket.customerId,
      score: m.score, reasons: m.reasons, hoursApart: Math.round(hoursApart * 10) / 10,
      dna: { code: dfp.code, intent: dfp.intent, services: dfp.services, errorCodes: dfp.errorCodes },
    });
  }
  rows.sort((a, b) => b.score - a.score);
  const openNearby = rows.filter((r) => r.status !== 'resolved' && r.hoursApart <= 6 && !r.sameCustomer).length;
  return { fingerprint: fp, related: rows.slice(0, limit), total: rows.length, openNearby, possibleIncident: openNearby >= 3, threshold: RELATED_MIN };
}

/* ----------------------------------------------------------------- experts */

export function expertsFor(ticket, ctx) {
  const openLoad = {};
  for (const t of ctx.tickets) if (t.status !== 'resolved' && t.assigneeId) openLoad[t.assigneeId] = (openLoad[t.assigneeId] || 0) + 1;

  // Experience: who resolved the tickets most similar to this one.
  const index = buildIndex(ctx.tickets);
  const vec = index.vecs.get(ticket.id) || index.vectorize(ticketText(ticket));
  const experience = {};
  for (const { doc } of index.similar(vec, { exclude: ticket.id, filter: (d) => d.status === 'resolved' && d.assigneeId, limit: 12, min: 0.2 })) {
    experience[doc.assigneeId] = (experience[doc.assigneeId] || 0) + 1;
  }
  // Track record: share of this category resolved within SLA, per agent.
  const trackRecord = {};
  for (const t of ctx.tickets) {
    if (t.status !== 'resolved' || !t.assigneeId || t.classification.category !== ticket.classification.category) continue;
    const r = (trackRecord[t.assigneeId] ||= { n: 0, met: 0 });
    r.n++;
    if (slaStatus(t, ctx.now).state === 'met') r.met++;
  }
  return recommendExperts(ticket, ctx.agents, { openLoad, experience, trackRecord });
}

// Agent-Complaint Match, automatic: the top ELIGIBLE expert gets the ticket.
// If nobody qualified is free it goes to the supervisor instead of to
// whoever happens to be online.
export async function autoAssign(store, ctx, t, { by = 'SmartResolve' } = {}) {
  if (t.status === 'resolved' || t.assigneeId) return { ticket: t, assigned: false };
  const rec = expertsFor(t, ctx);
  const top = rec.experts[0];
  const at = nowIso();
  if (!top?.eligible) {
    const next = await store.update('tickets', t.id, {
      routingFallback: { at, reason: rec.fallback.reason },
      events: [...t.events, { at, type: 'routed', by, text: `No qualified agent available, sent to the supervisor. ${rec.fallback.reason}` }],
    });
    replaceInCtx(ctx, next);
    await addNotification(store, { to: 'role:supervisor', type: 'assignment', title: `${t.id} needs a manual assignment`, body: rec.fallback.reason, ticketId: t.id });
    return { ticket: next, assigned: false, fallback: rec.fallback };
  }
  const why = top.reasons.filter((r) => r.ok).map((r) => r.text).slice(0, 3);
  const next = await store.update('tickets', t.id, {
    assigneeId: top.agentId, assigneeName: top.name, routingFallback: null, updatedAt: at,
    assignment: { method: 'auto', by, at, rank: 1, score: top.score, reason: null, why },
    events: [...t.events, { at, type: 'assigned', by, text: `Auto-assigned to ${top.name} (top match, score ${top.score}): ${why.join('; ')}` }],
  });
  replaceInCtx(ctx, next);
  await addNotification(store, { to: top.agentId, type: 'assignment', title: `${t.id} assigned to you`, body: t.subject, ticketId: t.id });
  await addNotification(store, { to: t.customerId, type: 'assigned', title: `${t.id} is with ${top.name.split(' ')[0]}`, body: `Your request is now with our ${top.team} team.`, ticketId: t.id });
  return { ticket: next, assigned: true, agent: top };
}

export function workload(ctx) {
  return ctx.agents.map((a) => {
    const mine = ctx.tickets.filter((t) => t.assigneeId === a.id);
    const open = mine.filter((t) => t.status !== 'resolved').map((t) => enrich(t, ctx));
    const resolved7 = mine.filter((t) => t.resolvedAt && ctx.now - Date.parse(t.resolvedAt) < 7 * 24 * HOUR);
    const ratings = mine.filter((t) => t.feedback).map((t) => t.feedback.rating);
    return {
      ...a,
      open: open.length,
      p1: open.filter((t) => t.priority.band === 'P1').length,
      breached: open.filter((t) => t.sla.state === 'breached').length,
      highRisk: open.filter((t) => t.forecast?.level === 'high').length,
      resolved7: resolved7.length,
      csat: ratings.length ? Number((ratings.reduce((s, r) => s + r, 0) / ratings.length).toFixed(1)) : null,
    };
  });
}

/* ------------------------------------------------------------ write paths */

// One intake path for every channel. `thread` is passed by the chat, which
// already holds an analysed transcript; everything else starts a new thread.
export async function createTicket(store, ctx, {
  customer, subject, message, channel, source = null, customerCategory = null,
  attachments = [], evidence = [], thread = null, by = null,
}) {
  const since = ctx.now - 7 * 24 * HOUR;
  const priorContacts = ctx.tickets.filter((t) => t.customerId === customer.id && Date.parse(t.createdAt) >= since).length;
  const r = await triage({ subject, message, customer, priorContacts });
  const number = await store.seq('ticket');
  const at = nowIso();
  const id = `SR-${number}`;
  const team = teamFor(r.routing);
  const analysis = describeMessage(`${subject}. ${r.message}`, r.sentiment);

  const evidenceMeta = [];
  for (const e of evidence) {
    const att = await storeEvidence(store, { ...e, ticketId: id, ownerId: customer.id, by: by || customer.name });
    evidenceMeta.push(att);
  }

  const ticket = {
    id, number,
    customerId: customer.id, customerName: customer.name, customerEmail: customer.email, customerTier: customer.tier,
    subject, message: r.message, channel, source,
    customerCategory: customerCategory && customerCategory !== 'unsure' ? customerCategory : null,
    attachments, evidence: evidenceMeta,
    status: 'open', team,
    sentiment: r.sentiment, classification: r.classification, triage: r.triage, routing: r.routing,
    fingerprint: fingerprint({ subject, message: r.message, classification: r.classification, createdAt: at }),
    redactions: r.redactions, articleIds: r.articles.map((a) => a.id), actions: r.actions,
    priorContacts,
    assigneeId: null, assigneeName: null, assignment: null, escalation: null, incidentId: null, routingFallback: null,
    notes: [], corrections: [], resolution: null, feedback: null,
    thread: thread || [{ id: newId(), author: 'customer', name: customer.name, body: r.message, at, channel, sentiment: analysis }],
    events: [
      { at, type: 'created', by: by || customer.name, text: `Submitted via ${channelLabel(channel)}${by ? ` on behalf of ${customer.name}` : ''}` },
      { at, type: 'triaged', by: 'SmartResolve', text: `${r.classification.label}, ${r.triage.urgency.level} urgency, intake ${r.triage.intakeBand}, routed to ${team}` },
      ...(evidenceMeta.length ? [{ at, type: 'evidence', by: customer.name, text: `Attached ${evidenceMeta.length} screenshot${evidenceMeta.length > 1 ? 's' : ''} with confirmed details` }] : []),
    ],
    createdAt: at, updatedAt: at, firstResponseAt: null, resolvedAt: null,
  };
  await store.insert('tickets', ticket);
  ctx.tickets.push(ticket);

  // A new complaint may complete a spike, or join a confirmed incident.
  await syncIncidents(store, ctx);
  const fresh = await store.get('tickets', id);
  replaceInCtx(ctx, fresh);
  const { ticket: routed } = await autoAssign(store, ctx, fresh);
  await addNotification(store, { to: 'role:supervisor', type: 'new', title: `New ${routed.triage.intakeBand} ticket ${id} (${channelLabel(channel)})`, body: `${subject} (${team})`, ticketId: id });
  return routed;
}

// A customer follow-up on any channel. Analysed per message for the
// escalation tracker; repeat contact can RAISE the intake band, never lower it.
export async function appendCustomerMessage(store, ctx, t, { body, channel, name }) {
  const clean = redact(body);
  const analysis = await analyzeMessage(clean.text);
  const at = nowIso();
  const followUps = t.thread.filter((m) => m.author === 'customer').length;
  const patch = {
    thread: [...t.thread, { id: newId(), author: 'customer', name: name || t.customerName, body: clean.text, at, channel, sentiment: analysis }],
    events: [...t.events, { at, type: 'reply', by: name || t.customerName, text: `Customer replied via ${channelLabel(channel)}` }],
    redactions: [...(t.redactions || []), ...clean.redactions],
    updatedAt: at,
  };
  const re = assessIntake({ text: `${t.subject}. ${clean.text}`, sentiment: analysis, customer: { tier: t.customerTier }, priorContacts: (t.priorContacts || 0) + followUps });
  if (t.status !== 'resolved' && bandRank(re.intakeBand) < bandRank(t.triage.intakeBand)) {
    patch.triage = { ...re, raisedFrom: t.triage.intakeBand, raisedAt: at };
    patch.events.push({ at, type: 'routed', by: 'SmartResolve', text: `Intake raised from ${t.triage.intakeBand} to ${re.intakeBand}: follow-up ${followUps}, ${analysis.emotion} tone` });
  }
  if (t.status === 'resolved') {
    patch.status = 'open'; patch.resolvedAt = null;
    patch.events.push({ at, type: 'status', by: t.customerName, text: 'Reopened by customer reply' });
  }
  const next = await store.update('tickets', t.id, patch);
  replaceInCtx(ctx, next);
  const trend = emotionTrend(next.thread);
  if (trend?.escalate && !emotionTrend(t.thread)?.escalate) {
    await addNotification(store, { to: 'role:supervisor', type: 'escalation', title: `${t.id}: frustration rising (rule R6)`, body: `${trend.points[0].emotion} to ${trend.latest.emotion} over ${trend.messages} messages`, ticketId: t.id });
  }
  await addNotification(store, { to: t.assigneeId || 'role:supervisor', type: 'reply', title: `Customer replied on ${t.id}`, body: clean.text.slice(0, 120), ticketId: t.id });
  return next;
}

// One-Click Proof evidence. The image arrives already masked by the browser
// and downscaled; the OCR text is redacted again here before it is stored.
export async function storeEvidence(store, { name, type, size, image = null, fields = [], text = '', ocr = {}, ticketId, ownerId, by }) {
  const id = `ev-${newId()}`;
  const at = nowIso();
  const clean = redact(text);
  const meta = {
    id, ticketId, name, type, size, at, by,
    hasImage: Boolean(image),
    quality: ocr.quality || null, meanConfidence: ocr.meanConfidence ?? null, engine: ocr.engine || null,
    fields: fields.map((f) => ({ key: f.key, label: f.label, value: redact(f.value).text, confidence: f.confidence ?? null, uncertain: Boolean(f.uncertain), edited: Boolean(f.edited) })),
    confirmedByCustomer: true,
  };
  await store.insert('attachments', { ...meta, ownerId, image, text: clean.text });
  return meta;
}

/* ---------------------------------------------------------------- summary */

// Plain-language "why is this urgent", built from the computed signals.
// A template, not a language model: every clause is traceable to a number.
export function summarize(t, { related } = {}) {
  const parts = [];
  const fp = t.fingerprint;
  const intent = fp && !fp.intent.endsWith('_other') ? ` (${fp.intent.replace(/_/g, ' ')})` : '';
  parts.push(`${t.classification.label}${intent}${fp?.services.length ? ` involving ${fp.services.slice(0, 2).join(' and ')}` : ''}${fp?.errorCodes.length ? `, error ${fp.errorCodes.join(', ')}` : ''}, via ${channelLabel(t.channel).toLowerCase()}.`);
  const said = t.thread.filter((m) => m.author === 'customer').length;
  if (t.trend) {
    parts.push(said > 1
      ? `${t.customerName.split(' ')[0]} has written ${said} times; tone went from ${t.trend.points[0].emotion} to ${t.trend.latest.emotion}${t.trend.worsening ? ' and is getting worse' : ''}.`
      : `${t.customerName.split(' ')[0]} sounds ${t.trend.latest.emotion}.`);
  }
  if (t.priorContacts) parts.push(`${t.priorContacts} other ticket${t.priorContacts > 1 ? 's' : ''} from them this week.`);
  if (t.forecast?.inputs.awaitingReply) parts.push(`Waiting ${fmtDur(t.forecast.inputs.waitHours * HOUR)} for a reply.`);
  if (t.status !== 'resolved') parts.push(`Priority ${t.priority.band} (${t.priority.score}/100), escalation risk ${t.forecast.level} (${t.forecast.score}).`);
  if (t.incident) parts.push(`Linked to ${t.incident.status} incident ${t.incident.id}.`);
  else if (related?.possibleIncident) parts.push(`${related.openNearby} similar open complaints in the last 6 hours: possibly one shared cause.`);
  if (t.evidence?.length) parts.push(`Screenshot attached, ${t.evidence[0].fields.length} details confirmed by the customer.`);
  if (t.routingFallback && !t.assigneeId) parts.push('No qualified agent was free, so it is waiting for the supervisor.');
  return { text: parts.join(' '), method: 'Template over computed signals. No language model.' };
}

/* --------------------------------------------------------------- incidents */

// Runs detection and reconciles it with stored incidents. Writes happen here
// (new candidates, ticket links), which is acceptable for a prototype and
// avoids needing a background job on serverless hosting.
export async function syncIncidents(store, ctx) {
  const clusters = detectClusters(ctx.tickets, ctx.now);
  const groups = [];
  const changed = [];

  for (const c of clusters) {
    // A resolved incident's tickets stay in the 3h window for a while. Without this the
    // same spike is re-detected as a fresh candidate the moment it is resolved.
    const done = ctx.incidents.find((i) => i.status === 'resolved' && overlap(i.ticketIds, c.ticketIds) >= 0.4);
    if (done) {
      const since = Date.parse(done.resolvedAt || 0);
      const fresh = c.ticketIds.filter((id) => !done.ticketIds.includes(id) && Date.parse(ctx.tickets.find((t) => t.id === id)?.createdAt) > since);
      if (fresh.length < 4) continue;
    }
    const match = ctx.incidents.find((i) => i.status !== 'resolved' && overlap(i.ticketIds, c.ticketIds) >= 0.4);
    if (!c.spike.isSpike) {
      if (!match) groups.push({ ...c, status: 'normal' });
      continue;
    }
    if (match) {
      if (match.status === 'dismissed') continue;
      const ticketIds = [...new Set([...match.ticketIds, ...c.ticketIds])];
      const next = await store.update('incidents', match.id, { ticketIds, spike: c.spike, keywords: c.keywords, customers: c.customers, dna: c.dna });
      Object.assign(match, next);
      if (match.status === 'confirmed') changed.push(...await linkTickets(store, ctx, match));
      else {
        for (const id of c.ticketIds) {
          const t = ctx.tickets.find((x) => x.id === id);
          if (t && !t.incidentId) { t.incidentId = match.id; await store.update('tickets', t.id, { incidentId: match.id }); }
        }
      }
    } else {
      const n = await store.seq('incident');
      const inc = {
        id: `INC-${n}`, title: c.title, status: 'candidate', severity: null,
        category: c.category, team: c.team, ticketIds: c.ticketIds, keywords: c.keywords, dna: c.dna,
        detectedAt: new Date(ctx.now).toISOString(), firstReportedAt: c.firstReportedAt, customers: c.customers,
        spike: c.spike,
        history: [{ at: new Date(ctx.now).toISOString(), by: 'SmartResolve', action: 'detected',
          note: `${c.spike.recent} similar complaints in ${c.spike.windowHours}h, ${c.spike.ratio}x the usual rate` }],
      };
      await store.insert('incidents', inc);
      ctx.incidents.push(inc);
      ctx.incidentById[inc.id] = inc;
      // Tag member tickets so agents see "possible incident" without any score change.
      for (const id of inc.ticketIds) {
        const t = ctx.tickets.find((x) => x.id === id);
        if (t && !t.incidentId) { t.incidentId = inc.id; await store.update('tickets', t.id, { incidentId: inc.id }); }
      }
      await store.insert('notifications', {
        id: `n-${Date.now()}-${n}`, to: 'role:supervisor', type: 'incident',
        title: `Possible incident ${inc.id}`, body: `${c.title}: ${c.spike.recent} complaints in ${c.spike.windowHours}h`,
        at: inc.detectedAt, ticketId: null, incidentId: inc.id, read: false,
      });
    }
  }
  return { groups, changed };
}

export async function linkTickets(store, ctx, inc) {
  const linked = [];
  for (const id of inc.ticketIds) {
    const t = ctx.tickets.find((x) => x.id === id);
    if (!t || t.status === 'resolved' || (t.incidentId === inc.id && t.incidentLinkedAt)) continue;
    const at = new Date(ctx.now).toISOString();
    const patch = {
      incidentId: inc.id, incidentLinkedAt: at,
      events: [...t.events, { at, type: 'incident', by: 'SmartResolve', text: `Linked to confirmed incident ${inc.id}` }],
      thread: [...t.thread, { id: `sys-${inc.id}`, author: 'system', name: 'SmartResolve', at,
        body: `We have identified a wider issue affecting several customers (${inc.title}). Our ${inc.team} team is working on it and we will update you here.` }],
    };
    Object.assign(t, await store.update('tickets', t.id, patch));
    linked.push(t.id);
    await store.insert('notifications', {
      id: `n-${Date.now()}-${t.id}`, to: t.customerId, type: 'incident', title: `Known issue on ${t.id}`,
      body: 'We are aware of a wider issue and are working on it.', at, ticketId: t.id, read: false,
    });
  }
  return linked;
}

/* ----------------------------------------------------------- notifications */

export async function notificationsFor(store, user, ctx) {
  const [stored, readsDoc] = await Promise.all([store.all('notifications'), store.get('reads', user.id)]);
  const read = new Set(readsDoc?.ids || []);
  const role = `role:${user.role}`;
  const mine = stored.filter((n) => n.to === user.id || n.to === role);

  // SLA warnings and forecast alerts are derived from time, never stored.
  const derived = [];
  if (user.role !== 'customer') {
    for (const t of ctx.tickets) {
      if (t.status === 'resolved') continue;
      const relevant = user.role === 'supervisor' ? true : t.assigneeId === user.id;
      if (!relevant) continue;
      const sla = slaStatus(t, ctx.now);
      if (sla.state === 'breached' && (user.role === 'agent' || bandRank(t.triage.intakeBand) <= 2)) {
        derived.push({ id: `sla-breach:${t.id}`, type: 'sla', title: `SLA breached on ${t.id}`, body: `${t.subject} (${sla.clockLabel.toLowerCase()} target)`, at: sla.dueAt, ticketId: t.id });
      } else if (sla.state === 'warning' && (user.role === 'agent' || !t.assigneeId)) {
        const at = new Date(Date.parse(sla.dueAt) - (1 - 0.75) * (Date.parse(sla.dueAt) - Date.parse(t.createdAt))).toISOString();
        derived.push({ id: `sla-warn:${t.id}`, type: 'sla-warning', title: `SLA due soon on ${t.id}`, body: `${t.subject}${t.assigneeId ? '' : ' (unassigned)'}`, at, ticketId: t.id });
      }
      const fc = forecastEscalation(t, { now: ctx.now, sla, trend: emotionTrend(t.thread) });
      if (fc?.level === 'high') {
        const last = t.thread.findLast((m) => m.author === 'customer');
        derived.push({ id: `risk:${t.id}:${last?.id}`, type: 'risk', title: `High escalation risk on ${t.id} (${fc.score})`, body: fc.recommendation[0] || t.subject, at: last?.at || t.createdAt, ticketId: t.id });
      }
    }
  }

  return [...mine, ...derived]
    .map((n) => ({ ...n, read: read.has(n.id) || Boolean(n.read) }))
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 60);
}

export const policyFor = (band) => SLA_POLICY[band];

export function fmtDur(ms) {
  const m = Math.round(Math.abs(ms) / 60000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ${m % 60}m`;
  return `${Math.round(h / 24)}d`;
}
