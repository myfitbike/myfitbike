import { describe, it, expect } from 'vitest';
import { powerZones, zoneOf, effectiveFtp } from './index';

describe('power zones drive ERG targets and HUD colours, so bounds must match Coggan exactly', () => {
  it('splits a 245 W FTP into the seven Coggan zones', () => {
    expect(powerZones(245).map((z) => [z.lo, z.hi])).toEqual([[0, 135], [136, 184], [185, 221], [222, 257], [258, 294], [295, 368], [369, null]]);
  });
  it('puts FTP itself in zone 4 (threshold) and 151 % in zone 7', () => { expect(zoneOf(245, 245)).toBe(4); expect(zoneOf(370, 245)).toBe(7); });
});
describe('a rider with unknown FTP still gets usable workouts', () => {
  it('uses 2.5 W/kg until a test sets FTP (plan 14.6)', () => expect(effectiveFtp({ ftpW: null, weightKg: 80 })).toBe(200));
  it('uses the real FTP once known', () => expect(effectiveFtp({ ftpW: 260, weightKg: 80 })).toBe(260));
});
