// One-Click Proof: turn the OCR text of a payment screenshot into a draft
// complaint the customer reviews before submitting.
//
// OCR runs in the customer's browser (tesseract.js); only the recognised
// lines, word boxes and confidences come here. This module
//   1. extracts amount, date, time, transaction reference, status, error,
//   2. scores each field and flags uncertain ones for the customer to confirm,
//   3. says which words to black out (card, phone, UPI ID, account) before
//      the image is stored.
//
// A screenshot is supporting evidence. It does not prove a transaction is
// genuine or that a refund is owed, and nothing downstream treats it so.

import { redact } from './redact.js';
import { errorCodes } from './fingerprint.js';
import { round } from './text.js';

const CONFIRM_BELOW = 0.75;
const MONTH = '(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*';
const DATE_RES = [new RegExp(`\\b(\\d{1,2})\\s*${MONTH}\\.?,?\\s*(\\d{4})\\b`, 'i'), /\b(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})\b/];
const TIME_RE = /\b(\d{1,2}:\d{2})\s*(am|pm)?\b/i;
const AMOUNT_RES = [
  /(?:₹|\brs\.?|\binr)\s*([0-9][0-9,]*(?:\.\d{1,2})?)/i,
  /\b(?:a\w{0,2}ount|amt|paid|debited|total)\b[^0-9\n]{0,8}([0-9][0-9,]*(?:\.\d{2})?)/i, // "Arnount": OCR misreads m as rn
];
const REF_LABEL = /\b(utr|rrn|upi\s*(?:transact\w*|txn|ref)\s*(?:id|no)?|transact\w*\s*(?:id|no|ref)|txn\s*(?:id|no)|ref(?:erence)?\s*(?:no|number|id)\.?)\b/i;
const REF_VALUE = /\b([A-Z0-9]{8,22})\b/i;
const STATUS_RE = /\b(failed|failure|fai[il]?e?d|declined|unsuccessful|rejected|pending|processing|successful|success|completed)\b/i;
const ERROR_LINE = /\b(error|reason|code|declined|could not|couldn't|unable)\b/i;
const PAYEE_RE = /^(?:paid\s+to|to|merchant|payee|sent\s+to)\s*[:-]?\s*(.{2,60})$/i;

const conf01 = (c) => (c == null ? 0.5 : c > 1 ? c / 100 : c);
// Blurry text swaps look-alike characters inside numbers: 2,O00 and 41234567890l.
const fixDigits = (t) => t.replace(/[\dOolI|,.]{3,}/g, (tok) => (/\d/.test(tok) ? tok.replace(/[Oo]/g, '0').replace(/[lI|]/g, '1') : tok));

function luhn(d) {
  let sum = 0;
  let dbl = false;
  for (let i = d.length - 1; i >= 0; i--) {
    let n = Number(d[i]);
    if (dbl) { n *= 2; if (n > 9) n -= 9; }
    sum += n; dbl = !dbl;
  }
  return sum % 10 === 0;
}

// Words to black out on the stored image, as [line, word] pairs.
export function piiWords(lines) {
  const out = [];
  lines.forEach((line, li) => {
    const words = line.words || [];
    const refLine = REF_LABEL.test(line.text);
    const accountLine = /\b(a\/c|acc(?:ount)?|from)\b/i.test(line.text);
    words.forEach((w, wi) => {
      const t = String(w.text);
      if (t.includes('@') && t.length > 2) out.push([li, wi]);                                      // email or UPI ID
      else if (accountLine && !refLine && /\d{4,}/.test(t)) out.push([li, wi]);                      // account number
      else if (!refLine && /^(?:\+?91)?[6-9]\d{9}$/.test(t.replace(/[\s-]/g, ''))) out.push([li, wi]); // phone
    });
    // Card numbers are usually split into 4-digit words: test each run.
    for (let i = 0; i < words.length; i++) {
      let digits = '';
      let j = i;
      while (j < words.length && /^[\d-]+$/.test(words[j].text)) { digits += words[j].text.replace(/-/g, ''); j++; }
      if (digits.length >= 13 && digits.length <= 19 && luhn(digits)) for (let k = i; k < j; k++) out.push([li, k]);
      i = Math.max(i, j - 1);
    }
  });
  const seen = new Set();
  return out.filter((p) => { const k = p.join(':'); if (seen.has(k)) return false; seen.add(k); return true; });
}

export function extractProof({ lines: raw = [] }) {
  const lines = raw
    .map((l) => ({ text: fixDigits(String(l.text || '').replace(/\s+/g, ' ').trim()), conf: conf01(l.conf ?? l.confidence), words: (l.words || []).map((w) => ({ ...w, conf: conf01(w.conf ?? w.confidence) })) }))
    .filter((l) => l.text);
  const meanConf = lines.length ? lines.reduce((s, l) => s + l.conf, 0) / lines.length : 0;
  const quality = meanConf >= 0.8 ? 'good' : meanConf >= 0.6 ? 'fair' : 'poor';
  const fields = [];
  const add = (key, label, value, conf, line, note) => {
    if (value == null || value === '') return;
    const c = round(Math.min(conf, quality === 'poor' ? 0.6 : 1));
    fields.push({ key, label, value: String(value).trim(), confidence: c, uncertain: c < CONFIRM_BELOW, line, note: note || null });
  };

  // Amount: prefer a currency symbol, then a labelled number. Two different
  // amounts on one screen (paid vs balance) means we are guessing.
  const amounts = [];
  lines.forEach((l, i) => AMOUNT_RES.forEach((re, k) => {
    const m = l.text.match(re);
    if (m) amounts.push({ v: m[1].replace(/,/g, ''), conf: l.conf * (k === 0 ? 1 : 0.9), i });
  }));
  if (amounts.length) {
    const best = amounts.sort((a, b) => b.conf - a.conf)[0];
    const distinct = new Set(amounts.map((a) => Number(a.v))).size;
    add('amount', 'Amount', Number(best.v).toLocaleString('en-IN', { minimumFractionDigits: best.v.includes('.') ? 2 : 0 }),
      best.conf * (distinct > 1 ? 0.7 : 1), best.i, distinct > 1 ? 'More than one amount on the screen' : null);
  }

  for (const [i, l] of lines.entries()) {
    const d = DATE_RES.map((re) => l.text.match(re)).find(Boolean);
    if (d) { add('date', 'Date', d[0], l.conf, i); break; }
  }
  for (const [i, l] of lines.entries()) {
    const t = l.text.match(TIME_RE);
    if (t) { add('time', 'Time', t[0], l.conf, i); break; }
  }

  // Reference: the value sits after the label, or on the next line.
  for (const [i, l] of lines.entries()) {
    const lab = l.text.match(REF_LABEL);
    if (!lab) continue;
    const after = l.text.slice(lab.index + lab[0].length);
    const same = after.match(REF_VALUE);
    const next = lines[i + 1]?.text.match(REF_VALUE);
    const v = same && /\d{6,}/.test(same[1]) ? { v: same[1], c: l.conf } : next && /\d{6,}/.test(next[1]) ? { v: next[1], c: lines[i + 1].conf * 0.9 } : null;
    if (v) { add('reference', 'Transaction reference', v.v.toUpperCase(), v.c, i); break; }
  }

  const st = lines.findIndex((l) => STATUS_RE.test(l.text));
  if (st >= 0) {
    const w = lines[st].text.match(STATUS_RE)[1].toLowerCase();
    const status = /fai|declin|unsuccess|reject/.test(w) ? 'Failed' : /pend|process/.test(w) ? 'Pending' : 'Successful';
    add('status', 'Payment status', status, lines[st].conf, st);
  }

  const codes = new Set();
  let errLine = -1;
  lines.forEach((l, i) => { for (const c of errorCodes(l.text)) { codes.add(c); if (errLine < 0) errLine = i; } });
  if (errLine < 0) errLine = lines.findIndex((l, i) => i !== st && ERROR_LINE.test(l.text));
  if (errLine >= 0) add('error', 'Error shown', redact(lines[errLine].text).text, lines[errLine].conf, errLine);

  for (const [i, l] of lines.entries()) {
    const p = l.text.match(PAYEE_RE);
    if (p) { add('payee', 'Paid to', redact(p[1]).text.replace(/\[upi id\]/g, '').trim(), l.conf, i); break; }
  }

  const get = (k) => fields.find((f) => f.key === k)?.value;
  const failed = get('status') === 'Failed';
  const amount = get('amount');
  const subject = amount ? `Payment of ₹${amount} ${failed ? 'failed' : get('status') === 'Pending' ? 'stuck as pending' : 'needs checking'}${get('payee') ? ` (${get('payee')})` : ''}` : 'Problem with a payment';
  const when = get('date') ? ` on ${get('date')}${get('time') ? ` at ${get('time')}` : ''}` : '';
  const message = [
    amount ? `I tried to pay ₹${amount}${get('payee') ? ` to ${get('payee')}` : ''}${when}.` : `I had a problem with a payment${when}.`,
    get('error') ? `The screen showed: "${get('error')}".` : get('status') ? `The status shown was: ${get('status')}.` : null,
    get('reference') ? `Transaction reference: ${get('reference')}.` : null,
    'Please check whether the money was deducted and what happens next.',
  ].filter(Boolean).join(' ');

  const masked = redact(lines.map((l) => l.text).join('\n'));
  return {
    quality, meanConfidence: round(meanConf),
    fields, needsConfirmation: fields.some((f) => f.uncertain) || quality !== 'good',
    draft: { subject, message, category: amount || get('reference') ? 'billing' : 'unsure', orderRef: get('reference') || '' },
    mask: piiWords(lines),
    text: masked.text, redactions: masked.redactions,
    errorCodes: [...codes],
    disclaimer: 'Read from your screenshot automatically. Check every value: a screenshot supports your request, it does not prove the payment status.',
  };
}
