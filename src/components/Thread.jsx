import { useEffect, useState } from 'react';
import { Button, ErrorNote } from './ui.jsx';
import { api, fmtDateTime } from '../lib/api.js';

export function Thread({ thread, viewer }) {
  return (
    <ol className="space-y-5">
      {thread.map((m) => {
        // Automated notices (incident links) read as a banner, not a person speaking.
        if (m.author === 'system') return (
          <li key={m.id} className="rounded-md border border-dashed border-line-strong bg-sunken/60 px-4 py-3">
            <p className="text-[12px] text-muted"><span className="font-medium text-ink-2">{m.name}</span> &middot; automated update <span className="ml-1 font-mono text-[11px]">{fmtDateTime(m.at)}</span></p>
            <p className="mt-1 whitespace-pre-wrap text-[13.5px] leading-relaxed text-ink-2">{m.body}</p>
          </li>
        );
        const mine = m.author === viewer;
        const staff = m.author === 'agent';
        return (
          <li key={m.id} className="grid grid-cols-[28px_1fr] gap-3">
            <span className={`grid size-7 place-items-center rounded-full text-[10px] font-semibold ${staff ? 'bg-invert text-on-invert' : 'bg-sunken text-ink-2'}`}>
              {m.name.split(' ').map((p) => p[0]).join('').slice(0, 2)}
            </span>
            <div className="min-w-0">
              <p className="text-[13px]">
                <span className="font-medium">{mine ? 'You' : m.name}</span>
                {staff && !mine && <span className="text-muted"> &middot; Support</span>}
                <span className="ml-2 font-mono text-[11px] text-muted">{fmtDateTime(m.at)}</span>
              </p>
              <p className="mt-1.5 whitespace-pre-wrap text-[14px] leading-relaxed text-ink-2">{m.body}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function Composer({ ticketId, onSent, placeholder, prefill, onPrefillUsed }) {
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  // Lets the parent push a knowledge-base answer into the box.
  useEffect(() => {
    if (prefill) { setBody(prefill); onPrefillUsed?.(); }
  }, [prefill]); // eslint-disable-line react-hooks/exhaustive-deps

  async function send(e) {
    e.preventDefault();
    if (!body.trim()) return;
    setBusy(true); setError(null);
    try {
      const { ticket } = await api(`/tickets/${ticketId}/messages`, { method: 'POST', body: { body } });
      setBody('');
      onSent(ticket);
    } catch (err) { setError(err); } finally { setBusy(false); }
  }

  return (
    <form onSubmit={send} className="space-y-3">
      <label htmlFor="reply" className="sr-only">Reply</label>
      <textarea id="reply" rows={4} className="field resize-y leading-relaxed" placeholder={placeholder}
        value={body} onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') send(e); }} />
      <ErrorNote error={error} />
      <div className="flex items-center justify-between">
        <span className="hidden font-mono text-[11px] text-muted sm:block">Ctrl + Enter to send</span>
        <Button type="submit" loading={busy} disabled={!body.trim()}>Send reply</Button>
      </div>
    </form>
  );
}
