// Optional real-road mode (Phase 6): store and list routes imported from GPS files. The browser does the elevation
// lookup and the 3D bake; the server keeps the prepared world so rides, ghosts and segment PBs work as for Velora.
import { Hono } from 'hono';
import type pg from 'pg';
import { buildRoute, sampleWorld, type RouteProfile } from '@myfitbike/world';
import { MAX_REAL_ROUTES } from './limits.js';
import { cleanRealWorld } from './realWorld.js';

const cache = new Map<string, RouteProfile>();
/** Route profile by id for this rider: real routes are `real-<row id>`, loaded from the table and cached. Another
 *  rider's route is "not found" — ghosts and segment times are only ever computed on your own routes. */
export async function realRoute(pool: pg.Pool, pid: number | null, id: string): Promise<RouteProfile | undefined> {
  const m = /^real-(\d+)$/.exec(id); if (!m || pid === null) return undefined; const key = `${pid}:${id}`; if (cache.has(key)) return cache.get(key);
  const row = (await pool.query<{ world: unknown }>('select world from real_route where id=$1 and profile_id=$2', [m[1], pid])).rows[0]; if (!row) return undefined;
  const cw = cleanRealWorld(row.world, id); if ('error' in cw) return undefined; /* stored before the strict check: not trusted either (security audit 2, V1/V2) */
  const p = buildRoute(cw.world, id, sampleWorld(cw.world)); cache.set(key, p); if (cache.size > 200) cache.delete(cache.keys().next().value!); /* oldest first */ return p;
}

export function realRoutesRoutes(pool: pg.Pool, profileId: () => Promise<number | null>) {
  const r = new Hono();
  r.get('/', async (c) => {
    const pid = await profileId(); if (pid === null) return c.json([]);
    const q = await pool.query('select id, name, file_name as "fileName", length_m as "lengthM", ascent_m as "ascentM", created_at as "createdAt", builtin from real_route where profile_id=$1 order by created_at desc', [pid]);
    return c.json(q.rows.map((x) => ({ ...x, id: `real-${x.id}` })));
  });
  r.get('/:id', async (c) => {
    const m = /^real-(\d+)$/.exec(c.req.param('id')); if (!m) return c.json({ error: 'not found' }, 404);
    const row = (await pool.query('select world from real_route where id=$1 and profile_id=$2', [m[1], await profileId()])).rows[0]; return row ? c.json(row.world) : c.json({ error: 'not found' }, 404);
  });
  // Two steps so the route id can be baked into the world: reserve a row, then store the prepared world.
  r.post('/', async (c) => {
    const pid = await profileId(); if (pid === null) return c.json({ error: 'create the profile first' }, 409);
    const b = (await c.req.json()) as { name: unknown; fileName: unknown; builtin?: string };
    if (typeof b.name !== 'string' || typeof b.fileName !== 'string') return c.json({ error: 'name and fileName are required' }, 400);
    const builtin = typeof b.builtin === 'string' && /^[a-z0-9-]{1,40}$/.test(b.builtin) ? b.builtin : null;
    if (builtin) await pool.query('delete from real_route where profile_id=$1 and builtin=$2 and length_m=0', [pid, builtin]); /* a half-prepared earlier attempt */
    if ((await pool.query<{ n: number }>('select count(*)::int as n from real_route where profile_id=$1', [pid])).rows[0]!.n >= MAX_REAL_ROUTES) return c.json({ error: 'too many routes — delete one first' }, 409);
    let q: pg.QueryResult<{ id: string }>;
    try { q = await pool.query<{ id: string }>("insert into real_route(profile_id, name, file_name, length_m, ascent_m, world, builtin) values ($1,$2,$3,0,0,'{}',$4) returning id", [pid, b.name.slice(0, 120), b.fileName.slice(0, 200), builtin]); }
    catch (e) { if ((e as { code?: string }).code === '23505') return c.json({ error: 'this built-in route is already prepared' }, 409); throw e; }
    return c.json({ id: `real-${q.rows[0]!.id}` }, 201);
  });
  r.put('/:id', async (c) => {
    const m = /^real-(\d+)$/.exec(c.req.param('id')); if (!m) return c.json({ error: 'not found' }, 404);
    const cw = cleanRealWorld(await c.req.json(), c.req.param('id')); if ('error' in cw) return c.json({ error: cw.error }, 400); const w = cw.world; /* stored as rebuilt, never as sent */
    let p: RouteProfile; try { p = buildRoute(w, c.req.param('id'), sampleWorld(w)); } catch (e) { return c.json({ error: (e as Error).message }, 400); }
    const pid = await profileId(); const q = await pool.query('update real_route set world=$2, name=$3, length_m=$4, ascent_m=$5 where id=$1 and profile_id=$6', [m[1], JSON.stringify(w), w.name, p.lengthM, p.ascentM, pid]);
    if (!q.rowCount) return c.json({ error: 'not found' }, 404); cache.delete(`${pid}:${c.req.param('id')}`); return c.json({ lengthM: p.lengthM, ascentM: p.ascentM });
  });
  // Built-in routes ship with the app: once prepared they can't be removed (a half-prepared one can, so a failed
  // preparation cleans up after itself). Routes the rider imported can always be deleted.
  r.delete('/:id', async (c) => {
    const m = /^real-(\d+)$/.exec(c.req.param('id')); if (!m) return c.body(null, 204);
    const pid = await profileId(); const row = (await pool.query<{ builtin: string | null; length_m: number }>('select builtin, length_m from real_route where id=$1 and profile_id=$2', [m[1], pid])).rows[0];
    if (!row) return c.body(null, 204); /* missing or another rider's: same answer either way, nothing deleted */
    if (row.builtin && row.length_m > 0) return c.json({ error: 'built-in routes can’t be deleted' }, 403);
    await pool.query('delete from real_route where id=$1 and profile_id=$2', [m[1], pid]); cache.delete(`${pid}:${c.req.param('id')}`); return c.body(null, 204);
  });
  return r;
}
