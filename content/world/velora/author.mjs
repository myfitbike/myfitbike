// Authoring script for Velora regions 1–3 (Port Anchor, Saltmarsh Flats, Greenfold Downs). Run: node content/world/velora/author.mjs
// Roads first (plan 7.0): each edge is a smooth path through hand-placed waypoints with a designed elevation profile.
// The world editor (dev only) edits the resulting world.json directly; this script is the starting point.
import { writeFileSync } from 'node:fs';

const r1 = (v) => Math.round(v * 10) / 10;
function pathThrough(wp, spacing = 40) {
  // Centripetal Catmull-Rom (Barry–Goldman, alpha 0.5): no overshoot or loops with unevenly spaced waypoints.
  const P = (i) => { if (i < 0) { const a = wp[0], b = wp[1]; return [2 * a[0] - b[0], 2 * a[1] - b[1]]; } if (i >= wp.length) { const a = wp[wp.length - 1], b = wp[wp.length - 2]; return [2 * a[0] - b[0], 2 * a[1] - b[1]]; } return wp[i]; };
  const lerp = (a, b, ta, tb, t) => { const k = (t - ta) / (tb - ta || 1); return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k]; };
  const dense = [];
  for (let i = 0; i < wp.length - 1; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2); const dt = (a, b) => Math.max(1e-3, Math.hypot(b[0] - a[0], b[1] - a[1]) ** 0.5);
    const t0 = 0, t1 = t0 + dt(p0, p1), t2 = t1 + dt(p1, p2), t3 = t2 + dt(p2, p3);
    for (let s = 0; s < 40; s++) { const t = t1 + ((t2 - t1) * s) / 40;
      const a1 = lerp(p0, p1, t0, t1, t), a2 = lerp(p1, p2, t1, t2, t), a3 = lerp(p2, p3, t2, t3, t); const b1 = lerp(a1, a2, t0, t2, t), b2 = lerp(a2, a3, t1, t3, t); dense.push(lerp(b1, b2, t1, t2, t)); }
  }
  dense.push(wp[wp.length - 1]); const cum = [0]; for (let i = 1; i < dense.length; i++) cum.push(cum[i - 1] + Math.hypot(dense[i][0] - dense[i - 1][0], dense[i][1] - dense[i - 1][1]));
  const L = cum.at(-1), n = Math.max(2, Math.round(L / spacing)), out = []; let j = 0;
  for (let k = 0; k <= n; k++) { const d = (L * k) / n; while (j < dense.length - 2 && cum[j + 1] < d) j++; const f = (d - cum[j]) / (cum[j + 1] - cum[j] || 1); out.push({ x: dense[j][0] + (dense[j + 1][0] - dense[j][0]) * f, z: dense[j][1] + (dense[j + 1][1] - dense[j][1]) * f, d }); }
  return { pts: out, L };
}
/** Elevation keypoints [metres, elevation] ('end' allowed), linear between, then vertical curves (window shrinks to 0 at the ends so nodes match exactly). */
function profileFn(keys, L) {
  const k = keys.map(([d, e]) => [d === 'end' ? L : d, e]); const lin = (d) => { if (d <= 0) return k[0][1]; for (let i = 1; i < k.length; i++) if (d <= k[i][0]) { const [d0, e0] = k[i - 1], [d1, e1] = k[i]; return e0 + ((e1 - e0) * (d - d0)) / (d1 - d0 || 1); } return k.at(-1)[1]; };
  return (d) => { const w = Math.min(70, d, L - d); if (w < 1) return lin(d); let s = 0; for (let i = -10; i <= 10; i++) s += lin(d + (i * w) / 10); return s / 21; };
}
const nodes = { PIER: [0, 7600, 3], HE: [1500, 7000, 4], TN: [300, 5600, 12], WG: [-1500, 6900, 4], MJ: [-4300, 6600, 2], MN: [-7000, 5400, 2], GJ: [800, 3800, 100], GN: [2500, 1200, 130] };
// Tangents at plain bends (two roads meeting): both roads leave/arrive along this direction so the bend has no kink.
const tangents = { PIER: [1, 0], HE: [0.62, -0.78], MN: [-0.94, 0.33], GN: [-0.7, -0.7] };
const edges = [];
function edge(id, name, from, to, mid, keys, opts = {}) {
  const A = [nodes[from][0], nodes[from][1]], B = [nodes[to][0], nodes[to][1]], ta = tangents[from], tb = tangents[to];
  const wp = [A, ...(ta ? [[A[0] + ta[0] * 140, A[1] + ta[1] * 140]] : []), ...mid, ...(tb ? [[B[0] - tb[0] * 140, B[1] - tb[1] * 140]] : []), B]; const { pts, L } = pathThrough(wp);
  const prof = profileFn([[0, nodes[from][2]], ...keys, ['end', nodes[to][2]]], L);
  edges.push({ id, name, from, to, points: pts.map((p) => [r1(p.x), r1(prof(p.d)), r1(p.z)]), surface: opts.surface ?? 'asphalt', width: opts.width ?? 6, ...(opts.structure ? { structure: opts.structure } : {}) });
}
// Port Anchor (flat, 0–2 %)
edge('e-promenade', 'Harbour Promenade', 'PIER', 'HE', [[500, 7650], [1000, 7450]], [[700, 3.5]]);
edge('e-harbour-hill', 'Lighthouse Rise', 'HE', 'TN', [[1500, 6500], [1100, 6000]], [[600, 6], [1300, 10]]);
edge('e-oldtown', 'Old Town Lane', 'TN', 'WG', [[-500, 5700], [-1200, 6200]], [[700, 11], [1500, 6]]);
edge('e-seafront', 'Seafront', 'WG', 'PIER', [[-1100, 7400], [-500, 7650]], [[800, 3.5]]);
// Saltmarsh Flats (pan-flat)
edge('e-causeway', 'Lagoon Causeway', 'WG', 'MJ', [[-2200, 7100], [-3200, 7000]], [[900, 3], [2200, 2.2]], { structure: 'causeway' });
edge('e-marsh-north', 'Reedbed Road', 'MJ', 'MN', [[-5000, 5900], [-6000, 5500]], [[1500, 2.4]]);
edge('e-marsh-loop', 'Turbine Loop', 'MN', 'MJ', [[-7800, 6000], [-7600, 7000], [-6500, 7500], [-5300, 7300]], [[1200, 2.2], [3000, 2.5]]);
// Greenfold Downs (punchy 3–8 %)
edge('e-downs-climb', 'Greenfold Ramp', 'TN', 'GJ', [[450, 5000], [700, 4400]], [[300, 14], [1750, 100]]);
edge('e-downs-east', 'Orchard Rollers', 'GJ', 'GN', [[1800, 3300], [2600, 2600], [2700, 1800]], [[600, 92], [1250, 120], [1750, 112], [2550, 138]]);
edge('e-downs-west', 'Stone Circle Road', 'GN', 'GJ', [[1500, 900], [500, 1300], [-200, 2200], [0, 3100]], [[400, 128], [1500, 216], [2000, 196], [3100, 110], [3700, 124]]);

const routes = [
  { id: 'harbour-spin', name: 'Harbour Spin', region: 'port-anchor', loop: true, tags: ['flat', 'short'], description: 'A flat lap of Port Anchor: the promenade, Lighthouse Rise, the old town and back along the seafront. Warm-ups, recovery and first rides.', edges: ['e-promenade', 'e-harbour-hill', 'e-oldtown', 'e-seafront'] },
  { id: 'lagoon-lap', name: 'Lagoon Lap', region: 'saltmarsh', loop: true, tags: ['flat', 'sprint'], description: 'Out over the causeway to the tidal lagoon and the turbine loop, with a sprint between the reed beds.', edges: ['e-promenade', 'e-harbour-hill', 'e-oldtown', 'e-causeway', 'e-marsh-north', 'e-marsh-loop', 'e-causeway:r', 'e-seafront'] },
  { id: 'downs-rollers', name: 'Downs Rollers', region: 'greenfold', loop: true, tags: ['rolling', 'climbs'], description: 'Up the Greenfold Ramp into orchard country, over the rollers and the Stone Circle climb, then a fast run back to the harbour.', edges: ['e-promenade', 'e-harbour-hill', 'e-downs-climb', 'e-downs-east', 'e-downs-west', 'e-downs-climb:r', 'e-oldtown', 'e-seafront'] },
].map((r) => ({ ...r, edges: r.edges.map((e) => ({ id: e.replace(':r', ''), reverse: e.endsWith(':r') })) }));

const world = {
  version: 1, seed: 7071, size: [26000, 18000], name: 'Velora',
  islands: [{ center: [0, 0], radii: [12000, 8000] }, { center: [9500, 7200], radii: [1600, 1200] }],
  lakes: [{ center: [-6300, 6500], radius: 520, level: 1.2, depth: 3 }],
  heightStamps: [{ kind: 'mountain', pos: [2000, 0, 1500], height: 110, radius: 1600 }, { kind: 'mountain', pos: [1000, 0, 1050], height: 120, radius: 800 }, { kind: 'ridge', from: [-7000, -4800], to: [6500, -3800], height: 1300, width: 2400 }, { kind: 'mountain', pos: [-1000, 0, -4600], height: 1100, radius: 2600 }],
  regions: [
    { id: 'port-anchor', name: 'Port Anchor', biome: 'harbour', maxGradePct: 2.5, color: '#c9a77b', polygon: [[-2300, 5500], [2400, 5500], [2600, 8600], [-2300, 8600]] },
    { id: 'saltmarsh', name: 'Saltmarsh Flats', biome: 'marsh', maxGradePct: 1.5, color: '#8fae8a', polygon: [[-9500, 4300], [-2300, 4300], [-2300, 8600], [-9500, 8600]] },
    { id: 'greenfold', name: 'Greenfold Downs', biome: 'farmland', maxGradePct: 9, color: '#9dbb5c', polygon: [[-2300, -300], [4800, -300], [4800, 5500], [-2300, 5500]] },
  ],
  nodes: Object.entries(nodes).map(([id, [x, z, y]]) => ({ id, pos: [x, y, z] })),
  edges, routes,
  segments: [
    { id: 'seg-pier-dash', name: 'Pier Dash', kind: 'sprint', edge: 'e-promenade', from: 200, to: 600 },
    { id: 'seg-lagoon-sprint', name: 'Lagoon Sprint', kind: 'sprint', edge: 'e-marsh-loop', from: 2400, to: 2900 },
    { id: 'seg-greenfold-ramp', name: 'Greenfold Ramp', kind: 'climb', edge: 'e-downs-climb', from: 300, to: 1750 },
    { id: 'seg-stone-circle', name: 'Stone Circle', kind: 'climb', edge: 'e-downs-west', from: 400, to: 1500 },
  ],
  landmarks: [
    { id: 'lighthouse', kind: 'lighthouse', name: 'Striped Lighthouse', pos: [1950, 0, 7750], rot: 0 },
    { id: 'turbines', kind: 'wind-turbines', name: 'Wind Turbines', pos: [-6900, 0, 6400], rot: 0.4 },
    { id: 'stone-circle', kind: 'stone-circle', name: 'Stone Circle', pos: [1050, 0, 980], rot: 0 },
  ],
  towns: [{ center: [-100, 6700], radius: 900, name: 'Port Anchor' }],
};
writeFileSync(new URL('./world.json', import.meta.url), JSON.stringify(world));
console.log(`world.json: ${edges.length} edges, ${routes.length} routes`);
