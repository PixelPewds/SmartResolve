import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Timer, Lightning } from '@phosphor-icons/react';
import { Page, PageHeader, Panel, Tabs, SlaClock, StatRow, Stat, Avatar } from '../../components/kit.jsx';
import { Band, Skeleton, ErrorNote, Empty, ScoreMeter } from '../../components/ui.jsx';
import { useApi, timeAgo } from '../../lib/api.js';

const fmtMin = (m) => (m < 60 ? `${m} min` : `${m / 60} h`);

export default function Sla() {
  const { data, error, loading, reload } = useApi('/sla');
  const [tab, setTab] = useState('breached');
  const [sim, setSim] = useState({ band: 'P2', hours: 3, responded: false });

  if (loading && !data) return <Page><Skeleton className="h-8 w-56" /><Skeleton className="mt-6 h-96" /></Page>;
  if (error) return <Page><ErrorNote error={error} onRetry={reload} /></Page>;

  const lists = { breached: data.breached, hour: data.dueHour, today: data.dueToday };
  const rows = lists[tab];

  // Rule simulator: what would happen to a ticket like this, right now?
  const p = data.policy[sim.band];
  const targetH = sim.responded ? p.resolveHours : p.firstResponseMin / 60;
  const pct = sim.hours / targetH;
  const state = pct >= 1 ? 'breached' : pct >= 0.75 ? 'warning' : 'ok';
  const simWaiting = Math.round(20 * (1 - Math.exp(-sim.hours / 10)));
  const simRisk = state === 'breached' ? 20 : pct <= 0.5 ? 0 : Math.round(Math.min(1, (pct - 0.5) / 0.5) * 16);

  return (
    <Page>
      <PageHeader title="SLA management" sim
        sub="Targets are set by the intake band when a ticket arrives. Clocks are computed from timestamps on every load, so countdowns are always current without a background job." />

      <div className="mt-5">
        <StatRow>
          <Stat label="Breached" value={data.breached.length} tone={data.breached.length ? 'text-p1' : ''} icon={Timer} sub="escalated by rule R2" />
          <Stat label="Due within 1 hour" value={data.dueHour.length} tone={data.dueHour.length ? 'text-p2' : ''} />
          <Stat label="Due today" value={data.dueToday.length} />
          <Stat label="On track" value={data.onTrack} sub="more than 24h left" />
        </StatRow>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="min-w-0">
          <Tabs value={tab} onChange={setTab} items={[
            { value: 'breached', label: 'Breached', count: data.breached.length, alert: true },
            { value: 'hour', label: 'Due within 1h', count: data.dueHour.length },
            { value: 'today', label: 'Due today', count: data.dueToday.length },
          ]} />
          <div className="panel mt-3 overflow-hidden">
            {rows.length === 0 && <Empty icon={Timer} title="Nothing in this bucket" />}
            <ul className="divide-y divide-line">
              {rows.map((t) => (
                <li key={t.id}>
                  <Link to={`/agent/tickets/${t.id}`} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-4 py-3 hover:bg-sunken sm:grid-cols-[auto_minmax(0,1fr)_120px_auto]">
                    <Band band={t.priority.band} />
                    <div className="min-w-0">
                      <p className="truncate text-[13.5px] font-medium">{t.subject}</p>
                      <p className="mt-0.5 flex items-center gap-1.5 truncate font-mono text-[11px] text-muted">
                        {t.id} &middot; {t.sla.clockLabel.toLowerCase()} target &middot;
                        {t.assigneeName ? <><Avatar name={t.assigneeName} size={16} />{t.assigneeName.split(' ')[0]}</> : <span className="text-p2">unassigned</span>}
                      </p>
                    </div>
                    <span className="col-span-2 sm:col-span-1"><SlaClock sla={t.sla} /></span>
                    <span className="hidden sm:block"><ScoreMeter score={t.priority.score} band={t.priority.band} /></span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="space-y-6">
          <Panel title="SLA policy" sub="By intake band" bodyClass="">
            <table className="w-full text-left text-[13px]">
              <thead className="border-b border-line bg-sunken text-[11px] uppercase tracking-[0.05em] text-muted">
                <tr><th className="px-5 py-2 font-medium">Band</th><th className="px-2 py-2 font-medium">First reply</th><th className="px-2 py-2 font-medium">Resolve</th><th className="px-5 py-2 text-right font-medium">Met, 14d</th></tr>
              </thead>
              <tbody className="divide-y divide-line">
                {Object.entries(data.policy).map(([b, p]) => {
                  const c = data.compliance.find((x) => x.band === b);
                  return (
                    <tr key={b}>
                      <td className="px-5 py-2.5"><Band band={b} withLabel /></td>
                      <td className="num px-2 py-2.5 font-mono">{fmtMin(p.firstResponseMin)}</td>
                      <td className="num px-2 py-2.5 font-mono">{p.resolveHours} h</td>
                      <td className="num px-5 py-2.5 text-right font-mono text-muted">{c.resolved ? `${Math.round((c.met / c.resolved) * 100)}%` : '–'} <span className="text-[10.5px]">({c.met}/{c.resolved})</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Panel>

          <Panel title="Escalation rules" sub="Evaluated live on every ticket" bodyClass="">
            <ul className="divide-y divide-line">
              {data.rules.map((r) => (
                <li key={r.id} className="flex gap-3 px-5 py-3">
                  <span className="num mt-0.5 shrink-0 font-mono text-[11px] font-semibold text-ink-2">{r.id}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px]">{r.trigger}</p>
                    <p className="mt-0.5 text-[12px] text-muted">{r.action}</p>
                  </div>
                  <span className={`num shrink-0 font-mono text-[12px] ${r.firing ? 'text-p1' : 'text-muted'}`}>{r.firing} now</span>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel title="Rule simulator" icon={Lightning} sub="How a ticket's clock and score change as it waits">
            <div className="grid grid-cols-2 gap-3">
              <label className="text-[12px]"><span className="label">Intake band</span>
                <select className="field cursor-pointer" value={sim.band} onChange={(e) => setSim((s) => ({ ...s, band: e.target.value }))}>
                  {['P1', 'P2', 'P3', 'P4'].map((b) => <option key={b}>{b}</option>)}
                </select>
              </label>
              <label className="text-[12px]"><span className="label">Waiting: {sim.hours} h</span>
                <input type="range" min="0" max="80" step="0.5" value={sim.hours} onChange={(e) => setSim((s) => ({ ...s, hours: Number(e.target.value) }))} className="mt-2.5 w-full accent-current" />
              </label>
            </div>
            <label className="mt-3 flex items-center gap-2 text-[12.5px]"><input type="checkbox" checked={sim.responded} onChange={(e) => setSim((s) => ({ ...s, responded: e.target.checked }))} /> Customer has had a first reply</label>
            <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-md bg-sunken px-2 py-2"><dt className="text-[10.5px] text-muted">Clock used</dt><dd className={`num mt-0.5 font-mono text-[16px] font-semibold ${state === 'breached' ? 'text-p1' : state === 'warning' ? 'text-p2' : ''}`}>{Math.round(pct * 100)}%</dd></div>
              <div className="rounded-md bg-sunken px-2 py-2"><dt className="text-[10.5px] text-muted">Waiting pts</dt><dd className="num mt-0.5 font-mono text-[16px] font-semibold">+{simWaiting}</dd></div>
              <div className="rounded-md bg-sunken px-2 py-2"><dt className="text-[10.5px] text-muted">SLA risk pts</dt><dd className="num mt-0.5 font-mono text-[16px] font-semibold">+{simRisk}</dd></div>
            </dl>
            <p className="mt-3 text-[12.5px] text-ink-2">
              {state === 'breached' ? 'Breached: rule R2 escalates to L2 and notifies the supervisor.'
                : state === 'warning' ? 'Over 75%: SLA warning sent to the owner (or the supervisor if unassigned, rule R1).'
                : 'Within target. No rule fires yet.'}
            </p>
          </Panel>
        </div>
      </div>
    </Page>
  );
}
