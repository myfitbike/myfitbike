// Velora route catalogue in the browser: built once from content/world/velora/world.json (cheap at 5 m resolution).
import { buildRoute, difficultyLabel, mapSvg, sampleWorld, steadyMapCache, type RouteProfile, type World } from './routesDeps';
import worldJson from '../../../../content/world/velora/world.json';

export const WORLD = worldJson as unknown as World;
let routes: RouteProfile[] | null = null;
export function allRoutes(): RouteProfile[] { if (!routes) { const s = sampleWorld(WORLD); routes = WORLD.routes.map((r) => buildRoute(WORLD, r.id, s)); } return routes; }
export const routeById = (id: string) => allRoutes().find((r) => r.id === id);
export const difficultyOf = (r: RouteProfile) => difficultyLabel(r.lengthM, r.ascentM);
export const regionName = (id: string) => WORLD.regions.find((r) => r.id === id)?.name ?? id;
/** Map as an image URL (whole world, or cropped to a route with start/finish pins). */
export function mapUrl(route?: RouteProfile, pad = 900): string {
  return steadyMapCache(`${route?.id ?? 'world'}:${pad}`, () => {
    let vb: [number, number, number, number] | undefined;
    if (route) { const xs = route.x, zs = route.z; const minX = Math.min(...xs) - pad, maxX = Math.max(...xs) + pad, minZ = Math.min(...zs) - pad, maxZ = Math.max(...zs) + pad; const w = maxX - minX, h = maxZ - minZ, s = Math.max(w, h * 1.6); vb = [minX - (s - w) / 2, minZ - (s / 1.6 - h) / 2, s, s / 1.6]; }
    const svg = mapSvg(WORLD, { route, viewBox: vb, markers: route ? [{ x: route.x[0]!, z: route.z[0]!, kind: 'start' }, ...(route.loop ? [] : [{ x: route.x.at(-1)!, z: route.z.at(-1)!, kind: 'finish' as const }])] : [] });
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
}
/** Plain base map for the minimap: no labels or landmark discs (they are sized for the whole island). */
export function baseMapUrl(): string { return steadyMapCache('base', () => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(mapSvg(WORLD, { showLabels: false, landmarks: false }))}`); }
/** Estimated riding time at a steady fraction of FTP (route cards: "est. time at your FTP"). */
export { estimateTime } from './routesDeps';
