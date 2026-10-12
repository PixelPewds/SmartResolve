import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ShieldCheck, Paperclip, X, CheckCircle, ArrowRight, ArrowLeft, Sparkle, Lightbulb, Copy, ListBullets, PlusCircle } from '@phosphor-icons/react';
import { Button, ErrorNote } from '../../components/ui.jsx';
import { Sim, Field } from '../../components/kit.jsx';
import { api, fmtDateTime } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import { Tracker } from './PortalTicket.jsx';

const MAX = 4000;
const CATEGORIES = [['unsure', 'Not sure, let SmartResolve decide'], ['billing', 'Billing & Payments'], ['technical', 'Website or app problem'], ['delivery', 'Delivery & Orders'], ['account', 'Account & Login'], ['general', 'Something else']];
const EXAMPLES = {
  web: { subject: 'Website not loading', message: 'The website pages are not loading at all and are very slow. I am trying to checkout my order and the page keeps spinning.', category: 'technical' },
  double: { subject: 'Charged twice for the same order', message: 'I was charged twice for order #48213. Both transactions appear on my statement, but I received only one order confirmation. Please refund the duplicate.', category: 'billing', orderRef: '48213' },
  parcel: { subject: 'Order not delivered', message: 'My parcel was marked delivered yesterday but it never arrived. Nobody at home received anything.', category: 'delivery' },
  login: { subject: 'Cannot log in to my account', message: 'I am locked out of my account and the OTP is not coming on my phone.', category: 'account' },
  refund: { subject: 'Refund not received', message: 'My refund was approved 10 days ago and I still have not received it in my bank account.', category: 'billing' },
};
const STEPS = ['Details', 'Review', 'Submitted'];
const URG = { critical: 'text-p1', high: 'text-p2', medium: 'text-p3', low: 'text-p4' };

export default function PortalHome() {
  const { user } = useAuth();
  const [params] = useSearchParams();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({ subject: '', message: '', orderRef: '', customerCategory: 'unsure', attachments: [] });
  const [preview, setPreview] = useState(null);
  const [previewing, setPreviewing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [created, setCreated] = useState(null);
  const fileRef = useRef(null);

  useEffect(() => {
    const ex = EXAMPLES[params.get('example')];
    if (ex) fill(ex);
  }, [params]); // eslint-disable-line react-hooks/exhaustive-deps

  // Live AI preview, debounced. Nothing is saved until Submit.
  useEffect(() => {
    if ((form.subject + form.message).trim().length < 12) { setPreview(null); return; }
    setPreviewing(true);
    const id = setTimeout(async () => {
      try { setPreview(await api('/preview', { method: 'POST', body: { subject: form.subject, message: form.message } })); }
      catch { setPreview(null); } finally { setPreviewing(false); }
    }, 450);
    return () => clearTimeout(id);
  }, [form.subject, form.message]);

  function fill(ex) { setForm((f) => ({ ...f, subject: ex.subject, message: ex.message, customerCategory: ex.category || 'unsure', orderRef: ex.orderRef || '' })); setStep(0); setCreated(null); }
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  function addFiles(list) {
    const files = [...list].slice(0, 5 - form.attachments.length).map((f) => ({ name: f.name.slice(0, 120), size: f.size, type: f.type || 'application/octet-stream' }));
    const tooBig = files.find((f) => f.size > 10 * 1024 * 1024);
    if (tooBig) { setError(new Error(`${tooBig.name} is over 10 MB`)); return; }
    setForm((f) => ({ ...f, attachments: [...f.attachments, ...files] }));
  }

  function next() {
    setError(null);
    if (form.subject.trim().length < 4) return setError(Object.assign(new Error('Add a short subject (at least 4 characters)'), { field: 'subject' }));
    if (form.message.trim().length < 15) return setError(Object.assign(new Error('Describe what happened in a little more detail'), { field: 'message' }));
    setStep(1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function submit() {
    setBusy(true); setError(null);
    try {
      const { ticket } = await api('/tickets', { method: 'POST', body: form });
      setCreated(ticket); setStep(2);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) { setError(err); setStep(0); } finally { setBusy(false); }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 pb-28 pt-6 sm:px-6 md:pb-14 md:pt-10">
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div className="max-w-xl">
          <h1 className="text-[26px] font-semibold leading-tight tracking-tight sm:text-[30px]">{step === 2 ? 'Request received' : `Hi ${user.name.split(' ')[0]}, what went wrong?`}</h1>
          <p className="mt-2 text-[14.5px] leading-relaxed text-ink-2">{step === 2 ? 'We have analysed it and sent it to the right team.' : 'Describe it in your own words. SmartResolve reads it and routes it to the team that handles it, so you do not need to pick a department.'}</p>
        </div>
        <Stepper step={step} />
      </div>

      {step === 2 && created ? <Submitted t={created} onAnother={() => { setForm({ subject: '', message: '', orderRef: '', customerCategory: 'unsure', attachments: [] }); setCreated(null); setStep(0); }} /> : (
        <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
          <div className="min-w-0">
            {step === 0 && (
              <form className="panel space-y-5 p-5 sm:p-6" onSubmit={(e) => { e.preventDefault(); next(); }} noValidate>
                <Field label="Subject" htmlFor="subject" error={error?.field === 'subject' && error.message}>
                  <input id="subject" className="field" maxLength={140} placeholder="For example: Charged twice for one order" value={form.subject} onChange={set('subject')} />
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Category" htmlFor="cat" optional>
                    <select id="cat" className="field cursor-pointer" value={form.customerCategory} onChange={set('customerCategory')}>
                      {CATEGORIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </Field>
                  <Field label="Order or reference number" htmlFor="ref" optional>
                    <input id="ref" className="field font-mono" maxLength={40} value={form.orderRef} onChange={set('orderRef')} />
                  </Field>
                </div>
                <div>
                  <div className="flex items-baseline justify-between"><label htmlFor="message" className="label">What happened</label><span className="num font-mono text-[11px] text-muted">{form.message.length} / {MAX}</span></div>
                  <textarea id="message" rows={7} maxLength={MAX} className="field resize-y leading-relaxed" placeholder="When did it start, what did you expect, and what happened instead?" value={form.message} onChange={set('message')} />
                  {error?.field === 'message' && <p className="hint text-p1">{error.message}</p>}
                </div>
                <div>
                  <p className="label">Attachments <span className="font-normal text-muted">(optional)</span></p>
                  <button type="button" onClick={() => fileRef.current?.click()}
                    onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); addFiles(e.dataTransfer.files); }}
                    className="flex w-full flex-col items-center gap-1 rounded-md border border-dashed border-line-strong px-4 py-5 text-center hover:border-faint hover:bg-sunken">
                    <Paperclip size={20} className="text-muted" />
                    <span className="text-[13px]">Drop files or <span className="font-medium underline underline-offset-2">choose files</span></span>
                    <span className="text-[11.5px] text-muted">Screenshots or PDFs, up to 5 files, 10 MB each</span>
                  </button>
                  <input ref={fileRef} type="file" multiple accept="image/*,.pdf" className="hidden" onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
                  {form.attachments.length > 0 && (
                    <ul className="mt-2 space-y-1.5">
                      {form.attachments.map((a, i) => (
                        <li key={a.name + i} className="flex items-center gap-2 rounded-md border border-line px-3 py-2 text-[13px]">
                          <Paperclip size={14} className="text-muted" /><span className="min-w-0 flex-1 truncate">{a.name}</span>
                          <span className="font-mono text-[11px] text-muted">{Math.max(1, Math.round(a.size / 1024))} KB</span>
                          <button type="button" aria-label={`Remove ${a.name}`} onClick={() => setForm((f) => ({ ...f, attachments: f.attachments.filter((_, j) => j !== i) }))} className="text-muted hover:text-ink"><X size={14} /></button>
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="mt-2"><Sim title="Prototype: only the file name and size are recorded. Files are not uploaded or stored.">File names only, files are not uploaded</Sim></div>
                </div>
                <div className="flex gap-3 rounded-md border border-p3/30 bg-p3-bg px-4 py-3">
                  <ShieldCheck size={18} className="mt-0.5 shrink-0 text-p3" />
                  <p className="text-[12.5px] leading-relaxed text-ink-2"><span className="font-semibold text-ink">Keep your information safe.</span> Never share passwords, OTPs or card PINs. Card numbers, phone numbers and codes are removed automatically before your message is saved.</p>
                </div>
                {error && !error.field && <ErrorNote error={error} />}
                <div className="flex justify-end border-t border-line pt-5"><Button type="submit" size="lg">Review request <ArrowRight size={16} /></Button></div>
              </form>
            )}

            {step === 1 && (
              <section className="panel p-5 sm:p-6">
                <h2 className="text-[15px] font-semibold">Check your request</h2>
                <dl className="mt-4 divide-y divide-line text-[13.5px]">
                  <Row k="Subject">{form.subject}</Row>
                  <Row k="Category">{CATEGORIES.find(([v]) => v === form.customerCategory)[1]}</Row>
                  {form.orderRef && <Row k="Reference"><span className="font-mono">{form.orderRef}</span></Row>}
                  <Row k="Description"><span className="whitespace-pre-wrap">{form.message}</span></Row>
                  {form.attachments.length > 0 && <Row k="Attachments">{form.attachments.map((a) => a.name).join(', ')}</Row>}
                </dl>
                {preview?.redactions?.length > 0 && <p className="mt-4 flex gap-2 text-[12.5px] text-ink-2"><ShieldCheck size={15} className="shrink-0 text-pos" /> We will remove {[...new Set(preview.redactions)].join(', ')} details before saving.</p>}
                <ErrorNote error={error} />
                <div className="mt-6 flex flex-col-reverse gap-3 border-t border-line pt-5 sm:flex-row sm:justify-between">
                  <Button variant="secondary" size="lg" onClick={() => setStep(0)}><ArrowLeft size={16} /> Edit</Button>
                  <Button size="lg" loading={busy} onClick={submit}>Submit request</Button>
                </div>
              </section>
            )}
          </div>

          <aside className="space-y-5">
            <Preview preview={preview} loading={previewing} />
            {step === 0 && (
              <>
                <section className="panel p-5">
                  <h2 className="flex items-center gap-2 text-[14px] font-semibold"><Lightbulb size={16} /> For a faster answer</h2>
                  <ul className="mt-3 space-y-2 text-[13px] text-ink-2">
                    {['Say what you expected and what happened instead', 'Include the order or reference number', 'Mention when it started', 'Attach a screenshot if you have one'].map((x) => <li key={x} className="flex gap-2"><CheckCircle size={15} className="mt-0.5 shrink-0 text-pos" />{x}</li>)}
                  </ul>
                </section>
                <section className="panel">
                  <h2 className="border-b border-line px-5 py-3.5 text-[14px] font-semibold">Start from an example</h2>
                  <ul className="divide-y divide-line">
                    {Object.entries(EXAMPLES).map(([k, ex]) => (
                      <li key={k}><button type="button" onClick={() => fill(ex)} className="flex w-full items-center justify-between gap-3 px-5 py-2.5 text-left text-[13px] hover:bg-sunken">{ex.subject}<ArrowRight size={13} className="text-muted" /></button></li>
                    ))}
                  </ul>
                </section>
              </>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}

function Stepper({ step }) {
  return (
    <ol className="flex items-center gap-2" aria-label="Progress">
      {STEPS.map((s, i) => {
        const done = i < step || step === STEPS.length - 1;
        return (
        <li key={s} className="flex items-center gap-2">
          <span className={`num grid size-7 place-items-center rounded-full font-mono text-[12px] font-semibold ${done ? 'bg-invert text-on-invert' : i === step ? 'bg-invert text-on-invert ring-4 ring-line' : 'bg-sunken text-muted ring-1 ring-line'}`}>
            {done ? <CheckCircle size={15} weight="fill" /> : i + 1}
          </span>
          <span className={`hidden text-[12.5px] sm:inline ${i === step ? 'font-semibold' : 'text-muted'}`}>{s}</span>
          {i < STEPS.length - 1 && <span className="h-px w-5 bg-line-strong sm:w-8" aria-hidden="true" />}
        </li>
        );
      })}
    </ol>
  );
}

function Row({ k, children }) {
  return <div className="grid gap-1 py-2.5 sm:grid-cols-[120px_1fr] sm:gap-4"><dt className="text-muted">{k}</dt><dd>{children}</dd></div>;
}

function Preview({ preview, loading }) {
  return (
    <section className="panel overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
        <h2 className="flex items-center gap-2 text-[14px] font-semibold"><Sparkle size={16} weight="fill" /> AI analysis preview</h2>
        <Sim title="Runs the prototype's local models as you type. Nothing is saved until you submit.">Simulated</Sim>
      </div>
      {!preview ? (
        <p className="px-5 py-8 text-center text-[13px] text-muted">{loading ? 'Analysing…' : 'Start typing and SmartResolve will show how it reads your request.'}</p>
      ) : (
        <div className={`divide-y divide-line transition-opacity ${loading ? 'opacity-60' : ''}`}>
          <PRow label="Predicted category" value={preview.category.label} conf={preview.category.confidence} />
          <PRow label="Urgency" value={<span className={`capitalize ${URG[preview.urgency.level]}`}>{preview.urgency.level}</span>} conf={preview.urgency.confidence} note={preview.urgency.reasons[0]} />
          <PRow label="Tone" value={<span className="capitalize">{preview.sentiment.label}</span>} conf={preview.sentiment.confidence} note={preview.sentiment.sarcasm ? 'Reads as possible sarcasm' : null} />
          <PRow label="Will go to" value={preview.team} />
          {(preview.orderRef || preview.articles?.length > 0) && (
            <div className="bg-sunken/60 px-5 py-3.5 text-[12.5px] text-ink-2">
              {preview.orderRef && <p>Found a reference number <span className="font-mono">{preview.orderRef}</span>.</p>}
              {preview.articles?.[0] && <p className="mt-1">This might already help: <span className="font-medium">{preview.articles[0].title}</span></p>}
            </div>
          )}
          <p className="px-5 py-2.5 text-[11px] text-muted">Confidence is how sure the model is, not a guarantee. A person reviews every request.</p>
        </div>
      )}
    </section>
  );
}

function PRow({ label, value, conf, note }) {
  return (
    <div className="px-5 py-3">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[12px] text-muted">{label}</span>
        {conf != null && <span className="num font-mono text-[11px] text-muted">{Math.round(conf * 100)}% conf.</span>}
      </div>
      <p className="mt-0.5 text-[14px] font-semibold">{value}</p>
      {note && <p className="mt-0.5 text-[11.5px] text-muted">{note}</p>}
    </div>
  );
}

function Submitted({ t, onAnother }) {
  const [copied, setCopied] = useState(false);
  return (
    <section className="rise mt-8 grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <div className="panel p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <CheckCircle size={28} weight="fill" className="shrink-0 text-pos" />
          <div>
            <h2 className="text-[17px] font-semibold">Your request is with our {t.team} team</h2>
            <p className="mt-1 text-[13.5px] text-ink-2">We aim to reply within {t.responseTargetMin < 60 ? `${t.responseTargetMin} minutes` : `${t.responseTargetMin / 60} hours`}.</p>
          </div>
        </div>
        <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Box k="Request ID"><span className="flex items-center gap-1.5 font-mono">{t.id}<button type="button" aria-label="Copy ID" onClick={() => { navigator.clipboard?.writeText(t.id); setCopied(true); }} className="text-muted hover:text-ink"><Copy size={13} /></button></span>{copied && <span className="text-[10.5px] text-pos">copied</span>}</Box>
          <Box k="Submitted">{fmtDateTime(t.createdAt)}</Box>
          <Box k="Category">{t.category}</Box>
          <Box k="Urgency"><span className={`capitalize ${URG[t.urgency]}`}>{t.urgency}</span></Box>
        </dl>
        {t.redactions?.length > 0 && <p className="mt-4 text-[12.5px] text-muted">We removed {[...new Set(t.redactions)].join(', ')} details from your message before saving it.</p>}
        <div className="mt-6"><Tracker steps={t.steps} /></div>
      </div>
      <div className="panel p-5 sm:p-6">
        <h2 className="text-[14px] font-semibold">What happens next</h2>
        <ol className="mt-3 space-y-3 text-[13px] text-ink-2">
          {['An expert with the right skills is assigned', 'You get a notification when they reply', 'If many customers report the same problem, we tell you it is a known issue', 'Once it is fixed, you can rate how we did'].map((x, i) => (
            <li key={x} className="flex gap-3"><span className="num grid size-5 shrink-0 place-items-center rounded-full bg-sunken font-mono text-[10.5px]">{i + 1}</span>{x}</li>
          ))}
        </ol>
        <div className="mt-6 grid gap-2 sm:grid-cols-2">
          <Button as={Link} to={`/portal/tickets/${t.id}`} variant="secondary"><ListBullets size={15} /> Track request</Button>
          <Button onClick={onAnother}><PlusCircle size={15} /> New request</Button>
        </div>
      </div>
    </section>
  );
}

function Box({ k, children }) {
  return <div className="rounded-md bg-sunken px-3 py-2.5"><dt className="text-[11px] text-muted">{k}</dt><dd className="mt-0.5 text-[13.5px] font-semibold">{children}</dd></div>;
}
