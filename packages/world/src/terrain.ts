// Natural terrain height (before conforming to roads) — island blobs, stamps, lakes and region-aware noise.
// Used by the 3D bake (Phase 4) and the map's hill shading. Deterministic from the seed.
import { fbm, makeNoise2, smoothstep } from './noise';
import type { World } from './types';

export function islandMask(world: World) {
  const n2 = makeNoise2(world.seed + 1);
  return (x: number, z: number) => { let m = -1; for (const isl of world.islands) { const q = ((x - isl.center[0]) / isl.radii[0]) ** 2 + ((z - isl.center[1]) / isl.radii[1]) ** 2; m = Math.max(m, 1 - q + 0.16 * fbm(n2, x / 1800, z / 1800, 4)); } return m; };
}
export function makeHeightFn(world: World) {
  const n1 = makeNoise2(world.seed), n3 = makeNoise2(world.seed + 2), mask = islandMask(world);
  return (x: number, z: number) => {
    const m = mask(x, z); let h = 6 + 8 * fbm(n1, x / 900, z / 900, 5);
    for (const st of world.heightStamps) {
      if (st.kind === 'mountain' && st.pos) { const d = Math.hypot(x - st.pos[0], z - st.pos[2]); h += st.height * Math.exp(-((d / (st.radius ?? 500)) ** 2)) * (1 + 0.15 * fbm(n3, x / 250, z / 250, 4)); }
      else if (st.kind === 'ridge' && st.from && st.to) { const [ax, az] = st.from, [bx, bz] = st.to; const vx = bx - ax, vz = bz - az; const t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / (vx * vx + vz * vz))); const d = Math.hypot(x - (ax + vx * t), z - (az + vz * t)); const rg = 1 - Math.abs(fbm(n3, x / 900, z / 900, 6)); h += st.height * Math.exp(-((d / (st.width ?? 800)) ** 2)) * (0.55 + 0.6 * rg * rg); }
    }
    for (const lk of world.lakes) { const d = Math.hypot(x - lk.center[0], z - lk.center[1]); const edge = lk.radius * (1 + 0.22 * fbm(n3, x / 110, z / 110, 3)); const t = d / edge; if (t < 1) h = lk.level - 0.4 - lk.depth * (1 - t * t); else if (t < 1.7) h = Math.min(h, lk.level + 0.3 + (h - lk.level - 0.3) * smoothstep(1, 1.7, t)); }
    return -24 + (h + 24) * smoothstep(-0.04, 0.1, m);
  };
}
