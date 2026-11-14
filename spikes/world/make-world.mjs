// Authoring helper for the Phase 0b slice: writes world.json. Stands in for the world editor
// (Phase 3), which will replace hand-run scripts like this one.
import { writeFileSync } from 'node:fs';

const A = 1050, B = 480; // loop is an ellipse, ~4.98 km round
const r2 = (v) => Math.round(v * 100) / 100;

// Control points every ~50 m along the ellipse between angles t0..t1, elevation from a profile of distance.
function ellipseEdge(t0, t1, spacing, elev) {
  const N = 6000, dense = []; let L = 0, prev = null;
  for (let i = 0; i <= N; i++) {
    const t = t0 + ((t1 - t0) * i) / N; const p = [A * Math.cos(t), B * Math.sin(t)];
    if (prev) L += Math.hypot(p[0] - prev[0], p[1] - prev[1]); dense.push([p[0], p[1], L]); prev = p;
  }
  const n = Math.round(L / spacing), out = []; let j = 0;
  for (let k = 0; k <= n; k++) {
    const d = (L * k) / n; while (j < dense.length - 2 && dense[j + 1][2] < d) j++;
    const a = dense[j], b = dense[j + 1]; const f = (d - a[2]) / (b[2] - a[2] || 1);
    out.push([r2(a[0] + (b[0] - a[0]) * f), r2(elev(d, L)), r2(a[1] + (b[1] - a[1]) * f)]);
  }
  return out;
}

// North side: flat with a barely-there swell (max ~0.4 %).
const north = ellipseEdge(Math.PI, 2 * Math.PI, 50, (d, L) => 10 + 3 * Math.sin((Math.PI * d) / L));
// South side: 250 m flat, 1 km at 6 % (+60 m), 100 m summit, 900 m descent, flat run-in.
const southProfile = (d) => d < 250 ? 10 : d < 1250 ? 10 + 0.06 * (d - 250) : d < 1350 ? 70 : d < 2250 ? 70 - (60 / 900) * (d - 1350) : 10;
// Vertical curves: average the profile over a 120 m window so grade changes are gradual.
const smoothed = (d) => { let s = 0; for (let k = -12; k <= 12; k++) s += southProfile(d + k * 5); return s / 25; };
const south = ellipseEdge(0, Math.PI, 50, (d) => smoothed(d));
const summit = south[Math.round(1300 / 50)];

const spur = [[1050, 10, 0], [1110, 10, -4], [1200, 10.4, -18], [1300, 10.9, -36], [1420, 11.4, -52], [1540, 11.8, -60], [1650, 12, -62]];

const world = {
  version: 1,
  seed: 20261114,
  size: [14000, 14000],
  islands: [{ center: [0, -1150], radii: [5600, 2050] }],
  heightStamps: [
    { kind: 'mountain', pos: [summit[0], 0, summit[2] + 40], height: 62, radius: 620 },
    { kind: 'ridge', from: [-4200, -3700], to: [3600, -3300], height: 720, width: 950 },
    { kind: 'mountain', pos: [1800, 0, -2600], height: 380, radius: 900 },
  ],
  regions: [{ id: 'slice', name: 'Port Anchor (slice)', biome: 'temperate', maxGradePct: 8,
    polygon: [[-1900, -1100], [1900, -1100], [1900, 1250], [-1900, 1250]] }],
  nodes: [
    { id: 'n-west', pos: [-1050, 10, 0] },
    { id: 'n-east', pos: [1050, 10, 0] },
    { id: 'n-view', pos: [1650, 12, -62] },
  ],
  edges: [
    { id: 'e-north', from: 'n-west', to: 'n-east', points: north, surface: 'asphalt', width: 6 },
    { id: 'e-south', from: 'n-east', to: 'n-west', points: south, surface: 'asphalt', width: 6 },
    { id: 'e-spur', from: 'n-east', to: 'n-view', points: spur, surface: 'asphalt', width: 5 },
  ],
  routes: [{ id: 'slice-loop', name: 'Slice Loop', edges: [{ id: 'e-north', reverse: false }, { id: 'e-south', reverse: false }], loop: true }],
  segments: [{ id: 'seg-hill', kind: 'climb', edge: 'e-south', from: 250, to: 1250 }],
  landmarks: [{ id: 'lighthouse', kind: 'lighthouse', pos: [-1320, 0, 790], rot: 0 }],
  town: { center: [-1180, 330], radius: 330 },
  lakes: [{ center: [380, -650], radius: 140, level: 7.2, depth: 4 }], // beside the north road: ride along the shore
  harbour: { center: [-1150, 1000], radius: 260 },
};
writeFileSync(new URL('./world.json', import.meta.url), JSON.stringify(world, null, 1));
console.log(`world.json written: north ${north.length} pts, south ${south.length} pts, summit at ${summit}`);
