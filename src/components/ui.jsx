import { Link } from 'react-router-dom';
import { CircleNotch } from '@phosphor-icons/react';

const BAND = {
  P1: { cls: 'text-p1 bg-p1-bg', label: 'Critical' },
  P2: { cls: 'text-p2 bg-p2-bg', label: 'High' },
  P3: { cls: 'text-p3 bg-p3-bg', label: 'Medium' },
  P4: { cls: 'text-p4 bg-p4-bg', label: 'Low' },
};
const SENT = {
  negative: { dot: 'bg-neg', text: 'text-neg', bg: 'bg-neg-bg' },
  neutral: { dot: 'bg-neu', text: 'text-neu', bg: 'bg-neu-bg' },
  positive: { dot: 'bg-pos', text: 'text-pos', bg: 'bg-pos-bg' },
};

export function Band({ band, withLabel = false, className = '' }) {
  const b = BAND[band] || BAND.P4;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 font-mono text-[11px] font-semibold leading-none ${b.cls} ${className}`}>
      {band}{withLabel && <span className="font-sans font-medium">{b.label}</span>}
    </span>
  );
}

export function Sentiment({ label, compact = false }) {
  const s = SENT[label] || SENT.neutral;
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${s.text}`}>
      <span className={`size-1.5 rounded-full ${s.dot}`} aria-hidden="true" />
      {compact ? label.slice(0, 3) : label.charAt(0).toUpperCase() + label.slice(1)}
    </span>
  );
}

export function StatusPill({ status }) {
  const map = {
    open: 'border-line-strong text-ink',
    in_progress: 'border-ink/60 text-ink',
    resolved: 'border-line text-muted',
  };
  const label = { open: 'Open', in_progress: 'In progress', resolved: 'Resolved' }[status];
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${map[status]}`}>{label}</span>;
}

// Score as a number plus a 10-tick meter. Ticks, not a filled bar on a track,
// so it reads as a measurement rather than a progress bar.
export function ScoreMeter({ score, band, size = 'sm' }) {
  const ticks = 10;
  const on = Math.round(score / 10);
  const color = { P1: 'bg-p1', P2: 'bg-p2', P3: 'bg-p3', P4: 'bg-p4' }[band];
  return (
    <span className="inline-flex items-center gap-2">
      <span className={`num font-mono font-semibold ${size === 'lg' ? 'text-4xl tracking-tight' : 'text-[13px]'}`}>{score}</span>
      <span className={`flex gap-[2px] ${size === 'lg' ? 'h-4' : 'h-2.5'}`} aria-hidden="true">
        {Array.from({ length: ticks }, (_, i) => (
          <span key={i} className={`w-[3px] rounded-[1px] ${i < on ? color : 'bg-line'}`} />
        ))}
      </span>
    </span>
  );
}

export function Button({ as: As = 'button', variant = 'primary', size = 'md', loading, className = '', children, ...props }) {
  const base = 'inline-flex items-center justify-center gap-2 rounded-md font-medium whitespace-nowrap transition-[background-color,border-color,color,transform] duration-150 active:translate-y-px disabled:opacity-50 disabled:pointer-events-none';
  const sizes = { sm: 'h-8 px-3 text-[13px]', md: 'h-9 px-3.5 text-sm', lg: 'h-11 px-5 text-[15px]' };
  const variants = {
    primary: 'bg-invert text-on-invert hover:opacity-90',
    secondary: 'border border-line-strong bg-surface text-ink hover:border-faint hover:bg-sunken',
    ghost: 'text-ink-2 hover:bg-sunken hover:text-ink',
  };
  return (
    <As className={`${base} ${sizes[size]} ${variants[variant]} ${className}`} disabled={loading || props.disabled} {...props}>
      {loading && <CircleNotch className="animate-spin" size={15} />}
      {children}
    </As>
  );
}

export function Logo({ to = '/', invert = false }) {
  return (
    <Link to={to} className={`inline-flex items-center gap-2.5 ${invert ? 'text-[#fafaf9]' : 'text-ink'}`}>
      <svg width="22" height="22" viewBox="0 0 32 32" aria-hidden="true">
        <rect width="32" height="32" rx="7" fill="currentColor" />
        <rect x="8" y="9" width="16" height="3" rx="1.5" className={invert ? 'fill-[#1c1917]' : 'fill-canvas'} />
        <rect x="8" y="14.5" width="11" height="3" rx="1.5" className={invert ? 'fill-[#1c1917]' : 'fill-canvas'} opacity=".7" />
        <rect x="8" y="20" width="6" height="3" rx="1.5" className={invert ? 'fill-[#1c1917]' : 'fill-canvas'} opacity=".45" />
      </svg>
      <span className="text-[15px] font-semibold tracking-tight">SmartResolve</span>
    </Link>
  );
}

export function Skeleton({ className = '' }) {
  return <div className={`skeleton ${className}`} aria-hidden="true" />;
}

export function ErrorNote({ error, onRetry }) {
  if (!error) return null;
  return (
    <div role="alert" className="flex items-center justify-between gap-4 rounded-md border border-p1/30 bg-p1-bg px-3 py-2 text-sm text-p1">
      <span>{error.message}</span>
      {onRetry && <button onClick={onRetry} className="font-medium underline underline-offset-2">Try again</button>}
    </div>
  );
}

export function Empty({ icon: Icon, title, hint, action }) {
  return (
    <div className="flex flex-col items-center px-6 py-16 text-center">
      {Icon && <Icon size={28} weight="light" className="mb-3 text-faint" />}
      <p className="text-sm font-medium text-ink">{title}</p>
      {hint && <p className="mt-1 max-w-sm text-[13px] text-muted">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Tier({ tier }) {
  if (!tier || tier === 'standard') return null;
  return <span className="rounded border border-line px-1 py-px font-mono text-[10px] uppercase tracking-wide text-muted">{tier}</span>;
}
