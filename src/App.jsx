import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './lib/auth.jsx';
import Login from './pages/Login.jsx';
import PortalLayout from './pages/portal/PortalLayout.jsx';
import PortalHome from './pages/portal/PortalHome.jsx';
import PortalRequests from './pages/portal/PortalRequests.jsx';
import PortalTicket from './pages/portal/PortalTicket.jsx';
import PortalHelp from './pages/portal/PortalHelp.jsx';
import Notifications from './pages/Notifications.jsx';

// Staff screens are split out so customers never download Recharts.
const AgentShell = lazy(() => import('./components/AgentShell.jsx'));
const Dashboard = lazy(() => import('./pages/agent/Dashboard.jsx'));
const Queue = lazy(() => import('./pages/agent/Queue.jsx'));
const TicketDetail = lazy(() => import('./pages/agent/TicketDetail.jsx'));
const Incidents = lazy(() => import('./pages/agent/Incidents.jsx'));
const Assignment = lazy(() => import('./pages/agent/Assignment.jsx'));
const Sla = lazy(() => import('./pages/agent/Sla.jsx'));
const Escalations = lazy(() => import('./pages/agent/Escalations.jsx'));
const Analytics = lazy(() => import('./pages/agent/Analytics.jsx'));
const Learning = lazy(() => import('./pages/agent/Learning.jsx'));
const Lab = lazy(() => import('./pages/agent/Lab.jsx'));
const Settings = lazy(() => import('./pages/agent/Settings.jsx'));

const isStaff = (u) => u?.role === 'agent' || u?.role === 'supervisor';
const homeFor = (u) => (isStaff(u) ? '/agent' : '/portal');

function Gate({ staff, children }) {
  const { user } = useAuth();
  const loc = useLocation();
  if (user === undefined) return <div className="min-h-dvh" />;
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname + loc.search }} />;
  if (staff !== isStaff(user)) return <Navigate to={homeFor(user)} replace />;
  return children;
}

function Home() {
  const { user } = useAuth();
  if (user === undefined) return <div className="min-h-dvh" />;
  return <Navigate to={user ? homeFor(user) : '/login'} replace />;
}

export default function App() {
  return (
    <AuthProvider>
      <Suspense fallback={<div className="min-h-dvh" />}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />

          <Route path="/portal" element={<Gate staff={false}><PortalLayout /></Gate>}>
            <Route index element={<PortalHome />} />
            <Route path="requests" element={<PortalRequests />} />
            <Route path="tickets/:id" element={<PortalTicket />} />
            <Route path="help" element={<PortalHelp />} />
            <Route path="notifications" element={<Notifications base="/portal" />} />
          </Route>

          <Route path="/agent" element={<Gate staff><AgentShell /></Gate>}>
            <Route index element={<Dashboard />} />
            <Route path="tickets" element={<Queue />} />
            <Route path="tickets/:id" element={<TicketDetail />} />
            <Route path="incidents" element={<Incidents />} />
            <Route path="assignment" element={<Assignment />} />
            <Route path="sla" element={<Sla />} />
            <Route path="escalations" element={<Escalations />} />
            <Route path="analytics" element={<Analytics />} />
            <Route path="learning" element={<Learning />} />
            <Route path="lab" element={<Lab />} />
            <Route path="notifications" element={<Notifications base="/agent" />} />
            <Route path="settings" element={<Settings />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </AuthProvider>
  );
}
