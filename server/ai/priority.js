// Explainable priority engine.
//
// Four factors, each with a hard ceiling, summed to 0-100. Every point is
// attached to a human-readable reason so an agent can see exactly why a
// ticket landed where it did.
//
// The ceilings encode the deck's main risk: "negative sentiment alone may
// incorrectly elevate routine complaints". Tone is worth at most 20 of 100,
// and a routine request with no repeat contact is capped at P3 however angry
// the wording is.

import { normalize, matchPhrases, capsRatio, clamp } from './text.js';

export const BANDS = [
  { band: 'P1', label: 'Critical', min: 75, slaHours: 1 },
  { band: 'P2', label: 'High',     min: 55, slaHours: 4 },
  { band: 'P3', label: 'Medium',   min: 35, slaHours: 24 },
  { band: 'P4', label: 'Low',      min: 0,  slaHours: 72 },
];

const SEVERITY = [
  { level: 'critical', points: 35, terms: [
    'outage', 'data loss', 'hacked', 'unauthorized', 'fraud', 'stolen', 'security breach',
    'charged twice', 'double charged', 'locked out', 'cannot access', "can't access", 'completely down',
    'site is down', 'app is down', 'all users', 'money deducted', 'legal action', 'consumer court',
  ] },
  { level: 'major', points: 22, terms: [
    'not working', 'crash', 'crashes', 'crashing', 'failed', 'payment failed', 'error',
    'never arrived', 'not received', 'wrong item', 'damaged', 'refund not', 'overcharged',
    'cannot login', "can't login", 'cannot log in', 'blank screen', 'otp not',
    'not delivered', 'still waiting', 'no update', 'stuck in transit',
  ] },
  { level: 'minor', points: 10, terms: [
    'delayed', 'late', 'slow', 'missing', 'incorrect', 'wrong', 'bug', 'glitch', 'issue', 'problem',
    'out for delivery', 'days now', 'not updated',
  ] },
];

const ROUTINE = ['how do i', 'how to', 'can i', 'is it possible', 'change my', 'update my', 'question', 'feedback', 'suggestion', 'where can i'];

const SCOPE = [
  'all our', 'entire team', 'whole team', 'all users', 'our customers', 'production',
  'business', 'revenue', 'every order', 'multiple orders', 'company', 'clients',
];

const FRUSTRATION = [
  'again', 'still', 'third time', 'second time', 'how many times', 'ridiculous',
  'unacceptable', 'no response', 'nobody', 'worst', 'fed up', 'waste of time', 'escalate',
];

const TIER_POINTS = { enterprise: 15, premium: 9, standard: 3 };

export function scorePriority({ text, sentiment, customer = {}, priorContacts = 0 }) {
  const norm = normalize(text);
  const factors = [];

  // 1. Severity (0-35): worst matched level wins, levels do not stack.
  let sev = { level: 'none', points: 4, hits: [] };
  for (const s of SEVERITY) {
    const hits = matchPhrases(norm, s.terms);
    if (hits.length) { sev = { level: s.level, points: s.points, hits }; break; }
  }
  const routineHits = matchPhrases(norm, ROUTINE);
  factors.push({
    key: 'severity', label: 'Issue severity', points: sev.points, max: 35,
    reasons: sev.hits.length
      ? [`${cap(sev.level)} signal: ${quote(sev.hits.slice(0, 3))}`]
      : [routineHits.length ? `Routine request: ${quote(routineHits.slice(0, 2))}` : 'No severity keywords found'],
  });

  // 2. Business impact (0-25): customer tier plus scope of the problem.
  const tier = customer.tier || 'standard';
  const scopeHits = matchPhrases(norm, SCOPE);
  const impactPts = clamp(TIER_POINTS[tier] + (scopeHits.length ? 10 : 0), 0, 25);
  factors.push({
    key: 'impact', label: 'Business impact', points: impactPts, max: 25,
    reasons: [
      `${cap(tier)} customer (+${TIER_POINTS[tier]})`,
      ...(scopeHits.length ? [`Wide scope: ${quote(scopeHits.slice(0, 2))} (+10)`] : []),
    ],
  });

  // 3. Repeat contacts (0-20): prior tickets from the same customer in 7 days.
  const repeatPts = priorContacts >= 3 ? 20 : priorContacts === 2 ? 14 : priorContacts === 1 ? 8 : 0;
  factors.push({
    key: 'repeat', label: 'Repeat contact', points: repeatPts, max: 20,
    reasons: [priorContacts
      ? `${priorContacts} earlier ticket${priorContacts > 1 ? 's' : ''} from this customer in the last 7 days`
      : 'First contact this week'],
  });

  // 4. Frustration (0-20): model sentiment (0-12) plus explicit signals (0-8).
  const neg = sentiment.label === 'negative' ? Math.abs(sentiment.score) : 0;
  const tonePts = Math.round(clamp(neg * 12 + (sentiment.label === 'negative' ? 3 : 0), 0, 12));
  const fHits = matchPhrases(norm, FRUSTRATION);
  const caps = capsRatio(text) > 0.45;
  const bangs = (String(text).match(/!/g) || []).length >= 3;
  const signalPts = clamp(fHits.length * 2 + (caps ? 3 : 0) + (bangs ? 2 : 0), 0, 8);
  factors.push({
    key: 'frustration', label: 'Customer frustration', points: tonePts + signalPts, max: 20,
    reasons: [
      `Sentiment ${sentiment.label} (${sentiment.score > 0 ? '+' : ''}${sentiment.score}) +${tonePts}`,
      ...(fHits.length ? [`Frustration words: ${quote(fHits.slice(0, 3))}`] : []),
      ...(caps ? ['Message mostly in capitals'] : []),
      ...(bangs ? ['Repeated exclamation marks'] : []),
    ],
  });

  let score = factors.reduce((s, f) => s + f.points, 0);
  const rules = [];

  // Guardrail: routine + no history must not escalate on tone alone.
  if (sev.level === 'none' && routineHits.length && priorContacts === 0 && score >= 55) {
    score = 54;
    rules.push('Routine request with no repeat contact, capped at P3 despite tone');
  }
  // Guardrail: security and fraud are never below P2.
  if (matchPhrases(norm, ['hacked', 'unauthorized', 'fraud', 'stolen', 'security breach']).length && score < 55) {
    score = 55;
    rules.push('Security or fraud signal, floored at P2');
  }

  score = clamp(Math.round(score), 0, 100);
  const band = BANDS.find((b) => score >= b.min);
  return { score, band: band.band, bandLabel: band.label, slaHours: band.slaHours, factors, rules, severity: sev.level };
}

function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
function quote(list) { return list.map((x) => `"${x}"`).join(', '); }
