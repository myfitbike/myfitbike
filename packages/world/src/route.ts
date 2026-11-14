// Route profile (plan 7.0 / 7.2 steps 4–5): one array per route, 5 m resolution, the single source for trainer
// gradient, stage profile, map and stats. Climbs are detected and categorised for the stage profile and climb card.
import { gradesPer10m, orient, type Sampled } from './spline';
import type { World } from './types';

export type Climb = { startM: number; endM: number; lengthM: number; avgGradePct: number; gainM: number; maxGradePct: number; category: 'HC' | '1' | '2' | '3' | '4' };
export type RouteProfile = {
  id: string; name: string; description: string; region: string; tags: string[]; loop: boolean; lengthM: number; ascentM: number; descentM: number; maxGradePct: number;
  step: number; x: number[]; y: number[]; z: number[]; grade: number[]; // grade per 10 m
  climbs: Climb[]; segments: { id: string; name: string; kind: 'sprint' | 'climb'; startM: number; endM: number }[]; edges: { id: string; reverse: boolean; startM: number; lengthM: number }[];
};
const r1 = (v: number) => Math.round(v * 10) / 10;

/** Category from length (m) × average gradient (%), the common climb-score convention. */
export function climbCategory(lengthM: number, avgPct: number): Climb['category'] | null {
  const score = lengthM * avgPct; if (score >= 80000) return 'HC'; if (score >= 64000) return '1'; if (score >= 32000) return '2'; if (score >= 16000) return '3'; if (score >= 8000) return '4'; return null;
}
export function detectClimbs(y: number[], step: number): Climb[] {
  const n = y.length; const win = Math.round(100 / step); const g = (i: number) => { const a = Math.max(0, i - win), b = Math.min(n - 1, i + win); return ((y[b]! - y[a]!) / ((b - a) * step)) * 100; };
  const out: Climb[] = []; let start = -1, lastUp = -1;
  for (let i = 0; i < n; i++) {
    const up = g(i) >= 2;
    if (up) { if (start < 0) start = i; lastUp = i; }
    else if (start >= 0 && (i - lastUp) * step > 150) { push(start, lastUp); start = -1; } // dips under 150 m stay inside the climb
  }
  if (start >= 0) push(start, lastUp);
  function push(a: number, b: number) {
    let lo = a; for (let i = a; i <= b; i++) if (y[i]! < y[lo]!) lo = i; let hi = lo; for (let i = lo; i <= b; i++) if (y[i]! > y[hi]!) hi = i;
    const len = (hi - lo) * step, gain = y[hi]! - y[lo]!; if (len < 500) return; const avg = (gain / len) * 100; if (avg < 3) return;
    let maxG = 0; for (let i = lo; i + 2 <= hi; i += 2) maxG = Math.max(maxG, ((y[i + 2]! - y[i]!) / (2 * step)) * 100);
    const cat = climbCategory(len, avg); if (cat) out.push({ startM: lo * step, endM: hi * step, lengthM: len, avgGradePct: r1(avg), gainM: Math.round(gain), maxGradePct: r1(maxG), category: cat });
  }
  return out;
}

export function buildRoute(world: World, routeId: string, sampled: Record<string, Sampled>): RouteProfile {
  const r = world.routes.find((x) => x.id === routeId); if (!r) throw new Error(`unknown route ${routeId}`);
  const x: number[] = [], y: number[] = [], z: number[] = [], grade: number[] = []; const edges: RouteProfile['edges'] = []; let startM = 0;
  for (const e of r.edges) {
    const s = orient(sampled[e.id]!, e.reverse); const first = x.length ? 1 : 0; // the joint point is shared
    for (let k = first; k < s.x.length; k++) { x.push(s.x[k]!); y.push(s.y[k]!); z.push(s.z[k]!); }
    grade.push(...gradesPer10m(s)); edges.push({ ...e, startM, lengthM: s.length }); startM += s.length;
  }
  const step = startM / (x.length - 1); let asc = 0, desc = 0; for (let i = 1; i < y.length; i++) { const d = y[i]! - y[i - 1]!; if (d > 0) asc += d; else desc -= d; }
  const segments: RouteProfile['segments'] = [];
  for (const sg of world.segments) for (const e of edges) if (e.id === sg.edge) { // a segment ridden in reverse is not timed (it is defined in one direction)
    if (!e.reverse) segments.push({ id: sg.id, name: sg.name, kind: sg.kind, startM: e.startM + sg.from, endM: e.startM + sg.to });
  }
  return { id: r.id, name: r.name, description: r.description, region: r.region, tags: r.tags, loop: r.loop, lengthM: Math.round(startM), ascentM: Math.round(asc), descentM: Math.round(desc), maxGradePct: r1(Math.max(...grade)),
    step, x, y, z, grade: grade.map(r1), climbs: detectClimbs(y, step), segments, edges };
}
/** Sample the profile at a route distance (wraps for loops). */
export function profileAt(p: Pick<RouteProfile, 'x' | 'y' | 'z' | 'step' | 'lengthM' | 'loop'>, dM: number) {
  const L = p.lengthM; let d = p.loop ? ((dM % L) + L) % L : Math.max(0, Math.min(L, dM)); const f = d / p.step; const i = Math.min(p.x.length - 2, Math.floor(f)), t = f - i;
  const lerp = (a: number[]) => a[i]! + (a[i + 1]! - a[i]!) * t; return { x: lerp(p.x), y: lerp(p.y), z: lerp(p.z), headingRad: Math.atan2(p.z[i + 1]! - p.z[i]!, p.x[i + 1]! - p.x[i]!), d };
}
/** True gradient (%) over the next `aheadM` metres from route distance d. */
export function gradeAhead(p: Pick<RouteProfile, 'x' | 'y' | 'z' | 'step' | 'lengthM' | 'loop'>, dM: number, aheadM = 10) {
  const a = profileAt(p, dM), b = profileAt(p, dM + aheadM); const run = Math.hypot(b.x - a.x, b.z - a.z); return run > 0.5 ? ((b.y - a.y) / run) * 100 : 0;
}
export function difficultyLabel(lengthM: number, ascentM: number): 'Easy' | 'Moderate' | 'Hard' | 'Extreme' {
  const m = ascentM / Math.max(1, lengthM / 1000); const score = ascentM + lengthM / 100; if (score > 2000 || m > 40) return 'Extreme'; if (score > 700 || m > 18) return 'Hard'; if (score > 250 || m > 8) return 'Moderate'; return 'Easy';
}
