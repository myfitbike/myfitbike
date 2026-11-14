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
  const lakes = (world.lakes || []).map((l) => ({ x: l.center[0], z: l.center[1], r: l.radius, level: l.level }));
  const inLake = (x, z, pad = 0) => lakes.some((l) => Math.hypot(x - l.x, z - l.z) < l.r * 1.3 + pad);
  const r2 = (v) => +v.toFixed(2);
  const fieldN = makeNoise2(world.seed + 11);
  const pasture = (x, z) => fbm(fieldN, x / 350, z / 350, 3) > 0.12; // open grazing land, kept free of trees
  const free = (x, z, road = 20) => { const r = nearest(x, z, road + 1); return !(r && r.d < road) && !inLake(x, z, 8) && Math.hypot(x - town.center[0], z - town.center[1]) > town.radius + 15; };
  const forest = makeNoise2(world.seed + 7); const trees = [];
  for (let tries = 0; tries < 400000 && trees.length < 9000 * 6; tries++) {
    const x = x0 + rnd() * (x1 - x0), z = z0 + rnd() * (z1 - z0);
    const density = fbm(forest, x / 420, z / 420, 4); if (density < -0.05 + rnd() * 0.25) continue;
    if (Math.hypot(x - town.center[0], z - town.center[1]) < town.radius + 20) continue;
    if (inLake(x, z, 6) || pasture(x, z)) continue;
    const r = nearest(x, z, 40); if (r && r.d < 7.5) continue;
    const y = conformed(x, z); if (y < 2.5 || slope(x, z) > 0.7) continue;
    const type = y > 45 || fbm(forest, x / 150, z / 150, 2) > 0.15 ? 1 : 0; // 1 conifer, 0 broadleaf
    trees.push(+x.toFixed(2), +y.toFixed(2), +z.toFixed(2), +(0.75 + rnd() * 0.6).toFixed(2), +(rnd() * 6.283).toFixed(2), type);
  }
  // 4b. Richer scenery (PLAN 16.10): lake edge, pastures with animals, walls, fences, rocks, bushes, flowers, bales, boats.
  const props = { sheep: [], cows: [], rocks: [], bushes: [], flowers: [], bales: [], reeds: [], ducks: [], boats: [], walls: [], fences: [] };
  for (let f = 0, tries = 0; f < 14 && tries < 3000; tries++) { // flocks
    const cx = x0 + 150 + rnd() * (x1 - x0 - 300), cz = z0 + 150 + rnd() * (z1 - z0 - 300);
    if (!pasture(cx, cz) || !free(cx, cz, 35) || conformed(cx, cz) < 3 || slope(cx, cz) > 0.25) continue;
    const cow = f % 3 === 2; const n = cow ? 4 + Math.floor(rnd() * 5) : 8 + Math.floor(rnd() * 14); f++;
    for (let i = 0; i < n; i++) { const a = rnd() * 6.283, d = Math.sqrt(rnd()) * (cow ? 25 : 35); const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d; if (!free(x, z, 12)) continue; (cow ? props.cows : props.sheep).push(r2(x), r2(conformed(x, z)), r2(z), r2(rnd() * 6.283)); }
  }
  for (let i = 0; i < 2500; i++) { const x = x0 + rnd() * (x1 - x0), z = z0 + rnd() * (z1 - z0); const y = conformed(x, z); if (y < 1.5 || !free(x, z, 9)) continue; props.rocks.push(r2(x), r2(y), r2(z), r2(0.4 + rnd() ** 3 * 2.2), r2(rnd() * 6.283)); }
  for (let i = 0; i < 5000; i++) { const x = x0 + rnd() * (x1 - x0), z = z0 + rnd() * (z1 - z0); const y = conformed(x, z); if (y < 2.5 || !free(x, z, 6.5) || slope(x, z) > 0.6) continue; props.bushes.push(r2(x), r2(y), r2(z), r2(0.6 + rnd() * 0.9), r2(rnd() * 6.283)); }
  for (let p = 0; p < 160; p++) { // wildflower patches near roads and in meadows
    const cx = x0 + rnd() * (x1 - x0), cz = z0 + rnd() * (z1 - z0); if (!free(cx, cz, 5) || conformed(cx, cz) < 2.5) continue; const kind = Math.floor(rnd() * 4);
    for (let i = 0; i < 90; i++) { const a = rnd() * 6.283, d = Math.sqrt(rnd()) * 14; const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d; if (!free(x, z, 4.5)) continue; props.flowers.push(r2(x), r2(conformed(x, z)), r2(z), kind); }
  }
  for (let fld = 0, tries = 0; fld < 6 && tries < 2000; tries++) { // hay-bale fields
    const cx = x0 + rnd() * (x1 - x0), cz = z0 + rnd() * (z1 - z0); if (pasture(cx, cz) || !free(cx, cz, 30) || slope(cx, cz) > 0.15 || conformed(cx, cz) < 3) continue; fld++;
    const ang = rnd() * 3.14; for (let i = 0; i < 10; i++) { const x = cx + Math.cos(ang) * (i - 5) * 9 + rnd() * 3, z = cz + Math.sin(ang) * (i - 5) * 9 + rnd() * 3; if (free(x, z, 10)) props.bales.push(r2(x), r2(conformed(x, z)), r2(z), r2(ang + rnd() * 0.4)); }
  }
  for (const l of lakes) { // reeds on the shoreline, ducks on the water
    for (let i = 0; i < 1400; i++) { const a = rnd() * 6.283, d = l.r * (0.85 + rnd() * 0.6); const x = l.x + Math.cos(a) * d, z = l.z + Math.sin(a) * d; const y = conformed(x, z); if (y > l.level - 0.6 && y < l.level + 0.5) props.reeds.push(r2(x), r2(Math.max(y, l.level - 0.3)), r2(z), r2(0.7 + rnd() * 0.6)); }
    for (let i = 0; i < 9; i++) { const a = rnd() * 6.283, d = rnd() * l.r * 0.5; props.ducks.push(r2(l.x + Math.cos(a) * d), l.level, r2(l.z + Math.sin(a) * d), r2(rnd() * 6.283)); }
  }
  for (let w = 0, tries = 0; w < 18 && tries < 2000; tries++) { // dry-stone walls: straight runs across open land
    const x = x0 + rnd() * (x1 - x0), z = z0 + rnd() * (z1 - z0), ang = rnd() * 3.14, len = 60 + rnd() * 140; const pts = [];
    for (let d = 0; d <= len; d += 2) { const px = x + Math.cos(ang) * d, pz = z + Math.sin(ang) * d; if (!free(px, pz, 9) || conformed(px, pz) < 2) break; pts.push(r2(px), r2(conformed(px, pz)), r2(pz)); }
    if (pts.length >= 30) { props.walls.push(pts); w++; }
  }
  for (const [id, sm] of Object.entries(sampled)) { // post-and-rail fences beside the road where it crosses pasture
    let run = []; const flush = () => { if (run.length >= 24) props.fences.push(run); run = []; };
    for (let k = 1; k < sm.x.length - 1; k++) {
      const tx = sm.x[k + 1] - sm.x[k - 1], tz = sm.z[k + 1] - sm.z[k - 1], l = Math.hypot(tx, tz); const off = (world.edges.find((e) => e.id === id).width / 2) + 4.5;
      const px = sm.x[k] - (tz / l) * off, pz = sm.z[k] + (tx / l) * off;
      if (pasture(px, pz) && !inLake(px, pz, 5)) run.push(r2(px), r2(conformed(px, pz)), r2(pz)); else flush();
    }
    flush();
  }
  const hb = world.harbour; if (hb) for (let i = 0; i < 7; i++) { const a = rnd() * 6.283, d = 40 + rnd() * hb.radius; const x = hb.center[0] + Math.cos(a) * d, z = hb.center[1] + Math.sin(a) * d; if (natural(x, z) < -2) props.boats.push(r2(x), 0.4, r2(z), r2(rnd() * 6.283), Math.floor(rnd() * 3)); }

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
    roads, routes, segments: world.segments, houses, trees, landmarks, lakes, props,
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
