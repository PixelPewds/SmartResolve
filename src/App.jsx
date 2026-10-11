import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './lib/auth.jsx';
import Login from './pages/Login.jsx';
import PortalLayout from './pages/portal/PortalLayout.jsx';
import PortalHome from './pages/portal/PortalHome.jsx';
import PortalTicket from './pages/portal/PortalTicket.jsx';

// Agent screens are split out so customers never download Recharts.
const AgentShell = lazy(() => import('./components/AgentShell.jsx'));
const Queue = lazy(() => import('./pages/agent/Queue.jsx'));
const TicketDetail = lazy(() => import('./pages/agent/TicketDetail.jsx'));
const Analytics = lazy(() => import('./pages/agent/Analytics.jsx'));
const Lab = lazy(() => import('./pages/agent/Lab.jsx'));

function Gate({ role, children }) {
  const { user } = useAuth();
  const loc = useLocation();
  if (user === undefined) return <div className="min-h-dvh" />;
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  if (role && user.role !== role) return <Navigate to={user.role === 'agent' ? '/agent' : '/portal'} replace />;
  return children;
}

function Home() {
  const { user } = useAuth();
  if (user === undefined) return <div className="min-h-dvh" />;
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={user.role === 'agent' ? '/agent' : '/portal'} replace />;
}

export default function App() {
  return (
    <AuthProvider>
      <Suspense fallback={<div className="min-h-dvh" />}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />

        <Route path="/portal" element={<Gate role="customer"><PortalLayout /></Gate>}>
          <Route index element={<PortalHome />} />
          <Route path="tickets/:id" element={<PortalTicket />} />
        </Route>

        <Route path="/agent" element={<Gate role="agent"><AgentShell /></Gate>}>
          <Route index element={<Queue />} />
          <Route path="escalations" element={<Queue flaggedOnly />} />
          <Route path="tickets/:id" element={<TicketDetail />} />
          <Route path="analytics" element={<Analytics />} />
          <Route path="lab" element={<Lab />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </Suspense>
    </AuthProvider>
  );
}
