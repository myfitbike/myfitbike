// Tacx FE-C over BLE fallback (old Flux firmware only). Writes are fire-and-forget at the protocol level.
import { CommandQueue } from './commandQueue';
import { encode, parse } from './codecs/fec';
import { clampGrade, valueOf, type GattChar, type Simulation, type Trainer, type TrainerSample } from './types';

export class FecTrainer implements Trainer {
  readonly kind = 'fec' as const;
  readonly caps = { erg: true, sim: true, resistance: true, spinDown: false, powerRange: [0, 2000] as [number, number], maxGradePct: 16 };
  private listeners = new Set<(s: TrainerSample) => void>(); private queue = new CommandQueue();
  private last: { speedKph?: number; cadenceRpm?: number } = {};
  constructor(readonly name: string, private rx: GattChar, private tx: GattChar, private readonly clock: () => number = () => performance.now()) {}
  async init(userKg: number, bikeKg: number) {
    this.rx.addEventListener('characteristicvaluechanged', (e) => {
      const r = parse(valueOf(e)); if (!r || !r.checksumOk) return;
      if (r.page === 0x10 && r.speedKph !== undefined) this.last.speedKph = r.speedKph;
      if (r.page === 0x19) { this.last.cadenceRpm = r.cadenceRpm; const s = { t: this.clock(), powerW: r.powerW ?? 0, ...this.last }; for (const l of this.listeners) l(s); }
    });
    await this.rx.startNotifications(); await this.write(encode.userConfig(userKg, bikeKg));
  }
  onSample(cb: (s: TrainerSample) => void) { this.listeners.add(cb); return () => this.listeners.delete(cb); }
  setTargetPower(w: number) { return this.write(encode.targetPower(w)); }
  setSimulation(p: Simulation) { return this.write(encode.trackResistance(clampGrade(p.gradePct), p.crr)); }
  setResistance(pct: number) { return this.write(encode.basicResistance(pct)); }
  async disconnect() { this.listeners.clear(); }
  private write(b: Uint8Array<ArrayBuffer>) { return this.queue.run('fe-c write', () => this.tx.writeValueWithResponse(b)); }
}
