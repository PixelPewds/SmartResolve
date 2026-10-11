import express from 'express';
import cookieParser from 'cookie-parser';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { z } from 'zod';

import { getStore } from './store.js';
import { setSession, clearSession, readSession, requireAuth } from './auth.js';
import { DEMO_ACCOUNTS } from './seed.js';
import { triage, hfEnabled } from './ai/index.js';
import { ARTICLES } from './ai/kb.js';
import { CATEGORIES } from './ai/classify.js';
import { scorePriority, BANDS } from './ai/priority.js';
import { routeTicket, TEAMS } from './ai/routing.js';
import { HF_MODELS } from './ai/hf.js';

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '50kb' }));
app.use(cookieParser());
app.use(readSession);

const HOUR = 3600e3;
const api = express.Router();
const publicUser = ({ passwordHash, ...u }) => u;
const articleById = Object.fromEntries(ARTICLES.map(({ keywords, ...a }) => [a.id, a]));

/* ------------------------------------------------------------ validation */

const LoginBody = z.object({ email: z.email(), password: z.string().min(1).max(200) });
const RegisterBody = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.email().max(160),
  password: z.string().min(8, 'Use at least 8 characters').max(200),
});
const TicketBody = z.object({
  subject: z.string().trim().min(4, 'Subject is too short').max(140),
  message: z.string().trim().min(15, 'Please describe the issue in a little more detail').max(4000),
  channel: z.enum(['web', 'email', 'chat', 'whatsapp']).default('web'),
  orderRef: z.string().trim().max(40).optional().or(z.literal('')),
});
const MessageBody = z.object({ body: z.string().trim().min(1).max(4000) });
const PatchBody = z.object({
  status: z.enum(['open', 'in_progress', 'resolved']).optional(),
  team: z.enum(Object.values(TEAMS)).optional(),
  correction: z.object({
    field: z.enum(['category', 'sentiment']),
    to: z.string(),
  }).optional(),
});
const AnalyzeBody = z.object({
  subject: z.string().max(140).default(''),
  message: z.string().trim().min(5).max(4000),
  tier: z.enum(['standard', 'premium', 'enterprise']).default('standard'),
  priorContacts: z.coerce.number().int().min(0).max(10).default(0),
});

/* --------------------------------------------------------------- helpers */

function flagsFor(t, now = Date.now()) {
  const flags = [];
  const open = t.status !== 'resolved';
  const ageH = (now - Date.parse(t.createdAt)) / HOUR;
  if (open && ageH > t.priority.slaHours) flags.push({ key: 'sla', label: `SLA breached by ${fmtHours(ageH - t.priority.slaHours)}` });
  if (t.priorContacts >= 3) flags.push({ key: 'repeat', label: `Contacted ${t.priorContacts + 1} times this week` });
  if (t.customerTier === 'enterprise' && ['P1', 'P2'].includes(t.priority.band)) flags.push({ key: 'impact', label: 'Enterprise account, high priority' });
  if (t.routing.rule === 'security-override') flags.push({ key: 'security', label: 'Possible account compromise or fraud' });
  if (open && t.sentiment.label === 'negative' && ageH > 48) flags.push({ key: 'sentiment', label: 'Negative and unresolved for 2+ days' });
  return flags;
}

function fmtHours(h) {
  if (h < 1) return `${Math.max(1, Math.round(h * 60))}m`;
  if (h < 48) return `${Math.round(h)}h`;
  return `${Math.round(h / 24)}d`;
}

// Customers never see internal scoring: that is the role boundary.
function customerView(t) {
  return {
    id: t.id, subject: t.subject, message: t.message, status: t.status, channel: t.channel,
    team: t.team, createdAt: t.createdAt, resolvedAt: t.resolvedAt, firstResponseAt: t.firstResponseAt,
    responseTargetHours: t.priority.slaHours, redactions: t.redactions,
    thread: t.thread, articles: (t.articleIds || []).map((id) => articleById[id]).filter(Boolean),
  };
}

function agentView(t) {
  return { ...t, flags: flagsFor(t), articles: (t.articleIds || []).map((id) => articleById[id]).filter(Boolean) };
}

function listItem(t) {
  const { thread, message, articleIds, ...rest } = t;
  return { ...rest, snippet: message.slice(0, 140), flags: flagsFor(t), messages: thread.length };
}

const newId = () => crypto.randomBytes(6).toString('hex');

/* ------------------------------------------------------------------ meta */

api.get('/health', async (_req, res) => {
  const store = await getStore();
  res.json({
    ok: true,
    db: store.mode,
    ai: hfEnabled() ? 'huggingface' : 'local',
    models: hfEnabled() ? HF_MODELS : { sentiment: 'lexicon-v1', zeroShot: 'keywords-v1' },
  });
});

api.get('/meta', (_req, res) => {
  res.json({
    teams: Object.values(TEAMS),
    categories: Object.entries(CATEGORIES).map(([key, v]) => ({ key, label: v.label })),
    bands: BANDS,
  });
});

/* ------------------------------------------------------------------ auth */

api.post('/auth/login', async (req, res) => {
  const { email, password } = LoginBody.parse(req.body);
  const store = await getStore();
  const user = await store.users.findByEmail(email.toLowerCase());
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return res.status(401).json({ error: 'Email or password is incorrect' });
  }
  setSession(res, user);
  res.json({ user: publicUser(user) });
});

// One-click demo sign-in for judges. Turn off with DEMO_LOGIN=off.
api.post('/auth/demo', async (req, res) => {
  if (process.env.DEMO_LOGIN === 'off') return res.status(404).json({ error: 'Demo sign-in is disabled' });
  const role = req.body?.role === 'agent' ? 'agent' : 'customer';
  const store = await getStore();
  const user = await store.users.findByEmail(DEMO_ACCOUNTS[role].email);
  setSession(res, user);
  res.json({ user: publicUser(user) });
});

api.post('/auth/register', async (req, res) => {
  const body = RegisterBody.parse(req.body);
  const store = await getStore();
  const email = body.email.toLowerCase();
  if (await store.users.findByEmail(email)) return res.status(409).json({ error: 'An account with this email already exists' });
  const user = {
    id: `u-${newId()}`, name: body.name, email, role: 'customer', tier: 'standard',
    passwordHash: await bcrypt.hash(body.password, 10), createdAt: new Date().toISOString(),
  };
  await store.users.insert(user);
  setSession(res, user);
  res.status(201).json({ user: publicUser(user) });
});

api.post('/auth/logout', (_req, res) => { clearSession(res); res.json({ ok: true }); });

api.get('/auth/me', async (req, res) => {
  if (!req.user) return res.json({ user: null });
  const store = await getStore();
  const user = await store.users.findById(req.user.sub);
  res.json({ user: user ? publicUser(user) : null });
});

/* --------------------------------------------------------------- tickets */

api.post('/tickets', requireAuth('customer'), async (req, res) => {
  const body = TicketBody.parse(req.body);
  const store = await getStore();
  const customer = await store.users.findById(req.user.sub);
  const since = new Date(Date.now() - 7 * 24 * HOUR).toISOString();
  const priorContacts = await store.tickets.countSince({ customerId: customer.id, since });

  const message = body.orderRef ? `${body.message}\n\nOrder reference: ${body.orderRef}` : body.message;
  const r = await triage({ subject: body.subject, message, customer, priorContacts });
  const number = await store.nextTicketNumber();
  const now = new Date().toISOString();

  const ticket = {
    id: `SR-${number}`, number,
    customerId: customer.id, customerName: customer.name, customerEmail: customer.email, customerTier: customer.tier,
    subject: body.subject, message: r.message, channel: body.channel,
    status: 'open', team: r.routing.team,
    sentiment: r.sentiment, classification: r.classification, priority: r.priority, routing: r.routing,
    redactions: r.redactions, articleIds: r.articles.map((a) => a.id),
    priorContacts, corrections: [],
    thread: [{ id: newId(), author: 'customer', name: customer.name, body: r.message, at: now }],
    createdAt: now, updatedAt: now, firstResponseAt: null, resolvedAt: null,
  };
  await store.tickets.insert(ticket);
  res.status(201).json({ ticket: customerView(ticket) });
});

api.get('/tickets', requireAuth('customer', 'agent'), async (req, res) => {
  const store = await getStore();
  if (req.user.role === 'customer') {
    const mine = await store.tickets.list({ customerId: req.user.sub });
    return res.json({ tickets: mine.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(customerView) });
  }

  const { status = 'active', team, band, sentiment, q, sort = 'priority', flagged } = req.query;
  let all = await store.tickets.list();
  const active = all.filter((t) => t.status !== 'resolved');

  let rows = all;
  if (status === 'active') rows = rows.filter((t) => t.status !== 'resolved');
  else if (status !== 'all') rows = rows.filter((t) => t.status === status);
  if (team) rows = rows.filter((t) => t.team === team);
  if (band) rows = rows.filter((t) => t.priority.band === band);
  if (sentiment) rows = rows.filter((t) => t.sentiment.label === sentiment);
  if (q) {
    const needle = String(q).toLowerCase();
    rows = rows.filter((t) => `${t.id} ${t.subject} ${t.message} ${t.customerName} ${t.customerEmail}`.toLowerCase().includes(needle));
  }
  let items = rows.map(listItem);
  if (flagged) items = items.filter((t) => t.flags.length);

  const sorters = {
    priority: (a, b) => b.priority.score - a.priority.score || a.createdAt.localeCompare(b.createdAt),
    newest: (a, b) => b.createdAt.localeCompare(a.createdAt),
    oldest: (a, b) => a.createdAt.localeCompare(b.createdAt),
  };
  items.sort(sorters[sort] || sorters.priority);

  const count = (fn) => active.reduce((m, t) => { const k = fn(t); m[k] = (m[k] || 0) + 1; return m; }, {});
  res.json({
    tickets: items,
    counts: {
      active: active.length,
      byTeam: count((t) => t.team),
      byBand: count((t) => t.priority.band),
      flagged: active.filter((t) => flagsFor(t).length).length,
    },
  });
});

api.get('/tickets/:id', requireAuth('customer', 'agent'), async (req, res) => {
  const store = await getStore();
  const t = await store.tickets.get(req.params.id);
  if (!t || (req.user.role === 'customer' && t.customerId !== req.user.sub)) return res.status(404).json({ error: 'Ticket not found' });
  if (req.user.role === 'customer') return res.json({ ticket: customerView(t) });

  const history = (await store.tickets.list({ customerId: t.customerId }))
    .filter((x) => x.id !== t.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 6)
    .map((x) => ({ id: x.id, subject: x.subject, status: x.status, createdAt: x.createdAt, band: x.priority.band }));
  res.json({ ticket: agentView(t), history });
});

api.post('/tickets/:id/messages', requireAuth('customer', 'agent'), async (req, res) => {
  const { body } = MessageBody.parse(req.body);
  const store = await getStore();
  const t = await store.tickets.get(req.params.id);
  if (!t || (req.user.role === 'customer' && t.customerId !== req.user.sub)) return res.status(404).json({ error: 'Ticket not found' });

  const now = new Date().toISOString();
  const isAgent = req.user.role === 'agent';
  const patch = {
    thread: [...t.thread, { id: newId(), author: req.user.role, name: req.user.name, body, at: now }],
    updatedAt: now,
  };
  if (isAgent && !t.firstResponseAt) patch.firstResponseAt = now;
  if (isAgent && t.status === 'open') patch.status = 'in_progress';
  if (!isAgent && t.status === 'resolved') { patch.status = 'open'; patch.resolvedAt = null; }

  const next = await store.tickets.update(t.id, patch);
  res.json({ ticket: isAgent ? agentView(next) : customerView(next) });
});

api.patch('/tickets/:id', requireAuth('agent'), async (req, res) => {
  const body = PatchBody.parse(req.body);
  const store = await getStore();
  const t = await store.tickets.get(req.params.id);
  if (!t) return res.status(404).json({ error: 'Ticket not found' });

  const now = new Date().toISOString();
  const patch = { updatedAt: now };
  if (body.status) {
    patch.status = body.status;
    patch.resolvedAt = body.status === 'resolved' ? now : null;
    if (body.status !== 'open' && !t.firstResponseAt) patch.firstResponseAt = now;
  }
  if (body.team) patch.team = body.team;

  // Agent correction: the deck's answer to sarcasm and mixed emotion. The
  // correction is logged (it feeds the model-agreement metric) and the score
  // and route are recomputed from the corrected value.
  if (body.correction) {
    const { field, to } = body.correction;
    const text = `${t.subject}. ${t.message}`;
    const customer = { tier: t.customerTier };
    const log = { field, from: field === 'category' ? t.classification.category : t.sentiment.label, to, by: req.user.name, at: now };

    if (field === 'category') {
      if (!CATEGORIES[to]) return res.status(400).json({ error: 'Unknown category' });
      patch.classification = { ...t.classification, category: to, label: CATEGORIES[to].label, confidence: 1, engine: 'agent', model: 'human correction' };
      patch.routing = routeTicket({ text, classification: patch.classification, priority: t.priority, customer });
      patch.team = patch.routing.team;
    } else {
      if (!['negative', 'neutral', 'positive'].includes(to)) return res.status(400).json({ error: 'Unknown sentiment' });
      patch.sentiment = { ...t.sentiment, label: to, score: to === 'negative' ? -0.7 : to === 'positive' ? 0.6 : 0, confidence: 1, engine: 'agent', model: 'human correction' };
      patch.priority = scorePriority({ text, sentiment: patch.sentiment, customer, priorContacts: t.priorContacts });
    }
    patch.corrections = [...(t.corrections || []), log];
  }

  const next = await store.tickets.update(t.id, patch);
  res.json({ ticket: agentView(next) });
});

/* ------------------------------------------------------------ triage lab */

api.post('/analyze', requireAuth('agent'), async (req, res) => {
  const body = AnalyzeBody.parse(req.body);
  const t0 = Date.now();
  const r = await triage({ subject: body.subject, message: body.message, customer: { tier: body.tier }, priorContacts: body.priorContacts });
  res.json({ ...r, totalMs: Date.now() - t0 });
});

/* ------------------------------------------------------------- analytics */

api.get('/analytics', requireAuth('agent'), async (_req, res) => {
  const store = await getStore();
  const all = await store.tickets.list();
  const now = Date.now();
  const days = 14;
  const dayKey = (iso) => iso.slice(0, 10);

  const buckets = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now - i * 24 * HOUR);
    buckets.push({ date: d.toISOString().slice(0, 10), P1: 0, P2: 0, P3: 0, P4: 0, negative: 0, neutral: 0, positive: 0, total: 0 });
  }
  const byDay = Object.fromEntries(buckets.map((b) => [b.date, b]));
  for (const t of all) {
    const b = byDay[dayKey(t.createdAt)];
    if (!b) continue;
    b[t.priority.band]++; b[t.sentiment.label]++; b.total++;
  }

  const active = all.filter((t) => t.status !== 'resolved');
  const resolved = all.filter((t) => t.resolvedAt);
  const responded = all.filter((t) => t.firstResponseAt);
  const hours = (a, b) => (Date.parse(b) - Date.parse(a)) / HOUR;
  const median = (xs) => { if (!xs.length) return 0; const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  const withinSla = resolved.filter((t) => hours(t.createdAt, t.resolvedAt) <= t.priority.slaHours).length;
  const corrected = all.filter((t) => (t.corrections || []).length).length;
  const autoRouted = all.filter((t) => t.routing.rule !== 'low-confidence').length;

  const teamMap = {};
  for (const t of all) {
    const m = (teamMap[t.team] ||= { team: t.team, open: 0, resolved: 0, negative: 0 });
    t.status === 'resolved' ? m.resolved++ : m.open++;
    if (t.sentiment.label === 'negative') m.negative++;
  }

  // Recurring problems: the classifier's own evidence phrases, counted.
  const phraseCount = {};
  const GENERIC = new Set(['order', 'account', 'app', 'page', 'website', 'access', 'money', 'update', 'profile', 'information', 'price', 'paid', 'bill', 'charge', 'charged', 'late', 'down', 'slow', 'error', 'issue', 'problem', 'question', 'how to', 'how do i', 'thank you', 'hours', 'address', 'return', 'policy']);
  for (const t of all) for (const p of t.classification.evidence || []) if (!GENERIC.has(p)) phraseCount[p] = (phraseCount[p] || 0) + 1;
  const recurring = Object.entries(phraseCount).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([phrase, count]) => ({ phrase, count }));

  const catMap = {};
  for (const t of all) catMap[t.classification.category] = (catMap[t.classification.category] || 0) + 1;

  res.json({
    kpis: {
      total: all.length,
      active: active.length,
      criticalOpen: active.filter((t) => t.priority.band === 'P1').length,
      flagged: active.filter((t) => flagsFor(t, now).length).length,
      medianFirstResponseH: Number(median(responded.map((t) => hours(t.createdAt, t.firstResponseAt))).toFixed(1)),
      medianResolutionH: Number(median(resolved.map((t) => hours(t.createdAt, t.resolvedAt))).toFixed(1)),
      slaCompliance: resolved.length ? Math.round((withinSla / resolved.length) * 100) : 100,
      autoRouted: all.length ? Math.round((autoRouted / all.length) * 100) : 0,
      modelAgreement: all.length ? Math.round(((all.length - corrected) / all.length) * 100) : 100,
      negativeShare: all.length ? Math.round((all.filter((t) => t.sentiment.label === 'negative').length / all.length) * 100) : 0,
    },
    daily: buckets,
    bands: BANDS.map((b) => ({ band: b.band, label: b.label, count: active.filter((t) => t.priority.band === b.band).length })),
    teams: Object.values(teamMap).sort((a, b) => b.open - a.open),
    categories: Object.entries(catMap).map(([key, count]) => ({ key, label: CATEGORIES[key].label, count })).sort((a, b) => b.count - a.count),
    recurring,
  });
});

api.get('/kb', (req, res) => {
  const q = String(req.query.q || '').toLowerCase();
  const list = Object.values(articleById).filter((a) => !q || `${a.title} ${a.summary}`.toLowerCase().includes(q));
  res.json({ articles: list });
});

/* ---------------------------------------------------------------- errors */

app.use('/api', api);
app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));

// Express 5 forwards rejected promises here, so routes need no try/catch.
app.use((err, _req, res, _next) => {
  if (err instanceof z.ZodError) {
    const first = err.issues[0];
    return res.status(400).json({ error: first?.message || 'Invalid input', field: first?.path?.join('.') });
  }
  if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'Malformed JSON' });
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on our side' });
});

export default app;
