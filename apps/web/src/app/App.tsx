import { lazy, Suspense, useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation, useSearchParams } from 'react-router';
import { Shell } from './Shell';
import { Atmosphere } from './Atmosphere';
import { useApp } from './store';
import { defaultProfileInput, type Profile } from '@myfitbike/shared';
import { Icon } from '../design/primitives';
import { api } from './api';
import { Home } from '../screens/Home';
import { Sensors } from '../screens/Sensors';
import { Welcome } from '../screens/Welcome';
import { Settings } from '../screens/Settings';
import { Placeholder } from '../screens/Placeholder';
import { Workouts } from '../screens/Workouts';
import { WorkoutDetail } from '../screens/WorkoutDetail';
import { Ride } from '../screens/Ride';
import { Summary } from '../screens/Summary';
import { RecoveryDialog } from './RecoveryDialog';
import { Routes as RoutesScreen } from '../screens/Routes';
import { RouteDetail } from '../screens/RouteDetail';
import { TrainingRoom } from '../screens/TrainingRoom';
import { WorkoutBuilder } from '../screens/WorkoutBuilder';
import { Landing } from '../screens/Landing';
import { Login } from '../screens/Login';
import { Privacy } from '../screens/Privacy';
import { Attributions } from '../screens/Attributions';
import { ResetPassword } from '../screens/ResetPassword';
import { authEnabled, providerName, useAuth } from './auth';
const Activities = lazy(() => import('../screens/Activities'));
const WorldEditor = import.meta.env.DEV ? lazy(() => import('../screens/WorldEditor')) : null; // dev-only tool, never in production builds
import { useSimulatorKeys } from './useSimulatorKeys';
import { Toasts } from './Toasts';
import { safeNext } from './safeNext';
import { TvMiniPlayer } from '../tv/MiniPlayer';
import { devices } from '../devices/DeviceManager';

// First launch creates a default profile and goes straight to Home (PLAN 16.21: ride first, profile later).
// Only a real "no profile" answer does that; an unreachable API shows a retrying screen and never touches the profile.
let profileBoot: Promise<Profile> | null = null; // shared, so React dev double-effects cannot create two profiles
// Signed in with Google: the new profile starts with the Google account's name, and a still-unconfirmed placeholder
// profile ("Rider", not yet set up) takes it too. A name the rider chose is never overwritten.
const bootProfile = () => (profileBoot ??= api.getProfile().then((p) => {
  const name = providerName();
  if (!p) return api.saveProfile({ ...defaultProfileInput(navigator.language), ...(name ? { name } : {}) });
  if (name && !p.setupComplete && p.name === 'Rider') { const { id: _id, ...input } = p; return api.saveProfile({ ...input, name }); }
  return p;
}).finally(() => { profileBoot = null; }));

function Boot({ children }: { children: React.ReactNode }) {
  const { profileLoaded, setProfile, setApiOnline } = useApp(); const [apiDown, setApiDown] = useState(false);
  useSimulatorKeys();
  useEffect(() => { void devices.autoReconnect(); }, []);
  useEffect(() => {
    let alive = true, timer = 0;
    const load = () => bootProfile().then((p) => { if (!alive) return; setApiOnline(true); setApiDown(false); setProfile(p); })
      .catch(() => { if (!alive) return; setApiOnline(false); setApiDown(true); timer = window.setTimeout(load, 2000); });
    load(); return () => { alive = false; clearTimeout(timer); };
  }, [setProfile, setApiOnline]);
  if (!profileLoaded) return apiDown ? <Reconnecting /> : null;
  return <>{children}<RecoveryDialog /></>;
}
function Reconnecting() {
  return <div className="min-h-screen flex items-center justify-center p-8"><div role="status" className="rounded-2xl bg-surface-container/90 p-8 max-w-md text-center space-y-2 shadow-modal">
    <Icon name="sync" size={32} className="mx-auto text-accent animate-spin" /><h1 className="text-headline-md text-text">{authEnabled ? 'Reconnecting to MyFitBike…' : 'Reconnecting to the local API…'}</h1>
    <p className="text-body-md text-text-secondary">Retrying every 2 seconds.{authEnabled ? '' : <> If it doesn't come back, start it with <code>pnpm dev</code>.</>} Your profile and rides are safe.</p></div></div>;
}

/** Signed-out visitors (when accounts are on): the landing page at "/", the login page for anything else (PLAN 17.4). */
function SignedIn({ children }: { children: React.ReactNode }) {
  const { ready, session, recovering } = useAuth(); const loc = useLocation();
  if (!authEnabled) return <>{children}</>; if (!ready) return null;
  if (recovering) return <Navigate to="/reset-password" replace />;
  if (!session) return loc.pathname === '/' ? <Landing /> : <Navigate to={`/login?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />;
  return <>{children}</>;
}
function SignedOut({ children }: { children: React.ReactNode }) {
  const { ready, session, recovering } = useAuth(); const [qs] = useSearchParams();
  if (!authEnabled || !ready) return <>{children}</>; if (session && !recovering) return <Navigate to={safeNext(qs.get('next'))} replace />;
  return <>{children}</>;
}

export function App() {
  return (
    <BrowserRouter>
      <Atmosphere />
      <Toasts />
      <Routes>
        {/* public pages (PLAN 17.4): no profile, no login needed */}
        <Route path="/landing" element={<Landing />} />
        <Route path="/login" element={<SignedOut><Login /></SignedOut>} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/attributions" element={<Attributions />} />
        <Route path="*" element={<SignedIn><Boot>
        <Routes>
          <Route path="/welcome" element={<Welcome />} />
          <Route path="/ride" element={<Ride />} />
          {WorldEditor && <Route path="/dev/world" element={<Suspense fallback={null}><WorldEditor /></Suspense>} />}
          <Route element={<Shell />}>
            <Route index element={<Home />} />
            <Route path="sensors" element={<Sensors />} />
            <Route path="settings/*" element={<Settings />} />
            <Route path="routes" element={<RoutesScreen />} />
            <Route path="routes/:id" element={<RouteDetail />} />
            <Route path="workouts" element={<Workouts />} />
            <Route path="workouts/builder" element={<WorkoutBuilder />} />
            <Route path="workouts/:id" element={<WorkoutDetail />} />
            <Route path="summary/:id" element={<Summary />} />
            <Route path="training" element={<TrainingRoom />} />
            <Route path="activity" element={<Suspense fallback={null}><Activities /></Suspense>} />
            <Route path="search" element={<Placeholder title="Search" phase={5} />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
        <TvMiniPlayer />
      </Boot></SignedIn>} />
      </Routes>
    </BrowserRouter>
  );
}
