import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowFatLinesUp } from '@phosphor-icons/react';
import { Page, PageHeader, Tabs, SlaClock, Avatar } from '../../components/kit.jsx';
import { Band, Skeleton, ErrorNote, Empty, ScoreMeter } from '../../components/ui.jsx';
import { useApi, timeAgo } from '../../lib/api.js';

const LEVEL = { Manager: 'bg-p1 text-white', L2: 'bg-p1-bg text-p1', L1: 'bg-p2-bg text-p2' };

export default function Escalations() {
  const { data, error, loading, reload } = useApi('/escalations');
  const [tab, setTab] = useState('all');
  if (loading && !data) return <Page><Skeleton className="h-8 w-48" /><Skeleton className="mt-6 h-80" /></Page>;
  if (error) return <Page><ErrorNote error={error} onRetry={reload} /></Page>;

  const rows = data.tickets.filter((t) => tab === 'all' || (tab === 'manual' ? !t.escalation.auto : tab === 'auto' ? t.escalation.auto : t.escalation.level === tab));
  const count = (fn) => data.tickets.filter(fn).length;

  return (
    <Page>
      <PageHeader title="Escalations"
        sub="Tickets raised by an agent, plus tickets escalated automatically by a rule (SLA breach, confirmed incident, security signal, repeat contact). Manual escalations take precedence over automatic ones." />
      <Tabs className="mt-5" value={tab} onChange={setTab} items={[
        { value: 'all', label: 'All', count: data.tickets.length },
        { value: 'Manager', label: 'Manager', count: count((t) => t.escalation.level === 'Manager') },
        { value: 'L2', label: 'L2', count: count((t) => t.escalation.level === 'L2') },
        { value: 'L1', label: 'L1', count: count((t) => t.escalation.level === 'L1') },
        { value: 'manual', label: 'Raised by agents', count: count((t) => !t.escalation.auto) },
        { value: 'auto', label: 'By rule', count: count((t) => t.escalation.auto) },
      ]} />
      <div className="panel mt-4 overflow-hidden">
        {rows.length === 0 && <Empty icon={ArrowFatLinesUp} title="Nothing escalated here" />}
        <ul className="divide-y divide-line">
          {rows.map((t) => (
            <li key={t.id}>
              <Link to={`/agent/tickets/${t.id}`} className="flex flex-col gap-3 px-4 py-4 hover:bg-sunken sm:flex-row sm:items-center sm:px-5">
                <span className={`w-fit shrink-0 rounded px-2 py-1 font-mono text-[11px] font-semibold ${LEVEL[t.escalation.level]}`}>{t.escalation.level}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2"><Band band={t.priority.band} /><p className="truncate text-[14px] font-medium">{t.subject}</p></div>
                  <p className="mt-1 text-[12.5px] text-ink-2">
                    {t.escalation.auto ? <>Rule {t.escalation.rule}: {t.escalation.reason}</> : <>{t.escalation.reason} <span className="text-muted">by {t.escalation.by}, {timeAgo(t.escalation.at)}</span></>}
                  </p>
                  <p className="mt-1 flex flex-wrap items-center gap-x-2 font-mono text-[11px] text-muted">
                    {t.id} &middot; {t.team} &middot; {t.assigneeName ? <span className="inline-flex items-center gap-1"><Avatar name={t.assigneeName} size={15} />{t.assigneeName}</span> : <span className="text-p2">unassigned</span>}
                  </p>
                </div>
                <div className="flex items-center gap-4 sm:flex-col sm:items-end sm:gap-1.5">
                  <SlaClock sla={t.sla} />
                  <ScoreMeter score={t.priority.score} band={t.priority.band} />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </Page>
  );
}
