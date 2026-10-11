// Shared text helpers for the local (no-network) models.

export function normalize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"');
}

export function tokenize(text) {
  return normalize(text).match(/[a-z0-9']+/g) || [];
}

// Phrase match on word boundaries so "down" does not fire inside "download".
export function hasPhrase(normText, phrase) {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
  return new RegExp(`(^|[^a-z0-9])${escaped}($|[^a-z0-9])`).test(normText);
}

export function matchPhrases(normText, phrases) {
  return phrases.filter((p) => hasPhrase(normText, p));
}

// Share of letters written in capitals, ignoring short messages where a
// single acronym would dominate the ratio.
export function capsRatio(text) {
  const letters = String(text || '').match(/[A-Za-z]/g) || [];
  if (letters.length < 24) return 0;
  const upper = letters.filter((c) => c >= 'A' && c <= 'Z').length;
  return upper / letters.length;
}

export const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
export const round = (n, dp = 2) => Math.round(n * 10 ** dp) / 10 ** dp;
