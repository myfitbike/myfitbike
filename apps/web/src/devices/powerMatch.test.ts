import { describe, expect, it } from 'vitest';
import { PowerMatch } from './powerMatch';

describe('power match — pedals read the truth the rider trains by, the trainer is steered to agree', () => {
  it('moves the correction toward the pedal–trainer difference at no more than 1 W per second', () => {
    const pm = new PowerMatch(); pm.update(210, 200, 0); for (let t = 1; t <= 4; t++) pm.update(210, 200, t); expect(pm.offset).toBeCloseTo(4, 5);
    for (let t = 5; t <= 30; t++) pm.update(210, 200, t); expect(pm.offset).toBeCloseTo(10, 5);
  });
  it('lowers the trainer target when the pedals read high, so pedal power lands on the target', () => {
    const pm = new PowerMatch(); for (let t = 0; t <= 20; t++) pm.update(260, 250, t); expect(pm.targetFor(250)).toBe(240);
  });
  it('ignores coasting so a stop does not wind up the correction', () => { const pm = new PowerMatch(); for (let t = 0; t < 20; t++) pm.update(0, 180, t); expect(pm.offset).toBe(0); });
});
