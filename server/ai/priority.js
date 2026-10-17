// Hybrid priority scheduling.
//
//   score = urgency (0-35) + impact (0-25)        <- AI assessment, fixed at intake
//         + waiting time (0-20) + SLA risk (0-20)  <- scheduling, recomputed on every read
//
// The intake half answers "how bad is this?". The scheduling half answers
// "how long has it been ignored?". A routine ticket that sits for two days
// therefore climbs the queue on its own, which a static AI score never does.
//
// Every point carries a written reason. Floors and caps are listed as rules,
// so an agent can see when a guardrail, not the arithmetic, set the band.

import { normalize, matchPhrases, capsRatio, clamp } from './text.js';

// Intake band sets the SLA commitment and is judged on the AI half alone (0-60).
const INTAKE_BANDS = [
  { band: 'P1', min: 44 }, { band: 'P2', min: 33 }, { band: 'P3', min: 20 }, { band: 'P4', min: 0 },
];
// Live band is judged on the full 0-100 score.
export const BANDS = [
  { band: 'P1', label: 'Critical', min: 70 },
  { band: 'P2', label: 'High',     min: 52 },
  { band: 'P3', label: 'Medium',   min: 34 },
  { band: 'P4', label: 'Low',      min: 0 },
];
const BAND_FLOOR = { P1: 70, P2: 52, P3: 34, P4: 0 };
const RANK = { P1: 1, P2: 2, P3: 3, P4: 4 };

const SEVERITY = [
  { level: 'critical', points: 26, terms: [
    'outage', 'data loss', 'hacked', 'unauthorized', 'fraud', 'stolen', 'security breach',
    'charged twice', 'double charged', 'locked out', 'cannot access', "can't access", 'completely down',
    'site is down', 'app is down', 'all users', 'money deducted', 'legal action', 'consumer court',
    'accessed by someone', 'is down', 'are down', 'gateway down', 'money was deducted', 'amount deducted',
    'amount debited', 'deducted but', 'debited but', 'still unpaid',
  ] },
  { level: 'major', points: 17, terms: [
    'not working', 'crash', 'crashes', 'crashing', 'failed', 'payment failed', 'error', 'errors',
    'never arrived', 'not received', 'never received', 'wrong item', 'damaged', 'refund not', 'overcharged',
    'cannot login', "can't login", 'cannot log in', 'blank screen', 'otp not', 'not loading',
    'not delivered', 'still waiting', 'no update', 'stuck in transit', 'very slow',
  ] },
  { level: 'minor', points: 8, terms: [
    'delayed', 'late', 'slow', 'missing', 'incorrect', 'wrong', 'bug', 'glitch', 'issue', 'problem',
    'out for delivery', 'days now', 'not updated',
  ] },
];

const ROUTINE = ['how do i', 'how to', 'can i', 'is it possible', 'change my', 'update my', 'question', 'feedback', 'suggestion', 'where can i', 'what is', 'what are'];
const SCOPE = ['all our', 'entire team', 'whole team', 'all users', 'our customers', 'production', 'business', 'revenue', 'every order', 'multiple orders', 'company', 'clients'];
const FRUSTRATION = ['again', 'still', 'third time', 'second time', 'how many times', 'ridiculous', 'unacceptable', 'no response', 'nobody', 'worst', 'fed up', 'waste of time', 'escalate'];
const SECURITY = ['hacked', 'unauthorized', 'fraud', 'stolen', 'security breach', 'accessed by someone'];
const TIER_POINTS = { enterprise: 13, premium: 8, standard: 3 };

/* ------------------------------------------------------- intake (AI half) */

export function assessIntake({ text, sentiment, customer = {}, priorContacts = 0 }) {
  const norm = normalize(text);
  const rules = [];

  // Urgency 0-35: severity of the problem (0-26) plus how upset the customer is (0-9).
  let sev = { level: 'none', points: 3, hits: [] };
  for (const s of SEVERITY) {
    const hits = matchPhrases(norm, s.terms);
    if (hits.length) { sev = { level: s.level, points: s.points, hits }; break; }
  }
  const routineHits = matchPhrases(norm, ROUTINE);
  const neg = sentiment.label === 'negative' ? Math.abs(sentiment.score) : 0;
  const tonePts = Math.round(clamp(neg * 5 + (sentiment.label === 'negative' ? 1 : 0), 0, 6));
  const fHits = matchPhrases(norm, FRUSTRATION);
  const caps = capsRatio(text) > 0.45;
  const bangs = (String(text).match(/!/g) || []).length >= 3;
  const signalPts = clamp(fHits.length + (caps ? 1 : 0) + (bangs ? 1 : 0), 0, 3);
  const urgencyPts = clamp(sev.points + tonePts + signalPts, 0, 35);
  const urgencyLevel = urgencyPts >= 28 ? 'critical' : urgencyPts >= 20 ? 'high' : urgencyPts >= 10 ? 'medium' : 'low';
  // Heuristic confidence: a strong keyword match is more trustworthy than none.
  const urgencyConf = { critical: 0.84, major: 0.74, minor: 0.62, none: 0.55 }[sev.level];

  const urgency = {
    key: 'urgency', label: 'Urgency', points: urgencyPts, max: 35, phase: 'intake',
    level: urgencyLevel, confidence: urgencyConf,
    reasons: [
      sev.hits.length
        ? `${cap(sev.level)} severity: ${quote(sev.hits.slice(0, 3))} (+${sev.points})`
        : routineHits.length ? `Routine request: ${quote(routineHits.slice(0, 2))} (+${sev.points})` : `No severity keywords (+${sev.points})`,
      `Sentiment ${sentiment.label} (+${tonePts})`,
      ...(signalPts ? [`Frustration signals${fHits.length ? `: ${quote(fHits.slice(0, 2))}` : ''}${caps ? ', capitals' : ''}${bangs ? ', "!!!"' : ''} (+${signalPts})`] : []),
    ],
  };

  // Impact 0-25: who is affected and how widely, plus repeat contact.
  const tier = customer.tier || 'standard';
  const scopeHits = matchPhrases(norm, SCOPE);
  const repeatPts = priorContacts >= 3 ? 5 : priorContacts === 2 ? 3 : priorContacts === 1 ? 2 : 0;
  const impactPts = clamp(TIER_POINTS[tier] + (scopeHits.length ? 7 : 0) + repeatPts, 0, 25);
  const impact = {
    key: 'impact', label: 'Business impact', points: impactPts, max: 25, phase: 'intake',
    reasons: [
      `${cap(tier)} customer (+${TIER_POINTS[tier]})`,
      ...(scopeHits.length ? [`Wide scope: ${quote(scopeHits.slice(0, 2))} (+7)`] : []),
      priorContacts ? `${priorContacts} earlier contact${priorContacts > 1 ? 's' : ''} this week, tickets or follow-ups (+${repeatPts})` : 'First contact this week',
    ],
  };

  const intakeScore = urgency.points + impact.points;
  let intakeBand = INTAKE_BANDS.find((b) => intakeScore >= b.min).band;

  // Guardrail: tone alone must not lift a routine request above P3.
  if (sev.level === 'none' && routineHits.length && priorContacts === 0 && RANK[intakeBand] < 3) {
    intakeBand = 'P3';
    rules.push('Routine request with no repeat contact: intake capped at P3 despite tone');
  }
  // Guardrail: security and fraud never start below P2.
  if (matchPhrases(norm, SECURITY).length && RANK[intakeBand] > 2) {
    intakeBand = 'P2';
    rules.push('Security or fraud signal: intake floored at P2');
  }
  // Guardrail: a calm report of a critical problem ("our payment gateway is
  // down") must not sit at P3 just because the customer is polite or small.
  if (sev.level === 'critical' && RANK[intakeBand] > 2) {
    intakeBand = 'P2';
    rules.push(`Critical problem (${quote(sev.hits.slice(0, 2))}): intake floored at P2 regardless of tone`);
  }

  return { urgency, impact, intakeScore, intakeBand, rules, severity: sev.level };
}

/* --------------------------------------------- live (scheduling half) */

export function waitingPoints(ageHours) {
  // Saturating curve: early hours matter most, 2 days in it is near maximum.
  return Math.round(20 * (1 - Math.exp(-Math.max(0, ageHours) / 10)));
}

export function slaRiskPoints(pctUsed, breached) {
  if (breached) return 20;
  if (pctUsed <= 0.5) return 0;
  return Math.round(clamp((pctUsed - 0.5) / 0.5, 0, 1) * 16);
}

// incident: a linked incident doc, if any. Only CONFIRMED incidents change
// the score; candidates are shown but never move a ticket.
export function livePriority(ticket, { now = Date.now(), sla, incident } = {}) {
  const triage = ticket.triage;
  const at = ticket.resolvedAt ? Date.parse(ticket.resolvedAt) : now;
  const ageH = (at - Date.parse(ticket.createdAt)) / 3600e3;

  const wPts = waitingPoints(ageH);
  const waiting = {
    key: 'waiting', label: 'Waiting time', points: wPts, max: 20, phase: 'live',
    reasons: [`Open for ${fmtAge(ageH)}${ticket.resolvedAt ? ' when resolved' : ''} (+${wPts})`],
  };

  const sPts = sla ? slaRiskPoints(sla.pctUsed, sla.state === 'breached') : 0;
  const slaFactor = {
    key: 'sla', label: 'SLA risk', points: sPts, max: 20, phase: 'live',
    reasons: [sla
      ? sla.state === 'breached' ? `${sla.clockLabel} target breached (+20)`
        : sla.state === 'met' ? `${sla.clockLabel} target met`
        : `${Math.round(sla.pctUsed * 100)}% of ${sla.clockLabel.toLowerCase()} time used (+${sPts})`
      : 'No SLA clock'],
  };

  const factors = [triage.urgency, triage.impact, waiting, slaFactor];
  const raw = factors.reduce((s, f) => s + f.points, 0);
  const rules = [...(triage.rules || [])];
  let score = raw;

  // The intake band is a commitment: waiting can raise a ticket, never lower it.
  if (score < BAND_FLOOR[triage.intakeBand]) {
    score = BAND_FLOOR[triage.intakeBand];
    rules.push(`Intake band ${triage.intakeBand} keeps the score at ${score} or above`);
  }

  let pinned = false;
  let incidentNote = null;
  if (incident?.status === 'confirmed') {
    if (incident.severity === 'critical') {
      if (score < 85) rules.push(`Linked to confirmed critical incident ${incident.id}: floored at 85 and pinned`);
      else rules.push(`Linked to confirmed critical incident ${incident.id}: pinned to top`);
      score = Math.max(score, 85);
      pinned = true;
    } else {
      score += 8;
      rules.push(`Linked to confirmed incident ${incident.id} (+8)`);
    }
    incidentNote = 'confirmed';
  } else if (incident?.status === 'candidate') {
    incidentNote = 'candidate';
    rules.push(`Possible incident ${incident.id} is unverified, so it does not change the score`);
  }

  score = clamp(Math.round(score), 0, 100);
  const liveBand = BANDS.find((b) => score >= b.min);
  return {
    score, raw, band: liveBand.band, bandLabel: liveBand.label,
    intakeBand: triage.intakeBand, factors, rules, pinned, incident: incidentNote,
  };
}

export const bandRank = (b) => RANK[b] || 9;

function fmtAge(h) {
  if (h < 1) return `${Math.max(1, Math.round(h * 60))} min`;
  if (h < 48) return `${Math.round(h)} h`;
  return `${Math.round(h / 24)} days`;
}
function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
function quote(list) { return list.map((x) => `"${x}"`).join(', '); }
