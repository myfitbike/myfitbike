// pnpm --filter @veloworld/world bake  →  apps/web/public/world/velora/ (ships with the app; cached by the browser).
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
writeFileSync(`${out}far.f32`, Buffer.from(far.buffer)); writeFileSync(`${out}scenery.json`, JSON.stringify(scenery)); writeFileSync(`${out}manifest.json`, JSON.stringify(manifest));
const bytes = chunks.size * chunks.values().next().value!.byteLength + far.byteLength;
console.log(`baked ${chunks.size} chunks + far mesh in ${Date.now() - t} ms (${(bytes / 1e6).toFixed(1)} MB terrain), ${scenery.trees.length / 6} trees, ${scenery.houses.length} houses, ${scenery.checkpoints.length} checkpoints`);
