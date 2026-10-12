import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { ArrowRight, Headset, UserCircle, ShieldStar } from '@phosphor-icons/react';
import { Button, Logo, ErrorNote } from '../components/ui.jsx';
import { useAuth } from '../lib/auth.jsx';
import { api } from '../lib/api.js';
import { ThemeToggle } from '../lib/theme.jsx';

const LINES = [
  ['priority', 'Urgency and impact at intake, waiting time and SLA risk while it waits. Every point has a reason.'],
  ['incidents', 'Clusters similar complaints and flags volume spikes. A person confirms before anything changes.'],
  ['experts', 'Recommends who should take it from skills, availability and workload, and says why.'],
];
const home = (u) => (u.role === 'customer' ? '/portal' : '/agent');

export default function Login() {
  const { user, setUser } = useAuth();
  const nav = useNavigate();
  const [mode, setMode] = useState('signin');
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);

  if (user) return <Navigate to={home(user)} replace />;

  const done = (u) => { setUser(u); nav(home(u), { replace: true }); };

  async function submit(e) {
    e.preventDefault();
    setBusy('form'); setError(null);
    try {
      const path = mode === 'signin' ? '/auth/login' : '/auth/register';
      const body = mode === 'signin' ? { email: form.email, password: form.password } : form;
      done((await api(path, { method: 'POST', body })).user);
    } catch (err) { setError(err); } finally { setBusy(null); }
  }

  async function demo(role) {
    setBusy(role); setError(null);
    try { done((await api('/auth/demo', { method: 'POST', body: { role } })).user); }
    catch (err) { setError(err); } finally { setBusy(null); }
  }

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      {/* Brand panel is dark in both themes on purpose. Theme tokens would
          flip it to a cream slab in dark mode. */}
      <section className="relative hidden flex-col justify-between border-r border-line bg-[#1c1917] p-12 text-[#fafaf9] lg:flex">
        <Logo invert />
        <div className="max-w-md">
          <h1 className="text-[40px] font-semibold leading-[1.08] tracking-tight">
            Every complaint, scored and routed before anyone reads it.
          </h1>
          <dl className="mt-10 space-y-5">
            {LINES.map(([k, v]) => (
              <div key={k} className="grid grid-cols-[88px_1fr] gap-4 border-t border-[#fafaf9]/15 pt-4">
                <dt className="font-mono text-[12px] text-[#fafaf9]/60">{k}</dt>
                <dd className="text-[14px] leading-relaxed text-[#fafaf9]/85">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
        <p className="font-mono text-[11px] text-[#fafaf9]/45">BYTEFORCE &middot; KITCOEK Hackathon &middot; Advanced Track</p>
      </section>

      <section className="relative flex flex-col justify-center px-6 py-12 sm:px-12">
        <ThemeToggle className="absolute right-6 top-6" />
        <div className="mx-auto w-full max-w-sm">
          <div className="mb-10 lg:hidden"><Logo /></div>

          <h2 className="text-xl font-semibold tracking-tight">{mode === 'signin' ? 'Sign in' : 'Create a customer account'}</h2>
          <p className="mt-1 text-sm text-muted">
            {mode === 'signin' ? 'Customers, agents and supervisors use the same sign in.' : 'Raise and track support requests.'}
          </p>

          <form onSubmit={submit} className="mt-7 space-y-4" noValidate>
            {mode === 'register' && (
              <div>
                <label htmlFor="name" className="label">Full name</label>
                <input id="name" className="field" autoComplete="name" value={form.name} onChange={set('name')} required />
              </div>
            )}
            <div>
              <label htmlFor="email" className="label">Email</label>
              <input id="email" type="email" className="field" autoComplete="email" value={form.email} onChange={set('email')} required />
            </div>
            <div>
              <label htmlFor="password" className="label">Password</label>
              <input id="password" type="password" className="field" autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                value={form.password} onChange={set('password')} required />
              {mode === 'register' && <p className="hint">At least 8 characters.</p>}
            </div>
            <ErrorNote error={error} />
            <Button type="submit" className="w-full" loading={busy === 'form'}>
              {mode === 'signin' ? 'Sign in' : 'Create account'}
            </Button>
          </form>

          <p className="mt-4 text-center text-[13px] text-muted">
            {mode === 'signin' ? 'New customer? ' : 'Already have an account? '}
            <button onClick={() => { setMode(mode === 'signin' ? 'register' : 'signin'); setError(null); }}
              className="font-medium text-ink underline underline-offset-4 hover:no-underline">
              {mode === 'signin' ? 'Create an account' : 'Sign in'}
            </button>
          </p>

          <div className="mt-10 border-t border-line pt-6">
            <p className="eyebrow">Explore the prototype</p>
            <div className="mt-3 grid gap-2">
              <DemoButton icon={UserCircle} title="Customer" hint="Raise a complaint, track it, rate the fix" busy={busy === 'customer'} onClick={() => demo('customer')} />
              <DemoButton icon={Headset} title="Support agent" hint="Priority queue, ticket workspace, resolution" busy={busy === 'agent'} onClick={() => demo('agent')} />
              <DemoButton icon={ShieldStar} title="Supervisor" hint="Confirm incidents, override assignment, reset data" busy={busy === 'supervisor'} onClick={() => demo('supervisor')} />
            </div>
            <p className="mt-3 text-[11.5px] leading-relaxed text-muted">Prototype with invented sample data. Anything marked Simulated in the app is not real customer data.</p>
          </div>
        </div>
      </section>
    </div>
  );
}

function DemoButton({ icon: Icon, title, hint, onClick, busy }) {
  return (
    <button onClick={onClick} disabled={busy}
      className="group flex items-center gap-3 rounded-md border border-line bg-surface px-3 py-2.5 text-left transition-colors hover:border-line-strong hover:bg-sunken disabled:opacity-60">
      <Icon size={20} className="text-ink-2" />
      <span className="flex-1">
        <span className="block text-sm font-medium">{title}</span>
        <span className="block text-xs text-muted">{hint}</span>
      </span>
      <ArrowRight size={15} className="text-muted transition-transform group-hover:translate-x-0.5" />
    </button>
  );
}
