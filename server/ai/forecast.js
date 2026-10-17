// Emotion Escalation Tracker and Frustration Forecast.
//
// Two separate outputs, on purpose:
//   priority (priority.js)  how urgently the team should act on the PROBLEM
//   forecast (this file)    how likely the CUSTOMER is to escalate in the next 4h
// A calm customer reporting a security breach is high priority and low
// forecast; an angry customer with a small question can be the reverse.
//
// The forecast is a transparent heuristic: hand-set weights in a logistic
// function. It is NOT trained on outcomes, because the prototype has none, so
// it is shown as a "risk indicator" and never as a validated probability.

import { round } from './text.js';

const HOUR = 3600e3;
export const FORECAST_MODEL = 'risk-heuristic-v1 (hand-set weights, not trained)';
export const HORIZON_HOURS = 4;

/* --------------------------------------------------------- emotion trend */

export function emotionTrend(thread = []) {
  const points = thread
    .filter((m) => m.author === 'customer' && m.sentiment)
    .map((m) => ({
      id: m.id, at: m.at, channel: m.channel || null,
      label: m.sentiment.label, score: m.sentiment.score, confidence: m.sentiment.confidence,
      emotion: m.sentiment.emotion, intensity: m.sentiment.intensity, frustration: m.sentiment.frustration,
    }));
  if (!points.length) return null;
  const first = points[0];
  const latest = points.at(-1);
  const delta = round(latest.frustration - first.frustration);
  const state = points.length < 2 ? 'single' : delta >= 0.2 ? 'worsening' : delta <= -0.2 ? 'improving' : 'stable';
  const worsening = state === 'worsening' && latest.frustration >= 0.4;
  // A weak reading of the latest message should not page a supervisor on its
  // own: flag it for a human to look at instead.
  const uncertain = latest.confidence < 0.6;
  return {
    points, state, delta, latest, messages: points.length,
    peak: Math.max(...points.map((p) => p.frustration)),
    worsening,
    escalate: worsening && !uncertain,
    review: worsening && uncertain,
  };
}

/* -------------------------------------------------------------- forecast */

const BIAS = -3.2;
const sigmoid = (z) => 1 / (1 + Math.exp(-z));

export function forecastEscalation(t, { now = Date.now(), sla, trend, incident } = {}) {
  if (t.status === 'resolved') return null;
  const thread = t.thread || [];
  const lastCustomer = thread.findLast((m) => m.author === 'customer');
  const lastAgent = thread.findLast((m) => m.author === 'agent');
  const awaiting = lastCustomer && (!lastAgent || lastAgent.at < lastCustomer.at);
  const waitH = awaiting ? Math.max(0, (now - Date.parse(lastCustomer.at)) / HOUR) : 0;
  const followUps = Math.max(0, thread.filter((m) => m.author === 'customer').length - 1);
  const contacts = (t.priorContacts || 0) + followUps;
  const frustration = trend?.latest?.frustration ?? 0;
  const money = ['billing', 'account'].includes(t.classification?.category) && ['critical', 'major'].includes(t.triage?.severity);
  const repliedRecently = lastAgent && !awaiting && now - Date.parse(lastAgent.at) < 0.5 * HOUR;

  const f = (key, label, w, detail) => ({ key, label, weight: round(w), detail });
  const factors = [
    f('waiting', 'Waiting for a reply', 0.55 * Math.min(waitH, 6), awaiting ? `${fmtH(waitH)} since the customer's last message, no reply yet` : 'Last message was answered'),
    f('contacts', 'Repeat contact', 0.55 * Math.min(contacts, 4), contacts ? `${contacts} follow-up${contacts > 1 ? 's' : ''} or earlier tickets this week` : 'First contact'),
    f('frustration', 'Current frustration', 2.4 * frustration, trend ? `Latest message reads ${trend.latest.emotion} (${Math.round(frustration * 100)}/100)` : 'No message analysis'),
    f('trend', 'Frustration rising', trend?.worsening ? 1 : 0, trend ? `Trend ${trend.state} across ${trend.messages} message${trend.messages > 1 ? 's' : ''}` : 'Single message'),
    f('sla', 'SLA pressure', sla?.state === 'breached' ? 1.2 : sla?.state === 'warning' ? 0.6 : 0, sla ? `SLA ${sla.state}` : 'No SLA clock'),
    f('owner', 'No owner', t.assigneeId ? 0 : 0.4, t.assigneeId ? `Owned by ${t.assigneeName}` : 'Nobody has picked it up'),
    f('money', 'Money or account at stake', money ? 0.6 : 0, money ? 'Financial or security impact' : 'No financial or security impact'),
    f('replied', 'Agent replied recently', repliedRecently ? -1.2 : 0, repliedRecently ? 'Answered in the last 30 minutes' : 'No recent reply'),
    f('known', 'Told it is a known issue', incident?.status === 'confirmed' ? -0.5 : 0, incident?.status === 'confirmed' ? `Linked to ${incident.id}, customer informed` : 'Not linked to a confirmed incident'),
  ];
  const z = BIAS + factors.reduce((s, x) => s + x.weight, 0);
  const score = Math.round(sigmoid(z) * 100);
  const level = score >= 60 ? 'high' : score >= 35 ? 'medium' : 'low';
  const drivers = factors.filter((x) => x.weight > 0.3).sort((a, b) => b.weight - a.weight);

  return {
    score, level, horizonHours: HORIZON_HOURS, model: FORECAST_MODEL,
    factors, drivers: drivers.map((d) => d.key),
    recommendation: recommend(drivers, { waitH, contacts, level }),
    inputs: { waitHours: round(waitH, 1), contacts, frustration, awaitingReply: Boolean(awaiting) },
  };
}

const ACTION = {
  waiting: ({ waitH }) => `Reply now, even with a holding update: the customer has waited ${fmtH(waitH)}`,
  frustration: () => 'Acknowledge the frustration and give one concrete next step with a time',
  trend: () => 'Each message is angrier than the last: have a senior agent take over',
  contacts: ({ contacts }) => `Call the customer: ${contacts} contacts already, one owner end to end`,
  sla: () => 'Escalate to the team lead before the SLA check',
  owner: () => 'Assign an owner now',
  money: () => 'Verify the transaction and share its reference, without promising a refund',
};

function recommend(drivers, ctx) {
  if (ctx.level === 'low') return [];
  return [...new Set(drivers.map((d) => d.key))].filter((k) => ACTION[k]).slice(0, 2).map((k) => ACTION[k](ctx));
}

function fmtH(h) {
  if (h < 1) return `${Math.max(1, Math.round(h * 60))} min`;
  return `${round(h, 1)} h`;
}
