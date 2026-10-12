// Read-time computation shared by the routes. Live priority, SLA clocks,
// escalations and derived notifications are all functions of "now", so they
// are computed here on every request rather than stored and left to go stale.

import { livePriority, bandRank } from './ai/priority.js';
import { slaStatus, effectiveEscalation } from './sla.js';
import { buildIndex, ticketText } from './ai/similarity.js';
import { detectClusters, overlap } from './ai/incidents.js';
import { recommendExperts } from './ai/experts.js';
import { ARTICLES } from './ai/kb.js';

const HOUR = 3600e3;
export const articleById = Object.fromEntries(ARTICLES.map(({ keywords, ...a }) => [a.id, a]));

/* ---------------------------------------------------------------- context */

export async function loadContext(store) {
  const [tickets, incidents, users] = await Promise.all([store.all('tickets'), store.all('incidents'), store.all('users')]);
  const agents = users.filter((u) => u.role === 'agent').map(({ passwordHash, ...a }) => a);
  return {
    now: Date.now(),
    tickets,
    incidents,
    incidentById: Object.fromEntries(incidents.map((i) => [i.id, i])),
    agents,
    users,
  };
}

export function enrich(t, ctx) {
  const sla = slaStatus(t, ctx.now);
  const incident = t.incidentId ? ctx.incidentById[t.incidentId] : null;
  const priority = livePriority(t, { now: ctx.now, sla, incident });
  const escalation = effectiveEscalation(t, sla, incident);
  return {
    ...t,
    priority, sla, escalation,
    incident: incident ? { id: incident.id, title: incident.title, status: incident.status, severity: incident.severity } : null,
    flags: flagsFor(t, sla, escalation, incident, ctx.now),
  };
}

function flagsFor(t, sla, escalation, incident, now) {
  if (t.status === 'resolved') return [];
  const f = [];
  if (sla.state === 'breached') f.push({ key: 'sla', label: `SLA breached ${fmtDur(-sla.remainingMs)} ago` });
  else if (sla.state === 'warning') f.push({ key: 'sla-warn', label: `SLA due in ${fmtDur(sla.remainingMs)}` });
  if (escalation) f.push({ key: 'escalated', label: `Escalated ${escalation.level}${escalation.auto ? ` (rule ${escalation.rule})` : ''}` });
  if (incident?.status === 'confirmed') f.push({ key: 'incident', label: `Incident ${incident.id}` });
  else if (incident?.status === 'candidate') f.push({ key: 'candidate', label: `Possible incident ${incident.id}` });
  if (!t.assigneeId) f.push({ key: 'unassigned', label: 'Unassigned' });
  if (t.customerTier === 'enterprise') f.push({ key: 'enterprise', label: 'Enterprise' });
  return f;
}

export function sortQueue(rows, sort = 'priority') {
  const by = {
    priority: (a, b) => (b.priority.pinned - a.priority.pinned) || (b.priority.score - a.priority.score) || a.createdAt.localeCompare(b.createdAt),
    sla: (a, b) => a.sla.remainingMs - b.sla.remainingMs,
    newest: (a, b) => b.createdAt.localeCompare(a.createdAt),
    oldest: (a, b) => a.createdAt.localeCompare(b.createdAt),
  };
  return rows.sort(by[sort] || by.priority);
}

export function listItem(t) {
  const { thread, message, notes, events, triage, actions, articleIds, ...rest } = t;
  return { ...rest, snippet: message.slice(0, 160), messages: thread.length };
}

/* -------------------------------------------------------------- similarity */

export function similarResolved(ticket, tickets, limit = 4) {
  const index = buildIndex(tickets);
  return index
    .similar(index.vecs.get(ticket.id) || index.vectorize(ticketText(ticket)), {
      exclude: ticket.id, filter: (d) => d.status === 'resolved' && d.resolution, limit, min: 0.15,
    })
    .map(({ doc, score }) => ({
      id: doc.id, subject: doc.subject, similarity: Number(score.toFixed(2)),
      category: doc.classification.category, team: doc.team, resolvedBy: doc.resolution.by,
      rootCause: doc.resolution.rootCause, fix: doc.resolution.fix,
      hoursToResolve: Number(((Date.parse(doc.resolvedAt) - Date.parse(doc.createdAt)) / HOUR).toFixed(1)),
      rating: doc.feedback?.rating ?? null,
    }));
}

/* ----------------------------------------------------------------- experts */

export function expertsFor(ticket, ctx) {
  const openLoad = {};
  for (const t of ctx.tickets) if (t.status !== 'resolved' && t.assigneeId) openLoad[t.assigneeId] = (openLoad[t.assigneeId] || 0) + 1;

  // Experience: who resolved the tickets most similar to this one.
  const index = buildIndex(ctx.tickets);
  const vec = index.vecs.get(ticket.id) || index.vectorize(ticketText(ticket));
  const experience = {};
  for (const { doc } of index.similar(vec, { exclude: ticket.id, filter: (d) => d.status === 'resolved' && d.assigneeId, limit: 12, min: 0.2 })) {
    experience[doc.assigneeId] = (experience[doc.assigneeId] || 0) + 1;
  }
  return recommendExperts(ticket, ctx.agents, { openLoad, experience });
}

export function workload(ctx) {
  return ctx.agents.map((a) => {
    const mine = ctx.tickets.filter((t) => t.assigneeId === a.id);
    const open = mine.filter((t) => t.status !== 'resolved').map((t) => enrich(t, ctx));
    const resolved7 = mine.filter((t) => t.resolvedAt && ctx.now - Date.parse(t.resolvedAt) < 7 * 24 * HOUR);
    const ratings = mine.filter((t) => t.feedback).map((t) => t.feedback.rating);
    return {
      ...a,
      open: open.length,
      p1: open.filter((t) => t.priority.band === 'P1').length,
      breached: open.filter((t) => t.sla.state === 'breached').length,
      resolved7: resolved7.length,
      csat: ratings.length ? Number((ratings.reduce((s, r) => s + r, 0) / ratings.length).toFixed(1)) : null,
    };
  });
}

/* --------------------------------------------------------------- incidents */

// Runs detection and reconciles it with stored incidents. Writes happen here
// (new candidates, ticket links), which is acceptable for a prototype and
// avoids needing a background job on serverless hosting.
export async function syncIncidents(store, ctx) {
  const clusters = detectClusters(ctx.tickets, ctx.now);
  const groups = [];
  const changed = [];

  for (const c of clusters) {
    // A resolved incident's tickets stay in the 3h window for a while. Without this the
    // same spike is re-detected as a fresh candidate the moment it is resolved.
    const done = ctx.incidents.find((i) => i.status === 'resolved' && overlap(i.ticketIds, c.ticketIds) >= 0.4);
    if (done) {
      const since = Date.parse(done.resolvedAt || 0);
      const fresh = c.ticketIds.filter((id) => !done.ticketIds.includes(id) && Date.parse(ctx.tickets.find((t) => t.id === id)?.createdAt) > since);
      if (fresh.length < 4) continue;
    }
    const match = ctx.incidents.find((i) => i.status !== 'resolved' && overlap(i.ticketIds, c.ticketIds) >= 0.4);
    if (!c.spike.isSpike) {
      if (!match) groups.push({ ...c, status: 'normal' });
      continue;
    }
    if (match) {
      if (match.status === 'dismissed') continue;
      const ticketIds = [...new Set([...match.ticketIds, ...c.ticketIds])];
      const next = await store.update('incidents', match.id, { ticketIds, spike: c.spike, keywords: c.keywords, customers: c.customers });
      Object.assign(match, next);
      if (match.status === 'confirmed') changed.push(...await linkTickets(store, ctx, match));
      else {
        for (const id of c.ticketIds) {
          const t = ctx.tickets.find((x) => x.id === id);
          if (t && !t.incidentId) { t.incidentId = match.id; await store.update('tickets', t.id, { incidentId: match.id }); }
        }
      }
    } else {
      const n = await store.seq('incident');
      const inc = {
        id: `INC-${n}`, title: c.title, status: 'candidate', severity: null,
        category: c.category, team: c.team, ticketIds: c.ticketIds, keywords: c.keywords,
        detectedAt: new Date(ctx.now).toISOString(), firstReportedAt: c.firstReportedAt, customers: c.customers,
        spike: c.spike,
        history: [{ at: new Date(ctx.now).toISOString(), by: 'SmartResolve', action: 'detected',
          note: `${c.spike.recent} similar complaints in ${c.spike.windowHours}h, ${c.spike.ratio}x the usual rate` }],
      };
      await store.insert('incidents', inc);
      ctx.incidents.push(inc);
      ctx.incidentById[inc.id] = inc;
      // Tag member tickets so agents see "possible incident" without any score change.
      for (const id of inc.ticketIds) {
        const t = ctx.tickets.find((x) => x.id === id);
        if (t && !t.incidentId) { t.incidentId = inc.id; await store.update('tickets', t.id, { incidentId: inc.id }); }
      }
      await store.insert('notifications', {
        id: `n-${Date.now()}-${n}`, to: 'role:supervisor', type: 'incident',
        title: `Possible incident ${inc.id}`, body: `${c.title}: ${c.spike.recent} complaints in ${c.spike.windowHours}h`,
        at: inc.detectedAt, ticketId: null, incidentId: inc.id, read: false,
      });
    }
  }
  return { groups, changed };
}

export async function linkTickets(store, ctx, inc) {
  const linked = [];
  for (const id of inc.ticketIds) {
    const t = ctx.tickets.find((x) => x.id === id);
    if (!t || t.status === 'resolved' || (t.incidentId === inc.id && t.incidentLinkedAt)) continue;
    const at = new Date(ctx.now).toISOString();
    const patch = {
      incidentId: inc.id, incidentLinkedAt: at,
      events: [...t.events, { at, type: 'incident', by: 'SmartResolve', text: `Linked to confirmed incident ${inc.id}` }],
      thread: [...t.thread, { id: `sys-${inc.id}`, author: 'system', name: 'SmartResolve', at,
        body: `We have identified a wider issue affecting several customers (${inc.title}). Our ${inc.team} team is working on it and we will update you here.` }],
    };
    Object.assign(t, await store.update('tickets', t.id, patch));
    linked.push(t.id);
    await store.insert('notifications', {
      id: `n-${Date.now()}-${t.id}`, to: t.customerId, type: 'incident', title: `Known issue on ${t.id}`,
      body: 'We are aware of a wider issue and are working on it.', at, ticketId: t.id, read: false,
    });
  }
  return linked;
}

/* ----------------------------------------------------------- notifications */

export async function notificationsFor(store, user, ctx) {
  const [stored, readsDoc] = await Promise.all([store.all('notifications'), store.get('reads', user.id)]);
  const read = new Set(readsDoc?.ids || []);
  const role = `role:${user.role}`;
  const mine = stored.filter((n) => n.to === user.id || n.to === role);

  // SLA warnings are derived from time, never stored.
  const derived = [];
  if (user.role !== 'customer') {
    for (const t of ctx.tickets) {
      if (t.status === 'resolved') continue;
      const relevant = user.role === 'supervisor' ? true : t.assigneeId === user.id;
      if (!relevant) continue;
      const sla = slaStatus(t, ctx.now);
      if (sla.state === 'breached' && (user.role === 'agent' || bandRank(t.triage.intakeBand) <= 2)) {
        derived.push({ id: `sla-breach:${t.id}`, type: 'sla', title: `SLA breached on ${t.id}`, body: `${t.subject} (${sla.clockLabel.toLowerCase()} target)`, at: sla.dueAt, ticketId: t.id });
      } else if (sla.state === 'warning' && (user.role === 'agent' || !t.assigneeId)) {
        const at = new Date(Date.parse(sla.dueAt) - (1 - 0.75) * (Date.parse(sla.dueAt) - Date.parse(t.createdAt))).toISOString();
        derived.push({ id: `sla-warn:${t.id}`, type: 'sla-warning', title: `SLA due soon on ${t.id}`, body: `${t.subject}${t.assigneeId ? '' : ' (unassigned)'}`, at, ticketId: t.id });
      }
    }
  }

  return [...mine, ...derived]
    .map((n) => ({ ...n, read: read.has(n.id) || Boolean(n.read) }))
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 60);
}

export function fmtDur(ms) {
  const m = Math.round(Math.abs(ms) / 60000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ${m % 60}m`;
  return `${Math.round(h / 24)}d`;
}
