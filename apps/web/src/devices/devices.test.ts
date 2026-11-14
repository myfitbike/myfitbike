import { describe, expect, it, vi } from 'vitest';
import { encode as ftmsEncode, parseIndoorBikeData, parseFeature, parseControlPointResponse } from './codecs/ftms';
import * as fec from './codecs/fec';
import { CadenceCalculator, parseCsc, parseHeartRate, parseCyclingPower } from './codecs/sensors';
import { CommandQueue } from './commandQueue';
import { FtmsTrainer } from './FtmsTrainer';
import { SimulatedTrainer } from './SimulatedTrainer';
import type { GattChar } from './types';

const dv = (bytes: number[]) => new DataView(new Uint8Array(bytes).buffer);
const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join(' ');
// NOTE: synthetic fixtures built from the spec until checkpoint A supplies frames captured from the owner's Flux 2.

describe('FTMS Indoor Bike Data — the field walk must not drift, or power is read from the wrong bytes', () => {
  it('reads speed, cadence and power when only those flags are set', () => {
    expect(parseIndoorBikeData(dv([0x44, 0x00, 0x1c, 0x0c, 0xb4, 0x00, 0xfa, 0x00]))).toMatchObject({ speedKph: 31, cadenceRpm: 90, powerW: 250, trailingBytes: 0 });
  });
  it('walks past a 24-bit distance and reads heart rate at the end', () => {
    expect(parseIndoorBikeData(dv([0x54, 0x02, 0x10, 0x27, 0xa0, 0x00, 0x39, 0x30, 0x00, 0x2c, 0x01, 0x8c]))).toMatchObject({ distanceM: 12345, powerW: 300, hr: 140, trailingBytes: 0 });
  });
  it('copes with a 1-byte (current spec) or 2-byte (old spec) resistance field without losing power', () => {
    expect(parseIndoorBikeData(dv([0x60, 0x00, 0x10, 0x27, 0x14, 0xc8, 0x00])).powerW).toBe(200);
    expect(parseIndoorBikeData(dv([0x60, 0x00, 0x10, 0x27, 0x14, 0x00, 0xc8, 0x00])).powerW).toBe(200);
  });
  it('treats speed as absent when bit 0 ("more data") is set', () => expect(parseIndoorBikeData(dv([0x41, 0x00, 0x96, 0x00])).speedKph).toBeUndefined());
});

describe('FTMS control point encoding — wrong bytes mean the trainer ignores ERG or gradient', () => {
  it('encodes 150 W as sint16 little-endian', () => expect(hex(ftmsEncode.targetPower(150))).toBe('05 96 00'));
  it('encodes 5 % grade in 0.01 % units with Crr and CwA', () => expect(hex(ftmsEncode.simulation({ gradePct: 5, crr: 0.004, cwa: 0.51 }))).toBe('11 00 00 f4 01 28 33'));
  it('encodes a negative grade (descents) as two\'s complement', () => expect(hex(ftmsEncode.simulation({ gradePct: -3.5 })).slice(9, 14)).toBe('a2 fe'));
  it('reads the trainer\'s capability bits so the app only offers what the trainer supports', () => {
    const f = parseFeature(dv([0x02, 0x40, 0, 0, 0x0c, 0xa0, 0, 0])); // cadence, power; target resistance, power, simulation, spin down
    expect(f).toEqual({ cadence: true, power: true, targetResistance: true, targetPower: true, simulation: true, spinDown: true });
  });
  it('parses the 0x80 indication and ignores other frames', () => { expect(parseControlPointResponse(dv([0x80, 0x05, 0x01]))).toEqual({ op: 5, result: 1 }); expect(parseControlPointResponse(dv([0x01]))).toBeNull(); });
});

describe('FE-C over BLE (fallback for old firmware)', () => {
  it('frames target power with the ANT XOR checksum', () => expect(hex(fec.encode.targetPower(150))).toBe('a4 09 4f 05 31 ff ff ff ff ff 58 02 73'));
  it('offsets grade by +200 % in 0.01 % units', () => { const b = fec.encode.trackResistance(5); expect(b[9]! | (b[10]! << 8)).toBe(20500); });
  it('rejects a frame with a bad checksum flag', () => { const b = fec.encode.targetPower(100); b[12] = b[12]! ^ 1; expect(fec.parse(new DataView(b.buffer))!.checksumOk).toBe(false); });
  it('decodes trainer page 0x19 power and cadence', () => {
    const f = fec.frame([0x19, 1, 90, 0, 0, 0xfa, 0x30, 0]); f[2] = 0x4e; let x = 0; for (let i = 0; i < 12; i++) x ^= f[i]!; f[12] = x;
    expect(fec.parse(new DataView(f.buffer))).toMatchObject({ cadenceRpm: 90, powerW: 250, checksumOk: true });
  });
});

describe('sensors', () => {
  it('reads heart rate and beat-to-beat intervals (stored for HRV later)', () => expect(parseHeartRate(dv([0x10, 0x48, 0x00, 0x04, 0x00, 0x02]))).toEqual({ bpm: 72, rrMs: [1000, 500] }));
  it('ignores wheel data from a speed sensor (direct-drive trainer) and reads crank data', () => expect(parseCsc(dv([0x03, 1, 0, 0, 0, 2, 0, 0x10, 0x00, 0x00, 0x04])).crank).toEqual({ revs: 16, time1024: 1024 }));
  it('reads power and crank revs from a Cycling Power meter', () => expect(parseCyclingPower(dv([0x20, 0x00, 0xc8, 0x00, 0x05, 0x00, 0x00, 0x08]))).toEqual({ powerW: 200, crank: { revs: 5, time1024: 2048 } }));
  it('computes cadence across a 16-bit counter wrap (happens every ~64 s of crank time)', () => {
    const c = new CadenceCalculator(); c.push({ revs: 65535, time1024: 65000 }, 0); expect(Math.round(c.push({ revs: 1, time1024: (65000 + 1365) % 65536 }, 1333))).toBe(90);
  });
  it('drops cadence to 0 once the cranks stop, so auto-pause can trigger', () => {
    const c = new CadenceCalculator(2500); c.push({ revs: 1, time1024: 0 }, 0); c.push({ revs: 2, time1024: 700 }, 700);
    expect(c.push({ revs: 2, time1024: 700 }, 4000)).toBe(0);
  });
});

describe('command queue — GATT allows one operation at a time', () => {
  it('runs commands strictly in order, never overlapping', async () => {
    const q = new CommandQueue(1000); const log: string[] = []; let active = 0;
    const op = (n: string) => async () => { active++; expect(active).toBe(1); log.push(`start ${n}`); await new Promise((r) => setTimeout(r, 5)); log.push(`end ${n}`); active--; };
    await Promise.all([q.run('a', op('a')), q.run('b', op('b'))]);
    expect(log).toEqual(['start a', 'end a', 'start b', 'end b']);
  });
  it('retries once after a timeout, then fails loudly instead of hanging the ride', async () => {
    const q = new CommandQueue(20, 2); const f = vi.fn(() => new Promise<void>(() => {}));
    await expect(q.run('stuck', f)).rejects.toThrow(/timed out/); expect(f).toHaveBeenCalledTimes(2);
  });
  it('keeps working after a failed command', async () => {
    const q = new CommandQueue(20, 1); await q.run('bad', async () => { throw new Error('x'); }).catch(() => {}); expect(await q.run('ok', async () => 7)).toBe(7);
  });
});

// Fake FTMS trainer: answers control-point writes with indications, optionally refusing control once.
function fakeFtms(opts: { refuseFirst?: number } = {}) {
  const handlers: Record<string, ((e: Event) => void)[]> = { ibd: [], cp: [] }; const writes: string[] = []; let refuse = opts.refuseFirst ?? -1;
  const mk = (key: string, onWrite?: (b: Uint8Array) => void): GattChar => ({ uuid: key, startNotifications: async () => undefined,
    addEventListener: (_t, cb) => handlers[key]!.push(cb), writeValueWithResponse: async (v) => { onWrite?.(new Uint8Array(v)); } });
  const emit = (key: string, bytes: number[]) => handlers[key]!.forEach((cb) => cb({ target: { value: dv(bytes) } } as unknown as Event));
  const cp = mk('cp', (b) => { writes.push(hex(b)); const op = b[0]!; const result = op === refuse ? (refuse = -1, 5) : 1; queueMicrotask(() => emit('cp', [0x80, op, result])); });
  return { chars: { indoorBikeData: mk('ibd'), controlPoint: cp }, writes, emit };
}

describe('FtmsTrainer', () => {
  it('requests control before anything else (the trainer rejects commands otherwise)', async () => {
    const f = fakeFtms(); const t = new FtmsTrainer('Flux', f.chars, () => 0, 200); await t.init(); expect(f.writes[0]).toBe('00');
  });
  it('re-requests control once and retries when told "control not permitted" (e.g. after another app took over)', async () => {
    const f = fakeFtms({ refuseFirst: 0x05 }); const t = new FtmsTrainer('Flux', f.chars, () => 0, 200); await t.init(); f.writes.length = 0;
    await t.setTargetPower(200); expect(f.writes).toEqual(['05 c8 00', '00', '05 c8 00']);
  });
  it('clamps gradient to the Flux 2 range (16 % up, -10 % down) while the HUD shows the true value', async () => {
    const f = fakeFtms(); const t = new FtmsTrainer('Flux', f.chars, () => 0, 200); await t.init(); f.writes.length = 0;
    await t.setSimulation({ gradePct: 22, crr: 0.004, cwa: 0.51, windMs: 0 }); expect(f.writes[0]!.slice(9, 14)).toBe('40 06'); // 1600 = 16.00 %
  });
  it('emits samples from Indoor Bike Data', async () => {
    const f = fakeFtms(); const t = new FtmsTrainer('Flux', f.chars, () => 42, 200); await t.init(); const got: unknown[] = []; t.onSample((s) => got.push(s));
    f.emit('ibd', [0x44, 0x00, 0x1c, 0x0c, 0xb4, 0x00, 0xfa, 0x00]); expect(got).toEqual([{ t: 42, powerW: 250, cadenceRpm: 90, speedKph: 31 }]);
  });
});

describe('SimulatedTrainer — must behave like a real trainer so the app is honestly tested without the bike', () => {
  const run = (t: SimulatedTrainer, seconds: number) => { let last = 0; t.onSample((s) => (last = s.powerW)); for (let i = 0; i < seconds * 4; i++) t.step(0.25); return last; };
  it('settles on the ERG target with a lag, not instantly', async () => {
    const t = new SimulatedTrainer({ noise: false, clock: () => 0 }); await t.setTargetPower(250);
    expect(run(t, 0.5)).toBeLessThan(200); expect(run(t, 8)).toBeGreaterThan(245);
  });
  it('cannot hold ERG power when the rider stalls below 40 rpm (why the app must release ERG)', async () => {
    const t = new SimulatedTrainer({ noise: false, clock: () => 0 }); await t.setTargetPower(300); t.cadence = 20; expect(run(t, 10)).toBeLessThan(200);
  });
  it('makes the same effort produce more power on a steeper simulated grade', async () => {
    const t = new SimulatedTrainer({ noise: false, clock: () => 0 }); t.effortW = 200; await t.setSimulation({ gradePct: 0, crr: 0.004, cwa: 0.5, windMs: 0 }); const flat = run(t, 10);
    await t.setSimulation({ gradePct: 8, crr: 0.004, cwa: 0.5, windMs: 0 }); expect(run(t, 10)).toBeGreaterThan(flat + 50);
  });
  it('reports zero power when the rider stops pedalling (drives auto-pause)', () => { const t = new SimulatedTrainer({ noise: false, clock: () => 0 }); t.cadence = 0; expect(run(t, 10)).toBe(0); });
});
