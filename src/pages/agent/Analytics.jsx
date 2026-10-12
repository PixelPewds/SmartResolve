import { useState } from 'react';
import { ResponsiveContainer, BarChart, Bar as RBar, XAxis, YAxis, Tooltip, CartesianGrid, AreaChart, Area, LineChart, Line, Legend } from 'recharts';
import { Page, PageHeader, Panel, Stat, StatRow, Tabs, Bar } from '../../components/kit.jsx';
import { Band, Skeleton, ErrorNote } from '../../components/ui.jsx';
import { useApi } from '../../lib/api.js';
import { useTokens } from '../../lib/tokens.js';

const dayLabel = (d) => new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
const pctDelta = (a, b) => (a == null || !b ? null : Math.round(((a - b) / b) * 100));
const h = (x) => (x == null ? '–' : `${x.toFixed(1)}h`);

export default function Analytics() {
  const [days, setDays] = useState('7');
  const { data, error, loading, reload } = useApi(`/analytics?days=${days}`);
  const c = useTokens();

  if (loading && !data) return <Page><Skeleton className="h-8 w-40" /><Skeleton className="mt-6 h-24" /><Skeleton className="mt-6 h-72" /></Page>;
  if (error) return <Page><ErrorNote error={error} onRetry={reload} /></Page>;

  const k = data.kpis;
  const TEAM_TONES = [c.ink, c['ink-2'], c.muted, c.faint, c['line-strong']];
  const daily = data.daily.map((d, i, arr) => {
    const win = arr.slice(Math.max(0, i - 2), i + 1);
    const tot = win.reduce((s, x) => s + x.total, 0);
    const pct = (key) => (tot ? Math.round((win.reduce((s, x) => s + x[key], 0) / tot) * 100) : null);
    return { ...d, day: dayLabel(d.date), negPct: pct('negative'), neuPct: pct('neutral'), posPct: pct('positive') };
  });
  const axis = { stroke: c.muted, fontSize: 11, tickLine: false, axisLine: false };
  const tip = { contentStyle: { background: c.surface, border: `1px solid ${c.line}`, borderRadius: 8, fontSize: 12 }, cursor: { fill: c.sunken } };
  const maxBand = Math.max(1, ...data.bands.map((b) => b.count));
  const maxRec = Math.max(1, ...data.recurring.map((r) => r.count));

  return (
    <Page>
      <PageHeader title="Analytics" sim="Computed from the simulated ticket data. No metric here is hardcoded."
        sub={`Last ${days} days, ${k.total} tickets. Change is against the ${days} days before.`}
        actions={<Tabs size="sm" value={days} onChange={setDays} items={[{ value: '7', label: '7 days' }, { value: '14', label: '14 days' }]} />} />

      <div className="mt-5">
        <StatRow cols="grid-cols-2 lg:grid-cols-6">
          <Stat label="Tickets" value={k.total} delta={pctDelta(k.total, k.totalPrev)} goodWhen="down" sub={k.totalPrev ? 'vs previous' : 'no earlier data'} />
          <Stat label="First response" value={h(k.firstResponseH)} sub="median" />
          <Stat label="Resolution time" value={h(k.resolutionH)} delta={pctDelta(k.resolutionH, k.resolutionPrev)} goodWhen="down" sub="median" />
          <Stat label="SLA met" value={k.slaCompliance != null ? `${k.slaCompliance}%` : '–'} sub="of resolved tickets" />
          <Stat label="Customer rating" value={k.csat != null ? `${k.csat.toFixed(1)} / 5` : '–'} sub={`${k.csatResponses} responses`} />
          <Stat label="Incidents" value={k.incidents} sub="confirmed or resolved" />
        </StatRow>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Panel title="Volume by department">
          <div className="h-64">
            <ResponsiveContainer>
              <BarChart data={daily} margin={{ left: -24, right: 4, top: 4 }}>
                <CartesianGrid vertical={false} stroke={c.line} />
                <XAxis dataKey="day" {...axis} interval={days === '14' ? 1 : 0} />
                <YAxis {...axis} allowDecimals={false} />
                <Tooltip {...tip} />
                <Legend wrapperStyle={{ fontSize: 11, color: c.muted }} iconSize={8} />
                {data.teamsList.map((t, i) => <RBar key={t} dataKey={t} stackId="t" fill={TEAM_TONES[i]} radius={i === data.teamsList.length - 1 ? [3, 3, 0, 0] : 0} />)}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel title="Sentiment trend" sub="Share of tickets, 3-day rolling">
          <div className="h-64">
            <ResponsiveContainer>
              <AreaChart data={daily} margin={{ left: -24, right: 4, top: 4 }} stackOffset="expand">
                <CartesianGrid vertical={false} stroke={c.line} />
                <XAxis dataKey="day" {...axis} interval={days === '14' ? 1 : 0} />
                <YAxis {...axis} tickFormatter={(v) => `${Math.round(v * 100)}%`} />
                <Tooltip {...tip} formatter={(v, n) => [`${v}%`, n]} />
                <Legend wrapperStyle={{ fontSize: 11 }} iconSize={8} />
                <Area type="monotone" dataKey="negPct" name="Negative" stackId="s" stroke={c.neg} fill={c.neg} fillOpacity={0.55} connectNulls />
                <Area type="monotone" dataKey="neuPct" name="Neutral" stackId="s" stroke={c.neu} fill={c.neu} fillOpacity={0.3} connectNulls />
                <Area type="monotone" dataKey="posPct" name="Positive" stackId="s" stroke={c.pos} fill={c.pos} fillOpacity={0.45} connectNulls />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel title="Resolution time" sub="Median hours, by day resolved">
          <div className="h-56">
            <ResponsiveContainer>
              <LineChart data={daily} margin={{ left: -24, right: 8, top: 4 }}>
                <CartesianGrid vertical={false} stroke={c.line} />
                <XAxis dataKey="day" {...axis} interval={days === '14' ? 1 : 0} />
                <YAxis {...axis} unit="h" />
                <Tooltip {...tip} formatter={(v) => [`${v}h`, 'median']} />
                <Line type="monotone" dataKey="resolutionH" stroke={c.ink} strokeWidth={1.75} dot={{ r: 2.5 }} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <div className="grid gap-6 sm:grid-cols-2">
          <Panel title="By intake priority">
            <ul className="space-y-3.5">
              {data.bands.map((b) => (
                <li key={b.band}>
                  <div className="flex items-center justify-between text-[13px]"><Band band={b.band} withLabel /><span className="num font-mono">{b.count}</span></div>
                  <div className="mt-1.5"><Bar value={b.count} max={maxBand} tone={{ P1: 'bg-p1', P2: 'bg-p2', P3: 'bg-p3', P4: 'bg-p4' }[b.band]} /></div>
                </li>
              ))}
            </ul>
          </Panel>
          <Panel title="Recurring problems" sub="Most-matched classifier phrases">
            <ol className="space-y-2.5">
              {data.recurring.map((r) => (
                <li key={r.phrase}>
                  <div className="flex items-baseline justify-between text-[13px]"><span>&ldquo;{r.phrase}&rdquo;</span><span className="num font-mono text-muted">{r.count}</span></div>
                  <div className="mt-1"><Bar value={r.count} max={maxRec} className="h-1" tone="bg-ink-2" /></div>
                </li>
              ))}
            </ol>
          </Panel>
        </div>
      </div>

      <Panel className="mt-6" title="Team performance" bodyClass="overflow-x-auto">
        <table className="w-full min-w-[560px] text-left text-[13px]">
          <thead className="border-b border-line bg-sunken text-[11px] uppercase tracking-[0.05em] text-muted">
            <tr><th className="px-5 py-2.5 font-medium">Team</th><th className="px-3 py-2.5 text-right font-medium">Open</th><th className="px-3 py-2.5 text-right font-medium">Resolved</th><th className="px-3 py-2.5 text-right font-medium">Median time</th><th className="px-3 py-2.5 text-right font-medium">SLA met</th><th className="px-5 py-2.5 text-right font-medium">Rating</th></tr>
          </thead>
          <tbody className="num divide-y divide-line font-mono">
            {data.teamPerformance.map((t) => (
              <tr key={t.team}>
                <td className="px-5 py-3 font-sans font-medium">{t.team}</td>
                <td className="px-3 py-3 text-right">{t.open}</td>
                <td className="px-3 py-3 text-right">{t.resolved}</td>
                <td className="px-3 py-3 text-right">{h(t.medianH)}</td>
                <td className={`px-3 py-3 text-right ${t.sla != null && t.sla < 80 ? 'text-p1' : ''}`}>{t.sla != null ? `${t.sla}%` : '–'}</td>
                <td className="px-5 py-3 text-right">{t.csat != null ? t.csat.toFixed(1) : '–'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </Page>
  );
}
