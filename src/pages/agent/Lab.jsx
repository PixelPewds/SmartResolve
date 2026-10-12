import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Lightning, ListChecks, Copy, UsersThree, ShieldCheck } from '@phosphor-icons/react';
import { Page, PageHeader, Tabs, Panel, Sim } from '../../components/kit.jsx';
import { Button, ErrorNote, Empty, Skeleton } from '../../components/ui.jsx';
import { ScoreBreakdown, SentimentCard, CategoryCard, RoutingCard, UrgencyCard, ExpertCard } from '../../components/Triage.jsx';
import { api, useApi } from '../../lib/api.js';

// Samples include cases the engine gets WRONG, on purpose.
const SAMPLES = [
  { name: 'Double charge, repeat', tier: 'premium', priorContacts: 2, subject: 'Charged twice AGAIN', message: 'This is the third time I am writing. I was charged twice for order 55120 and nobody has replied. Card 4111 1111 1111 1111. Fix it today or I am filing in consumer court.' },
  { name: 'Angry but routine', tier: 'enterprise', priorContacts: 0, subject: 'Profile photo', message: 'HOW DO I CHANGE MY PROFILE PHOTO?? This app is so frustrating, ridiculous design!!!' },
  { name: 'Sarcastic praise', tier: 'standard', priorContacts: 0, subject: 'Great job', message: 'Great job guys, my parcel has been "out for delivery" for six days now. Really amazing service.' },
  { name: 'Enterprise outage', tier: 'enterprise', priorContacts: 0, subject: 'Dashboard down', message: 'Our seller dashboard is completely down for the entire team since 9am. We cannot process orders and it is costing revenue.' },
  { name: 'Hinglish (fails)', tier: 'standard', priorContacts: 0, subject: 'Refund', message: 'Paise do baar kat gaye, refund kab milega? Bahut pareshaan hoon.' },
  { name: 'Polite but serious (fails)', tier: 'standard', priorContacts: 0, subject: 'Account', message: 'Hello, kindly note that my account appears to have been accessed by someone else last night. Regards.' },
];

export default function Lab() {
  const [mode, setMode] = useState('cases');
  const [form, setForm] = useState({ ...SAMPLES[0] });
  const [res, setRes] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function run(f = form) {
    setBusy(true); setError(null);
    try { setRes(await api('/analyze', { method: 'POST', body: { subject: f.subject, message: f.message, tier: f.tier, priorContacts: Number(f.priorContacts) } })); }
    catch (err) { setError(err); } finally { setBusy(false); }
  }
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <Page>
      <PageHeader title="AI triage lab"
        sub="Run any complaint through the exact pipeline live tickets use: redaction, sentiment, category, urgency, hybrid priority, routing, similar complaints and expert recommendation. Nothing is saved."
        actions={<Button onClick={() => run()} loading={busy} disabled={mode === 'compare'}><Lightning size={15} weight="fill" /> Run analysis</Button>}>
        <div className="mt-2"><Sim title="Local rule and lexicon models unless HF_TOKEN is set. Results are real computation, but the models are prototypes.">Prototype models</Sim></div>
      </PageHeader>

      <Tabs className="mt-5" value={mode} onChange={setMode} items={[{ value: 'cases', label: 'Try a case' }, { value: 'custom', label: 'Custom input' }, { value: 'compare', label: 'Compare with expected' }]} />

      {mode === 'compare' ? <Compare /> : (
        <div className="mt-4 grid gap-6 xl:grid-cols-[minmax(0,1fr)_400px]">
          <div className="min-w-0 space-y-5">
            <form onSubmit={(e) => { e.preventDefault(); run(); }} className="panel space-y-4 p-5">
              {mode === 'cases' && (
                <div className="flex flex-wrap gap-1.5">
                  {SAMPLES.map((s) => (
                    <button type="button" key={s.name} onClick={() => { setForm({ ...s }); run(s); }}
                      className={`rounded-full border px-3 py-1 text-[12.5px] transition-colors ${form.message === s.message ? 'border-ink bg-invert text-on-invert' : 'border-line-strong text-ink-2 hover:border-faint'}`}>{s.name}</button>
                  ))}
                </div>
              )}
              <div><label htmlFor="lab-subject" className="label">Subject</label><input id="lab-subject" className="field" value={form.subject} onChange={set('subject')} /></div>
              <div><label htmlFor="lab-message" className="label">Message</label><textarea id="lab-message" rows={mode === 'custom' ? 7 : 4} className="field resize-y leading-relaxed" value={form.message} onChange={set('message')} /></div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div><label htmlFor="lab-tier" className="label">Customer tier</label>
                  <select id="lab-tier" className="field cursor-pointer" value={form.tier} onChange={set('tier')}><option value="standard">Standard</option><option value="premium">Premium</option><option value="enterprise">Enterprise</option></select></div>
                <div><label htmlFor="lab-prior" className="label">Earlier tickets this week</label><input id="lab-prior" type="number" min={0} max={10} className="field num font-mono" value={form.priorContacts} onChange={set('priorContacts')} /></div>
              </div>
              <ErrorNote error={error} />
              <div className="flex items-center justify-between border-t border-line pt-4">
                <span className="font-mono text-[11px] text-muted">{res ? `${res.totalMs} ms end to end` : 'Press Run analysis'}</span>
                <Button type="submit" loading={busy}><Lightning size={15} weight="fill" /> Run</Button>
              </div>
            </form>

            {!res && !busy && <div className="panel"><Empty icon={Lightning} title="Run a message to see its analysis" hint="Pick a case above. Two of them are known failures." /></div>}
            {busy && !res && <Skeleton className="h-64" />}
            {res && (
              <>
                <section className="panel rise grid divide-line sm:grid-cols-2 [&>*]:border-line [&>*]:p-5 sm:[&>*:nth-child(odd)]:border-r [&>*:nth-child(-n+2)]:border-b max-sm:[&>*]:border-b">
                  <CategoryCard classification={res.classification} />
                  <UrgencyCard urgency={res.triage.urgency} />
                  <SentimentCard sentiment={res.sentiment} />
                  <RoutingCard routing={res.routing} />
                </section>

                <div className="grid gap-5 lg:grid-cols-2">
                  <Panel title="Recommended actions" icon={ListChecks}>
                    <ol className="space-y-2">{res.actions.map((a, i) => <li key={a} className="flex gap-3 text-[13px]"><span className="num grid size-5 shrink-0 place-items-center rounded-full bg-sunken font-mono text-[10.5px]">{i + 1}</span><span className="text-ink-2">{a}</span></li>)}</ol>
                  </Panel>
                  <Panel title="Stored text after redaction" icon={ShieldCheck}>
                    <p className="whitespace-pre-wrap rounded-md bg-sunken p-3 text-[13px] leading-relaxed text-ink-2">{res.message}</p>
                    <p className="mt-2 text-xs text-muted">{res.redactions.length ? `Removed: ${res.redactions.join(', ')}` : 'Nothing sensitive found.'}</p>
                  </Panel>
                </div>

                <Panel title="Similar historical complaints" icon={Copy} sub="Resolved tickets ranked by text similarity" bodyClass="">
                  {res.similar.length === 0 && <Empty title="No close matches in history" />}
                  <ul className="divide-y divide-line">
                    {res.similar.map((s) => (
                      <li key={s.id} className="px-5 py-3">
                        <div className="flex items-baseline justify-between gap-2"><Link to={`/agent/tickets/${s.id}`} className="truncate text-[13.5px] font-medium hover:underline">{s.subject}</Link><span className="num shrink-0 font-mono text-[12px] text-muted">{Math.round(s.similarity * 100)}%</span></div>
                        <p className="mt-0.5 text-[12.5px] text-muted">Fix: {s.fix}</p>
                      </li>
                    ))}
                  </ul>
                </Panel>

                <Panel title="Recommended experts" icon={UsersThree} sub={`Needs ${res.experts.neededSkills.join(', ')}`}>
                  <div className="grid gap-3 lg:grid-cols-2">{res.experts.experts.slice(0, 2).map((e, i) => <ExpertCard key={e.agentId} e={e} rank={i + 1} />)}</div>
                </Panel>
              </>
            )}
          </div>
          <aside className="xl:sticky xl:top-20 xl:self-start">
            {res ? <section className="panel rise p-5"><ScoreBreakdown priority={res.priority} compact /><p className="mt-4 border-t border-line pt-3 text-[11.5px] text-muted">Lab tickets are scored at age zero, so waiting time and SLA risk start at 0. Real tickets gain those points while they wait.</p></section>
              : <div className="panel"><Empty title="Priority breakdown appears here" /></div>}
          </aside>
        </div>
      )}
    </Page>
  );
}

function Compare() {
  const { data, error, loading, reload } = useApi('/evalset');
  const [only, setOnly] = useState('wrong');
  if (loading) return <Skeleton className="mt-4 h-96" />;
  if (error) return <div className="mt-4"><ErrorNote error={error} onRetry={reload} /></div>;
  const wrong = (r) => !r.correct.category || !r.correct.sentiment || !r.correct.urgency;
  const rows = data.rows.filter((r) => only === 'all' || wrong(r));
  return (
    <Panel className="mt-4" title="Predicted vs expected" sub={`${data.rows.filter(wrong).length} of ${data.rows.length} labelled cases have at least one wrong field. Full metrics are on Feedback & learning.`}
      action={<Tabs size="sm" value={only} onChange={setOnly} items={[{ value: 'wrong', label: 'Wrong only' }, { value: 'all', label: 'All' }]} />} bodyClass="overflow-x-auto">
      <table className="w-full min-w-[720px] text-left text-[13px]">
        <thead className="border-b border-line bg-sunken text-[11px] uppercase tracking-[0.05em] text-muted">
          <tr><th className="px-5 py-2.5 font-medium">Complaint</th><th className="px-3 py-2.5 font-medium">Category</th><th className="px-3 py-2.5 font-medium">Sentiment</th><th className="px-5 py-2.5 font-medium">Urgency</th></tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((r) => (
            <tr key={r.id} className="align-top">
              <td className="max-w-md px-5 py-3"><span className="font-mono text-[11px] text-muted">{r.id}{r.hard ? ` · ${r.hard}` : ''}</span><p className="mt-0.5">{r.text}</p></td>
              <Cell ok={r.correct.category} got={r.predicted.category} exp={r.category} />
              <Cell ok={r.correct.sentiment} got={r.predicted.sentiment} exp={r.sentiment} />
              <Cell ok={r.correct.urgency} near={r.correct.urgencyNear} got={r.predicted.urgency} exp={r.urgency} last />
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
}

function Cell({ ok, near, got, exp, last }) {
  return (
    <td className={`${last ? 'px-5' : 'px-3'} py-3 capitalize`}>
      {ok ? <span className="text-ink-2">{got}</span> : (
        <span className={near ? 'text-p3' : 'text-p1'}>
          <span className="line-through opacity-70">{got}</span><span className="block text-[11.5px] font-medium normal-case">expected {exp}</span>
        </span>
      )}
    </td>
  );
}
