import { describe, expect, it } from 'vitest';
import { durationOf, flatten, targetAt } from './workout';
import { parseFitWorkout } from './fitWorkout';
import { fitCrc } from './fit';

// Build a small FIT workout file the way Garmin Connect exports one (file_id type 5, workout, workout_steps).
function fitWorkout(steps: { name?: string; dType: number; dVal: number; tType: number; tVal: number; lo: number; hi: number }[]) {
  const b: number[] = []; const u = (v: number, n: number) => { for (let i = 0; i < n; i++) b.push((v >>> (8 * i)) & 0xff); };
  b.push(0x40, 0, 0); u(0, 2); b.push(1, 0, 1, 0x00); b.push(0, 5); // file_id: type = 5 (workout)
  b.push(0x41, 0, 0); u(26, 2); b.push(1, 8, 16, 0x07); b.push(1); const nm = 'Garmin 3x10'.padEnd(16, '\0'); for (const ch of nm) b.push(ch.charCodeAt(0));
  b.push(0x42, 0, 0); u(27, 2); b.push(7, 254, 2, 0x84, 1, 1, 0x00, 2, 4, 0x86, 3, 1, 0x00, 4, 4, 0x86, 5, 4, 0x86, 6, 4, 0x86);
  steps.forEach((s, i) => { b.push(2); u(i, 2); b.push(s.dType); u(s.dVal, 4); b.push(s.tType); u(s.tVal, 4); u(s.lo, 4); u(s.hi, 4); });
  const data = new Uint8Array(b); const h = new Uint8Array(14); const dv = new DataView(h.buffer); h[0] = 14; h[1] = 0x20; dv.setUint16(2, 2132, true); dv.setUint32(4, data.length, true); h.set([0x2e, 0x46, 0x49, 0x54], 8); dv.setUint16(12, fitCrc(h.subarray(0, 12)), true);
  const out = new Uint8Array(16 + data.length); out.set(h); out.set(data, 14); new DataView(out.buffer).setUint16(14 + data.length, fitCrc(out.subarray(0, 14 + data.length)), true); return out;
}

describe('Garmin FIT workout import — workouts planned in Garmin Connect must ride the same here', () => {
  const file = fitWorkout([
    { dType: 0, dVal: 600000, tType: 4, tVal: 0, lo: 50, hi: 70 },      // 10 min warm-up at 50–70 % FTP
    { dType: 0, dVal: 600000, tType: 4, tVal: 0, lo: 1240, hi: 1260 },  // 10 min at 240–260 W (watts offset by 1000)
    { dType: 0, dVal: 300000, tType: 4, tVal: 2, lo: 0, hi: 0 },        // 5 min in power zone 2
    { dType: 6, dVal: 1, tType: 2, tVal: 3, lo: 0, hi: 0 },             // repeat from step 1, 3 times
    { dType: 0, dVal: 300000, tType: 2, tVal: 0, lo: 0, hi: 0 },        // 5 min open (no target)
  ]);
  const w = parseFitWorkout(file, 'g1'); const b = flatten(w.steps);
  it('reads the workout name and converts time steps from milliseconds', () => { expect(w.name).toBe('Garmin 3x10'); expect(durationOf(b)).toBe(600 + 3 * 900 + 300); });
  it('maps % FTP ranges, watt ranges (offset 1000) and zones to targets', () => {
    expect(targetAt(b, 60, 200).watts).toBe(120); expect(targetAt(b, 700, 200).watts).toBe(250); expect(targetAt(b, 1300, 200).watts).toBe(130); // zone 2 midpoint 65 %
  });
  it('expands repeat steps (loop back to a step index N times)', () => expect(b.filter((x) => x.kind === 'steady').length).toBe(1 + 3 * 2));
  it('treats open-target steps as free ride', () => expect(b.at(-1)!.kind).toBe('free'));
});
