// Phase 0b spike: shared world-build primitives (seeded noise, road splines, validation, height field).
// Throwaway, but written so Phase 3/4 can lift the ideas: everything is deterministic from the seed.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeNoise2(seed) {
  const rnd = mulberry32(seed);
  const perm = [...Array(256).keys()];
  for (let i = 255; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [perm[i], perm[j]] = [perm[j], perm[i]]; }
  const p = new Uint8Array(512); for (let i = 0; i < 512; i++) p[i] = perm[i & 255];
  const grad = (h, x, y) => { switch (h & 7) { case 0: return x + y; case 1: return -x + y; case 2: return x - y; case 3: return -x - y; case 4: return x; case 5: return -x; case 6: return y; default: return -y; } };
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  const lerp = (a, b, t) => a + t * (b - a);
  return (x, y) => {
    const fx = Math.floor(x), fy = Math.floor(y); const X = fx & 255, Y = fy & 255; x -= fx; y -= fy;
    const u = fade(x), v = fade(y); const a = p[X] + Y, b = p[X + 1] + Y;
    return lerp(lerp(grad(p[a], x, y), grad(p[b], x - 1, y), u), lerp(grad(p[a + 1], x, y - 1), grad(p[b + 1], x - 1, y - 1), u), v) * 0.7;
  };
}
export function fbm(n, x, y, oct = 5) { let s = 0, a = 1, f = 1, norm = 0; for (let i = 0; i < oct; i++) { s += a * n(x * f, y * f); norm += a; a *= 0.5; f *= 2; } return s / norm; }
export const smoothstep = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

// Uniform Catmull-Rom through Vec3 control points [x, elev, z], resampled every `step` metres of 3D arc length.
export function sampleEdge(points, step = 5) {
  const P = (i) => points[Math.max(0, Math.min(points.length - 1, i))];
  const dense = []; const SUB = 16;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    for (let s = 0; s < SUB; s++) {
      const t = s / SUB, t2 = t * t, t3 = t2 * t;
      dense.push([0, 1, 2].map((k) => 0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3)));
    }
  }
  dense.push([...points[points.length - 1]]);
  const cum = [0]; for (let i = 1; i < dense.length; i++) cum.push(cum[i - 1] + Math.hypot(dense[i][0] - dense[i - 1][0], dense[i][1] - dense[i - 1][1], dense[i][2] - dense[i - 1][2]));
  const L = cum[cum.length - 1]; const n = Math.max(1, Math.round(L / step));
  const x = [], y = [], z = [], d = []; let j = 0;
  for (let k = 0; k <= n; k++) {
    const s = (L * k) / n; while (j < dense.length - 2 && cum[j + 1] < s) j++;
    const f = (s - cum[j]) / (cum[j + 1] - cum[j] || 1); const A = dense[j], B = dense[j + 1];
    x.push(A[0] + (B[0] - A[0]) * f); y.push(A[1] + (B[1] - A[1]) * f); z.push(A[2] + (B[2] - A[2]) * f); d.push(s);
  }
  return { x, y, z, d, length: L };
}

// Gradient in percent over each 10 m window (two 5 m samples), rise over horizontal run.
export function gradesPer10m(s) {
  const g = [];
  for (let i = 0; i + 2 < s.x.length; i += 2) {
    const run = Math.hypot(s.x[i + 2] - s.x[i], s.z[i + 2] - s.z[i]);
    g.push(run > 0 ? ((s.y[i + 2] - s.y[i]) / run) * 100 : 0);
  }
  return g;
}

function heading(s, atEnd) {
  const n = s.x.length; const [i, j] = atEnd ? [n - 3, n - 1] : [0, 2];
  return Math.atan2(s.z[j] - s.z[i], s.x[j] - s.x[i]);
}
const angleDiffDeg = (a, b) => { let d = ((b - a) * 180) / Math.PI; while (d > 180) d -= 360; while (d < -180) d += 360; return Math.abs(d); };

export function orient(s, reverse) {
  if (!reverse) return s;
  const L = s.length; return { x: [...s.x].reverse(), y: [...s.y].reverse(), z: [...s.z].reverse(), d: [...s.d].reverse().map((v) => L - v), length: L };
}

// Fails the build on any rule violation (plan 7.0 step 3). Returns a report for the bake.
export function validateWorld(world, sampled) {
  const errors = [], report = { maxGradePct: {}, minRadiusM: {} };
  const region = world.regions[0];
  for (const e of world.edges) {
    const s = sampled[e.id]; const g = gradesPer10m(s);
    const mx = Math.max(...g.map(Math.abs)); report.maxGradePct[e.id] = +mx.toFixed(2);
    if (mx > region.maxGradePct) errors.push(`edge ${e.id}: gradient ${mx.toFixed(1)} % exceeds region limit ${region.maxGradePct} %`);
    let minR = Infinity;
    for (let i = 2; i + 2 < s.x.length; i += 2) { // circumradius of three points 10 m apart
      const ax = s.x[i - 2], az = s.z[i - 2], bx = s.x[i], bz = s.z[i], cx = s.x[i + 2], cz = s.z[i + 2];
      const area2 = Math.abs((bx - ax) * (cz - az) - (bz - az) * (cx - ax));
      if (area2 > 1e-6) minR = Math.min(minR, (Math.hypot(bx - ax, bz - az) * Math.hypot(cx - bx, cz - bz) * Math.hypot(cx - ax, cz - az)) / (2 * area2));
    }
    report.minRadiusM[e.id] = Number.isFinite(minR) ? +minR.toFixed(1) : null;
    if (minR < 6) errors.push(`edge ${e.id}: turn radius ${minR.toFixed(1)} m below 6 m`);
    const nodeOf = (id) => world.nodes.find((n) => n.id === id).pos;
    for (const [end, nodeId] of [[0, e.from], [s.x.length - 1, e.to]]) {
      const np = nodeOf(nodeId); const off = Math.hypot(s.x[end] - np[0], s.y[end] - np[1], s.z[end] - np[2]);
      if (off > 0.01) errors.push(`edge ${e.id}: end ${end ? 'to' : 'from'} is ${off.toFixed(2)} m from node ${nodeId}`);
    }
  }
  for (const r of world.routes) {
    for (let k = 0; k < r.edges.length; k++) {
      if (!r.loop && k === r.edges.length - 1) break;
      const a = r.edges[k], b = r.edges[(k + 1) % r.edges.length];
      const ea = world.edges.find((e) => e.id === a.id), eb = world.edges.find((e) => e.id === b.id);
      const endNode = a.reverse ? ea.from : ea.to, startNode = b.reverse ? eb.to : eb.from;
      if (endNode !== startNode) { errors.push(`route ${r.id}: ${a.id} does not connect to ${b.id}`); continue; }
      const sa = orient(sampled[a.id], a.reverse), sb = orient(sampled[b.id], b.reverse);
      const kink = angleDiffDeg(heading(sa, true), heading(sb, false));
      if (kink > 15) errors.push(`route ${r.id}: kink of ${kink.toFixed(1)}° between ${a.id} and ${b.id}`);
    }
  }
  return { errors, report };
}

// Natural terrain height before conforming to roads.
export function makeHeightFn(world) {
  const n1 = makeNoise2(world.seed), n2 = makeNoise2(world.seed + 1), n3 = makeNoise2(world.seed + 2);
  const isl = world.islands[0];
  return (x, z) => {
    const q = ((x - isl.center[0]) / isl.radii[0]) ** 2 + ((z - isl.center[1]) / isl.radii[1]) ** 2;
    const m = 1 - q + 0.18 * fbm(n2, x / 1400, z / 1400, 3);
    let h = 7 + 6 * fbm(n1, x / 700, z / 700, 5);
    for (const st of world.heightStamps) {
      if (st.kind === 'mountain') {
        const d = Math.hypot(x - st.pos[0], z - st.pos[2]);
        h += st.height * Math.exp(-((d / st.radius) ** 2)) * (1 + 0.15 * fbm(n3, x / 250, z / 250, 4));
      } else if (st.kind === 'ridge') {
        const [ax, az] = st.from, [bx, bz] = st.to; const vx = bx - ax, vz = bz - az;
        const t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / (vx * vx + vz * vz)));
        const d = Math.hypot(x - (ax + vx * t), z - (az + vz * t));
        const ridged = 1 - Math.abs(fbm(n3, x / 900, z / 900, 6));
        h += st.height * Math.exp(-((d / st.width) ** 2)) * (0.55 + 0.6 * ridged * ridged);
      }
    }
    const coast = smoothstep(-0.04, 0.1, m);
    return -22 + (h + 22) * coast;
  };
}

// Spatial hash over road samples for nearest-road queries.
export function makeRoadIndex(sampled, cell = 40) {
  const map = new Map(); const key = (i, j) => i * 100003 + j;
  for (const [id, s] of Object.entries(sampled)) for (let k = 0; k < s.x.length; k++) {
    const kk = key(Math.floor(s.x[k] / cell), Math.floor(s.z[k] / cell));
    if (!map.has(kk)) map.set(kk, []); map.get(kk).push([s.x[k], s.y[k], s.z[k], id, k]);
  }
  return (x, z, maxR = 40) => {
    let best = null, bd = maxR; const ci = Math.floor(x / cell), cj = Math.floor(z / cell), r = Math.ceil(maxR / cell);
    for (let i = ci - r; i <= ci + r; i++) for (let j = cj - r; j <= cj + r; j++) {
      const arr = map.get(key(i, j)); if (!arr) continue;
      for (const p of arr) { const d = Math.hypot(p[0] - x, p[2] - z); if (d < bd) { bd = d; best = p; } }
    }
    return best ? { d: bd, y: best[1], edge: best[3], k: best[4] } : null;
  };
}
