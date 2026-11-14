import { useEffect, useState } from 'react';
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

function Boot({ children }: { children: React.ReactNode }) {
  const { profile, profileLoaded, setProfile, setApiOnline } = useApp();
  const loc = useLocation();
  useEffect(() => { api.getProfile().then((p) => { setApiOnline(true); setProfile(p); }).catch(() => { setApiOnline(false); setProfile(null); }); }, [setProfile, setApiOnline]);
  if (!profileLoaded) return null;
  if ((!profile || !profile.setupComplete) && loc.pathname !== '/welcome') return <Navigate to="/welcome" replace />;
  return <>{children}</>;
}

export function App() {
  const [support] = useState(() => checkBrowser(navigator as Navigator & { bluetooth?: unknown }, window.isSecureContext));
  if (!support.ok) return <><Atmosphere /><BrowserBlocked reason={support.reason} /></>;
  return (
    <BrowserRouter>
      <Atmosphere />
      <Boot>
        <Routes>
          <Route path="/welcome" element={<Welcome />} />
          <Route element={<Shell />}>
            <Route index element={<Home />} />
            <Route path="sensors" element={<Sensors />} />
            <Route path="settings/*" element={<Settings />} />
            <Route path="routes" element={<Placeholder title="Routes" phase={3} />} />
            <Route path="workouts" element={<Placeholder title="Workouts" phase={2} />} />
            <Route path="training" element={<Placeholder title="Training Room" phase={5} />} />
            <Route path="activity" element={<Placeholder title="Activity" phase={2} />} />
            <Route path="search" element={<Placeholder title="Search" phase={5} />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </Boot>
    </BrowserRouter>
  );
}
