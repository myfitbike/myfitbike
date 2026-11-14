// Simulated trainer (plan 5.6): responds to ERG, gradient and resistance like a real one, including lag.
// All development, automated tests and demos run on it. Driven by on-screen/keyboard controls or a script.
import type { Simulation, Trainer, TrainerSample } from './types';

export type SimScript = (tSec: number) => { powerW?: number; cadenceRpm?: number };

export class SimulatedTrainer implements Trainer {
  readonly kind = 'simulator' as const; readonly name = 'Demo trainer';
  readonly caps = { erg: true, sim: true, resistance: true, spinDown: false, powerRange: [0, 2000] as [number, number], maxGradePct: 16 };
  /** What the "rider" is putting in: effort in watts on the flat and cadence. Changed by controls or a script. */
  effortW = 150; cadence = 85;
  private mode: 'free' | 'erg' | 'sim' | 'resistance' = 'free'; private target = 0; private grade = 0; private resistancePct = 0;
  private power = 0; private listeners = new Set<(s: TrainerSample) => void>(); private timer: ReturnType<typeof setInterval> | null = null; private t0 = 0;
  constructor(private readonly opts: { hz?: number; lagS?: number; script?: SimScript; clock?: () => number; noise?: boolean } = {}) {}
  get state() { return { mode: this.mode, target: this.target, grade: this.grade, resistancePct: this.resistancePct }; }
  start() { this.t0 = this.now(); const dt = 1 / (this.opts.hz ?? 4); this.timer = setInterval(() => this.step(dt), dt * 1000); }
  /** Advance the model by dt seconds (used directly by tests for determinism). */
  step(dt: number) {
    const t = (this.now() - this.t0) / 1000; const s = this.opts.script?.(t); if (s?.powerW !== undefined) this.effortW = s.powerW; if (s?.cadenceRpm !== undefined) this.cadence = s.cadenceRpm;
    let want: number;
    if (this.cadence < 5) want = 0;
    else if (this.mode === 'erg') want = this.cadence < 40 ? this.target * (this.cadence / 40) : this.target; // ERG cannot hold power when the rider stalls
    else if (this.mode === 'sim') want = this.effortW * (1 + Math.max(-0.6, this.grade * 0.09)); // steeper feels harder: rider pushes more to hold cadence
    else if (this.mode === 'resistance') want = this.effortW * (0.7 + this.resistancePct / 100);
    else want = this.effortW;
    const k = 1 - Math.exp(-dt / (this.opts.lagS ?? 1.2)); this.power += (want - this.power) * k; // trainer response lag
    const noise = this.opts.noise === false ? 0 : (Math.random() - 0.5) * 6;
    const powerW = Math.max(0, Math.round(this.power + noise));
    const sample: TrainerSample = { t: this.now(), powerW, cadenceRpm: this.cadence, speedKph: powerW > 0 ? 3.6 * Math.cbrt(powerW / 0.24) : 0 };
    for (const l of this.listeners) l(sample);
  }
  onSample(cb: (s: TrainerSample) => void) { this.listeners.add(cb); return () => this.listeners.delete(cb); }
  async setTargetPower(w: number) { this.mode = 'erg'; this.target = w; }
  async setSimulation(p: Simulation) { this.mode = 'sim'; this.grade = Math.max(-10, Math.min(16, p.gradePct)); }
  async setResistance(pct: number) { this.mode = 'resistance'; this.resistancePct = pct; }
  async disconnect() { if (this.timer) clearInterval(this.timer); this.listeners.clear(); }
  private now() { return (this.opts.clock ?? (() => performance.now()))(); }
}
