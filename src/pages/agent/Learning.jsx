import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Star, Info } from '@phosphor-icons/react';
import { Page, PageHeader, Panel, Stat, StatRow, Tabs, Bar } from '../../components/kit.jsx';
import { Skeleton, ErrorNote, Empty } from '../../components/ui.jsx';
import { useApi, timeAgo, fmtDateTime } from '../../lib/api.js';

const CAT = { billing: 'Billing', technical: 'Technical', delivery: 'Delivery', account: 'Account', general: 'General' };

export default function Learning() {
  const { data, error, loading, reload } = useApi('/learning');
  const [tab, setTab] = useState('eval');
  const [filter, setFilter] = useState('wrong');
  if (loading && !data) return <Page><Skeleton className="h-8 w-56" /><Skeleton className="mt-6 h-24" /><Skeleton className="mt-6 h-96" /></Page>;
  if (error) return <Page><ErrorNote error={error} onRetry={reload} /></Page>;

  const { csat, corrections, evaluation: ev } = data;
  const maxDist = Math.max(1, ...csat.distribution.map((d) => d.count));
  const rows = ev.rows.filter((r) => filter === 'all' || (filter === 'hard' ? r.hard : !r.correct.category || !r.correct.sentiment || !r.correct.urgency));

  return (
    <Page>
      <PageHeader title="Feedback & learning" sim="Customer ratings and the agent correction history are simulated. The model evaluation is run live on a hand-labelled test set every time this page loads."
        sub="Three sources of truth about how well the system is doing: what customers say, where agents disagreed with the AI, and how the AI scores against labelled examples." />

      <div className="mt-5">
        <StatRow cols="grid-cols-2 lg:grid-cols-4">
          <Stat label="Category accuracy" value={`${ev.overall.category}%`} sub={`${ev.overall.n} labelled cases`} />
          <Stat label="Sentiment accuracy" value={`${ev.overall.sentiment}%`} sub={`hard cases: ${ev.hard.sentiment}%`} />
          <Stat label="Urgency, exact" value={`${ev.overall.urgency}%`} sub={`within one level: ${ev.overall.urgencyNear}%`} />
          <Stat label="Customer rating" value={csat.average != null ? `${csat.average.toFixed(1)} / 5` : '–'} sub={`${csat.responses} responses, ${csat.responseRate}% of resolved`} />
        </StatRow>
      </div>

      <Tabs className="mt-6" value={tab} onChange={setTab} items={[
        { value: 'eval', label: 'Model evaluation' },
        { value: 'corrections', label: 'Agent corrections', count: corrections.total },
        { value: 'feedback', label: 'Customer feedback', count: csat.responses },
      ]} />

      {tab === 'eval' && (
        <div className="mt-4 space-y-6">
          <div className="flex items-start gap-2 rounded-md border border-line bg-surface px-3.5 py-2.5 text-[12.5px] text-ink-2">
            <Info size={15} className="mt-0.5 shrink-0 text-muted" />
            <span>
              Engine: {ev.engine}. {ev.overall.n} hand-labelled complaints, {ev.hard.n} of them deliberately hard (sarcasm, Hinglish, mixed issues, polite wording of a serious problem). This set was also used while building the rules, so treat these numbers as optimistic. A held-out set and the Hugging Face models are the next step.
            </span>
          </div>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <Panel title="Standard vs hard cases" sub="Accuracy by field">
              <table className="w-full text-[13px]">
                <thead className="text-[11px] uppercase tracking-[0.05em] text-muted"><tr><th className="pb-2 text-left font-medium">Field</th><th className="pb-2 text-right font-medium">Standard ({ev.standard.n})</th><th className="pb-2 text-right font-medium">Hard ({ev.hard.n})</th></tr></thead>
                <tbody className="num divide-y divide-line font-mono">
                  {[['Category', 'category'], ['Sentiment', 'sentiment'], ['Urgency, exact', 'urgency'], ['Urgency, within 1', 'urgencyNear']].map(([l, key]) => (
                    <tr key={key}><td className="py-2.5 font-sans">{l}</td><td className="py-2.5 text-right">{ev.standard[key]}%</td><td className={`py-2.5 text-right ${ev.hard[key] < 60 ? 'text-p1' : ''}`}>{ev.hard[key]}%</td></tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-3 text-[12px] text-muted">The drop on hard cases is the honest picture. Hinglish and urgency are the weakest areas.</p>
            </Panel>

            <Panel title="Category confusion matrix" sub="Rows: correct label. Columns: what the model predicted." bodyClass="overflow-x-auto p-5">
              <table className="w-full min-w-[380px] text-center text-[12.5px]">
                <thead><tr><th />{Object.values(CAT).map((l) => <th key={l} className="pb-2 font-medium text-muted">{l}</th>)}</tr></thead>
                <tbody className="num font-mono">
                  {ev.confusion.map((row) => (
                    <tr key={row.actual}>
                      <th className="py-1 pr-2 text-left font-sans text-[12.5px] font-medium">{CAT[row.actual]}</th>
                      {Object.entries(row.predicted).map(([p, n]) => (
                        <td key={p} className="p-0.5">
                          <span className={`block rounded py-1.5 ${n === 0 ? 'text-faint' : p === row.actual ? 'bg-invert text-on-invert' : 'bg-p1-bg text-p1'}`}>{n}</span>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>
          </div>

          <Panel title="Test cases" sub="Predicted vs expected, including the failures"
            action={<Tabs size="sm" value={filter} onChange={setFilter} items={[{ value: 'wrong', label: 'Wrong' }, { value: 'hard', label: 'Hard' }, { value: 'all', label: 'All' }]} />} bodyClass="">
            <ul className="divide-y divide-line">
              {rows.map((r) => (
                <li key={r.id} className="px-5 py-3.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[11px] text-muted">{r.id}</span>
                    {r.hard && <span className="rounded border border-line px-1.5 py-px text-[10.5px] text-ink-2">{r.hard}</span>}
                  </div>
                  <p className="mt-1 text-[13.5px]">&ldquo;{r.text}&rdquo;</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Check label="Category" exp={CAT[r.category]} got={CAT[r.predicted.category]} ok={r.correct.category} />
                    <Check label="Sentiment" exp={r.sentiment} got={r.predicted.sentiment} ok={r.correct.sentiment} />
                    <Check label="Urgency" exp={r.urgency} got={r.predicted.urgency} ok={r.correct.urgency} near={r.correct.urgencyNear} />
                  </div>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      )}

      {tab === 'corrections' && (
        <div className="mt-4 grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <Panel title="Corrections log" sub="Every time an agent overrode the AI" bodyClass="">
            {corrections.list.length === 0 && <Empty title="No corrections yet" />}
            <ul className="divide-y divide-line">
              {corrections.list.map((c, i) => (
                <li key={i} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-5 py-3">
                  <Link to={`/agent/tickets/${c.ticketId}`} className="font-mono text-[12px] hover:underline">{c.ticketId}</Link>
                  <span className="text-[13px]"><span className="capitalize">{c.field}</span>: <span className="text-p1 line-through">{c.from}</span> to <span className="font-medium">{c.to}</span></span>
                  <span className="min-w-0 flex-1 truncate text-[12px] text-muted">{c.subject}</span>
                  <span className="font-mono text-[11px] text-muted">{c.by} &middot; {timeAgo(c.at)}{c.atResolution ? ' · at resolution' : ''}</span>
                </li>
              ))}
            </ul>
          </Panel>
          <Panel title="What corrections tell us">
            <dl className="space-y-3 text-[13px]">
              <div className="flex justify-between"><dt className="text-muted">Category corrections</dt><dd className="num font-mono">{corrections.byField.category}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">Sentiment corrections</dt><dd className="num font-mono">{corrections.byField.sentiment}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">Resolved tickets</dt><dd className="num font-mono">{corrections.reviewedTickets}</dd></div>
            </dl>
            <p className="mt-4 text-[12.5px] leading-relaxed text-ink-2">This is not an accuracy figure. Agents do not review every prediction, so a ticket without a correction is not proof the AI was right. Corrections are training examples for the next model version.</p>
          </Panel>
        </div>
      )}

      {tab === 'feedback' && (
        <div className="mt-4 grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
          <Panel title="Rating distribution">
            <ul className="space-y-3">
              {[...csat.distribution].reverse().map((d) => (
                <li key={d.rating} className="flex items-center gap-3 text-[13px]">
                  <span className="flex w-12 shrink-0 items-center gap-1 font-mono">{d.rating}<Star size={12} weight="fill" /></span>
                  <span className="flex-1"><Bar value={d.count} max={maxDist} tone={d.rating <= 2 ? 'bg-p1' : 'bg-ink'} /></span>
                  <span className="num w-8 text-right font-mono text-muted">{d.count}</span>
                </li>
              ))}
            </ul>
          </Panel>
          <Panel title="Recent feedback" bodyClass="">
            <ul className="divide-y divide-line">
              {csat.recent.map((f) => (
                <li key={f.ticketId + f.at} className="px-5 py-3.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="flex items-center gap-0.5" aria-label={`${f.rating} of 5`}>
                      {[1, 2, 3, 4, 5].map((n) => <Star key={n} size={13} weight={n <= f.rating ? 'fill' : 'regular'} className={n <= f.rating ? (f.rating <= 2 ? 'text-p1' : 'text-ink') : 'text-faint'} />)}
                    </span>
                    <span className="font-mono text-[11px] text-muted">{fmtDateTime(f.at)}</span>
                  </div>
                  {f.comment && <p className="mt-1.5 text-[13.5px]">&ldquo;{f.comment}&rdquo;</p>}
                  <p className="mt-1 text-[12px] text-muted"><Link to={`/agent/tickets/${f.ticketId}`} className="font-mono hover:underline">{f.ticketId}</Link> &middot; {f.customer} &middot; handled by {f.agent || 'the team'}</p>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      )}
    </Page>
  );
}

function Check({ label, exp, got, ok, near }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[12px] ${ok ? 'border-line text-ink-2' : near ? 'border-p3/40 bg-p3-bg text-p3' : 'border-p1/30 bg-p1-bg text-p1'}`}>
      <span className="text-muted">{label}</span>
      {ok ? <span className="font-medium capitalize">{got}</span> : <><span className="capitalize line-through opacity-70">{got}</span><span className="capitalize font-medium">{exp}</span></>}
    </span>
  );
}
