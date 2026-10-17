// Complaint DNA: a fingerprint of what a complaint is about, used to link
// related complaints that are worded differently.
//
//   intent        finer than category: payment_failure, refund_delay, ...
//   services      UPI, card, website, app, courier ...
//   errorCodes    U30, PAY_TIMEOUT, HTTP 500 ...
//   refs          transaction references, stored as a hash plus last 4 only
//   keywords      distinctive terms
//   hourBucket    when it was reported
//
// Built from the REDACTED message, so personal data never enters it.
// Similar DNA means a POSSIBLE shared cause. It is not evidence of fraud and
// nothing here acts on it automatically; a supervisor decides.

import crypto from 'node:crypto';
import { normalize, matchPhrases, round } from './text.js';
import { terms } from './similarity.js';

const SERVICES = {
  UPI: ['upi', 'gpay', 'google pay', 'phonepe', 'paytm', 'bhim', 'vpa'],
  Card: ['credit card', 'debit card', 'card', 'visa', 'mastercard', 'rupay'],
  'Net banking': ['net banking', 'netbanking', 'neft', 'imps'],
  Wallet: ['wallet'],
  Checkout: ['checkout', 'payment page', 'cart'],
  Website: ['website', 'site', 'web page', 'pages', 'browser'],
  'Mobile app': ['app', 'android', 'ios', 'iphone'],
  API: ['api', 'integration', 'webhook', 'endpoint'],
  Courier: ['courier', 'delivery', 'parcel', 'shipment', 'tracking', 'hub'],
  Login: ['login', 'log in', 'otp', 'password', 'sign in', '2fa'],
  Refunds: ['refund', 'reversal', 'money back'],
  Subscription: ['subscription', 'renewal', 'renewed', 'auto renew'],
  Invoices: ['invoice', 'gst', 'receipt'],
};

// Ordered: the first intent that matches wins, most specific first.
const INTENTS = [
  ['account_takeover', ['hacked', 'unauthorized', 'unauthorised', 'suspicious login', 'accessed by someone', 'not me', 'fraud']],
  ['double_charge', ['charged twice', 'double charged', 'deducted twice', 'two charges', 'duplicate charge']],
  ['payment_failure', ['payment failed', 'transaction failed', 'money deducted', 'money was deducted', 'amount deducted', 'debited', 'deducted', 'order is still unpaid', 'still unpaid', 'not received by merchant', 'payment not received', 'payment pending', 'payment declined']],
  ['refund_delay', ['refund not', 'refund still', 'refund has not', 'refund is not', 'not refunded', 'refund pending', 'refund delayed', 'waiting for refund', 'waiting for my refund', 'refund approved']],
  ['outage', ['outage', 'is down', 'not loading', 'completely down', '500 errors', 'returning 500', 'site down', 'gateway down', 'timing out', 'timeout']],
  ['app_crash', ['crash', 'crashes', 'crashing', 'force close', 'blank screen']],
  ['login_issue', ['locked out', 'cannot log in', "can't log in", 'cannot login', 'otp not', 'otp is not', 'reset email', 'password reset']],
  ['delivery_delay', ['not delivered', 'never arrived', 'stuck in transit', 'delayed', 'late', 'not arrived', 'tracking not', 'tracking has not']],
  ['damaged_or_wrong_item', ['damaged', 'wrong item', 'broken', 'defective', 'different product']],
  ['billing_question', ['invoice', 'gst', 'bill', 'receipt', 'coupon', 'discount']],
  ['how_to', ['how do i', 'how to', 'where can i', 'can i']],
];

const ERROR_PATTERNS = [
  /\b(?:error|err|code|reason)\s*(?:code)?\s*[:#-]?\s*([a-z]{1,5}[-_]?\d{1,4})\b/gi, // error code U30, err: E1042
  /\b(U\d{2}|Z[A-Z0-9]|PAY_[A-Z_]+|TXN_[A-Z_]+|ERR_[A-Z_]+)\b/g,                  // UPI / gateway style codes
  /\b(5\d{2})\s+errors?\b/gi,                                                        // "500 errors"
];
const REF_RE = /\b(?:utr|rrn|txn|transaction|upi\s+ref|ref(?:erence)?)\s*(?:id|no\.?|number)?\s*[:#-]?\s*([a-z0-9]{8,22})\b/gi;

export function errorCodes(text) {
  const codes = new Set();
  for (const re of ERROR_PATTERNS) for (const m of String(text).matchAll(re)) {
    const c = m[1].toUpperCase();
    if (!/^\d{1,2}$/.test(c)) codes.add(/^5\d{2}$/.test(c) ? `HTTP ${c}` : c);
  }
  return codes;
}

export function fingerprint({ subject = '', message = '', classification, createdAt }) {
  const text = `${subject}. ${message}`;
  const norm = normalize(text);
  const services = Object.entries(SERVICES).filter(([, kws]) => matchPhrases(norm, kws).length).map(([s]) => s);
  const intent = INTENTS.find(([, kws]) => matchPhrases(norm, kws).length)?.[0] || `${classification?.category || 'general'}_other`;

  const codes = errorCodes(text);
  const refs = [];
  for (const m of text.matchAll(REF_RE)) {
    const v = m[1].toUpperCase();
    if (!/\d{4,}/.test(v)) continue; // "reference number" followed by a word, not a reference
    refs.push({ last4: v.slice(-4), hash: crypto.createHash('sha256').update(v).digest('hex').slice(0, 12) });
  }

  const freq = new Map();
  for (const w of terms(text)) freq.set(w, (freq.get(w) || 0) + 1);
  const keywords = [...freq].sort((a, b) => b[1] - a[1] || b[0].length - a[0].length).slice(0, 6).map(([w]) => w);

  const category = classification?.category || 'general';
  const code = crypto.createHash('sha1').update(`${category}|${intent}|${services.sort().join(',')}|${[...codes].sort().join(',')}`).digest('hex').slice(0, 6).toUpperCase();
  return {
    version: 'dna-v1', code: `DNA-${code}`,
    category, intent, services, errorCodes: [...codes], refs, keywords,
    hourBucket: createdAt ? `${createdAt.slice(0, 13)}:00` : null,
  };
}

// How alike two complaints are, with reasons. textSim is the TF-IDF cosine.
export function dnaMatch(a, b, { textSim = 0, hoursApart = 0 } = {}) {
  const reasons = [];
  let score = 0.6 * textSim;
  if (textSim >= 0.2) reasons.push(`Wording ${Math.round(textSim * 100)}% similar`);
  if (a.intent === b.intent && !a.intent.endsWith('_other')) { score += 0.15; reasons.push(`Same intent: ${a.intent.replace(/_/g, ' ')}`); }
  else if (a.category === b.category) score += 0.05;
  const svc = a.services.filter((s) => b.services.includes(s));
  if (svc.length) { score += 0.1; reasons.push(`Same service: ${svc.join(', ')}`); }
  const codes = a.errorCodes.filter((c) => b.errorCodes.includes(c));
  if (codes.length) { score += 0.15; reasons.push(`Same error code: ${codes.join(', ')}`); }
  const refs = a.refs.filter((r) => b.refs.some((x) => x.hash === r.hash));
  if (refs.length) { score += 0.2; reasons.push(`Same transaction reference (ending ${refs[0].last4})`); }
  // Two reports of the same thing a week apart are less likely one incident.
  if (hoursApart > 72) score *= 0.7;
  else if (hoursApart <= 6) reasons.push(hoursApart < 1 ? 'Reported within the hour' : `Reported ${Math.round(hoursApart)}h apart`);
  return { score: round(Math.min(1, score)), reasons, sharedCodes: codes, sharedServices: svc };
}

// What a group of tickets has in common, for the incident card.
export function clusterDna(prints) {
  const n = prints.length || 1;
  const tally = (list) => {
    const m = {};
    for (const x of list) m[x] = (m[x] || 0) + 1;
    return Object.entries(m).sort((a, b) => b[1] - a[1]).map(([value, count]) => ({ value, count, share: round(count / n) }));
  };
  const intents = tally(prints.map((p) => p.intent));
  return {
    intent: intents[0] || null,
    services: tally(prints.flatMap((p) => p.services)).filter((s) => s.share >= 0.3).slice(0, 4),
    errorCodes: tally(prints.flatMap((p) => p.errorCodes)).slice(0, 4),
    sharedRefs: tally(prints.flatMap((p) => p.refs.map((r) => r.hash))).filter((r) => r.count > 1).length,
  };
}
