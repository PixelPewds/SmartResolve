import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle, CaretDown, Star, Megaphone, Paperclip, UserCircle } from '@phosphor-icons/react';
import { StatusPill, Skeleton, ErrorNote, Button } from '../../components/ui.jsx';
import { toast } from '../../components/kit.jsx';
import { Thread, Composer } from '../../components/Thread.jsx';
import { api, useApi, fmtDateTime } from '../../lib/api.js';

export default function PortalTicket() {
  const { id } = useParams();
  const { data, error, loading, reload, setData } = useApi(`/tickets/${id}`);
  const t = data?.ticket;

  return (
    <div className="mx-auto max-w-5xl px-4 pb-28 pt-6 sm:px-6 md:pb-14 md:pt-10">
      <Link to="/portal/requests" className="inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-ink"><ArrowLeft size={14} /> My requests</Link>

      {loading && !t && <div className="mt-6 space-y-3"><Skeleton className="h-8 w-2/3" /><Skeleton className="h-24" /><Skeleton className="h-64" /></div>}
      <div className="mt-6"><ErrorNote error={error} onRetry={reload} /></div>

      {t && (
        <div className="rise">
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-mono text-[12px] text-muted">{t.id}</span>
            <StatusPill status={t.status} />
          </div>
          <h1 className="mt-2 text-[24px] font-semibold leading-tight tracking-tight">{t.subject}</h1>
          <p className="mt-1 text-[13px] text-muted">Opened {fmtDateTime(t.createdAt)} &middot; {t.category} &middot; {t.team} team</p>

          {t.incident && (
            <div className="mt-6 flex gap-3 rounded-md border border-p2/30 bg-p2-bg px-4 py-3.5">
              <Megaphone size={20} className="mt-0.5 shrink-0 text-p2" />
              <div className="text-[13.5px]">
                <p className="font-semibold text-ink">{t.incident.status === 'resolved' ? 'Known issue, now fixed' : 'Known issue, our engineers are on it'}</p>
                <p className="mt-0.5 text-ink-2">Other customers reported the same problem: {t.incident.title}. Your request is linked to it, so you will be updated as soon as it is fixed. No need to write again.</p>
              </div>
            </div>
          )}

          <section className="panel mt-6 p-5 sm:p-6"><Tracker steps={t.steps} /></section>

          <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            <div className="min-w-0 space-y-6">
              {t.resolution && (
                <section className="panel p-5 sm:p-6">
                  <h2 className="flex items-center gap-2 text-[14px] font-semibold"><CheckCircle size={17} weight="fill" className="text-pos" /> How we fixed it</h2>
                  <p className="mt-2 whitespace-pre-wrap text-[14px] leading-relaxed text-ink-2">{t.resolution.summary}</p>
                  <p className="mt-2 font-mono text-[11px] text-muted">Resolved {fmtDateTime(t.resolution.at)}</p>
                </section>
              )}
              {t.status === 'resolved' && <Feedback t={t} onDone={(ticket) => setData({ ticket })} />}

              <section className="panel p-5 sm:p-6">
                <h2 className="text-[14px] font-semibold">Conversation</h2>
                <div className="mt-4"><Thread thread={t.thread} viewer="customer" /></div>
                <div className="mt-6 border-t border-line pt-5">
                  <Composer ticketId={t.id} placeholder={t.status === 'resolved' ? 'Still need help? Replying reopens this request.' : 'Add more detail or reply to the team'}
                    onSent={(ticket) => { setData({ ticket }); toast('Reply sent'); }} />
                </div>
              </section>
            </div>

            <aside className="space-y-5">
              <section className="panel p-5">
                <h2 className="text-[14px] font-semibold">Details</h2>
                <dl className="mt-3 space-y-2.5 text-[13px]">
                  <div className="flex justify-between gap-3"><dt className="text-muted">Handled by</dt><dd className="flex items-center gap-1.5 text-right">{t.assignee ? <><UserCircle size={15} />{t.assignee.name}, {t.team}</> : `${t.team} team`}</dd></div>
                  <div className="flex justify-between gap-3"><dt className="text-muted">Urgency</dt><dd className="capitalize">{t.urgency}</dd></div>
                  <div className="flex justify-between gap-3"><dt className="text-muted">First reply target</dt><dd>{t.responseTargetMin < 60 ? `${t.responseTargetMin} min` : `${t.responseTargetMin / 60} h`}</dd></div>
                  <div className="flex justify-between gap-3"><dt className="text-muted">Resolution target</dt><dd>{t.resolveTargetHours} h</dd></div>
                </dl>
                {t.attachments?.length > 0 && (
                  <ul className="mt-4 space-y-1 border-t border-line pt-3 text-[12.5px]">
                    {t.attachments.map((a) => <li key={a.name} className="flex items-center gap-1.5 text-ink-2"><Paperclip size={13} /><span className="truncate">{a.name}</span></li>)}
                  </ul>
                )}
                {t.redactions?.length > 0 && <p className="mt-4 border-t border-line pt-3 text-[12px] text-muted">We removed {[...new Set(t.redactions)].join(', ')} details from your message before saving it.</p>}
              </section>
              {t.articles?.length > 0 && t.status !== 'resolved' && (
                <section className="panel">
                  <h2 className="border-b border-line px-5 py-3.5 text-[14px] font-semibold">While you wait, these may help</h2>
                  <div className="divide-y divide-line">{t.articles.map((a) => <Article key={a.id} a={a} />)}</div>
                </section>
              )}
            </aside>
          </div>
        </div>
      )}
    </div>
  );
}

// Five-step progress, shared with the submit confirmation and the requests list.
export function Tracker({ steps, compact = false }) {
  const current = steps.findIndex((s) => !s.done);
  if (compact) {
    return (
      <div className="flex gap-1" aria-label={`Step ${current === -1 ? steps.length : current + 1} of ${steps.length}`}>
        {steps.map((s) => <span key={s.key} title={s.label} className={`h-1 flex-1 rounded-full ${s.done ? 'bg-ink' : 'bg-line'}`} />)}
      </div>
    );
  }
  return (
    <ol className="grid gap-3 sm:grid-cols-5 sm:gap-2">
      {steps.map((s, i) => {
        const now = i === current;
        return (
          <li key={s.key} className="flex items-start gap-3 sm:flex-col sm:gap-2">
            <div className="flex items-center gap-2 sm:w-full">
              <span className={`grid size-6 shrink-0 place-items-center rounded-full ${s.done ? 'bg-invert text-on-invert' : now ? 'ring-2 ring-ink' : 'ring-1 ring-line-strong'}`}>
                {s.done ? <CheckCircle size={14} weight="fill" /> : now && <span className="size-2 animate-pulse rounded-full bg-ink" />}
              </span>
              {i < steps.length - 1 && <span className={`hidden h-px flex-1 sm:block ${s.done ? 'bg-ink' : 'bg-line'}`} aria-hidden="true" />}
            </div>
            <div>
              <p className={`text-[13px] ${s.done || now ? 'font-semibold' : 'text-muted'}`}>{s.label}</p>
              <p className="font-mono text-[11px] text-muted">{s.done && s.at ? fmtDateTime(s.at) : now ? 'In progress' : 'Pending'}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function Feedback({ t, onDone }) {
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  if (t.feedback) {
    return (
      <section className="panel p-5 sm:p-6">
        <h2 className="text-[14px] font-semibold">Your rating</h2>
        <Stars value={t.feedback.rating} />
        {t.feedback.comment && <p className="mt-2 text-[13.5px] text-ink-2">&ldquo;{t.feedback.comment}&rdquo;</p>}
        <p className="mt-2 text-[12px] text-muted">Thank you. Ratings go straight to the support team and help us improve.</p>
      </section>
    );
  }

  async function send(e) {
    e.preventDefault();
    setBusy(true); setError(null);
    try { const { ticket } = await api(`/tickets/${t.id}/feedback`, { method: 'POST', body: { rating, comment } }); onDone(ticket); toast('Thanks for the feedback'); }
    catch (err) { setError(err); } finally { setBusy(false); }
  }

  return (
    <form onSubmit={send} className="panel p-5 sm:p-6">
      <h2 className="text-[14px] font-semibold">How did we do?</h2>
      <p className="mt-0.5 text-[13px] text-muted">Rate how this request was handled.</p>
      <div className="mt-3 flex gap-1" role="radiogroup" aria-label="Rating" onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" role="radio" aria-checked={rating === n} aria-label={`${n} of 5`} onClick={() => setRating(n)} onMouseEnter={() => setHover(n)}
            className="grid size-10 place-items-center rounded-md hover:bg-sunken">
            <Star size={24} weight={n <= (hover || rating) ? 'fill' : 'regular'} className={n <= (hover || rating) ? 'text-ink' : 'text-faint'} />
          </button>
        ))}
      </div>
      {rating > 0 && (
        <>
          <label htmlFor="fb" className="label mt-3">{rating <= 2 ? 'What went wrong?' : 'Anything to add?'} <span className="font-normal text-muted">(optional)</span></label>
          <textarea id="fb" rows={3} maxLength={600} className="field resize-y" value={comment} onChange={(e) => setComment(e.target.value)} />
        </>
      )}
      <ErrorNote error={error} />
      <div className="mt-4 flex justify-end"><Button type="submit" disabled={!rating} loading={busy}>Send rating</Button></div>
    </form>
  );
}

function Stars({ value }) {
  return (
    <span className="mt-2 flex gap-0.5" aria-label={`${value} of 5`}>
      {[1, 2, 3, 4, 5].map((n) => <Star key={n} size={18} weight={n <= value ? 'fill' : 'regular'} className={n <= value ? 'text-ink' : 'text-faint'} />)}
    </span>
  );
}

export function Article({ a, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-start justify-between gap-4 px-5 py-3 text-left hover:bg-sunken">
        <span>
          <span className="block text-[13.5px] font-medium">{a.title}</span>
          <span className="mt-0.5 block text-[12.5px] text-muted">{a.summary}</span>
        </span>
        <CaretDown size={14} className={`mt-1 shrink-0 text-muted transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <ol className="list-decimal space-y-1 px-5 pb-4 pl-10 text-[13px] text-ink-2">{a.steps.map((s) => <li key={s}>{s}</li>)}</ol>}
    </div>
  );
}
