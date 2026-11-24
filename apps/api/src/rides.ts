// Rides API. Samples arrive in 30 s batches and again from the browser's write-ahead log after a crash, so the
// insert is idempotent on (ride_id, t_s): replaying a batch can never duplicate data (plan 6.5, success criterion 4).
import { Hono } from 'hono';
import type pg from 'pg';
import { encodeActivityFit, summarize, type RideSummary, type Sample } from '@myfitbike/shared';
import { dbArchive, type SampleArchive } from './archive.js';
import { MAX_OPEN_RECORDINGS, MAX_OPEN_SAMPLES, MAX_RIDES, MAX_RIDES_PER_DAY, MAX_RIDE_T_S, MAX_STORED_RIDE_S,MAX_SAMPLES_PER_POST, MAX_STARS, MAX_WORKOUTS, clampNum, isoDate, text } from './limits.js';

/** Where finished rides' samples live (PLAN 17.3): set once at start-up (R2 on Workers); defaults to the ride_archive table. */
let archive: SampleArchive | null = null;
export const useArchive = (a: SampleArchive) => { archive = a; };
const arch = (pool: pg.Pool) => archive ?? dbArchive(pool); /* not cached: on Workers each request has its own pool, closed afterwards */
/** The ride if it belongs to this rider (PLAN 17.2: anything else is "not found", never another rider's data). */
export async function ownRide(pool: pg.Pool, pid: number | null, id: number): Promise<boolean> {
  return pid !== null && Number.isFinite(id) && !!(await pool.query('select 1 from ride where id=$1 and profile_id=$2', [id, pid])).rowCount;
}

export function ridesRoutes(pool: pg.Pool, profileId: () => Promise<number | null>, onFinished: (rideId: number) => Promise<void> = async () => {}) {
  const r = new Hono();
  r.post('/', async (c) => {
    const pid = await profileId(); if (pid === null) return c.json({ error: 'create the profile first' }, 409);
    const b = (await c.req.json()) as { mode: unknown; name: unknown; startedAt: unknown; workoutId?: unknown; routeId?: unknown; simulator?: boolean };
    const mode = text(b.mode, 20), name = text(b.name, 120), startedAt = isoDate(b.startedAt);
    if (!mode || !name || !startedAt) return c.json({ error: 'mode, name and startedAt are required' }, 400);
    const shortId = (v: unknown) => v === undefined || v === null || (typeof v === 'string' && v.length <= 80);
    if (!shortId(b.workoutId) || !shortId(b.routeId)) return c.json({ error: 'workoutId and routeId must be short text' }, 400);
    const open = (await pool.query<{ n: number }>("select count(*)::int as n from ride where profile_id=$1 and status='recording'", [pid])).rows[0]!.n;
    if (open >= MAX_OPEN_RECORDINGS) return c.json({ error: 'Too many unfinished rides — save or discard one first' }, 409);
    const n = (await pool.query<{ total: number; today: number }>("select count(*)::int as total, count(*) filter (where created_at > now() - interval '1 day')::int as today from ride where profile_id=$1", [pid])).rows[0]!;
    if (n.total >= MAX_RIDES) return c.json({ error: 'Ride limit reached — delete old rides first' }, 409);
    if (n.today >= MAX_RIDES_PER_DAY) return c.json({ error: 'Too many rides started today — try again tomorrow' }, 429);
    const q = await pool.query<{ id: string }>('insert into ride(profile_id, started_at, mode, name, workout_id, route_id, simulator) values ($1,$2,$3,$4,$5,$6,$7) returning id', [pid, startedAt, mode, name, b.workoutId ?? null, b.routeId ?? null, !!b.simulator]);
    return c.json({ id: Number(q.rows[0]!.id) }, 201);
  });
  r.post('/:id/samples', async (c) => {
    const id = Number(c.req.param('id')); const pid = await profileId();
    const ride = pid === null || !Number.isFinite(id) ? undefined : (await pool.query<{ status: string }>('select status from ride where id=$1 and profile_id=$2', [id, pid])).rows[0];
    if (!ride) return c.json({ error: 'not found' }, 404); if (ride.status !== 'recording') return c.json({ error: 'this ride is already finished' }, 409);
    const raw = (await c.req.json()) as unknown[]; if (!Array.isArray(raw)) return c.json({ error: 'expected an array of samples' }, 400);
    if (raw.length > MAX_SAMPLES_PER_POST) return c.json({ error: 'too many samples in one request' }, 413);
    // The app retries a failed batch forever, so one odd value must never cost the rider the ride: drop or clamp, don't reject.
    const rows = raw.map(clean).filter((s) => s !== null); if (!rows.length) return c.body(null, 204);
    const open = (await pool.query<{ n: number }>("select count(*)::int as n from ride_sample where ride_id in (select id from ride where profile_id=$1 and status='recording')", [pid])).rows[0]!.n;
    if (open + rows.length > MAX_OPEN_SAMPLES) return c.json({ error: 'Too much unsaved ride data — save or discard an unfinished ride first' }, 409);
    const cols = ['t_s', 'power_w', 'cadence', 'hr', 'speed_mps', 'distance_m', 'alt_m', 'grade_pct', 'target_w', 'step_idx'];
    const vals: unknown[] = []; const tuples = rows.map((s, i) => { vals.push(id, s.t, s.power, s.cadence, s.hr, s.speed, s.distance, s.alt, s.grade, s.target, s.step); const o = i * 11; return `(${Array.from({ length: 11 }, (_, k) => `$${o + k + 1}`).join(',')})`; });
    await pool.query(`insert into ride_sample(ride_id, ${cols.join(',')}) values ${tuples.join(',')} on conflict (ride_id, t_s) do nothing`, vals);
    return c.body(null, 204);
  });
  r.patch('/:id', async (c) => {
    const id = Number(c.req.param('id')); const pid = await profileId(); if (!(await ownRide(pool, pid, id))) return c.json({ error: 'not found' }, 404);
    const b = (await c.req.json()) as { status: unknown; endedAt?: unknown; ftp?: unknown; name?: unknown; stars?: unknown };
    if (b.status !== 'done' && b.status !== 'discarded') return c.json({ error: 'status must be done or discarded' }, 400);
    const endedAt = b.endedAt === undefined || b.endedAt === null ? null : isoDate(b.endedAt); if (endedAt === null && b.endedAt != null) return c.json({ error: 'endedAt must be a date' }, 400);
    const name = b.name === undefined || b.name === null ? null : text(b.name, 120); if (name === null && b.name != null) return c.json({ error: 'name: 1–120 characters' }, 400);
    const ftp = clampNum(b.ftp, 50, 700) ?? 200, stars = Math.round(clampNum(b.stars, 0, MAX_STARS) ?? 0); /* XP and levels are computed from these */
    if (b.status === 'discarded') { await pool.query("update ride set status='discarded', ended_at=coalesce($2, now()) where id=$1", [id, endedAt]); await pool.query('delete from ride_sample where ride_id=$1', [id]); return c.body(null, 204); }
    const stored = (await pool.query<{ s: number }>("select coalesce(sum((summary->>'durationS')::int), 0)::int as s from ride where profile_id=$1 and status='done' and id<>$2", [pid, id])).rows[0]!.s;
    if (stored >= MAX_STORED_RIDE_S) return c.json({ error: 'Storage full — delete old rides first' }, 409); /* the ride stays recording: nothing is lost */
    const samples = await loadSamples(pool, id); const summary = { ...summarize(samples, ftp), stars };
    await pool.query("update ride set status='done', ended_at=$2, summary=$3, name=coalesce($4, name) where id=$1", [id, endedAt ?? new Date().toISOString(), JSON.stringify(summary), name]);
    if (samples.length) { await arch(pool).put(id, samples); await pool.query('delete from ride_sample where ride_id=$1', [id]); } /* one compressed file per finished ride, rows freed */
    await pool.query('delete from best_effort where ride_id=$1', [id]);
    for (const [d, w] of Object.entries(summary.best)) if (w !== null) await pool.query('insert into best_effort values ($1,$2,$3)', [id, Number(d), w]);
    await onFinished(id).catch(() => {}); // a failed upload never blocks saving the ride
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
    const id = Number(c.req.param('id')); const q = await pool.query('select id, started_at as "startedAt", ended_at as "endedAt", mode, name, status, simulator, summary, workout_id as "workoutId" from ride where id=$1 and profile_id=$2', [id, await profileId()]);
    if (!q.rows[0]) return c.json({ error: 'not found' }, 404);
    return c.json({ ...q.rows[0], id, samples: await loadSamples(pool, id) });
  });
  r.get('/:id/fit', async (c) => {
    const id = Number(c.req.param('id')); const q = await pool.query<{ started_at: Date; summary: RideSummary | null; name: string }>('select started_at, summary, name from ride where id=$1 and profile_id=$2', [id, await profileId()]);
    const ride = q.rows[0]; if (!ride) return c.json({ error: 'not found' }, 404);
    const samples = await loadSamples(pool, id); const fit = encodeActivityFit({ startedAtMs: ride.started_at.getTime(), samples, summary: ride.summary ?? summarize(samples, 200) });
    const file = `${ride.name.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '_') || 'ride'}_${id}.fit`;
    return c.body(fit.buffer as ArrayBuffer, 200, { 'content-type': 'application/vnd.ant.fit', 'content-disposition': `attachment; filename="${file}"` });
  });
  r.delete('/:id', async (c) => { const id = Number(c.req.param('id')); if (await ownRide(pool, await profileId(), id)) { await pool.query('delete from ride where id=$1', [id]); await arch(pool).remove(id).catch(() => {}); } return c.body(null, 204); });
  return r;
}

/** One sample made safe to store: a sample without a whole-second t inside a ride's length is dropped; every other
 *  field is clamped to what the column and physics allow (null if it isn't a number). */
function clean(x: unknown): Sample | null {
  const s = (x ?? {}) as Record<string, unknown>; const t = s.t;
  if (typeof t !== 'number' || !Number.isInteger(t) || t < 0 || t > MAX_RIDE_T_S) return null;
  const n = (v: unknown, min: number, max: number) => clampNum(v, min, max), i = (v: unknown, min: number, max: number) => { const r = clampNum(v, min, max); return r === null ? null : Math.round(r); };
  return { t, power: i(s.power, 0, 3000), cadence: i(s.cadence, 0, 300), hr: i(s.hr, 0, 255), speed: n(s.speed, 0, 40), distance: n(s.distance, 0, 2_000_000) as number, alt: n(s.alt, -500, 9000), grade: n(s.grade, -50, 50), target: i(s.target, 0, 3000), step: i(s.step, 0, 10_000) };
}

/** A ride's samples: rows while it is being recorded (and for rides saved before the archive existed), else the archive. */
export async function loadSamples(pool: pg.Pool, id: number): Promise<Sample[]> {
  const q = await pool.query('select t_s, power_w, cadence, hr, speed_mps, distance_m, alt_m, grade_pct, target_w, step_idx from ride_sample where ride_id=$1 order by t_s', [id]);
  if (!q.rows.length) return (await arch(pool).get(id)) ?? [];
  return q.rows.map((s) => ({ t: s.t_s, power: s.power_w, cadence: s.cadence, hr: s.hr, speed: s.speed_mps, distance: s.distance_m ?? 0, alt: s.alt_m, grade: s.grade_pct, target: s.target_w, step: s.step_idx }));
}

export function workoutRoutes(pool: pg.Pool, profileId: () => Promise<number | null>) {
  const r = new Hono();
  r.get('/', async (c) => { const pid = await profileId(); if (pid === null) return c.json([]); const q = await pool.query('select id, source, name, category, duration_s as "durationS", tss_estimate as "tss", steps, description, tags from workout where profile_id=$1 order by created_at desc', [pid]); return c.json(q.rows); });
  r.post('/', async (c) => {
    const pid = await profileId(); if (pid === null) return c.json({ error: 'create the profile first' }, 409);
    const w = (await c.req.json()) as { id: unknown; source: unknown; name: unknown; category: unknown; durationS: unknown; tss?: unknown; steps: unknown; description?: unknown; tags?: unknown };
    const id = text(w.id, 300), name = text(w.name, 120); /* 300, not 80: imported ids carry the file name (Workouts.tsx) */
    if (!id || !name || !Array.isArray(w.steps) || !w.steps.length || w.steps.length > 500) return c.json({ error: 'id, name and steps are required' }, 400);
    const bad = w.source !== 'import' && w.source !== 'custom' ? 'source' : !text(w.category, 40) ? 'category' : !(Number.isInteger(w.durationS) && (w.durationS as number) >= 1 && (w.durationS as number) <= 86_400) ? 'durationS'
      : w.tss != null && clampNum(w.tss, 0, 2000) !== w.tss ? 'tss' : w.description != null && (typeof w.description !== 'string' || w.description.length > 2000) ? 'description'
      : w.tags != null && !(Array.isArray(w.tags) && w.tags.length <= 10 && w.tags.every((t) => typeof t === 'string' && t.length <= 40)) ? 'tags' : null;
    if (bad) return c.json({ error: `invalid ${bad}` }, 400);
    const exists = (await pool.query('select 1 from workout where id=$1 and profile_id=$2', [id, pid])).rowCount; /* updating a saved workout never counts against the cap */
    if (!exists && (await pool.query<{ n: number }>('select count(*)::int as n from workout where profile_id=$1', [pid])).rows[0]!.n >= MAX_WORKOUTS) return c.json({ error: 'too many workouts — delete one first' }, 409);
    await pool.query('insert into workout(id, profile_id, source, name, category, duration_s, tss_estimate, steps, description, tags) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) on conflict (profile_id, id) do update set name=excluded.name, category=excluded.category, duration_s=excluded.duration_s, tss_estimate=excluded.tss_estimate, steps=excluded.steps, description=excluded.description, tags=excluded.tags',
      [id, pid, w.source, name, text(w.category, 40), w.durationS, w.tss ?? null, JSON.stringify(w.steps), w.description ?? '', w.tags ?? []]);
    return c.body(null, 204);
  });
  r.delete('/:id', async (c) => { await pool.query('delete from workout where id=$1 and profile_id=$2', [c.req.param('id'), await profileId()]); return c.body(null, 204); });
  return r;
}
