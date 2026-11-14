// Route lookup for screens: Velora routes are synchronous; imported real roads are loaded from the API once.
import { useEffect, useState } from 'react';
import type { RouteProfile } from '@myfitbike/world';
import { routeById } from '../app/routesData';
import { isReal, loadRealRoute } from './realRoads';

export function useRoute(id: string | null | undefined): { route: RouteProfile | undefined; loading: boolean; error: string | null } {
  const [, bump] = useState(0); const [error, setError] = useState<string | null>(null); const route = id ? routeById(id) : undefined;
  const loading = !!id && !route && isReal(id) && !error;
  useEffect(() => { if (id && !routeById(id) && isReal(id)) loadRealRoute(id).then(() => bump((n) => n + 1)).catch((e: Error) => setError(e.message)); }, [id]);
  return { route, loading, error };
}
