// Optional real-road mode (Phase 6): store and list routes imported from GPS files. The browser does the elevation
// lookup and the 3D bake; the server keeps the prepared world so rides, ghosts and segment PBs work as for Velora.
import { Hono } from 'hono';
import type pg from 'pg';
import { buildRoute, sampleWorld, type RouteProfile, type World } from '@veloworld/world';

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
    const q = await pool.query('select id, name, file_name as "fileName", length_m as "lengthM", ascent_m as "ascentM", created_at as "createdAt" from real_route where profile_id=$1 order by created_at desc', [pid]);
    return c.json(q.rows.map((x) => ({ ...x, id: `real-${x.id}` })));
  });
  r.get('/:id', async (c) => {
    const m = /^real-(\d+)$/.exec(c.req.param('id')); if (!m) return c.json({ error: 'not found' }, 404);
    const row = (await pool.query('select world from real_route where id=$1', [m[1]])).rows[0]; return row ? c.json(row.world) : c.json({ error: 'not found' }, 404);
  });
  // Two steps so the route id can be baked into the world: reserve a row, then store the prepared world.
  r.post('/', async (c) => {
    const pid = await profileId(); if (pid === null) return c.json({ error: 'create the profile first' }, 409);
    const b = (await c.req.json()) as { name: string; fileName: string };
    const q = await pool.query<{ id: string }>("insert into real_route(profile_id, name, file_name, length_m, ascent_m, world) values ($1,$2,$3,0,0,'{}') returning id", [pid, String(b.name).slice(0, 120), String(b.fileName).slice(0, 200)]);
    return c.json({ id: `real-${q.rows[0]!.id}` }, 201);
  });
  r.put('/:id', async (c) => {
    const m = /^real-(\d+)$/.exec(c.req.param('id')); if (!m) return c.json({ error: 'not found' }, 404); const w = (await c.req.json()) as World;
    if (!w.edges?.length || w.routes?.[0]?.id !== c.req.param('id')) return c.json({ error: 'world does not match this route' }, 400);
    let p: RouteProfile; try { p = buildRoute(w, c.req.param('id'), sampleWorld(w)); } catch (e) { return c.json({ error: (e as Error).message }, 400); }
    const q = await pool.query('update real_route set world=$2, name=$3, length_m=$4, ascent_m=$5 where id=$1', [m[1], JSON.stringify(w), w.name, p.lengthM, p.ascentM]);
    if (!q.rowCount) return c.json({ error: 'not found' }, 404); cache.delete(c.req.param('id')); return c.json({ lengthM: p.lengthM, ascentM: p.ascentM });
  });
  r.delete('/:id', async (c) => { const m = /^real-(\d+)$/.exec(c.req.param('id')); if (m) { await pool.query('delete from real_route where id=$1', [m[1]]); cache.delete(c.req.param('id')); } return c.body(null, 204); });
  return r;
}
