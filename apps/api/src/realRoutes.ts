// Optional real-road mode (Phase 6): store and list routes imported from GPS files. The browser does the elevation
// lookup and the 3D bake; the server keeps the prepared world so rides, ghosts and segment PBs work as for Velora.
import { Hono } from 'hono';
import type pg from 'pg';
import { buildRoute, sampleWorld, type RouteProfile, type World } from '@myfitbike/world';

const cache = new Map<string, RouteProfile>();
/** Route profile by id: real routes are `real-<row id>`, loaded from the table and cached. */
export async function realRoute(pool: pg.Pool, id: string): Promise<RouteProfile | undefined> {
  const m = /^real-(\d+)$/.exec(id); if (!m) return undefined; if (cache.has(id)) return cache.get(id);
  const row = (await pool.query<{ world: World }>('select world from real_route where id=$1', [m[1]])).rows[0]; if (!row) return undefined;
  const p = buildRoute(row.world, id, sampleWorld(row.world)); cache.set(id, p); return p;
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
    const row = (await pool.query('select world from real_route where id=$1', [m[1]])).rows[0]; return row ? c.json(row.world) : c.json({ error: 'not found' }, 404);
  });
  // Two steps so the route id can be baked into the world: reserve a row, then store the prepared world.
  r.post('/', async (c) => {
    const pid = await profileId(); if (pid === null) return c.json({ error: 'create the profile first' }, 409);
    const b = (await c.req.json()) as { name: string; fileName: string; builtin?: string };
    const builtin = typeof b.builtin === 'string' && /^[a-z0-9-]{1,40}$/.test(b.builtin) ? b.builtin : null;
    if (builtin) await pool.query('delete from real_route where profile_id=$1 and builtin=$2 and length_m=0', [pid, builtin]); /* a half-prepared earlier attempt */
    let q: pg.QueryResult<{ id: string }>;
    try { q = await pool.query<{ id: string }>("insert into real_route(profile_id, name, file_name, length_m, ascent_m, world, builtin) values ($1,$2,$3,0,0,'{}',$4) returning id", [pid, String(b.name).slice(0, 120), String(b.fileName).slice(0, 200), builtin]); }
    catch (e) { if ((e as { code?: string }).code === '23505') return c.json({ error: 'this built-in route is already prepared' }, 409); throw e; }
    return c.json({ id: `real-${q.rows[0]!.id}` }, 201);
  });
  r.put('/:id', async (c) => {
    const m = /^real-(\d+)$/.exec(c.req.param('id')); if (!m) return c.json({ error: 'not found' }, 404); const w = (await c.req.json()) as World;
    if (!w.edges?.length || w.routes?.[0]?.id !== c.req.param('id')) return c.json({ error: 'world does not match this route' }, 400);
    let p: RouteProfile; try { p = buildRoute(w, c.req.param('id'), sampleWorld(w)); } catch (e) { return c.json({ error: (e as Error).message }, 400); }
    const q = await pool.query('update real_route set world=$2, name=$3, length_m=$4, ascent_m=$5 where id=$1', [m[1], JSON.stringify(w), w.name, p.lengthM, p.ascentM]);
    if (!q.rowCount) return c.json({ error: 'not found' }, 404); cache.delete(c.req.param('id')); return c.json({ lengthM: p.lengthM, ascentM: p.ascentM });
  });
  // Built-in routes ship with the app: once prepared they can't be removed (a half-prepared one can, so a failed
  // preparation cleans up after itself). Routes the rider imported can always be deleted.
  r.delete('/:id', async (c) => {
    const m = /^real-(\d+)$/.exec(c.req.param('id')); if (!m) return c.body(null, 204);
    const row = (await pool.query<{ builtin: string | null; length_m: number }>('select builtin, length_m from real_route where id=$1', [m[1]])).rows[0];
    if (row?.builtin && row.length_m > 0) return c.json({ error: 'built-in routes can’t be deleted' }, 403);
    await pool.query('delete from real_route where id=$1', [m[1]]); cache.delete(c.req.param('id')); return c.body(null, 204);
  });
  return r;
}
