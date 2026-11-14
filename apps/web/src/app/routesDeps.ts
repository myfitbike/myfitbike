import { steadySpeed } from '@veloworld/shared';
import type { RouteProfile } from '@veloworld/world';
export { buildRoute, difficultyLabel, mapSvg, sampleWorld, type RouteProfile, type World } from '@veloworld/world';
const cache = new Map<string, string>();
export function steadyMapCache(key: string, make: () => string) { let v = cache.get(key); if (!v) { v = make(); cache.set(key, v); } return v; }
/** Sum of 100 m pieces ridden at 75 % FTP on their real gradient. */
export function estimateTime(r: RouteProfile, ftp: number, massKg: number): number {
  let t = 0; const p = ftp * 0.75; const per = Math.round(100 / r.step);
  for (let i = 0; i + per < r.y.length; i += per) { const g = ((r.y[i + per]! - r.y[i]!) / 100) * 100; t += 100 / Math.max(1.5, steadySpeed(p, g, { massKg })); }
  return t;
}
