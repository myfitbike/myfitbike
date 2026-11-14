import { describe, expect, it } from 'vitest';
import { durationOf, flatten, targetAt } from '@veloworld/shared';
import { exportZwo, parseErgMrc, parseZwo } from './workoutFiles';

const zwo = `<workout_file><name>Test Intervals</name><description>d</description><workout>
  <Warmup Duration="600" PowerLow="0.45" PowerHigh="0.75"/>
  <IntervalsT Repeat="3" OnDuration="300" OffDuration="180" OnPower="1.05" OffPower="0.55" Cadence="95"><textevent timeoffset="0" message="Go!"/></IntervalsT>
  <SteadyState Duration="300" Power="0.6"/><FreeRide Duration="120"/><Cooldown Duration="300" PowerLow="0.6" PowerHigh="0.4"/></workout></workout_file>`;

describe('workout imports — riders bring files from other apps, so these must convert exactly', () => {
  it('converts a ZWO with warm-up, repeats, steady, free ride and cooldown', () => {
    const w = parseZwo(zwo, 'x'); const b = flatten(w.steps);
    expect(w.name).toBe('Test Intervals'); expect(durationOf(b)).toBe(600 + 3 * 480 + 300 + 120 + 300); expect(targetAt(b, 700, 200).watts).toBe(210);
    expect(b[1]!.cadence).toBe(95); expect(b[1]!.cues[0]!.text).toBe('Go!'); expect(w.category).toBe('threshold');
  });
  it('reads ERG absolute watts as steady blocks and ramps', () => {
    const w = parseErgMrc('[COURSE HEADER]\nMINUTES WATTS\n[END COURSE HEADER]\n[COURSE DATA]\n0 100\n5 100\n5 250\n10 250\n10 120\n15 200\n[END COURSE DATA]', 'e', 'a.erg');
    expect(w.steps).toEqual([{ kind: 'steady', durS: 300, target: { type: 'watts', value: 100 } }, { kind: 'steady', durS: 300, target: { type: 'watts', value: 250 } }, { kind: 'ramp', durS: 300, from: { type: 'watts', value: 120 }, to: { type: 'watts', value: 200 } }]);
  });
  it('reads MRC percentages as FTP-relative targets', () => {
    const w = parseErgMrc('[COURSE HEADER]\nMINUTES PERCENT\n[END COURSE HEADER]\n[COURSE DATA]\n0 50\n10 50\n10 90\n30 90\n[END COURSE DATA]', 'm', 'b.mrc');
    expect(targetAt(flatten(w.steps), 900, 300).watts).toBe(270);
  });
  it('rejects files that are not workouts with a clear message', () => { expect(() => parseZwo('<x/>', 'a')).toThrow(/no <workout>/); expect(() => parseErgMrc('hello', 'a', 'a.txt')).toThrow(/Not an ERG or MRC/); });
  it('round-trips through ZWO export (builder export must re-import identically)', () => {
    const w = parseZwo(zwo, 'x'); const again = parseZwo(exportZwo(w), 'y');
    expect(durationOf(flatten(again.steps))).toBe(durationOf(flatten(w.steps))); expect(targetAt(flatten(again.steps), 700, 200).watts).toBe(210);
  });
});
