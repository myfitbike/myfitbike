// The one check every prepared real-road world goes through, on arrival and when a stored one is loaded. The road's
// length decides how many 5 m samples the server builds (memory, CPU) and how often the segment loop runs, so nothing
// here may come from the request unchecked (security audit 2, V1/V2). The rules follow what buildRealWorld sends.
import { sampleEdge, type Edge, type Route, type Segment, type Vec3, type World } from '@myfitbike/world';
import { MAX_POINT_GAP_M, MAX_ROUTE_M, MAX_ROUTE_POINTS, MAX_WORLD_SEGMENTS, MIN_ROUTE_M, text } from './limits.js';

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);
const fin = (v: unknown, min: number, max: number): v is number => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
const str = (v: unknown, min: number, max: number): v is string => typeof v === 'string' && v.length >= min && v.length <= max;
/** Decoration the renderer reads but the server never builds from: kept as sent, but small. */
const smallList = (v: unknown, items: number, chars: number): unknown[] | null => Array.isArray(v) && v.length <= items && JSON.stringify(v).length <= chars ? v : null;

/** A prepared real-road world made safe to store and to build a route from — rebuilt from known fields only — or the
 *  reason it is refused. The sample count, and so memory and CPU, follows from the road's length (security audit 2, V1/V2). */
export function cleanRealWorld(raw: unknown, routeId: string): { world: World } | { error: string } {
  const bad = (error: string) => ({ error });
  if (!isObj(raw)) return bad('world: expected an object');
  const name = text(raw.name, 120); if (!name) return bad('name: 1–120 characters');
  if (!Array.isArray(raw.edges) || raw.edges.length !== 1 || !isObj(raw.edges[0])) return bad('edges: exactly one road');
  const e = raw.edges[0]; const edgeId = text(e.id, 100); if (!edgeId) return bad('edge id: 1–100 characters');
  const edgeName = e.name === undefined ? name : text(e.name, 120); if (!edgeName) return bad('edge name: 1–120 characters');
  if (!str(e.from, 1, 40) || !str(e.to, 1, 40)) return bad('edge from/to: 1–40 characters');
  if (e.surface !== 'asphalt' && e.surface !== 'cobble' && e.surface !== 'gravel' && e.surface !== 'boardwalk') return bad('edge surface');
  if (!fin(e.width, 1, 30)) return bad('edge width: 1–30 m');
  const pts = e.points; if (!Array.isArray(pts) || pts.length < 2 || pts.length > MAX_ROUTE_POINTS) return bad(`points: 2–${MAX_ROUTE_POINTS}`);
  let len = 0; const points: Vec3[] = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]; if (!Array.isArray(p) || p.length !== 3 || !fin(p[0], -400_000, 400_000) || !fin(p[1], -500, 9000) || !fin(p[2], -400_000, 400_000)) return bad(`point ${i}: [x, elevation, z] in metres`);
    if (i) { const q = points[i - 1]!; const d = Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]); if (d > MAX_POINT_GAP_M) return bad(`point ${i}: more than ${MAX_POINT_GAP_M} m from the one before`); len += d; }
    points.push([p[0], p[1], p[2]]);
  }
  if (len < MIN_ROUTE_M || len > MAX_ROUTE_M) return bad(`route length: ${MIN_ROUTE_M} m – ${MAX_ROUTE_M / 1000} km`);
  const roadM = sampleEdge(points, 5).length; /* bounded now: ≤ 330 km → ≤ 66,000 samples. Segments are measured on this spline, not the polyline */
  const edge: Edge = { id: edgeId, name: edgeName, from: e.from, to: e.to, points, surface: e.surface, width: e.width };

  if (!Array.isArray(raw.routes) || raw.routes.length !== 1 || !isObj(raw.routes[0])) return bad('routes: exactly one');
  const r = raw.routes[0]; const rName = text(r.name, 120);
  if (r.id !== routeId) return bad('world does not match this route');
  if (!rName || !str(r.description, 0, 300) || typeof r.loop !== 'boolean' || !str(r.region, 0, 40)) return bad('route: name, description, loop, region');
  if (!Array.isArray(r.tags) || r.tags.length > 10 || !r.tags.every((t) => str(t, 0, 40))) return bad('route tags: ≤ 10 of ≤ 40 characters');
  if (!Array.isArray(r.edges) || r.edges.length !== 1 || !isObj(r.edges[0]) || r.edges[0].id !== edgeId || r.edges[0].reverse !== false) return bad('route edges: the one road, forwards');
  const route: Route = { id: routeId, name: rName, description: r.description, edges: [{ id: edgeId, reverse: false }], loop: r.loop, region: r.region, tags: r.tags as string[] };

  const segs = raw.segments ?? []; if (!Array.isArray(segs) || segs.length > MAX_WORLD_SEGMENTS) return bad(`segments: ≤ ${MAX_WORLD_SEGMENTS}`);
  const segments: Segment[] = [];
  for (const [i, s] of segs.entries()) {
    if (!isObj(s)) return bad(`segment ${i}`); const id = text(s.id, 100), sName = text(s.name, 120);
    if (!id || !sName || (s.kind !== 'climb' && s.kind !== 'sprint') || s.edge !== edgeId || !fin(s.from, 0, roadM + 1) || !fin(s.to, 0, roadM + 1) || !(s.from < s.to)) return bad(`segment ${i}: on the road, from < to`);
    segments.push({ id, name: sName, kind: s.kind, edge: edgeId, from: s.from, to: s.to });
  }

  const version = raw.version ?? 1, seed = raw.seed ?? 0; if (!fin(version, 0, Number.MAX_SAFE_INTEGER) || !fin(seed, 0, Number.MAX_SAFE_INTEGER)) return bad('version, seed');
  const size = raw.size; if (!Array.isArray(size) || size.length !== 2 || !fin(size[0], 0, 2_000_000) || !fin(size[1], 0, 2_000_000)) return bad('size');
  const small: Obj = {};
  for (const k of ['islands', 'regions', 'nodes']) { const v = smallList(raw[k] ?? [], 4, 4000); if (!v) return bad(`${k}: ≤ 4 items`); small[k] = v; }
  for (const k of ['lakes', 'heightStamps', 'landmarks', 'towns']) { const v = smallList(raw[k] ?? [], 50, 20_000); if (!v) return bad(`${k}: ≤ 50 items`); small[k] = v; }
  const g = raw.geo; if (!isObj(g) || !fin(g.lat0, -90, 90) || !fin(g.lon0, -180, 180)) return bad('geo: lat0, lon0');
  const out: Obj = { version, seed, size: [size[0], size[1]], name, ...small, edges: [edge], routes: [route], segments, geo: { lat0: g.lat0, lon0: g.lon0 } };
  if (raw.source !== undefined) { /* file names reach 255 characters on common file systems */
    const s = raw.source; if (!isObj(s) || !str(s.fileName, 0, 255) || !Number.isInteger(s.points) || !fin(s.points, 0, MAX_ROUTE_POINTS) || (s.elevation !== 'dem' && s.elevation !== 'gps' && s.elevation !== 'mixed')) return bad('source');
    out.source = { fileName: s.fileName, points: s.points, elevation: s.elevation };
  }
  return { world: out as unknown as World };
}
