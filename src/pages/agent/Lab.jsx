import { useState } from 'react';
import { Lightning } from '@phosphor-icons/react';
import { Button, ErrorNote, Empty } from '../../components/ui.jsx';
import { ScoreBreakdown, SentimentCard, CategoryCard, RoutingCard } from '../../components/Triage.jsx';
import { api } from '../../lib/api.js';

// Paste any complaint and watch the pipeline score it. Nothing is saved.
// This is the screen to demo to judges: same engine the real tickets use.
const SAMPLES = [
  { name: 'Double charge, repeat', tier: 'premium', priorContacts: 2,
    subject: 'Charged twice AGAIN', message: 'This is the third time I am writing. I was charged twice for order 55120 and nobody has replied. Card 4111 1111 1111 1111. Fix it today or I am filing in consumer court.' },
  { name: 'Angry but routine', tier: 'standard', priorContacts: 0,
    subject: 'Profile photo', message: 'HOW DO I CHANGE MY PROFILE PHOTO?? This app is so frustrating, ridiculous design!!!' },
  { name: 'Sarcastic praise', tier: 'standard', priorContacts: 0,
    subject: 'Great job', message: 'Great job guys, my parcel has been "out for delivery" for six days now. Really amazing service.' },
  { name: 'Enterprise outage', tier: 'enterprise', priorContacts: 0,
    subject: 'Dashboard down', message: 'Our seller dashboard is completely down for the entire team since 9am. We cannot process orders and it is costing revenue.' },
  { name: 'Account compromise', tier: 'standard', priorContacts: 0,
    subject: 'Login I do not recognise', message: 'Got an alert about a login from another city. I think my account was hacked, there is an order I did not place.' },
];

export default function Lab() {
  const [form, setForm] = useState({ subject: SAMPLES[0].subject, message: SAMPLES[0].message, tier: SAMPLES[0].tier, priorContacts: SAMPLES[0].priorContacts });
  const [res, setRes] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function run(e) {
    e?.preventDefault();
    setBusy(true); setError(null);
    try { setRes(await api('/analyze', { method: 'POST', body: form })); }
    catch (err) { setError(err); } finally { setBusy(false); }
  }
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div className="px-5 py-6 lg:px-8">
      <h1 className="text-xl font-semibold tracking-tight">Triage lab</h1>
      <p className="mt-1 max-w-[70ch] text-[13px] text-muted">
        Run any message through the same pipeline live tickets use: redaction, sentiment, category, priority, routing. Nothing here is saved.
      </p>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <form onSubmit={run} className="panel space-y-4 p-5">
          <div>
            <p className="eyebrow">Try a case</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {SAMPLES.map((s) => (
                <button type="button" key={s.name}
                  onClick={() => { setForm({ subject: s.subject, message: s.message, tier: s.tier, priorContacts: s.priorContacts }); setRes(null); }}
                  className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${form.message === s.message ? 'border-ink bg-invert text-on-invert' : 'border-line-strong text-ink-2 hover:border-faint'}`}>
                  {s.name}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label htmlFor="lab-subject" className="label">Subject</label>
            <input id="lab-subject" className="field" value={form.subject} onChange={set('subject')} />
          </div>
          <div>
            <label htmlFor="lab-message" className="label">Message</label>
            <textarea id="lab-message" rows={7} className="field resize-y leading-relaxed" value={form.message} onChange={set('message')} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="lab-tier" className="label">Customer tier</label>
              <select id="lab-tier" className="field cursor-pointer" value={form.tier} onChange={set('tier')}>
                <option value="standard">Standard</option><option value="premium">Premium</option><option value="enterprise">Enterprise</option>
              </select>
            </div>
            <div>
              <label htmlFor="lab-prior" className="label">Earlier tickets this week</label>
              <input id="lab-prior" type="number" min={0} max={10} className="field num font-mono" value={form.priorContacts} onChange={set('priorContacts')} />
            </div>
          </div>
          <ErrorNote error={error} />
          <div className="flex items-center justify-between border-t border-line pt-4">
            <span className="font-mono text-[11px] text-muted">{res ? `${res.totalMs}ms end to end` : ''}</span>
            <Button type="submit" loading={busy}><Lightning size={15} weight="fill" /> Run triage</Button>
          </div>

          {res && (
            <div className="rise border-t border-line pt-4">
              <p className="eyebrow">Stored text after redaction</p>
              <p className="mt-2 whitespace-pre-wrap rounded-md bg-sunken p-3 text-[13px] leading-relaxed text-ink-2">{res.message}</p>
              {res.redactions.length > 0 && <p className="mt-1.5 text-xs text-muted">Removed: {res.redactions.join(', ')}</p>}
            </div>
          )}
        </form>

        <aside className="space-y-4">
          {!res && <div className="panel"><Empty icon={Lightning} title="Run a message to see its triage" hint="Every point of the score comes with the reason it was given." /></div>}
          {res && (
            <>
              <section className="panel rise p-5"><ScoreBreakdown priority={res.priority} /></section>
              <section className="panel rise divide-y divide-line [animation-delay:60ms]">
                <div className="p-5"><SentimentCard sentiment={res.sentiment} /></div>
                <div className="p-5"><CategoryCard classification={res.classification} /></div>
                <div className="p-5"><RoutingCard routing={res.routing} /></div>
              </section>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
