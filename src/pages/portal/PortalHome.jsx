import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ShieldCheck, ChatCircleText } from '@phosphor-icons/react';
import { Button, ErrorNote, StatusPill, Skeleton, Empty } from '../../components/ui.jsx';
import { api, useApi, timeAgo } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';

const MAX = 4000;

export default function PortalHome() {
  const { user } = useAuth();
  const nav = useNavigate();
  const mine = useApi('/tickets');
  const [form, setForm] = useState({ subject: '', message: '', orderRef: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const { ticket } = await api('/tickets', { method: 'POST', body: form });
      nav(`/portal/tickets/${ticket.id}`, { state: { justCreated: true } });
    } catch (err) { setError(err); setBusy(false); }
  }
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const first = user.name.split(' ')[0];

  return (
    <div className="mx-auto grid max-w-5xl gap-10 px-5 py-10 lg:grid-cols-[1fr_320px] lg:py-14">
      <section className="rise">
        <h1 className="text-[28px] font-semibold tracking-tight">Hi {first}, what went wrong?</h1>
        <p className="mt-2 max-w-[58ch] text-[15px] text-ink-2">
          Describe it in your own words. Your request goes straight to the team that handles it, so there is no need to pick a department.
        </p>

        <form onSubmit={submit} className="panel mt-8 space-y-5 p-5 sm:p-6" noValidate>
          <div>
            <label htmlFor="subject" className="label">Subject</label>
            <input id="subject" className="field" maxLength={140} placeholder="For example: Charged twice for one order"
              value={form.subject} onChange={set('subject')} />
            {error?.field === 'subject' && <p className="hint text-p1">{error.message}</p>}
          </div>
          <div>
            <div className="flex items-baseline justify-between">
              <label htmlFor="message" className="label">What happened</label>
              <span className="num font-mono text-[11px] text-muted">{form.message.length} / {MAX}</span>
            </div>
            <textarea id="message" rows={7} maxLength={MAX} className="field resize-y leading-relaxed"
              placeholder="When did it start, what did you expect, and what happened instead?"
              value={form.message} onChange={set('message')} />
            {error?.field === 'message' && <p className="hint text-p1">{error.message}</p>}
          </div>
          <div className="sm:max-w-xs">
            <label htmlFor="orderRef" className="label">Order or reference number <span className="font-normal text-muted">(optional)</span></label>
            <input id="orderRef" className="field font-mono" maxLength={40} value={form.orderRef} onChange={set('orderRef')} />
          </div>

          {error && !error.field && <ErrorNote error={error} />}

          <div className="flex flex-col-reverse gap-4 border-t border-line pt-5 sm:flex-row sm:items-center sm:justify-between">
            <p className="flex items-start gap-2 text-xs leading-relaxed text-muted">
              <ShieldCheck size={15} className="mt-px shrink-0" />
              Card numbers, phone numbers and OTPs are removed before your message is saved.
            </p>
            <Button type="submit" size="lg" loading={busy}>Send request</Button>
          </div>
        </form>
      </section>

      <aside className="rise [animation-delay:80ms]">
        <h2 className="text-sm font-semibold">Your requests</h2>
        <div className="mt-3">
          {mine.loading && <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-16" />)}</div>}
          <ErrorNote error={mine.error} onRetry={mine.reload} />
          {mine.data && mine.data.tickets.length === 0 && (
            <div className="panel"><Empty icon={ChatCircleText} title="No requests yet" hint="Anything you send will show up here with its status." /></div>
          )}
          {mine.data && mine.data.tickets.length > 0 && (
            <ul className="panel divide-y divide-line overflow-hidden">
              {mine.data.tickets.slice(0, 8).map((t) => (
                <li key={t.id}>
                  <Link to={`/portal/tickets/${t.id}`} className="group flex items-start gap-3 px-4 py-3 hover:bg-sunken">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium">{t.subject}</p>
                      <p className="mt-0.5 font-mono text-[11px] text-muted">{t.id} &middot; {timeAgo(t.createdAt)}</p>
                    </div>
                    <StatusPill status={t.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
        <p className="mt-6 text-[13px] leading-relaxed text-muted">
          Urgent problems such as unauthorised payments or a locked account are answered first, usually within the hour.
        </p>
      </aside>
    </div>
  );
}
