import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Tray, WarningCircle, ChartLineUp, Flask, SignOut, List, X } from '@phosphor-icons/react';
import { Logo } from './ui.jsx';
import { useAuth } from '../lib/auth.jsx';
import { api } from '../lib/api.js';
import { ThemeToggle } from '../lib/theme.jsx';

export default function AgentShell() {
  const { user, signOut } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [counts, setCounts] = useState(null);
  const [health, setHealth] = useState(null);
  const [open, setOpen] = useState(false);

  // Counts refresh on every navigation so the sidebar reflects status changes.
  useEffect(() => {
    api('/tickets?status=active').then((d) => setCounts(d.counts)).catch(() => {});
    setOpen(false);
  }, [loc.pathname]);
  useEffect(() => { api('/health').then(setHealth).catch(() => {}); }, []);

  const items = [
    { to: '/agent', end: true, icon: Tray, label: 'Queue', count: counts?.active },
    { to: '/agent/escalations', icon: WarningCircle, label: 'Escalations', count: counts?.flagged, alert: true },
    { to: '/agent/analytics', icon: ChartLineUp, label: 'Analytics' },
    { to: '/agent/lab', icon: Flask, label: 'Triage lab' },
  ];
  const teams = counts ? Object.entries(counts.byTeam).sort((a, b) => b[1] - a[1]) : [];

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex h-14 items-center px-4"><Logo to="/agent" /></div>

      <nav className="px-2 pt-2" aria-label="Main">
        {items.map(({ to, end, icon: Icon, label, count, alert }) => (
          <NavLink key={to} to={to} end={end}
            className={({ isActive }) => `group flex h-8 items-center gap-2.5 rounded-md px-2.5 text-[13px] transition-colors ${
              isActive ? 'bg-sunken font-medium text-ink' : 'text-ink-2 hover:bg-sunken hover:text-ink'}`}>
            <Icon size={16} weight="regular" className="shrink-0" />
            <span className="flex-1">{label}</span>
            {count != null && (
              <span className={`num font-mono text-[11px] ${alert && count > 0 ? 'text-p1' : 'text-muted'}`}>{count}</span>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="mt-6 px-4">
        <p className="eyebrow">Teams, open</p>
      </div>
      <nav className="mt-1.5 px-2" aria-label="Teams">
        {teams.map(([team, n]) => (
          <button key={team} onClick={() => nav(`/agent?team=${encodeURIComponent(team)}`)}
            className="flex h-7 w-full items-center justify-between rounded-md px-2.5 text-left text-[13px] text-ink-2 hover:bg-sunken hover:text-ink">
            <span className="truncate">{team}</span>
            <span className="num font-mono text-[11px] text-muted">{n}</span>
          </button>
        ))}
        {!counts && <div className="space-y-2 px-2.5 pt-1">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-3" />)}</div>}
      </nav>

      <div className="mt-auto border-t border-line p-3">
        <div className="mb-3 flex items-end justify-between gap-2 px-1">
          <p className="font-mono text-[10.5px] leading-relaxed text-muted">
            {health ? <>db {health.db}<br />ai {health.ai === 'huggingface' ? 'hugging face' : 'local models'}</> : ' '}
          </p>
          <ThemeToggle />
        </div>
        <div className="flex items-center gap-2.5 px-1">
          <span className="grid size-7 place-items-center rounded-full bg-sunken text-[11px] font-semibold text-ink-2">
            {user.name.split(' ').map((p) => p[0]).join('').slice(0, 2)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-medium">{user.name}</p>
            <p className="text-[11px] text-muted">Support agent</p>
          </div>
          <button onClick={async () => { await signOut(); nav('/login'); }} aria-label="Sign out"
            className="grid size-7 place-items-center rounded-md text-muted hover:bg-sunken hover:text-ink">
            <SignOut size={16} />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[232px_1fr]">
      <aside className="sticky top-0 hidden h-dvh border-r border-line bg-surface lg:block">{sidebar}</aside>

      <div className="flex h-14 items-center justify-between border-b border-line bg-surface px-4 lg:hidden">
        <Logo to="/agent" />
        <button onClick={() => setOpen(true)} aria-label="Open menu" className="grid size-9 place-items-center rounded-md hover:bg-sunken"><List size={20} /></button>
      </div>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/30" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 border-r border-line bg-surface">
            <button onClick={() => setOpen(false)} aria-label="Close menu" className="absolute right-3 top-3 grid size-8 place-items-center rounded-md hover:bg-sunken"><X size={18} /></button>
            {sidebar}
          </aside>
        </div>
      )}

      <main className="min-w-0"><Outlet context={{ refreshCounts: () => api('/tickets?status=active').then((d) => setCounts(d.counts)) }} /></main>
    </div>
  );
}
