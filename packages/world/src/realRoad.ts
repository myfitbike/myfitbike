// Optional real-road mode (plan Phase 6, sections 7.1–7.3). Pure steps of route preparation; the browser worker adds
// elevation-tile fetching and the bake. A real route becomes a one-road World (one edge, one route, climbs as
// segments), so the existing route profile, engine, stage profile, bake and renderer are reused unchanged.
import { detectClimbs } from './route';
import { sampleEdge } from './spline';
import type { Biome, Vec3, World } from './types';

export type TrackPoint = { lat: number; lon: number; ele?: number };
export type Track = { name: string; points: TrackPoint[] };
export type Geo = { lat0: number; lon0: number };
const R = 6371008.8; const RAD = Math.PI / 180;

// ---- 7.2 step 1: parse GPX / TCX / FIT to points ----
export function parseTrack(data: string | Uint8Array, fileName: string, decodeFit?: (b: Uint8Array) => { num: number; fields: Record<number, number | string> }[]): Track {
  const base = fileName.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim() || 'Imported route';
  if (typeof data !== 'string') {
    if (!decodeFit) throw new Error('FIT decoder missing'); const msgs = decodeFit(data); const SC = 180 / 2 ** 31;
    // record (20): 0 position_lat, 1 position_long (semicircles), 2 altitude (/5 − 500), 78 enhanced_altitude (/5 − 500); course (31) field 5 = name
    const pts = msgs.filter((m) => m.num === 20 && typeof m.fields[0] === 'number' && typeof m.fields[1] === 'number').map((m) => {
      const alt = (m.fields[78] ?? m.fields[2]) as number | undefined; return { lat: (m.fields[0] as number) * SC, lon: (m.fields[1] as number) * SC, ele: alt === undefined ? undefined : alt / 5 - 500 }; });
    const name = msgs.find((m) => m.num === 31)?.fields[5]; return { name: typeof name === 'string' && name ? name : base, points: pts };
  }
  const attr = (tag: string, a: string) => new RegExp(`${a}\\s*=\\s*["']([-+0-9.eE]+)["']`).exec(tag)?.[1];
  const nameOf = (xml: string) => /<name>\s*(?:<!\[CDATA\[)?([^<\]]+)/.exec(xml)?.[1]?.trim();
  if (/<TrainingCenterDatabase/i.test(data)) {
    const pts: TrackPoint[] = []; for (const m of data.matchAll(/<Trackpoint>([\s\S]*?)<\/Trackpoint>/g)) { const b = m[1]!; const lat = /<LatitudeDegrees>([^<]+)/.exec(b)?.[1], lon = /<LongitudeDegrees>([^<]+)/.exec(b)?.[1], ele = /<AltitudeMeters>([^<]+)/.exec(b)?.[1];
      if (lat && lon) pts.push({ lat: +lat, lon: +lon, ele: ele ? +ele : undefined }); }
    return { name: /<Name>([^<]+)<\/Name>/.exec(data)?.[1]?.trim() || base, points: pts };
  }
  if (/<gpx/i.test(data)) {
    const grab = (tag: 'trkpt' | 'rtept') => { const pts: TrackPoint[] = []; for (const m of data.matchAll(new RegExp(`<${tag}\\b([^>]*?)(\\/>|>([\\s\\S]*?)<\\/${tag}>)`, 'g'))) { const lat = attr(m[1]!, 'lat'), lon = attr(m[1]!, 'lon'); const ele = m[3] ? /<ele>([^<]+)/.exec(m[3])?.[1] : undefined; if (lat && lon) pts.push({ lat: +lat, lon: +lon, ele: ele ? +ele : undefined }); } return pts; };
    const trk = grab('trkpt'); const pts = trk.length ? trk : grab('rtept'); // a track wins over a planned route in the same file
    return { name: nameOf(data.replace(/<metadata>[\s\S]*?<\/metadata>/, '')) || nameOf(data) || base, points: pts };
  }
  throw new Error('Unrecognised file: use .gpx, .tcx or .fit');
}

export function haversine(a: TrackPoint, b: TrackPoint) { const dLat = (b.lat - a.lat) * RAD, dLon = (b.lon - a.lon) * RAD; const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin(dLon / 2) ** 2; return 2 * R * Math.asin(Math.min(1, Math.sqrt(h))); }

/** 7.2 reject / warn rules: fewer than 20 points, shorter than 500 m, gaps over 500 m, longer than 300 km. */
export function checkTrack(t: Track): { errors: string[]; warnings: string[]; lengthM: number } {
  const errors: string[] = [], warnings: string[] = []; const p = t.points.filter((q) => Number.isFinite(q.lat) && Number.isFinite(q.lon) && Math.abs(q.lat) <= 85);
  if (p.length < 20) errors.push(`Only ${p.length} track points (need at least 20)`);
  let L = 0, gaps = 0; for (let i = 1; i < p.length; i++) { const d = haversine(p[i - 1]!, p[i]!); L += d; if (d > 500) gaps++; }
  if (p.length >= 20 && L < 500) errors.push(`Route is only ${Math.round(L)} m long (need at least 500 m)`);
  if (L > 300000) errors.push(`Route is ${(L / 1000).toFixed(0)} km long (limit 300 km)`);
  if (gaps) warnings.push(`${gaps} gap${gaps > 1 ? 's' : ''} over 500 m between points — those parts are straight lines`);
  return { errors, warnings, lengthM: L };
}

// ---- local projection (equirectangular about the route centre; x east, z south, metres) ----
export function geoOrigin(points: TrackPoint[]): Geo { const lats = points.map((p) => p.lat), lons = points.map((p) => p.lon); return { lat0: (Math.min(...lats) + Math.max(...lats)) / 2, lon0: (Math.min(...lons) + Math.max(...lons)) / 2 }; }
export function project(g: Geo, lat: number, lon: number): [number, number] { return [(lon - g.lon0) * RAD * R * Math.cos(g.lat0 * RAD), -(lat - g.lat0) * RAD * R]; }
export function unproject(g: Geo, x: number, z: number): [number, number] { return [g.lat0 - z / (R * RAD), g.lon0 + x / (R * RAD * Math.cos(g.lat0 * RAD))]; }

/** 7.2 step 2: resample the horizontal path every `step` metres (duplicate points dropped). */
export function resample(xz: [number, number][], step = 5): { x: number[]; z: number[] } {
  const p = xz.filter((q, i) => i === 0 || Math.hypot(q[0] - xz[i - 1]![0], q[1] - xz[i - 1]![1]) > 0.01); const cum = [0];
  for (let i = 1; i < p.length; i++) cum.push(cum[i - 1]! + Math.hypot(p[i]![0] - p[i - 1]![0], p[i]![1] - p[i - 1]![1]));
  const L = cum.at(-1)!; const n = Math.max(1, Math.round(L / step)); const x: number[] = [], z: number[] = []; let j = 0;
  for (let k = 0; k <= n; k++) { const s = (L * k) / n; while (j < p.length - 2 && cum[j + 1]! < s) j++; const f = (s - cum[j]!) / (cum[j + 1]! - cum[j]! || 1); x.push(p[j]![0] + (p[j + 1]![0] - p[j]![0]) * f); z.push(p[j]![1] + (p[j + 1]![1] - p[j]![1]) * f); }
  return { x, z };
}

/** 7.2 step 3: 50 m moving-average smoothing, then clamp the gradient to ±maxPct so no GPS/DEM spike reaches the trainer.
 *  With the path (x, z), the window widens to `hairpinWindowM` around tight turns (heading change over 90° within
 *  ±40 m, or over 135° within ±100 m): the track packs a hairpin's height gain into its short apex, which would read as a 20 %+ wall. */
export function smoothElevation(y: number[], step = 5, windowM = 50, maxPct = 25, path?: { x: number[]; z: number[] }, hairpinWindowM = 200): number[] {
  const n = y.length; const base = Math.max(1, Math.round(windowM / step / 2)); const half = new Array<number>(n).fill(base);
  if (path) { const k = Math.round(40 / step); const wide = Math.round(hairpinWindowM / step / 2); const head = (i: number) => Math.atan2(path.z[Math.min(n - 1, i + 1)]! - path.z[i]!, path.x[Math.min(n - 1, i + 1)]! - path.x[i]!);
    const turn = (i: number, kk: number) => { let d = Math.abs(head(Math.min(n - 2, i + kk)) - head(Math.max(0, i - kk))); if (d > Math.PI) d = 2 * Math.PI - d; return d; };
    for (let i = k; i < n - k - 1; i++) { if (turn(i, k) > Math.PI / 2 || turn(i, k * 2.5) > (3 * Math.PI) / 4) for (let j = Math.max(0, i - wide); j <= Math.min(n - 1, i + wide); j++) half[j] = Math.max(half[j]!, Math.round(wide * (1 - Math.abs(j - i) / (wide * 2)))); } }
  const pre = [0]; for (const v of y) pre.push(pre.at(-1)! + v);
  const s = y.map((_, i) => { const h = half[i]!; const a = Math.max(0, i - h), b = Math.min(n - 1, i + h); return (pre[b + 1]! - pre[a]!) / (b - a + 1); });
  const lim = (maxPct / 100) * step; for (let pass = 0; pass < 2; pass++) { for (let i = 1; i < n; i++) s[i] = Math.min(s[i - 1]! + lim, Math.max(s[i - 1]! - lim, s[i]!)); for (let i = n - 2; i >= 0; i--) s[i] = Math.min(s[i + 1]! + lim, Math.max(s[i + 1]! - lim, s[i]!)); }
  return s;
}

/** Base biome for the stylised look from latitude (plan 7.8 climate bands, coarse). */
export function biomeFor(lat: number, _maxEle: number): Biome { const a = Math.abs(lat); if (a > 58) return 'fjord'; if (a < 23) return 'rainforest'; return 'farmland'; } // high ground turns to rock by altitude in the renderer

export type RealWorld = World & { geo: Geo; source: { fileName: string; points: number; elevation: 'dem' | 'gps' | 'mixed' } };
/** Build the one-road World for a prepared route. Control points every 20 m (the spline smooths GPS wobble). */
export function buildRealWorld(opts: { id: string; name: string; geo: Geo; x: number[]; z: number[]; y: number[]; step: number; fileName: string; elevation: RealWorld['source']['elevation'] }): RealWorld {
  const { x, z, y, step } = opts; const every = Math.max(1, Math.round(20 / step)); const pts: Vec3[] = [];
  for (let i = 0; i < x.length; i += every) pts.push([+x[i]!.toFixed(2), +y[i]!.toFixed(2), +z[i]!.toFixed(2)]);
  if ((x.length - 1) % every) pts.push([+x.at(-1)!.toFixed(2), +y.at(-1)!.toFixed(2), +z.at(-1)!.toFixed(2)]);
  const loop = Math.hypot(x[0]! - x.at(-1)!, z[0]! - z.at(-1)!) < 100;
  const minX = Math.min(...x), maxX = Math.max(...x), minZ = Math.min(...z), maxZ = Math.max(...z); const pad = 4000; // far terrain 8 km wide (plan 7.3)
  const W = 2 * Math.max(Math.abs(minX), Math.abs(maxX)) + 2 * pad, H = 2 * Math.max(Math.abs(minZ), Math.abs(maxZ)) + 2 * pad;
  const road = sampleEdge(pts, 5); const climbs = detectClimbs(road.y, road.length / (road.y.length - 1)); const edgeId = `${opts.id}-road`; // on the ridden road line, so climbs end inside the route
  return {
    version: 1, seed: [...opts.id].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7), size: [Math.round(W), Math.round(H)], name: opts.name, islands: [{ center: [0, 0], radii: [W, H] }] /* one island larger than the view: the map shows land, not sea */, lakes: [], heightStamps: [],
    regions: [{ id: 'real', name: '', biome: biomeFor(opts.geo.lat0, Math.max(...y)), polygon: [[-W / 2, -H / 2], [W / 2, -H / 2], [W / 2, H / 2], [-W / 2, H / 2]], maxGradePct: 25, color: '#7a8f5a' }],
    nodes: [{ id: 'a', pos: pts[0]! }, { id: 'b', pos: pts.at(-1)! }],
    edges: [{ id: edgeId, name: opts.name, from: 'a', to: 'b', points: pts, surface: 'asphalt', width: 6 }],
    routes: [{ id: opts.id, name: opts.name, description: `Imported from ${opts.fileName}`, edges: [{ id: edgeId, reverse: false }], loop, region: 'real', tags: ['real-road'] }],
    segments: climbs.map((c, i) => ({ id: `${opts.id}-climb-${i + 1}`, name: `Climb ${i + 1} (cat ${c.category})`, kind: 'climb' as const, edge: edgeId, from: Math.round(c.startM), to: Math.round(c.endM) })),
    landmarks: [], towns: [], geo: opts.geo, source: { fileName: opts.fileName, points: pts.length, elevation: opts.elevation },
  };
}
