import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildRoute, climbCategory, detectClimbs, gradeAhead, profileAt, sampleWorld, validateWorld, type World } from './index';

const world = JSON.parse(readFileSync(new URL('../../../content/world/velora/world.json', import.meta.url), 'utf8')) as World;
const sampled = sampleWorld(world);

describe('Velora world data — the build must fail on anything the trainer or a route could trip over', () => {
  it('passes validation: gradients within each region limit, radii ≥ 6 m, nodes joined, routes continuous', () => expect(validateWorld(world, sampled).errors).toEqual([]));
  it('rejects a ramp steeper than the region allows', () => {
    const w = structuredClone(world); const e = w.edges.find((x) => x.id === 'e-seafront')!; e.points[10]![1] += 10;
    expect(validateWorld(w).errors.some((m) => m.includes('exceeds Port Anchor limit'))).toBe(true);
  });
  it('rejects a U-turn on a through-road, but allows a turn at a real junction', () => {
    const w = structuredClone(world); w.routes.push({ id: 'bad', name: 'bad', description: '', region: 'x', tags: [], loop: false, edges: [{ id: 'e-seafront', reverse: false }, { id: 'e-seafront', reverse: true }] });
    expect(validateWorld(w).errors.some((m) => m.startsWith('route bad'))).toBe(true);
  });
});

describe('route profiles — distance, ascent and climbs are computed from the network, never typed in', () => {
  const routes = Object.fromEntries(world.routes.map((r) => [r.id, buildRoute(world, r.id, sampled)]));
  it('Harbour Spin is a short flat loop', () => { const r = routes['harbour-spin']!; expect(r.lengthM).toBeGreaterThan(5500); expect(r.lengthM).toBeLessThan(9000); expect(r.maxGradePct).toBeLessThan(2.6); expect(r.climbs).toHaveLength(0); });
  it('Lagoon Lap is flat and long, with the Lagoon Sprint segment timed in the riding direction', () => { const r = routes['lagoon-lap']!; expect(r.lengthM).toBeGreaterThan(15000); expect(r.segments.map((s) => s.name)).toContain('Lagoon Sprint'); });
  it('Downs Rollers finds its categorised climbs (Greenfold Ramp and Stone Circle)', () => {
    const r = routes['downs-rollers']!; expect(r.ascentM).toBeGreaterThan(150); expect(r.climbs.length).toBeGreaterThanOrEqual(2);
    expect(r.climbs.every((c) => c.avgGradePct >= 3 && c.lengthM >= 500)).toBe(true); expect(r.segments.map((s) => s.name)).toEqual(expect.arrayContaining(['Greenfold Ramp', 'Stone Circle']));
  });
  it('loops wrap: riding past the finish continues from the start', () => { const r = routes['harbour-spin']!; expect(profileAt(r, r.lengthM + 10).d).toBeCloseTo(10, 0); });
  it('reads the gradient ahead from the profile (what the trainer will be sent)', () => { const r = routes['downs-rollers']!; const c = r.climbs[0]!; expect(gradeAhead(r, (c.startM + c.endM) / 2, 20)).toBeGreaterThan(2); });
});

describe('climb categories (stage profile banners)', () => {
  it('scores length × gradient into Cat 4 … HC', () => { expect(climbCategory(1000, 8)).toBe('4'); expect(climbCategory(5000, 7)).toBe('2'); expect(climbCategory(13500, 7.8)).toBe('HC'); expect(climbCategory(400, 5)).toBeNull(); });
  it('detects a 1.5 km climb at 6 % in a synthetic profile', () => { const y = Array.from({ length: 1001 }, (_, i) => (i < 300 ? 0 : i < 600 ? (i - 300) * 0.3 : 90)); const c = detectClimbs(y, 5); expect(c).toHaveLength(1); expect(c[0]!.avgGradePct).toBeCloseTo(6, 0); });
});
