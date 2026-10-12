import { useState } from 'react';
import { Link, useOutletContext, useParams } from 'react-router-dom';
import {
  ArrowLeft, Warning, BookOpenText, ShieldCheck, UserPlus, ArrowFatLinesUp, CheckCircle, Siren, Paperclip,
  ListChecks, ChatsCircle, Sparkle, Copy, ClockCounterClockwise, NotePencil, Seal, Tray, Star, PencilSimple, ArrowsLeftRight,
} from '@phosphor-icons/react';
import { Band, StatusPill, Skeleton, ErrorNote, Tier, Button, Empty } from '../../components/ui.jsx';
import { Page, Tabs, Dialog, SlaClock, Avatar, Sim, Field, toast } from '../../components/kit.jsx';
import { ScoreBreakdown, SentimentCard, CategoryCard, RoutingCard, UrgencyCard, ExpertCard } from '../../components/Triage.jsx';
import { Thread, Composer } from '../../components/Thread.jsx';
import { api, useApi, timeAgo, fmtDateTime } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';

const TEAMS = ['Technical Support', 'Billing', 'Logistics', 'Account & Security', 'Customer Care'];
const CATEGORIES = [['billing', 'Billing & Payments'], ['technical', 'Technical Support'], ['delivery', 'Delivery & Orders'], ['account', 'Account Access'], ['general', 'General Enquiry']];
const EVENT_ICON = { created: Tray, triaged: Sparkle, assigned: UserPlus, reply: ChatsCircle, escalated: ArrowFatLinesUp, resolved: CheckCircle, feedback: Star, correction: PencilSimple, note: NotePencil, routed: ArrowsLeftRight, incident: Siren, status: ArrowsLeftRight };

const SHOWN_FLAG = (f) => !['unassigned', 'enterprise', 'incident', 'candidate'].includes(f.key);

export default function TicketDetail() {
  const { id } = useParams();
  const outlet = useOutletContext();
  const { user } = useAuth();
  const { data, error, loading, reload, setData } = useApi(`/tickets/${id}`);
  const [tab, setTab] = useState('conversation');
  const [saving, setSaving] = useState(null);
  const [actErr, setActErr] = useState(null);
  const [prefill, setPrefill] = useState(null);
  const [dialog, setDialog] = useState(null);
  const t = data?.ticket;
  const supervisor = user.role === 'supervisor';

  async function act(path, body, key, msg, method = 'POST') {
    setSaving(key); setActErr(null);
    try {
      const r = await api(`/tickets/${id}${path}`, { method, body });
      if (r.ticket) setData((d) => ({ ...d, ticket: r.ticket }));
      outlet?.refreshCounts?.();
      if (msg) toast(msg);
      // Assignment and resolution change recommendations and similar tickets.
      if (['assign', 'resolve'].includes(key)) reload();
      return true;
    } catch (err) { setActErr(err); return false; } finally { setSaving(null); }
  }

  if (loading && !data) return <Page><Skeleton className="h-5 w-40" /><Skeleton className="mt-4 h-9 w-2/3" /><div className="mt-6 grid gap-6 xl:grid-cols-[1fr_380px]"><Skeleton className="h-96" /><Skeleton className="h-96" /></div></Page>;
  if (error) return <Page><ErrorNote error={error} onRetry={reload} /></Page>;
  if (!t) return null;

  const resolved = t.status === 'resolved';
  const corrected = (field) => t.corrections?.filter((c) => c.field === field).at(-1);
  const first = t.customerName.split(' ')[0];

  const tabs = [
    { value: 'conversation', label: 'Conversation', icon: ChatsCircle, count: t.thread.length },
    { value: 'insights', label: 'AI insights', icon: Sparkle },
    { value: 'similar', label: 'Similar tickets', icon: Copy, count: data.similar.length },
    { value: 'timeline', label: 'Timeline', icon: ClockCounterClockwise, count: t.events.length },
    { value: 'notes', label: 'Internal notes', icon: NotePencil, count: t.notes?.length || 0 },
    { value: 'resolution', label: 'Resolution', icon: Seal },
  ];

  return (
    <Page>
      <Link to="/agent/tickets" className="inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-ink"><ArrowLeft size={14} /> All tickets</Link>

      {/* Header */}
      <header className="mt-4 flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
        {/* 320px basis so the action buttons wrap below the title on phones instead of crushing it. */}
        <div className="min-w-0 flex-[1_1_320px]">
          <div className="flex flex-wrap items-center gap-2">
            <Band band={t.priority.band} withLabel />
            <span className="font-mono text-[12px] text-muted">{t.id}</span>
            <StatusPill status={t.status} />
            {t.priority.pinned && <span className="rounded bg-p1-bg px-1.5 py-0.5 text-[11px] font-medium text-p1">Pinned</span>}
          </div>
          <h1 className="mt-2 text-[22px] font-semibold leading-tight tracking-tight sm:text-[26px]">{t.subject}</h1>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted">
            <span className="font-medium text-ink-2">{t.customerName}</span><Tier tier={t.customerTier} />
            <span className="break-all">{t.customerEmail}</span><span>via {t.channel}, opened {timeAgo(t.createdAt)}</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!resolved && <Button size="sm" variant="secondary" onClick={() => setDialog('assign')}><UserPlus size={15} /> {t.assigneeId ? 'Reassign' : 'Assign'}</Button>}
          {!resolved && <Button size="sm" variant="secondary" onClick={() => setDialog('escalate')}><ArrowFatLinesUp size={15} /> Escalate</Button>}
          {resolved
            ? <Button size="sm" variant="secondary" loading={saving === 'status'} onClick={() => act('', { status: 'open' }, 'status', 'Ticket reopened', 'PATCH')}>Reopen</Button>
            : <Button size="sm" onClick={() => setTab('resolution')}><CheckCircle size={15} /> Resolve</Button>}
        </div>
      </header>

      {/* Status strip */}
      <div className="panel mt-5 grid grid-cols-2 divide-line sm:grid-cols-4 [&>*]:border-line [&>*:not(:last-child)]:border-r max-sm:[&>*:nth-child(2)]:border-r-0 max-sm:[&>*:nth-child(-n+2)]:border-b">
        <Strip label="Owner">
          {t.assigneeName
            ? <span className="flex items-center gap-2"><Avatar name={t.assigneeName} size={22} /><span className="truncate">{t.assigneeName}</span></span>
            : <button type="button" onClick={() => setDialog('assign')} className="text-p2 hover:underline">Unassigned, assign now</button>}
          {t.assignment?.method === 'override' && <span className="mt-0.5 block text-[11px] text-muted">Supervisor override</span>}
        </Strip>
        <Strip label="Department">
          <select aria-label="Department" value={t.team} disabled={saving === 'team' || resolved} onChange={(e) => act('', { team: e.target.value }, 'team', `Moved to ${e.target.value}`, 'PATCH')}
            className="-ml-1 w-full cursor-pointer truncate rounded bg-transparent py-0.5 font-medium hover:bg-sunken focus:outline-none">
            {TEAMS.map((x) => <option key={x}>{x}</option>)}
          </select>
        </Strip>
        <Strip label={resolved ? 'SLA outcome' : `SLA (${t.sla.clockLabel.toLowerCase()})`}><SlaClock sla={t.sla} /></Strip>
        <Strip label="Escalation">
          {t.escalation
            ? <span className="text-p1">{t.escalation.level}{t.escalation.auto ? ` · rule ${t.escalation.rule}` : ''}</span>
            : <span className="text-muted">None</span>}
        </Strip>
      </div>

      {actErr && <div className="mt-4"><ErrorNote error={actErr} /></div>}

      {/* Incident flags are covered by the IncidentNote banner below. */}
      {t.flags.some((f) => SHOWN_FLAG(f)) && (
        <div className="mt-4 flex flex-wrap gap-2">
          {t.flags.filter(SHOWN_FLAG).map((f) => (
            <span key={f.key} className="inline-flex items-center gap-1.5 rounded-md border border-p1/25 bg-p1-bg px-2.5 py-1 text-[12px] font-medium text-p1"><Warning size={13} weight="bold" /> {f.label}</span>
          ))}
        </div>
      )}

      {data.incident && <IncidentNote inc={data.incident} />}

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0">
          <Tabs value={tab} onChange={setTab} items={tabs} />
          <div className="mt-4">
            {tab === 'conversation' && (
              <div className="space-y-4">
                <section className="panel p-5">
                  <Thread thread={t.thread} viewer="agent" />
                  {(t.attachments?.length > 0 || t.redactions?.length > 0) && (
                    <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 border-t border-line pt-4 text-xs text-muted">
                      {t.attachments?.map((a) => <span key={a.name} className="inline-flex items-center gap-1.5"><Paperclip size={13} /> {a.name} <Sim title="File names only. Files are not uploaded or stored in this prototype.">not stored</Sim></span>)}
                      {t.redactions?.length > 0 && <span className="inline-flex items-center gap-1.5"><ShieldCheck size={14} /> Redacted before storage: {[...new Set(t.redactions)].join(', ')}</span>}
                    </div>
                  )}
                </section>
                {!resolved && (
                  <section className="panel p-5">
                    <h2 className="text-sm font-semibold">Reply to {first}</h2>
                    <div className="mt-3">
                      <Composer ticketId={t.id} placeholder="Write a reply. Replying moves an open ticket to In progress." prefill={prefill} onPrefillUsed={() => setPrefill(null)}
                        onSent={(ticket) => { setData((d) => ({ ...d, ticket })); outlet?.refreshCounts?.(); toast('Reply sent'); }} />
                    </div>
                  </section>
                )}
              </div>
            )}

            {tab === 'insights' && (
              <div className="space-y-4">
                <div className="panel grid divide-line sm:grid-cols-2 [&>*]:p-5 [&>*]:border-line sm:[&>*:nth-child(odd)]:border-r [&>*:nth-child(-n+2)]:border-b max-sm:[&>*]:border-b">
                  <CategoryCard classification={t.classification}>
                    <Correction label="Wrong category?" value={t.classification.category} options={CATEGORIES} saving={saving === 'category'} last={corrected('category')}
                      onChange={(to) => act('', { correction: { field: 'category', to } }, 'category', 'Category corrected, ticket re-routed', 'PATCH')} />
                    {t.customerCategory && t.customerCategory !== t.classification.category && (
                      <p className="mt-2 text-xs text-p2">Customer chose {CATEGORIES.find(([k]) => k === t.customerCategory)?.[1]}.</p>
                    )}
                  </CategoryCard>
                  <SentimentCard sentiment={t.sentiment}>
                    <Correction label="Wrong sentiment?" value={t.sentiment.label} options={[['negative', 'Negative'], ['neutral', 'Neutral'], ['positive', 'Positive']]} saving={saving === 'sentiment'} last={corrected('sentiment')}
                      onChange={(to) => act('', { correction: { field: 'sentiment', to } }, 'sentiment', 'Sentiment corrected, priority recalculated', 'PATCH')} />
                  </SentimentCard>
                  <UrgencyCard urgency={t.triage.urgency} />
                  <RoutingCard routing={t.routing} team={t.team} />
                </div>
                <section className="panel p-5">
                  <h2 className="flex items-center gap-2 text-sm font-semibold"><ListChecks size={16} /> Recommended actions</h2>
                  <ol className="mt-3 space-y-2">
                    {(t.actions || []).map((a, i) => (
                      <li key={a} className="flex gap-3 text-[13.5px]"><span className="num grid size-5 shrink-0 place-items-center rounded-full bg-sunken font-mono text-[10.5px]">{i + 1}</span><span className="text-ink-2">{a}</span></li>
                    ))}
                  </ol>
                  <p className="mt-3 text-[11.5px] text-muted">Rule-based suggestions by category and severity.</p>
                </section>
                {t.articles?.length > 0 && (
                  <section className="panel">
                    <h2 className="flex items-center gap-2 border-b border-line px-5 py-3.5 text-sm font-semibold"><BookOpenText size={16} /> Knowledge base</h2>
                    <ul className="divide-y divide-line">
                      {t.articles.map((a) => (
                        <li key={a.id} className="flex flex-col gap-3 px-5 py-3.5 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0"><p className="text-[14px] font-medium">{a.title}</p><p className="mt-0.5 text-[13px] text-muted">{a.summary}</p></div>
                          {!resolved && <Button size="sm" variant="secondary" onClick={() => { setPrefill(`Hi ${first},\n\n${a.summary}\n\n${a.steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}\n\nLet me know if that sorts it.`); setTab('conversation'); }}>Use in reply</Button>}
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
              </div>
            )}

            {tab === 'similar' && (
              <section className="panel">
                <div className="border-b border-line px-5 py-3.5">
                  <h2 className="text-sm font-semibold">Similar resolved tickets</h2>
                  <p className="mt-0.5 text-xs text-muted">TF-IDF text similarity over all resolved tickets, computed live. Use a past fix as a starting point.</p>
                </div>
                {data.similar.length === 0 && <Empty icon={Copy} title="No close matches" hint="Nothing resolved before looks enough like this one." />}
                <ul className="divide-y divide-line">
                  {data.similar.map((s) => (
                    <li key={s.id} className="px-5 py-4">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <Link to={`/agent/tickets/${s.id}`} className="text-[14px] font-medium hover:underline">{s.subject}</Link>
                        <span className="num font-mono text-[12px] text-muted">{Math.round(s.similarity * 100)}% similar</span>
                      </div>
                      <p className="mt-0.5 font-mono text-[11px] text-muted">{s.id} &middot; {s.team} &middot; resolved by {s.resolvedBy} in {s.hoursToResolve}h{s.rating ? ` · rated ${s.rating}/5` : ''}</p>
                      <dl className="mt-2.5 grid gap-2 text-[13px] sm:grid-cols-2">
                        <div><dt className="text-[11px] font-medium uppercase tracking-wide text-muted">Root cause</dt><dd className="mt-0.5 text-ink-2">{s.rootCause}</dd></div>
                        <div><dt className="text-[11px] font-medium uppercase tracking-wide text-muted">Fix</dt><dd className="mt-0.5 text-ink-2">{s.fix}</dd></div>
                      </dl>
                      {!resolved && <button type="button" onClick={() => { setDialog({ prefill: s }); setTab('resolution'); }} className="mt-2.5 text-[12.5px] font-medium text-ink-2 hover:underline">Use as resolution draft</button>}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {tab === 'timeline' && (
              <section className="panel p-5">
                <ol className="relative space-y-4 before:absolute before:bottom-2 before:left-[11px] before:top-2 before:w-px before:bg-line">
                  {[...t.events].reverse().map((e, i) => {
                    const Icon = EVENT_ICON[e.type] || Tray;
                    return (
                      <li key={i} className="relative flex gap-3">
                        <span className="z-10 grid size-6 shrink-0 place-items-center rounded-full bg-surface ring-1 ring-line"><Icon size={12} className={e.type === 'escalated' || e.type === 'incident' ? 'text-p1' : 'text-ink-2'} /></span>
                        <div className="min-w-0 pt-0.5">
                          <p className="text-[13px]"><span className="font-medium">{e.by}</span> <span className="text-ink-2">{e.text}</span></p>
                          <p className="font-mono text-[11px] text-muted">{fmtDateTime(e.at)}</p>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </section>
            )}

            {tab === 'notes' && <Notes t={t} saving={saving === 'note'} onAdd={(body) => act('/notes', { body }, 'note', 'Note added')} />}

            {tab === 'resolution' && (
              resolved ? <ResolutionSummary t={t} /> : (
                <ResolveForm t={t} draft={dialog?.prefill} saving={saving === 'resolve'} error={actErr}
                  onResolve={async (body) => { if (await act('/resolve', body, 'resolve', 'Resolved. The customer has been asked for feedback.')) { setDialog(null); setTab('conversation'); } }} />
              )
            )}
          </div>
        </div>

        <aside className="space-y-4 xl:sticky xl:top-20 xl:self-start">
          <section className="panel p-5"><ScoreBreakdown priority={t.priority} compact /></section>
          {data.history?.length > 0 && (
            <section className="panel">
              <h2 className="border-b border-line px-5 py-3 text-[13px] font-semibold">Earlier from {first}</h2>
              <ul className="divide-y divide-line">
                {data.history.map((h) => (
                  <li key={h.id}><Link to={`/agent/tickets/${h.id}`} className="flex items-center gap-3 px-5 py-2.5 hover:bg-sunken">
                    <Band band={h.band} /><span className="min-w-0 flex-1 truncate text-[13px]">{h.subject}</span><span className="font-mono text-[11px] text-muted">{timeAgo(h.createdAt)}</span>
                  </Link></li>
                ))}
              </ul>
            </section>
          )}
        </aside>
      </div>

      <AssignDialog open={dialog === 'assign'} onClose={() => setDialog(null)} experts={data.experts} current={t.assigneeId} supervisor={supervisor} saving={saving === 'assign'}
        onAssign={async (agentId, reason) => { if (await act('/assign', { agentId, reason }, 'assign', 'Assigned')) setDialog(null); }} />
      <EscalateDialog open={dialog === 'escalate'} onClose={() => setDialog(null)} saving={saving === 'escalate'} current={t.escalation}
        onEscalate={async (body) => { if (await act('/escalate', body, 'escalate', `Escalated to ${body.level}`)) setDialog(null); }}
        onClear={supervisor && t.escalation ? async () => { if (await act('/deescalate', {}, 'escalate', 'Escalation cleared')) setDialog(null); } : null} />
    </Page>
  );
}

function Strip({ label, children }) {
  return <div className="min-w-0 px-4 py-3"><p className="text-[11px] text-muted">{label}</p><div className="mt-1 truncate text-[13px] font-medium">{children}</div></div>;
}

function IncidentNote({ inc }) {
  const confirmed = inc.status === 'confirmed';
  return (
    <Link to="/agent/incidents" className={`mt-4 flex items-start gap-3 rounded-[10px] border px-4 py-3 ${confirmed ? 'border-p1/40 bg-p1-bg' : 'border-dashed border-line-strong bg-surface'}`}>
      <Siren size={18} weight={confirmed ? 'fill' : 'regular'} className={`mt-0.5 shrink-0 ${confirmed ? 'text-p1' : 'text-p2'}`} />
      <span className="text-[13px]">
        <span className="font-semibold">{confirmed ? `Part of confirmed incident ${inc.id}` : inc.status === 'candidate' ? `Possible incident ${inc.id}, not yet verified` : `Incident ${inc.id} (${inc.status})`}</span>
        <span className="text-ink-2"> &middot; {inc.title} &middot; {inc.ticketIds.length} similar tickets, {inc.openTickets} open</span>
        <span className="mt-0.5 block text-xs text-muted">{confirmed ? 'Priority pinned and escalated. Resolve the incident to close linked tickets together.' : 'A supervisor must confirm before it changes priority.'}</span>
      </span>
    </Link>
  );
}

function Correction({ label, value, options, onChange, saving, last }) {
  return (
    <div className="mt-3">
      <label className="flex items-center justify-between gap-3 text-xs text-muted">
        <span>{label}</span>
        <select value={value} disabled={saving} onChange={(e) => e.target.value !== value && onChange(e.target.value)} className="field h-7 w-auto cursor-pointer py-0 text-xs">
          {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </label>
      {last && <p className="mt-1.5 text-[11px] text-muted">Corrected from {last.from} by {last.by}, {fmtDateTime(last.at)}</p>}
    </div>
  );
}

function Notes({ t, onAdd, saving }) {
  const [body, setBody] = useState('');
  return (
    <section className="panel p-5">
      <p className="text-xs text-muted">Visible to support staff only. Never shown to {t.customerName.split(' ')[0]}.</p>
      <ul className="mt-4 space-y-3">
        {(t.notes || []).length === 0 && <li className="text-[13px] text-muted">No notes yet.</li>}
        {(t.notes || []).map((n) => (
          <li key={n.id} className="rounded-md border border-dashed border-line-strong bg-sunken/60 px-3.5 py-2.5">
            <p className="text-[13px] leading-relaxed text-ink-2">{n.body}</p>
            <p className="mt-1 font-mono text-[11px] text-muted">{n.by} &middot; {fmtDateTime(n.at)}</p>
          </li>
        ))}
      </ul>
      <form className="mt-4 space-y-2" onSubmit={async (e) => { e.preventDefault(); if (body.trim()) { await onAdd(body); setBody(''); } }}>
        <label htmlFor="note" className="sr-only">Internal note</label>
        <textarea id="note" rows={3} className="field resize-y" placeholder="What did you check, what did you find?" value={body} onChange={(e) => setBody(e.target.value)} />
        <div className="flex justify-end"><Button size="sm" type="submit" loading={saving} disabled={!body.trim()}>Add note</Button></div>
      </form>
    </section>
  );
}

function ResolveForm({ t, draft, onResolve, saving, error }) {
  const [f, setF] = useState(() => ({
    category: t.classification.category,
    rootCause: draft?.rootCause || '',
    fix: draft?.fix || '',
    customerSummary: draft ? `We have resolved this. ${draft.fix}` : '',
  }));
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  return (
    <form className="panel space-y-4 p-5" onSubmit={(e) => { e.preventDefault(); onResolve(f); }}>
      <div>
        <h2 className="text-sm font-semibold">Resolution summary</h2>
        <p className="mt-0.5 text-xs text-muted">Required to resolve. Root cause and fix feed "similar resolved tickets" for the next agent. The summary is sent to the customer, who is then asked to rate the fix.</p>
        {draft && <p className="mt-2 text-xs text-p2">Drafted from {draft.id}. Edit it to match what actually happened.</p>}
      </div>
      <Field label="Confirmed category" htmlFor="r-cat" hint={f.category !== t.classification.category ? 'Different from the AI prediction. This is logged as a correction.' : 'Matches the AI prediction.'}>
        <select id="r-cat" className="field cursor-pointer sm:max-w-xs" value={f.category} onChange={set('category')}>
          {CATEGORIES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Root cause" htmlFor="r-rc"><textarea id="r-rc" rows={3} className="field resize-y" value={f.rootCause} onChange={set('rootCause')} /></Field>
        <Field label="Fix applied" htmlFor="r-fix"><textarea id="r-fix" rows={3} className="field resize-y" value={f.fix} onChange={set('fix')} /></Field>
      </div>
      <Field label="Summary for the customer" htmlFor="r-sum"><textarea id="r-sum" rows={3} className="field resize-y" value={f.customerSummary} onChange={set('customerSummary')} /></Field>
      <ErrorNote error={error} />
      <div className="flex justify-end border-t border-line pt-4"><Button type="submit" loading={saving}><CheckCircle size={15} /> Resolve and notify customer</Button></div>
    </form>
  );
}

function ResolutionSummary({ t }) {
  const r = t.resolution;
  if (!r) return <section className="panel p-5 text-[13px] text-muted">Resolved without a summary.</section>;
  return (
    <section className="panel p-5">
      <div className="flex items-center gap-2"><Seal size={18} weight="fill" className="text-pos" /><h2 className="text-sm font-semibold">Resolved by {r.by}, {fmtDateTime(r.at)}</h2></div>
      <dl className="mt-4 grid gap-4 text-[13.5px] sm:grid-cols-2">
        <div><dt className="text-[11px] font-medium uppercase tracking-wide text-muted">Root cause</dt><dd className="mt-1 text-ink-2">{r.rootCause}</dd></div>
        <div><dt className="text-[11px] font-medium uppercase tracking-wide text-muted">Fix</dt><dd className="mt-1 text-ink-2">{r.fix}</dd></div>
        <div className="sm:col-span-2"><dt className="text-[11px] font-medium uppercase tracking-wide text-muted">Sent to customer</dt><dd className="mt-1 text-ink-2">{r.customerSummary}</dd></div>
      </dl>
      <div className="mt-4 border-t border-line pt-4 text-[13px]">
        {t.feedback
          ? <p><span className="font-medium">Customer rated {t.feedback.rating}/5</span>{t.feedback.comment && <span className="text-ink-2">: &ldquo;{t.feedback.comment}&rdquo;</span>}</p>
          : <p className="text-muted">Waiting for customer feedback.</p>}
      </div>
    </section>
  );
}

function AssignDialog({ open, onClose, experts, current, supervisor, onAssign, saving }) {
  const [override, setOverride] = useState(null);
  const [reason, setReason] = useState('');
  if (!experts) return null;
  return (
    <Dialog open={open} onClose={() => { setOverride(null); setReason(''); onClose(); }} wide
      title="Recommended experts" sub={`Needed skills: ${experts.neededSkills.join(', ')}. Match score weighs skill fit, availability, workload and past similar tickets.`}
      footer={override && (
        <>
          <Button variant="ghost" size="sm" onClick={() => setOverride(null)}>Back</Button>
          <Button size="sm" loading={saving} disabled={reason.trim().length < 5} onClick={() => onAssign(override.agentId, reason)}>Override and assign to {override.name.split(' ')[0]}</Button>
        </>
      )}>
      {override ? (
        <div className="space-y-3">
          <p className="text-[13px] text-ink-2">You are choosing <span className="font-semibold">{override.name}</span> over the top recommendation. The reason is logged on the ticket and shown on Expert assignment.</p>
          <Field label="Reason for override" htmlFor="ov-reason"><textarea id="ov-reason" rows={3} className="field" autoFocus value={reason} onChange={(e) => setReason(e.target.value)} placeholder="For example: on the infra on-call rota this week" /></Field>
        </div>
      ) : (
        <div className="space-y-3">
          {!supervisor && <p className="rounded-md bg-sunken px-3 py-2 text-xs text-muted">Agents can assign the top recommendation. Choosing anyone else is a supervisor override.</p>}
          {experts.experts.slice(0, 5).map((e, i) => (
            <ExpertCard key={e.agentId} e={e} rank={i + 1} current={e.agentId === current} busy={saving}
              canAssign={i === 0 ? e.eligible : supervisor}
              onAssign={(x, rank) => (rank === 1 ? onAssign(x.agentId) : setOverride(x))} />
          ))}
        </div>
      )}
    </Dialog>
  );
}

function EscalateDialog({ open, onClose, onEscalate, onClear, saving, current }) {
  const [level, setLevel] = useState('L2');
  const [reason, setReason] = useState('');
  const LEVELS = [['L1', 'Senior agent in the same team'], ['L2', 'Team lead or specialist'], ['Manager', 'Support manager, customer relationship at risk']];
  return (
    <Dialog open={open} onClose={onClose} title="Escalate ticket"
      sub={current ? `Currently ${current.level}${current.auto ? ` by rule ${current.rule}: ${current.reason}` : ` by ${current.by}`}` : 'Escalation notifies the supervisor and moves the ticket into Escalations.'}
      footer={<>
        {onClear && <Button variant="ghost" size="sm" onClick={onClear}>Clear escalation</Button>}
        <Button size="sm" loading={saving} disabled={reason.trim().length < 5} onClick={() => onEscalate({ level, reason })}>Escalate to {level}</Button>
      </>}>
      <fieldset className="space-y-2">
        <legend className="label">Level</legend>
        {LEVELS.map(([v, d]) => (
          <label key={v} className={`flex cursor-pointer items-start gap-3 rounded-md border px-3 py-2.5 ${level === v ? 'border-ink' : 'border-line hover:border-line-strong'}`}>
            <input type="radio" name="lvl" className="mt-0.5 accent-current" checked={level === v} onChange={() => setLevel(v)} />
            <span><span className="block text-[13px] font-medium">{v}</span><span className="block text-xs text-muted">{d}</span></span>
          </label>
        ))}
      </fieldset>
      <div className="mt-4"><Field label="Reason" htmlFor="esc-reason"><textarea id="esc-reason" rows={3} className="field" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="What is blocking resolution?" /></Field></div>
    </Dialog>
  );
}
