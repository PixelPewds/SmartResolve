import express from 'express';
import cookieParser from 'cookie-parser';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { z } from 'zod';

import { getStore, SEED_VERSION } from './store.js';
import { setSession, clearSession, readSession, requireAuth } from './auth.js';
import { DEMO_ACCOUNTS } from './seed.js';
import { triage, hfEnabled } from './ai/index.js';
import { CATEGORIES } from './ai/classify.js';
import { assessIntake, BANDS } from './ai/priority.js';
import { routeTicket, TEAMS } from './ai/routing.js';
import { HF_MODELS } from './ai/hf.js';
import { SKILLS } from './ai/experts.js';
import { evaluate, EVAL_SET } from './ai/evalset.js';
import { SLA_POLICY, ESCALATION_RULES } from './sla.js';
import {
  loadContext, enrich, sortQueue, listItem, similarResolved, expertsFor, workload,
  syncIncidents, linkTickets, notificationsFor, articleById, fmtDur,
} from './services.js';

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '50kb' }));
app.use(cookieParser());
app.use(readSession);

const HOUR = 3600e3;
const api = express.Router();
const STAFF = ['agent', 'supervisor'];
const publicUser = ({ passwordHash, ...u }) => u;
const newId = () => crypto.randomBytes(6).toString('hex');
const nowIso = () => new Date().toISOString();
const fail = (res, code, error) => res.status(code).json({ error });
const median = (xs) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const hours = (a, b) => (Date.parse(b) - Date.parse(a)) / HOUR;

/* ------------------------------------------------------------ validation */

const LoginBody = z.object({ email: z.email(), password: z.string().min(1).max(200) });
const RegisterBody = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.email().max(160),
  password: z.string().min(8, 'Use at least 8 characters').max(200),
});
const Attachment = z.object({ name: z.string().max(120), size: z.number().int().nonnegative().max(10 * 1024 * 1024), type: z.string().max(80) });
const TicketBody = z.object({
  subject: z.string().trim().min(4, 'Subject is too short').max(140),
  message: z.string().trim().min(15, 'Please describe the issue in a little more detail').max(4000),
  channel: z.enum(['web', 'email', 'chat', 'whatsapp']).default('web'),
  orderRef: z.string().trim().max(40).optional().or(z.literal('')),
  customerCategory: z.enum([...Object.keys(CATEGORIES), 'unsure']).default('unsure'),
  attachments: z.array(Attachment).max(5).default([]),
});
const PreviewBody = z.object({ subject: z.string().max(140).default(''), message: z.string().max(4000).default('') });
const MessageBody = z.object({ body: z.string().trim().min(1).max(4000) });
const NoteBody = z.object({ body: z.string().trim().min(1).max(2000) });
const PatchBody = z.object({
  status: z.enum(['open', 'in_progress']).optional(),
  team: z.enum(Object.values(TEAMS)).optional(),
  correction: z.object({ field: z.enum(['category', 'sentiment']), to: z.string() }).optional(),
});
const AssignBody = z.object({ agentId: z.string(), reason: z.string().trim().max(300).optional() });
const EscalateBody = z.object({ level: z.enum(['L1', 'L2', 'Manager']), reason: z.string().trim().min(5, 'Give a short reason').max(300) });
const ResolveBody = z.object({
  rootCause: z.string().trim().min(5, 'Describe the root cause').max(600),
  fix: z.string().trim().min(5, 'Describe what fixed it').max(600),
  customerSummary: z.string().trim().min(10, 'Write a short summary for the customer').max(1000),
  category: z.enum(Object.keys(CATEGORIES)),
});
const FeedbackBody = z.object({ rating: z.number().int().min(1).max(5), comment: z.string().trim().max(600).default('') });
const AnalyzeBody = z.object({
  subject: z.string().max(140).default(''),
  message: z.string().trim().min(5).max(4000),
  tier: z.enum(['standard', 'premium', 'enterprise']).default('standard'),
  priorContacts: z.coerce.number().int().min(0).max(10).default(0),
});
const IncidentDecision = z.object({
  severity: z.enum(['critical', 'major']).optional(),
  note: z.string().trim().max(600).default(''),
});

/* --------------------------------------------------------------- helpers */

async function addNotification(store, { to, type, title, body, ticketId = null, incidentId = null }) {
  await store.insert('notifications', { id: `n-${Date.now()}-${newId()}`, to, type, title, body, ticketId, incidentId, at: nowIso(), read: false });
}

// Customers never see internal scoring: the role boundary is enforced here.
function customerView(t, ctx) {
  const inc = t.incidentId ? ctx.incidentById[t.incidentId] : null;
  const steps = [
    { key: 'submitted', label: 'Submitted', at: t.createdAt, done: true },
    { key: 'analysed', label: 'Analysed and routed', at: t.createdAt, done: true },
    { key: 'assigned', label: 'Assigned', at: t.assignment?.at || null, done: Boolean(t.assigneeId) || t.status === 'resolved' },
    { key: 'progress', label: 'In resolution', at: t.firstResponseAt, done: Boolean(t.firstResponseAt) },
    { key: 'closed', label: 'Resolved', at: t.resolvedAt, done: t.status === 'resolved' },
  ];
  const tgt = SLA_POLICY[t.triage.intakeBand];
  return {
    id: t.id, subject: t.subject, message: t.message, status: t.status, channel: t.channel,
    team: t.team, category: CATEGORIES[t.classification.category].label, urgency: t.triage.urgency.level,
    createdAt: t.createdAt, resolvedAt: t.resolvedAt, firstResponseAt: t.firstResponseAt,
    responseTargetMin: tgt.firstResponseMin, resolveTargetHours: tgt.resolveHours,
    assignee: t.assigneeName ? { name: t.assigneeName.split(' ')[0] } : null,
    redactions: t.redactions, attachments: t.attachments || [],
    incident: inc && ['confirmed', 'resolved'].includes(inc.status) ? { id: inc.id, title: inc.title, status: inc.status } : null,
    resolution: t.resolution ? { summary: t.resolution.customerSummary, at: t.resolution.at } : null,
    feedback: t.feedback, steps,
    thread: t.thread,
    articles: (t.articleIds || []).map((id) => articleById[id]).filter(Boolean),
  };
}

const staffTicket = (t, ctx) => ({
  ...enrich(t, ctx),
  articles: (t.articleIds || []).map((id) => articleById[id]).filter(Boolean),
});

async function ctxWithIncidents(store) {
  const ctx = await loadContext(store);
  await syncIncidents(store, ctx);
  return ctx;
}

/* ------------------------------------------------------------------ meta */

api.get('/health', async (_req, res) => {
  const store = await getStore();
  res.json({
    ok: true, db: store.mode, seedVersion: SEED_VERSION,
    ai: hfEnabled() ? 'huggingface' : 'local',
    models: hfEnabled() ? HF_MODELS : { sentiment: 'lexicon-v1', zeroShot: 'keywords-v1' },
  });
});

api.get('/meta', (_req, res) => {
  res.json({
    teams: Object.values(TEAMS).filter((t) => t !== 'Triage Review'),
    categories: Object.entries(CATEGORIES).map(([key, v]) => ({ key, label: v.label })),
    bands: BANDS, slaPolicy: SLA_POLICY, escalationRules: ESCALATION_RULES, skills: Object.keys(SKILLS),
  });
});

/* ------------------------------------------------------------------ auth */

api.post('/auth/login', async (req, res) => {
  const { email, password } = LoginBody.parse(req.body);
  const store = await getStore();
  const user = (await store.all('users')).find((u) => u.email === email.toLowerCase());
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) return fail(res, 401, 'Email or password is incorrect');
  setSession(res, user);
  res.json({ user: publicUser(user) });
});

// One-click demo sign-in for judges. Turn off with DEMO_LOGIN=off.
api.post('/auth/demo', async (req, res) => {
  if (process.env.DEMO_LOGIN === 'off') return fail(res, 404, 'Demo sign-in is disabled');
  const role = ['agent', 'supervisor', 'customer'].includes(req.body?.role) ? req.body.role : 'customer';
  const store = await getStore();
  const user = (await store.all('users')).find((u) => u.email === DEMO_ACCOUNTS[role].email);
  if (!user) return fail(res, 503, 'Demo data is still loading, try again in a moment');
  setSession(res, user);
  res.json({ user: publicUser(user) });
});

api.post('/auth/register', async (req, res) => {
  const body = RegisterBody.parse(req.body);
  const store = await getStore();
  const email = body.email.toLowerCase();
  if ((await store.all('users')).some((u) => u.email === email)) return fail(res, 409, 'An account with this email already exists');
  const user = {
    id: `u-${newId()}`, name: body.name, email, role: 'customer', tier: 'standard',
    passwordHash: await bcrypt.hash(body.password, 10), createdAt: nowIso(),
  };
  await store.insert('users', user);
  setSession(res, user);
  res.status(201).json({ user: publicUser(user) });
});

api.post('/auth/logout', (_req, res) => { clearSession(res); res.json({ ok: true }); });

api.get('/auth/me', async (req, res) => {
  if (!req.user) return res.json({ user: null });
  const store = await getStore();
  const user = await store.get('users', req.user.sub);
  res.json({ user: user ? publicUser(user) : null });
});

/* ---------------------------------------------------------------- shared */

api.get('/notifications', requireAuth(), async (req, res) => {
  const store = await getStore();
  const ctx = await loadContext(store);
  const user = await store.get('users', req.user.sub);
  const list = await notificationsFor(store, user, ctx);
  res.json({ notifications: list, unread: list.filter((n) => !n.read).length });
});

api.post('/notifications/read', requireAuth(), async (req, res) => {
  const ids = z.array(z.string()).max(200).parse(req.body?.ids || []);
  const store = await getStore();
  const cur = await store.get('reads', req.user.sub);
  const merged = [...new Set([...(cur?.ids || []), ...ids])].slice(-500);
  if (cur) await store.update('reads', req.user.sub, { ids: merged });
  else await store.insert('reads', { id: req.user.sub, ids: merged });
  res.json({ ok: true });
});

api.get('/kb', (req, res) => {
  const q = String(req.query.q || '').toLowerCase();
  const list = Object.values(articleById).filter((a) => !q || `${a.title} ${a.summary} ${a.steps.join(' ')}`.toLowerCase().includes(q));
  res.json({ articles: list });
});

// Live analysis while a customer types. Nothing is saved.
api.post('/preview', requireAuth(), async (req, res) => {
  const { subject, message } = PreviewBody.parse(req.body);
  if ((subject + message).trim().length < 12) return res.json({ ready: false });
  const store = await getStore();
  const customer = req.user.role === 'customer' ? await store.get('users', req.user.sub) : {};
  const r = await triage({ subject, message, customer, offline: true });
  const orderRef = (message.match(/#?\b(?:OD-?)?\d{5,}\b/) || [])[0] || null;
  res.json({
    ready: true,
    category: { key: r.classification.category, label: r.classification.label, confidence: r.classification.confidence, evidence: r.classification.evidence },
    urgency: { level: r.triage.urgency.level, confidence: r.triage.urgency.confidence, reasons: r.triage.urgency.reasons.slice(0, 2) },
    sentiment: { label: r.sentiment.label, confidence: r.sentiment.confidence, sarcasm: Boolean(r.sentiment.sarcasm) },
    team: r.routing.team === 'Triage Review' ? 'Customer Care' : r.routing.team,
    redactions: r.redactions,
    orderRef,
    articles: r.articles.slice(0, 2),
  });
});

/* ------------------------------------------------------- customer tickets */

api.post('/tickets', requireAuth('customer'), async (req, res) => {
  const body = TicketBody.parse(req.body);
  const store = await getStore();
  const customer = await store.get('users', req.user.sub);
  const ctx = await loadContext(store);
  const since = ctx.now - 7 * 24 * HOUR;
  const priorContacts = ctx.tickets.filter((t) => t.customerId === customer.id && Date.parse(t.createdAt) >= since).length;

  const message = body.orderRef ? `${body.message}\n\nOrder reference: ${body.orderRef}` : body.message;
  const r = await triage({ subject: body.subject, message, customer, priorContacts });
  const number = await store.seq('ticket');
  const at = nowIso();
  const team = r.routing.team === 'Triage Review' ? 'Customer Care' : r.routing.team;

  const ticket = {
    id: `SR-${number}`, number,
    customerId: customer.id, customerName: customer.name, customerEmail: customer.email, customerTier: customer.tier,
    subject: body.subject, message: r.message, channel: body.channel,
    customerCategory: body.customerCategory === 'unsure' ? null : body.customerCategory,
    attachments: body.attachments,
    status: 'open', team,
    sentiment: r.sentiment, classification: r.classification, triage: r.triage, routing: r.routing,
    redactions: r.redactions, articleIds: r.articles.map((a) => a.id), actions: r.actions,
    priorContacts,
    assigneeId: null, assigneeName: null, assignment: null, escalation: null, incidentId: null,
    notes: [], corrections: [], resolution: null, feedback: null,
    thread: [{ id: newId(), author: 'customer', name: customer.name, body: r.message, at }],
    events: [
      { at, type: 'created', by: customer.name, text: `Submitted via ${body.channel}` },
      { at, type: 'triaged', by: 'SmartResolve', text: `${r.classification.label}, ${r.triage.urgency.level} urgency, intake ${r.triage.intakeBand}, routed to ${team}` },
    ],
    createdAt: at, updatedAt: at, firstResponseAt: null, resolvedAt: null,
  };
  await store.insert('tickets', ticket);
  ctx.tickets.push(ticket);

  // A new complaint may complete a spike, or join a confirmed incident.
  await syncIncidents(store, ctx);
  const fresh = await store.get('tickets', ticket.id);
  await addNotification(store, { to: 'role:supervisor', type: 'new', title: `New ${fresh.triage.intakeBand} ticket ${fresh.id}`, body: `${fresh.subject} (${team})`, ticketId: fresh.id });
  res.status(201).json({ ticket: customerView(fresh, ctx) });
});

api.get('/my/tickets', requireAuth('customer'), async (req, res) => {
  const store = await getStore();
  const ctx = await loadContext(store);
  const mine = ctx.tickets.filter((t) => t.customerId === req.user.sub).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  res.json({ tickets: mine.map((t) => customerView(t, ctx)) });
});

api.post('/tickets/:id/feedback', requireAuth('customer'), async (req, res) => {
  const body = FeedbackBody.parse(req.body);
  const store = await getStore();
  const t = await store.get('tickets', req.params.id);
  if (!t || t.customerId !== req.user.sub) return fail(res, 404, 'Ticket not found');
  if (t.status !== 'resolved') return fail(res, 400, 'Feedback opens once the request is resolved');
  const at = nowIso();
  const next = await store.update('tickets', t.id, {
    feedback: { ...body, at },
    events: [...t.events, { at, type: 'feedback', by: t.customerName, text: `Rated ${body.rating} of 5` }],
  });
  if (t.assigneeId) await addNotification(store, { to: t.assigneeId, type: 'feedback', title: `${t.id} rated ${body.rating}/5`, body: body.comment || t.subject, ticketId: t.id });
  if (body.rating <= 2) await addNotification(store, { to: 'role:supervisor', type: 'feedback', title: `Low rating on ${t.id}`, body: body.comment || t.subject, ticketId: t.id });
  res.json({ ticket: customerView(next, await loadContext(store)) });
});

/* ------------------------------------------------------- shared ticket ops */

api.get('/tickets/:id', requireAuth(), async (req, res) => {
  const store = await getStore();
  const ctx = await loadContext(store);
  const t = ctx.tickets.find((x) => x.id === req.params.id);
  if (!t || (req.user.role === 'customer' && t.customerId !== req.user.sub)) return fail(res, 404, 'Ticket not found');
  if (req.user.role === 'customer') return res.json({ ticket: customerView(t, ctx) });

  const history = ctx.tickets
    .filter((x) => x.customerId === t.customerId && x.id !== t.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 6)
    .map((x) => ({ id: x.id, subject: x.subject, status: x.status, createdAt: x.createdAt, band: x.triage.intakeBand }));
  const inc = t.incidentId ? ctx.incidentById[t.incidentId] : null;
  res.json({
    ticket: staffTicket(t, ctx),
    history,
    similar: similarResolved(t, ctx.tickets),
    experts: t.status === 'resolved' ? null : expertsFor(t, ctx),
    incident: inc ? { ...inc, openTickets: inc.ticketIds.filter((id) => ctx.tickets.find((x) => x.id === id)?.status !== 'resolved').length } : null,
  });
});

api.post('/tickets/:id/messages', requireAuth(), async (req, res) => {
  const { body } = MessageBody.parse(req.body);
  const store = await getStore();
  const t = await store.get('tickets', req.params.id);
  if (!t || (req.user.role === 'customer' && t.customerId !== req.user.sub)) return fail(res, 404, 'Ticket not found');

  const at = nowIso();
  const staff = req.user.role !== 'customer';
  const patch = {
    thread: [...t.thread, { id: newId(), author: staff ? 'agent' : 'customer', name: req.user.name, body, at }],
    events: [...t.events, { at, type: 'reply', by: req.user.name, text: staff ? 'Replied to customer' : 'Customer replied' }],
    updatedAt: at,
  };
  if (staff && !t.firstResponseAt) patch.firstResponseAt = at;
  if (staff && t.status === 'open') patch.status = 'in_progress';
  if (!staff && t.status === 'resolved') {
    patch.status = 'open'; patch.resolvedAt = null;
    patch.events.push({ at, type: 'status', by: t.customerName, text: 'Reopened by customer reply' });
  }
  const next = await store.update('tickets', t.id, patch);

  if (staff) await addNotification(store, { to: t.customerId, type: 'reply', title: `New reply on ${t.id}`, body: t.subject, ticketId: t.id });
  else await addNotification(store, { to: t.assigneeId || 'role:supervisor', type: 'reply', title: `Customer replied on ${t.id}`, body: body.slice(0, 120), ticketId: t.id });

  const ctx = await loadContext(store);
  res.json({ ticket: staff ? staffTicket(next, ctx) : customerView(next, ctx) });
});

/* --------------------------------------------------------- staff tickets */

api.get('/tickets', requireAuth(...STAFF), async (req, res) => {
  const store = await getStore();
  const ctx = await ctxWithIncidents(store);
  const { status = 'active', team, band, sentiment, q, sort = 'priority', assignee, sla, escalated, incident } = req.query;
  const me = req.user.sub;

  let rows = ctx.tickets.map((t) => enrich(t, ctx));
  if (status === 'active') rows = rows.filter((t) => t.status !== 'resolved');
  else if (status !== 'all') rows = rows.filter((t) => t.status === status);
  if (team) rows = rows.filter((t) => t.team === team);
  if (band) rows = rows.filter((t) => t.priority.band === band);
  if (sentiment) rows = rows.filter((t) => t.sentiment.label === sentiment);
  if (assignee === 'me') rows = rows.filter((t) => t.assigneeId === me);
  else if (assignee === 'unassigned') rows = rows.filter((t) => !t.assigneeId);
  else if (assignee) rows = rows.filter((t) => t.assigneeId === assignee);
  if (sla) rows = rows.filter((t) => t.sla.state === sla);
  if (escalated) rows = rows.filter((t) => t.escalation);
  if (incident) rows = rows.filter((t) => t.incidentId === incident);
  if (q) {
    const needle = String(q).toLowerCase();
    rows = rows.filter((t) => `${t.id} ${t.subject} ${t.message} ${t.customerName} ${t.customerEmail}`.toLowerCase().includes(needle));
  }
  sortQueue(rows, sort);

  const active = ctx.tickets.filter((t) => t.status !== 'resolved').map((t) => enrich(t, ctx));
  const count = (fn) => active.reduce((m, t) => { const k = fn(t); m[k] = (m[k] || 0) + 1; return m; }, {});
  res.json({
    tickets: rows.map(listItem),
    counts: {
      active: active.length,
      mine: active.filter((t) => t.assigneeId === me).length,
      unassigned: active.filter((t) => !t.assigneeId).length,
      escalated: active.filter((t) => t.escalation).length,
      breached: active.filter((t) => t.sla.state === 'breached').length,
      byTeam: count((t) => t.team),
      byBand: count((t) => t.priority.band),
      candidates: ctx.incidents.filter((i) => i.status === 'candidate').length,
    },
  });
});

api.patch('/tickets/:id', requireAuth(...STAFF), async (req, res) => {
  const body = PatchBody.parse(req.body);
  const store = await getStore();
  const t = await store.get('tickets', req.params.id);
  if (!t) return fail(res, 404, 'Ticket not found');
  const at = nowIso();
  const patch = { updatedAt: at, events: [...t.events] };

  if (body.status) {
    patch.status = body.status;
    if (t.status === 'resolved') { patch.resolvedAt = null; patch.events.push({ at, type: 'status', by: req.user.name, text: 'Reopened' }); }
    else patch.events.push({ at, type: 'status', by: req.user.name, text: `Status set to ${body.status.replace('_', ' ')}` });
  }
  if (body.team && body.team !== t.team) {
    patch.team = body.team;
    patch.events.push({ at, type: 'routed', by: req.user.name, text: `Moved from ${t.team} to ${body.team}` });
  }
  // Agent correction: the deck's answer to sarcasm and mixed emotion. The
  // intake is re-assessed from the corrected value and the change is logged
  // for Feedback & Learning.
  if (body.correction) {
    const { field, to } = body.correction;
    const text = `${t.subject}. ${t.message}`;
    const customer = { tier: t.customerTier };
    const from = field === 'category' ? t.classification.category : t.sentiment.label;
    if (from === to) return fail(res, 400, 'That is already the current value');
    if (field === 'category') {
      if (!CATEGORIES[to]) return fail(res, 400, 'Unknown category');
      patch.classification = { ...t.classification, category: to, label: CATEGORIES[to].label, confidence: 1, engine: 'agent', model: 'human correction', predicted: t.classification.category };
      patch.routing = routeTicket({ text, classification: patch.classification, priority: { band: t.triage.intakeBand }, customer });
      patch.team = patch.routing.team === 'Triage Review' ? 'Customer Care' : patch.routing.team;
    } else {
      if (!['negative', 'neutral', 'positive'].includes(to)) return fail(res, 400, 'Unknown sentiment');
      patch.sentiment = { ...t.sentiment, label: to, score: to === 'negative' ? -0.7 : to === 'positive' ? 0.6 : 0, confidence: 1, engine: 'agent', model: 'human correction', predicted: t.sentiment.label };
      patch.triage = assessIntake({ text, sentiment: patch.sentiment, customer, priorContacts: t.priorContacts });
    }
    patch.corrections = [...(t.corrections || []), { field, from, to, by: req.user.name, at }];
    patch.events.push({ at, type: 'correction', by: req.user.name, text: `Corrected ${field}: ${from} to ${to}` });
  }
  const next = await store.update('tickets', t.id, patch);
  res.json({ ticket: staffTicket(next, await loadContext(store)) });
});

api.post('/tickets/:id/notes', requireAuth(...STAFF), async (req, res) => {
  const { body } = NoteBody.parse(req.body);
  const store = await getStore();
  const t = await store.get('tickets', req.params.id);
  if (!t) return fail(res, 404, 'Ticket not found');
  const at = nowIso();
  const next = await store.update('tickets', t.id, {
    notes: [...(t.notes || []), { id: newId(), by: req.user.name, body, at }],
    events: [...t.events, { at, type: 'note', by: req.user.name, text: 'Added an internal note' }],
  });
  res.json({ ticket: staffTicket(next, await loadContext(store)) });
});

// Agents may take the top recommendation. Anything else is a supervisor
// override and needs a reason, which is logged on the ticket.
api.post('/tickets/:id/assign', requireAuth(...STAFF), async (req, res) => {
  const body = AssignBody.parse(req.body);
  const store = await getStore();
  const ctx = await loadContext(store);
  const t = ctx.tickets.find((x) => x.id === req.params.id);
  if (!t) return fail(res, 404, 'Ticket not found');
  if (t.status === 'resolved') return fail(res, 400, 'Ticket is already resolved');
  const agent = ctx.agents.find((a) => a.id === body.agentId);
  if (!agent) return fail(res, 404, 'Agent not found');

  const rec = expertsFor(t, ctx);
  const rank = rec.experts.findIndex((e) => e.agentId === agent.id) + 1;
  const isTop = rank === 1;
  const supervisor = req.user.role === 'supervisor';
  if (!isTop && !supervisor) return fail(res, 403, 'Only a supervisor can assign someone other than the top recommendation');
  if (!isTop && !body.reason) return fail(res, 400, 'An override needs a reason');

  const at = nowIso();
  const match = rec.experts[rank - 1];
  const assignment = { method: isTop ? 'recommended' : 'override', by: req.user.name, at, rank, score: match?.score ?? null, reason: body.reason || null };
  const next = await store.update('tickets', t.id, {
    assigneeId: agent.id, assigneeName: agent.name, assignment, updatedAt: at,
    events: [...t.events, { at, type: 'assigned', by: req.user.name,
      text: isTop ? `Assigned to ${agent.name} (top match, score ${match.score})` : `Override: assigned to ${agent.name} (rank ${rank}). Reason: ${body.reason}` }],
  });
  await addNotification(store, { to: agent.id, type: 'assignment', title: `${t.id} assigned to you`, body: t.subject, ticketId: t.id });
  await addNotification(store, { to: t.customerId, type: 'assigned', title: `${t.id} is with ${agent.name.split(' ')[0]}`, body: `Your request is now with our ${agent.team} team.`, ticketId: t.id });
  res.json({ ticket: staffTicket(next, await loadContext(store)) });
});

api.post('/tickets/:id/escalate', requireAuth(...STAFF), async (req, res) => {
  const body = EscalateBody.parse(req.body);
  const store = await getStore();
  const t = await store.get('tickets', req.params.id);
  if (!t) return fail(res, 404, 'Ticket not found');
  const at = nowIso();
  const next = await store.update('tickets', t.id, {
    escalation: { level: body.level, reason: body.reason, by: req.user.name, at, auto: false },
    events: [...t.events, { at, type: 'escalated', by: req.user.name, text: `Escalated to ${body.level}: ${body.reason}` }],
    updatedAt: at,
  });
  await addNotification(store, { to: 'role:supervisor', type: 'escalation', title: `${t.id} escalated to ${body.level}`, body: body.reason, ticketId: t.id });
  res.json({ ticket: staffTicket(next, await loadContext(store)) });
});

api.post('/tickets/:id/deescalate', requireAuth('supervisor'), async (req, res) => {
  const store = await getStore();
  const t = await store.get('tickets', req.params.id);
  if (!t) return fail(res, 404, 'Ticket not found');
  const at = nowIso();
  const next = await store.update('tickets', t.id, {
    escalation: { ...(t.escalation || { level: 'auto' }), cleared: true, clearedBy: req.user.name, clearedAt: at },
    events: [...t.events, { at, type: 'escalated', by: req.user.name, text: 'Escalation cleared' }],
  });
  res.json({ ticket: staffTicket(next, await loadContext(store)) });
});

api.post('/tickets/:id/resolve', requireAuth(...STAFF), async (req, res) => {
  const body = ResolveBody.parse(req.body);
  const store = await getStore();
  const t = await store.get('tickets', req.params.id);
  if (!t) return fail(res, 404, 'Ticket not found');
  const at = nowIso();
  const corrections = [...(t.corrections || [])];
  // Confirming a different category at resolution is also a correction.
  if (body.category !== t.classification.category) corrections.push({ field: 'category', from: t.classification.category, to: body.category, by: req.user.name, at, atResolution: true });
  const next = await store.update('tickets', t.id, {
    status: 'resolved', resolvedAt: at, updatedAt: at,
    firstResponseAt: t.firstResponseAt || at,
    resolution: { ...body, by: req.user.name, at },
    corrections,
    thread: [...t.thread, { id: newId(), author: 'agent', name: req.user.name, body: body.customerSummary, at }],
    events: [...t.events, { at, type: 'resolved', by: req.user.name, text: 'Resolved with summary' }],
  });
  await addNotification(store, { to: t.customerId, type: 'resolved', title: `${t.id} resolved`, body: 'Tell us how we did.', ticketId: t.id });
  res.json({ ticket: staffTicket(next, await loadContext(store)) });
});

/* ------------------------------------------------------------- dashboard */

api.get('/dashboard', requireAuth(...STAFF), async (req, res) => {
  const store = await getStore();
  const ctx = await ctxWithIncidents(store);
  const days = 7;
  const now = ctx.now;
  const all = ctx.tickets.map((t) => enrich(t, ctx));
  const active = all.filter((t) => t.status !== 'resolved');
  const inRange = (t, from, to) => { const a = Date.parse(t.createdAt); return a >= from && a < to; };
  const cur = all.filter((t) => inRange(t, now - days * 24 * HOUR, now + 1));
  const prev = all.filter((t) => inRange(t, now - 2 * days * 24 * HOUR, now - days * 24 * HOUR));
  const frt = (xs) => median(xs.filter((t) => t.firstResponseAt).map((t) => hours(t.createdAt, t.firstResponseAt)));
  const delta = (a, b) => (a == null || !b ? null : Math.round(((a - b) / b) * 100));

  const vol = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now - i * 24 * HOUR).toISOString().slice(0, 10);
    const row = { date: d, P1: 0, P2: 0, P3: 0, P4: 0 };
    for (const t of all) if (t.createdAt.slice(0, 10) === d) row[t.triage.intakeBand]++;
    vol.push(row);
  }
  const teams = Object.values(TEAMS).filter((x) => x !== 'Triage Review').map((team) => ({
    team, open: active.filter((t) => t.team === team).length,
    breached: active.filter((t) => t.team === team && t.sla.state === 'breached').length,
  })).sort((a, b) => b.open - a.open);

  const activity = [];
  for (const t of ctx.tickets) for (const e of t.events) if (now - Date.parse(e.at) < 24 * HOUR && e.type !== 'triaged') activity.push({ ...e, ticketId: t.id, subject: t.subject });
  for (const i of ctx.incidents) for (const h of i.history || []) if (now - Date.parse(h.at) < 24 * HOUR) activity.push({ at: h.at, type: 'incident', by: h.by, text: `${i.id} ${h.action}`, incidentId: i.id, subject: i.title });
  activity.sort((a, b) => b.at.localeCompare(a.at));

  const prevBreached = prev.filter((t) => t.status !== 'resolved' || (t.resolvedAt && t.sla.state === 'missed')).length;
  res.json({
    kpis: {
      active: active.length,
      critical: active.filter((t) => t.priority.band === 'P1').length,
      breached: active.filter((t) => t.sla.state === 'breached').length,
      dueSoon: active.filter((t) => t.sla.state === 'warning').length,
      unassigned: active.filter((t) => !t.assigneeId).length,
      newThisPeriod: cur.length, newDelta: delta(cur.length, prev.length),
      firstResponseH: frt(cur), firstResponseDelta: delta(frt(cur), frt(prev)),
      prevBreached,
    },
    volume: vol,
    teams,
    top: sortQueue(active, 'priority').slice(0, 7).map(listItem),
    activity: activity.slice(0, 14),
    incidents: ctx.incidents.filter((i) => ['candidate', 'confirmed'].includes(i.status)).map((i) => ({
      id: i.id, title: i.title, status: i.status, severity: i.severity, team: i.team, size: i.ticketIds.length, spike: { recent: i.spike.recent, ratio: i.spike.ratio, windowHours: i.spike.windowHours },
    })),
    mine: req.user.role === 'agent' ? sortQueue(active.filter((t) => t.assigneeId === req.user.sub), 'priority').slice(0, 5).map(listItem) : null,
  });
});

/* -------------------------------------------------------------- incidents */

api.get('/incidents', requireAuth(...STAFF), async (req, res) => {
  const store = await getStore();
  const ctx = await loadContext(store);
  const { groups } = await syncIncidents(store, ctx);
  const byId = Object.fromEntries(ctx.tickets.map((t) => [t.id, t]));
  const view = (i) => {
    const members = i.ticketIds.map((id) => byId[id]).filter(Boolean).map((t) => enrich(t, ctx));
    return {
      ...i,
      openTickets: members.filter((t) => t.status !== 'resolved').length,
      tickets: sortQueue(members, 'newest').map(listItem),
    };
  };
  res.json({
    incidents: ctx.incidents.sort((a, b) => (b.detectedAt || '').localeCompare(a.detectedAt || '')).map(view),
    groups: groups.map((g) => ({ ...g, tickets: g.ticketIds.map((id) => byId[id]).filter(Boolean).map((t) => listItem(enrich(t, ctx))) })),
  });
});

api.post('/incidents/:id/confirm', requireAuth('supervisor'), async (req, res) => {
  const body = IncidentDecision.parse(req.body);
  const store = await getStore();
  const ctx = await loadContext(store);
  const inc = ctx.incidentById[req.params.id];
  if (!inc) return fail(res, 404, 'Incident not found');
  if (inc.status !== 'candidate') return fail(res, 400, `Incident is already ${inc.status}`);
  const at = nowIso();
  const next = await store.update('incidents', inc.id, {
    status: 'confirmed', severity: body.severity || 'critical', confirmedAt: at, owner: req.user.name,
    history: [...inc.history, { at, by: req.user.name, action: 'confirmed', note: body.note || `Confirmed as ${body.severity || 'critical'}` }],
  });
  ctx.incidentById[inc.id] = next;
  const linked = await linkTickets(store, ctx, next);
  await addNotification(store, { to: 'role:agent', type: 'incident', title: `Incident ${inc.id} confirmed`, body: `${inc.title}. ${linked.length} tickets linked and prioritised.`, incidentId: inc.id });
  res.json({ incident: next, linked: linked.length });
});

api.post('/incidents/:id/dismiss', requireAuth('supervisor'), async (req, res) => {
  const body = IncidentDecision.parse(req.body);
  if (!body.note) return fail(res, 400, 'Say why this is not an incident, it trains the next review');
  const store = await getStore();
  const ctx = await loadContext(store);
  const inc = ctx.incidentById[req.params.id];
  if (!inc) return fail(res, 404, 'Incident not found');
  if (inc.status !== 'candidate') return fail(res, 400, `Incident is already ${inc.status}`);
  const at = nowIso();
  const next = await store.update('incidents', inc.id, {
    status: 'dismissed', dismissReason: body.note, dismissedAt: at,
    history: [...inc.history, { at, by: req.user.name, action: 'dismissed', note: body.note }],
  });
  // Untag tickets so the "possible incident" flag disappears.
  for (const id of inc.ticketIds) {
    const t = ctx.tickets.find((x) => x.id === id);
    if (t?.incidentId === inc.id) await store.update('tickets', id, { incidentId: null });
  }
  res.json({ incident: next });
});

api.post('/incidents/:id/resolve', requireAuth('supervisor'), async (req, res) => {
  const body = z.object({
    note: z.string().trim().min(10, 'Describe the root cause and fix').max(800),
    resolveTickets: z.boolean().default(true),
  }).parse(req.body);
  const store = await getStore();
  const ctx = await loadContext(store);
  const inc = ctx.incidentById[req.params.id];
  if (!inc) return fail(res, 404, 'Incident not found');
  if (inc.status !== 'confirmed') return fail(res, 400, 'Only a confirmed incident can be resolved');
  const at = nowIso();
  let closed = 0;
  if (body.resolveTickets) {
    for (const id of inc.ticketIds) {
      const t = ctx.tickets.find((x) => x.id === id);
      if (!t || t.status === 'resolved') continue;
      const summary = `The wider issue (${inc.title}) is now fixed. ${body.note} Please reply here if anything still looks wrong.`;
      await store.update('tickets', id, {
        status: 'resolved', resolvedAt: at, firstResponseAt: t.firstResponseAt || at, updatedAt: at,
        resolution: { rootCause: body.note, fix: `Resolved as part of incident ${inc.id}.`, customerSummary: summary, category: t.classification.category, by: req.user.name, at },
        thread: [...t.thread, { id: newId(), author: 'agent', name: req.user.name, body: summary, at }],
        events: [...t.events, { at, type: 'resolved', by: req.user.name, text: `Resolved with incident ${inc.id}` }],
      });
      await addNotification(store, { to: t.customerId, type: 'resolved', title: `${t.id} resolved`, body: 'The issue is fixed. Tell us how we did.', ticketId: t.id });
      closed++;
    }
  }
  const next = await store.update('incidents', inc.id, {
    status: 'resolved', resolvedAt: at, resolutionNote: body.note,
    history: [...inc.history, { at, by: req.user.name, action: 'resolved', note: `${body.note} (${closed} tickets closed)` }],
  });
  res.json({ incident: next, closed });
});

/* ------------------------------------------------- assignment & workload */

api.get('/assignment', requireAuth(...STAFF), async (req, res) => {
  const store = await getStore();
  const ctx = await ctxWithIncidents(store);
  const queue = sortQueue(ctx.tickets.filter((t) => t.status !== 'resolved' && !t.assigneeId).map((t) => enrich(t, ctx)), 'priority');
  res.json({
    unassigned: queue.map((t) => {
      const rec = expertsFor(t, ctx);
      return { ...listItem(t), neededSkills: rec.neededSkills, top: rec.experts.slice(0, 3).map(({ agentId, name, score, eligible, status }) => ({ agentId, name, score, eligible, status })) };
    }),
    overrides: ctx.tickets.filter((t) => t.assignment?.method === 'override').sort((a, b) => b.assignment.at.localeCompare(a.assignment.at)).slice(0, 10)
      .map((t) => ({ id: t.id, subject: t.subject, assignee: t.assigneeName, ...t.assignment })),
    team: workload(ctx),
  });
});

api.get('/tickets/:id/experts', requireAuth(...STAFF), async (req, res) => {
  const store = await getStore();
  const ctx = await loadContext(store);
  const t = ctx.tickets.find((x) => x.id === req.params.id);
  if (!t) return fail(res, 404, 'Ticket not found');
  res.json(expertsFor(t, ctx));
});

/* ------------------------------------------------------ SLA & escalations */

api.get('/sla', requireAuth(...STAFF), async (_req, res) => {
  const store = await getStore();
  const ctx = await loadContext(store);
  const all = ctx.tickets.map((t) => enrich(t, ctx));
  const active = all.filter((t) => t.status !== 'resolved');
  const bucket = (fn) => sortQueue(active.filter(fn), 'sla').map(listItem);
  const resolved14 = all.filter((t) => t.resolvedAt && ctx.now - Date.parse(t.resolvedAt) < 14 * 24 * HOUR);
  res.json({
    breached: bucket((t) => t.sla.state === 'breached'),
    dueHour: bucket((t) => t.sla.state !== 'breached' && t.sla.remainingMs <= HOUR),
    dueToday: bucket((t) => t.sla.state !== 'breached' && t.sla.remainingMs > HOUR && t.sla.remainingMs <= 24 * HOUR),
    onTrack: active.filter((t) => t.sla.remainingMs > 24 * HOUR).length,
    policy: SLA_POLICY,
    rules: ESCALATION_RULES.map((r) => ({
      ...r,
      firing: active.filter((t) => t.escalation?.rule === r.id || t.escalation?.others?.includes(r.id)).length
        + (r.id === 'R1' ? active.filter((t) => !t.assigneeId && t.sla.state === 'warning').length : 0),
    })),
    compliance: ['P1', 'P2', 'P3', 'P4'].map((b) => {
      const xs = resolved14.filter((t) => t.triage.intakeBand === b);
      return { band: b, resolved: xs.length, met: xs.filter((t) => t.sla.state === 'met').length };
    }),
  });
});

api.get('/escalations', requireAuth(...STAFF), async (_req, res) => {
  const store = await getStore();
  const ctx = await ctxWithIncidents(store);
  const rows = sortQueue(ctx.tickets.filter((t) => t.status !== 'resolved').map((t) => enrich(t, ctx)).filter((t) => t.escalation), 'priority');
  const recent = ctx.tickets.filter((t) => t.status === 'resolved' && t.escalation && !t.escalation.auto).slice(-5).map((t) => ({ id: t.id, subject: t.subject, level: t.escalation.level, resolvedAt: t.resolvedAt }));
  res.json({ tickets: rows.map(listItem), recent });
});

/* ------------------------------------------------------------- analytics */

api.get('/analytics', requireAuth(...STAFF), async (req, res) => {
  const days = [7, 14].includes(Number(req.query.days)) ? Number(req.query.days) : 14;
  const store = await getStore();
  const ctx = await loadContext(store);
  const now = ctx.now;
  const all = ctx.tickets.map((t) => enrich(t, ctx));
  const from = now - days * 24 * HOUR;
  const cur = all.filter((t) => Date.parse(t.createdAt) >= from);
  const prev = all.filter((t) => Date.parse(t.createdAt) >= from - days * 24 * HOUR && Date.parse(t.createdAt) < from);
  const resolved = (xs) => xs.filter((t) => t.resolvedAt);
  const csat = (xs) => { const r = xs.filter((t) => t.feedback).map((t) => t.feedback.rating); return r.length ? Number((r.reduce((s, x) => s + x, 0) / r.length).toFixed(2)) : null; };
  const slaRate = (xs) => { const r = resolved(xs); return r.length ? Math.round((r.filter((t) => t.sla.state === 'met').length / r.length) * 100) : null; };
  const res_h = (xs) => median(resolved(xs).map((t) => hours(t.createdAt, t.resolvedAt)));

  const teams = Object.values(TEAMS).filter((x) => x !== 'Triage Review');
  const daily = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now - i * 24 * HOUR).toISOString().slice(0, 10);
    const xs = all.filter((t) => t.createdAt.slice(0, 10) === d);
    const row = { date: d, total: xs.length, P1: 0, P2: 0, P3: 0, P4: 0, negative: 0, neutral: 0, positive: 0 };
    for (const t of xs) { row[t.triage.intakeBand]++; row[t.sentiment.label]++; }
    for (const team of teams) row[team] = xs.filter((t) => t.team === team).length;
    const r = all.filter((t) => t.resolvedAt?.slice(0, 10) === d);
    row.resolutionH = r.length ? Number(median(r.map((t) => hours(t.createdAt, t.resolvedAt))).toFixed(1)) : null;
    daily.push(row);
  }

  res.json({
    days,
    kpis: {
      total: cur.length, totalPrev: prev.length,
      resolutionH: res_h(cur), resolutionPrev: res_h(prev),
      firstResponseH: median(cur.filter((t) => t.firstResponseAt).map((t) => hours(t.createdAt, t.firstResponseAt))),
      slaCompliance: slaRate(cur), slaPrev: slaRate(prev),
      csat: csat(cur), csatPrev: csat(prev), csatResponses: cur.filter((t) => t.feedback).length,
      reopened: cur.filter((t) => t.events.some((e) => e.text === 'Reopened by customer reply' || e.text === 'Reopened')).length,
      incidents: ctx.incidents.filter((i) => i.status === 'confirmed' || i.status === 'resolved').length,
    },
    daily,
    teamsList: teams,
    bands: ['P1', 'P2', 'P3', 'P4'].map((b) => ({ band: b, count: cur.filter((t) => t.triage.intakeBand === b).length })),
    teamPerformance: teams.map((team) => {
      const xs = cur.filter((t) => t.team === team);
      return { team, open: xs.filter((t) => t.status !== 'resolved').length, resolved: resolved(xs).length, medianH: res_h(xs), sla: slaRate(xs), csat: csat(xs) };
    }),
    recurring: recurringIssues(cur),
  });
});

function recurringIssues(xs) {
  const GENERIC = new Set(['order', 'account', 'app', 'page', 'website', 'access', 'money', 'update', 'profile', 'information', 'price', 'paid', 'bill', 'charge', 'charged', 'late', 'down', 'slow', 'error', 'issue', 'problem', 'question', 'how to', 'how do i', 'thank you', 'hours', 'address', 'return', 'policy', 'pages']);
  const m = {};
  for (const t of xs) for (const p of t.classification.evidence || []) if (!GENERIC.has(p)) m[p] = (m[p] || 0) + 1;
  return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([phrase, count]) => ({ phrase, count }));
}

/* ---------------------------------------------------- feedback & learning */

api.get('/learning', requireAuth(...STAFF), async (_req, res) => {
  const store = await getStore();
  const ctx = await loadContext(store);
  const fb = ctx.tickets.filter((t) => t.feedback).sort((a, b) => b.feedback.at.localeCompare(a.feedback.at));
  const dist = [1, 2, 3, 4, 5].map((r) => ({ rating: r, count: fb.filter((t) => t.feedback.rating === r).length }));
  const corrections = ctx.tickets.flatMap((t) => (t.corrections || []).map((c) => ({ ...c, ticketId: t.id, subject: t.subject }))).sort((a, b) => b.at.localeCompare(a.at));
  const reviewed = ctx.tickets.filter((t) => t.status === 'resolved');
  res.json({
    csat: {
      responses: fb.length,
      average: fb.length ? Number((fb.reduce((s, t) => s + t.feedback.rating, 0) / fb.length).toFixed(2)) : null,
      responseRate: reviewed.length ? Math.round((fb.length / reviewed.length) * 100) : 0,
      distribution: dist,
      recent: fb.slice(0, 12).map((t) => ({ ticketId: t.id, subject: t.subject, customer: t.customerName, agent: t.assigneeName, ...t.feedback })),
    },
    corrections: {
      total: corrections.length,
      byField: { category: corrections.filter((c) => c.field === 'category').length, sentiment: corrections.filter((c) => c.field === 'sentiment').length },
      // Not an accuracy figure: agents do not review every prediction.
      reviewedTickets: reviewed.length,
      list: corrections.slice(0, 20),
    },
    evaluation: await evaluate(),
  });
});

api.get('/evalset', requireAuth(...STAFF), async (_req, res) => {
  const r = await evaluate();
  res.json({ rows: r.rows });
});

/* ------------------------------------------------------------ triage lab */

api.post('/analyze', requireAuth(...STAFF), async (req, res) => {
  const body = AnalyzeBody.parse(req.body);
  const t0 = Date.now();
  const r = await triage({ subject: body.subject, message: body.message, customer: { tier: body.tier }, priorContacts: body.priorContacts });
  const store = await getStore();
  const ctx = await loadContext(store);
  const draft = {
    id: '__lab__', subject: body.subject || 'Untitled', message: r.message, createdAt: new Date().toISOString(),
    team: r.routing.team === 'Triage Review' ? 'Customer Care' : r.routing.team, customerTier: body.tier,
    triage: r.triage, classification: r.classification, sentiment: r.sentiment, routing: r.routing, priorContacts: body.priorContacts,
    status: 'open', firstResponseAt: null, resolvedAt: null, thread: [], events: [],
  };
  const sim = enrich(draft, { ...ctx, tickets: ctx.tickets });
  res.json({
    ...r,
    priority: sim.priority, sla: sim.sla,
    similar: similarResolved(draft, [...ctx.tickets, draft]),
    experts: expertsFor(draft, { ...ctx, tickets: [...ctx.tickets, draft] }),
    totalMs: Date.now() - t0,
  });
});

/* ------------------------------------------------------------- demo reset */

api.post('/demo/reset', requireAuth('supervisor'), async (_req, res) => {
  const store = await getStore();
  await store.reseed();
  res.json({ ok: true, seededAt: store.seededAt });
});

/* ---------------------------------------------------------------- errors */

app.use('/api', api);
app.use('/api', (_req, res) => fail(res, 404, 'Not found'));

// Express 5 forwards rejected promises here, so routes need no try/catch.
app.use((err, _req, res, _next) => {
  if (err instanceof z.ZodError) {
    const first = err.issues[0];
    return res.status(400).json({ error: first?.message || 'Invalid input', field: first?.path?.join('.') });
  }
  if (err?.type === 'entity.parse.failed') return fail(res, 400, 'Malformed JSON');
  console.error(err);
  fail(res, 500, 'Something went wrong on our side');
});

export { fmtDur, EVAL_SET };
export default app;
