import { useState } from 'react';
import { ArrowCounterClockwise, Database, Cpu, CheckCircle, Circle } from '@phosphor-icons/react';
import { Page, PageHeader, Panel, Dialog, toast } from '../../components/kit.jsx';
import { Button, ErrorNote } from '../../components/ui.jsx';
import { api, useApi } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import { ThemeToggle } from '../../lib/theme.jsx';
import { refreshNotifications } from '../../lib/notifications.js';

const REAL = [
  'Every ticket runs through the triage pipeline: redaction, sentiment, category, urgency, routing',
  'Hybrid priority scores and their written reasons, recomputed on every load',
  'SLA clocks, warnings, breaches and automatic escalation rules',
  'Similar-ticket search, complaint clustering and spike statistics (TF-IDF, z-score)',
  'Expert match scores from skills, availability, workload and history',
  'Model evaluation against a hand-labelled test set',
  'Saving tickets, replies, notes, assignments, escalations, incidents and feedback to the database',
];
const SIM = [
  'Customers, agents, their availability and the ticket history are invented sample data',
  'Customer ratings and agent corrections in the seed data',
  'Attachments: file names are recorded, files are not uploaded',
  'Notifications are in-app only, no email, SMS or WhatsApp is sent',
  'Local models are rules and lexicons. Hugging Face models switch on with HF_TOKEN',
];

export default function Settings() {
  const { user } = useAuth();
  const health = useApi('/health');
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const supervisor = user.role === 'supervisor';

  async function reset() {
    setBusy(true); setErr(null);
    try { await api('/demo/reset', { method: 'POST' }); setConfirm(false); toast('Demo data reset to now'); refreshNotifications(); setTimeout(() => window.location.assign('/agent'), 600); }
    catch (e) { setErr(e); } finally { setBusy(false); }
  }

  return (
    <Page className="max-w-4xl">
      <PageHeader title="Settings" sub="Appearance, system status and the demo data." />
      <div className="mt-6 space-y-6">
        <Panel title="Appearance">
          <div className="flex items-center justify-between gap-4"><p className="text-[13.5px]">Theme</p><ThemeToggle /></div>
        </Panel>

        <Panel title="System status">
          <dl className="grid gap-4 sm:grid-cols-2">
            <div className="flex gap-3"><Database size={20} className="mt-0.5 text-muted" /><div><dt className="text-[12px] text-muted">Database</dt><dd className="text-[14px] font-medium">{health.data ? (health.data.db === 'mongodb' ? 'MongoDB Atlas' : 'In-memory (resets on restart)') : '…'}</dd></div></div>
            <div className="flex gap-3"><Cpu size={20} className="mt-0.5 text-muted" /><div><dt className="text-[12px] text-muted">AI engine</dt><dd className="text-[14px] font-medium">{health.data ? (health.data.ai === 'huggingface' ? 'Hugging Face, local fallback' : 'Local models') : '…'}</dd>
              {health.data && <dd className="mt-0.5 font-mono text-[11px] text-muted">{Object.values(health.data.models).join(' · ')}</dd>}</div></div>
          </dl>
        </Panel>

        <Panel title="What is real and what is simulated" sub="This is a prototype. Everything marked Simulated in the app falls in the right-hand list.">
          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <p className="text-[12px] font-semibold uppercase tracking-[0.05em] text-pos">Real, working functionality</p>
              <ul className="mt-2.5 space-y-2">{REAL.map((x) => <li key={x} className="flex gap-2 text-[13px] leading-snug"><CheckCircle size={15} weight="fill" className="mt-0.5 shrink-0 text-pos" />{x}</li>)}</ul>
            </div>
            <div>
              <p className="text-[12px] font-semibold uppercase tracking-[0.05em] text-muted">Simulated for the demo</p>
              <ul className="mt-2.5 space-y-2">{SIM.map((x) => <li key={x} className="flex gap-2 text-[13px] leading-snug text-ink-2"><Circle size={15} className="mt-0.5 shrink-0 text-faint" />{x}</li>)}</ul>
            </div>
          </div>
        </Panel>

        <Panel title="Demo data" sub="Re-seed the sample data so ticket ages, SLA clocks and complaint spikes are current. Run this shortly before a presentation.">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <p className="max-w-[56ch] text-[13px] text-ink-2">Deletes every ticket, incident, notification and registered account, then rebuilds the sample data dated relative to now.</p>
            {supervisor
              ? <Button variant="secondary" onClick={() => setConfirm(true)}><ArrowCounterClockwise size={15} /> Reset demo data</Button>
              : <span className="text-[12.5px] text-muted">Supervisor only</span>}
          </div>
        </Panel>
      </div>

      <Dialog open={confirm} onClose={() => setConfirm(false)} title="Reset all demo data?"
        sub="This permanently deletes everything in the database, including tickets and accounts created during testing. It cannot be undone."
        footer={<><Button variant="ghost" size="sm" onClick={() => setConfirm(false)}>Cancel</Button><Button size="sm" loading={busy} onClick={reset}>Delete and re-seed</Button></>}>
        <ErrorNote error={err} />
        <p className="text-[13px] text-ink-2">You will stay signed in. Demo accounts are recreated with the same passwords.</p>
      </Dialog>
    </Page>
  );
}
