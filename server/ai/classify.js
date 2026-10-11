// Issue category: Hugging Face zero-shot first, weighted keywords fallback.

import { normalize, matchPhrases, round } from './text.js';
import { hfInference, HF_MODELS } from './hf.js';

export const CATEGORIES = {
  billing:   { label: 'Billing & Payments' },
  technical: { label: 'Technical Support' },
  delivery:  { label: 'Delivery & Orders' },
  account:   { label: 'Account Access' },
  general:   { label: 'General Enquiry' },
};

// Descriptive hypotheses read better to an NLI model than bare category names.
const ZERO_SHOT_LABELS = {
  billing: 'a billing, payment, refund or invoice problem',
  technical: 'a technical problem with the app or website',
  delivery: 'a delivery, shipping or order problem',
  account: 'an account login, password or security problem',
  general: 'a general question or feedback',
};

const KEYWORDS = {
  billing: [
    ['charged twice', 4], ['double charged', 4], ['refund', 3], ['invoice', 3], ['billing', 3],
    ['payment', 3], ['charged', 2], ['charge', 2], ['subscription', 2], ['price', 1], ['upi', 2],
    ['credit card', 2], ['debit', 2], ['transaction', 2], ['money', 1], ['paid', 2], ['bill', 2],
    ['overcharged', 4], ['emi', 2], ['wallet', 2], ['cashback', 2], ['discount', 1], ['coupon', 1],
  ],
  technical: [
    ['crash', 3], ['crashes', 3], ['crashing', 3], ['error', 2], ['bug', 3], ['not loading', 3],
    ['app', 1], ['website', 1], ['page', 1], ['server', 2], ['outage', 4], ['down', 2],
    ['slow', 2], ['freeze', 3], ['freezes', 3], ['blank screen', 3], ['api', 2], ['sync', 2],
    ['update', 1], ['install', 2], ['upload', 2], ['500', 3], ['timeout', 2], ['not working', 2],
    ['integration', 2], ['dashboard', 1], ['notification', 1],
  ],
  delivery: [
    ['delivery', 3], ['delivered', 3], ['shipment', 3], ['shipping', 3], ['courier', 3],
    ['tracking', 3], ['package', 3], ['parcel', 3], ['order', 2], ['arrived', 2],
    ['not received', 3], ['never arrived', 4], ['late', 1], ['delayed', 2], ['damaged', 3],
    ['wrong item', 4], ['return', 2], ['replacement', 2], ['dispatch', 2], ['address', 1],
  ],
  account: [
    ['login', 3], ['log in', 3], ['password', 3], ['locked out', 4], ['otp', 3], ['account', 2],
    ['sign in', 3], ['two factor', 3], ['2fa', 3], ['hacked', 4], ['unauthorized', 4],
    ['email change', 2], ['verification', 2], ['profile', 1], ['username', 2], ['deactivate', 2],
    ['delete my account', 3], ['suspicious', 3], ['access', 1],
  ],
  general: [
    ['how do i', 2], ['how to', 2], ['question', 2], ['feedback', 3], ['suggestion', 3],
    ['feature request', 3], ['information', 1], ['hours', 1], ['policy', 2], ['thank you', 1],
  ],
};

export function keywordClassify(text) {
  const norm = normalize(text);
  const scores = {};
  const evidence = {};
  for (const [cat, list] of Object.entries(KEYWORDS)) {
    const hits = matchPhrases(norm, list.map(([p]) => p));
    evidence[cat] = hits;
    scores[cat] = hits.reduce((s, h) => s + list.find(([p]) => p === h)[1], 0);
  }
  // General is the catch-all, it should win only when nothing specific fires.
  scores.general += 0.5;

  const total = Object.values(scores).reduce((a, b) => a + b, 0);
  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const [top, topScore] = ranked[0];
  const runner = ranked[1][1];
  // Confidence rises with the share of signal AND the margin over second place.
  const share = topScore / total;
  const margin = (topScore - runner) / Math.max(topScore, 1);
  const confidence = round(Math.min(0.96, 0.32 + share * 0.45 + margin * 0.25));

  return {
    category: top,
    label: CATEGORIES[top].label,
    confidence,
    engine: 'local',
    model: 'keywords-v1',
    evidence: evidence[top].slice(0, 6),
    alternatives: ranked.slice(1, 3).map(([c, s]) => ({ category: c, score: round(s / total) })),
  };
}

export async function classifyIssue(text) {
  const t0 = Date.now();
  const labels = Object.values(ZERO_SHOT_LABELS);
  const res = await hfInference(HF_MODELS.zeroShot, {
    inputs: String(text).slice(0, 1500),
    parameters: { candidate_labels: labels },
  });
  const local = keywordClassify(text);

  let rows = null;
  if (res && Array.isArray(res.labels)) rows = res.labels.map((l, i) => ({ label: l, score: res.scores[i] }));
  else if (Array.isArray(res) && res[0]?.label) rows = res;

  if (rows) {
    const byHyp = Object.fromEntries(Object.entries(ZERO_SHOT_LABELS).map(([k, v]) => [v, k]));
    rows.sort((a, b) => b.score - a.score);
    const top = byHyp[rows[0].label];
    if (top) {
      return {
        category: top,
        label: CATEGORIES[top].label,
        confidence: round(rows[0].score),
        engine: 'huggingface',
        model: HF_MODELS.zeroShot,
        latencyMs: Date.now() - t0,
        evidence: matchPhrases(normalize(text), KEYWORDS[top].map(([p]) => p)).slice(0, 6),
        alternatives: rows.slice(1, 3).map((r) => ({ category: byHyp[r.label], score: round(r.score) })),
      };
    }
  }
  return { ...local, latencyMs: Date.now() - t0 };
}
