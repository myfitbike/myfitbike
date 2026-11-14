// Road validation (plan 7.0 build step 3). The build fails on any violation, so the trainer is never sent a
// gradient the designer did not intend and every route can be ridden without a jump.
import { gradesPer10m, orient, sampleEdge, type Sampled } from './spline';
import type { World } from './types';

const headingAt = (s: Sampled, end: boolean) => { const n = s.x.length; const [i, j] = end ? [n - 3, n - 1] : [0, 2]; return Math.atan2(s.z[j]! - s.z[i]!, s.x[j]! - s.x[i]!); };
const angleDeg = (a: number, b: number) => { let d = ((b - a) * 180) / Math.PI; while (d > 180) d -= 360; while (d < -180) d += 360; return Math.abs(d); };
function regionOf(world: World, x: number, z: number) { return world.regions.find((r) => { let inside = false; const p = r.polygon; for (let i = 0, j = p.length - 1; i < p.length; j = i++) { const [xi, zi] = p[i]!, [xj, zj] = p[j]!; if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside; } return inside; }); }

export function sampleWorld(world: World): Record<string, Sampled> { return Object.fromEntries(world.edges.map((e) => [e.id, sampleEdge(e.points, 5)])); }

export function validateWorld(world: World, sampled = sampleWorld(world)): { errors: string[]; maxGrade: Record<string, number> } {
  const errors: string[] = []; const maxGrade: Record<string, number> = {}; const degree = new Map<string, number>();
  for (const e of world.edges) { degree.set(e.from, (degree.get(e.from) ?? 0) + 1); degree.set(e.to, (degree.get(e.to) ?? 0) + 1); }
  for (const e of world.edges) {
    const s = sampled[e.id]!; const g = gradesPer10m(s); maxGrade[e.id] = Math.max(0, ...g.map(Math.abs));
    g.forEach((v, i) => { const k = i * 2; const reg = regionOf(world, s.x[k]!, s.z[k]!); const lim = reg?.maxGradePct ?? 16; if (Math.abs(v) > lim + 0.05) errors.push(`${e.id} @${Math.round(s.d[k]!)} m: ${v.toFixed(1)} % exceeds ${reg?.name ?? 'world'} limit ${lim} %`); });
    for (let i = 2; i + 2 < s.x.length; i += 2) {
      const ax = s.x[i - 2]!, az = s.z[i - 2]!, bx = s.x[i]!, bz = s.z[i]!, cx = s.x[i + 2]!, cz = s.z[i + 2]!; const a2 = Math.abs((bx - ax) * (cz - az) - (bz - az) * (cx - ax));
      if (a2 > 1e-6) { const r = (Math.hypot(bx - ax, bz - az) * Math.hypot(cx - bx, cz - bz) * Math.hypot(cx - ax, cz - az)) / (2 * a2); if (r < 6) errors.push(`${e.id} @${Math.round(s.d[i]!)} m: turn radius ${r.toFixed(1)} m below 6 m`); }
    }
    for (const [idx, nodeId] of [[0, e.from], [s.x.length - 1, e.to]] as const) {
      const n = world.nodes.find((x) => x.id === nodeId); if (!n) { errors.push(`${e.id}: unknown node ${nodeId}`); continue; }
      const off = Math.hypot(s.x[idx]! - n.pos[0], s.y[idx]! - n.pos[1], s.z[idx]! - n.pos[2]); if (off > 0.05) errors.push(`${e.id}: end is ${off.toFixed(2)} m from node ${nodeId}`);
    }
  }
  for (const r of world.routes) {
    if (!r.edges.length) { errors.push(`route ${r.id}: no edges`); continue; }
    for (let k = 0; k < r.edges.length; k++) {
      if (!r.loop && k === r.edges.length - 1) break;
      const a = r.edges[k]!, b = r.edges[(k + 1) % r.edges.length]!; const ea = world.edges.find((e) => e.id === a.id), eb = world.edges.find((e) => e.id === b.id);
      if (!ea || !eb) { errors.push(`route ${r.id}: unknown edge ${!ea ? a.id : b.id}`); continue; }
      const end = a.reverse ? ea.from : ea.to, start = b.reverse ? eb.to : eb.from; if (end !== start) { errors.push(`route ${r.id}: ${a.id} does not connect to ${b.id}`); continue; }
      const turn = angleDeg(headingAt(orient(sampled[a.id]!, a.reverse), true), headingAt(orient(sampled[b.id]!, b.reverse), false));
      const limit = (degree.get(end) ?? 0) >= 3 ? 135 : 15; // through-roads must be smooth; real junctions may turn
      if (turn > limit) errors.push(`route ${r.id}: ${turn.toFixed(0)}° turn from ${a.id} to ${b.id} at ${end} (limit ${limit}°)`);
    }
  }
  for (const sg of world.segments) { const s = sampled[sg.edge]; if (!s) errors.push(`segment ${sg.id}: unknown edge`); else if (sg.from < 0 || sg.to > s.length + 1 || sg.to <= sg.from) errors.push(`segment ${sg.id}: range ${sg.from}–${sg.to} outside edge (${s.length.toFixed(0)} m)`); }
  return { errors, maxGrade };
}
