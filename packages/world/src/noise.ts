// Seeded noise (deterministic from the world seed, so every build produces the same world).
export function mulberry32(seed: number) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
export function makeNoise2(seed: number) {
  const rnd = mulberry32(seed); const perm = [...Array(256).keys()];
  for (let i = 255; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [perm[i], perm[j]] = [perm[j]!, perm[i]!]; }
  const p = new Uint8Array(512); for (let i = 0; i < 512; i++) p[i] = perm[i & 255]!;
  const grad = (h: number, x: number, y: number) => { switch (h & 7) { case 0: return x + y; case 1: return -x + y; case 2: return x - y; case 3: return -x - y; case 4: return x; case 5: return -x; case 6: return y; default: return -y; } };
  const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10); const lerp = (a: number, b: number, t: number) => a + t * (b - a);
  return (x: number, y: number) => { const fx = Math.floor(x), fy = Math.floor(y); const X = fx & 255, Y = fy & 255; x -= fx; y -= fy; const u = fade(x), v = fade(y); const a = p[X]! + Y, b = p[X + 1]! + Y;
    return lerp(lerp(grad(p[a]!, x, y), grad(p[b]!, x - 1, y), u), lerp(grad(p[a + 1]!, x, y - 1), grad(p[b + 1]!, x - 1, y - 1), u), v) * 0.7; };
}
export function fbm(n: (x: number, y: number) => number, x: number, y: number, oct = 5) { let s = 0, a = 1, f = 1, norm = 0; for (let i = 0; i < oct; i++) { s += a * n(x * f, y * f); norm += a; a *= 0.5; f *= 2; } return s / norm; }
export const smoothstep = (e0: number, e1: number, x: number) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
