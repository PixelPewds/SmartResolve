import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  SquaresFour, Tray, UserCircle, Siren, UsersThree, ArrowFatLinesUp, Timer, ChartLineUp,
  Flask, Bell as BellIcon, GraduationCap, GearSix, SignOut, List, X, MagnifyingGlass, DotsThreeOutline,
} from '@phosphor-icons/react';
import { Logo } from './ui.jsx';
import { Avatar, Toaster } from './kit.jsx';
import Bell from './Bell.jsx';
import DemoGuide from './DemoGuide.jsx';
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
  const [q, setQ] = useState('');

  const refreshCounts = () => api('/tickets?status=active').then((d) => setCounts(d.counts)).catch(() => {});
  useEffect(() => { refreshCounts(); setOpen(false); }, [loc.pathname]);
  useEffect(() => { api('/health').then(setHealth).catch(() => {}); }, []);

  const supervisor = user.role === 'supervisor';
  const groups = [
    { label: null, items: [{ to: '/agent', end: true, icon: SquaresFour, label: 'Dashboard' }] },
    { label: 'Work', items: [
      { to: '/agent/tickets', icon: Tray, label: 'All tickets', count: counts?.active },
      { to: '/agent/tickets?assignee=me', icon: UserCircle, label: 'My tickets', count: counts?.mine, match: 'assignee=me' },
      { to: '/agent/escalations', icon: ArrowFatLinesUp, label: 'Escalations', count: counts?.escalated, alert: true },
      { to: '/agent/sla', icon: Timer, label: 'SLA management', count: counts?.breached, alert: true },
    ] },
    { label: 'Intelligence', items: [
      { to: '/agent/incidents', icon: Siren, label: 'Incident watch', count: counts?.candidates, alert: true },
      { to: '/agent/assignment', icon: UsersThree, label: 'Expert assignment', count: counts?.unassigned },
      { to: '/agent/lab', icon: Flask, label: 'AI triage lab' },
    ] },
    { label: 'Insights', items: [
      { to: '/agent/analytics', icon: ChartLineUp, label: 'Analytics' },
      { to: '/agent/learning', icon: GraduationCap, label: 'Feedback & learning' },
    ] },
    { label: 'System', items: [
      { to: '/agent/notifications', icon: BellIcon, label: 'Notifications' },
      { to: '/agent/settings', icon: GearSix, label: 'Settings' },
    ] },
  ];

  const isActive = (item) => {
    if (item.match) return loc.pathname === '/agent/tickets' && loc.search.includes(item.match);
    if (item.to === '/agent/tickets') return loc.pathname.startsWith('/agent/tickets') && !loc.search.includes('assignee=me');
    return item.end ? loc.pathname === item.to : loc.pathname.startsWith(item.to);
  };

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex h-14 shrink-0 items-center px-4"><Logo to="/agent" /></div>
      <nav className="flex-1 overflow-y-auto px-2 pb-4" aria-label="Main">
        {groups.map((g) => (
          <div key={g.label || 'top'} className="mt-3 first:mt-1">
            {g.label && <p className="eyebrow px-2.5 pb-1.5">{g.label}</p>}
            {g.items.map((item) => {
              const active = isActive(item);
              const Icon = item.icon;
              return (
                <NavLink key={item.to} to={item.to} end={item.end}
                  className={`flex h-8 items-center gap-2.5 rounded-md px-2.5 text-[13px] transition-colors ${active ? 'bg-sunken font-medium text-ink ring-1 ring-line' : 'text-ink-2 hover:bg-sunken hover:text-ink'}`}>
                  <Icon size={16} weight={active ? 'fill' : 'regular'} className="shrink-0" />
                  <span className="flex-1 truncate">{item.label}</span>
                  {item.count != null && item.count > 0 && (
                    <span className={`num font-mono text-[11px] ${item.alert ? 'text-p1' : 'text-muted'}`}>{item.count}</span>
                  )}
                </NavLink>
              );
            })}
          </div>
        ))}
      </nav>
      <div className="shrink-0 border-t border-line p-3">
        <div className="mb-3 flex items-center justify-between gap-2 px-1">
          <p className="font-mono text-[10.5px] leading-relaxed text-muted">
            {health ? <>db {health.db}<br />ai {health.ai === 'huggingface' ? 'hugging face' : 'local models'}</> : ' '}
          </p>
          <ThemeToggle />
        </div>
        <div className="flex items-center gap-2.5 px-1">
          <Avatar name={user.name} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-medium">{user.name}</p>
            <p className="truncate text-[11px] text-muted">{supervisor ? 'Supervisor' : user.title || 'Support agent'}</p>
          </div>
          <button type="button" onClick={async () => { await signOut(); nav('/login'); }} aria-label="Sign out"
            className="grid size-7 place-items-center rounded-md text-muted hover:bg-sunken hover:text-ink"><SignOut size={16} /></button>
        </div>
      </div>
    </div>
  );

  const mobileTabs = [
    { to: '/agent', end: true, icon: SquaresFour, label: 'Home' },
    { to: '/agent/tickets', icon: Tray, label: 'Tickets' },
    { to: '/agent/incidents', icon: Siren, label: 'Incidents', count: counts?.candidates },
    { to: '/agent/assignment', icon: UsersThree, label: 'Assign' },
  ];

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[244px_minmax(0,1fr)]">
      <aside className="sticky top-0 hidden h-dvh border-r border-line bg-surface lg:block">{sidebar}</aside>

      <div className="min-w-0">
        {/* Top bar */}
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-surface/90 px-4 backdrop-blur supports-[backdrop-filter]:bg-surface/80 sm:px-6 lg:px-8">
          <div className="lg:hidden"><Logo to="/agent" /></div>
          <form onSubmit={(e) => { e.preventDefault(); nav(`/agent/tickets?status=all&q=${encodeURIComponent(q)}`); }} className="relative ml-auto hidden max-w-md flex-1 sm:block lg:ml-0">
            <MagnifyingGlass size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search tickets, customers, IDs" aria-label="Search tickets"
              className="h-9 w-full rounded-md border border-line bg-sunken pl-9 pr-3 text-[13px] placeholder:text-muted focus:border-ink focus:bg-surface focus:outline-none" />
          </form>
          <div className="ml-auto flex items-center gap-1 sm:gap-2">
            {supervisor && <span className="hidden rounded-full border border-line px-2 py-0.5 text-[11px] font-medium text-ink-2 md:inline">Supervisor view</span>}
            <Bell base="/agent" />
            <button type="button" onClick={() => setOpen(true)} aria-label="Open menu" className="grid size-9 place-items-center rounded-md hover:bg-sunken lg:hidden"><List size={20} /></button>
          </div>
        </header>

        <main className="min-w-0">
          <Outlet context={{ refreshCounts, counts }} />
        </main>
      </div>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-[82%] max-w-[300px] border-r border-line bg-surface shadow-2xl">
            <button type="button" onClick={() => setOpen(false)} aria-label="Close menu" className="absolute right-3 top-3 grid size-8 place-items-center rounded-md hover:bg-sunken"><X size={18} /></button>
            {sidebar}
          </aside>
        </div>
      )}

      {/* Mobile bottom tabs */}
      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden" aria-label="Quick">
        {mobileTabs.map((t) => {
          const active = t.end ? loc.pathname === t.to : loc.pathname.startsWith(t.to);
          return (
            <NavLink key={t.to} to={t.to} end={t.end} className={`relative flex h-14 flex-col items-center justify-center gap-0.5 text-[10.5px] ${active ? 'font-semibold text-ink' : 'text-muted'}`}>
              <t.icon size={20} weight={active ? 'fill' : 'regular'} />
              {t.label}
              {t.count > 0 && <span className="num absolute right-[22%] top-2 grid h-4 min-w-4 place-items-center rounded-full bg-p1 px-1 font-mono text-[9px] text-white">{t.count}</span>}
            </NavLink>
          );
        })}
        <button type="button" onClick={() => setOpen(true)} className="flex h-14 flex-col items-center justify-center gap-0.5 text-[10.5px] text-muted">
          <DotsThreeOutline size={20} /> More
        </button>
      </nav>

      <DemoGuide />
      <Toaster />
    </div>
  );
}
