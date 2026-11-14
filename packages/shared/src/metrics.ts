// Ride metrics derived on finish (plan 6.5). Input: one record per second.
import { POWER_ZONE_UPPER } from './index';

export type Sample = { t: number; power: number | null; cadence: number | null; hr: number | null; speed: number | null; distance: number; alt: number | null; grade: number | null; target: number | null; step: number | null };

const rollingMean = (xs: number[], w: number) => { const out: number[] = []; let s = 0; for (let i = 0; i < xs.length; i++) { s += xs[i]!; if (i >= w) s -= xs[i - w]!; if (i >= w - 1) out.push(s / w); } return out; };

/** Normalized power: 30 s rolling mean, raised to 4th power, averaged, 4th root (Coggan). */
export function normalizedPower(power: number[]): number {
  if (power.length < 30) return power.length ? power.reduce((a, b) => a + b, 0) / power.length : 0;
  const r = rollingMean(power, 30); return Math.pow(r.reduce((a, p) => a + p ** 4, 0) / r.length, 0.25);
}
export function bestEfforts(power: number[], durations = [5, 60, 300, 1200, 3600]): Record<number, number | null> {
  const out: Record<number, number | null> = {};
  for (const d of durations) { if (power.length < d) { out[d] = null; continue; } out[d] = Math.round(Math.max(...rollingMean(power, d))); }
  return out;
}
export function timeInZones(power: number[], ftp: number): number[] {
  const z = [0, 0, 0, 0, 0, 0, 0]; for (const p of power) { const i = POWER_ZONE_UPPER.findIndex((u) => p / ftp <= u); z[i]!++; } return z;
}
export type RideSummary = { durationS: number; movingS: number; distanceM: number; avgPower: number; maxPower: number; np: number; if: number; tss: number; kj: number; avgHr: number | null; maxHr: number | null; avgCadence: number | null; avgSpeedKph: number; elevationGainM: number; zones: number[]; best: Record<number, number | null>; ftpUsed: number };

export function summarize(samples: Sample[], ftp: number): RideSummary {
  const power = samples.map((s) => s.power ?? 0); const n = samples.length;
  const np = normalizedPower(power); const IF = ftp ? np / ftp : 0;
  const hrs = samples.map((s) => s.hr).filter((v): v is number => v !== null && v > 0);
  const cads = samples.map((s) => s.cadence).filter((v): v is number => v !== null && v > 0);
  let gain = 0; for (let i = 1; i < n; i++) { const a = samples[i - 1]!.alt, b = samples[i]!.alt; if (a !== null && b !== null && b > a) gain += b - a; }
  const dist = n ? samples[n - 1]!.distance : 0; const moving = samples.filter((s) => (s.power ?? 0) > 0 || (s.speed ?? 0) > 0.3).length;
  return {
    durationS: n, movingS: moving, distanceM: dist, avgPower: n ? Math.round(power.reduce((a, b) => a + b, 0) / n) : 0, maxPower: n ? Math.max(...power) : 0,
    np: Math.round(np), if: +IF.toFixed(2), tss: Math.round((n * IF * IF * 100) / 3600), kj: Math.round(power.reduce((a, b) => a + b, 0) / 1000),
    avgHr: hrs.length ? Math.round(hrs.reduce((a, b) => a + b, 0) / hrs.length) : null, maxHr: hrs.length ? Math.max(...hrs) : null,
    avgCadence: cads.length ? Math.round(cads.reduce((a, b) => a + b, 0) / cads.length) : null, avgSpeedKph: moving ? +((dist / moving) * 3.6).toFixed(1) : 0,
    elevationGainM: Math.round(gain), zones: timeInZones(power, ftp), best: bestEfforts(power), ftpUsed: ftp,
  };
}
/** FTP tests (plan 6.4). */
export const ftpFromRamp = (power: number[]) => Math.round(0.75 * (bestEfforts(power, [60])[60] ?? 0));
export const ftpFrom20min = (avgPower20: number) => Math.round(0.95 * avgPower20);
