// Road splines: uniform Catmull-Rom through control points, resampled every `step` metres of 3D arc length.
import type { Vec3 } from './types';
export type Sampled = { x: number[]; y: number[]; z: number[]; d: number[]; length: number };

export function sampleEdge(points: Vec3[], step = 5): Sampled {
  const P = (i: number) => points[Math.max(0, Math.min(points.length - 1, i))]!; const dense: Vec3[] = []; const SUB = 12;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    for (let s = 0; s < SUB; s++) { const t = s / SUB, t2 = t * t, t3 = t2 * t; dense.push([0, 1, 2].map((k) => 0.5 * (2 * p1[k]! + (-p0[k]! + p2[k]!) * t + (2 * p0[k]! - 5 * p1[k]! + 4 * p2[k]! - p3[k]!) * t2 + (-p0[k]! + 3 * p1[k]! - 3 * p2[k]! + p3[k]!) * t3)) as Vec3); }
  }
  dense.push([...points[points.length - 1]!] as Vec3);
  const cum = [0]; for (let i = 1; i < dense.length; i++) cum.push(cum[i - 1]! + Math.hypot(dense[i]![0] - dense[i - 1]![0], dense[i]![1] - dense[i - 1]![1], dense[i]![2] - dense[i - 1]![2]));
  const L = cum[cum.length - 1]!; const n = Math.max(1, Math.round(L / step)); const out: Sampled = { x: [], y: [], z: [], d: [], length: L }; let j = 0;
  for (let k = 0; k <= n; k++) {
    const s = (L * k) / n; while (j < dense.length - 2 && cum[j + 1]! < s) j++;
    const f = (s - cum[j]!) / (cum[j + 1]! - cum[j]! || 1); const A = dense[j]!, B = dense[j + 1]!;
    out.x.push(A[0] + (B[0] - A[0]) * f); out.y.push(A[1] + (B[1] - A[1]) * f); out.z.push(A[2] + (B[2] - A[2]) * f); out.d.push(s);
  }
  return out;
}
export function orient(s: Sampled, reverse: boolean): Sampled {
  if (!reverse) return s; const L = s.length; return { x: [...s.x].reverse(), y: [...s.y].reverse(), z: [...s.z].reverse(), d: [...s.d].reverse().map((v) => L - v), length: L };
}
/** Gradient in percent over 10 m windows: rise over horizontal run. */
export function gradesPer10m(s: Sampled): number[] {
  // run = horizontal distance travelled along the road (not the chord), so hairpins don't read steeper than they are
  const g: number[] = []; for (let i = 0; i + 2 < s.x.length; i += 2) { const run = Math.hypot(s.x[i + 1]! - s.x[i]!, s.z[i + 1]! - s.z[i]!) + Math.hypot(s.x[i + 2]! - s.x[i + 1]!, s.z[i + 2]! - s.z[i + 1]!); g.push(run > 0 ? ((s.y[i + 2]! - s.y[i]!) / run) * 100 : 0); } return g;
}
