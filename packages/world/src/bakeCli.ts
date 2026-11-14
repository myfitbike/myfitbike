// pnpm --filter @myfitbike/world bake  →  apps/web/public/world/velora/ (ships with the app; cached by the browser).
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { bakeWorld } from './bake';
import { validateWorld } from './validate';
import type { World } from './types';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const world = JSON.parse(readFileSync(`${root}content/world/velora/world.json`, 'utf8')) as World;
const { errors } = validateWorld(world); if (errors.length) { console.error(`world.json invalid:\n  ${errors.join('\n  ')}`); process.exit(1); } // fail the build (plan 7.0 step 3)
const t = Date.now(); const { manifest, chunks, far, scenery } = bakeWorld(world);
const out = `${root}apps/web/public/world/velora/`; rmSync(out, { recursive: true, force: true }); mkdirSync(`${out}chunks`, { recursive: true });
for (const [k, h] of chunks) writeFileSync(`${out}chunks/${k}.f32`, Buffer.from(h.buffer));
writeFileSync(`${out}far.f32`, Buffer.from(far.buffer));
// Per-region scenery packs (plan 7.0 step 7): the renderer loads only the regions a route passes through.
const regionAt = (x: number, z: number) => world.regions.find((r) => { let inside = false; const p = r.polygon; for (let i = 0, j = p.length - 1; i < p.length; j = i++) { const [xi, zi] = p[i]!, [xj, zj] = p[j]!; if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside; } return inside; })?.id ?? 'sea';
const packs: Record<string, { trees: number[]; houses: typeof scenery.houses; props: Record<string, number[] | number[][]> }> = {};
const pack = (x: number, z: number) => (packs[regionAt(x, z)] ??= { trees: [], houses: [], props: Object.fromEntries(Object.keys(scenery.props).map((k) => [k, []])) });
for (let i = 0; i < scenery.trees.length; i += 6) pack(scenery.trees[i]!, scenery.trees[i + 2]!).trees.push(...scenery.trees.slice(i, i + 6));
for (const h of scenery.houses) pack(h.x, h.z).houses.push(h);
const strides: Record<string, number> = { sheep: 4, cows: 4, rocks: 5, bushes: 5, flowers: 4, bales: 4, reeds: 4, ducks: 4, boats: 5 };
for (const [k, arr] of Object.entries(scenery.props)) {
  if (k === 'walls' || k === 'fences') { for (const run of arr as number[][]) (pack(run[0]!, run[2]!).props[k] as number[][]).push(run); continue; }
  const st = strides[k]!; const a = arr as number[]; for (let i = 0; i < a.length; i += st) (pack(a[i]!, a[i + 2]!).props[k] as number[]).push(...a.slice(i, i + st));
}
for (const [id, p] of Object.entries(packs)) writeFileSync(`${out}scenery-${id}.json`, JSON.stringify(p));
writeFileSync(`${out}scenery-common.json`, JSON.stringify({ lakes: scenery.lakes, checkpoints: scenery.checkpoints, landmarks: scenery.landmarks }));
writeFileSync(`${out}manifest.json`, JSON.stringify({ ...manifest, packs: Object.keys(packs) }));
const bytes = chunks.size * chunks.values().next().value!.byteLength + far.byteLength;
console.log(`baked ${chunks.size} chunks + far mesh in ${Date.now() - t} ms (${(bytes / 1e6).toFixed(1)} MB terrain), ${scenery.trees.length / 6} trees, ${scenery.houses.length} houses, ${scenery.checkpoints.length} checkpoints`);
