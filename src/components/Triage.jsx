import { Band, Sentiment, ScoreMeter } from './ui.jsx';

const BAND_BG = { P1: 'bg-p1', P2: 'bg-p2', P3: 'bg-p3', P4: 'bg-p4' };
const URG = { critical: 'text-p1', high: 'text-p2', medium: 'text-p3', low: 'text-p4' };

function FactorRow({ f, band }) {
  return (
    <li>
      <div className="flex items-baseline justify-between text-[13px]">
        <span className="font-medium text-ink">{f.label}</span>
        <span className="num font-mono text-muted"><span className="text-ink">{f.points}</span> / {f.max}</span>
      </div>
      <div className="mt-1.5 flex h-1 gap-px overflow-hidden rounded-full" aria-hidden="true">
        <span className={BAND_BG[band]} style={{ width: `${(f.points / f.max) * 100}%` }} />
        <span className="flex-1 bg-line" />
      </div>
      <ul className="mt-1.5 space-y-0.5">
        {f.reasons.map((r) => <li key={r} className="text-xs leading-relaxed text-muted">{r}</li>)}
      </ul>
    </li>
  );
}

// Hybrid priority, explained. The two halves are shown separately because
// that is the point: the AI half is fixed at intake, the scheduling half
// keeps moving while the ticket waits.
export function ScoreBreakdown({ priority, compact = false }) {
  const intake = priority.factors.filter((f) => f.phase === 'intake');
  const live = priority.factors.filter((f) => f.phase === 'live');
  const sum = (xs) => xs.reduce((s, f) => s + f.points, 0);
  return (
    <div>
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Hybrid priority score</p>
          <div className="mt-2"><ScoreMeter score={priority.score} band={priority.band} size="lg" /></div>
        </div>
        <div className="pb-1 text-right">
          <Band band={priority.band} withLabel />
          <p className="mt-1.5 text-[11px] text-muted">SLA tier {priority.intakeBand}, set at intake</p>
          {priority.pinned && <p className="mt-1 text-[11px] font-medium text-p1">Pinned: confirmed incident</p>}
        </div>
      </div>

      {/* Stacked composition bar: intake vs live */}
      <div className="mt-4 flex h-2 overflow-hidden rounded-full bg-line" aria-hidden="true">
        <span className="bg-ink" style={{ width: `${sum(intake)}%` }} />
        <span className="bg-ink/35" style={{ width: `${sum(live)}%` }} />
      </div>
      <div className="mt-1.5 flex justify-between font-mono text-[10.5px] text-muted">
        <span>AI assessment {sum(intake)}/60</span>
        <span>Scheduling {sum(live)}/40</span>
      </div>

      <div className={`mt-5 grid gap-5 ${compact ? '' : 'sm:grid-cols-2 xl:grid-cols-1'}`}>
        <div>
          <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-2">AI assessment <span className="font-normal normal-case tracking-normal text-muted">fixed at intake</span></p>
          <ul className="space-y-3.5">{intake.map((f) => <FactorRow key={f.key} f={f} band={priority.band} />)}</ul>
        </div>
        <div>
          <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-2">Scheduling <span className="font-normal normal-case tracking-normal text-muted">updates live</span></p>
          <ul className="space-y-3.5">{live.map((f) => <FactorRow key={f.key} f={f} band={priority.band} />)}</ul>
        </div>
      </div>

      {priority.rules?.length > 0 && (
        <div className="mt-5 rounded-md border border-dashed border-line-strong px-3 py-2.5">
          <p className="eyebrow">Rules applied</p>
          <ul className="mt-1 space-y-1">{priority.rules.map((r) => <li key={r} className="text-[12.5px] leading-relaxed text-ink-2">{r}</li>)}</ul>
          {priority.raw !== priority.score && <p className="mt-1.5 font-mono text-[11px] text-muted">factors sum {priority.raw}, final {priority.score}</p>}
        </div>
      )}
    </div>
  );
}

function Engine({ engine, model, latencyMs }) {
  const label = engine === 'huggingface' ? 'Hugging Face' : engine === 'agent' ? 'Agent correction' : 'Local model';
  return (
    <p className="mt-2 truncate font-mono text-[11px] text-muted" title={model}>
      {label} &middot; {model}{latencyMs != null && engine === 'huggingface' ? ` · ${latencyMs}ms` : ''}
    </p>
  );
}

function Conf({ value }) {
  return <span className="num font-mono text-xs text-muted" title="Model confidence, not accuracy">{Math.round(value * 100)}% conf.</span>;
}

export function SentimentCard({ sentiment, children }) {
  return (
    <div>
      <p className="eyebrow">Sentiment</p>
      <div className="mt-2 flex items-center justify-between">
        <Sentiment label={sentiment.label} />
        <Conf value={sentiment.confidence} />
      </div>
      {sentiment.sarcasm && <p className="mt-1.5 text-xs text-p2">Possible sarcasm: praise words next to a stated failure. Confidence lowered.</p>}
      {sentiment.predicted && <p className="mt-1.5 text-xs text-muted">Model said {sentiment.predicted}.</p>}
      {sentiment.evidence?.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1">
          {sentiment.evidence.map((e, i) => (
            <span key={`${e.term}-${i}`} className={`rounded px-1.5 py-0.5 font-mono text-[11px] ${e.weight < 0 ? 'bg-neg-bg text-neg' : 'bg-pos-bg text-pos'}`}>{e.term}</span>
          ))}
        </div>
      )}
      {children}
      <Engine {...sentiment} />
    </div>
  );
}

export function UrgencyCard({ urgency }) {
  return (
    <div>
      <p className="eyebrow">Predicted urgency</p>
      <div className="mt-2 flex items-center justify-between">
        <span className={`text-sm font-semibold capitalize ${URG[urgency.level]}`}>{urgency.level}</span>
        <Conf value={urgency.confidence} />
      </div>
      <ul className="mt-1.5 space-y-0.5">{urgency.reasons.slice(0, 2).map((r) => <li key={r} className="text-xs text-muted">{r}</li>)}</ul>
      <p className="mt-2 font-mono text-[11px] text-muted">Local rules &middot; severity + tone</p>
    </div>
  );
}

export function CategoryCard({ classification, children }) {
  return (
    <div>
      <p className="eyebrow">Category</p>
      <div className="mt-2 flex items-center justify-between">
        <span className="text-sm font-medium">{classification.label}</span>
        <Conf value={classification.confidence} />
      </div>
      {classification.predicted && <p className="mt-1.5 text-xs text-muted">Model said {classification.predicted}.</p>}
      {classification.evidence?.length > 0 && <p className="mt-1.5 text-xs text-muted">Matched {classification.evidence.map((e) => `"${e}"`).join(', ')}</p>}
      {children}
      <Engine {...classification} />
    </div>
  );
}

export function RoutingCard({ routing, team }) {
  return (
    <div>
      <p className="eyebrow">Recommended department</p>
      <p className="mt-2 text-sm font-medium">{team || routing.team}</p>
      <p className="mt-1 text-xs leading-relaxed text-muted">{routing.reason}</p>
      <p className="mt-2 font-mono text-[11px] text-muted">rule: {routing.rule}</p>
    </div>
  );
}

// Expert recommendation card, used on the ticket and on Expert Assignment.
export function ExpertCard({ e, rank, onAssign, canAssign, busy, current }) {
  return (
    <div className={`rounded-lg border p-4 ${rank === 1 ? 'border-ink/40' : 'border-line'} ${!e.eligible ? 'opacity-70' : ''}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="num grid size-6 shrink-0 place-items-center rounded-full bg-sunken font-mono text-[11px] font-semibold">{rank}</span>
          <div className="min-w-0">
            <p className="truncate text-[14px] font-semibold">{e.name}</p>
            <p className="truncate text-[12px] text-muted">{e.title} &middot; {e.team}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="num font-mono text-[18px] font-semibold leading-none">{e.score}</p>
          <p className="mt-1 text-[10.5px] text-muted" title="Weighted score, not a prediction">match score</p>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-4 gap-2">
        {e.parts.map((p) => (
          <div key={p.key} title={`${p.label}: ${p.points} of ${p.max}`}>
            <div className="flex h-1 overflow-hidden rounded-full bg-line"><span className="bg-ink" style={{ width: `${(p.points / p.max) * 100}%` }} /></div>
            <p className="mt-1 truncate text-[10.5px] text-muted">{p.label}</p>
          </div>
        ))}
      </div>
      <ul className="mt-3 space-y-1">
        {e.reasons.map((r) => (
          <li key={r.text} className="flex gap-2 text-[12.5px] leading-snug">
            <span className={`mt-0.5 font-mono text-[11px] ${r.ok ? 'text-pos' : 'text-faint'}`} aria-hidden="true">{r.ok ? '+' : '–'}</span>
            <span className={r.ok ? 'text-ink-2' : 'text-muted'}>{r.text}</span>
          </li>
        ))}
      </ul>
      {onAssign && (
        <div className="mt-3 flex items-center justify-between gap-2 border-t border-line pt-3">
          <span className="text-[11.5px] text-muted">{current ? 'Currently assigned' : !e.eligible ? 'Unavailable or at capacity' : rank === 1 ? 'Top recommendation' : 'Supervisor override'}</span>
          {!current && (
            <button type="button" disabled={!canAssign || busy} onClick={() => onAssign(e, rank)}
              title={!canAssign ? 'Only a supervisor can override the top recommendation' : undefined}
              className={`h-8 rounded-md px-3 text-[12.5px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${rank === 1 ? 'bg-invert text-on-invert hover:opacity-90' : 'border border-line-strong hover:bg-sunken'}`}>
              {rank === 1 ? `Assign to ${e.name.split(' ')[0]}` : 'Override'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
