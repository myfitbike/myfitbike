// Phase 0b spike build pipeline: world.json -> validated, terrain-conformed, scattered bake.
// Usage: node build.mjs <world.json> <outDir>. Deterministic: same input gives byte-identical output.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { sampleEdge, validateWorld, makeHeightFn, makeRoadIndex, smoothstep, mulberry32, makeNoise2, fbm, gradesPer10m, orient } from './lib/core.mjs';

export function build(world) {
  // 1. Roads: spline every edge, resample at 5 m.
  const sampled = Object.fromEntries(world.edges.map((e) => [e.id, sampleEdge(e.points, 5)]));
  // 2. Validate (fail the build on any violation).
  const { errors, report } = validateWorld(world, sampled);
  if (errors.length) { const err = new Error(`world validation failed:\n  ${errors.join('\n  ')}`); err.violations = errors; throw err; }

  const natural = makeHeightFn(world);
  const nearest = makeRoadIndex(sampled);
  const FLAT = 9, BLEND = 30; // plan 7.3: flatten near the road, blend out
  const conformed = (x, z) => {
    const h = natural(x, z); const r = nearest(x, z, BLEND);
    if (!r) return h;
    const target = r.y - 0.3; const t = smoothstep(FLAT, BLEND, r.d);
    return target + (h - target) * t;
  };

  // Cut/fill along the road: where a real build would need tunnels (>15 m cut) or bridges (>12 m fill).
  let maxCut = 0, maxFill = 0;
  for (const s of Object.values(sampled)) for (let k = 0; k < s.x.length; k += 4) {
    const diff = natural(s.x[k], s.z[k]) - s.y[k]; maxCut = Math.max(maxCut, diff); maxFill = Math.max(maxFill, -diff);
  }
  report.maxCutM = +maxCut.toFixed(1); report.maxFillM = +maxFill.toFixed(1);
  report.warnings = [];
  if (maxCut > 15) report.warnings.push(`cut of ${maxCut.toFixed(1)} m would need a tunnel (not built in the spike)`);
  if (maxFill > 12) report.warnings.push(`fill of ${maxFill.toFixed(1)} m would need a bridge (not built in the spike)`);

  // 3. Terrain grids: near (6 m) around the roads, far (70 m) for skyline, far sunk under near.
  const region = world.regions[0].polygon; const [x0, z0] = region[0], [x1, z1] = region[2];
  const grid = (ox, oz, step, nx, nz, fn) => { const h = new Float32Array(nx * nz); for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) h[j * nx + i] = fn(ox + i * step, oz + j * step); return { ox, oz, step, nx, nz, h }; };
  const nearStep = 6; const near = grid(x0, z0, nearStep, Math.round((x1 - x0) / nearStep) + 1, Math.round((z1 - z0) / nearStep) + 1, conformed);
  const farStep = 70, farHalf = world.size[0] / 2; const farN = Math.round((2 * farHalf) / farStep) + 1;
  const far = grid(-farHalf, -farHalf, farStep, farN, farN, (x, z) => {
    const inside = x > x0 + 80 && x < x1 - 80 && z > z0 + 80 && z < z1 - 80;
    return inside ? natural(x, z) - 6 : natural(x, z);
  });

  // 4. Scatter: houses in the town, trees elsewhere. Seeded, so it never changes between builds.
  const rnd = mulberry32(world.seed ^ 0x51ed);
  const slope = (x, z) => { const e = 3; return Math.hypot(conformed(x + e, z) - conformed(x - e, z), conformed(x, z + e) - conformed(x, z - e)) / (2 * e); };
  const houses = [];
  const town = world.town;
  for (let tries = 0; tries < 4000 && houses.length < 46; tries++) {
    const a = rnd() * Math.PI * 2, rr = Math.sqrt(rnd()) * town.radius;
    const x = town.center[0] + Math.cos(a) * rr, z = town.center[1] + Math.sin(a) * rr;
    const r = nearest(x, z, 60); if (r && r.d < 14) continue;
    const y = conformed(x, z); if (y < 2 || slope(x, z) > 0.25) continue;
    const w = 6 + rnd() * 4, d = 7 + rnd() * 4;
    if (houses.some((h) => Math.hypot(h.x - x, h.z - z) < (Math.max(w, d) + Math.max(h.w, h.d)) * 0.6)) continue;
    let rot = rnd() * Math.PI;
    if (r) { const s = sampled[r.edge]; const k2 = Math.min(r.k + 1, s.x.length - 1), k1 = Math.max(r.k - 1, 0); rot = Math.atan2(s.z[k2] - s.z[k1], s.x[k2] - s.x[k1]); }
    houses.push({ x: +x.toFixed(2), y: +y.toFixed(2), z: +z.toFixed(2), w: +w.toFixed(2), d: +d.toFixed(2), floors: 1 + Math.floor(rnd() * 3), rot: +rot.toFixed(3), wall: Math.floor(rnd() * 5), roof: Math.floor(rnd() * 3) });
  }
  const forest = makeNoise2(world.seed + 7); const trees = [];
  for (let tries = 0; tries < 400000 && trees.length < 9000 * 6; tries++) {
    const x = x0 + rnd() * (x1 - x0), z = z0 + rnd() * (z1 - z0);
    const density = fbm(forest, x / 420, z / 420, 4); if (density < -0.05 + rnd() * 0.25) continue;
    if (Math.hypot(x - town.center[0], z - town.center[1]) < town.radius + 20) continue;
    const r = nearest(x, z, 40); if (r && r.d < 7.5) continue;
    const y = conformed(x, z); if (y < 2.5 || slope(x, z) > 0.7) continue;
    const type = y > 45 || fbm(forest, x / 150, z / 150, 2) > 0.15 ? 1 : 0; // 1 conifer, 0 broadleaf
    trees.push(+x.toFixed(2), +y.toFixed(2), +z.toFixed(2), +(0.75 + rnd() * 0.6).toFixed(2), +(rnd() * 6.283).toFixed(2), type);
  }
  const landmarks = world.landmarks.map((l) => ({ ...l, pos: [l.pos[0], +conformed(l.pos[0], l.pos[2]).toFixed(2), l.pos[2]] }));

  // 5. Route profiles: gradient per 10 m along each route (single source for trainer, profile and stats).
  const routes = world.routes.map((r) => {
    let length = 0, ascent = 0; const grade = [];
    for (const e of r.edges) { const s = orient(sampled[e.id], e.reverse); length += s.length; for (let k = 1; k < s.y.length; k++) ascent += Math.max(0, s.y[k] - s.y[k - 1]); grade.push(...gradesPer10m(s).map((g) => +g.toFixed(2))); }
    return { id: r.id, name: r.name, edges: r.edges, loop: r.loop, lengthM: +length.toFixed(1), ascentM: +ascent.toFixed(1), gradePer10m: grade };
  });
  const roads = Object.fromEntries(Object.entries(sampled).map(([id, s]) => [id, { length: +s.length.toFixed(2), x: s.x.map((v) => +v.toFixed(2)), y: s.y.map((v) => +v.toFixed(2)), z: s.z.map((v) => +v.toFixed(2)), width: world.edges.find((e) => e.id === id).width }]));

  return {
    meta: { worldVersion: world.version, seed: world.seed, report },
    terrain: { near: { ox: near.ox, oz: near.oz, step: near.step, nx: near.nx, nz: near.nz, file: 'near.f32' }, far: { ox: far.ox, oz: far.oz, step: far.step, nx: far.nx, nz: far.nz, file: 'far.f32' } },
    nodes: world.nodes, edges: world.edges.map(({ id, from, to, surface, width }) => ({ id, from, to, surface, width })),
    roads, routes, segments: world.segments, houses, trees, landmarks,
    _bin: { 'near.f32': near.h, 'far.f32': far.h },
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [, , input = 'world.json', outDir = 'out'] = process.argv;
  const t = Date.now();
  const bake = build(JSON.parse(readFileSync(input, 'utf8')));
  mkdirSync(outDir, { recursive: true });
  for (const [name, arr] of Object.entries(bake._bin)) writeFileSync(join(outDir, name), Buffer.from(arr.buffer));
  delete bake._bin;
  writeFileSync(join(outDir, 'slice.json'), JSON.stringify(bake));
  console.log(`bake ok in ${Date.now() - t} ms: ${bake.houses.length} houses, ${bake.trees.length / 6} trees, routes ${bake.routes.map((r) => `${r.id} ${r.lengthM} m / +${r.ascentM} m`).join(', ')}`);
  console.log('report', JSON.stringify(bake.meta.report));
}
