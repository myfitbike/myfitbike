// Speed model (plan 6.1 / D10): our own physics from power, never the trainer's flywheel speed.
export type PhysicsParams = { massKg: number; crr?: number; cda?: number; eff?: number; windMs?: number };
export const G = 9.81;
export const airDensity = (altM: number) => 1.225 * Math.exp(-altM / 8434);
/** One explicit step. Raw power in (no smoothing), speed out in m/s; downhill capped at 90 km/h. */
export function stepSpeed(v: number, powerW: number, gradePct: number, dt: number, altM: number, p: PhysicsParams): number {
  const { massKg: m, crr = 0.004, cda = 0.32, eff = 0.975, windMs = 0 } = p; const th = Math.atan(gradePct / 100);
  const fGrav = m * G * Math.sin(th), fRoll = m * G * Math.cos(th) * crr, rel = v + windMs, fAero = 0.5 * airDensity(altM) * cda * rel * Math.abs(rel);
  const a = ((powerW * eff) / Math.max(v, 0.5) - fGrav - fRoll - fAero) / m;
  return Math.min(25, Math.max(0, v + a * dt));
}
/** Steady-state speed for a given power and grade (used by tests and "estimated time" on route cards). */
// The equilibrium stepSpeed settles to: drive force P·eff / max(v, 0.5) equals gravity + rolling + aero drag.
// Net force falls as speed rises, so bisection finds it directly (was 20 000 simulated steps per call — ~0.3 ms each,
// which made route cards' estimated times cost over a second).
export function steadySpeed(powerW: number, gradePct: number, p: PhysicsParams, altM = 0): number {
  const { massKg: m, crr = 0.004, cda = 0.32, eff = 0.975, windMs = 0 } = p; const th = Math.atan(gradePct / 100); const k = 0.5 * airDensity(altM) * cda;
  const net = (v: number) => { const rel = v + windMs; return (powerW * eff) / Math.max(v, 0.5) - m * G * Math.sin(th) - m * G * Math.cos(th) * crr - k * rel * Math.abs(rel); };
  if (net(25) >= 0) return 25; // capped, as in stepSpeed
  if (net(0.5) <= 0) { // too steep to move at walking pace: settles where net force is zero below 0.5 m/s, or stops
    let lo = 0, hi = 0.5; if (net(0) <= 0) return 0; for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (net(mid) > 0) lo = mid; else hi = mid; } return lo;
  }
  let lo = 0.5, hi = 25; for (let i = 0; i < 48; i++) { const mid = (lo + hi) / 2; if (net(mid) > 0) lo = mid; else hi = mid; } return (lo + hi) / 2;
}
