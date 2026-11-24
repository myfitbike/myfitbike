// Local API (plan D7). No auth: it binds to localhost only and serves one local profile (plan 8.1 note).
import { Hono } from 'hono';
import { compress } from 'hono/compress';
import { cors } from 'hono/cors';
import { bodyLimit } from 'hono/body-limit';
import type { Context } from 'hono';
import { authMiddleware, identity, profileResolver, type AuthConfig } from './auth.js';
import type { SampleArchive } from './archive.js';
import type { NewRider } from './signupMail.js';
import type pg from 'pg';
import { ridesRoutes, useArchive, workoutRoutes } from './rides.js';
import { recordSegmentEfforts, routesRoutes } from './routes.js';
import { progressRoutes } from './progress.js';
import { intervalsRoutes } from './intervals.js';
import { realRoutesRoutes } from './realRoutes.js';
import { radioRoutes, type RadioConfig } from './radio.js';
import { enqueue, stravaConfigured, stravaRoutes, uploadBlocker, type StravaConfig } from './strava.js';
import { DEFAULT_AVATAR, DEFAULT_SETTINGS, type Profile, type ProfileInput } from '@myfitbike/shared';
import { BODY_LIMIT, MAX_DEVICES, MAX_SETTING_JSON, WORLD_BODY_LIMIT, jsonObject, text, withRiderLock } from './limits.js';

const HEX = /^#[0-9a-f]{6}$/i;
type Row = { id: number; name: string; weight_kg: string; bike_weight_kg: string; ftp_w: number | null; max_hr: number | null; resting_hr: number | null; units: 'metric' | 'imperial'; avatar: Record<string, unknown>; setup_complete: boolean; country: string | null };
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
  if (p.units !== undefined && p.units !== 'metric' && p.units !== 'imperial') e.push('units: metric or imperial');
  if (p.avatar && (typeof p.avatar !== 'object' || Array.isArray(p.avatar))) e.push('avatar: object');
  else if (p.avatar) {
    if (!['male', 'female'].includes(p.avatar.body)) e.push('avatar.body: male or female');
    for (const [k, v] of Object.entries(p.avatar)) { if (!Object.hasOwn(DEFAULT_AVATAR, k)) { e.push(`avatar.${k}: unknown`); continue; } /* stored as sent: known keys only (security audit 2, V3) */ if (k !== 'body' && !HEX.test(String(v))) e.push(`avatar.${k}: #rrggbb`); }
  }
  return e;
}

export type AppDeps = { strava?: StravaConfig; intervals?: { encKeyHex: string; fetch: typeof fetch; base?: string }; radio?: RadioConfig; auth?: AuthConfig; corsOrigins?: string[]; archive?: SampleArchive; compress?: boolean; allowedHosts?: string[];
  /** Workers only: true when this request is within the bucket's limit for this key (the Node server is single-rider). */
  rateLimit?: (bucket: 'api' | 'costly' | 'public' | 'ip', key: string) => Promise<boolean>;
  /** Workers only: a signed-in rider created their profile (the owner gets an e-mail). Must not throw or wait. */
  onSignup?: (rider: NewRider) => void };
export function createApp(pool: pg.Pool, deps: AppDeps = {}) {
  const app = new Hono(); app.onError((err, c) => { if (err instanceof SyntaxError) return c.json({ error: 'invalid JSON' }, 400); console.error(`${c.req.method} ${c.req.path}:`, err); return c.json({ error: 'server error' }, 500); }); /* visible in `wrangler tail` / server logs */
  // One log line per refused request, so an attack (sign-in failures, rate limits, quotas) can be traced to an account
  // (security audit 2, V19). Path only: the query string can carry a Strava code. The rider id is noted right after
  // sign-in (identity() lives in a scope that has closed by the time this runs).
  const riders = new WeakMap<Request, string>();
  app.use(async (c, next) => { await next(); if ([401, 403, 409, 413, 429].includes(c.res.status)) console.warn(JSON.stringify({ at: 'refused', status: c.res.status, method: c.req.method, path: c.req.path, rider: riders.get(c.req.raw) ?? null, ip: c.req.header('cf-connecting-ip') ?? null })); });
  const hosts = deps.allowedHosts?.map((h) => h.toLowerCase()); /* local Node server: refuse DNS-rebinding requests aimed at 127.0.0.1 */
  if (hosts) app.use(async (c, next) => (hosts.includes((c.req.header('host') ?? '').toLowerCase()) ? next() : c.json({ error: 'unknown host' }, 403)));
  app.use(async (c, next) => { await next(); c.header('X-Content-Type-Options', 'nosniff'); c.header('Cache-Control', 'no-store'); /* rider data must not sit in shared caches */
    c.header('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'"); c.header('X-Frame-Options', 'DENY'); c.header('Referrer-Policy', 'no-referrer'); /* JSON is never a page (security audit 2, V18) */ });
  if (deps.compress !== false) app.use(compress()); /* gzip JSON over 1 KB (radio lists are MBs); Workers compress on their own, so they turn this off */
  if (deps.corsOrigins?.length) app.use(cors({ origin: deps.corsOrigins, allowHeaders: ['authorization', 'content-type'], allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'], maxAge: 86400 })); /* web app on another origin (Pages + Workers) */
  app.use(async (c, next) => { /* a web page on another site can send a body as text/plain without asking (no CORS preflight); JSON cannot be sent that way */
    if (['POST', 'PUT', 'PATCH'].includes(c.req.method) && !/^application\/json\b/i.test(c.req.header('content-type') ?? '')) return c.json({ error: 'content-type must be application/json' }, 415);
    return next();
  });
  const tooBig = (c: Context) => c.json({ error: 'request too large' }, 413);
  const small = bodyLimit({ maxSize: BODY_LIMIT, onError: tooBig }), big = bodyLimit({ maxSize: WORLD_BODY_LIMIT, onError: tooBig });
  app.use((c, next) => (c.req.method === 'PUT' && /^\/real-routes\/real-\d+$/.test(c.req.path) ? big : small)(c, next)); /* only a prepared real-road world is large */
  const rl = deps.rateLimit; const tooMany = (c: Context) => c.json({ error: 'Too many requests — wait a minute and try again' }, 429, { 'retry-after': '60' });
  if (rl) app.use(async (c, next) => (c.req.method === 'OPTIONS' || (await rl('ip', c.req.header('cf-connecting-ip') ?? 'unknown')) ? next() : tooMany(c))); /* before sign-in is checked, so a flood of bad tokens is limited too (security audit 2, V7) */
  if (deps.archive) useArchive(deps.archive); const auth: AuthConfig = deps.auth ?? { mode: 'none' }; app.use(authMiddleware(auth)); const profileId = profileResolver(pool, auth);
  app.use(async (c, next) => { const who = identity()?.userId; if (who) riders.set(c.req.raw, who); return next(); }); /* for the refusal log above */
  const COSTLY = [/^POST \/strava\/uploads$/, /^POST \/intervals\/sync$/, /^GET \/radio\/search$/, /^POST \/radio\/click\/[^/]+$/, /^PUT \/real-routes\/[^/]+$/]; /* spend third-party quota or server CPU */
  if (rl) app.use(async (c, next) => { /* after auth, so the rider is known: one account can't flood the API, and riders don't share a bucket */
    if (c.req.method === 'OPTIONS') return next(); const who = identity()?.userId;
    const [bucket, key] = !who ? ['public', c.req.header('cf-connecting-ip') ?? 'unknown'] as const : COSTLY.some((p) => p.test(`${c.req.method} ${c.req.path}`)) ? ['costly', who] as const : ['api', who] as const;
    if (!(await rl(bucket, key))) return tooMany(c);
    return next();
  });

  app.get('/health', async (c) => { await pool.query('select 1'); return c.json({ ok: true }); });

  app.get('/profile', async (c) => {
    const id = await profileId(); const r = id === null ? { rows: [] as Row[] } : await pool.query<Row>('select * from profile where id=$1', [id]);
    return r.rows[0] ? c.json(toProfile(r.rows[0])) : c.json({ error: 'no profile yet' }, 404);
  });
  app.put('/profile', async (c) => {
    const p = (await jsonObject(c)) as ProfileInput; const errors = validateProfile(p);
    if (errors.length) return c.json({ errors }, 400);
    const id = await profileId(); const vals = [p.name.trim(), p.weightKg, p.bikeWeightKg, p.ftpW, p.maxHr, p.restingHr, JSON.stringify(p.avatar ?? DEFAULT_AVATAR), !!p.setupComplete, p.country ?? null, p.units ?? 'metric'];
    const r = id === null
      ? await pool.query<Row>('insert into profile(name, weight_kg, bike_weight_kg, ftp_w, max_hr, resting_hr, avatar, setup_complete, country, units, auth_user_id, email) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) returning *', [...vals, identity()?.userId ?? null, identity()?.email ?? null])
      : await pool.query<Row>('update profile set name=$1, weight_kg=$2, bike_weight_kg=$3, ftp_w=$4, max_hr=$5, resting_hr=$6, avatar=$7, setup_complete=$8, country=$9, units=$10, updated_at=now() where id=$11 returning *', [...vals, id]);
    if (id === null && identity() && deps.onSignup) deps.onSignup({ name: r.rows[0]!.name, email: identity()!.email, country: r.rows[0]!.country }); /* a new signed-in rider; never blocks the answer */
    return c.json(toProfile(r.rows[0]!));
  });

  app.get('/settings', async (c) => {
    const id = await profileId(); const out: Record<string, unknown> = { ...DEFAULT_SETTINGS };
    if (id !== null) for (const r of (await pool.query<{ key: string; value: unknown }>('select key, value from settings where profile_id=$1', [id])).rows) if (Object.hasOwn(DEFAULT_SETTINGS, r.key)) out[r.key] = r.value; /* known settings only: the encrypted intervals.icu key shares this table */
    return c.json(out);
  });
  app.put('/settings/:key', async (c) => {
    const key = c.req.param('key'); if (!Object.hasOwn(DEFAULT_SETTINGS, key)) return c.json({ error: `unknown setting ${key}` }, 400);
    const id = await profileId(); if (id === null) return c.json({ error: 'create the profile first' }, 409);
    const { value } = (await jsonObject(c)) as { value: unknown };
    if (value === undefined || JSON.stringify(value).length > MAX_SETTING_JSON) return c.json({ error: 'setting value too large' }, 400);
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
    const d = (await jsonObject(c)) as { bleName: unknown; kind: string; bleId?: unknown }; const bleName = text(d.bleName, 100);
    if (!bleName || !['trainer', 'power', 'cadence', 'heartRate', 'speed'].includes(d.kind) || (d.bleId != null && (typeof d.bleId !== 'string' || d.bleId.length > 100))) return c.json({ error: 'bleName and a valid kind are required' }, 400);
    const full = await withRiderLock(pool, id, async (db) => { /* count and insert as one step (security audit 2, V4) */
      const known = (await db.query('select 1 from device where profile_id=$1 and kind=$2 and ble_name=$3', [id, d.kind, bleName])).rowCount; /* reconnecting a saved device never counts against the cap */
      if (!known && (await db.query<{ n: number }>('select count(*)::int as n from device where profile_id=$1', [id])).rows[0]!.n >= MAX_DEVICES) return true;
      await db.query('insert into device(profile_id, ble_name, ble_id, kind) values ($1,$2,$3,$4) on conflict (profile_id, kind, ble_name) do update set last_seen=now(), ble_id=coalesce(excluded.ble_id, device.ble_id)', [id, bleName, d.bleId ?? null, d.kind]); return false;
    });
    return full ? c.json({ error: 'too many saved devices' }, 409) : c.body(null, 204);
  });
  // Auto-upload (plan 8.1) when the rider chose "Automatically"; never blocks saving the ride.
  const onRideFinished = async (rideId: number) => {
    await recordSegmentEfforts(pool, rideId).catch((e) => console.error('segment efforts', e.message));
    if (!deps.strava || !stravaConfigured(deps.strava)) return;
    const a = (await pool.query("select auto_upload from strava_account a join ride r on r.profile_id=a.profile_id where r.id=$1", [rideId])).rows[0];
    if (a?.auto_upload === 'auto' && !(await uploadBlocker(pool, rideId))) await enqueue(pool, rideId);
  };
  app.route('/rides', ridesRoutes(pool, profileId, onRideFinished));
  app.route('/', routesRoutes(pool, profileId));
  app.route('/', progressRoutes(pool, profileId));
  app.route('/intervals', intervalsRoutes(pool, profileId, deps.intervals ?? { encKeyHex: deps.strava?.encKeyHex ?? '', fetch }));
  if (deps.strava) app.route('/strava', stravaRoutes(pool, profileId, deps.strava));
  app.route('/workouts', workoutRoutes(pool, profileId));
  app.route('/real-routes', realRoutesRoutes(pool, profileId));
  app.route('/radio', radioRoutes(deps.radio ?? { fetch }));
  return app;
}
