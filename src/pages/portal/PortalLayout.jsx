import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { PlusCircle, ListBullets, BookOpenText, SignOut } from '@phosphor-icons/react';
import { Logo } from '../../components/ui.jsx';
import { Avatar, Toaster } from '../../components/kit.jsx';
import Bell from '../../components/Bell.jsx';
import DemoGuide from '../../components/DemoGuide.jsx';
import { useAuth } from '../../lib/auth.jsx';
import { ThemeToggle } from '../../lib/theme.jsx';

const NAV = [
  { to: '/portal', end: true, icon: PlusCircle, label: 'New request' },
  { to: '/portal/requests', icon: ListBullets, label: 'My requests', also: '/portal/tickets' },
  { to: '/portal/help', icon: BookOpenText, label: 'Help centre' },
];

export default function PortalLayout() {
  const { user, signOut } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const active = (n) => (n.end ? loc.pathname === n.to : loc.pathname.startsWith(n.to) || (n.also && loc.pathname.startsWith(n.also)));

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-line bg-surface/90 backdrop-blur supports-[backdrop-filter]:bg-surface/80">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4 sm:px-6 lg:gap-6">
          <Logo to="/portal" />
          <nav className="hidden items-center gap-1 md:flex" aria-label="Main">
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} end={n.end}
                className={`inline-flex h-8 items-center gap-2 whitespace-nowrap rounded-md px-2.5 lg:px-3 text-[13px] font-medium transition-colors ${active(n) ? 'bg-sunken text-ink ring-1 ring-line' : 'text-ink-2 hover:bg-sunken hover:text-ink'}`}>
                <n.icon size={15} weight={active(n) ? 'fill' : 'regular'} />{n.label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-1.5 sm:gap-3">
            <span className="hidden sm:block"><ThemeToggle /></span>
            <Bell base="/portal" />
            <div className="hidden items-center gap-2 lg:flex"><Avatar name={user.name} size={28} /><span className="text-[13px] font-medium">{user.name.split(' ')[0]}</span></div>
            <button type="button" onClick={async () => { await signOut(); nav('/login'); }} aria-label="Sign out" className="grid size-9 place-items-center rounded-md text-muted hover:bg-sunken hover:text-ink"><SignOut size={17} /></button>
          </div>
        </div>
      </header>

      <Outlet />

      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-3 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden" aria-label="Quick">
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end} className={`flex h-14 flex-col items-center justify-center gap-0.5 text-[10.5px] ${active(n) ? 'font-semibold text-ink' : 'text-muted'}`}>
            <n.icon size={20} weight={active(n) ? 'fill' : 'regular'} />{n.label}
          </NavLink>
        ))}
      </nav>
      <DemoGuide />
      <Toaster />
    </div>
  );
}
