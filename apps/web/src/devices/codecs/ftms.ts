// FTMS (0x1826) codecs. Layouts verified against FTMS v1.0 and the GATT Specification Supplement (PROGRESS VERIFY log).
export type IndoorBikeData = { speedKph?: number; cadenceRpm?: number; distanceM?: number; resistance?: number; powerW?: number; hr?: number; elapsedS?: number };

export function parseIndoorBikeData(dv: DataView): IndoorBikeData & { trailingBytes: number } {
  const flags = dv.getUint16(0, true); let o = 2; const r: IndoorBikeData = {};
  if (!(flags & 0x1)) { r.speedKph = dv.getUint16(o, true) / 100; o += 2; } // bit0 = 0 means speed present ("more data" clear)
  if (flags & 0x2) o += 2; // average speed
  if (flags & 0x4) { r.cadenceRpm = dv.getUint16(o, true) / 2; o += 2; }
  if (flags & 0x8) o += 2; // average cadence
  if (flags & 0x10) { r.distanceM = dv.getUint16(o, true) | (dv.getUint8(o + 2) << 16); o += 3; }
  if (flags & 0x20) { // resistance level: uint8 in current GSS, sint16 in FTMS 1.0 XML — pick the size that makes the length add up
    const after = [[0x40, 2], [0x80, 2], [0x100, 5], [0x200, 1], [0x400, 1], [0x800, 2], [0x1000, 2]].reduce((s, [b, n]) => s + (flags & b! ? n! : 0), 0);
    const size = dv.byteLength - o - after === 1 ? 1 : 2; r.resistance = size === 1 ? dv.getUint8(o) : dv.getInt16(o, true); o += size;
  }
  if (flags & 0x40) { r.powerW = dv.getInt16(o, true); o += 2; }
  if (flags & 0x80) o += 2; // average power
  if (flags & 0x100) o += 5; // energy
  if (flags & 0x200) { r.hr = dv.getUint8(o); o += 1; }
  if (flags & 0x400) o += 1; // MET
  if (flags & 0x800) { r.elapsedS = dv.getUint16(o, true); o += 2; }
  if (flags & 0x1000) o += 2; // remaining time
  return { ...r, trailingBytes: dv.byteLength - o };
}

export type FtmsFeatures = { cadence: boolean; power: boolean; targetPower: boolean; targetResistance: boolean; simulation: boolean; spinDown: boolean };
export function parseFeature(dv: DataView): FtmsFeatures {
  const m = dv.getUint32(0, true), t = dv.getUint32(4, true);
  return { cadence: !!(m & (1 << 1)), power: !!(m & (1 << 14)), targetResistance: !!(t & (1 << 2)), targetPower: !!(t & (1 << 3)), simulation: !!(t & (1 << 13)), spinDown: !!(t & (1 << 15)) };
}
export const parseRange = (dv: DataView, scale = 1): [number, number, number] => [dv.getInt16(0, true) / scale, dv.getInt16(2, true) / scale, dv.getUint16(4, true) / scale];

export const OP = { requestControl: 0x00, reset: 0x01, targetResistance: 0x04, targetPower: 0x05, start: 0x07, stop: 0x08, simulation: 0x11, spinDown: 0x13 } as const;
export const RESULT = { success: 1, notSupported: 2, invalidParameter: 3, failed: 4, controlNotPermitted: 5 } as const;
export const encode = {
  requestControl: () => new Uint8Array([OP.requestControl]),
  reset: () => new Uint8Array([OP.reset]),
  start: () => new Uint8Array([OP.start]),
  pause: () => new Uint8Array([OP.stop, 2]),
  targetPower: (w: number) => { const b = new Uint8Array(3); b[0] = OP.targetPower; new DataView(b.buffer).setInt16(1, Math.round(w), true); return b; },
  targetResistance: (level: number) => new Uint8Array([OP.targetResistance, Math.max(0, Math.min(255, Math.round(level * 10)))]),
  simulation: ({ windMs = 0, gradePct, crr = 0.004, cwa = 0.51 }: { windMs?: number; gradePct: number; crr?: number; cwa?: number }) => {
    const b = new Uint8Array(7); const d = new DataView(b.buffer); b[0] = OP.simulation;
    d.setInt16(1, Math.round(windMs * 1000), true); d.setInt16(3, Math.round(gradePct * 100), true); b[5] = Math.round(crr / 0.0001); b[6] = Math.round(cwa / 0.01); return b;
  },
  spinDownStart: () => new Uint8Array([OP.spinDown, 1]),
};
/** Control point indication: 0x80, request opcode, result. */
export function parseControlPointResponse(dv: DataView): { op: number; result: number } | null {
  return dv.byteLength >= 3 && dv.getUint8(0) === 0x80 ? { op: dv.getUint8(1), result: dv.getUint8(2) } : null;
}
export const MACHINE_STATUS = { controlLost: 0xff, reset: 0x01, stoppedByUser: 0x02, startedByUser: 0x04, targetPowerChanged: 0x08, simulationChanged: 0x12 } as const;
