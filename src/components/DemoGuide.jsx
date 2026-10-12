import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Compass, X, Check, ArrowRight } from '@phosphor-icons/react';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';

// The end-to-end story for the presentation, one click per step. Each step
// signs in as the right role and opens the right screen. Progress is kept in
// localStorage so it survives the role switches.
const STEPS = [
  { title: 'Customer submits a complaint', body: 'Raise a "website not loading" complaint and watch the live AI preview.', role: 'customer', to: '/portal?example=web' },
  { title: 'AI triage', body: 'Same pipeline, fully explained: category, urgency, sentiment, confidence, failures included.', role: 'agent', to: '/agent/lab' },
  { title: 'Hybrid priority scheduling', body: 'Queue sorted by AI assessment plus live waiting time and SLA risk.', role: 'agent', to: '/agent/tickets' },
  { title: 'Expert recommendation', body: 'Ranked experts with reasons. The supervisor can override with a reason.', role: 'supervisor', to: '/agent/assignment' },
  { title: 'Incident detection', body: 'Similar complaints clustered, spike measured. Confirm or dismiss the candidate.', role: 'supervisor', to: '/agent/incidents' },
  { title: 'Investigation', body: 'Open a ticket: similar resolved cases, internal notes, escalation.', role: 'agent', to: '/agent/tickets?assignee=me' },
  { title: 'Resolution', body: 'Resolve with a root cause and a customer summary, or resolve the whole incident.', role: 'supervisor', to: '/agent/incidents' },
  { title: 'Feedback and analytics', body: 'Customer rates the fix, then see CSAT, corrections and model evaluation.', role: 'customer', to: '/portal/requests', then: { role: 'supervisor', to: '/agent/learning', label: 'Open Feedback & Learning' } },
];
const KEY = 'sr-demo-steps';
const read = () => { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; } };

export default function DemoGuide() {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(read);
  const [busy, setBusy] = useState(null);
  const { user, setUser } = useAuth();
  const nav = useNavigate();

  async function go(i, target = STEPS[i]) {
    setBusy(i);
    try {
      if (user?.role !== target.role) {
        const { user: u } = await api('/auth/demo', { method: 'POST', body: { role: target.role } });
        setUser(u);
      }
      const next = [...new Set([...done, i])];
      setDone(next);
      try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* ignore */ }
      nav(target.to);
      setOpen(false);
    } finally { setBusy(null); }
  }

  return (
    <>
      <button type="button" onClick={() => setOpen((o) => !o)}
        aria-label="Demo guide"
        className="fixed bottom-20 right-4 z-40 inline-flex h-10 items-center gap-2 rounded-full border border-line-strong bg-surface px-3 text-[13px] font-medium shadow-lg hover:bg-sunken sm:px-4 lg:bottom-5 lg:right-5">
        {/* Icon-only on phones so it does not cover form fields. */}
        <Compass size={16} weight="fill" /> <span className="hidden sm:inline">Demo guide</span>
        <span className="num font-mono text-[11px] text-muted">{done.length}/{STEPS.length}</span>
      </button>
      {open && (
        <div className="rise fixed inset-x-3 bottom-32 z-40 max-h-[70dvh] overflow-y-auto rounded-[14px] border border-line bg-surface shadow-2xl sm:inset-x-auto sm:right-5 sm:w-[380px] lg:bottom-[4.25rem]">
          <div className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
            <div>
              <p className="text-[14px] font-semibold">SmartResolve walkthrough</p>
              <p className="text-[12px] text-muted">Each step signs in as the right role.</p>
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close guide" className="grid size-7 place-items-center rounded-md text-muted hover:bg-sunken"><X size={15} /></button>
          </div>
          <ol className="divide-y divide-line">
            {STEPS.map((s, i) => (
              <li key={s.title} className="flex gap-3 px-4 py-3">
                <span className={`num mt-0.5 grid size-6 shrink-0 place-items-center rounded-full font-mono text-[11px] font-semibold ${done.includes(i) ? 'bg-invert text-on-invert' : 'bg-sunken text-ink-2'}`}>
                  {done.includes(i) ? <Check size={12} weight="bold" /> : i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold">{s.title}</p>
                  <p className="mt-0.5 text-[12px] leading-relaxed text-muted">{s.body}</p>
                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
                    <button type="button" disabled={busy != null} onClick={() => go(i)} className="inline-flex items-center gap-1 text-[12.5px] font-medium hover:underline">
                      Open as {s.role} <ArrowRight size={12} />
                    </button>
                    {s.then && (
                      <button type="button" disabled={busy != null} onClick={() => go(i, s.then)} className="inline-flex items-center gap-1 text-[12.5px] font-medium hover:underline">
                        {s.then.label} <ArrowRight size={12} />
                      </button>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ol>
          <div className="border-t border-line px-4 py-2.5">
            <button type="button" onClick={() => { setDone([]); try { localStorage.removeItem(KEY); } catch { /* ignore */ } }} className="text-[12px] text-muted hover:text-ink">Reset progress</button>
          </div>
        </div>
      )}
    </>
  );
}
