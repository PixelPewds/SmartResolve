// Explainable expert recommendation.
//
//   match = skill fit (0-45) + availability (0-20) + workload headroom (0-20)
//         + experience with similar tickets (0-15)
//
// This is a weighted score, not a prediction and not an accuracy figure.
// Each part is returned with its reason so a supervisor can disagree with a
// specific part and override.

import { normalize, matchPhrases } from './text.js';

export const SKILLS = {
  'Outages': ['outage', 'down', 'not loading', 'slow', 'server', 'pages', 'website'],
  'API & integrations': ['api', 'integration', '500', 'timeout', 'webhook'],
  'Mobile app': ['app', 'crash', 'crashes', 'crashing', 'android', 'ios', 'update'],
  'Payments': ['payment', 'upi', 'charged', 'transaction', 'debit', 'deducted', 'checkout', 'wallet'],
  'Refunds': ['refund', 'money back', 'reversal'],
  'Invoices & GST': ['invoice', 'gst', 'bill', 'receipt'],
  'Subscriptions': ['subscription', 'renewed', 'plan'],
  'Fraud': ['fraud', 'unauthorized', 'hacked', 'stolen', 'suspicious', 'accessed by someone'],
  'Delivery': ['delivery', 'delivered', 'parcel', 'courier', 'tracking', 'transit', 'arrived', 'dispatch'],
  'Returns': ['damaged', 'wrong item', 'return', 'replacement', 'defective'],
  'West region logistics': ['kolhapur', 'pune', 'satara', 'sangli', 'belgaum'],
  'Account access': ['login', 'log in', 'password', 'locked', 'otp', 'sign in', '2fa'],
  'General support': ['how do i', 'question', 'policy', 'feedback', 'hours'],
};

const CATEGORY_SKILL = {
  billing: 'Payments', technical: 'Outages', delivery: 'Delivery', account: 'Account access', general: 'General support',
};

export function neededSkills(ticket) {
  const norm = normalize(`${ticket.subject}. ${ticket.message}`);
  const found = Object.entries(SKILLS).filter(([, kws]) => matchPhrases(norm, kws).length).map(([s]) => s);
  const base = CATEGORY_SKILL[ticket.classification.category];
  return [...new Set([base, ...found])].slice(0, 4);
}

const AVAIL = { online: { pts: 20, label: 'Online now' }, away: { pts: 8, label: 'Away, back soon' }, offline: { pts: 0, label: 'Offline' } };

// openLoad: { agentId: number of open tickets }
// experience: { agentId: count of similar tickets they resolved }
export function recommendExperts(ticket, agents, { openLoad = {}, experience = {} } = {}) {
  const needed = neededSkills(ticket);

  const ranked = agents.map((a) => {
    const matched = needed.filter((s) => a.skills.includes(s));
    const teamFit = a.team === ticket.team;
    const skill = Math.round((teamFit ? 15 : 0) + 30 * (matched.length / needed.length));
    const avail = AVAIL[a.status] || AVAIL.offline;
    const load = openLoad[a.id] || 0;
    const headroom = Math.max(0, 1 - load / a.capacity);
    const workload = Math.round(20 * headroom);
    const exp = experience[a.id] || 0;
    const expPts = Math.round(15 * Math.min(1, exp / 3));
    const score = skill + avail.pts + workload + expPts;

    const reasons = [];
    if (matched.length) reasons.push({ ok: true, text: `Skills match: ${matched.join(', ')}` });
    else reasons.push({ ok: false, text: `No listed skill for ${needed.join(', ')}` });
    reasons.push(teamFit ? { ok: true, text: `In ${a.team}, the team this ticket is routed to` } : { ok: false, text: `Works in ${a.team}, ticket is routed to ${ticket.team}` });
    reasons.push({ ok: a.status === 'online', text: avail.label });
    reasons.push({ ok: headroom >= 0.34, text: `${load} of ${a.capacity} open tickets` });
    reasons.push(exp ? { ok: true, text: `Resolved ${exp} similar ticket${exp > 1 ? 's' : ''}` } : { ok: false, text: 'No similar tickets resolved yet' });

    return {
      agentId: a.id, name: a.name, title: a.title, team: a.team, status: a.status, skills: a.skills,
      load, capacity: a.capacity, score, eligible: a.status !== 'offline' && load < a.capacity,
      parts: [
        { key: 'skill', label: 'Skill fit', points: skill, max: 45 },
        { key: 'availability', label: 'Availability', points: avail.pts, max: 20 },
        { key: 'workload', label: 'Workload headroom', points: workload, max: 20 },
        { key: 'experience', label: 'Similar tickets resolved', points: expPts, max: 15 },
      ],
      reasons,
    };
  });

  // Eligible agents first, then by score.
  ranked.sort((x, y) => (y.eligible - x.eligible) || (y.score - x.score));
  return { neededSkills: needed, experts: ranked };
}
