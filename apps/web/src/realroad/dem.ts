// Elevation tiles for real-road mode (plan 7.1). Mapterhorn first (512 px Terrarium WebP, keyless, CORS *), AWS
// Terrain Tiles as fallback (256 px Terrarium PNG, keyless, CORS *). Terrarium: metres = R*256 + G + B/256 − 32768.
// Tiles are fetched once while preparing / baking; nothing is fetched during a ride.
type Tile = { size: number; h: Float32Array };
export const DEM_ATTRIBUTION = 'Elevation © Mapterhorn · Terrain Tiles (USGS and others)'; // full source list: mapterhorn.com/attribution, content/ATTRIBUTIONS.md
const SOURCES = [
  { url: (z: number, x: number, y: number) => `https://tiles.mapterhorn.com/${z}/${x}/${y}.webp`, size: 512 },
  { url: (z: number, x: number, y: number) => `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`, size: 256 },
];

export const lonToX = (lon: number, z: number) => ((lon + 180) / 360) * 2 ** z;
export const latToY = (lat: number, z: number) => { const r = (lat * Math.PI) / 180; return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z; };

async function decode(blob: Blob): Promise<Tile> {
  // no colour management or premultiplication: the RGB bytes are data, not colour
  const bmp = await createImageBitmap(blob, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
  const c = new OffscreenCanvas(bmp.width, bmp.height); const g = c.getContext('2d', { willReadFrequently: true })!; g.drawImage(bmp, 0, 0);
  const px = g.getImageData(0, 0, bmp.width, bmp.height).data; const h = new Float32Array(bmp.width * bmp.height);
  for (let i = 0; i < h.length; i++) h[i] = px[i * 4]! * 256 + px[i * 4 + 1]! + px[i * 4 + 2]! / 256 - 32768;
  return { size: bmp.width, h };
}
async function fetchTile(z: number, x: number, y: number, fetchFn: typeof fetch): Promise<Tile | null> {
  for (const s of SOURCES) { try { const r = await fetchFn(s.url(z, x, y)); if (r.ok) return await decode(await r.blob()); } catch { /* try the next source */ } }
  return null;
}

/** Holds decoded tiles at a detailed zoom (near the road) and a coarse zoom (skyline); samples bilinearly. */
export class Dem {
  private tiles = new Map<string, Tile | null>(); failed = 0; loaded = 0;
  constructor(public nearZ = 13, public farZ = 10, private fetchFn: typeof fetch = fetch.bind(globalThis)) {}
  /** Tile keys at zoom z covering the given lat/lon points (each padded by padM metres). */
  keysFor(z: number, pts: [number, number][], padM: number): string[] {
    const out = new Set<string>(); for (const [lat, lon] of pts) { const dLat = padM / 111195, dLon = padM / (111195 * Math.cos((lat * Math.PI) / 180));
      for (const la of [lat - dLat, lat + dLat]) for (const lo of [lon - dLon, lon + dLon]) out.add(`${z}/${Math.floor(lonToX(lo, z))}/${Math.floor(latToY(la, z))}`); out.add(`${z}/${Math.floor(lonToX(lon, z))}/${Math.floor(latToY(lat, z))}`); }
    return [...out].filter((k) => !this.tiles.has(k));
  }
  async load(keys: string[], onTile?: (done: number, total: number) => void) {
    let done = 0; const queue = [...keys];
    await Promise.all(Array.from({ length: 6 }, async () => { for (let k = queue.shift(); k; k = queue.shift()) { const [z, x, y] = k.split('/').map(Number) as [number, number, number]; const t = await fetchTile(z, x, y, this.fetchFn); this.tiles.set(k, t); if (t) this.loaded++; else this.failed++; onTile?.(++done, keys.length); } }));
  }
  private sampleAt(z: number, lat: number, lon: number): number | null {
    const fx = lonToX(lon, z), fy = latToY(lat, z); const tx = Math.floor(fx), ty = Math.floor(fy); const t = this.tiles.get(`${z}/${tx}/${ty}`); if (!t) return null;
    const px = (fx - tx) * t.size - 0.5, py = (fy - ty) * t.size - 0.5; const x0 = Math.max(0, Math.min(t.size - 1, Math.floor(px))), y0 = Math.max(0, Math.min(t.size - 1, Math.floor(py)));
    const x1 = Math.min(t.size - 1, x0 + 1), y1 = Math.min(t.size - 1, y0 + 1); const ax = Math.max(0, Math.min(1, px - x0)), ay = Math.max(0, Math.min(1, py - y0)); const H = t.h, S = t.size;
    return (H[y0 * S + x0]! * (1 - ax) + H[y0 * S + x1]! * ax) * (1 - ay) + (H[y1 * S + x0]! * (1 - ax) + H[y1 * S + x1]! * ax) * ay;
  }
  /** Detailed tile if loaded, else the coarse one, else null. */
  height(lat: number, lon: number): number | null { return this.sampleAt(this.nearZ, lat, lon) ?? this.sampleAt(this.farZ, lat, lon); }
}
