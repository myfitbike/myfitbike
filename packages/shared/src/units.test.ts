import { describe, expect, it } from 'vitest';
import { distOf, fmtDist, fmtElev, fmtShort, fmtSpeed, fmtWeight, speedOf, unitM, weightOf, weightToKg } from './units';

describe('display units — an imperial rider sees miles, mph, feet and pounds; storage stays metric', () => {
  it('converts with the exact international definitions', () => {
    expect(distOf(1609.344, 'imperial')).toBeCloseTo(1, 9); expect(distOf(1609.344, 'metric')).toBeCloseTo(1.609344, 9);
    expect(speedOf(10, 'imperial')).toBeCloseTo(22.369, 3); expect(speedOf(10, 'metric')).toBeCloseTo(36, 9);
    expect(fmtElev(1000, 'imperial')).toBe('3281 ft'); expect(fmtElev(1000, 'metric')).toBe('1000 m');
    expect(fmtDist(13834, 'imperial')).toBe('8.6 mi'); expect(fmtSpeed(10, 'metric')).toBe('36.0 km/h');
  });
  it('weights typed in pounds round-trip to the same kilograms (no drift each time the profile is saved)', () => {
    expect(weightOf(80, 'imperial')).toBeCloseTo(176.37, 2); expect(weightToKg(176.37, 'imperial')).toBeCloseTo(80, 2);
    expect(+weightToKg(+weightOf(80, 'imperial').toFixed(1), 'imperial').toFixed(1)).toBe(80); expect(fmtWeight(80, 'imperial')).toBe('176 lb');
  });
  it('short distances read naturally: feet up close, miles further out', () => {
    expect(fmtShort(250, 'imperial')).toBe('820 ft'); expect(fmtShort(800, 'imperial')).toBe('0.50 mi'); expect(fmtShort(250, 'metric')).toBe('250 m');
    expect(unitM('imperial')).toBe(1609.344); expect(unitM('metric')).toBe(1000);
  });
});
