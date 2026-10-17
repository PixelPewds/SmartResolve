// Sentiment: Hugging Face first, lexicon fallback.
//
// The lexicon model is deliberately small and readable. It handles the three
// failure modes that matter most in support text: negation ("not happy"),
// intensifiers ("extremely slow") and support-specific complaint words that
// generic sentiment lists miss ("charged twice", "still waiting").

import { tokenize, normalize, matchPhrases, capsRatio, clamp, round } from './text.js';
import { hfInference, HF_MODELS } from './hf.js';

const LEXICON = {
  // negative
  angry: -3, furious: -4, frustrated: -3, frustrating: -3, annoyed: -2, upset: -2,
  disappointed: -3, disappointing: -3, terrible: -4, horrible: -4, awful: -4, worst: -4,
  useless: -3, pathetic: -4, ridiculous: -3, unacceptable: -4, disgusting: -4, poor: -2,
  bad: -2, broken: -2, slow: -1, failed: -2, failing: -2, fail: -2, error: -1, errors: -1,
  wrong: -2, missing: -2, lost: -2, damaged: -3, late: -2, delayed: -2, never: -1,
  scam: -4, fraud: -4, cheated: -4, stolen: -3, rude: -3, ignored: -3, waste: -3,
  worried: -2, confused: -1, stuck: -2, crash: -2, crashes: -2, crashing: -2, down: -1,
  // "refund" is deliberately absent: "can you check my refund?" is a calm
  // question, and scoring the word itself made every refund query negative.
  problem: -1, issue: -1, complaint: -2, cancel: -1, hate: -4, sucks: -3,
  hopeless: -3, nightmare: -4, incompetent: -4, joke: -2, overcharged: -3, unusable: -3,
  // positive
  thanks: 2, thank: 2, great: 3, good: 2, excellent: 4, amazing: 4, awesome: 4,
  happy: 3, love: 3, appreciate: 3, appreciated: 3, helpful: 3, quick: 2, fast: 2,
  perfect: 4, resolved: 2, smooth: 2, nice: 2, pleased: 3, satisfied: 3, wonderful: 4,
  glad: 2, easy: 2, fixed: 2, works: 1, working: 1, kind: 2, brilliant: 4,
};

// Multi-word complaint patterns generic lexicons score as neutral.
const PHRASES = {
  'charged twice': -3, 'double charged': -3, 'still waiting': -3, 'still not': -2,
  'no response': -3, 'nobody replied': -3, 'third time': -3, 'second time': -2,
  'not received': -2, 'never arrived': -3, 'waste of time': -4, 'locked out': -2,
  'not working': -2, "doesn't work": -2, 'does not work': -2, 'keeps crashing': -3,
  "still haven't": -1, 'still have not': -1, "haven't received": -1.5, 'have not received': -1.5,
  'not fixed': -2, 'no update': -2,
  'thank you': 2, 'works now': 2, 'sorted out': 2,
};
// "five times", "4 times", "many times": repeat contact is the strongest
// frustration signal in support text and the word list cannot spell every number.
const REPEAT_RE = /\b(?:\d+|three|four|five|six|several|many|multiple|so many) times\b/;

const NEGATORS = new Set(['not', 'no', 'never', "don't", "doesn't", "didn't", "isn't", "wasn't", "can't", 'cannot', "won't", 'hardly']);
const INTENSIFIERS = { very: 1.5, extremely: 2, really: 1.4, so: 1.3, totally: 1.6, completely: 1.7, absolutely: 1.8, super: 1.5 };

export function lexiconSentiment(text) {
  const tokens = tokenize(text);
  const norm = normalize(text);
  let score = 0;
  const hits = [];

  tokens.forEach((tok, i) => {
    let v = LEXICON[tok];
    if (v === undefined) return;
    const window = tokens.slice(Math.max(0, i - 3), i);
    const negated = window.some((w) => NEGATORS.has(w));
    const boost = window.reduce((m, w) => m * (INTENSIFIERS[w] || 1), 1);
    if (negated) v = -v * 0.6;
    v *= boost;
    score += v;
    hits.push({ term: (negated ? 'not ' : '') + tok, weight: round(v, 1) });
  });

  for (const p of matchPhrases(norm, Object.keys(PHRASES))) {
    score += PHRASES[p];
    hits.push({ term: p, weight: PHRASES[p] });
  }
  const rep = norm.match(REPEAT_RE);
  if (rep) { score -= 3; hits.push({ term: rep[0], weight: -3 }); }

  const bangs = (String(text).match(/!/g) || []).length;
  if (score < 0 && bangs >= 2) score -= Math.min(3, bangs * 0.5);

  // Squash to -1..1 against message length so a long calm message with one
  // "issue" does not read as hostile.
  const norm01 = clamp(score / Math.max(4, Math.sqrt(tokens.length) * 2.2), -1, 1);
  const label = norm01 <= -0.15 ? 'negative' : norm01 >= 0.15 ? 'positive' : 'neutral';
  const confidence = round(clamp(0.5 + Math.abs(norm01) * 0.5, 0.5, 0.97));

  return {
    label,
    score: round(norm01),
    confidence,
    engine: 'local',
    model: 'lexicon-v1',
    evidence: mergeHits(hits).slice(0, 6),
  };
}

// A word used twice is one piece of evidence with double weight, not two.
function mergeHits(hits) {
  const by = new Map();
  for (const h of hits) by.set(h.term, round((by.get(h.term) || 0) + h.weight, 1));
  return [...by].map(([term, weight]) => ({ term, weight })).sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight));
}

// Sarcasm guard, the deck's challenge #1. Both the lexicon and off-the-shelf
// models read "great job, six days late" as praise. If the wording is
// positive but the message also states a concrete failure, treat the praise
// as ironic: flip to negative and lower confidence so an agent double checks.
const NUM = '(?:\\d+|two|three|four|five|six|seven|eight|nine|ten|many)';
const COMPLAINT_FACTS = [
  new RegExp(`\\bfor ${NUM} (?:days|weeks|hours)\\b`),
  new RegExp(`\\b${NUM} (?:days|weeks) (?:now|late|later)\\b`),
  /\b(still|yet again|once again|thanks for nothing|oh great|so much for)\b/,
  /"[^"]{3,40}"/, // scare quotes around a status: "out for delivery"
];

export function sarcasmCheck(text, result) {
  if (result.label !== 'positive') return result;
  const norm = normalize(text);
  const cue = COMPLAINT_FACTS.find((re) => re.test(norm));
  if (!cue) return result;
  return {
    ...result,
    label: 'negative',
    score: -Math.max(0.35, Math.abs(result.score) * 0.6),
    confidence: 0.55,
    sarcasm: true,
    evidence: [{ term: 'possible sarcasm', weight: -2 }, ...(result.evidence || [])].slice(0, 6),
  };
}

export async function analyzeSentiment(text) {
  return sarcasmCheck(text, await rawSentiment(text));
}

async function rawSentiment(text) {
  const t0 = Date.now();
  const res = await hfInference(HF_MODELS.sentiment, { inputs: String(text).slice(0, 1500) });
  if (res) {
    // Response shape: [[{label, score}, ...]] or [{label, score}, ...]
    const rows = Array.isArray(res[0]) ? res[0] : res;
    if (Array.isArray(rows) && rows.length && rows[0].label) {
      const by = Object.fromEntries(rows.map((r) => [String(r.label).toLowerCase(), r.score]));
      const neg = by.negative ?? by.label_0 ?? 0;
      const neu = by.neutral ?? by.label_1 ?? 0;
      const pos = by.positive ?? by.label_2 ?? 0;
      const top = [['negative', neg], ['neutral', neu], ['positive', pos]].sort((a, b) => b[1] - a[1])[0];
      return {
        label: top[0],
        score: round(pos - neg),
        confidence: round(top[1]),
        engine: 'huggingface',
        model: HF_MODELS.sentiment,
        latencyMs: Date.now() - t0,
        evidence: lexiconSentiment(text).evidence,
      };
    }
  }
  return { ...lexiconSentiment(text), latencyMs: Date.now() - t0 };
}

/* ---------------------------------------------------------------- emotion */

// Polarity alone cannot tell "worried about my money" from "this is the third
// time I am writing", and the right reply differs. Cue words per emotion,
// scored, highest wins. A rule model: transparent, and wrong in known ways.
const EMOTION_CUES = {
  angry: ['furious', 'angry', 'pathetic', 'disgusting', 'worst', 'scam', 'cheated', 'hate', 'useless', 'incompetent',
    'legal action', 'consumer court', 'shame on', 'nonsense', 'fed up', 'enough is enough', 'unacceptable', 'ridiculous'],
  frustrated: ['frustrated', 'frustrating', 'again', 'still', 'third time', 'second time', 'how many times', 'no response',
    'nobody', 'no one', 'still waiting', 'no update', 'chasing', 'keep asking', 'ignored', 'waste of time', 'contacted you',
    'every time', 'not fixed', "haven't received", 'have not received'],
  anxious: ['worried', 'scared', 'afraid', 'anxious', 'urgent', 'urgently', 'emergency', 'please help', 'help me', 'my money',
    'savings', 'panic', 'stressed', 'tension', 'pareshaan', 'need it today', 'rent', 'hospital', 'salary'],
  confused: ['confused', 'confusing', "don't understand", 'do not understand', 'not sure', 'unclear', 'how do i', 'how to',
    'where can i', 'what does', 'which option', 'can someone explain'],
};
const REPEAT_CUES = ['third time', 'second time', 'fourth time', 'how many times', 'contacted you', 'yet again', 'once again', 'written to you'];
export const EMOTION_LABEL = { angry: 'Angry', frustrated: 'Frustrated', anxious: 'Anxious', confused: 'Confused', satisfied: 'Satisfied', calm: 'Calm' };

export function detectEmotion(text, sentiment) {
  const norm = normalize(text);
  const neg = sentiment.label === 'negative' ? Math.abs(sentiment.score) : 0;
  const hits = Object.fromEntries(Object.entries(EMOTION_CUES).map(([k, cues]) => [k, matchPhrases(norm, cues)]));
  if (REPEAT_RE.test(norm)) hits.frustrated.push(norm.match(REPEAT_RE)[0]);
  const caps = capsRatio(text) > 0.45;
  const bangs = (String(text).match(/!/g) || []).length;
  const weight = {
    angry: hits.angry.length * 1.4 + (caps ? 1.5 : 0) + (bangs >= 3 && neg ? 1 : 0),
    frustrated: hits.frustrated.length * (neg ? 1.1 : 0.6) + (bangs && neg ? 0.3 : 0),
    anxious: hits.anxious.length,
    confused: hits.confused.length * 0.8 + ((text.match(/\?/g) || []).length && !neg ? 0.4 : 0),
  };
  const [top, w] = Object.entries(weight).sort((a, b) => b[1] - a[1])[0];
  const repeat = REPEAT_RE.test(norm) || matchPhrases(norm, REPEAT_CUES).length > 0;

  if (sentiment.label === 'positive' && w < 1) return { emotion: 'satisfied', intensity: round(clamp(sentiment.score, 0.2, 1)), cues: [], repeat };
  // Mild negativity with no emotional cue is someone describing a problem
  // ("our payment gateway is down"), not an upset customer.
  if (w < 1 && neg < 0.35) return { emotion: 'calm', intensity: 0, cues: [], repeat };
  // Negative but no specific cue: plain dissatisfaction reads as frustration.
  const emotion = w >= 1 ? top : 'frustrated';
  const intensity = round(clamp(0.3 + 0.15 * w + 0.45 * neg, 0.2, 1));
  return { emotion, intensity, cues: (hits[emotion] || []).slice(0, 4), repeat };
}

// 0..1 used by the escalation tracker. Anger and frustration count fully,
// anxiety partly: a worried customer needs reassurance, not a supervisor.
export function frustrationIndex(sentiment, emo) {
  const neg = sentiment.label === 'negative' ? Math.abs(sentiment.score) : 0;
  const share = { angry: 0.55, frustrated: 0.5, anxious: 0.25, confused: 0.1 }[emo.emotion] || 0;
  // Having to write again is the clearest escalation signal there is.
  return round(clamp(neg * 0.6 + emo.intensity * share + (emo.repeat ? 0.15 : 0), 0, 1));
}

// Per-message analysis stored on every customer message (Emotion Escalation
// Tracker). `offline` skips Hugging Face, used for the seed and the chatbot.
export async function analyzeMessage(text, { offline = false } = {}) {
  const s = offline ? sarcasmCheck(text, lexiconSentiment(text)) : await analyzeSentiment(text);
  return describeMessage(text, s);
}

// Same shape from a sentiment result already computed (ticket intake).
export function describeMessage(text, s) {
  const emo = detectEmotion(text, s);
  return {
    label: s.label, score: s.score, confidence: s.confidence, engine: s.engine, model: s.model,
    sarcasm: Boolean(s.sarcasm), emotion: emo.emotion, intensity: emo.intensity, cues: emo.cues,
    repeat: emo.repeat, frustration: frustrationIndex(s, emo),
  };
}
