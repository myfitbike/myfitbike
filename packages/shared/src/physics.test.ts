import { describe, expect, it } from 'vitest';
import { stepSpeed, steadySpeed } from './physics';

// The old way: ride the same model for 1000 simulated seconds. steadySpeed must land where riding does, because
// route cards promise an estimated time that the ride itself should then match.
const simulated = (P: number, g: number, p: Parameters<typeof steadySpeed>[2], alt = 0) => { let v = 5; for (let i = 0; i < 20000; i++) v = stepSpeed(v, P, g, 0.05, alt, p); return v; };

describe('steady speed — the equilibrium the ride physics settles to, found directly', () => {
  it('matches the simulated equilibrium on climbs, flats, descents, in wind and at altitude', () => {
    for (const P of [0, 80, 150, 250, 400]) for (const g of [-12, -6, -2, 0, 2, 5, 8, 12, 16]) for (const p of [{ massKg: 83 }, { massKg: 60, windMs: 3 }, { massKg: 100, windMs: -4, cda: 0.25 }]) {
      const want = simulated(P, g, p, 1500), got = steadySpeed(P, g, p, 1500);
      expect(Math.abs(got - want), `P=${P} g=${g} ${JSON.stringify(p)}: ${got} vs ${want}`).toBeLessThan(0.01);
    }
  });
  it('is fast enough to estimate a whole route on every render (thousands of solves in well under 50 ms)', () => {
    const t = performance.now(); for (let i = 0; i < 4000; i++) steadySpeed(150, (i % 30) - 10, { massKg: 83 }); expect(performance.now() - t).toBeLessThan(50);
  });
});
