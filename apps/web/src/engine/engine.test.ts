// Integration: engine + simulated trainer running whole workouts at 60x speed (plan 12).
import { describe, expect, it } from 'vitest';
import type { Step } from '@veloworld/shared';
import { RideEngine, type Command, type EngineEvent } from './core';
import { SimulatedTrainer } from '../devices/SimulatedTrainer';

function ride(steps: Step[], seconds: number, opts: { cadence?: (t: number) => number; mode?: 'workout' | 'ftpRamp' | 'startPower'; effort?: (t: number) => number; startPowerW?: number } = {}) {
  const sim = new SimulatedTrainer({ noise: false, clock: () => 0, lagS: 0.8 });
  const engine = new RideEngine({ mode: opts.mode ?? 'workout', steps, ftp: 250, massKg: 88, autoPauseS: 3, startPowerW: opts.startPowerW });
  const cmds: { t: number; c: Command }[] = []; const events: EngineEvent[] = []; let t = 0; let last = { powerW: 0, cadenceRpm: 0 };
  engine.onCommand = (c) => { cmds.push({ t, c }); if (c.kind === 'power') void sim.setTargetPower(c.w); else if (c.kind === 'sim') void sim.setSimulation({ gradePct: c.gradePct, crr: 0.004, cwa: 0.5, windMs: 0 }); else void sim.setSimulation({ gradePct: 0, crr: 0.004, cwa: 0.5, windMs: 0 }); };
  engine.onEvent = (e) => events.push(e);
  sim.onSample((s) => (last = { powerW: s.powerW, cadenceRpm: s.cadenceRpm ?? 0 }));
  for (let i = 0; i < seconds * 20; i++) { t = i / 20; sim.cadence = opts.cadence?.(t) ?? 88; if (opts.effort) sim.effortW = opts.effort(t); if (i % 5 === 0) sim.step(0.25); engine.step(0.05, { powerW: last.powerW, cadenceRpm: last.cadenceRpm, hr: 140 }); }
  return { engine, cmds, events, snap: engine.snapshot() };
}
const steady = (durS: number, pct: number): Step => ({ kind: 'steady', durS, target: { type: 'ftpPct', value: pct } });

describe('workout player with the simulated trainer', () => {
  it('sends each new ERG target 1 s before the step boundary, so the trainer is there on time', () => {
    const { cmds } = ride([steady(60, 60), steady(60, 100)], 70);
    const at = cmds.find((x) => x.c.kind === 'power' && x.c.w === 250)!; expect(at.t).toBeGreaterThanOrEqual(58.9); expect(at.t).toBeLessThan(59.2);
  });
  it('re-sends ramp targets about once per second, never faster (Bluetooth budget)', () => {
    const { cmds } = ride([{ kind: 'ramp', durS: 60, from: { type: 'ftpPct', value: 40 }, to: { type: 'ftpPct', value: 100 } }], 61);
    const power = cmds.filter((x) => x.c.kind === 'power'); expect(power.length).toBeGreaterThan(50); expect(power.length).toBeLessThan(65);
    for (let i = 1; i < power.length; i++) expect(power[i]!.t - power[i - 1]!.t).toBeGreaterThanOrEqual(0.99);
  });
  it('records one sample per second with target and step index (FIT and summary depend on it)', () => {
    const { engine } = ride([steady(30, 60), steady(30, 80)], 62); expect(engine.records).toHaveLength(60); expect(engine.records[45]).toMatchObject({ target: 200, step: 1 });
  });
  it('earns a star when the rider holds the target', () => { const { snap } = ride([steady(120, 80), steady(10, 50)], 135); expect(snap.stars[0]).toBe(true); });
  it('releases ERG under 40 rpm for 3 s so the rider can restart after stalling, then resumes', () => {
    const { events } = ride([steady(120, 120)], 100, { cadence: (t) => (t > 20 && t < 40 ? 30 : 88) });
    expect(events.some((e) => e.kind === 'ergReleased')).toBe(true); expect(events.some((e) => e.kind === 'ergResumed')).toBe(true);
  });
  it('auto-pauses when pedalling stops and resumes on the first pedal stroke (owner decision)', () => {
    const { events, engine } = ride([steady(300, 60)], 60, { cadence: (t) => (t > 20 && t < 35 ? 0 : 88) });
    expect(events.filter((e) => e.kind === 'autoPaused')).toHaveLength(1); expect(events.filter((e) => e.kind === 'resumed')).toHaveLength(1);
    expect(engine.records.length).toBeLessThan(52); // the paused time is not recorded
  });
  it('bias scales the ERG target by 1 % per press within 70–130 %', () => {
    const r = new RideEngine({ mode: 'workout', steps: [steady(60, 100)], ftp: 200, massKg: 80, autoPauseS: 3 }); const cmds: Command[] = []; r.onCommand = (c) => cmds.push(c);
    for (let i = 0; i < 40; i++) r.adjustBias(1); r.step(0.05, { powerW: 200, cadenceRpm: 90, hr: null }); expect(cmds.at(-1)).toEqual({ kind: 'power', w: 260 });
  });
  it('turning ERG off hands control to the rider in slope mode', () => {
    const r = new RideEngine({ mode: 'workout', steps: [steady(60, 100)], ftp: 200, massKg: 80, autoPauseS: 3 }); const cmds: Command[] = []; r.onCommand = (c) => cmds.push(c);
    r.setErg(false); r.step(0.05, { powerW: 200, cadenceRpm: 90, hr: null }); expect(cmds.at(-1)).toEqual({ kind: 'sim', gradePct: 0 });
  });
  it('completes and stops controlling the trainer at the end of the workout', () => { const { events, cmds } = ride([steady(30, 60)], 40); expect(events.at(-1)).toEqual({ kind: 'finished', reason: 'complete' }); expect(cmds.at(-1)!.c).toEqual({ kind: 'sim', gradePct: 0 }); });
  it('ends a ramp test when the rider can no longer hold the step', () => {
    const steps: Step[] = Array.from({ length: 30 }, (_, i) => ({ kind: 'steady' as const, durS: 60, target: { type: 'watts' as const, value: 100 + 20 * i } }));
    const { events, engine } = ride(steps, 1200, { mode: 'ftpRamp', cadence: (t) => (t > 600 ? 30 : 90) }); // rider cracks at 10 min
    expect(events.some((e) => e.kind === 'finished' && e.reason === 'testEnded')).toBe(true); expect(engine.records.length).toBeLessThan(640);
  });
  it('Start Power holds a fixed wattage indefinitely', () => { const { cmds, snap } = ride([], 30, { mode: 'startPower', startPowerW: 180 }); expect(cmds[0]!.c).toEqual({ kind: 'power', w: 180 }); expect(snap.finished).toBe(false); });
});

describe('route riding (Phase 3)', () => {
  // 2 km route: 500 m flat, 1 km at 6 %, 500 m flat — like a designed Velora climb
  const step = 5; const n = 401; const y = Array.from({ length: n }, (_, i) => { const d = i * step; return d < 500 ? 10 : d < 1500 ? 10 + 0.06 * (d - 500) : 70; });
  const route = { id: 'test', step, lengthM: 2000, loop: false, x: Array.from({ length: n }, (_, i) => i * step), y, z: Array(n).fill(0) };
  const run = (opts: { power?: number; up?: number; down?: number; pacers?: number[]; ghost?: number[] } = {}) => {
    const e = new RideEngine({ mode: 'route', steps: [], ftp: 250, massKg: 88, autoPauseS: 3, route, difficultyUpPct: opts.up ?? 100, difficultyDownPct: opts.down ?? 50, pacersWkg: opts.pacers, ghosts: opts.ghost ? [{ label: 'PB', dAt: opts.ghost }] : undefined });
    const cmds: { t: number; g: number }[] = []; let t = 0; e.onCommand = (c) => c.kind === 'sim' && cmds.push({ t, g: c.gradePct });
    for (let i = 0; i < 20 * 1200 && !e.snapshot().finished; i++) { t = i / 20; e.step(0.05, { powerW: opts.power ?? 250, cadenceRpm: 90, hr: 140 }); }
    return { e, cmds, s: e.snapshot() };
  };
  it('sends the climb gradient ahead of the rider so the trainer is in step with the screen (1 s look-ahead)', () => {
    const { cmds, e } = run(); const first6 = cmds.find((c) => c.g >= 5.9)!; const rec = e.records.find((r) => r.t >= first6.t)!;
    expect(rec.distance).toBeLessThan(500); // sent before the rider reaches the foot of the climb
  });
  it('never sends gradient faster than once per second, and only on changes of 0.2 % or more', () => {
    const { cmds } = run(); const live = cmds.slice(0, -1); /* the last one is the end-of-ride release */ for (let i = 1; i < live.length; i++) { expect(live[i]!.t - live[i - 1]!.t).toBeGreaterThanOrEqual(0.99); expect(Math.abs(live[i]!.g - live[i - 1]!.g)).toBeGreaterThanOrEqual(0.2); }
  });
  it('scales the gradient sent by trainer difficulty but keeps speed on the true gradient', () => {
    const half = run({ up: 50 }), full = run({ up: 100 });
    expect(Math.max(...half.cmds.map((c) => c.g))).toBeCloseTo(3, 0); expect(half.e.records.length).toBe(full.e.records.length); // same finishing time
  });
  it('climbs at a physically correct speed: 250 W, 88 kg, 6 % ≈ 15.3 km/h steady (hand calculation: 51.7 N gravity + 3.5 N rolling + 2 N air; plan gate: within 3 %)', () => {
    const { e } = run(); const mid = e.records.filter((r) => r.distance > 1100 && r.distance < 1400); const v = (mid.reduce((a, r) => a + r.speed!, 0) / mid.length) * 3.6;
    expect(v).toBeGreaterThan(15.3 * 0.97); expect(v).toBeLessThan(15.3 * 1.03);
  });
  it('records altitude and gradient for the profile, FIT and summary', () => { const { e } = run(); const r = e.records.find((x) => x.distance > 1000)!; expect(r.alt).toBeGreaterThan(30); expect(r.grade).toBeCloseTo(6, 0); });
  it('finishes a point-to-point route at its end', () => expect(run().s.finished).toBe(true));
  it('runs a pacer on the same physics: a stronger pacer pulls ahead', () => { const { s } = run({ power: 200, pacers: [3.5] }); expect(s.pacers[0]!.gapM).toBeGreaterThan(0); });
  it('shows the gap to your ghost in seconds (negative = you are ahead)', () => {
    const slowGhost = Array.from({ length: 1500 }, (_, t) => t * 2); const { s } = run({ ghost: slowGhost }); expect(s.ghosts[0]!.gapS).not.toBeNull(); expect(s.ghosts[0]!.gapS!).toBeLessThan(0);
  });
});
