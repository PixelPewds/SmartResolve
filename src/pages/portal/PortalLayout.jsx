import { Outlet, useNavigate } from 'react-router-dom';
import { Logo } from '../../components/ui.jsx';
import { useAuth } from '../../lib/auth.jsx';
import { ThemeToggle } from '../../lib/theme.jsx';

export default function PortalLayout() {
  const { user, signOut } = useAuth();
  const nav = useNavigate();
  return (
    <div className="min-h-dvh">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-5">
          <Logo to="/portal" />
          <div className="flex items-center gap-4">
            <ThemeToggle />
            <span className="hidden text-[13px] text-muted sm:block">{user.name}</span>
            <button onClick={async () => { await signOut(); nav('/login'); }} className="text-[13px] font-medium text-ink-2 hover:text-ink">Sign out</button>
          </div>
        </div>
      </header>
      <Outlet />
    </div>
  );
}
