// TF-IDF cosine similarity. Real computation, run locally, no model.
// Used for "similar resolved tickets", incident clustering and expert
// experience. Rebuilt per request: at a few hundred tickets this takes
// a couple of milliseconds, so caching would be complexity for nothing.

import { tokenize } from './text.js';

const STOP = new Set(('a an the and or but if then so of to in on at by for with from as is are was were be been being ' +
  'i me my we our you your he she it its they them their this that these those there here am do does did done ' +
  'have has had not no yes can could will would should may might must just very really please hi hello thanks ' +
  'thank sir madam team your after before since when what which who how why all any some more most also only ' +
  'still yet again now today yesterday time times day days week order orders').split(' '));

// Crude suffix strip, enough to fold "crashes/crashing/crashed" together.
const stem = (w) => (w.length > 4 ? w.replace(/(ing|ed|es|s)$/, '') : w);

export function terms(text) {
  return tokenize(text).filter((w) => w.length > 2 && !STOP.has(w) && !/^\d+$/.test(w)).map(stem);
}

function counts(text) {
  const m = new Map();
  for (const t of terms(text)) m.set(t, (m.get(t) || 0) + 1);
  return m;
}

function unit(m) {
  let n = 0;
  for (const v of m.values()) n += v * v;
  n = Math.sqrt(n) || 1;
  const out = new Map();
  for (const [k, v] of m) out.set(k, v / n);
  return out;
}

export function cosine(a, b) {
  const [s, l] = a.size < b.size ? [a, b] : [b, a];
  let dot = 0;
  for (const [k, v] of s) { const w = l.get(k); if (w) dot += v * w; }
  return dot;
}

export const ticketText = (t) => `${t.subject}. ${t.subject}. ${t.message}`; // subject weighted double

export function buildIndex(docs, textOf = ticketText) {
  const raw = docs.map((d) => counts(textOf(d)));
  const df = new Map();
  for (const m of raw) for (const k of m.keys()) df.set(k, (df.get(k) || 0) + 1);
  const N = docs.length;
  const idf = (k) => Math.log((N + 1) / ((df.get(k) || 0) + 1)) + 1;
  const weigh = (m) => { const o = new Map(); for (const [k, v] of m) o.set(k, (1 + Math.log(v)) * idf(k)); return unit(o); };

  const vecs = new Map(docs.map((d, i) => [d.id, weigh(raw[i])]));
  return {
    vecs,
    vectorize: (text) => weigh(counts(text)),
    similar(vec, { exclude, filter = () => true, limit = 5, min = 0.12 } = {}) {
      const out = [];
      for (const d of docs) {
        if (d.id === exclude || !filter(d)) continue;
        const s = cosine(vec, vecs.get(d.id));
        if (s >= min) out.push({ doc: d, score: s });
      }
      return out.sort((a, b) => b.score - a.score).slice(0, limit);
    },
  };
}

export function centroid(vecs) {
  const sum = new Map();
  for (const v of vecs) for (const [k, x] of v) sum.set(k, (sum.get(k) || 0) + x);
  return unit(sum);
}

export function topTerms(vec, n = 5) {
  return [...vec].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k]) => k);
}
