// Emotion-aware support assistant. Deliberately not an LLM:
//   - every factual answer is a verified knowledge-base article, quoted
//   - money, fraud and outage reports go to a person straight away
//   - it never confirms a payment, promises a refund or guesses a status
// Tone adapts to the detected emotion; content never does.

import { normalize } from './text.js';

const HUMAN_RE = /\b(human|real person|talk to (?:a |an )?(?:person|someone|agent)|speak to|call me|representative|executive|agent please)\b/;
const SOLVED_RE = /^(?:yes[, ]*)?(?:that )?(?:solved|fixed|helped|worked|sorted)|^(?:thanks?|thank you)[, !.]*(?:that )?(?:helped|worked|fixed)|^it (?:worked|is fixed|works now)/;
const STILL_RE = /still need help|didn'?t help|did not help|not (?:solved|fixed|helpful)|doesn'?t work|does not work|need more help/;

// Reported problems a bot must not try to settle on its own.
const ESCALATE_INTENTS = new Set(['payment_failure', 'double_charge', 'account_takeover', 'outage', 'refund_delay']);

const OPENER = {
  angry: "I'm sorry. I can see this has been really frustrating, and I want to get it to the right person now.",
  frustrated: "I understand, and I'm sorry you've had to chase this.",
  anxious: 'I understand this is worrying, especially where money is involved.',
  confused: "No problem, let's work it out together.",
  satisfied: 'Thanks for letting us know!',
  calm: '',
};

export const QUICK = {
  afterAnswer: ['That solved it', 'I still need help'],
  categories: ['Payment or refund', 'Website or app problem', 'Delivery or order', 'Login or account', 'Something else'],
};

// What to do with a customer message. `ticketId` set means the chat has
// already been handed over, so the message simply joins that ticket.
export function decide({ text, tri, fp, ticketId, lastAction }) {
  const norm = normalize(text).trim();
  if (ticketId) return { action: 'append', reason: 'Chat is already linked to a ticket' };
  if (lastAction === 'answer' && SOLVED_RE.test(norm)) return { action: 'resolved', reason: 'Customer said the article solved it' };
  if (HUMAN_RE.test(norm)) return { action: 'handoff', reason: 'Customer asked for a person' };
  if (lastAction === 'answer' && STILL_RE.test(norm)) return { action: 'handoff', reason: 'Knowledge-base answer did not solve it' };

  if (tri.routing.rule === 'security-override') return { action: 'escalate', reason: 'Security or fraud language' };
  if (ESCALATE_INTENTS.has(fp.intent)) return { action: 'escalate', reason: `Reported ${fp.intent.replace(/_/g, ' ')}: needs a person to verify` };
  if (tri.triage.severity === 'critical') return { action: 'escalate', reason: 'Critical severity signal' };

  const article = tri.articles.find((a) => a.matched?.length);
  if (article) return { action: 'answer', article, reason: `Matched ${article.id} on ${article.matched.map((m) => `"${m}"`).join(', ')}` };
  if (tri.classification.confidence < 0.45 && lastAction !== 'clarify') return { action: 'clarify', reason: `Category confidence ${Math.round(tri.classification.confidence * 100)}%` };
  return { action: 'handoff', reason: 'No verified article answers this' };
}

export function compose(action, { analysis, article, ticket, tri, contacts = 0 }) {
  const opener = OPENER[analysis?.emotion] || '';
  const repeat = contacts >= 2 ? ` I can see you've contacted us ${contacts + 1} times about this, so I've flagged that for the team.` : '';
  const lead = `${opener}${repeat}`.trim();
  const join = (...parts) => parts.filter(Boolean).join(' ');

  switch (action) {
    case 'answer':
      return {
        body: join(lead && `${lead}\n\n`, `This should help: ${article.title}\n${article.summary}\n\n${article.steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}\n\nSource: help article ${article.id.toUpperCase()}. Did that solve it?`),
        quickReplies: QUICK.afterAnswer,
      };
    case 'clarify':
      return { body: join(lead, "I want to send this to the right team. Which of these is closest?"), quickReplies: QUICK.categories };
    case 'escalate': {
      const security = tri?.routing?.rule === 'security-override';
      return {
        body: join(lead,
          `This needs a specialist to check, so I've raised it as ${ticket.id} with our ${ticket.team} team (${bandWord(ticket)} priority).`,
          security
            ? 'While you wait: change your password, sign out of other devices, and never share an OTP with anyone, including us.'
            : "I can't see or confirm transaction status myself, so I won't guess or promise a refund. The team will check it against your payment reference.",
          `You'll get a first reply within ${fmtTarget(ticket.responseTargetMin)}. You can add details or a screenshot on the request page.`),
        quickReplies: [],
      };
    }
    case 'handoff':
      return {
        body: join(lead, `I've passed this to a person: request ${ticket.id} is with our ${ticket.team} team, and they'll see everything you wrote here. First reply within ${fmtTarget(ticket.responseTargetMin)}.`),
        quickReplies: [],
      };
    case 'append':
      return { body: join(lead, `Added to your request ${ticket.id}. ${ticket.assignee ? `${ticket.assignee.name} will` : 'The team will'} see it with the rest of the conversation.`), quickReplies: [] };
    case 'resolved':
      return { body: "Glad that sorted it. If anything changes, just write here again.", quickReplies: [] };
    default:
      return { body: 'Sorry, something went wrong on my side.', quickReplies: [] };
  }
}

// Quick-reply category buttons map to a hint the classifier understands.
export const CATEGORY_HINT = {
  'Payment or refund': 'payment', 'Website or app problem': 'website app not working', 'Delivery or order': 'delivery order',
  'Login or account': 'login account', 'Something else': 'question',
};

export function subjectFrom(text) {
  const first = String(text).split(/(?<=[.!?])\s|\n/)[0].trim();
  const s = first.length > 70 ? `${first.slice(0, 67).replace(/\s+\S*$/, '')}...` : first;
  return s.length >= 4 ? s : 'Chat request';
}

function bandWord(t) {
  return { critical: 'critical', high: 'high', medium: 'normal', low: 'normal' }[t.urgency] || 'normal';
}
function fmtTarget(min) {
  return min < 60 ? `${min} minutes` : `${min / 60} hour${min > 60 ? 's' : ''}`;
}
