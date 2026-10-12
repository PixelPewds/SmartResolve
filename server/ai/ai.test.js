// Behaviour checks for the triage and scheduling engine. Run: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { triage } from './index.js';
import { lexiconSentiment } from './sentiment.js';
import { redact } from './redact.js';
import { livePriority } from './priority.js';
import { detectClusters } from './incidents.js';
import { recommendExperts } from './experts.js';
import { slaStatus } from '../sla.js';
import { evaluate } from './evalset.js';

const HOUR = 3600e3;
const run = (message, extra = {}) => triage({ subject: '', message, offline: true, ...extra });

// Build a stored-ticket shape from a triage result.
async function ticket(message, { ageH = 0, tier = 'standard', priorContacts = 0, now = Date.now(), extra = {} } = {}) {
  const r = await run(message, { customer: { tier }, priorContacts });
  return {
    id: `T${Math.random().toString(36).slice(2, 8)}`, subject: message.slice(0, 40), message, customerId: `c${Math.random()}`,
    createdAt: new Date(now - ageH * HOUR).toISOString(), firstResponseAt: null, resolvedAt: null, status: 'open',
    team: r.routing.team, triage: r.triage, classification: r.classification, sentiment: r.sentiment, routing: r.routing,
    priorContacts, ...extra,
  };
}

test('negation flips sentiment', () => {
  assert.equal(lexiconSentiment('I am happy with the service').label, 'positive');
  assert.equal(lexiconSentiment('I am not happy at all, this is terrible').label, 'negative');
});

test('sarcastic praise about a failure reads negative, genuine praise stays positive', async () => {
  const r = await run('Great job guys, my parcel has been "out for delivery" for six days now. Really amazing service.');
  assert.equal(r.sentiment.label, 'negative');
  assert.equal(r.sentiment.sarcasm, true);
  const ok = await run('Thank you, the agent was very helpful and quick. Great service!');
  assert.equal(ok.sentiment.label, 'positive');
});

test('double charge: billing, critical urgency, routed to Billing', async () => {
  const r = await run('I was charged twice for order 4471 and nobody is replying. Unacceptable!');
  assert.equal(r.classification.category, 'billing');
  assert.equal(r.triage.severity, 'critical');
  assert.equal(r.routing.team, 'Billing');
});

test('angry but routine request is capped at P3 intake', async () => {
  const r = await run('HOW DO I CHANGE MY PROFILE PHOTO?? This is ridiculous, worst app, so frustrating!!!', { customer: { tier: 'enterprise' } });
  assert.ok(['P3', 'P4'].includes(r.triage.intakeBand), `got ${r.triage.intakeBand}`);
});

test('security language overrides routing and floors intake at P2', async () => {
  const r = await run('There is a login from another city I do not recognise. I think my account was hacked.');
  assert.equal(r.routing.team, 'Account & Security');
  assert.ok(['P1', 'P2'].includes(r.triage.intakeBand));
});

test('hybrid scheduling: the same ticket climbs as it waits', async () => {
  const now = Date.now();
  const fresh = await ticket('How do I download my GST invoice?', { now });
  // Answered after 1h, so only the 72h resolution clock is running.
  const old = { ...fresh, createdAt: new Date(now - 30 * HOUR).toISOString(), firstResponseAt: new Date(now - 29 * HOUR).toISOString() };
  const a = livePriority(fresh, { now, sla: slaStatus(fresh, now) });
  const b = livePriority(old, { now, sla: slaStatus(old, now) });
  assert.ok(b.score > a.score + 15, `fresh ${a.score}, old ${b.score}`);
  assert.equal(b.factors.find((f) => f.key === 'sla').points, 0, 'P4 resolve target is 72h, not yet at risk');
});

test('intake band acts as a floor, never a ceiling', async () => {
  const now = Date.now();
  const t = await ticket('Your seller dashboard is completely down for our entire team, costing revenue.', { tier: 'enterprise', now });
  const p = livePriority(t, { now, sla: slaStatus(t, now) });
  assert.equal(t.triage.intakeBand, 'P1');
  assert.ok(p.score >= 70 && p.band === 'P1');
});

test('only CONFIRMED critical incidents pin and boost a ticket', async () => {
  const now = Date.now();
  const t = await ticket('Website pages are not loading, very slow.', { now });
  const base = livePriority(t, { now, sla: slaStatus(t, now) });
  const cand = livePriority(t, { now, sla: slaStatus(t, now), incident: { id: 'INC-9', status: 'candidate' } });
  const conf = livePriority(t, { now, sla: slaStatus(t, now), incident: { id: 'INC-9', status: 'confirmed', severity: 'critical' } });
  assert.equal(cand.score, base.score, 'candidate must not move the score');
  assert.ok(conf.pinned && conf.score >= 85);
});

test('factor points add up to the raw score', async () => {
  const now = Date.now();
  const t = await ticket('The app keeps crashing after the update, our entire team cannot work.', { tier: 'premium', ageH: 5, now });
  const p = livePriority(t, { now, sla: slaStatus(t, now) });
  assert.equal(p.factors.reduce((s, f) => s + f.points, 0), p.raw);
});

test('SLA: breached once the first-response target passes with no reply', async () => {
  const now = Date.now();
  const t = await ticket('I was charged twice for my order.', { now, ageH: 3 });
  assert.equal(slaStatus(t, now).state, 'breached');
  const answered = { ...t, firstResponseAt: new Date(now - 2.9 * HOUR).toISOString() };
  assert.notEqual(slaStatus(answered, now).state, 'breached');
});

test('spike detection flags a burst but not a steady trickle', async () => {
  const now = Date.now();
  const burst = await Promise.all([
    'Website very slow, pages not loading', 'Pages not loading on the website', 'Website not loading at all, pages spinning',
    'Website extremely slow, every page takes a minute to load', 'Cannot open product pages, website loading forever',
  ].map((m, i) => ticket(m, { now, ageH: 0.3 + i * 0.4 })));
  const steady = await Promise.all(Array.from({ length: 12 }, (_, i) => ticket('The app crashes after the latest update', { now, ageH: 5 + i * 26 })));
  const clusters = detectClusters([...burst, ...steady], now);
  const web = clusters.find((c) => c.ticketIds.includes(burst[0].id));
  assert.ok(web?.spike.isSpike, 'website burst should be a spike');
  const crash = clusters.find((c) => c.ticketIds.includes(steady[0].id));
  assert.ok(!crash || !crash.spike.isSpike, 'steady crash reports should not be a spike');
});

test('expert recommendation prefers skill fit, availability and headroom, and explains it', async () => {
  const t = { ...(await ticket('My delivery to Kolhapur is delayed, stuck at the Pune hub')), team: 'Logistics' };
  const agents = [
    { id: 'a', name: 'A', team: 'Logistics', skills: ['Delivery'], status: 'online', capacity: 6 },
    { id: 'b', name: 'B', team: 'Logistics', skills: ['Delivery', 'West region logistics'], status: 'online', capacity: 6 },
    { id: 'c', name: 'C', team: 'Logistics', skills: ['Delivery', 'West region logistics'], status: 'offline', capacity: 6 },
  ];
  const r = recommendExperts(t, agents, { openLoad: { a: 1, b: 2 } });
  assert.equal(r.experts[0].agentId, 'b');
  assert.equal(r.experts.at(-1).agentId, 'c', 'offline agent ranks last');
  assert.ok(r.experts[0].reasons.length >= 4);
});

test('evaluation is computed, includes failures, and is not perfect', async () => {
  const r = await evaluate();
  assert.ok(r.rows.length >= 30);
  assert.ok(r.rows.some((x) => !x.correct.category || !x.correct.sentiment), 'expected some wrong predictions');
  assert.ok(r.overall.category < 100);
});

test('PII is redacted before storage', () => {
  const r = redact('Card 4111 1111 1111 1111, call me on +91 98765 43210, otp is 482913');
  assert.ok(!r.text.includes('4111 1111'));
  assert.ok(r.text.includes('[card ending 1111]'));
  assert.ok(r.text.includes('[phone]'));
  assert.ok(!r.text.includes('482913'));
});
