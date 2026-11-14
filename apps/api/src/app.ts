// Local API (plan D7). No auth: it binds to localhost only and serves one local profile (plan 8.1 note).
import { Hono } from 'hono';
import type pg from 'pg';
import { ridesRoutes, workoutRoutes } from './rides.js';
import { enqueue, stravaConfigured, stravaRoutes, uploadBlocker, type StravaConfig } from './strava.js';
import { DEFAULT_AVATAR, DEFAULT_SETTINGS, type Profile, type ProfileInput } from '@veloworld/shared';

const HEX = /^#[0-9a-f]{6}$/i;
type Row = { id: number; name: string; weight_kg: string; bike_weight_kg: string; ftp_w: number | null; max_hr: number | null; resting_hr: number | null; units: 'metric'; avatar: Record<string, unknown>; setup_complete: boolean; country: string | null };
const toProfile = (r: Row): Profile => ({ id: r.id, name: r.name, weightKg: Number(r.weight_kg), bikeWeightKg: Number(r.bike_weight_kg), ftpW: r.ftp_w, maxHr: r.max_hr, restingHr: r.resting_hr, units: r.units, setupComplete: r.setup_complete, avatar: { ...DEFAULT_AVATAR, ...r.avatar } as Profile['avatar'], country: r.country });

/** Returns a list of problems; empty means valid. Mirrors the DB checks so the UI gets readable messages. */
export function validateProfile(p: Partial<ProfileInput>): string[] {
  const e: string[] = []; const num = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
  if (typeof p.name !== 'string' || !p.name.trim() || p.name.length > 60) e.push('name: 1–60 characters');
  if (!num(p.weightKg) || p.weightKg! < 30 || p.weightKg! > 250) e.push('weightKg: 30–250');
  if (!num(p.bikeWeightKg) || p.bikeWeightKg! < 3 || p.bikeWeightKg! > 40) e.push('bikeWeightKg: 3–40');
  if (p.ftpW !== null && (!num(p.ftpW) || p.ftpW! < 50 || p.ftpW! > 700)) e.push('ftpW: 50–700 or null');
  if (p.maxHr !== null && (!num(p.maxHr) || p.maxHr! < 100 || p.maxHr! > 230)) e.push('maxHr: 100–230 or null');
  if (p.restingHr !== null && (!num(p.restingHr) || p.restingHr! < 25 || p.restingHr! > 120)) e.push('restingHr: 25–120 or null');
  if (p.country !== undefined && p.country !== null && !/^[A-Z]{2}$/.test(p.country)) e.push('country: ISO alpha-2 or null');
  if (p.avatar) {
    if (!['male', 'female'].includes(p.avatar.body)) e.push('avatar.body: male or female');
    for (const [k, v] of Object.entries(p.avatar)) if (k !== 'body' && !HEX.test(String(v))) e.push(`avatar.${k}: #rrggbb`);
  }
  return e;
}

export function createApp(pool: pg.Pool, deps: { strava?: StravaConfig } = {}) {
  const app = new Hono();
  const profileId = async () => (await pool.query<{ id: number }>('select id from profile order by id limit 1')).rows[0]?.id ?? null;

  app.get('/health', async (c) => { await pool.query('select 1'); return c.json({ ok: true }); });

  app.get('/profile', async (c) => {
    const r = await pool.query<Row>('select * from profile order by id limit 1');
    return r.rows[0] ? c.json(toProfile(r.rows[0])) : c.json({ error: 'no profile yet' }, 404);
  });
  app.put('/profile', async (c) => {
    const p = (await c.req.json()) as ProfileInput; const errors = validateProfile(p);
    if (errors.length) return c.json({ errors }, 400);
    const id = await profileId(); const vals = [p.name.trim(), p.weightKg, p.bikeWeightKg, p.ftpW, p.maxHr, p.restingHr, JSON.stringify(p.avatar ?? DEFAULT_AVATAR), !!p.setupComplete, p.country ?? null];
    const r = id === null
      ? await pool.query<Row>('insert into profile(name, weight_kg, bike_weight_kg, ftp_w, max_hr, resting_hr, avatar, setup_complete, country) values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning *', vals)
      : await pool.query<Row>('update profile set name=$1, weight_kg=$2, bike_weight_kg=$3, ftp_w=$4, max_hr=$5, resting_hr=$6, avatar=$7, setup_complete=$8, country=$9, updated_at=now() where id=$10 returning *', [...vals, id]);
    return c.json(toProfile(r.rows[0]!));
  });

  app.get('/settings', async (c) => {
    const id = await profileId(); const out: Record<string, unknown> = { ...DEFAULT_SETTINGS };
    if (id !== null) for (const r of (await pool.query<{ key: string; value: unknown }>('select key, value from settings where profile_id=$1', [id])).rows) out[r.key] = r.value;
    return c.json(out);
  });
  app.put('/settings/:key', async (c) => {
    const key = c.req.param('key'); if (!(key in DEFAULT_SETTINGS)) return c.json({ error: `unknown setting ${key}` }, 400);
    const id = await profileId(); if (id === null) return c.json({ error: 'create the profile first' }, 409);
    const { value } = (await c.req.json()) as { value: unknown };
    await pool.query('insert into settings(profile_id, key, value) values ($1,$2,$3) on conflict (profile_id, key) do update set value=excluded.value', [id, key, JSON.stringify(value)]);
    return c.body(null, 204);
  });

  app.get('/devices', async (c) => {
    const id = await profileId(); if (id === null) return c.json([]);
    const r = await pool.query('select id, ble_name as "bleName", ble_id as "bleId", kind, last_seen as "lastSeen" from device where profile_id=$1 order by last_seen desc', [id]);
    return c.json(r.rows);
  });
  app.post('/devices', async (c) => {
    const id = await profileId(); if (id === null) return c.json({ error: 'create the profile first' }, 409);
    const d = (await c.req.json()) as { bleName: string; kind: string; bleId?: string };
    if (!d.bleName || !['trainer', 'power', 'cadence', 'heartRate', 'speed'].includes(d.kind)) return c.json({ error: 'bleName and a valid kind are required' }, 400);
    await pool.query('insert into device(profile_id, ble_name, ble_id, kind) values ($1,$2,$3,$4) on conflict (profile_id, kind, ble_name) do update set last_seen=now(), ble_id=coalesce(excluded.ble_id, device.ble_id)', [id, d.bleName, d.bleId ?? null, d.kind]);
    return c.body(null, 204);
  });
  // Auto-upload (plan 8.1) when the rider chose "Automatically"; never blocks saving the ride.
  const onRideFinished = async (rideId: number) => {
    if (!deps.strava || !stravaConfigured(deps.strava)) return;
    const a = (await pool.query("select auto_upload from strava_account a join ride r on r.profile_id=a.profile_id where r.id=$1", [rideId])).rows[0];
    if (a?.auto_upload === 'auto' && !(await uploadBlocker(pool, rideId))) await enqueue(pool, rideId);
  };
  app.route('/rides', ridesRoutes(pool, profileId, onRideFinished));
  if (deps.strava) app.route('/strava', stravaRoutes(pool, profileId, deps.strava));
  app.route('/workouts', workoutRoutes(pool, profileId));
  return app;
}
