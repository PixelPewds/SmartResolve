import { useEffect, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { UsersThree, ArrowRight } from '@phosphor-icons/react';
import { Page, PageHeader, Tabs, Panel, Presence, Avatar, Dialog, Field, SlaClock, Bar, toast } from '../../components/kit.jsx';
import { Band, Button, Skeleton, ErrorNote, Empty, ScoreMeter } from '../../components/ui.jsx';
import { ExpertCard } from '../../components/Triage.jsx';
import { api, useApi, timeAgo, fmtDateTime } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';

export default function Assignment() {
  const { data, error, loading, reload } = useApi('/assignment');
  const { user } = useAuth();
  const outlet = useOutletContext();
  const [tab, setTab] = useState('queue');
  const [sel, setSel] = useState(null);
  const supervisor = user.role === 'supervisor';

  // Select the first unassigned ticket by default.
  useEffect(() => { if (data && !data.unassigned.find((u) => u.id === sel)) setSel(data.unassigned[0]?.id || null); }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading && !data) return <Page><Skeleton className="h-8 w-56" /><Skeleton className="mt-6 h-96" /></Page>;
  if (error) return <Page><ErrorNote error={error} onRetry={reload} /></Page>;

  return (
    <Page>
      <PageHeader title="Expert assignment" sim="Agent roster, skills and availability are simulated. The match scoring runs on it live."
        sub="Each unassigned ticket gets a ranked list of experts. The match score adds up skill fit (45), availability (20), workload headroom (20) and similar tickets resolved (15). It is a weighted score, not a prediction." />

      <Tabs className="mt-5" value={tab} onChange={setTab} items={[
        { value: 'queue', label: 'Unassigned', count: data.unassigned.length, alert: true },
        { value: 'team', label: 'Team workload', count: data.team.length },
        { value: 'overrides', label: 'Supervisor overrides', count: data.overrides.length },
      ]} />

      {tab === 'queue' && (
        data.unassigned.length === 0
          ? <div className="panel mt-4"><Empty icon={UsersThree} title="Everything is assigned" /></div>
          : (
            <div className="mt-4 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
              <ul className="panel max-h-[calc(100dvh-14rem)] divide-y divide-line overflow-y-auto">
                {data.unassigned.map((t) => (
                  <li key={t.id}>
                    <button type="button" onClick={() => setSel(t.id)} className={`flex w-full gap-3 px-4 py-3 text-left transition-colors ${sel === t.id ? 'bg-sunken ring-1 ring-inset ring-line-strong' : 'hover:bg-sunken'}`}>
                      <Band band={t.priority.band} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13.5px] font-medium">{t.subject}</span>
                        <span className="mt-0.5 block truncate font-mono text-[11px] text-muted">{t.id} &middot; {t.team} &middot; {timeAgo(t.createdAt)}</span>
                        <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                          <SlaClock sla={t.sla} compact />
                          {t.top[0] && <span className="text-[11.5px] text-ink-2">Suggested: <span className="font-medium">{t.top[0].name}</span> <span className="font-mono text-muted">{t.top[0].score}</span></span>}
                        </span>
                      </span>
                      <ScoreMeter score={t.priority.score} band={t.priority.band} />
                    </button>
                  </li>
                ))}
              </ul>
              {sel && <Recommend key={sel} id={sel} supervisor={supervisor} onDone={() => { reload(); outlet?.refreshCounts?.(); }} summary={data.unassigned.find((u) => u.id === sel)} />}
            </div>
          )
      )}

      {tab === 'team' && <Team team={data.team} />}

      {tab === 'overrides' && (
        <div className="panel mt-4 overflow-hidden">
          {data.overrides.length === 0 && <Empty title="No overrides yet" hint="When a supervisor assigns someone other than the top recommendation, the reason appears here." />}
          <ul className="divide-y divide-line">
            {data.overrides.map((o) => (
              <li key={o.id + o.at} className="px-5 py-3.5">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <Link to={`/agent/tickets/${o.id}`} className="text-[13.5px] font-medium hover:underline">{o.id} &middot; {o.subject}</Link>
                  <span className="font-mono text-[11px] text-muted">{fmtDateTime(o.at)}</span>
                </div>
                <p className="mt-1 text-[13px] text-ink-2">{o.by} assigned <span className="font-medium">{o.assignee}</span> (rank {o.rank}, score {o.score}) &middot; &ldquo;{o.reason}&rdquo;</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Page>
  );
}

function Recommend({ id, summary, supervisor, onDone }) {
  const { data, error, loading } = useApi(`/tickets/${id}/experts`);
  const [override, setOverride] = useState(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  async function assign(agentId, why) {
    setBusy(true); setErr(null);
    try {
      await api(`/tickets/${id}/assign`, { method: 'POST', body: { agentId, reason: why } });
      toast(`${id} assigned`);
      setOverride(null); setReason('');
      onDone();
    } catch (e) { setErr(e); } finally { setBusy(false); }
  }

  return (
    <Panel title={summary.subject} sub={`${summary.id} · needs ${summary.neededSkills.join(', ')}`}
      action={<Link to={`/agent/tickets/${id}`} className="inline-flex shrink-0 items-center gap-1 text-[12.5px] font-medium text-ink-2 hover:text-ink">Open <ArrowRight size={12} /></Link>}>
      {loading && <div className="space-y-3"><Skeleton className="h-40" /><Skeleton className="h-40" /></div>}
      <ErrorNote error={error || err} />
      {!supervisor && data && <p className="mb-3 rounded-md bg-sunken px-3 py-2 text-xs text-muted">You can assign the top recommendation. Choosing someone else is a supervisor override.</p>}
      <div className="space-y-3">
        {data?.experts.slice(0, 4).map((e, i) => (
          <ExpertCard key={e.agentId} e={e} rank={i + 1} busy={busy} canAssign={i === 0 ? e.eligible : supervisor}
            onAssign={(x, rank) => (rank === 1 ? assign(x.agentId) : setOverride(x))} />
        ))}
      </div>
      <Dialog open={Boolean(override)} onClose={() => setOverride(null)} title={`Override: assign to ${override?.name}`}
        sub="The reason is stored on the ticket and listed under Supervisor overrides."
        footer={<Button size="sm" loading={busy} disabled={reason.trim().length < 5} onClick={() => assign(override.agentId, reason)}>Assign with override</Button>}>
        <Field label="Reason" htmlFor="ovr"><textarea id="ovr" rows={3} className="field" autoFocus value={reason} onChange={(e) => setReason(e.target.value)} placeholder="For example: knows this enterprise customer's setup" /></Field>
      </Dialog>
    </Panel>
  );
}

function Team({ team }) {
  const teams = [...new Set(team.map((a) => a.team))];
  return (
    <div className="mt-4 space-y-5">
      {teams.map((name) => (
        <Panel key={name} title={name} sub={`${team.filter((a) => a.team === name && a.status === 'online').length} online`} bodyClass="">
          <ul className="divide-y divide-line">
            {team.filter((a) => a.team === name).map((a) => (
              <li key={a.id} className="grid grid-cols-1 items-center gap-3 px-5 py-3.5 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1.4fr)_minmax(0,1fr)_auto]">
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar name={a.name} size={34} />
                  <div className="min-w-0">
                    <p className="truncate text-[13.5px] font-semibold">{a.name}</p>
                    <p className="truncate text-[12px] text-muted">{a.title}</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1">
                  {a.skills.map((s) => <span key={s} className="rounded border border-line px-1.5 py-0.5 text-[11px] text-ink-2">{s}</span>)}
                </div>
                <div>
                  <div className="flex items-baseline justify-between text-[12px]">
                    <span className="text-muted">Load</span>
                    <span className="num font-mono"><span className={a.open >= a.capacity ? 'text-p1' : ''}>{a.open}</span><span className="text-muted"> / {a.capacity}</span></span>
                  </div>
                  <div className="mt-1.5"><Bar value={a.open} max={a.capacity} tone={a.open >= a.capacity ? 'bg-p1' : a.open / a.capacity > 0.66 ? 'bg-p2' : 'bg-ink'} /></div>
                  <p className="mt-1 text-[11px] text-muted">{a.breached ? <span className="text-p1">{a.breached} breached &middot; </span> : ''}{a.resolved7} resolved this week{a.csat ? ` · CSAT ${a.csat}` : ''}</p>
                </div>
                <Presence status={a.status} />
              </li>
            ))}
          </ul>
        </Panel>
      ))}
    </div>
  );
}
