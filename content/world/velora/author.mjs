// Authoring script for Velora regions 1–3 (Port Anchor, Saltmarsh Flats, Greenfold Downs). Run: node content/world/velora/author.mjs
// Roads first (plan 7.0): each edge is a smooth path through hand-placed waypoints with a designed elevation profile.
// The world editor (dev only) edits the resulting world.json directly; this script is the starting point.
import { writeFileSync } from 'node:fs';

const r1 = (v) => Math.round(v * 10) / 10;
function pathThrough(wp, spacing = 20) {
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
  const k = keys.map(([d, e]) => [d === 'end' ? L : d < 0 ? L + d : d, e]).filter(([d], i, a) => i === 0 || i === a.length - 1 || d < L - 40); const lin = (d) => { if (d <= 0) return k[0][1]; for (let i = 1; i < k.length; i++) if (d <= k[i][0]) { const [d0, e0] = k[i - 1], [d1, e1] = k[i]; return e0 + ((e1 - e0) * (d - d0)) / (d1 - d0 || 1); } return k.at(-1)[1]; };
  return (d) => { const w = Math.min(70, d, L - d); if (w < 1) return lin(d); let s = 0; for (let i = -10; i <= 10; i++) s += lin(d + (i * w) / 10); return s / 21; };
}
const nodes = { PIER: [0, 7600, 3], HE: [1500, 7000, 4], TN: [300, 5600, 12], WG: [-1500, 6900, 4], MJ: [-4300, 6600, 2], MN: [-7000, 5400, 2], GJ: [800, 3800, 100], GN: [2500, 1200, 130],
  // Phase 5 regions
  SB: [6200, 3600, 150], CE: [3600, 7300, 5], CI: [8600, 7000, 4], SV: [1800, -1400, 190], SS: [1500, -5600, 1240], TT: [-4200, 2600, 60], TU: [-4600, -1000, 410],
  WW: [-4200, -4200, 300], FJ: [6400, -1800, 40], FV: [8200, -4600, 330], EC: [-8800, 1800, 80], EM: [-9600, -2400, 200] };
// Tangents at plain bends (two roads meeting): both roads leave/arrive along this direction so the bend has no kink.
// Tangents at plain bends: only the two roads that pass straight through the node follow it (other roads at the node turn freely).
const tangents = {
  PIER: { t: [1, 0], edges: ['e-promenade', 'e-seafront'] }, HE: { t: [0.62, -0.78], edges: ['e-promenade', 'e-harbour-hill'] }, MN: { t: [-0.94, 0.33], edges: ['e-marsh-north', 'e-marsh-loop'] },
  GN: { t: [-0.7, -0.7], edges: ['e-downs-east', 'e-downs-west'] }, TT: { t: [-0.8, -0.6], edges: ['e-tea-road', 'e-tea-climb'] }, EC: { t: [-0.6, -0.8], edges: ['e-canyon-in', 'e-canyon-flats'] },
  EM: { t: [0.5, -0.85], edges: ['e-canyon-flats', 'e-mesa-climb'] }, SV: { t: [0, -1], edges: ['e-solace-valley', 'e-solace-climb'] }, SS: { t: [0, -1], edges: ['e-solace-climb'] },
  FV: { t: [0.6, -0.8], edges: ['e-fjord-climb', 'e-fjord-link'] }, FJ: { t: [-0.3, -0.95], edges: ['e-fjord-shore', 'e-fjord-climb'] },
};
const tan = (node, id) => (tangents[node] && tangents[node].edges.includes(id) ? tangents[node].t : null);
const edges = [];
/** Switchback waypoints climbing from a to b: `n` legs swinging ±w metres across the line (hairpins radius ≥ 6 m after smoothing). */
function zigzag(a, b, n, w) { const out = []; for (let i = 1; i < n; i++) { const t = i / n, side = i % 2 ? 1 : -1; const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz); out.push([a[0] + dx * t + (-dz / L) * w * side, a[1] + dz * t + (dx / L) * w * side]); } return out; }
function edge(id, name, from, to, mid, keys, opts = {}) {
  const A = [nodes[from][0], nodes[from][1]], B = [nodes[to][0], nodes[to][1]], ta = opts.tA ?? tan(from, id), tb = opts.tB ?? tan(to, id);
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

// Stonebridge (walled old town on a hill: cobbled ramps 9–14 %)
edge('e-coast-east', 'East Coast Road', 'HE', 'CE', [[2200, 7350], [2900, 7450]], [[1200, 6]]);
edge('e-stone-climb', 'Stonebridge Ramps', 'CE', 'SB', [[4300, 6700], [4900, 6000], [5400, 5000], [5900, 4300]], [[600, 10], [1600, 40], [2200, 52], [2800, 124], [3300, 130], [3900, 146]], { surface: 'cobble' });
edge('e-stone-ridge', 'Clock Tower Ridge', 'SB', 'GN', [[5200, 3000], [4200, 2200], [3300, 1500]], [[700, 160], [1400, 140], [2300, 152], [3200, 136]]);
// Cinder Isle (volcanic, by causeway): a lollipop rim road that returns to the causeway
edge('e-cinder-causeway', 'Cinder Causeway', 'CE', 'CI', [[4800, 7800], [6600, 7500], [7600, 7100]], [[2000, 3], [3800, 3.5]], { structure: 'causeway' });
edge('e-crater-rim', 'Crater Rim', 'CI', 'CI', [[9300, 6800], [10200, 6400], [10900, 7200], [10300, 8050], [9400, 7700]], [[400, 8], [1900, 95], [2800, 108], [3600, 62], [-500, 8]], { tA: [0.95, -0.3], tB: [-0.95, -0.3] });
// Mount Solace (alpine: ~13 km at ~8 %, 18 hairpins)
edge('e-solace-valley', 'Solace Valley', 'GN', 'SV', [[2300, 600], [2000, -400]], [[900, 160]]);
edge('e-solace-climb', 'Mount Solace', 'SV', 'SS', [[1900, -2000], ...zigzag([1800, -2300], [1550, -5250], 19, 300)], [[600, 215], [-700, 1180]]);
// Tealeaf Terraces (steady 7 km at 5 %)
edge('e-tea-road', 'Tealeaf Road', 'GJ', 'TT', [[-200, 3500], [-1500, 3100], [-3000, 2800]], [[1500, 92], [3200, 70]]);
edge('e-tea-climb', 'Tea Terraces Climb', 'TT', 'TU', [[-4700, 2000], [-4100, 1300], [-4900, 600], [-4200, 0], [-4800, -500]], [[700, 80], [-400, 400]]);
edge('e-tea-descent', 'Waterfall Descent', 'TU', 'MN', [[-5200, -1600], [-6200, -1200], [-6600, 0], [-6900, 1800], [-7200, 3600]], [[1500, 360], [4500, 150], [-1400, 16]]);
// Whisperwood (giant-tree rainforest, constantly undulating)
edge('e-wood-in', 'Fern Gorge', 'TU', 'WW', [[-4100, -1700], [-4700, -2600], [-3900, -3400]], [[800, 390], [1500, 430], [2400, 396], [3300, 330]]);
edge('e-wood-loop', 'Canopy Loop', 'WW', 'WW', [[-3200, -4800], [-3600, -5800], [-4800, -6000], [-5600, -5200], [-5300, -4400]], [[700, 330], [1400, 292], [2200, 342], [3000, 302], [3800, 338], [4600, 296]]);
// Glasswater Fjord (shore road, 6 km at 6 % to a viewpoint; high road over to the summit)
edge('e-fjord-shore', 'Glasswater Shore', 'SB', 'FJ', [[6800, 2600], [7200, 1300], [6900, 0]], [[900, 120], [2000, 72], [3200, 50]]);
edge('e-fjord-climb', 'Viewpoint Climb', 'FJ', 'FV', [[6000, -2600], [6700, -3200], [7100, -3900], [7700, -4300]], [[300, 44], [-250, 324]]);
edge('e-fjord-link', 'High Fjord Road', 'FV', 'SS', [[8900, -5400], [8400, -6600], [6800, -7200], [4800, -7300], [2900, -7000], [1800, -6300]], [[400, 334], [-400, 1225]], { tB: [0, 1] });
// Emberfall Canyon (red desert: false flats, gravel sector, mesa climb ~3.5 km at 6 %)
edge('e-canyon-in', 'Ember Flats', 'MN', 'EC', [[-7700, 4600], [-8300, 3300]], [[1650, 16], [2700, 52]]);
edge('e-canyon-flats', 'Long False Flat', 'EC', 'EM', [[-10200, 1000], [-10800, -200], [-10500, -1500]], [[1200, 100], [2600, 140], [4200, 175]], { surface: 'gravel' });
edge('e-mesa-climb', 'Red Mesa Climb', 'EM', 'TU', [[-9300, -3300], [-8100, -3200], [-6600, -2400], [-5600, -1600]], [[1500, 215], [5000, 415], [-600, 412]]);

const routes = [
  { id: 'harbour-spin', name: 'Harbour Spin', region: 'port-anchor', loop: true, tags: ['flat', 'short'], description: 'A flat lap of Port Anchor: the promenade, Lighthouse Rise, the old town and back along the seafront. Warm-ups, recovery and first rides.', edges: ['e-promenade', 'e-harbour-hill', 'e-oldtown', 'e-seafront'] },
  { id: 'lagoon-lap', name: 'Lagoon Lap', region: 'saltmarsh', loop: true, tags: ['flat', 'sprint'], description: 'Out over the causeway to the tidal lagoon and the turbine loop, with a sprint between the reed beds.', edges: ['e-promenade', 'e-harbour-hill', 'e-oldtown', 'e-causeway', 'e-marsh-north', 'e-marsh-loop', 'e-causeway:r', 'e-seafront'] },
  { id: 'downs-rollers', name: 'Downs Rollers', region: 'greenfold', loop: true, tags: ['rolling', 'climbs'], description: 'Up the Greenfold Ramp into orchard country, over the rollers and the Stone Circle climb, then a fast run back to the harbour.', edges: ['e-promenade', 'e-harbour-hill', 'e-downs-climb', 'e-downs-east', 'e-downs-west', 'e-downs-climb:r', 'e-oldtown', 'e-seafront'] },

  { id: 'cobble-crown', name: 'Cobble Crown', region: 'stonebridge', loop: true, tags: ['climbs', 'cobbles', 'short'], description: 'Along the east coast, up the cobbled ramps of Stonebridge, over the clock-tower ridge and back through the downs.', edges: ['e-promenade', 'e-coast-east', 'e-stone-climb', 'e-stone-ridge', 'e-downs-west', 'e-downs-climb:r', 'e-oldtown', 'e-seafront'] },
  { id: 'tea-trail', name: 'Tea Trail', region: 'tealeaf', loop: true, tags: ['climbing', 'long'], description: 'A steady seven-kilometre climb through misty tea terraces, then a sweeping descent past the waterfalls to the lagoon.', edges: ['e-promenade', 'e-harbour-hill', 'e-downs-climb', 'e-tea-road', 'e-tea-climb', 'e-tea-descent', 'e-marsh-loop', 'e-causeway:r', 'e-seafront'] },
  { id: 'solace-summit', name: 'Solace Summit', region: 'solace', loop: false, tags: ['climb', 'hc', 'challenge'], description: 'The big one: from the valley floor to the summit observatory, thirteen and a half kilometres of hairpins.', edges: ['e-solace-climb'] },
  { id: 'forest-ribbon', name: 'Forest Ribbon', region: 'whisperwood', loop: false, tags: ['rolling', 'technical'], description: 'Into the giant trees through Fern Gorge and round the Canopy Loop under the footbridge.', edges: ['e-wood-in', 'e-wood-loop'] },
  { id: 'fjord-run', name: 'Fjord Run', region: 'glasswater', loop: false, tags: ['mixed', 'climb'], description: 'Along the cold-lit fjord shore, then six kilometres up to the viewpoint above the suspension bridge.', edges: ['e-fjord-shore', 'e-fjord-climb'] },
  { id: 'red-mesa', name: 'Red Mesa', region: 'emberfall', loop: false, tags: ['long', 'gravel'], description: 'Long false flats across the red desert, a gravel sector, then the mesa climb under the natural arch.', edges: ['e-canyon-in', 'e-canyon-flats', 'e-mesa-climb'] },
  { id: 'cinder-rim', name: 'Cinder Rim', region: 'cinder', loop: false, tags: ['climb', 'views'], description: 'Out over the causeway to the volcanic island and once round the crater rim above the lake.', edges: ['e-promenade', 'e-coast-east', 'e-cinder-causeway', 'e-crater-rim'] },
  { id: 'three-peaks', name: 'Three Peaks', region: 'solace', loop: false, tags: ['epic', 'climbs'], description: 'Tea terraces, Mount Solace and the high fjord road in one big day.', edges: ['e-downs-climb', 'e-tea-road', 'e-tea-climb', 'e-wood-in', 'e-wood-loop', 'e-wood-in:r', 'e-tea-climb:r', 'e-tea-road:r', 'e-downs-east', 'e-solace-valley', 'e-solace-climb', 'e-fjord-link:r', 'e-fjord-climb:r'] },
  { id: 'grand-tour', name: 'Grand Tour of Velora', region: 'port-anchor', loop: false, tags: ['epic'], description: 'Every region in one ride: Cinder Isle, Stonebridge, the fjord, the summit, the downs, the tea hills, the rainforest, the canyon and the lagoon, back to the pier.', edges: ['e-promenade', 'e-coast-east', 'e-cinder-causeway', 'e-crater-rim', 'e-cinder-causeway:r', 'e-stone-climb', 'e-fjord-shore', 'e-fjord-climb', 'e-fjord-link', 'e-solace-climb:r', 'e-solace-valley:r', 'e-downs-east:r', 'e-tea-road', 'e-tea-climb', 'e-wood-in', 'e-wood-loop', 'e-wood-in:r', 'e-mesa-climb:r', 'e-canyon-flats:r', 'e-canyon-in:r', 'e-marsh-north:r', 'e-causeway:r', 'e-seafront'] },
].map((r) => ({ ...r, edges: r.edges.map((e) => ({ id: e.replace(':r', ''), reverse: e.endsWith(':r') })) }));

const world = {
  version: 1, seed: 7071, size: [26000, 18000], name: 'Velora',
  islands: [{ center: [0, 0], radii: [12000, 8000] }, { center: [9500, 7200], radii: [1600, 1200] }],
  lakes: [{ center: [-6300, 6500], radius: 520, level: 1.2, depth: 3 }, { center: [9950, 7250], radius: 330, level: 40, depth: 8 }],
  heightStamps: [{ kind: 'mountain', pos: [2000, 0, 1500], height: 110, radius: 1600 }, { kind: 'mountain', pos: [1000, 0, 1050], height: 120, radius: 800 }, { kind: 'mountain', pos: [1600, 0, -5200], height: 1200, radius: 2600 }, { kind: 'ridge', from: [-6000, -6500], to: [9000, -6000], height: 700, width: 1800 }, { kind: 'mountain', pos: [-4500, 0, 300], height: 320, radius: 1800 }, { kind: 'mountain', pos: [-9600, 0, -2600], height: 200, radius: 1300 }, { kind: 'mountain', pos: [9950, 0, 7250], height: 110, radius: 1000 }, { kind: 'mountain', pos: [7600, 0, -4300], height: 360, radius: 1400 }, { kind: 'mountain', pos: [6200, 0, 3600], height: 130, radius: 900 }],
  regions: [
    { id: 'port-anchor', name: 'Port Anchor', biome: 'harbour', maxGradePct: 2.5, color: '#c9a77b', polygon: [[-2300, 5500], [2600, 5500], [2600, 8600], [-2300, 8600]] },
    { id: 'saltmarsh', name: 'Saltmarsh Flats', biome: 'marsh', maxGradePct: 1.5, color: '#8fae8a', polygon: [[-9500, 4300], [-2300, 4300], [-2300, 8600], [-9500, 8600]] },
    { id: 'greenfold', name: 'Greenfold Downs', biome: 'farmland', maxGradePct: 9, color: '#9dbb5c', polygon: [[-2300, -300], [4100, -300], [4100, 5500], [-2300, 5500]] },
    { id: 'stonebridge', name: 'Stonebridge', biome: 'oldtown', maxGradePct: 14.5, color: '#b59a7a', polygon: [[2600, 900], [9000, 900], [9000, 6200], [7200, 6200], [7200, 8600], [2600, 8600], [2600, 5500], [4100, 5500], [4100, 900]] },
    { id: 'cinder', name: 'Cinder Isle', biome: 'volcanic', maxGradePct: 12, color: '#5a524c', polygon: [[7200, 6200], [11800, 6200], [11800, 9000], [7200, 9000]] },
    { id: 'solace', name: 'Mount Solace', biome: 'alpine', maxGradePct: 12.5, color: '#9fb3b8', polygon: [[-1500, -7600], [4100, -7600], [4100, -300], [-1500, -300]] },
    { id: 'tealeaf', name: 'Tealeaf Terraces', biome: 'tea', maxGradePct: 9, color: '#6fae6a', polygon: [[-6500, -1500], [-2300, -1500], [-2300, 4300], [-6500, 4300]] },
    { id: 'whisperwood', name: 'Whisperwood', biome: 'rainforest', maxGradePct: 9, color: '#3f7a4a', polygon: [[-6500, -7600], [-1500, -7600], [-1500, -1500], [-6500, -1500]] },
    { id: 'glasswater', name: 'Glasswater Fjord', biome: 'fjord', maxGradePct: 10, color: '#7f98a6', polygon: [[4100, -7600], [11500, -7600], [11500, 900], [4100, 900]] },
    { id: 'emberfall', name: 'Emberfall Canyon', biome: 'desert', maxGradePct: 9, color: '#c9764a', polygon: [[-12000, -5000], [-6500, -5000], [-6500, 4300], [-12000, 4300]] },
  ],
  nodes: Object.entries(nodes).map(([id, [x, z, y]]) => ({ id, pos: [x, y, z] })),
  edges, routes,
  segments: [
    { id: 'seg-pier-dash', name: 'Pier Dash', kind: 'sprint', edge: 'e-promenade', from: 200, to: 600 },
    { id: 'seg-lagoon-sprint', name: 'Lagoon Sprint', kind: 'sprint', edge: 'e-marsh-loop', from: 2400, to: 2900 },
    { id: 'seg-greenfold-ramp', name: 'Greenfold Ramp', kind: 'climb', edge: 'e-downs-climb', from: 300, to: 1750 },
    { id: 'seg-stone-circle', name: 'Stone Circle', kind: 'climb', edge: 'e-downs-west', from: 400, to: 1500 },
    { id: 'seg-stonebridge-ramps', name: 'Stonebridge Ramps', kind: 'climb', edge: 'e-stone-climb', from: 2200, to: 3900 },
    { id: 'seg-solace', name: 'Mount Solace', kind: 'climb', edge: 'e-solace-climb', from: 0, to: 12500 },
    { id: 'seg-tea', name: 'Tea Terraces', kind: 'climb', edge: 'e-tea-climb', from: 700, to: 6000 },
    { id: 'seg-viewpoint', name: 'Fjord Viewpoint', kind: 'climb', edge: 'e-fjord-climb', from: 500, to: 5500 },
    { id: 'seg-mesa', name: 'Red Mesa', kind: 'climb', edge: 'e-mesa-climb', from: 1500, to: 5000 },
    { id: 'seg-crater', name: 'Crater Rim', kind: 'climb', edge: 'e-crater-rim', from: 400, to: 1900 },
    { id: 'seg-ember-sprint', name: 'Ember Flats Sprint', kind: 'sprint', edge: 'e-canyon-in', from: 300, to: 800 },
  ],
  landmarks: [
    { id: 'lighthouse', kind: 'lighthouse', name: 'Striped Lighthouse', pos: [1950, 0, 7750], rot: 0 },
    { id: 'turbines', kind: 'wind-turbines', name: 'Wind Turbines', pos: [-6900, 0, 6400], rot: 0.4 },
    { id: 'stone-circle', kind: 'stone-circle', name: 'Stone Circle', pos: [1050, 0, 980], rot: 0 },
    { id: 'clock-tower', kind: 'clock-tower', name: 'Clock Tower', pos: [6300, 0, 3450], rot: 0 },
    { id: 'observatory', kind: 'observatory', name: 'Summit Observatory', pos: [1540, 0, -5680], rot: 0 },
    { id: 'tea-estate', kind: 'tea-estate', name: 'Tea Estate', pos: [-4500, 0, 1600], rot: 0 },
    { id: 'canopy-bridge', kind: 'canopy-bridge', name: 'Canopy Footbridge', pos: [-4800, 0, -6000], rot: 0.3 },
    { id: 'suspension-bridge', kind: 'suspension-bridge', name: 'Suspension Bridge', pos: [6600, 0, -900], rot: 1.4 },
    { id: 'rock-arch', kind: 'rock-arch', name: 'Natural Arch', pos: [-8300, 0, -3150], rot: 0.1 },
    { id: 'crater-lake', kind: 'crater', name: 'Crater Lake', pos: [9900, 0, 7200], rot: 0 },
  ],
  towns: [{ center: [-100, 6700], radius: 900, name: 'Port Anchor' }, { center: [6250, 3700], radius: 320, name: 'Stonebridge' }],
};
const len = (e) => { let L = 0; for (let i = 1; i < e.points.length; i++) L += Math.hypot(e.points[i][0] - e.points[i - 1][0], e.points[i][2] - e.points[i - 1][2]); return L; };
for (const sg of world.segments) { const L = len(edges.find((e) => e.id === sg.edge)); if (sg.to > L - 20) sg.to = Math.floor(L - 20); }
writeFileSync(new URL('./world.json', import.meta.url), JSON.stringify(world));
console.log(`world.json: ${edges.length} edges, ${routes.length} routes`);
