// Rides API. Samples arrive in 5 s batches and again from the browser's write-ahead log after a crash, so the
// insert is idempotent on (ride_id, t_s): replaying a batch can never duplicate data (plan 6.5, success criterion 4).
import { Hono } from 'hono';
import type pg from 'pg';
import { encodeActivityFit, summarize, type RideSummary, type Sample } from '@veloworld/shared';

export function ridesRoutes(pool: pg.Pool, profileId: () => Promise<number | null>) {
  const r = new Hono();
  r.post('/', async (c) => {
    const pid = await profileId(); if (pid === null) return c.json({ error: 'create the profile first' }, 409);
    const b = (await c.req.json()) as { mode: string; name: string; startedAt: string; workoutId?: string; routeId?: string; simulator?: boolean };
    if (!b.mode || !b.name || !b.startedAt) return c.json({ error: 'mode, name and startedAt are required' }, 400);
    const q = await pool.query<{ id: string }>('insert into ride(profile_id, started_at, mode, name, workout_id, route_id, simulator) values ($1,$2,$3,$4,$5,$6,$7) returning id', [pid, b.startedAt, b.mode, b.name, b.workoutId ?? null, b.routeId ?? null, !!b.simulator]);
    return c.json({ id: Number(q.rows[0]!.id) }, 201);
  });
  r.post('/:id/samples', async (c) => {
    const id = Number(c.req.param('id')); const rows = (await c.req.json()) as Sample[];
    if (!Array.isArray(rows)) return c.json({ error: 'expected an array of samples' }, 400);
    if (!rows.length) return c.body(null, 204);
    const cols = ['t_s', 'power_w', 'cadence', 'hr', 'speed_mps', 'distance_m', 'alt_m', 'grade_pct', 'target_w', 'step_idx'];
    const vals: unknown[] = []; const tuples = rows.map((s, i) => { vals.push(id, s.t, s.power, s.cadence, s.hr, s.speed, s.distance, s.alt, s.grade, s.target, s.step); const o = i * 11; return `(${Array.from({ length: 11 }, (_, k) => `$${o + k + 1}`).join(',')})`; });
    await pool.query(`insert into ride_sample(ride_id, ${cols.join(',')}) values ${tuples.join(',')} on conflict (ride_id, t_s) do nothing`, vals);
    return c.body(null, 204);
  });
  r.patch('/:id', async (c) => {
    const id = Number(c.req.param('id')); const b = (await c.req.json()) as { status: 'done' | 'discarded'; endedAt?: string; ftp?: number; name?: string };
    if (b.status === 'discarded') { await pool.query("update ride set status='discarded', ended_at=coalesce($2, now()) where id=$1", [id, b.endedAt ?? null]); return c.body(null, 204); }
    const samples = await loadSamples(pool, id); const summary = summarize(samples, b.ftp ?? 200);
    await pool.query("update ride set status='done', ended_at=$2, summary=$3, name=coalesce($4, name) where id=$1", [id, b.endedAt ?? new Date().toISOString(), JSON.stringify(summary), b.name ?? null]);
    await pool.query('delete from best_effort where ride_id=$1', [id]);
    for (const [d, w] of Object.entries(summary.best)) if (w !== null) await pool.query('insert into best_effort values ($1,$2,$3)', [id, Number(d), w]);
    return c.json(summary);
  });
  r.get('/', async (c) => {
    const pid = await profileId(); if (pid === null) return c.json([]);
    const q = await pool.query("select id, started_at as \"startedAt\", ended_at as \"endedAt\", mode, name, status, simulator, summary, workout_id as \"workoutId\" from ride where profile_id=$1 and status = 'done' order by started_at desc limit 500", [pid]);
    return c.json(q.rows.map((x) => ({ ...x, id: Number(x.id) })));
  });
  r.get('/recording', async (c) => { // rides never finished (crash, closed tab) — the app offers resume / save
    const pid = await profileId(); if (pid === null) return c.json([]);
    const q = await pool.query("select id, name, mode, started_at as \"startedAt\", (select max(t_s) from ride_sample s where s.ride_id = ride.id) as \"lastT\" from ride where profile_id=$1 and status='recording' order by started_at desc", [pid]);
    return c.json(q.rows.map((x) => ({ ...x, id: Number(x.id) })));
  });
  r.get('/:id', async (c) => {
    const id = Number(c.req.param('id')); const q = await pool.query('select id, started_at as "startedAt", ended_at as "endedAt", mode, name, status, simulator, summary, workout_id as "workoutId" from ride where id=$1', [id]);
    if (!q.rows[0]) return c.json({ error: 'not found' }, 404);
    return c.json({ ...q.rows[0], id, samples: await loadSamples(pool, id) });
  });
  r.get('/:id/fit', async (c) => {
    const id = Number(c.req.param('id')); const q = await pool.query<{ started_at: Date; summary: RideSummary | null; name: string }>('select started_at, summary, name from ride where id=$1', [id]);
    const ride = q.rows[0]; if (!ride) return c.json({ error: 'not found' }, 404);
    const samples = await loadSamples(pool, id); const fit = encodeActivityFit({ startedAtMs: ride.started_at.getTime(), samples, summary: ride.summary ?? summarize(samples, 200) });
    const file = `${ride.name.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '_') || 'ride'}_${id}.fit`;
    return c.body(fit.buffer as ArrayBuffer, 200, { 'content-type': 'application/vnd.ant.fit', 'content-disposition': `attachment; filename="${file}"` });
  });
  r.delete('/:id', async (c) => { await pool.query('delete from ride where id=$1', [Number(c.req.param('id'))]); return c.body(null, 204); });
  return r;
}

export async function loadSamples(pool: pg.Pool, id: number): Promise<Sample[]> {
  const q = await pool.query('select t_s, power_w, cadence, hr, speed_mps, distance_m, alt_m, grade_pct, target_w, step_idx from ride_sample where ride_id=$1 order by t_s', [id]);
  return q.rows.map((s) => ({ t: s.t_s, power: s.power_w, cadence: s.cadence, hr: s.hr, speed: s.speed_mps, distance: s.distance_m ?? 0, alt: s.alt_m, grade: s.grade_pct, target: s.target_w, step: s.step_idx }));
}

export function workoutRoutes(pool: pg.Pool, profileId: () => Promise<number | null>) {
  const r = new Hono();
  r.get('/', async (c) => { const pid = await profileId(); if (pid === null) return c.json([]); const q = await pool.query('select id, source, name, category, duration_s as "durationS", tss_estimate as "tss", steps, description, tags from workout where profile_id=$1 order by created_at desc', [pid]); return c.json(q.rows); });
  r.post('/', async (c) => {
    const pid = await profileId(); if (pid === null) return c.json({ error: 'create the profile first' }, 409);
    const w = (await c.req.json()) as { id: string; source: 'import' | 'custom'; name: string; category: string; durationS: number; tss?: number; steps: unknown[]; description?: string; tags?: string[] };
    if (!w.id || !w.name || !Array.isArray(w.steps) || !w.steps.length) return c.json({ error: 'id, name and steps are required' }, 400);
    await pool.query('insert into workout(id, profile_id, source, name, category, duration_s, tss_estimate, steps, description, tags) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) on conflict (id) do update set name=excluded.name, category=excluded.category, duration_s=excluded.duration_s, tss_estimate=excluded.tss_estimate, steps=excluded.steps, description=excluded.description, tags=excluded.tags',
      [w.id, pid, w.source, w.name, w.category, w.durationS, w.tss ?? null, JSON.stringify(w.steps), w.description ?? '', w.tags ?? []]);
    return c.body(null, 204);
  });
  r.delete('/:id', async (c) => { await pool.query('delete from workout where id=$1', [c.req.param('id')]); return c.body(null, 204); });
  return r;
}
