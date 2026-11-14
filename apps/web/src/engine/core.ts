// Ride engine core (plan 6). Pure and deterministic: the worker calls step() at 20 Hz; tests call it at 60x speed.
// Owns the ride clock, physics, workout player, trainer commands, auto-pause, compliance and the per-second record.
import { blockAt, durationOf, earnsStar, flatten, stepSpeed, targetAt, type Block, type Sample, type Step } from '@veloworld/shared';

export type RideMode = 'workout' | 'startPower' | 'startSlope' | 'ftpRamp' | 'ftp20' | 'route';
/** Compact route data for the worker (from @veloworld/world RouteProfile). */
export type RouteData = { id: string; step: number; lengthM: number; loop: boolean; x: number[]; y: number[]; z: number[] };
export type GhostData = { label: string; dAt: number[] }; // distance (m) at each second of the earlier ride
export type RideConfig = { mode: RideMode; steps: Step[]; ftp: number; massKg: number; autoPauseS: number; startPowerW?: number; startSlopePct?: number; startElapsedS?: number; startDistanceM?: number;
  route?: RouteData; difficultyUpPct?: number; difficultyDownPct?: number; pacersWkg?: number[]; ghosts?: GhostData[]; maxGradePct?: number };
export type Input = { powerW: number | null; cadenceRpm: number | null; hr: number | null };
export type Command = { kind: 'power'; w: number } | { kind: 'sim'; gradePct: number } | { kind: 'release' };
export type EngineEvent = { kind: 'countdown'; inS: number } | { kind: 'stepStart'; i: number } | { kind: 'cue'; text: string } | { kind: 'gearHint' } | { kind: 'ergReleased' } | { kind: 'ergResumed' }
  | { kind: 'autoPaused' } | { kind: 'resumed' } | { kind: 'star'; i: number } | { kind: 'finished'; reason: 'complete' | 'testEnded' };
export type Snapshot = {
  elapsedS: number; workoutS: number; distanceM: number; speedMps: number; paused: boolean; manualPause: boolean; autoPaused: boolean; finished: boolean;
  stepIndex: number; stepCount: number; stepRemainingS: number; targetW: number | null; targetType: string; bias: number; ergOn: boolean; ergReleased: boolean; gearHint: boolean;
  stars: boolean[]; gradePct: number; sentGradePct: number | null; routeD: number; lap: number; altM: number | null; headingRad: number; x: number; z: number;
  pacers: { label: string; d: number; gapM: number; gapS: number }[]; ghosts: { label: string; d: number; gapS: number | null }[]; powerW: number; cadenceRpm: number | null; hr: number | null; totalS: number;
};

const STEP_DT = 0.05;

export class RideEngine {
  readonly blocks: Block[]; readonly totalS: number;
  private t = 0; private workoutT = 0; private dist = 0; private v = 0; private lastRecordT = 0;
  private manualPause = false; private autoPaused = false; private noPedalS = 0; private finished = false;
  private bias = 1; private ergOn = true; private extendLeft = 0;
  private released = false; private lowCadS = 0; private recoverS = 0; private overS = 0; private gearHint = false;
  private lastCmd: Command | null = null; private lastCmdAt = -99; private lastBlock = -1; private countdownFor = -1; private firedCues = new Set<string>();
  private blockSums: { p: number; tg: number; n: number }[]; private stars: boolean[];
  private hrNudgeW = 0; private hrNudgeAt = 0; private lastInput: Input = { powerW: null, cadenceRpm: null, hr: null };
  private testPeak = 0; private testFailS = 0; private grade = 0;
  private sentGrade: number | null = null; private sentGradeAt = -99; private pacers: { label: string; w: number; v: number; d: number }[] = [];
  readonly records: Sample[] = [];
  onCommand: (c: Command) => void = () => {};
  onEvent: (e: EngineEvent) => void = () => {};
  onRecord: (r: Sample) => void = () => {};

  constructor(private readonly cfg: RideConfig) {
    const open = cfg.mode === 'startPower' || cfg.mode === 'startSlope';
    const steps = cfg.mode === 'startPower' ? [{ kind: 'steady' as const, durS: 24 * 3600, target: { type: 'watts' as const, value: cfg.startPowerW ?? 150 } }]
      : cfg.mode === 'startSlope' ? [{ kind: 'steady' as const, durS: 24 * 3600, target: { type: 'slopePct' as const, value: cfg.startSlopePct ?? 2 } }] : cfg.steps;
    this.blocks = flatten(steps); this.totalS = open ? 0 : durationOf(this.blocks);
    this.blockSums = this.blocks.map(() => ({ p: 0, tg: 0, n: 0 })); this.stars = this.blocks.map(() => false);
    this.pacers = (cfg.pacersWkg ?? []).map((wkg) => ({ label: `Pacer ${wkg.toFixed(1)} W/kg`, w: wkg * (cfg.massKg - 8), v: 0, d: 0 }));
    if (cfg.startElapsedS) { this.t = cfg.startElapsedS; this.workoutT = cfg.startElapsedS; this.dist = cfg.startDistanceM ?? 0; this.lastRecordT = Math.floor(cfg.startElapsedS); }
  }

  // ---- controls (plan 6.3) ----
  pause() { this.manualPause = true; } resume() { this.manualPause = false; }
  skipStep() { const b = blockAt(this.blocks, this.workoutT); if (b) { this.workoutT = b.endS; this.extendLeft = 0; } }
  extendStep(s = 60) { this.extendLeft += s; }
  adjustBias(deltaPct: number) { this.bias = Math.min(1.3, Math.max(0.7, Math.round((this.bias + deltaPct / 100) * 100) / 100)); this.lastCmd = null; }
  setErg(on: boolean) { this.ergOn = on; this.lastCmd = null; }
  /** Start Slope: arrows change the locked gradient in 0.5 % steps within the trainer range. */
  adjustSlope(delta: number) { const b = this.blocks[0]; if (this.cfg.mode !== 'startSlope' || !b?.from) return; const v = Math.min(16, Math.max(-2, b.from.value + delta)); b.from = { ...b.from, value: v }; b.to = b.from; this.lastCmd = null; }
  end() { this.finish('complete'); }

  step(dt: number, input: Input): void {
    if (this.finished) return; this.lastInput = input;
    const p = input.powerW ?? 0, cad = input.cadenceRpm ?? 0; const pedalling = cad > 0 || p >= 5; // a coasting flywheel still reports a few watts for a moment
    // Auto-pause / auto-resume in every mode (PLAN 16.9)
    if (pedalling) { this.noPedalS = 0; if (this.autoPaused) { this.autoPaused = false; this.lastCmd = null; this.onEvent({ kind: 'resumed' }); } }
    else if ((this.noPedalS += dt) >= this.cfg.autoPauseS && !this.autoPaused) { this.autoPaused = true; this.onEvent({ kind: 'autoPaused' }); }
    if (this.manualPause || this.autoPaused) { this.v = Math.max(0, this.v - 4 * dt); return; }

    this.t += dt; if (this.extendLeft > 0) this.extendLeft -= dt; else this.workoutT += dt;
    const tg = targetAt(this.blocks, this.workoutT, this.cfg.ftp); const R = this.cfg.route;
    const grade = R ? routeGrade(R, this.dist, 10) : tg.type === 'slopePct' ? tg.value : 0; this.grade = grade; // physics always uses the true gradient (plan 6.2)
    const alt = R ? routePos(R, this.dist).y : 0;
    this.v = stepSpeed(this.v, p, grade, dt, alt, { massKg: this.cfg.massKg }); this.dist += this.v * dt;
    for (const pc of this.pacers) { const g = R ? routeGrade(R, pc.d, 10) : 0; pc.v = stepSpeed(pc.v, pc.w, g, dt, R ? routePos(R, pc.d).y : 0, { massKg: this.cfg.massKg }); pc.d += pc.v * dt; }
    if (R && !R.loop && this.dist >= R.lengthM) { this.dist = R.lengthM; this.record(input); this.finish('complete'); return; }
    if (R && this.cfg.mode === 'route') this.simFromRoute(R);
    if (this.cfg.mode !== 'route') this.player(dt, p, cad, input.hr);
    if (Math.floor(this.t) > this.lastRecordT) { this.lastRecordT = Math.floor(this.t); this.record(input); }
    if (this.totalS && this.workoutT >= this.totalS && this.cfg.mode !== 'ftpRamp' && this.cfg.mode !== 'route') this.finish('complete');
  }

  private player(dt: number, p: number, cad: number, hr: number | null) {
    const b = blockAt(this.blocks, this.workoutT); if (!b) return;
    if (b.i !== this.lastBlock) { if (this.lastBlock >= 0) this.closeBlock(this.lastBlock); this.lastBlock = b.i; this.onEvent({ kind: 'stepStart', i: b.i }); }
    for (const c of b.cues) { const key = `${b.i}:${c.atS}`; if (this.workoutT >= c.atS && !this.firedCues.has(key)) { this.firedCues.add(key); this.onEvent({ kind: 'cue', text: c.text }); } }
    const next = this.blocks[b.i + 1]; const toNext = b.endS - this.workoutT;
    if (next && toNext <= 3 && this.countdownFor !== next.i) { this.countdownFor = next.i; this.onEvent({ kind: 'countdown', inS: 3 }); } // 3 s beep before each interval

    // Target 1 s ahead so the trainer's response lines up with the step boundary (plan 6.3 / 9)
    const ahead = targetAt(this.blocks, Math.min(this.workoutT + 1, b.endS + 0.999), this.cfg.ftp, this.bias);
    const now = targetAt(this.blocks, this.workoutT, this.cfg.ftp, this.bias);
    let cmd: Command;
    if (!this.ergOn || ahead.type === 'free') cmd = { kind: 'sim', gradePct: 0 }; // rider controls power with gears
    else if (ahead.type === 'slopePct') cmd = { kind: 'sim', gradePct: Math.round(ahead.value * 10) / 10 };
    else if (ahead.type === 'hrPct') { // slow controller: nudge ERG 5 W every 15 s toward the HR target
      const want = (ahead.value / 100) * 185; if (hr && this.t - this.hrNudgeAt >= 15) { this.hrNudgeW += hr < want ? 5 : -5; this.hrNudgeAt = this.t; }
      cmd = { kind: 'power', w: Math.max(50, Math.round(this.cfg.ftp * 0.6 + this.hrNudgeW)) };
    } else cmd = { kind: 'power', w: ahead.watts ?? 0 };

    // Stall protection (plan 5.7): below 40 rpm for 3 s in ERG, release; ramp back over 3 s when cadence recovers.
    if (cmd.kind === 'power') {
      if (cad < 40) { this.lowCadS += dt; this.recoverS = 0; } else { this.lowCadS = 0; if (this.released) this.recoverS += dt; }
      if (!this.released && this.lowCadS >= 3) { this.released = true; this.onEvent({ kind: 'ergReleased' }); }
      if (this.released && this.recoverS >= 3) { this.released = false; this.onEvent({ kind: 'ergResumed' }); }
      if (this.released) cmd = this.recoverS > 0 ? { kind: 'power', w: Math.round(cmd.w * (0.5 + 0.5 * (this.recoverS / 3))) } : { kind: 'release' };
      // Gear hint (plan 5.7): power stuck >15 % over target for 10 s means the flywheel is too fast.
      if (now.watts && p > now.watts * 1.15) { this.overS += dt; if (this.overS >= 10 && !this.gearHint) { this.gearHint = true; this.onEvent({ kind: 'gearHint' }); } } else { this.overS = 0; this.gearHint = false; }
    }
    this.send(cmd, b.kind === 'ramp');

    if (now.watts) { const s = this.blockSums[b.i]!; s.p += p * dt; s.tg += now.watts * dt; s.n += dt; }
    if (this.cfg.mode === 'ftpRamp') { // ramp test ends when the rider can no longer hold the step
      this.testPeak = Math.max(this.testPeak, p);
      if (now.watts && (p < now.watts * 0.75 || cad < 50)) this.testFailS += dt; else this.testFailS = 0;
      if (this.testFailS >= 5 && this.workoutT > 120) this.finish('testEnded');
    }
  }
  /** Route riding (plan 6.2): gradient at position + v·1 s, scaled by trainer difficulty, sent on ≥0.2 % change at most 1/s. */
  private simFromRoute(R: RouteData) {
    const ahead = routeGrade(R, this.dist + this.v * 1.0, 10);
    const scaled = ahead >= 0 ? ahead * ((this.cfg.difficultyUpPct ?? 100) / 100) : ahead * ((this.cfg.difficultyDownPct ?? 50) / 100);
    const g = Math.round(Math.max(-10, Math.min(this.cfg.maxGradePct ?? 16, scaled)) * 10) / 10;
    if (this.sentGrade !== null && (Math.abs(g - this.sentGrade) < 0.2 || this.t - this.sentGradeAt < 1)) return;
    this.sentGrade = g; this.sentGradeAt = this.t; this.lastCmd = { kind: 'sim', gradePct: g }; this.onCommand({ kind: 'sim', gradePct: g });
  }
  /** Commands go out only when they change, and at most once per second for the same kind (ramps update each second). */
  private send(cmd: Command, _isRamp: boolean) {
    const last = this.lastCmd; if (last && JSON.stringify(last) === JSON.stringify(cmd)) return;
    if (last && last.kind === cmd.kind && this.t - this.lastCmdAt < 1) return;
    this.lastCmd = cmd; this.lastCmdAt = this.t; this.onCommand(cmd);
  }
  private closeBlock(i: number) { const s = this.blockSums[i]!; if (s.n > 0 && earnsStar(s.p / s.n, s.tg / s.n)) { this.stars[i] = true; this.onEvent({ kind: 'star', i }); } }
  private record(input: Input) {
    const tg = targetAt(this.blocks, this.workoutT, this.cfg.ftp, this.bias); const b = blockAt(this.blocks, this.workoutT);
    const r: Sample = { t: Math.floor(this.t), power: input.powerW, cadence: input.cadenceRpm, hr: input.hr, speed: +this.v.toFixed(2), distance: +this.dist.toFixed(1), alt: this.cfg.route ? +routePos(this.cfg.route, this.dist).y.toFixed(1) : null, grade: +this.grade.toFixed(1), target: tg.watts, step: b ? b.i : null };
    this.records.push(r); this.onRecord(r);
  }
  private finish(reason: 'complete' | 'testEnded') { if (this.finished) return; if (this.lastBlock >= 0) this.closeBlock(this.lastBlock); this.finished = true; this.onCommand({ kind: 'sim', gradePct: 0 }); this.onEvent({ kind: 'finished', reason }); }

  snapshot(): Snapshot {
    const b = blockAt(this.blocks, this.workoutT); const tg = targetAt(this.blocks, this.workoutT, this.cfg.ftp, this.bias);
    return {
      elapsedS: this.t, workoutS: this.workoutT, distanceM: this.dist, speedMps: this.v, paused: this.manualPause || this.autoPaused, manualPause: this.manualPause, autoPaused: this.autoPaused, finished: this.finished,
      stepIndex: b?.i ?? 0, stepCount: this.blocks.length, stepRemainingS: b ? Math.max(0, b.endS - this.workoutT) + Math.max(0, this.extendLeft) : 0, targetW: this.ergOn ? tg.watts : null, targetType: tg.type,
      bias: this.bias, ergOn: this.ergOn, ergReleased: this.released, gearHint: this.gearHint, stars: [...this.stars], gradePct: this.grade, sentGradePct: this.sentGrade, ...this.routeSnap(), powerW: this.lastInput.powerW ?? 0, cadenceRpm: this.lastInput.cadenceRpm, hr: this.lastInput.hr, totalS: this.totalS,
    };
  }
  private routeSnap() {
    const R = this.cfg.route; const pos = R ? routePos(R, this.dist) : null;
    const ghosts = (this.cfg.ghosts ?? []).map((g) => { const tAt = timeAtDistance(g.dAt, this.dist); return { label: g.label, d: g.dAt[Math.min(g.dAt.length - 1, Math.floor(this.t))] ?? 0, gapS: tAt === null ? null : Math.round((this.t - tAt) * 10) / 10 }; });
    const pacers = this.pacers.map((pc) => ({ label: pc.label, d: pc.d, gapM: Math.round(pc.d - this.dist), gapS: Math.round(((pc.d - this.dist) / Math.max(1, pc.v)) * 10) / 10 }));
    return { routeD: R ? (R.loop ? this.dist % R.lengthM : this.dist) : this.dist, lap: R && R.loop ? Math.floor(this.dist / R.lengthM) + 1 : 1, altM: pos ? pos.y : null, headingRad: pos?.h ?? 0, x: pos?.x ?? 0, z: pos?.z ?? 0, ghosts, pacers };
  }
}
/** Position on the route at distance d (wraps for loops). */
export function routePos(R: RouteData, d: number) {
  const L = R.lengthM; const dd = R.loop ? ((d % L) + L) % L : Math.max(0, Math.min(L, d)); const f = dd / R.step; const i = Math.min(R.x.length - 2, Math.floor(f)), t = f - i;
  return { x: R.x[i]! + (R.x[i + 1]! - R.x[i]!) * t, y: R.y[i]! + (R.y[i + 1]! - R.y[i]!) * t, z: R.z[i]! + (R.z[i + 1]! - R.z[i]!) * t, h: Math.atan2(R.z[i + 1]! - R.z[i]!, R.x[i + 1]! - R.x[i]!) };
}
/** Gradient over the next `ahead` metres of road: rise over horizontal distance travelled (not the chord, which overstates hairpins). */
export function routeGrade(R: RouteData, d: number, ahead = 10) { const a = routePos(R, d), b = routePos(R, d + ahead); const dy = b.y - a.y; return (dy / Math.sqrt(Math.max(0.25, ahead * ahead - dy * dy))) * 100; }
/** When did the ghost pass distance d? (seconds into its ride, interpolated) */
export function timeAtDistance(dAt: number[], d: number): number | null {
  if (!dAt.length || dAt[dAt.length - 1]! < d) return null; let lo = 0, hi = dAt.length - 1;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (dAt[mid]! < d) lo = mid + 1; else hi = mid; }
  if (lo === 0) return 0; const a = dAt[lo - 1]!, b = dAt[lo]!; return lo - 1 + (b > a ? (d - a) / (b - a) : 0);
}
export { STEP_DT };
