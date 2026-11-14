import { describe, expect, it } from 'vitest';
import FitParser from 'fit-file-parser';
import { flatten, targetAt, blockAt, durationOf, estimateStress, earnsStar, type Step } from './workout';
import { normalizedPower, bestEfforts, summarize, ftpFromRamp, ftpFrom20min, type Sample } from './metrics';
import { encodeActivityFit, fitCrc } from './fit';

const ss3x12: Step[] = [
  { kind: 'ramp', durS: 600, from: { type: 'ftpPct', value: 50 }, to: { type: 'ftpPct', value: 75 } },
  { kind: 'repeat', times: 3, steps: [{ kind: 'steady', durS: 720, target: { type: 'ftpPct', value: 90 } }, { kind: 'steady', durS: 300, target: { type: 'ftpPct', value: 55 } }] },
  { kind: 'free', durS: 300 },
];

describe('workout timeline — elapsed time must map to the same target every time (resume after crash relies on it)', () => {
  const b = flatten(ss3x12);
  it('expands repeats into absolute blocks', () => { expect(b).toHaveLength(8); expect(durationOf(b)).toBe(600 + 3 * 1020 + 300); });
  it('interpolates ramps linearly', () => expect(targetAt(b, 300, 200).watts).toBe(125)); // 62.5 % of 200
  it('resolves FTP percentages with the bias multiplier (70–130 % control)', () => { expect(targetAt(b, 700, 250).watts).toBe(225); expect(targetAt(b, 700, 250, 1.1).watts).toBe(248); });
  it('returns "free" for free-ride blocks so ERG is released', () => expect(targetAt(b, durationOf(b) - 10, 250)).toEqual({ type: 'free', value: 0, watts: null }));
  it('finds blocks at exact boundaries in the new block, not the old', () => expect(blockAt(b, 600)!.i).toBe(1));
  it('estimates stress in a plausible range for a sweet-spot session', () => { const s = estimateStress(b); expect(s.tss).toBeGreaterThan(50); expect(s.tss).toBeLessThan(90); });
  it('awards a star only within 5 % of target', () => { expect(earnsStar(214, 225)).toBe(true); expect(earnsStar(200, 225)).toBe(false); });
});

describe('ride metrics — the summary and Strava upload show these numbers, so they must match the standard formulas', () => {
  it('normalized power equals average power for a perfectly steady ride', () => expect(Math.round(normalizedPower(Array(600).fill(200)))).toBe(200));
  it('normalized power exceeds average for an on/off ride (surges cost more)', () => { const p = Array.from({ length: 600 }, (_, i) => (Math.floor(i / 60) % 2 ? 300 : 100)); expect(normalizedPower(p)).toBeGreaterThan(210); });
  it('finds best 5 s and 1 min efforts', () => { const p = [...Array(120).fill(150), ...Array(5).fill(900), ...Array(120).fill(150)]; const b = bestEfforts(p, [5, 60]); expect(b[5]).toBe(900); expect(b[60]).toBe(213); });
  it('one hour at FTP is 100 TSS and IF 1.0 (definition of FTP)', () => {
    const s: Sample[] = Array.from({ length: 3600 }, (_, t) => ({ t, power: 250, cadence: 90, hr: 150, speed: 10, distance: t * 10, alt: 10, grade: 0, target: 250, step: 0 }));
    const r = summarize(s, 250); expect(r.tss).toBe(100); expect(r.if).toBe(1); expect(r.kj).toBe(900);
  });
  it('ramp test FTP is 75 % of best minute; 20-minute test is 95 % of the average', () => { expect(ftpFromRamp([...Array(60).fill(300), ...Array(60).fill(400)])).toBe(300); expect(ftpFrom20min(263)).toBe(250); });
});

describe('FIT export — must import cleanly into Garmin Connect and Strava', () => {
  const samples: Sample[] = Array.from({ length: 120 }, (_, t) => ({ t, power: 200 + (t % 10), cadence: 88, hr: 140, speed: 9.5, distance: t * 9.5, alt: 10 + t * 0.1, grade: 2.5, target: 200, step: 0 }));
  const fit = encodeActivityFit({ startedAtMs: Date.UTC(2026, 10, 14, 7, 0, 0), samples, summary: summarize(samples, 250) });
  it('has a valid header and whole-file CRC', () => {
    expect(String.fromCharCode(...fit.slice(8, 12))).toBe('.FIT'); expect(fitCrc(fit)).toBe(0); // CRC over data + stored CRC is 0
  });
  it('decodes with an independent parser into an indoor virtual ride with records, lap and session', async () => {
    const parsed: any = await new Promise((res, rej) => new FitParser({ force: false, mode: 'list', speedUnit: 'm/s', lengthUnit: 'm' }).parse(Buffer.from(fit), (e: unknown, d: unknown) => (e ? rej(e) : res(d))));
    expect(parsed.records).toHaveLength(120); expect(parsed.records[10].power).toBe(200); expect(parsed.records[10].heart_rate).toBe(140);
    expect(parsed.sessions[0].sport).toBe('cycling'); expect(parsed.sessions[0].sub_sport).toBe('virtual_activity');
    expect(parsed.sessions[0].avg_power).toBe(205); expect(parsed.laps).toHaveLength(1); expect(parsed.activity.num_sessions).toBe(1);
    expect(new Date(parsed.records[0].timestamp).toISOString()).toBe('2026-11-14T07:00:00.000Z');
  });
});
