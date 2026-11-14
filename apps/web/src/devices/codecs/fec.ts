// Tacx FE-C over BLE (fallback; NOT available on Flux 2 firmware >= 5.0.0). ANT framing per ANT Message Protocol D00000652.
// Page layouts follow the FE-C profile as implemented by open-source clients (profile itself is login-gated); see VERIFY log.
export const FEC_SERVICE = '6e40fec1-b5a3-f393-e0a9-e50e24dcca9e';
export const FEC_NOTIFY = '6e40fec2-b5a3-f393-e0a9-e50e24dcca9e';
export const FEC_WRITE = '6e40fec3-b5a3-f393-e0a9-e50e24dcca9e';

export function frame(page: number[]) {
  const b = new Uint8Array(13); b.set([0xa4, 0x09, 0x4f, 0x05]); b.set(page, 4);
  let x = 0; for (let i = 0; i < 12; i++) x ^= b[i]!; b[12] = x; return b;
}
export const encode = {
  targetPower: (w: number) => { const raw = Math.max(0, Math.min(65535, Math.round(w * 4))); return frame([0x31, 0xff, 0xff, 0xff, 0xff, 0xff, raw & 0xff, raw >> 8]); },
  trackResistance: (gradePct: number, crr = 0.004) => { const g = Math.round((Math.max(-200, Math.min(200, gradePct)) + 200) / 0.01); return frame([0x33, 0xff, 0xff, 0xff, 0xff, g & 0xff, g >> 8, Math.round(crr / 5e-5)]); },
  basicResistance: (pct: number) => frame([0x30, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, Math.round(Math.max(0, Math.min(100, pct)) * 2)]),
  userConfig: (userKg: number, bikeKg: number) => {
    const u = Math.round(userKg * 100), bk = Math.round(bikeKg / 0.05);
    return frame([0x37, u & 0xff, u >> 8, 0xff, ((bk & 0x0f) << 4) | 0x0f, bk >> 4, 0xff, 0x00]);
  },
};
export type FecData = { page: number; checksumOk: boolean; speedKph?: number; cadenceRpm?: number; powerW?: number };
export function parse(dv: DataView): FecData | null {
  if (dv.byteLength < 13 || dv.getUint8(0) !== 0xa4) return null;
  let x = 0; for (let i = 0; i < 12; i++) x ^= dv.getUint8(i);
  const p = (i: number) => dv.getUint8(4 + i); const r: FecData = { page: p(0), checksumOk: x === dv.getUint8(12) };
  if (r.page === 0x10) { const raw = p(4) | (p(5) << 8); if (raw !== 0xffff) r.speedKph = (raw / 1000) * 3.6; }
  if (r.page === 0x19) { if (p(2) !== 0xff) r.cadenceRpm = p(2); const pw = p(5) | ((p(6) & 0x0f) << 8); if (pw !== 0xfff) r.powerW = pw; }
  return r;
}
