// FTMS trainer (primary path for the Flux 2). Commands resolve only on the control-point indication (plan 5.3).
import { CommandQueue, withTimeout } from './commandQueue';
import { encode, OP, parseControlPointResponse, parseFeature, parseIndoorBikeData, parseRange, parseSpinDownStatus, parseSpinDownTargets, RESULT, MACHINE_STATUS, type FtmsFeatures, type SpinDownStatus } from './codecs/ftms';
import { clampGrade, valueOf, type GattChar, type Simulation, type Trainer, type TrainerCaps, type TrainerSample } from './types';

export type FtmsChars = { indoorBikeData: GattChar; controlPoint: GattChar; machineStatus?: GattChar; feature?: GattChar; powerRange?: GattChar; resistanceRange?: GattChar };

export class FtmsError extends Error { constructor(public op: number, public result: number) { super(`FTMS op 0x${op.toString(16)} failed with result ${result}`); } }

export class FtmsTrainer implements Trainer {
  readonly kind = 'ftms' as const;
  caps: TrainerCaps = { erg: true, sim: true, resistance: true, spinDown: false, powerRange: [0, 2000], maxGradePct: 16 };
  features: FtmsFeatures | null = null;
  private listeners = new Set<(s: TrainerSample) => void>();
  private pending: { op: number; resolve: (r: { result: number; params: DataView }) => void } | null = null;
  private queue: CommandQueue; private resistanceRange: [number, number] = [0, 100];
  onControlLost: () => void = () => {};
  /** Spin-down progress from the trainer (Machine Status 0x14) — drives the calibration panel. */
  onSpinDown: (s: SpinDownStatus) => void = () => {};
  onLog: (m: string) => void = () => {};

  constructor(readonly name: string, private chars: FtmsChars, private readonly clock: () => number = () => performance.now(), private readonly timeoutMs = 3000) {
    this.queue = new CommandQueue(timeoutMs, 2, (m) => this.onLog(m));
  }

  async init(): Promise<void> {
    const { feature, powerRange, resistanceRange } = this.chars;
    if (feature?.readValue) { this.features = parseFeature(await feature.readValue()); const f = this.features; this.caps = { ...this.caps, erg: f.targetPower, sim: f.simulation, resistance: f.targetResistance, spinDown: f.spinDown }; }
    if (powerRange?.readValue) { const [lo, hi] = parseRange(await powerRange.readValue()); this.caps.powerRange = [lo, hi]; }
    if (resistanceRange?.readValue) { const [lo, hi] = parseRange(await resistanceRange.readValue(), 10); this.resistanceRange = [lo, hi]; }
    this.chars.indoorBikeData.addEventListener('characteristicvaluechanged', (e) => this.onBikeData(valueOf(e)));
    this.chars.controlPoint.addEventListener('characteristicvaluechanged', (e) => this.onIndication(valueOf(e)));
    this.chars.machineStatus?.addEventListener('characteristicvaluechanged', (e) => { const v = valueOf(e); if (v.getUint8(0) === MACHINE_STATUS.controlLost) this.onControlLost(); const sd = parseSpinDownStatus(v); if (sd) this.onSpinDown(sd); });
    await this.chars.indoorBikeData.startNotifications(); await this.chars.controlPoint.startNotifications(); await this.chars.machineStatus?.startNotifications();
    await this.command(encode.requestControl()); await this.command(encode.start()).catch(() => undefined); // some trainers reject start when already running
  }

  onSample(cb: (s: TrainerSample) => void) { this.listeners.add(cb); return () => this.listeners.delete(cb); }
  async setTargetPower(w: number) { const [lo, hi] = this.caps.powerRange; await this.command(encode.targetPower(Math.max(lo, Math.min(hi, w)))); }
  async setSimulation(p: Simulation) { await this.command(encode.simulation({ ...p, gradePct: clampGrade(p.gradePct, [-10, this.caps.maxGradePct]) })); }
  async setResistance(pct: number) { const [lo, hi] = this.resistanceRange; await this.command(encode.targetResistance(lo + ((hi - lo) * Math.max(0, Math.min(100, pct))) / 100)); }
  /** Starts calibration; resolves with the speed window to pedal past (null if the trainer doesn't say). */
  async startSpinDown() { return parseSpinDownTargets(await this.command(encode.spinDownStart())); }
  async disconnect() { this.listeners.clear(); }
  /** Re-request control and re-send state after a reconnect (plan 5.1). */
  async regainControl() { await this.command(encode.requestControl()); }

  private onBikeData(dv: DataView) {
    const r = parseIndoorBikeData(dv); if (r.trailingBytes !== 0) this.onLog(`indoor bike data length mismatch (${r.trailingBytes})`);
    const s: TrainerSample = { t: this.clock(), powerW: r.powerW ?? 0, cadenceRpm: r.cadenceRpm, speedKph: r.speedKph };
    for (const l of this.listeners) l(s);
  }
  private onIndication(dv: DataView) {
    const r = parseControlPointResponse(dv); if (!r || !this.pending || r.op !== this.pending.op) return;
    const p = this.pending; this.pending = null; p.resolve({ result: r.result, params: r.params });
  }
  /** Write and wait for the matching indication. On "control not permitted", re-request control once and retry. */
  private command(bytes: Uint8Array<ArrayBuffer>, retried = false): Promise<DataView> {
    const op = bytes[0]!;
    return this.queue.run(`ftms 0x${op.toString(16)}`, async () => {
      const result = new Promise<{ result: number; params: DataView }>((resolve) => { this.pending = { op, resolve }; });
      await this.chars.controlPoint.writeValueWithResponse(bytes);
      return withTimeout(result, this.timeoutMs, `indication for 0x${op.toString(16)}`);
    }).then(async ({ result: res, params }) => {
      if (res === RESULT.success) return params;
      if (res === RESULT.controlNotPermitted && !retried && op !== OP.requestControl) { await this.command(encode.requestControl(), true); return this.command(bytes, true); }
      throw new FtmsError(op, res);
    });
  }
}
