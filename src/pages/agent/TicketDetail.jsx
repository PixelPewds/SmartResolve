import { useState } from 'react';
import { Link, useOutletContext, useParams } from 'react-router-dom';
import { ArrowLeft, Warning, BookOpenText, ShieldCheck } from '@phosphor-icons/react';
import { Band, StatusPill, Skeleton, ErrorNote, Tier, Button } from '../../components/ui.jsx';
import { ScoreBreakdown, SentimentCard, CategoryCard, RoutingCard } from '../../components/Triage.jsx';
import { Thread, Composer } from '../../components/Thread.jsx';
import { api, useApi, timeAgo, fmtDateTime } from '../../lib/api.js';

const TEAMS = ['Billing', 'Technical Support', 'Logistics', 'Account & Security', 'Customer Care', 'Triage Review'];
const CATEGORIES = [['billing', 'Billing & Payments'], ['technical', 'Technical Support'], ['delivery', 'Delivery & Orders'], ['account', 'Account Access'], ['general', 'General Enquiry']];

export default function TicketDetail() {
  const { id } = useParams();
  const outlet = useOutletContext();
  const { data, error, loading, reload, setData } = useApi(`/tickets/${id}`);
  const [saving, setSaving] = useState(null);
  const [saveErr, setSaveErr] = useState(null);
  const [prefill, setPrefill] = useState(null);
  const t = data?.ticket;

  async function patch(body, key) {
    setSaving(key); setSaveErr(null);
    try {
      const { ticket } = await api(`/tickets/${id}`, { method: 'PATCH', body });
      setData((d) => ({ ...d, ticket }));
      outlet?.refreshCounts?.();
    } catch (err) { setSaveErr(err); } finally { setSaving(null); }
  }

  if (loading && !data) {
    return <div className="space-y-4 px-5 py-6 lg:px-8"><Skeleton className="h-5 w-40" /><Skeleton className="h-8 w-2/3" /><Skeleton className="h-72" /></div>;
  }
  if (error) return <div className="px-5 py-6 lg:px-8"><ErrorNote error={error} onRetry={reload} /></div>;
  if (!t) return null;

  const corrected = (field) => t.corrections?.filter((c) => c.field === field).at(-1);

  return (
    <div className="px-5 py-6 lg:px-8">
      <Link to="/agent" className="inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-ink"><ArrowLeft size={14} /> Queue</Link>

      <header className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Band band={t.priority.band} withLabel />
            <span className="font-mono text-[12px] text-muted">{t.id}</span>
            <StatusPill status={t.status} />
          </div>
          <h1 className="mt-2 text-xl font-semibold tracking-tight sm:text-2xl">{t.subject}</h1>
          <p className="mt-1 text-[13px] text-muted">
            {t.customerName} &middot; {t.customerEmail} &middot; via {t.channel} &middot; {timeAgo(t.createdAt)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select aria-label="Team" value={t.team} disabled={saving === 'team'} onChange={(e) => patch({ team: e.target.value }, 'team')}
            className="field h-8 w-auto cursor-pointer py-0 text-[13px]">
            {TEAMS.map((x) => <option key={x}>{x}</option>)}
          </select>
          {t.status !== 'resolved'
            ? <Button size="sm" loading={saving === 'status'} onClick={() => patch({ status: 'resolved' }, 'status')}>Mark resolved</Button>
            : <Button size="sm" variant="secondary" loading={saving === 'status'} onClick={() => patch({ status: 'open' }, 'status')}>Reopen</Button>}
        </div>
      </header>

      {saveErr && <div className="mt-4"><ErrorNote error={saveErr} /></div>}

      {t.flags.length > 0 && (
        <div className="mt-5 flex flex-wrap gap-2">
          {t.flags.map((f) => (
            <span key={f.key} className="inline-flex items-center gap-1.5 rounded-md border border-p1/25 bg-p1-bg px-2.5 py-1 text-[12px] font-medium text-p1">
              <Warning size={13} weight="bold" /> {f.label}
            </span>
          ))}
        </div>
      )}

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-6">
          <section className="panel p-5">
            <Thread thread={t.thread} viewer="agent" />
            {t.redactions?.length > 0 && (
              <p className="mt-5 flex items-center gap-1.5 text-xs text-muted">
                <ShieldCheck size={14} /> Redacted before storage: {[...new Set(t.redactions)].join(', ')}
              </p>
            )}
          </section>

          <section className="panel p-5">
            <h2 className="text-sm font-semibold">Reply to {t.customerName.split(' ')[0]}</h2>
            <div className="mt-3">
              <Composer ticketId={t.id} placeholder="Write a reply. Replying moves an open ticket to In progress."
                prefill={prefill} onPrefillUsed={() => setPrefill(null)}
                onSent={(ticket) => { setData((d) => ({ ...d, ticket })); outlet?.refreshCounts?.(); }} />
            </div>
          </section>

          {t.articles?.length > 0 && (
            <section>
              <h2 className="flex items-center gap-2 text-sm font-semibold"><BookOpenText size={16} /> Suggested articles</h2>
              <div className="panel mt-3 divide-y divide-line">
                {t.articles.map((a) => (
                  <div key={a.id} className="flex items-start justify-between gap-4 px-4 py-3">
                    <div className="min-w-0">
                      <p className="text-[14px] font-medium">{a.title}</p>
                      <p className="mt-0.5 text-[13px] text-muted">{a.summary}</p>
                    </div>
                    <Button size="sm" variant="secondary" onClick={() => setPrefill(`Hi ${t.customerName.split(' ')[0]},\n\n${a.summary}\n\n${a.steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}\n\nLet me know if that sorts it.`)}>
                      Use in reply
                    </Button>
                  </div>
                ))}
              </div>
            </section>
          )}

          {data.history?.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold">Earlier from this customer</h2>
              <ul className="panel mt-3 divide-y divide-line">
                {data.history.map((h) => (
                  <li key={h.id}>
                    <Link to={`/agent/tickets/${h.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-sunken">
                      <Band band={h.band} />
                      <span className="min-w-0 flex-1 truncate text-[13px]">{h.subject}</span>
                      <span className="font-mono text-[11px] text-muted">{timeAgo(h.createdAt)}</span>
                      <StatusPill status={h.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <aside className="space-y-4 xl:sticky xl:top-6 xl:self-start">
          <section className="panel p-5"><ScoreBreakdown priority={t.priority} /></section>

          <section className="panel divide-y divide-line">
            <div className="p-5">
              <SentimentCard sentiment={t.sentiment} />
              <Correction label="Sentiment is wrong?" value={t.sentiment.label} saving={saving === 'sentiment'}
                options={[['negative', 'Negative'], ['neutral', 'Neutral'], ['positive', 'Positive']]}
                last={corrected('sentiment')}
                onChange={(to) => patch({ correction: { field: 'sentiment', to } }, 'sentiment')} />
            </div>
            <div className="p-5">
              <CategoryCard classification={t.classification}>
                <Correction label="Category is wrong?" value={t.classification.category} saving={saving === 'category'}
                  options={CATEGORIES} last={corrected('category')}
                  onChange={(to) => patch({ correction: { field: 'category', to } }, 'category')} />
              </CategoryCard>
            </div>
            <div className="p-5">
              <RoutingCard routing={t.routing} team={t.team} />
              <div className="mt-3 flex items-center gap-2 text-xs text-muted">
                <Tier tier={t.customerTier} /> {t.customerTier === 'standard' && 'Standard customer'}
              </div>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}

// Agent feedback loop. Changing the value re-scores and re-routes server side,
// and the change is logged against the model's agreement rate.
function Correction({ label, value, options, onChange, saving, last }) {
  return (
    <div className="mt-3">
      <label className="flex items-center justify-between gap-3 text-xs text-muted">
        <span>{label}</span>
        <select value={value} disabled={saving} onChange={(e) => e.target.value !== value && onChange(e.target.value)}
          className="field h-7 w-auto cursor-pointer py-0 text-xs">
          {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </label>
      {last && <p className="mt-1.5 text-[11px] text-muted">Corrected from {last.from} by {last.by}, {fmtDateTime(last.at)}</p>}
    </div>
  );
}
