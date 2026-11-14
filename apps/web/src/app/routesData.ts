// Velora route catalogue in the browser: built once from content/world/velora/world.json (cheap at 5 m resolution).
import { buildRoute, difficultyLabel, mapSvg, sampleWorld, steadyMapCache, type RouteProfile, type World } from './routesDeps';
import worldJson from '../../../../content/world/velora/world.json';

export const WORLD = worldJson as unknown as World;
let routes: RouteProfile[] | null = null;
export function allRoutes(): RouteProfile[] { if (!routes) { const s = sampleWorld(WORLD); routes = WORLD.routes.map((r) => buildRoute(WORLD, r.id, s)); } return routes; }
// Imported real roads (Phase 6) register here once loaded, with their one-road world, so every screen and the ride
// controller find them like Velora routes.
const extra = new Map<string, { route: RouteProfile; world: World }>();
export function registerRoute(route: RouteProfile, world: World) { extra.set(route.id, { route, world }); }
export const routeById = (id: string) => allRoutes().find((r) => r.id === id) ?? extra.get(id)?.route;
/** The world a route belongs to (Velora, or an imported route's own world; slices keep their parent's). */
export const worldFor = (routeId?: string): World => (routeId ? extra.get(routeId.split('@')[0]!)?.world : undefined) ?? WORLD;
export const difficultyOf = (r: RouteProfile) => difficultyLabel(r.lengthM, r.ascentM);
export const regionName = (id: string) => (id === 'real' ? 'Real road' : WORLD.regions.find((r) => r.id === id)?.name ?? id);
/** Map as an image URL (whole world, or cropped to a route with start/finish pins). */
export function mapUrl(route?: RouteProfile, pad = 900): string {
  return steadyMapCache(`${route?.id ?? 'world'}:${pad}`, () => {
    let vb: [number, number, number, number] | undefined;
    if (route) { const xs = route.x, zs = route.z; const minX = Math.min(...xs) - pad, maxX = Math.max(...xs) + pad, minZ = Math.min(...zs) - pad, maxZ = Math.max(...zs) + pad; const w = maxX - minX, h = maxZ - minZ, s = Math.max(w, h * 1.6); vb = [minX - (s - w) / 2, minZ - (s / 1.6 - h) / 2, s, s / 1.6]; }
    const svg = mapSvg(worldFor(route?.id), { route, viewBox: vb, markers: route ? [{ x: route.x[0]!, z: route.z[0]!, kind: 'start' }, ...(route.loop ? [] : [{ x: route.x.at(-1)!, z: route.z.at(-1)!, kind: 'finish' as const }])] : [] });
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
}
/** Transparent overlay with just one route line, drawn over the whole-island map on hover (World tab). */
export function routeOverlay(route: RouteProfile): string {
  return steadyMapCache(`overlay:${route.id}`, () => { const [W, H] = WORLD.size; let d = ''; for (let i = 0; i < route.x.length; i += 6) d += `${i ? 'L' : 'M'}${route.x[i]!.toFixed(0)},${route.z[i]!.toFixed(0)}`;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-W / 2} ${-H / 2} ${W} ${H}" preserveAspectRatio="xMidYMid slice"><path d="${d}" fill="none" stroke="#f2c14e" stroke-width="120" stroke-linecap="round" stroke-linejoin="round"/></svg>`)}`; });
}
/** Plain base map for the minimap: no labels or landmark discs (they are sized for the whole island). */
export function baseMapUrl(routeId?: string): { url: string; viewBox: [number, number, number, number] } {
  const w = worldFor(routeId); const [W, H] = w.size;
  return { url: steadyMapCache(`base:${w === WORLD ? 'velora' : routeId!.split('@')[0]}`, () => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(mapSvg(w, { showLabels: false, landmarks: false }))}`), viewBox: [-W / 2, -H / 2, W, H] };
}
/** Estimated riding time at a steady fraction of FTP (route cards: "est. time at your FTP"). */
export { estimateTime } from './routesDeps';
