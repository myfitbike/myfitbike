// World bake (plan 7.0 build steps 4, 6, 7): terrain conformed to roads, chunked along the road corridors for
// streaming, a coarse far mesh for skylines, and seeded scenery near the roads. Deterministic from the seed.
import { fbm, makeNoise2, mulberry32, smoothstep } from './noise';
import { makeHeightFn } from './terrain';
import { orient, type Sampled } from './spline';
import { sampleWorld } from './validate';
import type { World } from './types';

export const CHUNK = 500, NEAR_STEP = 6.25, FAR_STEP = 100; // metres
export const NEAR_N = CHUNK / NEAR_STEP + 1; // 81 vertices per side
export type Checkpoint = { kind: 'start' | 'climb' | 'summit' | 'sprint' | 'sprint-end'; edge: string; at: number; x: number; y: number; z: number; heading: number; width: number; barriers: number[][]; crowd: number[] };
export type BakeManifest = { version: number; seed: number; chunk: number; nearStep: number; nearN: number; chunks: string[]; far: { ox: number; oz: number; step: number; nx: number; nz: number } };
export type Scenery = { trees: number[]; houses: { x: number; y: number; z: number; w: number; d: number; floors: number; rot: number; wall: number; roof: number }[]; lakes: { x: number; z: number; r: number; level: number }[];
  props: Record<'sheep' | 'cows' | 'rocks' | 'bushes' | 'flowers' | 'bales' | 'reeds' | 'ducks' | 'boats', number[]> & { walls: number[][]; fences: number[][] }; checkpoints: Checkpoint[]; landmarks: { id: string; kind: string; name: string; pos: [number, number, number]; rot: number }[] };

function roadIndex(sampled: Record<string, Sampled>, cell = 40) {
  const map = new Map<number, [number, number, number, string, number][]>(); const key = (i: number, j: number) => i * 100003 + j;
  for (const [id, s] of Object.entries(sampled)) for (let k = 0; k < s.x.length; k++) { const kk = key(Math.floor(s.x[k]! / cell), Math.floor(s.z[k]! / cell)); let a = map.get(kk); if (!a) map.set(kk, (a = [])); a.push([s.x[k]!, s.y[k]!, s.z[k]!, id, k]); }
  return (x: number, z: number, maxR = 40) => {
    let best: [number, number, number, string, number] | null = null, bd = maxR; const ci = Math.floor(x / cell), cj = Math.floor(z / cell), r = Math.ceil(maxR / cell);
    for (let i = ci - r; i <= ci + r; i++) for (let j = cj - r; j <= cj + r; j++) { const arr = map.get(key(i, j)); if (arr) for (const p of arr) { const d = Math.hypot(p[0] - x, p[2] - z); if (d < bd) { bd = d; best = p; } } }
    return best ? { d: bd, y: best[1], edge: best[3], k: best[4] } : null;
  };
}

export function bakeWorld(world: World) {
  const sampled = sampleWorld(world); const natural = makeHeightFn(world); const nearest = roadIndex(sampled);
  const FLAT = 9, BLEND = 32; const r2 = (v: number) => Math.round(v * 100) / 100;
  const conformed = (x: number, z: number) => { const h = natural(x, z); const r = nearest(x, z, BLEND); if (!r) return h; const target = r.y - 0.3; return target + (h - target) * smoothstep(FLAT, BLEND, r.d); };
  // chunks covering every road ± 350 m
  const keys = new Set<string>(); for (const s of Object.values(sampled)) for (let k = 0; k < s.x.length; k += 20) for (const dx of [-350, 0, 350]) for (const dz of [-350, 0, 350]) keys.add(`${Math.floor((s.x[k]! + dx) / CHUNK)}_${Math.floor((s.z[k]! + dz) / CHUNK)}`);
  const chunks = new Map<string, Float32Array>();
  for (const key of [...keys].sort()) { const [ci, cj] = key.split('_').map(Number) as [number, number]; const h = new Float32Array(NEAR_N * NEAR_N);
    for (let j = 0; j < NEAR_N; j++) for (let i = 0; i < NEAR_N; i++) h[j * NEAR_N + i] = conformed(ci * CHUNK + i * NEAR_STEP, cj * CHUNK + j * NEAR_STEP); chunks.set(key, h); }
  const [W, H] = world.size; const fnx = Math.round(W / FAR_STEP) + 1, fnz = Math.round(H / FAR_STEP) + 1; const far = new Float32Array(fnx * fnz);
  for (let j = 0; j < fnz; j++) for (let i = 0; i < fnx; i++) { const x = -W / 2 + i * FAR_STEP, z = -H / 2 + j * FAR_STEP; const inChunk = keys.has(`${Math.floor(x / CHUNK)}_${Math.floor(z / CHUNK)}`); far[j * fnx + i] = natural(x, z) - (inChunk ? 5 : 0); } // sink the far mesh under near chunks

  // ---- scenery near roads (seeded) ----
  const rnd = mulberry32(world.seed ^ 0x51ed); const forest = makeNoise2(world.seed + 7), fieldN = makeNoise2(world.seed + 11);
  const regionOf = (x: number, z: number) => world.regions.find((r) => { let inside = false; const p = r.polygon; for (let i = 0, j = p.length - 1; i < p.length; j = i++) { const [xi, zi] = p[i]!, [xj, zj] = p[j]!; if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside; } return inside; });
  const inTown = (x: number, z: number, pad = 0) => world.towns.some((t) => Math.hypot(x - t.center[0], z - t.center[1]) < t.radius + pad);
  const inLake = (x: number, z: number, pad = 0) => world.lakes.some((l) => Math.hypot(x - l.center[0], z - l.center[1]) < l.radius * 1.3 + pad);
  const slope = (x: number, z: number) => { const e = 3; return Math.hypot(conformed(x + e, z) - conformed(x - e, z), conformed(x, z + e) - conformed(x, z - e)) / (2 * e); };
  const free = (x: number, z: number, road = 12) => { const r = nearest(x, z, road + 1); return !(r && r.d < road) && !inLake(x, z, 8); };
  const edgeIds = Object.keys(sampled);
  const roadside = (dMin: number, dMax: number) => { const s = sampled[edgeIds[Math.floor(rnd() * edgeIds.length)]!]!; const k = 1 + Math.floor(rnd() * (s.x.length - 2)); const tx = s.x[k + 1]! - s.x[k - 1]!, tz = s.z[k + 1]! - s.z[k - 1]!, l = Math.hypot(tx, tz); const side = rnd() < 0.5 ? -1 : 1, d = dMin + rnd() * (dMax - dMin); return { x: s.x[k]! - (tz / l) * d * side, z: s.z[k]! + (tx / l) * d * side, ang: Math.atan2(tz, tx) }; };
  const pasture = (x: number, z: number) => regionOf(x, z)?.biome === 'farmland' && fbm(fieldN, x / 350, z / 350, 3) > 0.05;
  const totalRoad = Object.values(sampled).reduce((a, s) => a + s.length, 0);
  const trees: number[] = []; const treeTarget = Math.round(totalRoad * 0.9);
  for (let tries = 0; tries < treeTarget * 12 && trees.length < treeTarget * 6; tries++) {
    const p = roadside(8, 380); const reg = regionOf(p.x, p.z); if (!reg) continue; const dens = fbm(forest, p.x / 420, p.z / 420, 4) + ({ marsh: -0.35, harbour: -0.15, desert: -0.55, volcanic: -0.45, rainforest: 0.3, tea: -0.12, alpine: 0.05, fjord: 0.05, oldtown: -0.05, farmland: 0 } as Record<string, number>)[reg.biome]!;
    if (dens < -0.05 + rnd() * 0.25 || inTown(p.x, p.z, 20) || pasture(p.x, p.z) || !free(p.x, p.z, 7.5)) continue;
    const y = conformed(p.x, p.z); if (y < 2.5 || slope(p.x, p.z) > 0.7 || y > 1050) continue; trees.push(r2(p.x), r2(y), r2(p.z), r2(0.75 + rnd() * 0.6), r2(rnd() * 6.283), y > 60 || reg.biome === 'alpine' || reg.biome === 'fjord' || fbm(forest, p.x / 150, p.z / 150, 2) > 0.15 ? 1 : 0);
  }
  const props: Scenery['props'] = { sheep: [], cows: [], rocks: [], bushes: [], flowers: [], bales: [], reeds: [], ducks: [], boats: [], walls: [], fences: [] };
  for (let f = 0, tries = 0; f < Math.round(totalRoad / 1500) && tries < 6000; tries++) { const c = roadside(45, 140); if (!pasture(c.x, c.z) || !free(c.x, c.z, 35) || slope(c.x, c.z) > 0.25) continue; const cow = f % 3 === 2; f++; const n = cow ? 4 + Math.floor(rnd() * 5) : 8 + Math.floor(rnd() * 14);
    for (let i = 0; i < n; i++) { const a = rnd() * 6.283, d = Math.sqrt(rnd()) * (cow ? 25 : 35); const x = c.x + Math.cos(a) * d, z = c.z + Math.sin(a) * d; if (free(x, z, 12)) (cow ? props.cows : props.sheep).push(r2(x), r2(conformed(x, z)), r2(z), r2(rnd() * 6.283)); } }
  for (let i = 0; i < totalRoad / 8; i++) { const p = roadside(9, 300); const y = conformed(p.x, p.z); if (y > 1.5 && free(p.x, p.z, 9) && !inTown(p.x, p.z)) props.rocks.push(r2(p.x), r2(y), r2(p.z), r2(0.4 + rnd() ** 3 * 2.2), r2(rnd() * 6.283)); }
  for (let i = 0; i < totalRoad / 2.5; i++) { const p = roadside(6.5, 250); const y = conformed(p.x, p.z); if (y > 2.5 && free(p.x, p.z, 6.5) && slope(p.x, p.z) < 0.6 && !inTown(p.x, p.z)) props.bushes.push(r2(p.x), r2(y), r2(p.z), r2(0.6 + rnd() * 0.9), r2(rnd() * 6.283)); }
  for (let pt = 0; pt < totalRoad / 120; pt++) { const c = roadside(6, 30); if (!free(c.x, c.z, 5)) continue; const kind = Math.floor(rnd() * 4); for (let i = 0; i < 70; i++) { const a = rnd() * 6.283, d = Math.sqrt(rnd()) * 12; const x = c.x + Math.cos(a) * d, z = c.z + Math.sin(a) * d; if (free(x, z, 4.5)) props.flowers.push(r2(x), r2(conformed(x, z)), r2(z), kind); } }
  for (let f = 0, tries = 0; f < Math.round(totalRoad / 4000) && tries < 4000; tries++) { const c = roadside(40, 100); if (!pasture(c.x, c.z) || !free(c.x, c.z, 30) || slope(c.x, c.z) > 0.15) continue; f++; const ang = rnd() * 3.14; for (let i = 0; i < 10; i++) { const x = c.x + Math.cos(ang) * (i - 5) * 9, z = c.z + Math.sin(ang) * (i - 5) * 9; if (free(x, z, 10)) props.bales.push(r2(x), r2(conformed(x, z)), r2(z), r2(ang)); } }
  for (const l of world.lakes) { for (let i = 0; i < 1600; i++) { const a = rnd() * 6.283, d = l.radius * (0.85 + rnd() * 0.6); const x = l.center[0] + Math.cos(a) * d, z = l.center[1] + Math.sin(a) * d; const y = conformed(x, z); if (y > l.level - 0.6 && y < l.level + 0.5) props.reeds.push(r2(x), r2(Math.max(y, l.level - 0.3)), r2(z), r2(0.7 + rnd() * 0.6)); }
    for (let i = 0; i < 10; i++) { const a = rnd() * 6.283, d = rnd() * l.radius * 0.5; props.ducks.push(r2(l.center[0] + Math.cos(a) * d), l.level, r2(l.center[1] + Math.sin(a) * d), r2(rnd() * 6.283)); } }
  for (let w = 0, tries = 0; w < Math.round(totalRoad / 1500) && tries < 4000; tries++) { const rs = roadside(14, 45); if (!pasture(rs.x, rs.z)) continue; const ang = rs.ang + (rnd() < 0.6 ? (rnd() - 0.5) * 0.3 : Math.PI / 2), len = 50 + rnd() * 120; const pts: number[] = [];
    for (let d = 0; d <= len; d += 2) { const px = rs.x + Math.cos(ang) * d, pz = rs.z + Math.sin(ang) * d; if (!free(px, pz, 9)) break; pts.push(r2(px), r2(conformed(px, pz)), r2(pz)); } if (pts.length >= 30) { props.walls.push(pts); w++; } }
  for (const e of world.edges) { const s = sampled[e.id]!; let run: number[] = []; const flush = () => { if (run.length >= 24) props.fences.push(run); run = []; };
    for (let k = 1; k < s.x.length - 1; k++) { const tx = s.x[k + 1]! - s.x[k - 1]!, tz = s.z[k + 1]! - s.z[k - 1]!, l = Math.hypot(tx, tz); const off = e.width / 2 + 4.5; const px = s.x[k]! - (tz / l) * off, pz = s.z[k]! + (tx / l) * off; if (pasture(px, pz) && !inLake(px, pz, 5)) run.push(r2(px), r2(conformed(px, pz)), r2(pz)); else flush(); } flush(); }
  const houses: Scenery['houses'] = [];
  for (const t of world.towns) for (let tries = 0, n = 0; tries < 12000 && n < Math.round(t.radius / 4); tries++) {
    const a = rnd() * Math.PI * 2, rr = Math.sqrt(rnd()) * t.radius; const x = t.center[0] + Math.cos(a) * rr, z = t.center[1] + Math.sin(a) * rr;
    const r = nearest(x, z, 60); if (r && r.d < 13) continue; const y = conformed(x, z); if (y < 2 || slope(x, z) > 0.25) continue; const w = 6 + rnd() * 4, d = 7 + rnd() * 4;
    if (houses.some((h) => Math.hypot(h.x - x, h.z - z) < (Math.max(w, d) + Math.max(h.w, h.d)) * 0.6)) continue;
    let rot = rnd() * Math.PI; if (r) { const s = sampled[r.edge]!; const k2 = Math.min(r.k + 1, s.x.length - 1), k1 = Math.max(r.k - 1, 0); rot = Math.atan2(s.z[k2]! - s.z[k1]!, s.x[k2]! - s.x[k1]!); }
    houses.push({ x: r2(x), y: r2(y), z: r2(z), w: r2(w), d: r2(d), floors: 1 + Math.floor(rnd() * 3), rot: r2(rot), wall: Math.floor(rnd() * 5), roof: Math.floor(rnd() * 3) }); n++;
  }
  for (const t of world.towns) for (let i = 0; i < 9; i++) { const a = Math.PI * (0.3 + rnd() * 0.4), d = t.radius + 150 + rnd() * 500; const x = t.center[0] + Math.cos(a) * d, z = t.center[1] + Math.sin(a) * d; if (natural(x, z) < -2) props.boats.push(r2(x), 0.4, r2(z), r2(rnd() * 6.283), Math.floor(rnd() * 3)); }

  // ---- checkpoints (PLAN 16.15): route start at the pier, every segment start and end ----
  const cps: { edge: string; at: number; kind: Checkpoint['kind'] }[] = [];
  const firstEdge = world.routes[0]?.edges[0]; if (firstEdge) cps.push({ edge: firstEdge.id, at: 25, kind: 'start' });
  for (const sg of world.segments) { cps.push({ edge: sg.edge, at: sg.from, kind: sg.kind === 'climb' ? 'climb' : 'sprint' }); cps.push({ edge: sg.edge, at: sg.to, kind: sg.kind === 'climb' ? 'summit' : 'sprint-end' }); }
  const checkpoints: Checkpoint[] = cps.map((c) => {
    const s = orient(sampled[c.edge]!, false); const w = world.edges.find((e) => e.id === c.edge)!.width; const k = Math.min(s.x.length - 2, Math.max(1, Math.round(c.at / 5)));
    const at = (kk: number) => { kk = Math.min(s.x.length - 2, Math.max(1, kk)); const tx = s.x[kk + 1]! - s.x[kk - 1]!, tz = s.z[kk + 1]! - s.z[kk - 1]!, l = Math.hypot(tx, tz); return { x: s.x[kk]!, y: s.y[kk]!, z: s.z[kk]!, tx: tx / l, tz: tz / l }; };
    const p = at(k); const half = w / 2 + 1.6; const barriers: number[][] = [[], []], crowd: number[] = [];
    for (let j = -9; j <= 5; j++) { const q = at(k + j); for (const [si, side] of [[0, -1], [1, 1]] as const) { barriers[si]!.push(r2(q.x - q.tz * half * side), r2(q.y), r2(q.z + q.tx * half * side));
      for (let n = 0; n < 6; n++) { if (rnd() < 0.18) continue; const along = (rnd() - 0.5) * 5, back = 1 + rnd() * 2.6; const cx = q.x + q.tx * along - q.tz * (half + back) * side, cz = q.z + q.tz * along + q.tx * (half + back) * side;
        crowd.push(r2(cx), r2(conformed(cx, cz) + 0.3), r2(cz), r2(Math.atan2(q.tx * side, q.tz * side) + (rnd() - 0.5) * 0.6), Math.floor(rnd() * 8), r2(rnd() * 6.283)); } } }
    return { kind: c.kind, edge: c.edge, at: c.at, x: r2(p.x), y: r2(p.y), z: r2(p.z), heading: r2(Math.atan2(p.tz, p.tx)), width: r2(w + 4), barriers, crowd };
  });
  const nearCp = (x: number, z: number, r = 55) => checkpoints.some((c) => Math.hypot(x - c.x, z - c.z) < r);
  const strideOf = { sheep: 4, cows: 4, rocks: 5, bushes: 5, flowers: 4, bales: 4 } as const;
  for (const key of Object.keys(strideOf) as (keyof typeof strideOf)[]) { const st = strideOf[key], a = props[key], out: number[] = []; for (let i = 0; i < a.length; i += st) if (!nearCp(a[i]!, a[i + 2]!)) out.push(...a.slice(i, i + st)); props[key] = out; }
  const treesOut: number[] = []; for (let i = 0; i < trees.length; i += 6) if (!nearCp(trees[i]!, trees[i + 2]!, 30)) treesOut.push(...trees.slice(i, i + 6));
  const scenery: Scenery = { trees: treesOut, houses, lakes: world.lakes.map((l) => ({ x: l.center[0], z: l.center[1], r: l.radius, level: l.level })), props, checkpoints,
    landmarks: world.landmarks.map((l) => ({ ...l, pos: [l.pos[0], r2(conformed(l.pos[0], l.pos[2])), l.pos[2]] as [number, number, number] })) };
  const manifest: BakeManifest = { version: world.version, seed: world.seed, chunk: CHUNK, nearStep: NEAR_STEP, nearN: NEAR_N, chunks: [...chunks.keys()], far: { ox: -W / 2, oz: -H / 2, step: FAR_STEP, nx: fnx, nz: fnz } };
  return { manifest, chunks, far, scenery };
}
