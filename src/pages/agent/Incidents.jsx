import { useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine } from 'recharts';
import { Siren, CheckCircle, XCircle, Seal, Info, Users } from '@phosphor-icons/react';
import { Page, PageHeader, Tabs, Panel, Dialog, Field, Sim, toast } from '../../components/kit.jsx';
import { Band, Button, Skeleton, ErrorNote, Empty, StatusPill } from '../../components/ui.jsx';
import { api, useApi, timeAgo, fmtDateTime } from '../../lib/api.js';
import { useTokens } from '../../lib/tokens.js';
import { useAuth } from '../../lib/auth.jsx';

const STATUS = {
  candidate: { label: 'Candidate', cls: 'border-p2/40 bg-p2-bg text-p2' },
  confirmed: { label: 'Confirmed', cls: 'border-p1/40 bg-p1-bg text-p1' },
  dismissed: { label: 'Dismissed', cls: 'border-line text-muted' },
  resolved: { label: 'Resolved', cls: 'border-pos/40 bg-pos-bg text-pos' },
};

export default function Incidents() {
  const { data, error, loading, reload } = useApi('/incidents');
  const { user } = useAuth();
  const outlet = useOutletContext();
  const [tab, setTab] = useState('candidate');
  const [dlg, setDlg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const supervisor = user.role === 'supervisor';

  async function decide(inc, action, body) {
    setBusy(true); setErr(null);
    try {
      const r = await api(`/incidents/${inc.id}/${action}`, { method: 'POST', body });
      toast(action === 'confirm' ? `${inc.id} confirmed, ${r.linked} tickets linked and prioritised` : action === 'resolve' ? `${inc.id} resolved, ${r.closed} tickets closed` : `${inc.id} dismissed`);
      setDlg(null);
      setTab(action === 'confirm' ? 'confirmed' : action === 'resolve' ? 'resolved' : 'dismissed');
      reload(); outlet?.refreshCounts?.();
    } catch (e) { setErr(e); } finally { setBusy(false); }
  }

  if (loading && !data) return <Page><Skeleton className="h-8 w-48" /><Skeleton className="mt-6 h-80" /></Page>;
  if (error) return <Page><ErrorNote error={error} onRetry={reload} /></Page>;

  const by = (s) => data.incidents.filter((i) => i.status === s);
  const list = tab === 'groups' ? [] : by(tab);

  return (
    <Page>
      <PageHeader title="Incident watch" sim="Ticket data is simulated. Clustering and spike statistics are computed live from it."
        sub="Similar complaints are grouped by text similarity, then each group's last 3 hours are compared with its usual rate over 14 days. A spike is only a candidate until a supervisor verifies it." />

      <div className="mt-4 flex items-start gap-2 rounded-md border border-line bg-surface px-3.5 py-2.5 text-[12.5px] text-ink-2">
        <Info size={15} className="mt-0.5 shrink-0 text-muted" />
        <span>Confirming links every similar ticket, pins them to the top of the queue, escalates them (rule R4) and tells affected customers it is a known issue. Dismissing removes the "possible incident" flag. Candidates never change priority on their own.</span>
      </div>

      <Tabs className="mt-5" value={tab} onChange={setTab} items={[
        { value: 'candidate', label: 'Candidates', count: by('candidate').length, alert: true },
        { value: 'confirmed', label: 'Confirmed', count: by('confirmed').length },
        { value: 'groups', label: 'Normal-volume groups', count: data.groups.length },
        { value: 'resolved', label: 'Resolved', count: by('resolved').length },
        { value: 'dismissed', label: 'Dismissed', count: by('dismissed').length },
      ]} />

      {err && <div className="mt-4"><ErrorNote error={err} /></div>}

      <div className="mt-4 space-y-5">
        {tab !== 'groups' && list.length === 0 && <div className="panel"><Empty icon={Siren} title={tab === 'candidate' ? 'No unusual spikes right now' : `No ${tab} incidents`} hint={tab === 'candidate' ? 'Groups appear here when similar complaints arrive much faster than usual.' : undefined} /></div>}
        {list.map((inc) => <IncidentCard key={inc.id} inc={inc} supervisor={supervisor} onAction={(action) => setDlg({ inc, action })} />)}
        {tab === 'groups' && (
          data.groups.length === 0
            ? <div className="panel"><Empty title="No other similar-complaint groups today" /></div>
            : data.groups.map((g) => <GroupCard key={g.ticketIds[0]} g={g} />)
        )}
      </div>

      <DecisionDialog key={dlg ? `${dlg.inc.id}-${dlg.action}` : 'none'} dlg={dlg} busy={busy} onClose={() => setDlg(null)} onSubmit={decide} />
    </Page>
  );
}

function SpikeChart({ series, height = 150 }) {
  const c = useTokens();
  if (!series?.length) return null;
  const data = series.map((s) => ({ ...s, label: new Date(s.hour).toLocaleTimeString('en-IN', { hour: 'numeric' }) }));
  const base = series[0].baseline;
  return (
    <div style={{ height }}>
      <ResponsiveContainer>
        <AreaChart data={data} margin={{ left: -28, right: 4, top: 6 }}>
          <defs>
            <linearGradient id="spk" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={c.p1} stopOpacity={0.25} /><stop offset="100%" stopColor={c.p1} stopOpacity={0} /></linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke={c.line} />
          <XAxis dataKey="label" stroke={c.muted} fontSize={10.5} tickLine={false} axisLine={false} interval={2} />
          <YAxis stroke={c.muted} fontSize={10.5} tickLine={false} axisLine={false} allowDecimals={false} />
          <Tooltip contentStyle={{ background: c.surface, border: `1px solid ${c.line}`, borderRadius: 8, fontSize: 12 }} formatter={(v, n) => [v, n === 'count' ? 'complaints' : n]} />
          <ReferenceLine y={base} stroke={c.muted} strokeDasharray="4 4" label={{ value: 'usual rate', position: 'insideTopRight', fill: c.muted, fontSize: 10 }} />
          <Area type="monotone" dataKey="count" stroke={c.p1} strokeWidth={1.75} fill="url(#spk)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function IncidentCard({ inc, supervisor, onAction }) {
  const s = STATUS[inc.status];
  const sp = inc.spike;
  const [showAll, setShowAll] = useState(false);
  const tickets = showAll ? inc.tickets : inc.tickets?.slice(0, 5);
  return (
    <article className={`panel overflow-hidden ${inc.status === 'candidate' ? 'border-p2/40' : inc.status === 'confirmed' ? 'border-p1/40' : ''}`}>
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line px-5 py-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${s.cls}`}>{s.label}</span>
            <span className="font-mono text-[12px] text-muted">{inc.id}</span>
            {inc.severity && <span className="text-[12px] font-medium capitalize text-p1">{inc.severity}</span>}
          </div>
          <h2 className="mt-1.5 text-[17px] font-semibold tracking-tight">{inc.title}</h2>
          <p className="mt-0.5 text-[12.5px] text-muted">{inc.team} &middot; first report {timeAgo(inc.firstReportedAt)} &middot; detected {fmtDateTime(inc.detectedAt)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {inc.status === 'candidate' && (supervisor ? (
            <>
              <Button size="sm" variant="secondary" onClick={() => onAction('dismiss')}><XCircle size={15} /> Dismiss</Button>
              <Button size="sm" onClick={() => onAction('confirm')}><CheckCircle size={15} /> Confirm incident</Button>
            </>
          ) : <span className="text-[12px] text-muted">A supervisor verifies candidates</span>)}
          {inc.status === 'confirmed' && supervisor && <Button size="sm" onClick={() => onAction('resolve')}><Seal size={15} /> Resolve incident</Button>}
        </div>
      </div>

      <div className="grid gap-0 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <div className="border-line p-5 lg:border-r">
          <div className="grid grid-cols-3 gap-3">
            <Metric label={`Last ${sp.windowHours}h`} value={sp.recent} sub="similar complaints" tone={sp.isSpike ? 'text-p1' : ''} />
            <Metric label="Usual rate" value={sp.expected < 0.1 ? '~0' : sp.expected.toFixed(1)} sub={`expected in ${sp.windowHours}h, from ${sp.historyDays} days`} />
            {/* A ratio against a near-zero baseline is a meaningless big number, so say "new" instead. */}
            <Metric label="Above usual" value={sp.expected < 0.33 ? 'New' : `${sp.ratio}x`} sub={sp.expected < 0.33 ? `no real history, z-score ${sp.z}` : `z-score ${sp.z}`} tone={sp.isSpike ? 'text-p1' : ''} />
          </div>
          <div className="mt-4"><SpikeChart series={sp.series} /></div>
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <span className="text-[11.5px] text-muted">Shared terms:</span>
            {inc.keywords?.map((k) => <span key={k} className="rounded bg-sunken px-1.5 py-0.5 font-mono text-[11px] text-ink-2">{k}</span>)}
          </div>
          {inc.dismissReason && <p className="mt-3 text-[12.5px] text-ink-2"><span className="font-medium">Dismissed:</span> {inc.dismissReason}</p>}
          {inc.resolutionNote && <p className="mt-3 text-[12.5px] text-ink-2"><span className="font-medium">Resolution:</span> {inc.resolutionNote}</p>}
        </div>

        <div className="p-5">
          <div className="flex items-baseline justify-between">
            <p className="text-[13px] font-semibold">Affected tickets <span className="font-normal text-muted">({inc.ticketIds.length}, {inc.openTickets} open)</span></p>
            <span className="inline-flex items-center gap-1 text-[12px] text-muted"><Users size={13} /> {inc.customers} customers</span>
          </div>
          <ul className="mt-2 divide-y divide-line">
            {tickets?.map((t) => (
              <li key={t.id}>
                <Link to={`/agent/tickets/${t.id}`} className="flex items-center gap-2.5 py-2 hover:underline">
                  <Band band={t.priority.band} />
                  <span className="min-w-0 flex-1 truncate text-[13px]">{t.subject}</span>
                  <span className="shrink-0 font-mono text-[10.5px] text-muted">{timeAgo(t.createdAt)}</span>
                </Link>
              </li>
            ))}
          </ul>
          {inc.tickets?.length > 5 && <button type="button" onClick={() => setShowAll((x) => !x)} className="mt-1 text-[12px] font-medium text-ink-2 hover:underline">{showAll ? 'Show fewer' : `Show all ${inc.tickets.length}`}</button>}
          <details className="mt-4 border-t border-line pt-3">
            <summary className="cursor-pointer text-[12px] font-medium text-ink-2">Decision history</summary>
            <ol className="mt-2 space-y-2">
              {inc.history?.map((h, i) => (
                <li key={i} className="text-[12px]"><span className="font-medium capitalize">{h.action}</span> by {h.by} <span className="font-mono text-[10.5px] text-muted">{h.at ? fmtDateTime(h.at) : ''}</span><span className="block text-muted">{h.note}</span></li>
              ))}
            </ol>
          </details>
        </div>
      </div>
    </article>
  );
}

function GroupCard({ g }) {
  return (
    <article className="panel overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line px-5 py-4">
        <div>
          <span className="rounded-full border border-line px-2 py-0.5 text-[11px] font-semibold text-muted">Normal volume</span>
          <h2 className="mt-1.5 text-[16px] font-semibold">{g.title}</h2>
          <p className="mt-0.5 text-[12.5px] text-muted">{g.ticketIds.length} similar complaints today, but {g.spike.recent} in the last {g.spike.windowHours}h against a usual {g.spike.expected}. Not flagged.</p>
        </div>
        <Sim title="Shown to prove the detector does not flag every repeated topic.">Not an incident</Sim>
      </div>
      <div className="grid gap-0 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <div className="border-line p-5 lg:border-r"><SpikeChart series={g.spike.series} height={120} /></div>
        <ul className="divide-y divide-line p-5">
          {g.tickets.map((t) => (
            <li key={t.id}><Link to={`/agent/tickets/${t.id}`} className="flex items-center gap-2.5 py-2 hover:underline"><Band band={t.priority.band} /><span className="min-w-0 flex-1 truncate text-[13px]">{t.subject}</span><StatusPill status={t.status} /></Link></li>
          ))}
        </ul>
      </div>
    </article>
  );
}

function Metric({ label, value, sub, tone = '' }) {
  return (
    <div className="rounded-md bg-sunken px-3 py-2.5">
      <p className="text-[11px] text-muted">{label}</p>
      <p className={`num mt-1 font-mono text-[20px] font-semibold leading-none ${tone}`}>{value}</p>
      <p className="mt-1 text-[10.5px] leading-snug text-muted">{sub}</p>
    </div>
  );
}

function DecisionDialog({ dlg, onClose, onSubmit, busy }) {
  const [severity, setSeverity] = useState('critical');
  const [note, setNote] = useState('');
  const [closeTickets, setCloseTickets] = useState(true);
  if (!dlg) return <Dialog open={false} onClose={onClose} title="" />;
  const { inc, action } = dlg;
  const cfg = {
    confirm: { title: `Confirm ${inc.id} as an incident`, btn: 'Confirm incident', need: 0 },
    dismiss: { title: `Dismiss ${inc.id}`, btn: 'Dismiss candidate', need: 5 },
    resolve: { title: `Resolve ${inc.id}`, btn: 'Resolve incident', need: 10 },
  }[action];
  return (
    <Dialog open onClose={onClose} title={cfg.title} sub={inc.title}
      footer={<Button size="sm" loading={busy} disabled={note.trim().length < cfg.need} onClick={() => onSubmit(inc, action, action === 'confirm' ? { severity, note } : action === 'resolve' ? { note, resolveTickets: closeTickets } : { note })}>{cfg.btn}</Button>}>
      {action === 'confirm' && (
        <div className="space-y-4">
          <p className="text-[13px] text-ink-2">{inc.ticketIds.length} tickets from {inc.customers} customers will be linked. Customers get a "known issue" message.</p>
          <fieldset className="space-y-2">
            <legend className="label">Severity</legend>
            {[['critical', 'Critical: pin linked tickets and floor their score at 85'], ['major', 'Major: add 8 points to linked tickets']].map(([v, d]) => (
              <label key={v} className={`flex cursor-pointer gap-3 rounded-md border px-3 py-2.5 ${severity === v ? 'border-ink' : 'border-line'}`}>
                <input type="radio" name="sev" checked={severity === v} onChange={() => setSeverity(v)} className="mt-0.5" />
                <span className="text-[13px]"><span className="font-medium capitalize">{v}</span><span className="block text-xs text-muted">{d}</span></span>
              </label>
            ))}
          </fieldset>
          <Field label="How did you verify it?" htmlFor="inc-note" optional><textarea id="inc-note" rows={2} className="field" value={note} onChange={(e) => setNote(e.target.value)} placeholder="For example: engineering confirmed CDN errors in Mumbai" /></Field>
        </div>
      )}
      {action === 'dismiss' && (
        <Field label="Why is this not one incident?" htmlFor="inc-note" hint="Required. Kept with the decision for the next review.">
          <textarea id="inc-note" rows={3} className="field" value={note} onChange={(e) => setNote(e.target.value)} placeholder="For example: different devices and app versions, no shared cause" />
        </Field>
      )}
      {action === 'resolve' && (
        <div className="space-y-4">
          <Field label="Root cause and fix" htmlFor="inc-note"><textarea id="inc-note" rows={3} className="field" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
          <label className="flex items-start gap-2.5 text-[13px]">
            <input type="checkbox" checked={closeTickets} onChange={(e) => setCloseTickets(e.target.checked)} className="mt-0.5" />
            <span>Resolve all {inc.openTickets} open linked tickets with this summary and ask those customers for feedback</span>
          </label>
        </div>
      )}
    </Dialog>
  );
}
