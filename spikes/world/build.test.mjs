import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { build } from './build.mjs';

const world = () => JSON.parse(readFileSync(new URL('./world.json', import.meta.url), 'utf8'));
const hashOf = (b) => { const h = createHash('sha256'); const { _bin, ...rest } = b; h.update(JSON.stringify(rest)); for (const a of Object.values(_bin)) h.update(Buffer.from(a.buffer)); return h.digest('hex'); };

test('bake is byte-identical across builds, so scenery never moves between app versions with the same seed', () => {
  assert.equal(hashOf(build(world())), hashOf(build(world())));
});

test('a road steeper than its region limit fails the build, so the trainer is never sent a gradient the designer did not intend', () => {
  const w = world(); const e = w.edges.find((x) => x.id === 'e-north');
  e.points[10] = [e.points[10][0], e.points[10][1] + 12, e.points[10][2]]; // ~24 % ramp over 50 m
  assert.throws(() => build(w), /gradient .* exceeds region limit/);
});

test('a route whose edges do not join fails the build, so a loop can always be ridden without a jump', () => {
  const w = world(); w.routes[0].edges = [{ id: 'e-north', reverse: false }, { id: 'e-spur', reverse: false }];
  assert.throws(() => build(w), /does not connect/);
});

test('the designed climb measures as designed: 1 km at about 6 %, ~60 m gain on the loop', () => {
  const r = build(world()).routes[0];
  assert.ok(Math.abs(r.lengthM - 4978) < 30, `length ${r.lengthM}`);
  assert.ok(r.ascentM > 58 && r.ascentM < 68, `ascent ${r.ascentM}`);
  const climb = r.gradePer10m.slice(Math.round(2478 / 10) + 40, Math.round(2478 / 10) + 85); // middle of the climb on e-south
  const avg = climb.reduce((a, b) => a + b, 0) / climb.length;
  assert.ok(Math.abs(avg - 6) < 0.3, `climb average ${avg.toFixed(2)} %`);
});
