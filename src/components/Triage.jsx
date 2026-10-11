import { Band, Sentiment, ScoreMeter } from './ui.jsx';

const FACTOR_COLOR = { P1: 'bg-p1', P2: 'bg-p2', P3: 'bg-p3', P4: 'bg-p4' };

// The explainable part. Every point in the score is shown with the reason it
// was awarded, so an agent can disagree with a specific factor, not "the AI".
export function ScoreBreakdown({ priority }) {
  return (
    <div>
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Priority score</p>
          <div className="mt-2"><ScoreMeter score={priority.score} band={priority.band} size="lg" /></div>
        </div>
        <div className="pb-1 text-right">
          <Band band={priority.band} withLabel />
          <p className="mt-1.5 text-xs text-muted">Response target {priority.slaHours}h</p>
        </div>
      </div>

      <ul className="mt-5 space-y-4">
        {priority.factors.map((f) => (
          <li key={f.key}>
            <div className="flex items-baseline justify-between text-[13px]">
              <span className="font-medium text-ink">{f.label}</span>
              <span className="num font-mono text-muted"><span className="text-ink">{f.points}</span> / {f.max}</span>
            </div>
            <div className="mt-1.5 flex h-1 gap-px overflow-hidden rounded-full" aria-hidden="true">
              <span className={FACTOR_COLOR[priority.band]} style={{ width: `${(f.points / 100) * 100}%` }} />
              <span className="bg-line" style={{ width: `${((f.max - f.points) / 100) * 100}%` }} />
            </div>
            <ul className="mt-1.5 space-y-0.5">
              {f.reasons.map((r) => <li key={r} className="text-xs leading-relaxed text-muted">{r}</li>)}
            </ul>
          </li>
        ))}
      </ul>

      {priority.rules?.length > 0 && (
        <div className="mt-5 rounded-md border border-dashed border-line-strong px-3 py-2.5">
          <p className="eyebrow">Guardrail applied</p>
          {priority.rules.map((r) => <p key={r} className="mt-1 text-[13px] text-ink-2">{r}</p>)}
        </div>
      )}
    </div>
  );
}

function Engine({ engine, model, latencyMs }) {
  const label = engine === 'huggingface' ? 'Hugging Face' : engine === 'agent' ? 'Agent' : 'Local model';
  return (
    <p className="mt-2 truncate font-mono text-[11px] text-muted" title={model}>
      {label} &middot; {model}{latencyMs != null && engine === 'huggingface' ? ` · ${latencyMs}ms` : ''}
    </p>
  );
}

export function SentimentCard({ sentiment }) {
  return (
    <div>
      <p className="eyebrow">Sentiment</p>
      <div className="mt-2 flex items-center justify-between">
        <Sentiment label={sentiment.label} />
        <span className="num font-mono text-xs text-muted">{Math.round(sentiment.confidence * 100)}% conf.</span>
      </div>
      {sentiment.evidence?.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1">
          {sentiment.evidence.map((e, i) => (
            <span key={`${e.term}-${i}`} className={`rounded px-1.5 py-0.5 font-mono text-[11px] ${e.weight < 0 ? 'bg-neg-bg text-neg' : 'bg-pos-bg text-pos'}`}>
              {e.term}
            </span>
          ))}
        </div>
      )}
      <Engine {...sentiment} />
    </div>
  );
}

export function CategoryCard({ classification, children }) {
  return (
    <div>
      <p className="eyebrow">Category</p>
      <div className="mt-2 flex items-center justify-between">
        <span className="text-sm font-medium">{classification.label}</span>
        <span className="num font-mono text-xs text-muted">{Math.round(classification.confidence * 100)}% conf.</span>
      </div>
      {classification.evidence?.length > 0 && (
        <p className="mt-1.5 text-xs text-muted">Matched {classification.evidence.map((e) => `"${e}"`).join(', ')}</p>
      )}
      {children}
      <Engine {...classification} />
    </div>
  );
}

export function RoutingCard({ routing, team }) {
  return (
    <div>
      <p className="eyebrow">Routed to</p>
      <p className="mt-2 text-sm font-medium">{team || routing.team}</p>
      <p className="mt-1 text-xs leading-relaxed text-muted">{routing.reason}</p>
      <p className="mt-2 font-mono text-[11px] text-muted">rule: {routing.rule}</p>
    </div>
  );
}
