import { useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle, CaretDown } from '@phosphor-icons/react';
import { StatusPill, Skeleton, ErrorNote } from '../../components/ui.jsx';
import { Thread, Composer } from '../../components/Thread.jsx';
import { useApi, fmtHours, fmtDateTime } from '../../lib/api.js';

export default function PortalTicket() {
  const { id } = useParams();
  const loc = useLocation();
  const { data, error, loading, reload, setData } = useApi(`/tickets/${id}`);
  const justCreated = loc.state?.justCreated;
  const t = data?.ticket;

  return (
    <div className="mx-auto max-w-3xl px-5 py-10">
      <Link to="/portal" className="inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-ink">
        <ArrowLeft size={14} /> All requests
      </Link>

      {loading && <div className="mt-6 space-y-3"><Skeleton className="h-8 w-2/3" /><Skeleton className="h-40" /></div>}
      <div className="mt-6"><ErrorNote error={error} onRetry={reload} /></div>

      {t && (
        <div className="rise">
          {justCreated && (
            <div className="panel mb-8 flex gap-3 p-4">
              <CheckCircle size={20} weight="fill" className="mt-px shrink-0 text-pos" />
              <div className="text-[14px]">
                <p className="font-medium">Request received as <span className="font-mono">{t.id}</span></p>
                <p className="mt-0.5 text-ink-2">
                  It is with our <span className="font-medium text-ink">{t.team}</span> team.
                  We aim to reply within <span className="font-medium text-ink">{fmtHours(t.responseTargetHours)}</span>.
                </p>
                {t.redactions?.length > 0 && (
                  <p className="mt-2 text-xs text-muted">We removed {t.redactions.length} piece{t.redactions.length > 1 ? 's' : ''} of sensitive information ({[...new Set(t.redactions)].join(', ')}) before saving.</p>
                )}
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <span className="font-mono text-[12px] text-muted">{t.id}</span>
            <StatusPill status={t.status} />
          </div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">{t.subject}</h1>
          <p className="mt-1 text-[13px] text-muted">Opened {fmtDateTime(t.createdAt)} &middot; handled by {t.team}</p>

          {t.articles?.length > 0 && t.status !== 'resolved' && (
            <section className="mt-8">
              <h2 className="text-sm font-semibold">While you wait, these may solve it</h2>
              <div className="panel mt-3 divide-y divide-line">
                {t.articles.map((a) => <Article key={a.id} a={a} />)}
              </div>
            </section>
          )}

          <section className="mt-10">
            <h2 className="text-sm font-semibold">Conversation</h2>
            <div className="mt-4"><Thread thread={t.thread} viewer="customer" /></div>
            <div className="mt-8 border-t border-line pt-6">
              <Composer ticketId={t.id} placeholder={t.status === 'resolved' ? 'Still need help? Replying reopens this request.' : 'Add more detail or reply to the team'}
                onSent={(ticket) => setData({ ticket })} />
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function Article({ a }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open}
        className="flex w-full items-start justify-between gap-4 px-4 py-3 text-left hover:bg-sunken">
        <span>
          <span className="block text-[14px] font-medium">{a.title}</span>
          <span className="mt-0.5 block text-[13px] text-muted">{a.summary}</span>
        </span>
        <CaretDown size={14} className={`mt-1 shrink-0 text-muted transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <ol className="list-decimal space-y-1 px-4 pb-4 pl-9 text-[13px] text-ink-2">
          {a.steps.map((s) => <li key={s}>{s}</li>)}
        </ol>
      )}
    </div>
  );
}
