// Minimal FIT activity encoder (owner decision PLAN 16.5: no proprietary SDK). Writes file_id, event, record,
// lap, session and activity messages as an indoor virtual ride with no GPS (plan 8.1, Phase 6 note).
// Field numbers and base types follow the FIT profile; output is verified by decoding with an independent parser in tests.
import type { RideSummary, Sample } from './metrics';

const FIT_EPOCH_S = 631065600; // 1989-12-31T00:00:00Z
const fitTime = (unixMs: number) => Math.round(unixMs / 1000) - FIT_EPOCH_S;
const CRC_TABLE = [0x0000, 0xcc01, 0xd801, 0x1400, 0xf001, 0x3c00, 0x2800, 0xe401, 0xa001, 0x6c00, 0x7800, 0xb401, 0x5000, 0x9c01, 0x8801, 0x4400];
export function fitCrc(bytes: Uint8Array, crc = 0): number {
  for (const b of bytes) {
    let t = CRC_TABLE[crc & 0xf]!; crc = (crc >> 4) & 0x0fff; crc = crc ^ t ^ CRC_TABLE[b & 0xf]!;
    t = CRC_TABLE[crc & 0xf]!; crc = (crc >> 4) & 0x0fff; crc = crc ^ t ^ CRC_TABLE[(b >> 4) & 0xf]!;
  }
  return crc;
}
type BaseType = 'enum' | 'uint8' | 'uint16' | 'sint16' | 'uint32' | 'uint32z';
const BT: Record<BaseType, [number, number, number]> = { enum: [0x00, 1, 0xff], uint8: [0x02, 1, 0xff], uint16: [0x84, 2, 0xffff], sint16: [0x83, 2, 0x7fff], uint32: [0x86, 4, 0xffffffff], uint32z: [0x8c, 4, 0] };
type Field = [num: number, type: BaseType];
const MSG = {
  file_id: { num: 0, fields: [[0, 'enum'], [1, 'uint16'], [2, 'uint16'], [3, 'uint32z'], [4, 'uint32']] as Field[] },
  event: { num: 21, fields: [[253, 'uint32'], [0, 'enum'], [1, 'enum']] as Field[] },
  record: { num: 20, fields: [[253, 'uint32'], [3, 'uint8'], [4, 'uint8'], [5, 'uint32'], [6, 'uint16'], [7, 'uint16'], [2, 'uint16'], [9, 'sint16']] as Field[] },
  lap: { num: 19, fields: [[253, 'uint32'], [2, 'uint32'], [7, 'uint32'], [8, 'uint32'], [9, 'uint32'], [0, 'enum'], [1, 'enum'], [25, 'enum'], [39, 'enum'], [19, 'uint16'], [20, 'uint16'], [15, 'uint8'], [16, 'uint8'], [17, 'uint8'], [21, 'uint16'], [254, 'uint16']] as Field[] },
  session: { num: 18, fields: [[253, 'uint32'], [2, 'uint32'], [7, 'uint32'], [8, 'uint32'], [9, 'uint32'], [5, 'enum'], [6, 'enum'], [0, 'enum'], [1, 'enum'], [20, 'uint16'], [21, 'uint16'], [16, 'uint8'], [17, 'uint8'], [18, 'uint8'], [22, 'uint16'], [34, 'uint16'], [35, 'uint16'], [36, 'uint16'], [25, 'uint16'], [26, 'uint16'], [254, 'uint16']] as Field[] },
  activity: { num: 34, fields: [[253, 'uint32'], [0, 'uint32'], [1, 'uint16'], [2, 'enum'], [3, 'enum'], [4, 'enum'], [5, 'uint32']] as Field[] },
};
type MsgName = keyof typeof MSG;

class Writer {
  private chunks: number[] = []; private defined = new Map<MsgName, number>(); private nextLocal = 0;
  private u(v: number, size: number) { for (let i = 0; i < size; i++) this.chunks.push((v >>> (8 * i)) & 0xff); }
  write(name: MsgName, values: (number | null | undefined)[]) {
    const m = MSG[name]; let local = this.defined.get(name);
    if (local === undefined) {
      local = this.nextLocal++; this.defined.set(name, local);
      this.chunks.push(0x40 | local, 0, 0); this.u(m.num, 2); this.chunks.push(m.fields.length);
      for (const [num, t] of m.fields) this.chunks.push(num, BT[t][1], BT[t][0]);
    }
    this.chunks.push(local);
    m.fields.forEach(([, t], i) => { const [, size, invalid] = BT[t]; const v = values[i]; const n = v === null || v === undefined || !Number.isFinite(v) ? invalid : Math.round(v); this.u(t === 'sint16' && n < 0 ? n + 0x10000 : n, size); });
  }
  bytes() { return new Uint8Array(this.chunks); }
}

export type FitInput = { startedAtMs: number; samples: Sample[]; summary: RideSummary; laps?: { startIdx: number; endIdx: number }[] };
export function encodeActivityFit({ startedAtMs, samples, summary, laps }: FitInput): Uint8Array {
  const w = new Writer(); const t0 = fitTime(startedAtMs); const ts = (s: Sample) => t0 + Math.round(s.t);
  const end = samples.length ? ts(samples[samples.length - 1]!) : t0;
  w.write('file_id', [4, 255, 1, 1, t0]); // activity, manufacturer = development
  w.write('event', [t0, 0, 0]); // timer start
  for (const s of samples) w.write('record', [ts(s), s.hr, s.cadence, s.distance * 100, s.speed === null ? null : s.speed * 1000, s.power, s.alt === null ? null : (s.alt + 500) * 5, s.grade === null ? null : s.grade * 100]);
  w.write('event', [end, 0, 4]); // timer stop all
  const lapRanges = laps?.length ? laps : [{ startIdx: 0, endIdx: samples.length - 1 }];
  lapRanges.forEach((l, i) => {
    const seg = samples.slice(l.startIdx, l.endIdx + 1); if (!seg.length) return;
    const pw = seg.map((s) => s.power ?? 0), hr = seg.map((s) => s.hr ?? 0).filter((v) => v > 0), cad = seg.map((s) => s.cadence ?? 0).filter((v) => v > 0);
    const dur = seg.length; const dist = seg[seg.length - 1]!.distance - (l.startIdx > 0 ? samples[l.startIdx - 1]!.distance : 0);
    w.write('lap', [ts(seg[seg.length - 1]!), ts(seg[0]!), dur * 1000, dur * 1000, dist * 100, 9, 1, 2, 58, avg(pw), Math.max(...pw), hr.length ? avg(hr) : null, hr.length ? Math.max(...hr) : null, cad.length ? avg(cad) : null, null, i]);
  });
  const S = summary;
  w.write('session', [end, t0, S.durationS * 1000, S.movingS * 1000, S.distanceM * 100, 2, 58, 9, 1, S.avgPower, S.maxPower, S.avgHr, S.maxHr, S.avgCadence, S.elevationGainM, S.np, S.tss * 10, S.if * 1000, 0, lapRanges.length, 0]);
  w.write('activity', [end, S.movingS * 1000, 1, 0, 26, 1, end]);
  const data = w.bytes();
  const header = new Uint8Array(14); const hv = new DataView(header.buffer);
  header[0] = 14; header[1] = 0x20; hv.setUint16(2, 2132, true); hv.setUint32(4, data.length, true); header.set([0x2e, 0x46, 0x49, 0x54], 8); hv.setUint16(12, fitCrc(header.subarray(0, 12)), true);
  const out = new Uint8Array(14 + data.length + 2); out.set(header); out.set(data, 14);
  new DataView(out.buffer).setUint16(14 + data.length, fitCrc(out.subarray(0, 14 + data.length)), true);
  return out;
}
const avg = (xs: number[]) => Math.round(xs.reduce((a, b) => a + b, 0) / xs.length);
