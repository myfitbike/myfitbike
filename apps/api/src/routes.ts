// Route-related API: segment efforts and PBs, the ghost (your best earlier ride of a route), past rides per route.
import { Hono } from 'hono';
import type pg from 'pg';
import { buildRoute, sampleWorld, validateWorld, type RouteProfile, type World } from '@myfitbike/world';
import type { Sample } from '@myfitbike/shared';
import { loadSamples } from './rides.js';
import { realRoute } from './realRoutes.js';
import { MAX_LAPS, MAX_RIDE_T_S, MAX_SEGMENT_EFFORTS } from './limits.js';

/** Where the Velora world comes from: the file on disk (Node, with the dev editor's save) or bundled JSON (Workers). */
export type WorldSource = { load: () => World; save?: (w: World) => void };
let source: WorldSource | null = null;
export const useWorldSource = (s: WorldSource) => { source = s; cache = null; };
let cache: { world: World; routes: Map<string, RouteProfile> } | null = null;
export function world() { if (!cache) { if (!source) throw new Error('world source not set (useWorldSource)'); const w = source.load(); const s = sampleWorld(w); cache = { world: w, routes: new Map(w.routes.map((r) => [r.id, buildRoute(w, r.id, s)])) }; } return cache; }
export function reloadWorld() { cache = null; }

/** Time at which the rider passed distance d (interpolated between 1 s samples). */
function tAt(samples: Sample[], d: number): number | null {
  for (let i = 1; i < samples.length; i++) { const a = samples[i - 1]!, b = samples[i]!; if (a.distance <= d && b.distance >= d) return a.t + (b.distance > a.distance ? (d - a.distance) / (b.distance - a.distance) : 0) * (b.t - a.t); }
  return null;
}
/** Every pass over each segment of the route (laps included), with elapsed time and average power. */
export function segmentEfforts(route: RouteProfile, samples: Sample[]) {
  const out: { segmentId: string; elapsedS: number; avgPowerW: number | null; startT: number }[] = []; const total = samples.at(-1)?.distance ?? 0;
  if (!(route.lengthM >= 1) || !route.segments.length) return out; /* a 0 m route would loop forever (security audit 2, V1) */
  const laps = Math.min(MAX_LAPS, Math.ceil(total / route.lengthM)); /* same as lap * L < total for whole laps, but bounded */
  for (let lap = 0; lap < laps && out.length < MAX_SEGMENT_EFFORTS; lap++) for (const sg of route.segments) {
    const a = tAt(samples, lap * route.lengthM + sg.startM), b = tAt(samples, lap * route.lengthM + sg.endM); if (a === null || b === null || b <= a) continue;
    const seg = samples.filter((s) => s.t >= a && s.t <= b); const pw = seg.map((s) => s.power ?? 0);
    out.push({ segmentId: sg.id, elapsedS: Math.round((b - a) * 10) / 10, avgPowerW: pw.length ? Math.round(pw.reduce((x, y) => x + y, 0) / pw.length) : null, startT: a });
  }
  return out;
}
export async function recordSegmentEfforts(pool: pg.Pool, rideId: number) {
  const r = (await pool.query<{ route_id: string | null; started_at: Date; profile_id: number }>('select route_id, started_at, profile_id from ride where id=$1', [rideId])).rows[0]; if (!r?.route_id) return;
  const route = world().routes.get(r.route_id) ?? (await realRoute(pool, r.profile_id, r.route_id)); if (!route) return; const samples = await loadSamples(pool, rideId);
  await pool.query('delete from segment_effort where ride_id=$1', [rideId]);
  const efforts = segmentEfforts(route, samples).slice(0, MAX_SEGMENT_EFFORTS); if (!efforts.length) return; /* one statement, not one per effort */
  const vals: unknown[] = []; const tuples = efforts.map((e, i) => { vals.push(rideId, e.segmentId, e.elapsedS, e.avgPowerW, new Date(r.started_at.getTime() + e.startT * 1000)); const o = i * 5; return `($${o + 1},$${o + 2},$${o + 3},$${o + 4},$${o + 5})`; });
  await pool.query(`insert into segment_effort values ${tuples.join(',')} on conflict do nothing`, vals);
}

export function routesRoutes(pool: pg.Pool, profileId: () => Promise<number | null>) {
  const r = new Hono();
  r.get('/segments/:id/best', async (c) => {
    const id = c.req.param('id'); const pid = await profileId(); /* your PBs, not everyone's */
    const q = (since: string | null) => pool.query<{ e: number }>(`select min(elapsed_s) as e from segment_effort se join ride r on r.id = se.ride_id where se.segment_id=$1 and r.profile_id=$2 and r.status='done'${since ? ` and se.started_at > now() - interval '${since}'` : ''}`, [id, pid]);
    const [pb, d30, d90, n] = await Promise.all([q(null), q('30 days'), q('90 days'), pool.query('select count(*)::int as n from segment_effort se join ride r on r.id = se.ride_id where se.segment_id=$1 and r.profile_id=$2', [id, pid])]);
    return c.json({ pbS: pb.rows[0]?.e ?? null, best30S: d30.rows[0]?.e ?? null, best90S: d90.rows[0]?.e ?? null, efforts: n.rows[0].n });
  });
  r.get('/routes/:id/ghost', async (c) => { // the fastest earlier ride that completed the whole route
    const pid = await profileId(); if (pid === null) return c.json(null); const route = world().routes.get(c.req.param('id')) ?? (await realRoute(pool, pid, c.req.param('id'))); if (!route) return c.json(null);
    const rides = (await pool.query<{ id: string; started_at: Date }>("select id, started_at from ride where profile_id=$1 and route_id=$2 and status='done' and (summary->>'distanceM')::float >= $3 order by started_at desc limit 50", [pid, route.id, route.lengthM * 0.99])).rows;
    let best: { id: number; t: number; startedAt: Date } | null = null; let last: { id: number; startedAt: Date } | null = null;
    for (const ride of rides) { const s = await loadSamples(pool, Number(ride.id)); const t = tAt(s, route.lengthM); if (t !== null && (!best || t < best.t)) best = { id: Number(ride.id), t, startedAt: ride.started_at }; if (!last) last = { id: Number(ride.id), startedAt: ride.started_at }; }
    const pack = async (id: number, label: string) => { const s = await loadSamples(pool, id); const dAt: number[] = []; for (const x of s) if (Number.isInteger(x.t) && x.t >= 0 && x.t <= MAX_RIDE_T_S) dAt[x.t] = x.distance; /* rows stored before input checks may hold a huge t */ for (let i = 1; i < dAt.length; i++) dAt[i] ??= dAt[i - 1]!; dAt[0] ??= 0; return { label, dAt }; };
    const out = []; if (best) out.push(await pack(best.id, 'Personal best')); if (last && last.id !== best?.id) out.push(await pack(last.id, 'Last ride'));
    return c.json(out);
  });
  // World editor (dev only, plan 7.0): validate and write world.json. Never available in production.
  if (source?.save) r.put('/dev/world', async (c) => {
    const w = (await c.req.json()) as World; const { errors } = validateWorld(w); if (errors.length) return c.json({ errors }, 400);
    source!.save!(w); reloadWorld(); return c.json({ ok: true });
  });
  r.get('/routes/:id/rides', async (c) => {
    const pid = await profileId(); if (pid === null) return c.json([]);
    const q = await pool.query("select id, started_at as \"startedAt\", name, summary from ride where profile_id=$1 and route_id=$2 and status='done' order by started_at desc limit 20", [pid, c.req.param('id')]);
    return c.json(q.rows.map((x) => ({ ...x, id: Number(x.id) })));
  });
  return r;
}
