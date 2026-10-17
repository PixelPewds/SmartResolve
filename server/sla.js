// SLA policy and escalation rules.
//
// Clocks are computed from timestamps on every read, so there is no
// background job. On Vercel that matters: serverless functions do not run
// between requests, and a cron would add a moving part to a prototype.

const MIN = 60e3;
const HOUR = 3600e3;

// Targets are set by the INTAKE band, which is fixed when the ticket arrives.
export const SLA_POLICY = {
  P1: { label: 'Critical', firstResponseMin: 15, resolveHours: 4 },
  P2: { label: 'High', firstResponseMin: 60, resolveHours: 8 },
  P3: { label: 'Medium', firstResponseMin: 240, resolveHours: 24 },
  P4: { label: 'Low', firstResponseMin: 480, resolveHours: 72 },
};

export const WARNING_AT = 0.75;

export const ESCALATION_RULES = [
  { id: 'R1', trigger: '75% of the SLA time used and still unassigned', action: 'Warn the supervisor', level: null },
  { id: 'R2', trigger: 'Any SLA target breached', action: 'Auto-escalate to L2 and notify the supervisor', level: 'L2' },
  { id: 'R3', trigger: 'Customer has contacted us 3 or more times in 7 days', action: 'Escalate to L1 (senior agent)', level: 'L1' },
  { id: 'R4', trigger: 'Ticket linked to a confirmed critical incident', action: 'Escalate to L2, incident owner handles it', level: 'L2' },
  { id: 'R5', trigger: 'Security or fraud signal', action: 'Escalate to L2 in Account & Security immediately', level: 'L2' },
  { id: 'R6', trigger: "Customer's frustration rises across their messages (confident reading)", action: 'Escalate to L1 (senior agent); an uncertain reading is flagged for review instead', level: 'L1' },
];

function clock(start, targetMs, doneAt, now) {
  const due = start + targetMs;
  const end = doneAt ? Date.parse(doneAt) : now;
  const used = (end - start) / targetMs;
  return {
    dueAt: new Date(due).toISOString(),
    remainingMs: due - now,
    pctUsed: Math.max(0, used),
    state: doneAt ? (end <= due ? 'met' : 'missed') : now > due ? 'breached' : used >= WARNING_AT ? 'warning' : 'ok',
  };
}

export function slaStatus(ticket, now = Date.now()) {
  const p = SLA_POLICY[ticket.triage.intakeBand];
  const start = Date.parse(ticket.createdAt);
  const firstResponse = clock(start, p.firstResponseMin * MIN, ticket.firstResponseAt, now);
  const resolution = clock(start, p.resolveHours * HOUR, ticket.resolvedAt, now);

  // The active clock is whichever target is still open: first response until
  // someone replies, then resolution.
  let active;
  let clockLabel;
  if (ticket.resolvedAt) { active = resolution; clockLabel = 'Resolution'; }
  else if (!ticket.firstResponseAt) { active = firstResponse; clockLabel = 'First response'; }
  else { active = resolution; clockLabel = 'Resolution'; }

  const state = ticket.resolvedAt
    ? (resolution.state === 'met' ? 'met' : 'missed')
    : firstResponse.state === 'breached' || resolution.state === 'breached' ? 'breached'
    : active.state;

  return {
    policy: { band: ticket.triage.intakeBand, ...p },
    firstResponse, resolution,
    clockLabel, dueAt: active.dueAt, remainingMs: active.remainingMs, pctUsed: active.pctUsed,
    state,
  };
}

// Returns the escalation that applies right now: a manual one if an agent
// raised it, otherwise the highest automatic rule that fires.
export function effectiveEscalation(ticket, sla, incident, trend) {
  if (ticket.status === 'resolved') return ticket.escalation || null;
  if (ticket.escalation && !ticket.escalation.cleared) return { ...ticket.escalation, auto: false };

  const auto = [];
  if (sla.state === 'breached') auto.push({ rule: 'R2', level: 'L2', reason: `${sla.clockLabel} SLA breached` });
  if (incident?.status === 'confirmed' && incident.severity === 'critical') auto.push({ rule: 'R4', level: 'L2', reason: `Linked to confirmed incident ${incident.id}` });
  if (ticket.routing?.rule === 'security-override') auto.push({ rule: 'R5', level: 'L2', reason: 'Security or fraud signal' });
  if (ticket.priorContacts >= 3) auto.push({ rule: 'R3', level: 'L1', reason: `Customer contacted us ${ticket.priorContacts + 1} times this week` });
  if (trend?.escalate) auto.push({ rule: 'R6', level: 'L1', reason: `Frustration rising: ${trend.points[0].emotion} to ${trend.latest.emotion} over ${trend.messages} messages` });
  if (!auto.length) return null;
  const top = auto.sort((a, b) => (a.level === 'L2' ? -1 : 1) - (b.level === 'L2' ? -1 : 1))[0];
  return { ...top, auto: true, others: auto.slice(1).map((a) => a.rule) };
}
