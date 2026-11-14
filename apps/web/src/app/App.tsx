import { lazy, Suspense, useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router';
import { Shell } from './Shell';
import { Atmosphere } from './Atmosphere';
import { BrowserBlocked } from './BrowserBlocked';
import { checkBrowser } from './browserSupport';
import { useApp } from './store';
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

function Boot({ children }: { children: React.ReactNode }) {
  const { profile, profileLoaded, setProfile, setApiOnline } = useApp();
  const loc = useLocation();
  useSimulatorKeys();
  useEffect(() => { void devices.autoReconnect(); }, []);
  useEffect(() => { api.getProfile().then((p) => { setApiOnline(true); setProfile(p); }).catch(() => { setApiOnline(false); setProfile(null); }); }, [setProfile, setApiOnline]);
  if (!profileLoaded) return null;
  if ((!profile || !profile.setupComplete) && loc.pathname !== '/welcome') return <Navigate to="/welcome" replace />;
  return <>{children}<RecoveryDialog /></>;
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
