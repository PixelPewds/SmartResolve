// Triage pipeline: redact -> sentiment + category (in parallel) -> intake
// assessment (urgency + impact) -> routing -> knowledge-base suggestions.
//
// The scheduling half of the priority score (waiting time, SLA risk) is
// added later, at read time, by livePriority(). See priority.js.

import { redact } from './redact.js';
import { analyzeSentiment, lexiconSentiment, sarcasmCheck } from './sentiment.js';
import { classifyIssue, keywordClassify } from './classify.js';
import { assessIntake } from './priority.js';
import { routeTicket } from './routing.js';
import { recommendArticles, recommendedActions } from './kb.js';

export { hfEnabled } from './hf.js';

// `offline: true` skips the network entirely. Used for seeding and the eval
// set, where hundreds of API calls would be slow and pointless.
export async function triage({ subject = '', message = '', customer = {}, priorContacts = 0, offline = false }) {
  const clean = redact(message);
  const text = `${subject}. ${clean.text}`.trim();

  const [sentiment, classification] = offline
    ? [sarcasmCheck(text, lexiconSentiment(text)), keywordClassify(text)]
    : await Promise.all([analyzeSentiment(text), classifyIssue(text)]);

  const intake = assessIntake({ text, sentiment, customer, priorContacts });
  const routing = routeTicket({ text, classification, priority: { band: intake.intakeBand }, customer });
  const articles = recommendArticles(text, classification.category);

  return {
    message: clean.text,
    redactions: clean.redactions,
    sentiment,
    classification,
    triage: intake,
    routing,
    articles,
    actions: recommendedActions({ text, category: classification.category, severity: intake.severity, routing }),
  };
}
