import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, AreaChart, Area } from 'recharts';
import { Skeleton, ErrorNote, Band } from '../../components/ui.jsx';
import { useApi } from '../../lib/api.js';
import { useTokens } from '../../lib/tokens.js';

const dayLabel = (d) => new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

export default function Analytics() {
  const { data, error, loading, reload } = useApi('/analytics');
  const c = useTokens();

  if (loading) return <div className="space-y-4 px-5 py-6 lg:px-8"><Skeleton className="h-6 w-40" /><Skeleton className="h-24" /><Skeleton className="h-72" /></div>;
  if (error) return <div className="px-5 py-6 lg:px-8"><ErrorNote error={error} onRetry={reload} /></div>;

  const k = data.kpis;
  // Share is computed over a trailing 3-day window: single days can hold one
  // ticket, which turns the line into 0/100 noise.
  const daily = data.daily.map((d, i, arr) => {
    const win = arr.slice(Math.max(0, i - 2), i + 1);
    const tot = win.reduce((s, x) => s + x.total, 0);
    const neg = win.reduce((s, x) => s + x.negative, 0);
    return { ...d, day: dayLabel(d.date), negShare: tot ? Math.round((neg / tot) * 100) : null };
  });
  const axis = { stroke: c.muted, fontSize: 11, tickLine: false, axisLine: false };
  const tooltip = {
    contentStyle: { background: c.surface, border: `1px solid ${c.line}`, borderRadius: 8, fontSize: 12, boxShadow: 'none' },
    labelStyle: { color: c.ink, fontWeight: 600, marginBottom: 4 },
    itemStyle: { padding: 0 },
    cursor: { fill: c.sunken },
  };
  const maxTeam = Math.max(1, ...data.teams.map((t) => t.open + t.resolved));
  const maxCat = Math.max(1, ...data.categories.map((x) => x.count));

  return (
    <div className="px-5 py-6 lg:px-8">
      <h1 className="text-xl font-semibold tracking-tight">Analytics</h1>
      <p className="mt-1 text-[13px] text-muted">Last 14 days, {k.total} tickets.</p>

      <section className="panel mt-6 grid grid-cols-2 divide-line sm:grid-cols-3 xl:grid-cols-6 [&>*]:border-line">
        <Kpi label="Active" value={k.active} />
        <Kpi label="Critical open" value={k.criticalOpen} tone={k.criticalOpen ? 'text-p1' : ''} />
        <Kpi label="First response" value={`${k.medianFirstResponseH}h`} sub="median" />
        <Kpi label="Resolution" value={`${k.medianResolutionH}h`} sub="median" />
        <Kpi label="Within SLA" value={`${k.slaCompliance}%`} sub="of resolved" />
        <Kpi label="Model agreement" value={`${k.modelAgreement}%`} sub="not corrected by agents" />
      </section>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
        <section className="panel p-5">
          <Head title="Ticket volume by priority" />
          <div className="mt-4 h-64">
            <ResponsiveContainer>
              <BarChart data={daily} margin={{ left: -24, right: 4, top: 4 }}>
                <CartesianGrid vertical={false} stroke={c.line} />
                <XAxis dataKey="day" {...axis} interval={1} />
                <YAxis {...axis} allowDecimals={false} />
                <Tooltip {...tooltip} />
                <Bar dataKey="P4" stackId="a" fill={c.p4} name="P4 Low" />
                <Bar dataKey="P3" stackId="a" fill={c.p3} name="P3 Medium" />
                <Bar dataKey="P2" stackId="a" fill={c.p2} name="P2 High" />
                <Bar dataKey="P1" stackId="a" fill={c.p1} name="P1 Critical" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="panel p-5">
          <Head title="Open by priority" />
          <ul className="mt-4 space-y-3">
            {data.bands.map((b) => (
              <li key={b.band} className="flex items-center gap-3">
                <Band band={b.band} />
                <span className="flex-1 text-[13px] text-ink-2">{b.label}</span>
                <span className="num font-mono text-[15px] font-semibold">{b.count}</span>
              </li>
            ))}
          </ul>
          <div className="mt-6 border-t border-line pt-4">
            <p className="eyebrow">Auto-routed</p>
            <p className="num mt-1 font-mono text-2xl font-semibold">{k.autoRouted}%</p>
            <p className="mt-1 text-xs text-muted">Sent to a team without manual triage review.</p>
          </div>
        </section>

        <section className="panel p-5">
          <Head title="Negative sentiment share" note={`3-day rolling, ${k.negativeShare}% overall`} />
          <div className="mt-4 h-52">
            <ResponsiveContainer>
              <AreaChart data={daily} margin={{ left: -24, right: 4, top: 4 }}>
                <defs>
                  <linearGradient id="neg" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={c.neg} stopOpacity={0.22} />
                    <stop offset="100%" stopColor={c.neg} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke={c.line} />
                <XAxis dataKey="day" {...axis} interval={1} />
                <YAxis {...axis} unit="%" domain={[0, 100]} />
                <Tooltip {...tooltip} formatter={(v) => [`${v}%`, 'Negative']} />
                <Area type="monotone" dataKey="negShare" stroke={c.neg} strokeWidth={1.75} fill="url(#neg)" connectNulls />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="panel p-5">
          <Head title="Team load" />
          <ul className="mt-4 space-y-3.5">
            {data.teams.map((t) => (
              <li key={t.team}>
                <div className="flex items-baseline justify-between text-[13px]">
                  <span className="truncate">{t.team}</span>
                  <span className="num font-mono text-xs text-muted"><span className="text-ink">{t.open}</span> open &middot; {t.resolved} done</span>
                </div>
                <div className="mt-1.5 flex h-1.5 gap-px" aria-hidden="true">
                  <span className="rounded-l-sm bg-ink" style={{ width: `${(t.open / maxTeam) * 100}%` }} />
                  <span className="rounded-r-sm bg-line-strong" style={{ width: `${(t.resolved / maxTeam) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="panel p-5">
          <Head title="Recurring problems" note="phrases the classifier matched most" />
          <ol className="mt-4 grid gap-x-8 gap-y-2.5 sm:grid-cols-2">
            {data.recurring.map((r, i) => (
              <li key={r.phrase} className="flex items-baseline gap-3 text-[13px]">
                <span className="num w-5 font-mono text-[11px] text-muted">{String(i + 1).padStart(2, '0')}</span>
                <span className="flex-1">&ldquo;{r.phrase}&rdquo;</span>
                <span className="num font-mono text-muted">{r.count}</span>
              </li>
            ))}
          </ol>
        </section>

        <section className="panel p-5">
          <Head title="Category mix" />
          <ul className="mt-4 space-y-3">
            {data.categories.map((x) => (
              <li key={x.key} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 text-[13px]">
                <span>{x.label}</span>
                <span className="num font-mono text-muted">{x.count}</span>
                <span className="col-span-2 h-1 rounded-sm bg-ink-2" style={{ width: `${(x.count / maxCat) * 100}%` }} aria-hidden="true" />
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

function Kpi({ label, value, sub, tone = '' }) {
  return (
    <div className="border-b border-r p-4 last:border-r-0 xl:border-b-0">
      <p className="text-[12px] text-muted">{label}</p>
      <p className={`num mt-1 font-mono text-[22px] font-semibold tracking-tight ${tone}`}>{value}</p>
      {sub && <p className="mt-0.5 text-[11px] text-muted">{sub}</p>}
    </div>
  );
}

function Head({ title, note }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <h2 className="text-sm font-semibold">{title}</h2>
      {note && <span className="text-xs text-muted">{note}</span>}
    </div>
  );
}
