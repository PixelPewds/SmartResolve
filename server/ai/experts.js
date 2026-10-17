// Agent-Complaint Match: explainable expert recommendation.
//
// Two stages, in this order:
//   1. Eligibility (hard rules): has a required skill, is not offline, has
//      capacity, and is senior enough for P1 or security work. Failing any
//      rule means "do not assign", whatever the score.
//   2. Ranking (weighted score, 0-100):
//        skill fit 40 + availability 15 + workload headroom 20
//        + similar tickets resolved 15 + category track record 10
//
// Track record only counts with at least MIN_HISTORY resolved tickets in the
// category, so two lucky tickets do not make someone "the expert". Customer
// sentiment is never used to judge an agent.
//
// If nobody is eligible the answer is "escalate to the supervisor", never
// "assign the least bad person".

import { normalize, matchPhrases } from './text.js';

export const SKILLS = {
  'Outages': ['outage', 'down', 'not loading', 'slow', 'server', 'pages', 'website'],
  'API & integrations': ['api', 'integration', '500', 'timeout', 'webhook'],
  'Mobile app': ['app', 'crash', 'crashes', 'crashing', 'android', 'ios', 'update'],
  'Payments': ['payment', 'upi', 'charged', 'transaction', 'debit', 'deducted', 'checkout', 'wallet', 'gateway'],
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
const SECURITY_SKILLS = ['Fraud', 'Account access'];
export const MIN_HISTORY = 5;
export const SENIORITY = { 1: 'Associate', 2: 'Specialist', 3: 'Senior' };

export function neededSkills(ticket) {
  const norm = normalize(`${ticket.subject}. ${ticket.message}`);
  const found = Object.entries(SKILLS).filter(([, kws]) => matchPhrases(norm, kws).length).map(([s]) => s);
  const base = CATEGORY_SKILL[ticket.classification.category];
  return [...new Set([base, ...found])].slice(0, 4);
}

const AVAIL = { online: { pts: 15, label: 'Online now' }, away: { pts: 6, label: 'Away, back soon' }, offline: { pts: 0, label: 'Offline' } };

// openLoad:    { agentId: open tickets }
// experience:  { agentId: similar tickets they resolved }
// trackRecord: { agentId: { n, met } } resolved tickets in this category, SLA met
export function recommendExperts(ticket, agents, { openLoad = {}, experience = {}, trackRecord = {} } = {}) {
  const needed = neededSkills(ticket);
  const security = ticket.routing?.rule === 'security-override';
  const required = security ? SECURITY_SKILLS : [CATEGORY_SKILL[ticket.classification.category]];
  const needsSenior = security || ticket.triage?.intakeBand === 'P1';
  const catLabel = ticket.classification.label || ticket.classification.category;

  const ranked = agents.map((a) => {
    const matched = needed.filter((s) => a.skills.includes(s));
    const teamFit = a.team === ticket.team;
    const hasRequired = required.some((s) => a.skills.includes(s));
    // Security work needs the security skill itself; being on the team is not enough.
    const qualified = security ? hasRequired : hasRequired || (teamFit && matched.length > 0);
    const seniority = a.seniority ?? 2;
    const load = openLoad[a.id] || 0;
    const blocks = [];
    if (!qualified) blocks.push(`Missing required skill: ${required.join(' or ')}`);
    if (a.status === 'offline') blocks.push('Offline');
    if (load >= a.capacity) blocks.push(`At capacity (${load} of ${a.capacity})`);
    if (needsSenior && seniority < 2) blocks.push(`${security ? 'Security' : 'P1'} work needs a specialist or senior`);

    const skill = Math.round((teamFit ? 12 : 0) + 28 * (matched.length / needed.length));
    const avail = AVAIL[a.status] || AVAIL.offline;
    const headroom = Math.max(0, 1 - load / a.capacity);
    const workload = Math.round(20 * headroom);
    const exp = experience[a.id] || 0;
    const expPts = Math.round(15 * Math.min(1, exp / 3));
    const tr = trackRecord[a.id] || { n: 0, met: 0 };
    const enough = tr.n >= MIN_HISTORY;
    const rate = enough ? tr.met / tr.n : null;
    const trPts = enough ? Math.round(10 * rate) : 0;
    const score = skill + avail.pts + workload + expPts + trPts;

    const reasons = [];
    if (matched.length) reasons.push({ ok: true, text: `Skills match: ${matched.join(', ')}` });
    else reasons.push({ ok: false, text: `No listed skill for ${needed.join(', ')}` });
    reasons.push(teamFit ? { ok: true, text: `In ${a.team}, the team this ticket is routed to` } : { ok: false, text: `Works in ${a.team}, ticket is routed to ${ticket.team}` });
    reasons.push({ ok: a.status === 'online', text: avail.label });
    reasons.push({ ok: headroom >= 0.34, text: `${load} of ${a.capacity} open tickets` });
    reasons.push(exp ? { ok: true, text: `Resolved ${exp} similar ticket${exp > 1 ? 's' : ''}` } : { ok: false, text: 'No similar tickets resolved yet' });
    reasons.push(enough
      ? { ok: rate >= 0.8, text: `${Math.round(rate * 100)}% of ${tr.n} ${catLabel} tickets resolved within SLA` }
      : { ok: false, text: `Not enough ${catLabel} history to judge (${tr.n} of ${MIN_HISTORY} needed)` });

    return {
      agentId: a.id, name: a.name, title: a.title, team: a.team, status: a.status, skills: a.skills,
      seniority, seniorityLabel: SENIORITY[seniority],
      load, capacity: a.capacity, score, qualified, eligible: blocks.length === 0, blocks,
      parts: [
        { key: 'skill', label: 'Skill fit', points: skill, max: 40 },
        { key: 'availability', label: 'Availability', points: avail.pts, max: 15 },
        { key: 'workload', label: 'Workload', points: workload, max: 20 },
        { key: 'experience', label: 'Similar resolved', points: expPts, max: 15 },
        { key: 'record', label: 'Track record', points: trPts, max: 10, insufficient: !enough },
      ],
      reasons,
    };
  });

  // Eligible agents first, then by score.
  ranked.sort((x, y) => (y.eligible - x.eligible) || (y.score - x.score));
  const top = ranked[0];
  const fallback = top?.eligible ? null : {
    action: 'supervisor',
    reason: `No qualified agent is available for ${required.join(' / ')}${needsSenior ? ' at specialist level' : ''}. ${
      ranked.filter((r) => r.qualified).map((r) => `${r.name}: ${r.blocks.join(', ')}`).join('; ') || 'Nobody on the roster has the skill.'}`,
  };
  return { neededSkills: needed, requiredSkills: required, needsSenior, experts: ranked, fallback };
}
