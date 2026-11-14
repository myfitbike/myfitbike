// Real-road preparation and bake (plan 7.2 / 7.3) off the main thread. 'prepare' turns a parsed track into the
// one-road world (DEM elevation, smoothing, climbs); 'bake' builds terrain chunks, far mesh and scenery from the
// elevation tiles and writes them to OPFS (real-<id>/…) so rides never touch the network.
import { bakeWorld, buildRealWorld, geoOrigin, project, resample, sampleWorld, smoothElevation, unproject, type RealWorld, type Track } from '@myfitbike/world';
import { Dem } from './dem';

export type WorkerIn = { kind: 'prepare'; id: string; track: Track; fileName: string } | { kind: 'bake'; id: string; world: RealWorld };
export type WorkerOut = { kind: 'progress'; stage: string; frac: number } | { kind: 'prepared'; world: RealWorld; warnings: string[] } | { kind: 'baked'; bytes: number; ms: number } | { kind: 'error'; message: string };
const post = (m: WorkerOut) => (self as unknown as Worker).postMessage(m);

async function prepare(id: string, track: Track, fileName: string) {
  const g = geoOrigin(track.points); const r = resample(track.points.map((p) => project(g, p.lat, p.lon)), 5);
  const ll = r.x.map((x, i) => unproject(g, x, r.z[i]!)); const dem = new Dem();
  post({ kind: 'progress', stage: 'Fetching elevation', frac: 0 });
  await dem.load(dem.keysFor(dem.nearZ, ll.filter((_, i) => i % 20 === 0), 150), (d, n) => post({ kind: 'progress', stage: 'Fetching elevation', frac: d / n }));
  // GPS elevation only where the elevation model has no data (plan 7.2 step 3), interpolated along the track
  const gpsAt = gpsInterpolator(track, g, r); let dems = 0, gps = 0;
  const raw = ll.map(([lat, lon], i) => { const h = dem.height(lat, lon); if (h !== null) { dems++; return h; } const e = gpsAt(i); if (e !== null) { gps++; return e; } return 0; });
  const warnings: string[] = []; if (!dems && !gps) warnings.push('No elevation data found — the route is treated as flat');
  else if (gps) warnings.push(`${Math.round((gps / ll.length) * 100)} % of the route uses the file's GPS elevation (no elevation tiles there)`);
  const y = smoothElevation(raw, 5, 50, 25, r); // wider window through hairpins
  const world = buildRealWorld({ id, name: track.name, geo: g, x: r.x, z: r.z, y, step: 5, fileName, elevation: !gps ? 'dem' : !dems ? 'gps' : 'mixed' });
  post({ kind: 'prepared', world, warnings });
}
function gpsInterpolator(track: Track, g: { lat0: number; lon0: number }, r: { x: number[]; z: number[] }) {
  const src = track.points.filter((p) => p.ele !== undefined).map((p) => ({ xz: project(g, p.lat, p.lon), e: p.ele! })); if (!src.length) return () => null;
  let j = 0; return (i: number) => { const x = r.x[i]!, z = r.z[i]!; while (j < src.length - 1 && Math.hypot(src[j + 1]!.xz[0] - x, src[j + 1]!.xz[1] - z) <= Math.hypot(src[j]!.xz[0] - x, src[j]!.xz[1] - z)) j++; return src[j]!.e; };
}

async function bake(id: string, world: RealWorld) {
  const t0 = performance.now(); const g = world.geo; const dem = new Dem(); const s = Object.values(sampleWorld(world))[0]!;
  const road = s.x.filter((_, i) => i % 40 === 0).map((x, i) => unproject(g, x, s.z[i * 40]!));
  const [W, H] = world.size; const farZ = Math.max(8, Math.min(11, Math.floor(Math.log2((40075016 * Math.cos((g.lat0 * Math.PI) / 180)) / (Math.max(W, H) / 4))))); dem.farZ = farZ;
  const corners: [number, number][] = []; for (let i = 0; i <= 4; i++) for (let j = 0; j <= 4; j++) corners.push(unproject(g, -W / 2 + (W * i) / 4, -H / 2 + (H * j) / 4));
  const keys = [...dem.keysFor(dem.nearZ, road, 900), ...dem.keysFor(farZ, corners, 0)];
  await dem.load(keys, (d, n) => post({ kind: 'progress', stage: 'Fetching terrain', frac: d / n }));
  post({ kind: 'progress', stage: 'Building the world', frac: 0 });
  const height = (x: number, z: number) => { const [lat, lon] = unproject(g, x, z); return dem.height(lat, lon) ?? 0; };
  const farStep = Math.max(100, Math.ceil(Math.max(W, H) / 1000 / 25) * 25); // far grid ≤ ~1000 × 1000
  const { manifest, chunks, far, scenery } = bakeWorld(world, { height, farStep, treeLine: 2100 });
  post({ kind: 'progress', stage: 'Saving', frac: 0.5 });
  const root = await navigator.storage.getDirectory(); await root.removeEntry(id, { recursive: true }).catch(() => {});
  const dir = await root.getDirectoryHandle(id, { create: true }); const cdir = await dir.getDirectoryHandle('chunks', { create: true }); let bytes = 0;
  const put = async (d: FileSystemDirectoryHandle, name: string, data: Float32Array | string) => { const w = await (await d.getFileHandle(name, { create: true })).createWritable(); await w.write(typeof data === 'string' ? data : new Uint8Array(data.buffer as ArrayBuffer, data.byteOffset, data.byteLength)); await w.close(); bytes += typeof data === 'string' ? data.length : data.byteLength; };
  let n = 0; for (const [k, h] of chunks) { await put(cdir, `${k}.f32`, h); if (++n % 25 === 0) post({ kind: 'progress', stage: 'Saving', frac: 0.5 + (0.5 * n) / chunks.size }); }
  await put(dir, 'far.f32', far);
  await put(dir, 'scenery-real.json', JSON.stringify({ trees: scenery.trees, houses: scenery.houses, props: scenery.props }));
  await put(dir, 'scenery-common.json', JSON.stringify({ lakes: scenery.lakes, checkpoints: scenery.checkpoints, landmarks: scenery.landmarks }));
  await put(dir, 'manifest.json', JSON.stringify({ ...manifest, packs: ['real'], dem: { loaded: dem.loaded, failed: dem.failed } }));
  post({ kind: 'baked', bytes, ms: Math.round(performance.now() - t0) });
}

self.onmessage = (e: MessageEvent<WorkerIn>) => {
  const m = e.data; (m.kind === 'prepare' ? prepare(m.id, m.track, m.fileName) : bake(m.id, m.world)).catch((err: Error) => post({ kind: 'error', message: err.message }));
};
