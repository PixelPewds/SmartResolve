// Behaviour checks for the local triage models. Run: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { triage } from './index.js';
import { lexiconSentiment } from './sentiment.js';
import { redact } from './redact.js';

const run = (message, extra = {}) => triage({ subject: '', message, offline: true, ...extra });

test('negation flips sentiment', () => {
  assert.equal(lexiconSentiment('I am happy with the service').label, 'positive');
  assert.equal(lexiconSentiment('I am not happy at all, this is terrible').label, 'negative');
});

test('sarcastic praise about a failure reads negative', async () => {
  const r = await run('Great job guys, my parcel has been "out for delivery" for six days now. Really amazing service.');
  assert.equal(r.sentiment.label, 'negative');
  assert.equal(r.sentiment.sarcasm, true);
  // genuine praise must stay positive
  const ok = await run('Thank you, the agent was very helpful and quick. Great service!');
  assert.equal(ok.sentiment.label, 'positive');
});

test('double charge is billing, critical severity, routed to Billing', async () => {
  const r = await run('I was charged twice for order 4471 and nobody is replying. Unacceptable!');
  assert.equal(r.classification.category, 'billing');
  assert.equal(r.priority.severity, 'critical');
  assert.equal(r.routing.team, 'Billing');
});

test('angry but routine request is capped at P3', async () => {
  const r = await run('HOW DO I CHANGE MY PROFILE PHOTO?? This is ridiculous, worst app, so frustrating!!!', {
    customer: { tier: 'enterprise' },
  });
  assert.ok(['P3', 'P4'].includes(r.priority.band), `got ${r.priority.band} (${r.priority.score})`);
});

test('security language overrides category and floors at P2', async () => {
  const r = await run('There is a login from another city I do not recognise. I think my account was hacked.');
  assert.equal(r.routing.team, 'Account & Security');
  assert.ok(['P1', 'P2'].includes(r.priority.band));
});

test('repeat contacts raise priority', async () => {
  const msg = 'My parcel has not arrived yet, tracking shows no update.';
  const first = await run(msg, { priorContacts: 0 });
  const third = await run(msg, { priorContacts: 3 });
  assert.ok(third.priority.score > first.priority.score + 15);
});

test('factor points always sum to the score unless a guardrail fired', async () => {
  const r = await run('The app keeps crashing after the update, our entire team cannot work.', { customer: { tier: 'premium' } });
  const sum = r.priority.factors.reduce((s, f) => s + f.points, 0);
  if (!r.priority.rules.length) assert.equal(sum, r.priority.score);
});

test('PII is redacted before storage', () => {
  const r = redact('Card 4111 1111 1111 1111, call me on +91 98765 43210, otp is 482913');
  assert.ok(!r.text.includes('4111 1111'));
  assert.ok(r.text.includes('[card ending 1111]'));
  assert.ok(r.text.includes('[phone]'));
  assert.ok(!r.text.includes('482913'));
});
