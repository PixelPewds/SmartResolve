import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { MagnifyingGlass, X, Tray, WarningCircle, ArrowsClockwise, CaretDown } from '@phosphor-icons/react';
import { Band, Sentiment, ScoreMeter, StatusPill, Skeleton, ErrorNote, Empty, Tier } from '../../components/ui.jsx';
import { useApi, timeAgo } from '../../lib/api.js';

const FLAG_STYLE = {
  sla: 'text-p1 bg-p1-bg', security: 'text-p1 bg-p1-bg', repeat: 'text-p2 bg-p2-bg',
  impact: 'text-p2 bg-p2-bg', sentiment: 'text-neg bg-neg-bg',
};

export default function Queue({ flaggedOnly = false }) {
  const [params, setParams] = useSearchParams();
  const nav = useNavigate();
  const [q, setQ] = useState(params.get('q') || '');

  const filters = {
    status: params.get('status') || 'active',
    team: params.get('team') || '',
    band: params.get('band') || '',
    sentiment: params.get('sentiment') || '',
    sort: params.get('sort') || 'priority',
    q: params.get('q') || '',
  };
  const qs = new URLSearchParams(Object.entries({ ...filters, ...(flaggedOnly ? { flagged: '1' } : {}) }).filter(([, v]) => v)).toString();
  const { data, error, loading, reload } = useApi(`/tickets?${qs}`);

  // Debounced search so typing does not fire a request per keystroke.
  useEffect(() => {
    const id = setTimeout(() => { if (q !== filters.q) update('q', q); }, 250);
    return () => clearTimeout(id);
  }, [q]); // eslint-disable-line react-hooks/exhaustive-deps

  function update(key, value) {
    const next = new URLSearchParams(params);
    value ? next.set(key, value) : next.delete(key);
    setParams(next, { replace: true });
  }

  const active = Object.entries(filters).filter(([k, v]) => v && !(k === 'status' && v === 'active') && !(k === 'sort' && v === 'priority'));
  const rows = data?.tickets || [];
  const bandCounts = data?.counts?.byBand || {};

  const title = flaggedOnly ? 'Escalations' : filters.team || 'Queue';
  const subtitle = flaggedOnly
    ? 'Tickets past their response target, repeat contacts, enterprise P1/P2, and possible account compromise.'
    : 'Sorted by priority score. Highest risk first.';

  return (
    <div className="px-5 py-6 lg:px-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-1 text-[13px] text-muted">{subtitle}</p>
        </div>
        {!flaggedOnly && (
          <div className="flex gap-1.5" role="group" aria-label="Filter by priority">
            {['P1', 'P2', 'P3', 'P4'].map((b) => (
              <button key={b} onClick={() => update('band', filters.band === b ? '' : b)} aria-pressed={filters.band === b}
                className={`flex items-center gap-2 rounded-md border px-2.5 py-1.5 transition-colors ${filters.band === b ? 'border-ink bg-surface' : 'border-line bg-surface hover:border-line-strong'}`}>
                <Band band={b} />
                <span className="num font-mono text-[13px]">{bandCounts[b] || 0}</span>
              </button>
            ))}
          </div>
        )}
      </header>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1 sm:max-w-xs">
          <MagnifyingGlass size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
          <input className="field h-8 pl-8 text-[13px]" placeholder="Search tickets, customers, IDs" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search" />
        </div>
        <Select label="Status" value={filters.status} onChange={(v) => update('status', v === 'active' ? '' : v)}
          options={[['active', 'Active'], ['open', 'Open'], ['in_progress', 'In progress'], ['resolved', 'Resolved'], ['all', 'All']]} />
        <Select label="Sentiment" value={filters.sentiment} onChange={(v) => update('sentiment', v)}
          options={[['', 'Any sentiment'], ['negative', 'Negative'], ['neutral', 'Neutral'], ['positive', 'Positive']]} />
        <Select label="Sort" value={filters.sort} onChange={(v) => update('sort', v === 'priority' ? '' : v)}
          options={[['priority', 'Priority'], ['newest', 'Newest'], ['oldest', 'Oldest']]} />
        {active.length > 0 && (
          <button onClick={() => { setQ(''); setParams({}, { replace: true }); }} className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-[13px] text-muted hover:text-ink">
            <X size={13} /> Clear
          </button>
        )}
        <button onClick={reload} aria-label="Refresh" className="ml-auto grid size-8 place-items-center rounded-md text-muted hover:bg-surface hover:text-ink">
          <ArrowsClockwise size={15} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="panel mt-4 overflow-hidden">
        <ErrorNote error={error} onRetry={reload} />
        {loading && !data && (
          <div className="divide-y divide-line">{Array.from({ length: 8 }, (_, i) => <div key={i} className="flex gap-4 px-4 py-3.5"><Skeleton className="h-4 w-8" /><Skeleton className="h-4 flex-1" /><Skeleton className="h-4 w-24" /></div>)}</div>
        )}
        {data && rows.length === 0 && (
          flaggedOnly
            ? <Empty icon={WarningCircle} title="Nothing needs escalating" hint="Every active ticket is inside its response target with no risk flags." />
            : <Empty icon={Tray} title="No tickets match" hint="Try clearing a filter or searching for something else." />
        )}
        {rows.length > 0 && (
          <table className="w-full text-left">
            <thead className="hidden border-b border-line bg-sunken md:table-header-group">
              <tr className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted">
                <th className="py-2 pl-4 pr-2 font-medium">Pri</th>
                <th className="w-full px-2 py-2 font-medium">Ticket</th>
                <th className="hidden px-2 py-2 font-medium xl:table-cell">Customer</th>
                <th className="hidden px-2 py-2 font-medium lg:table-cell">Team</th>
                <th className="hidden px-2 py-2 font-medium sm:table-cell">Sentiment</th>
                <th className="py-2 pl-2 pr-4 text-right font-medium">Score</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((t) => (
                <tr key={t.id} onClick={() => nav(`/agent/tickets/${t.id}`)} className="cursor-pointer transition-colors hover:bg-sunken">
                  <td className="py-3 pl-4 pr-2 align-top"><Band band={t.priority.band} /></td>
                  <td className="w-full max-w-0 px-2 py-3 align-top">
                    <Link to={`/agent/tickets/${t.id}`} onClick={(e) => e.stopPropagation()} className="line-clamp-2 text-[14px] font-medium hover:underline sm:block sm:truncate">
                      {t.subject}
                    </Link>
                    <p className="mt-0.5 hidden truncate text-[13px] text-muted sm:block">{t.snippet}</p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[11px] text-muted">
                      <span>{t.id}</span><span>&middot;</span><span>{timeAgo(t.createdAt)}</span>
                      {t.status !== 'open' && <StatusPill status={t.status} />}
                      {t.flags.map((f) => <span key={f.key} className={`whitespace-nowrap rounded px-1.5 py-px font-sans ${FLAG_STYLE[f.key]}`}>{f.label}</span>)}
                    </div>
                  </td>
                  <td className="hidden px-2 py-3 align-top xl:table-cell">
                    <p className="whitespace-nowrap text-[13px]">{t.customerName}</p>
                    <div className="mt-1"><Tier tier={t.customerTier} /></div>
                  </td>
                  <td className="hidden whitespace-nowrap px-2 py-3 align-top text-[13px] text-ink-2 lg:table-cell">{t.team}</td>
                  <td className="hidden whitespace-nowrap px-2 py-3 align-top sm:table-cell"><Sentiment label={t.sentiment.label} /></td>
                  <td className="whitespace-nowrap py-3 pl-2 pr-4 text-right align-top"><ScoreMeter score={t.priority.score} band={t.priority.band} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {rows.length > 0 && <p className="mt-3 font-mono text-[11px] text-muted">{rows.length} ticket{rows.length === 1 ? '' : 's'}</p>}
    </div>
  );
}

function Select({ label, value, onChange, options }) {
  return (
    <label className="relative">
      <span className="sr-only">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="field h-8 w-auto cursor-pointer appearance-none py-0 pr-7 text-[13px]">
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
      <CaretDown size={11} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-muted" />
    </label>
  );
}
