// Real-road mode, main thread: import a GPS file (parse → worker prepare → save → worker bake), load a stored
// route into the route registry, and read its bake back from OPFS for the renderer.
import { buildRoute, checkTrack, parseTrack, sampleWorld, type RealWorld, type RouteProfile } from '@myfitbike/world';
import { decodeFit } from '@myfitbike/shared';
import { registerRoute } from '../app/routesData';
import type { WorkerIn, WorkerOut } from './realRoadWorker';

export type RealRouteRow = { id: string; name: string; fileName: string; lengthM: number; ascentM: number; createdAt: string };
export const isReal = (id: string | undefined) => !!id && /^real-\d+/.test(id);
const baseId = (id: string) => id.split('@')[0]!;
const worlds = new Map<string, RealWorld>();
export const realWorldFor = (routeId: string) => worlds.get(baseId(routeId));

async function json<T>(r: Response): Promise<T> { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error((j as { error?: string }).error ?? `API ${r.status}`); return j as T; }
export const listRealRoutes = () => fetch('/api/real-routes').then((r) => json<RealRouteRow[]>(r));
export const deleteRealRoute = async (id: string) => { await fetch(`/api/real-routes/${id}`, { method: 'DELETE' }); const root = await navigator.storage.getDirectory(); await root.removeEntry(id, { recursive: true }).catch(() => {}); };

function run(msg: WorkerIn, onProgress: (stage: string, frac: number) => void): Promise<WorkerOut> {
  return new Promise((resolve, reject) => {
    const w = new Worker(new URL('./realRoadWorker.ts', import.meta.url), { type: 'module' });
    w.onmessage = (e: MessageEvent<WorkerOut>) => { const m = e.data; if (m.kind === 'progress') return onProgress(m.stage, m.frac); w.terminate(); if (m.kind === 'error') reject(new Error(m.message)); else resolve(m); };
    w.onerror = (e) => { w.terminate(); reject(new Error(e.message || 'worker failed')); }; w.postMessage(msg);
  });
}

/** Full import. Returns the new route id and any warnings to show the rider. */
export async function importRealRoute(file: File, onProgress: (stage: string, frac: number) => void): Promise<{ id: string; warnings: string[] }> {
  onProgress('Reading file', 0);
  const isFit = /\.fit$/i.test(file.name); const track = parseTrack(isFit ? new Uint8Array(await file.arrayBuffer()) : await file.text(), file.name, decodeFit);
  const chk = checkTrack(track); if (chk.errors.length) throw new Error(chk.errors.join('; '));
  track.points = track.points.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon) && Math.abs(p.lat) <= 85);
  const { id } = await json<{ id: string }>(await fetch('/api/real-routes', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: track.name, fileName: file.name }) }));
  try {
    const prep = (await run({ kind: 'prepare', id, track, fileName: file.name }, onProgress)) as Extract<WorkerOut, { kind: 'prepared' }>;
    await json(await fetch(`/api/real-routes/${id}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(prep.world) }));
    worlds.set(id, prep.world); await bakeRealRoute(id, onProgress);
    return { id, warnings: [...chk.warnings, ...prep.warnings] };
  } catch (e) { await deleteRealRoute(id); throw e; } // never leave a half-imported route behind
}

/** Bake (or re-bake on another device / after storage was cleared) into OPFS. */
export async function bakeRealRoute(id: string, onProgress: (stage: string, frac: number) => void) {
  const world = worlds.get(id) ?? (await loadRealRoute(id), worlds.get(id)!); await run({ kind: 'bake', id, world }, onProgress);
}
export async function hasBake(id: string): Promise<boolean> { try { const d = await (await navigator.storage.getDirectory()).getDirectoryHandle(baseId(id)); await d.getFileHandle('manifest.json'); return true; } catch { return false; } }

/** Fetch the stored world, build its profile and make it findable by routeById (rides, controller, HUD). */
export async function loadRealRoute(id: string): Promise<RouteProfile> {
  const w = await json<RealWorld>(await fetch(`/api/real-routes/${baseId(id)}`)); worlds.set(baseId(id), w);
  const p = buildRoute(w, baseId(id), sampleWorld(w)); registerRoute(p, w); return p;
}

/** Renderer file reader for a baked route (same file layout as the Velora bake). */
export function opfsFetcher(id: string) {
  return async (path: string): Promise<Response> => {
    let d = await (await navigator.storage.getDirectory()).getDirectoryHandle(baseId(id)); const parts = path.split('/'); const name = parts.pop()!;
    for (const p of parts) d = await d.getDirectoryHandle(p); return new Response(await (await d.getFileHandle(name)).getFile());
  };
}
