import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Tray, PlusCircle, Megaphone, Star, CaretRight } from '@phosphor-icons/react';
import { Tabs } from '../../components/kit.jsx';
import { StatusPill, Skeleton, ErrorNote, Empty, Button } from '../../components/ui.jsx';
import { useApi, timeAgo } from '../../lib/api.js';
import { Tracker } from './PortalTicket.jsx';

export default function PortalRequests() {
  const { data, error, loading, reload } = useApi('/my/tickets');
  const [tab, setTab] = useState('active');
  const all = data?.tickets || [];
  const active = all.filter((t) => t.status !== 'resolved');
  const list = tab === 'active' ? active : tab === 'resolved' ? all.filter((t) => t.status === 'resolved') : all;
  const toRate = all.filter((t) => t.status === 'resolved' && !t.feedback).length;

  return (
    <div className="mx-auto max-w-4xl px-4 pb-28 pt-6 sm:px-6 md:pb-14 md:pt-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-semibold tracking-tight">My requests</h1>
          <p className="mt-1 text-[14px] text-ink-2">Track progress, reply to the team and rate resolved requests.</p>
        </div>
        <Button as={Link} to="/portal"><PlusCircle size={16} /> New request</Button>
      </div>

      {toRate > 0 && tab !== 'resolved' && (
        <button type="button" onClick={() => setTab('resolved')} className="mt-6 flex w-full items-center gap-3 rounded-md border border-line bg-surface px-4 py-3 text-left text-[13.5px] hover:bg-sunken">
          <Star size={18} className="shrink-0" />
          <span className="flex-1">{toRate} resolved request{toRate > 1 ? 's are' : ' is'} waiting for your rating</span>
          <CaretRight size={14} className="text-muted" />
        </button>
      )}

      <Tabs className="mt-6" value={tab} onChange={setTab} items={[
        { value: 'active', label: 'Active', count: active.length },
        { value: 'resolved', label: 'Resolved', count: all.length - active.length },
        { value: 'all', label: 'All', count: all.length },
      ]} />

      <div className="mt-4">
        <ErrorNote error={error} onRetry={reload} />
        {loading && !data && <div className="space-y-3"><Skeleton className="h-28" /><Skeleton className="h-28" /></div>}
        {data && list.length === 0 && (
          <div className="panel"><Empty icon={Tray} title={tab === 'active' ? 'Nothing open right now' : 'No requests here yet'} hint="When you raise a request it appears here with its progress."
            action={<Button as={Link} to="/portal" variant="secondary" size="sm">Raise a request</Button>} /></div>
        )}
        <ul className="space-y-3">
          {list.map((t) => {
            const step = t.steps.findLast((s) => s.done);
            return (
              <li key={t.id}>
                <Link to={`/portal/tickets/${t.id}`} className="panel block p-4 transition-colors hover:border-line-strong sm:p-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[11.5px] text-muted">{t.id}</span>
                    <StatusPill status={t.status} />
                    {t.incident && <span className="inline-flex items-center gap-1 rounded-full bg-p2-bg px-2 py-0.5 text-[11px] font-medium text-p2"><Megaphone size={12} /> Known issue</span>}
                    {t.status === 'resolved' && !t.feedback && <span className="inline-flex items-center gap-1 rounded-full border border-line-strong px-2 py-0.5 text-[11px] font-medium"><Star size={11} /> Rate this</span>}
                    <span className="ml-auto font-mono text-[11px] text-muted">{timeAgo(t.createdAt)}</span>
                  </div>
                  <p className="mt-2 text-[15px] font-semibold">{t.subject}</p>
                  <p className="mt-0.5 line-clamp-1 text-[13px] text-muted">{t.message}</p>
                  <div className="mt-3.5"><Tracker steps={t.steps} compact /></div>
                  <p className="mt-2 text-[12px] text-ink-2">{step.label}{t.assignee && t.status !== 'resolved' ? ` · ${t.assignee.name} from ${t.team}` : ` · ${t.team}`}</p>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
