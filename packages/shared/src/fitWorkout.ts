// FIT workout import (Phase 6: workouts exported from Garmin Connect). Minimal FIT decoder (definition + data
// messages, both byte orders, developer fields skipped) and a converter for workout (26) / workout_step (27)
// messages. Field numbers and encodings verified against Garmin's FIT profile (PROGRESS VERIFY log).
import type { Step, Workout } from './workout';

type Msg = { num: number; fields: Record<number, number | string> };
export function decodeFit(buf: Uint8Array): Msg[] {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength); const hlen = dv.getUint8(0); const dataLen = dv.getUint32(4, true);
  if (String.fromCharCode(...buf.slice(8, 12)) !== '.FIT') throw new Error('Not a FIT file');
  const defs = new Map<number, { num: number; little: boolean; fields: [number, number, number][]; dev: number }>(); const out: Msg[] = []; let o = hlen; const end = hlen + dataLen;
  while (o < end) {
    const h = dv.getUint8(o++);
    if (h & 0x80) { const d = defs.get((h >> 5) & 0x3); if (!d) throw new Error('compressed header before definition'); o = readData(d, o); continue; }
    const local = h & 0x0f;
    if (h & 0x40) { o++; const little = dv.getUint8(o++) === 0; const num = little ? dv.getUint16(o, true) : dv.getUint16(o, false); o += 2; const n = dv.getUint8(o++); const fields: [number, number, number][] = [];
      for (let i = 0; i < n; i++) { fields.push([dv.getUint8(o), dv.getUint8(o + 1), dv.getUint8(o + 2)]); o += 3; }
      let dev = 0; if (h & 0x20) { const nd = dv.getUint8(o++); for (let i = 0; i < nd; i++) { dev += dv.getUint8(o + 1); o += 3; } }
      defs.set(local, { num, little, fields, dev }); continue; }
    const d = defs.get(local); if (!d) throw new Error(`data for undefined local message ${local}`); o = readData(d, o);
  }
  function readData(d: { num: number; little: boolean; fields: [number, number, number][]; dev: number }, o: number) {
    const m: Msg = { num: d.num, fields: {} };
    for (const [fnum, size, bt] of d.fields) {
      const base = bt & 0x1f; let v: number | string | null = null;
      if (base === 7) { let str = ''; for (let i = 0; i < size; i++) { const c = dv.getUint8(o + i); if (!c) break; str += String.fromCharCode(c); } v = decodeURIComponent(escape(str)); }
      else if (size === 1) { const x = base === 1 ? dv.getInt8(o) : dv.getUint8(o); v = x === (base === 1 ? 0x7f : 0xff) && base !== 0x0a ? null : x; }
      else if (size === 2) { const x = base === 3 ? dv.getInt16(o, d.little) : dv.getUint16(o, d.little); v = x === (base === 3 ? 0x7fff : 0xffff) ? null : x; }
      else if (size === 4) { const x = base === 5 ? dv.getInt32(o, d.little) : dv.getUint32(o, d.little); v = x === (base === 5 ? 0x7fffffff : 0xffffffff) ? null : x; }
      if (v !== null) m.fields[fnum] = v; o += size;
    }
    out.push(m); return o + d.dev;
  }
  return out;
}

const ZONE_PCT = [0, 50, 65, 83, 98, 113, 135, 160]; // midpoint of each Coggan zone, for zone-only targets
export function parseFitWorkout(buf: Uint8Array, id: string): Workout {
  const msgs = decodeFit(buf); const fileId = msgs.find((m) => m.num === 0); if (fileId && fileId.fields[0] !== 5) throw new Error('This FIT file is not a workout (it may be an activity)');
  const name = String(msgs.find((m) => m.num === 26)?.fields[8] ?? 'Garmin workout'); const raw = msgs.filter((m) => m.num === 27);
  const toStep = (f: Record<number, number | string>): Step | null => {
    const dType = Number(f[1] ?? 5), dVal = Number(f[2] ?? 0), tType = Number(f[3] ?? 2), tVal = Number(f[4] ?? 0), lo = Number(f[5] ?? 0), hi = Number(f[6] ?? 0);
    const durS = dType === 0 ? Math.round(dVal / 1000) : dType === 5 ? 300 : 0; if (!durS) return null; // distance/HR-ended steps are approximated as 5 min open steps
    const text = f[8] || f[0] ? [{ atS: 0, text: String(f[8] ?? f[0]) }] : undefined;
    if (tType !== 4) return { kind: 'free', durS, text };
    const pct = (v: number) => (v > 1000 ? { type: 'watts' as const, value: v - 1000 } : { type: 'ftpPct' as const, value: v });
    if (tVal >= 1 && tVal <= 7) return { kind: 'steady', durS, target: { type: 'ftpPct', value: ZONE_PCT[tVal]! }, text };
    if (lo || hi) { const a = pct(lo || hi), b = pct(hi || lo); return { kind: 'steady', durS, target: { type: a.type, value: Math.round((a.value + b.value) / 2) }, text }; }
    return { kind: 'free', durS, text };
  };
  // repeat steps (duration_type 6) loop back to message_index `duration_value`, `target_value` times
  const steps: { idx: number; step: Step }[] = [];
  raw.forEach((m, i) => {
    const idx = Number(m.fields[254] ?? i);
    if (Number(m.fields[1]) === 6) { const from = Number(m.fields[2]); const times = Number(m.fields[4] ?? 1); const body = steps.filter((s) => s.idx >= from); const keep = steps.filter((s) => s.idx < from);
      steps.length = 0; steps.push(...keep, { idx: from, step: { kind: 'repeat', times, steps: body.map((b) => b.step) } }); return; }
    const s = toStep(m.fields); if (s) steps.push({ idx, step: s });
  });
  if (!steps.length) throw new Error('No usable workout steps found');
  return { id, name, category: 'endurance', description: 'Imported from a Garmin FIT workout file.', steps: steps.map((s) => s.step), source: 'import' };
}
