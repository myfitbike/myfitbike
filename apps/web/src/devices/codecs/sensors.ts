// Heart Rate (0x2A37), Cycling Speed and Cadence (0x2A5B), Cycling Power (0x2A63). Layouts per GATT Spec Supplement.
export function parseHeartRate(dv: DataView): { bpm: number; rrMs: number[] } {
  const flags = dv.getUint8(0); let o = 1; let bpm: number;
  if (flags & 0x1) { bpm = dv.getUint16(o, true); o += 2; } else { bpm = dv.getUint8(o); o += 1; }
  if (flags & 0x8) o += 2; // energy expended
  const rrMs: number[] = []; if (flags & 0x10) while (o + 1 < dv.byteLength) { rrMs.push(Math.round((dv.getUint16(o, true) * 1000) / 1024)); o += 2; }
  return { bpm, rrMs };
}
export type CrankReading = { revs: number; time1024: number };
export function parseCsc(dv: DataView): { crank?: CrankReading } {
  const flags = dv.getUint8(0); let o = 1;
  if (flags & 0x1) o += 6; // wheel data: ignored, the Flux 2 is direct drive (plan 5.8)
  return flags & 0x2 ? { crank: { revs: dv.getUint16(o, true), time1024: dv.getUint16(o + 2, true) } } : {};
}
export function parseCyclingPower(dv: DataView): { powerW: number; crank?: CrankReading } {
  const flags = dv.getUint16(0, true); const powerW = dv.getInt16(2, true); let o = 4;
  if (flags & 0x1) o += 1; // pedal power balance
  if (flags & 0x4) o += 2; // accumulated torque
  if (flags & 0x10) o += 6; // wheel revolution data
  const crank = flags & 0x20 ? { revs: dv.getUint16(o, true), time1024: dv.getUint16(o + 2, true) } : undefined;
  return { powerW, crank };
}

/** Cadence from cumulative crank revolutions. Handles 16-bit wrap of both counters, and reports 0 after the cranks stop. */
export class CadenceCalculator {
  private last: CrankReading | null = null; private lastEventAt = 0; private rpm = 0;
  constructor(private readonly stopAfterMs = 2500) {}
  push(r: CrankReading, nowMs: number): number {
    if (this.last) {
      const dRev = (r.revs - this.last.revs + 65536) % 65536, dT = (r.time1024 - this.last.time1024 + 65536) % 65536;
      if (dT > 0 && dRev > 0 && dRev < 10) { this.rpm = (dRev * 60 * 1024) / dT; this.lastEventAt = nowMs; }
    } else this.lastEventAt = nowMs;
    if (nowMs - this.lastEventAt > this.stopAfterMs) this.rpm = 0;
    this.last = r; return this.rpm;
  }
}
