import { lazy, Suspense, useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { Shell } from './Shell';
import { Atmosphere } from './Atmosphere';
import { BrowserBlocked } from './BrowserBlocked';
import { checkBrowser } from './browserSupport';
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
const Activities = lazy(() => import('../screens/Activities'));
const WorldEditor = import.meta.env.DEV ? lazy(() => import('../screens/WorldEditor')) : null; // dev-only tool, never in production builds
import { useSimulatorKeys } from './useSimulatorKeys';
import { Toasts } from './Toasts';
import { devices } from '../devices/DeviceManager';

// First launch creates a default profile and goes straight to Home (PLAN 16.21: ride first, profile later).
// Only a real "no profile" answer does that; an unreachable API shows a retrying screen and never touches the profile.
let profileBoot: Promise<Profile> | null = null; // shared, so React dev double-effects cannot create two profiles
const bootProfile = () => (profileBoot ??= api.getProfile().then((p) => p ?? api.saveProfile(defaultProfileInput(navigator.language))).finally(() => { profileBoot = null; }));

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
    <Icon name="sync" size={32} className="mx-auto text-accent animate-spin" /><h1 className="text-headline-md text-text">Reconnecting to the local API…</h1>
    <p className="text-body-md text-text-secondary">Retrying every 2 seconds. If it doesn't come back, start it with <code>pnpm dev</code>. Your profile and rides are safe.</p></div></div>;
}

export function App() {
  const [support] = useState(() => checkBrowser(navigator as Navigator & { bluetooth?: unknown }, window.isSecureContext));
  if (!support.ok) return <><Atmosphere /><BrowserBlocked reason={support.reason} /></>;
  return (
    <BrowserRouter>
      <Atmosphere />
      <Toasts />
      <Boot>
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
      </Boot>
    </BrowserRouter>
  );
}
