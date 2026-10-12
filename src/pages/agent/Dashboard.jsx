import { Link, useNavigate } from 'react-router-dom';
import { ResponsiveContainer, BarChart, Bar as RBar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import {
  Tray, Siren, Timer, UserPlus, ArrowRight, ChatCircle, ArrowFatLinesUp, CheckCircle, Star, PencilSimple, NotePencil, ArrowsLeftRight, Lightning,
} from '@phosphor-icons/react';
import { Page, PageHeader, Panel, Stat, StatRow, SlaClock, Bar } from '../../components/kit.jsx';
import { Band, ScoreMeter, Skeleton, ErrorNote, Empty } from '../../components/ui.jsx';
import { useApi, timeAgo } from '../../lib/api.js';
import { useTokens } from '../../lib/tokens.js';
import { useAuth } from '../../lib/auth.jsx';

const dayLabel = (d) => new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
const EVENT_ICON = { created: Tray, assigned: UserPlus, reply: ChatCircle, escalated: ArrowFatLinesUp, resolved: CheckCircle, feedback: Star, correction: PencilSimple, note: NotePencil, routed: ArrowsLeftRight, incident: Siren, status: ArrowsLeftRight };

export default function Dashboard() {
  const { user } = useAuth();
  const { data, error, loading, reload } = useApi('/dashboard');
  const c = useTokens();
  const nav = useNavigate();

  if (loading && !data) return <Page><Skeleton className="h-8 w-56" /><Skeleton className="mt-6 h-24" /><div className="mt-6 grid gap-6 xl:grid-cols-2"><Skeleton className="h-72" /><Skeleton className="h-72" /></div></Page>;
  if (error) return <Page><ErrorNote error={error} onRetry={reload} /></Page>;

  const k = data.kpis;
  const axis = { stroke: c.muted, fontSize: 11, tickLine: false, axisLine: false };
  const maxTeam = Math.max(1, ...data.teams.map((t) => t.open));
  const candidates = data.incidents.filter((i) => i.status === 'candidate');
  const first = user.name.split(' ')[0];

  return (
    <Page>
      <PageHeader title={`Good ${greeting()}, ${first}`} sim
        sub="What needs attention now. The priority order updates live as tickets wait and SLA clocks run down." />

      {candidates.length > 0 && (
        <button type="button" onClick={() => nav('/agent/incidents')}
          className="mt-5 flex w-full items-center gap-3 rounded-[10px] border border-p1/30 bg-p1-bg px-4 py-3 text-left transition-colors hover:border-p1/60">
          <Siren size={20} weight="fill" className="shrink-0 text-p1" />
          <span className="min-w-0 flex-1 text-[13.5px]">
            <span className="font-semibold text-p1">{candidates.length} possible incident{candidates.length > 1 ? 's' : ''} detected. </span>
            <span className="text-ink-2">{candidates.map((i) => `${i.title} (${i.spike.recent} in ${i.spike.windowHours}h, ${i.spike.expected < 0.33 ? 'new pattern' : `${i.spike.ratio}x usual`})`).join(' · ')}</span>
          </span>
          <span className="hidden shrink-0 items-center gap-1 text-[13px] font-medium sm:inline-flex">Review <ArrowRight size={13} /></span>
        </button>
      )}

      <div className="mt-5">
        <StatRow cols="grid-cols-2 lg:grid-cols-5">
          <Stat label="Active tickets" value={k.active} icon={Tray} sub={`${k.unassigned} unassigned`} />
          <Stat label="Critical now" value={k.critical} tone={k.critical ? 'text-p1' : ''} icon={Lightning} sub="live P1, incl. aged tickets" />
          <Stat label="SLA breached" value={k.breached} tone={k.breached ? 'text-p1' : ''} icon={Timer} sub={`${k.dueSoon} due within 25% of target`} />
          <Stat label="New this week" value={k.newThisPeriod} delta={k.newDelta} goodWhen="down" sub="vs previous week" />
          <Stat label="First response" value={k.firstResponseH != null ? `${k.firstResponseH.toFixed(1)}h` : '–'} delta={k.firstResponseDelta} goodWhen="down" sub="median, this week" />
        </StatRow>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Panel title="Highest priority right now" sub="Hybrid score: AI assessment + waiting time + SLA risk"
          action={<Link to="/agent/tickets" className="inline-flex items-center gap-1 text-[12.5px] font-medium text-ink-2 hover:text-ink">Open queue <ArrowRight size={12} /></Link>}
          bodyClass="">
          <ul className="divide-y divide-line">
            {data.top.map((t) => (
              <li key={t.id}>
                <Link to={`/agent/tickets/${t.id}`} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-5 py-3 transition-colors hover:bg-sunken sm:grid-cols-[auto_minmax(0,1fr)_110px_auto]">
                  <Band band={t.priority.band} />
                  <div className="min-w-0">
                    <p className="truncate text-[13.5px] font-medium">{t.subject}</p>
                    <p className="truncate font-mono text-[11px] text-muted">{t.id} &middot; {t.team} &middot; {t.assigneeName || 'unassigned'}{t.priority.pinned ? ' · pinned' : ''}</p>
                  </div>
                  <span className="hidden sm:block"><SlaClock sla={t.sla} /></span>
                  <ScoreMeter score={t.priority.score} band={t.priority.band} />
                </Link>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title="Recent activity" sub="Last 24 hours" bodyClass="max-h-[420px] overflow-y-auto">
          {data.activity.length === 0 && <Empty title="Quiet day" />}
          <ol className="divide-y divide-line">
            {data.activity.map((e, i) => {
              const Icon = EVENT_ICON[e.type] || Tray;
              return (
                <li key={i}>
                  <Link to={e.ticketId ? `/agent/tickets/${e.ticketId}` : '/agent/incidents'} className="flex gap-3 px-5 py-2.5 hover:bg-sunken">
                    <Icon size={15} className={`mt-0.5 shrink-0 ${e.type === 'escalated' || e.type === 'incident' ? 'text-p1' : 'text-muted'}`} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12.5px]"><span className="font-medium">{e.by}</span> <span className="text-ink-2">{e.text.charAt(0).toLowerCase() + e.text.slice(1)}</span></span>
                      <span className="block truncate font-mono text-[10.5px] text-muted">{e.ticketId || e.incidentId} &middot; {e.subject}</span>
                    </span>
                    <span className="shrink-0 font-mono text-[10.5px] text-muted">{timeAgo(e.at)}</span>
                  </Link>
                </li>
              );
            })}
          </ol>
        </Panel>

        <Panel title="New tickets by intake priority" sub="Last 7 days, by the band set at intake">
          <div className="h-60">
            <ResponsiveContainer>
              <BarChart data={data.volume.map((d) => ({ ...d, day: dayLabel(d.date) }))} margin={{ left: -24, right: 4, top: 4 }}>
                <CartesianGrid vertical={false} stroke={c.line} />
                <XAxis dataKey="day" {...axis} />
                <YAxis {...axis} allowDecimals={false} />
                <Tooltip contentStyle={{ background: c.surface, border: `1px solid ${c.line}`, borderRadius: 8, fontSize: 12 }} cursor={{ fill: c.sunken }} />
                <RBar dataKey="P4" stackId="a" fill={c.p4} name="P4 Low" />
                <RBar dataKey="P3" stackId="a" fill={c.p3} name="P3 Medium" />
                <RBar dataKey="P2" stackId="a" fill={c.p2} name="P2 High" />
                <RBar dataKey="P1" stackId="a" fill={c.p1} name="P1 Critical" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel title="Department load" sub="Open tickets per team, breached in red"
          action={<Link to="/agent/assignment" className="inline-flex items-center gap-1 text-[12.5px] font-medium text-ink-2 hover:text-ink">Workload <ArrowRight size={12} /></Link>}>
          <ul className="space-y-4">
            {data.teams.map((t) => (
              <li key={t.team}>
                <Link to={`/agent/tickets?team=${encodeURIComponent(t.team)}`} className="block">
                  <div className="flex items-baseline justify-between text-[13px]">
                    <span className="truncate hover:underline">{t.team}</span>
                    <span className="num font-mono text-xs text-muted"><span className="text-ink">{t.open}</span> open{t.breached ? <span className="text-p1"> &middot; {t.breached} breached</span> : ''}</span>
                  </div>
                  <div className="mt-1.5"><Bar value={t.open} max={maxTeam} tone={t.breached ? 'bg-p1' : 'bg-ink'} /></div>
                </Link>
              </li>
            ))}
          </ul>
          {data.mine && (
            <div className="mt-6 border-t border-line pt-4">
              <p className="eyebrow">Assigned to you</p>
              {data.mine.length === 0 ? <p className="mt-2 text-[13px] text-muted">Nothing assigned right now.</p> : (
                <ul className="mt-2 space-y-1.5">
                  {data.mine.map((t) => (
                    <li key={t.id}><Link to={`/agent/tickets/${t.id}`} className="flex items-center gap-2 text-[13px] hover:underline"><Band band={t.priority.band} /><span className="truncate">{t.subject}</span></Link></li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </Panel>
      </div>
    </Page>
  );
}

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening';
}
