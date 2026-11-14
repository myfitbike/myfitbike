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
export function steadySpeed(powerW: number, gradePct: number, p: PhysicsParams, altM = 0): number {
  let v = 5; for (let i = 0; i < 20000; i++) v = stepSpeed(v, powerW, gradePct, 0.05, altM, p); return v;
}
