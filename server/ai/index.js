// Triage pipeline: redact -> sentiment + category (in parallel) -> priority ->
// routing -> knowledge-base suggestions.

import { redact } from './redact.js';
import { analyzeSentiment, lexiconSentiment, sarcasmCheck } from './sentiment.js';
import { classifyIssue, keywordClassify } from './classify.js';
import { scorePriority } from './priority.js';
import { routeTicket } from './routing.js';
import { recommendArticles } from './kb.js';

export { hfEnabled } from './hf.js';

// `offline: true` skips the network entirely. Used for seeding, where a
// hundred API calls on cold start would be slow and pointless.
export async function triage({ subject = '', message = '', customer = {}, priorContacts = 0, offline = false }) {
  const clean = redact(message);
  const text = `${subject}. ${clean.text}`.trim();

  const [sentiment, classification] = offline
    ? [sarcasmCheck(text, lexiconSentiment(text)), keywordClassify(text)]
    : await Promise.all([analyzeSentiment(text), classifyIssue(text)]);

  const priority = scorePriority({ text, sentiment, customer, priorContacts });
  const routing = routeTicket({ text, classification, priority, customer });
  const articles = recommendArticles(text, classification.category);

  return {
    message: clean.text,
    redactions: clean.redactions,
    sentiment,
    classification,
    priority,
    routing,
    articles,
  };
}
