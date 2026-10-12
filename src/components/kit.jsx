// Layout and interaction primitives shared by every screen.
import { useEffect, useRef, useState } from 'react';

/* Prototype honesty: anything simulated says so, with the reason on hover. */
export function Sim({ children = 'Simulated', title = 'Prototype: built on invented sample data, not real customers or agents.', className = '' }) {
  return (
    <span title={title} className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-dashed border-line-strong px-2 py-0.5 font-mono text-[10.5px] text-muted ${className}`}>
      <span className="size-1 rounded-full bg-faint" aria-hidden="true" />{children}
    </span>
  );
}

export function Page({ children, className = '' }) {
  return <div className={`mx-auto w-full max-w-[1440px] px-4 pb-28 pt-5 sm:px-6 lg:px-8 lg:pb-12 lg:pt-7 ${className}`}>{children}</div>;
}

export function PageHeader({ title, sub, sim, actions, children }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="text-[22px] font-semibold leading-tight tracking-tight sm:text-[24px]">{title}</h1>
          {sim && <Sim title={typeof sim === 'string' ? sim : undefined} />}
        </div>
        {sub && <p className="mt-1.5 max-w-[76ch] text-[13.5px] leading-relaxed text-muted">{sub}</p>}
        {children}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function Tabs({ value, onChange, items, className = '', size = 'md' }) {
  return (
    <div role="tablist" className={`-mx-1 flex gap-1 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none] ${className}`}>
      {items.map((it) => {
        const active = value === it.value;
        return (
          <button key={it.value} type="button" role="tab" aria-selected={active} onClick={() => onChange(it.value)}
            className={`inline-flex shrink-0 items-center gap-2 rounded-md px-3 font-medium transition-colors ${size === 'sm' ? 'h-7 text-[12.5px]' : 'h-8 text-[13px]'} ${
              active ? 'bg-invert text-on-invert' : 'text-ink-2 hover:bg-sunken hover:text-ink'}`}>
            {it.icon && <it.icon size={14} />}
            {it.label}
            {it.count != null && <span className={`num font-mono text-[11px] ${active ? 'opacity-70' : it.alert && it.count ? 'text-p1' : 'text-muted'}`}>{it.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

export function Panel({ title, sub, action, children, className = '', bodyClass = 'p-5', sim, icon: Icon }) {
  return (
    <section className={`panel overflow-hidden ${className}`}>
      {(title || action) && (
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-3.5">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              {Icon && <Icon size={16} className="text-ink-2" />}
              <h2 className="text-[14px] font-semibold">{title}</h2>
              {sim && <Sim />}
            </div>
            {sub && <p className="mt-0.5 text-xs leading-relaxed text-muted">{sub}</p>}
          </div>
          {action}
        </div>
      )}
      <div className={bodyClass}>{children}</div>
    </section>
  );
}

export function Stat({ label, value, sub, delta, goodWhen = 'down', tone = '', icon: Icon }) {
  let d = null;
  if (delta != null && Number.isFinite(delta)) {
    const good = goodWhen === 'down' ? delta <= 0 : delta >= 0;
    d = <span className={`num font-mono text-[11px] font-medium ${good ? 'text-pos' : 'text-neg'}`}>{delta > 0 ? '+' : ''}{delta}%</span>;
  }
  return (
    <div className="min-w-0 p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-[12px] text-muted">{label}</p>
        {Icon && <Icon size={15} className="shrink-0 text-faint" />}
      </div>
      <p className={`num mt-2 font-mono text-[24px] font-semibold leading-none tracking-tight ${tone}`}>{value}</p>
      <p className="mt-2 flex min-h-4 items-center gap-1.5 text-[11px] text-muted">{d}{sub}</p>
    </div>
  );
}

export function StatRow({ children, cols = 'grid-cols-2 sm:grid-cols-4' }) {
  return <section className={`panel grid ${cols} divide-line [&>*]:border-line [&>*:not(:last-child)]:border-r max-sm:[&>*:nth-child(2n)]:border-r-0 max-sm:[&>*:nth-child(-n+2)]:border-b max-lg:[&>*:last-child:nth-child(odd)]:col-span-2`}>{children}</section>;
}

export function Avatar({ name = '?', size = 28, invert = false }) {
  const initials = name.split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase();
  return (
    <span style={{ width: size, height: size, fontSize: Math.max(9, size * 0.36) }}
      className={`grid shrink-0 place-items-center rounded-full font-semibold ${invert ? 'bg-invert text-on-invert' : 'bg-sunken text-ink-2 ring-1 ring-line'}`}>
      {initials}
    </span>
  );
}

const STATUS_DOT = { online: 'bg-pos', away: 'bg-p3', offline: 'bg-faint' };
export function Presence({ status }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[12px] text-ink-2">
      <span className={`size-1.5 rounded-full ${STATUS_DOT[status] || 'bg-faint'}`} aria-hidden="true" />
      {status ? status.charAt(0).toUpperCase() + status.slice(1) : 'Unknown'}
    </span>
  );
}

// Native <dialog>: focus trap, Escape and the backdrop come from the platform.
export function Dialog({ open, onClose, title, sub, children, footer, wide = false }) {
  const ref = useRef(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} onClose={onClose} onClick={(e) => e.target === ref.current && onClose()}
      className={`m-auto w-[calc(100%-2rem)] ${wide ? 'max-w-2xl' : 'max-w-lg'} rounded-[12px] border border-line bg-surface p-0 text-ink shadow-2xl backdrop:bg-black/45`}>
      {open && (
        <div>
          <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
            <div>
              <h2 className="text-[15px] font-semibold">{title}</h2>
              {sub && <p className="mt-0.5 text-xs text-muted">{sub}</p>}
            </div>
            <button type="button" onClick={onClose} aria-label="Close" className="-mr-1 grid size-7 place-items-center rounded-md text-lg leading-none text-muted hover:bg-sunken hover:text-ink">&times;</button>
          </div>
          <div className="max-h-[68dvh] overflow-y-auto px-5 py-4">{children}</div>
          {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line bg-sunken/50 px-5 py-3">{footer}</div>}
        </div>
      )}
    </dialog>
  );
}

// Re-renders on an interval so countdowns stay honest without a reload.
export function useNow(intervalMs = 30000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), intervalMs); return () => clearInterval(id); }, [intervalMs]);
  return now;
}

export function fmtDuration(ms) {
  const m = Math.round(Math.abs(ms) / 60000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ${String(m % 60).padStart(2, '0')}m`;
  return `${Math.round(h / 24)}d`;
}

export function SlaClock({ sla, compact = false }) {
  const now = useNow();
  if (!sla) return null;
  if (sla.state === 'met') return <span className="font-mono text-[12px] text-pos">Met</span>;
  if (sla.state === 'missed') return <span className="font-mono text-[12px] text-muted">Missed</span>;
  const remaining = Date.parse(sla.dueAt) - now;
  const breached = remaining < 0;
  const warn = !breached && sla.pctUsed >= 0.75;
  const cls = breached ? 'text-p1' : warn ? 'text-p2' : 'text-ink-2';
  return (
    <span className={`num inline-flex flex-wrap items-baseline gap-x-1.5 font-mono text-[12px] ${cls}`} title={`${sla.clockLabel} due ${new Date(sla.dueAt).toLocaleString('en-IN')}`}>
      <span className="whitespace-nowrap">{breached ? `${fmtDuration(remaining)} over` : `${fmtDuration(remaining)} left`}</span>
      {!compact && <span className="whitespace-nowrap font-sans text-[11px] text-muted">{sla.clockLabel === 'First response' ? 'to reply' : 'to resolve'}</span>}
    </span>
  );
}

// Value bar without a filled background track (the track is a hairline).
export function Bar({ value, max, tone = 'bg-ink', className = 'h-1.5' }) {
  const pct = Math.min(100, (value / Math.max(max, 1)) * 100);
  return (
    <span className={`relative block w-full ${className}`} aria-hidden="true">
      <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-line" />
      <span className={`absolute inset-y-0 left-0 rounded-full ${tone}`} style={{ width: `${pct}%` }} />
    </span>
  );
}

export function Field({ label, hint, error, children, htmlFor, optional }) {
  return (
    <div>
      {label && <label htmlFor={htmlFor} className="label">{label}{optional && <span className="font-normal text-muted"> (optional)</span>}</label>}
      {children}
      {error ? <p className="hint text-p1">{error}</p> : hint ? <p className="hint">{hint}</p> : null}
    </div>
  );
}

// Tiny transient confirmation in the corner.
let toastSet = null;
export function toast(text) { toastSet?.({ text, id: Date.now() }); }
export function Toaster() {
  const [t, setT] = useState(null);
  useEffect(() => { toastSet = setT; return () => { toastSet = null; }; }, []);
  useEffect(() => { if (!t) return; const id = setTimeout(() => setT(null), 3200); return () => clearTimeout(id); }, [t]);
  if (!t) return null;
  return (
    <div role="status" key={t.id} className="rise fixed bottom-20 left-1/2 z-[60] -translate-x-1/2 rounded-lg bg-invert px-4 py-2.5 text-[13px] font-medium text-on-invert shadow-xl lg:bottom-6">
      {t.text}
    </div>
  );
}
