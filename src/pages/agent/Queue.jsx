import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { MagnifyingGlass, X, Tray, ArrowsClockwise, CaretDown, PushPin } from '@phosphor-icons/react';
import { Band, Sentiment, ScoreMeter, StatusPill, Skeleton, ErrorNote, Empty, Tier } from '../../components/ui.jsx';
import { Page, PageHeader, Tabs, SlaClock, Avatar } from '../../components/kit.jsx';
import { useApi, timeAgo } from '../../lib/api.js';

const TEAMS = ['Technical Support', 'Billing', 'Logistics', 'Account & Security', 'Customer Care'];
const FLAG = {
  sla: 'text-p1 bg-p1-bg', 'sla-warn': 'text-p2 bg-p2-bg', escalated: 'text-p1 bg-p1-bg', incident: 'text-p1 bg-p1-bg',
  candidate: 'text-p2 bg-p2-bg', unassigned: 'text-muted bg-sunken', enterprise: 'text-ink-2 bg-sunken',
};

export default function Queue() {
  const [params, setParams] = useSearchParams();
  const nav = useNavigate();
  const [q, setQ] = useState(params.get('q') || '');
  const f = Object.fromEntries(['status', 'team', 'band', 'sentiment', 'sort', 'q', 'assignee', 'sla', 'escalated', 'incident'].map((k) => [k, params.get(k) || '']));
  const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v)).toString();
  const { data, error, loading, reload } = useApi(`/tickets?${qs}`);

  useEffect(() => { setQ(params.get('q') || ''); }, [params]);
  useEffect(() => {
    const id = setTimeout(() => { if (q !== f.q) set('q', q); }, 300);
    return () => clearTimeout(id);
  }, [q]); // eslint-disable-line react-hooks/exhaustive-deps

  function set(key, value) {
    const next = new URLSearchParams(params);
    value ? next.set(key, value) : next.delete(key);
    setParams(next, { replace: true });
  }
  function toggle(key, value) { set(key, f[key] === value ? '' : value); }

  const rows = data?.tickets || [];
  const counts = data?.counts;
  const mine = f.assignee === 'me';
  const hasFilters = ['band', 'sentiment', 'q', 'sla', 'escalated', 'incident', 'status'].some((k) => f[k]) || (f.assignee && !mine);

  return (
    <Page>
      <PageHeader title={mine ? 'My tickets' : f.team || 'All tickets'}
        sub="Ordered by hybrid priority: AI urgency and impact, plus live waiting time and SLA risk. Pinned tickets belong to a confirmed critical incident."
        actions={
          <div className="flex gap-1.5" role="group" aria-label="Filter by live priority">
            {['P1', 'P2', 'P3', 'P4'].map((b) => (
              <button key={b} type="button" onClick={() => toggle('band', b)} aria-pressed={f.band === b}
                className={`flex items-center gap-2 rounded-md border px-2.5 py-1.5 transition-colors ${f.band === b ? 'border-ink bg-surface' : 'border-line bg-surface hover:border-line-strong'}`}>
                <Band band={b} /><span className="num font-mono text-[13px]">{counts?.byBand?.[b] || 0}</span>
              </button>
            ))}
          </div>
        } />

      {!mine && (
        <Tabs className="mt-5" value={f.team} onChange={(v) => set('team', v)}
          items={[{ value: '', label: 'All departments', count: counts?.active }, ...TEAMS.map((t) => ({ value: t, label: t, count: counts?.byTeam?.[t] || 0 }))]} />
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-72">
          <MagnifyingGlass size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
          <input className="field h-8 pl-8 text-[13px]" placeholder="Search tickets, customers, IDs" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search" />
        </div>
        <Chip on={f.assignee === 'unassigned'} onClick={() => toggle('assignee', 'unassigned')} label="Unassigned" count={counts?.unassigned} />
        <Chip on={f.sla === 'breached'} onClick={() => toggle('sla', 'breached')} label="SLA breached" count={counts?.breached} alert />
        <Chip on={f.sla === 'warning'} onClick={() => toggle('sla', 'warning')} label="Due soon" />
        <Chip on={f.escalated === '1'} onClick={() => toggle('escalated', '1')} label="Escalated" count={counts?.escalated} />
        <Select label="Status" value={f.status} onChange={(v) => set('status', v)}
          options={[['', 'Active'], ['open', 'Open'], ['in_progress', 'In progress'], ['resolved', 'Resolved'], ['all', 'All statuses']]} />
        <Select label="Sentiment" value={f.sentiment} onChange={(v) => set('sentiment', v)}
          options={[['', 'Any sentiment'], ['negative', 'Negative'], ['neutral', 'Neutral'], ['positive', 'Positive']]} />
        <Select label="Sort" value={f.sort} onChange={(v) => set('sort', v)}
          options={[['', 'Priority'], ['sla', 'SLA due first'], ['newest', 'Newest'], ['oldest', 'Oldest']]} />
        {hasFilters && (
          <button type="button" onClick={() => { setQ(''); setParams(mine ? { assignee: 'me' } : f.team ? { team: f.team } : {}, { replace: true }); }}
            className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-[13px] text-muted hover:text-ink"><X size={13} /> Clear</button>
        )}
        <button type="button" onClick={reload} aria-label="Refresh" className="ml-auto grid size-8 place-items-center rounded-md text-muted hover:bg-surface hover:text-ink">
          <ArrowsClockwise size={15} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="panel mt-4 overflow-hidden">
        <ErrorNote error={error} onRetry={reload} />
        {loading && !data && (
          <div className="divide-y divide-line">{Array.from({ length: 8 }, (_, i) => <div key={i} className="flex gap-4 px-4 py-4"><Skeleton className="h-4 w-8" /><Skeleton className="h-4 flex-1" /><Skeleton className="h-4 w-24" /></div>)}</div>
        )}
        {data && rows.length === 0 && <Empty icon={Tray} title={mine ? 'Nothing assigned to you' : 'No tickets match'} hint={mine ? 'Pick one up from Expert assignment.' : 'Clear a filter or search for something else.'} />}

        {/* Desktop table */}
        {rows.length > 0 && (
          <table className="hidden w-full text-left md:table">
            <thead className="border-b border-line bg-sunken">
              <tr className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted">
                <th className="py-2.5 pl-4 pr-2 font-medium">Pri</th>
                <th className="w-full px-2 py-2.5 font-medium">Ticket</th>
                <th className="hidden px-2 py-2.5 font-medium xl:table-cell">Customer</th>
                <th className="hidden px-2 py-2.5 font-medium lg:table-cell">Owner</th>
                <th className="px-2 py-2.5 font-medium">SLA</th>
                <th className="py-2.5 pl-2 pr-4 text-right font-medium">Score</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((t) => (
                <tr key={t.id} onClick={() => nav(`/agent/tickets/${t.id}`)} className={`cursor-pointer transition-colors hover:bg-sunken ${t.priority.pinned ? 'bg-p1-bg/40' : ''}`}>
                  <td className="py-3.5 pl-4 pr-2 align-top">
                    <div className="flex flex-col items-start gap-1"><Band band={t.priority.band} />{t.priority.pinned && <PushPin size={12} weight="fill" className="text-p1" aria-label="Pinned" />}</div>
                  </td>
                  <td className="w-full max-w-0 px-2 py-3.5 align-top">
                    <Link to={`/agent/tickets/${t.id}`} onClick={(e) => e.stopPropagation()} className="block truncate text-[14px] font-medium hover:underline">{t.subject}</Link>
                    <p className="mt-0.5 truncate text-[13px] text-muted">{t.snippet}</p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[11px] text-muted">
                      <span>{t.id}</span><span>&middot;</span><span>{timeAgo(t.createdAt)}</span><span>&middot;</span><Sentiment label={t.sentiment.label} />
                      {t.status !== 'open' && <StatusPill status={t.status} />}
                      {t.flags.filter((x) => x.key !== 'unassigned' && x.key !== 'enterprise').map((x) => <span key={x.key} className={`whitespace-nowrap rounded px-1.5 py-px font-sans ${FLAG[x.key]}`}>{x.label}</span>)}
                    </div>
                  </td>
                  <td className="hidden px-2 py-3.5 align-top xl:table-cell">
                    <p className="whitespace-nowrap text-[13px]">{t.customerName}</p>
                    <div className="mt-1"><Tier tier={t.customerTier} /></div>
                  </td>
                  <td className="hidden px-2 py-3.5 align-top lg:table-cell">
                    {t.assigneeName
                      ? <span className="flex items-center gap-2 whitespace-nowrap text-[13px]"><Avatar name={t.assigneeName} size={22} />{t.assigneeName.split(' ')[0]}</span>
                      : <span className="whitespace-nowrap text-[13px] text-muted">Unassigned</span>}
                    <p className="mt-1 whitespace-nowrap text-[11px] text-muted">{t.team}</p>
                  </td>
                  <td className="whitespace-nowrap px-2 py-3.5 align-top"><SlaClock sla={t.sla} /></td>
                  <td className="whitespace-nowrap py-3.5 pl-2 pr-4 text-right align-top"><ScoreMeter score={t.priority.score} band={t.priority.band} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Mobile cards */}
        {rows.length > 0 && (
          <ul className="divide-y divide-line md:hidden">
            {rows.map((t) => (
              <li key={t.id}>
                <Link to={`/agent/tickets/${t.id}`} className={`block px-4 py-3.5 active:bg-sunken ${t.priority.pinned ? 'bg-p1-bg/40' : ''}`}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2"><Band band={t.priority.band} /><span className="font-mono text-[11px] text-muted">{t.id}</span>{t.priority.pinned && <PushPin size={12} weight="fill" className="text-p1" />}</div>
                    <ScoreMeter score={t.priority.score} band={t.priority.band} />
                  </div>
                  <p className="mt-2 line-clamp-2 text-[14.5px] font-medium leading-snug">{t.subject}</p>
                  <p className="mt-1 text-[12.5px] text-muted">{t.customerName} &middot; {t.assigneeName ? t.assigneeName.split(' ')[0] : 'Unassigned'} &middot; {timeAgo(t.createdAt)}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                    <SlaClock sla={t.sla} />
                    <Sentiment label={t.sentiment.label} />
                    {t.flags.filter((x) => ['sla', 'escalated', 'incident', 'candidate'].includes(x.key)).slice(0, 2).map((x) => <span key={x.key} className={`rounded px-1.5 py-px text-[11px] ${FLAG[x.key]}`}>{x.label}</span>)}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
      {rows.length > 0 && <p className="mt-3 font-mono text-[11px] text-muted">{rows.length} ticket{rows.length === 1 ? '' : 's'}</p>}
    </Page>
  );
}

function Chip({ on, onClick, label, count, alert }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on}
      className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[12.5px] font-medium transition-colors ${on ? 'border-ink bg-invert text-on-invert' : 'border-line-strong bg-surface text-ink-2 hover:border-faint'}`}>
      {label}
      {count != null && count > 0 && <span className={`num font-mono text-[11px] ${on ? 'opacity-70' : alert ? 'text-p1' : 'text-muted'}`}>{count}</span>}
    </button>
  );
}

function Select({ label, value, onChange, options }) {
  return (
    <label className="relative">
      <span className="sr-only">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="field h-8 w-auto cursor-pointer appearance-none rounded-full py-0 pl-3 pr-7 text-[12.5px]">
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
      <CaretDown size={11} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-muted" />
    </label>
  );
}
