// Strava integration (plan 8.1, verified against developers.strava.com on 2026-11-14 — see PROGRESS VERIFY log).
// Opt-in only. Upload = the ride's FIT file as an indoor virtual ride, external_id = ride id so retries never duplicate.
import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { Hono } from 'hono';
import type pg from 'pg';
import { encodeActivityFit, summarize, type RideSummary } from '@myfitbike/shared';
import { loadSamples, ownRide } from './rides.js';
import { text } from './limits.js';

export type StravaConfig = { clientId: string; clientSecret: string; encKeyHex: string; apiBase: string; webBase: string; publicApiBase: string; fetch: typeof fetch; now: () => number };
const OAUTH = 'https://www.strava.com/oauth';

export function encrypt(plain: string, keyHex: string) { const iv = randomBytes(12), c = createCipheriv('aes-256-gcm', Buffer.from(keyHex, 'hex'), iv); const enc = Buffer.concat([c.update(plain, 'utf8'), c.final()]); return [iv, c.getAuthTag(), enc].map((b) => b.toString('base64')).join('.'); }
export function decrypt(blob: string, keyHex: string) { const [iv, tag, enc] = blob.split('.').map((s) => Buffer.from(s, 'base64')); const d = createDecipheriv('aes-256-gcm', Buffer.from(keyHex, 'hex'), iv!); d.setAuthTag(tag!); return Buffer.concat([d.update(enc!), d.final()]).toString('utf8'); }
/** OAuth state = which rider started the link + expiry, signed (HMAC) — works across Worker instances and needs no session. */
export function signState(pid: number, keyHex: string, now = Date.now()) { const body = `${pid}.${now + 15 * 60_000}.${randomBytes(8).toString('hex')}`; return `${body}.${createHmac('sha256', Buffer.from(keyHex, 'hex')).update(body).digest('base64url')}`; }
export function readState(state: string, keyHex: string, now = Date.now()): number | null {
  const i = state.lastIndexOf('.'); if (i < 0) return null; const body = state.slice(0, i), sig = Buffer.from(state.slice(i + 1)), want = Buffer.from(createHmac('sha256', Buffer.from(keyHex, 'hex')).update(body).digest('base64url'));
  if (sig.length !== want.length || !timingSafeEqual(sig, want)) return null; const [pid, exp] = body.split('.').map(Number); return pid && exp && exp > now ? pid : null;
}
export const stravaConfigured = (c: Partial<StravaConfig>) => !!(c.clientId && c.clientSecret && c.encKeyHex && /^[0-9a-f]{64}$/i.test(c.encKeyHex));

export function stravaRoutes(pool: pg.Pool, profileId: () => Promise<number | null>, cfg: StravaConfig) {
  const r = new Hono();
  const account = async () => { const pid = await profileId(); if (pid === null) return null; return (await pool.query('select * from strava_account where profile_id=$1', [pid])).rows[0] ?? null; };

  /** The Strava authorize URL for this rider (the browser navigates there; a plain link can't carry the sign-in token). */
  r.get('/oauth/url', async (c) => {
    if (!stravaConfigured(cfg)) return c.json({ error: 'Strava is not configured: add STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET and TOKEN_ENCRYPTION_KEY to apps/api/.env' }, 503);
    const pid = await profileId(); if (pid === null) return c.json({ error: 'create the profile first' }, 409);
    const q = new URLSearchParams({ client_id: cfg.clientId, redirect_uri: `${cfg.publicApiBase}/strava/oauth/callback`, response_type: 'code', approval_prompt: 'auto', scope: 'activity:write', state: signState(pid, cfg.encKeyHex, cfg.now()) });
    return c.json({ url: `${OAUTH}/authorize?${q}` });
  });
  r.get('/oauth/callback', async (c) => {
    const { code, state, scope, error } = c.req.query(); const back = (s: string) => c.redirect(`${cfg.webBase}/settings/connections?strava=${s}`);
    const statePid = state ? readState(state, cfg.encKeyHex, cfg.now()) : null;
    if (error || !code || statePid === null) return back(error === 'access_denied' ? 'denied' : 'error');
    if (!scope?.split(/[ ,]/).includes('activity:write')) return back('scope'); // the rider can untick scopes on Strava's page
    const res = await cfg.fetch(`${OAUTH}/token`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: cfg.clientId, client_secret: cfg.clientSecret, code, grant_type: 'authorization_code' }) });
    if (!res.ok) return back('error');
    const t = (await res.json()) as { access_token: string; refresh_token: string; expires_at: number; scope?: string; athlete: { id: number; firstname?: string; lastname?: string; profile?: string } };
    const pid = statePid;
    await pool.query(`insert into strava_account(profile_id, athlete_id, athlete_name, athlete_photo, access_token_enc, refresh_token_enc, expires_at, scope) values ($1,$2,$3,$4,$5,$6,to_timestamp($7),$8)
      on conflict (profile_id) do update set athlete_id=excluded.athlete_id, athlete_name=excluded.athlete_name, athlete_photo=excluded.athlete_photo, access_token_enc=excluded.access_token_enc, refresh_token_enc=excluded.refresh_token_enc, expires_at=excluded.expires_at, scope=excluded.scope, connected_at=now()`,
      [pid, t.athlete.id, `${t.athlete.firstname ?? ''} ${t.athlete.lastname ?? ''}`.trim(), t.athlete.profile ?? null, encrypt(t.access_token, cfg.encKeyHex), encrypt(t.refresh_token, cfg.encKeyHex), t.expires_at, scope]);
    return back('connected');
  });
  r.get('/status', async (c) => {
    const a = await account(); const rideId = c.req.query('rideId');
    const upload = rideId ? (await pool.query('select u.status, u.strava_activity_id::float8 as "stravaActivityId", u.last_error as "lastError" from strava_upload u join ride r on r.id=u.ride_id where u.ride_id=$1 and r.profile_id=$2', [Number(rideId), a?.profile_id ?? (await profileId())])).rows[0] ?? null : undefined;
    const recent = a ? (await pool.query('select u.ride_id as "rideId", r.name, u.status, u.last_error as "lastError", u.strava_activity_id::float8 as "stravaActivityId", u.updated_at as "updatedAt" from strava_upload u join ride r on r.id=u.ride_id where r.profile_id=$1 order by u.updated_at desc limit 10', [a.profile_id])).rows : [];
    return c.json({ configured: stravaConfigured(cfg), connected: !!a, athlete: a ? { name: a.athlete_name, photo: a.athlete_photo } : null, settings: a ? { autoUpload: a.auto_upload, nameTemplate: a.name_template, includeHr: a.include_hr } : null, upload, recent });
  });
  r.patch('/settings', async (c) => {
    const a = await account(); if (!a) return c.json({ error: 'not connected' }, 409); const b = (await c.req.json()) as { autoUpload?: string; nameTemplate?: string; includeHr?: boolean };
    if (b.autoUpload && !['ask', 'auto', 'never'].includes(b.autoUpload)) return c.json({ error: 'autoUpload must be ask, auto or never' }, 400);
    if (b.nameTemplate != null && !text(b.nameTemplate, 120)) return c.json({ error: 'nameTemplate: 1–120 characters' }, 400);
    if (b.includeHr != null && typeof b.includeHr !== 'boolean') return c.json({ error: 'includeHr must be true or false' }, 400);
    await pool.query('update strava_account set auto_upload=coalesce($2, auto_upload), name_template=coalesce($3, name_template), include_hr=coalesce($4, include_hr) where profile_id=$1', [a.profile_id, b.autoUpload ?? null, b.nameTemplate ?? null, b.includeHr ?? null]);
    return c.body(null, 204);
  });
  r.post('/uploads', async (c) => {
    const { rideId } = (await c.req.json()) as { rideId: number }; if (!Number.isInteger(rideId) || rideId <= 0) return c.json({ error: 'not found' }, 404); if (!(await ownRide(pool, await profileId(), Number(rideId)))) return c.json({ error: 'not found' }, 404); const why = await uploadBlocker(pool, rideId); if (why) return c.json({ error: why }, 400);
    if (!(await account())) return c.json({ error: 'Strava is not connected' }, 409);
    await enqueue(pool, rideId); return c.body(null, 202);
  });
  r.delete('/', async (c) => { // disconnect: revoke at Strava (new endpoint, Basic auth), then delete our tokens
    const a = await account(); if (!a) return c.body(null, 204);
    try { await cfg.fetch(`${OAUTH}/revoke`, { method: 'POST', headers: { authorization: `Basic ${Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString('base64')}`, 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token: decrypt(a.refresh_token_enc, cfg.encKeyHex), token_type_hint: 'refresh_token' }) }); } catch { /* still delete locally */ }
    await pool.query('delete from strava_account where profile_id=$1', [a.profile_id]); return c.body(null, 204);
  });
  return r;
}

/** Plan 8.1: never upload demo-trainer rides, discarded rides, or rides under 1 minute. */
export async function uploadBlocker(pool: pg.Pool, rideId: number): Promise<string | null> {
  const q = await pool.query<{ status: string; simulator: boolean; summary: RideSummary | null }>('select status, simulator, summary from ride where id=$1', [rideId]); const ride = q.rows[0];
  if (!ride) return 'ride not found'; if (ride.simulator) return 'Rides on the demo trainer are never uploaded'; if (ride.status !== 'done') return 'Only finished rides can be uploaded';
  if ((ride.summary?.durationS ?? 0) < 60) return 'Rides under 1 minute are not uploaded'; return null;
}
export async function enqueue(pool: pg.Pool, rideId: number) {
  await pool.query("insert into strava_upload(ride_id, status, next_attempt_at) values ($1,'queued','epoch') on conflict (ride_id) do update set status = case when strava_upload.status = 'done' then 'done' else 'queued' end, next_attempt_at = 'epoch', attempts = case when strava_upload.status = 'failed' then 0 else strava_upload.attempts end", [rideId]);
}

/** Background queue: processes due uploads. Exported for tests; the server runs it every 5 s. */
export async function processUploads(pool: pg.Pool, cfg: StravaConfig): Promise<void> {
  const due = (await pool.query("select ride_id, attempts, strava_upload_id from strava_upload where status in ('queued','uploading') and next_attempt_at <= to_timestamp($1) order by updated_at limit 3", [cfg.now() / 1000])).rows;
  for (const u of due) {
    const acc = (await pool.query('select a.* from strava_account a join ride r on r.profile_id = a.profile_id where r.id=$1', [u.ride_id])).rows[0];
    if (!acc) { await fail(pool, u.ride_id, 'Strava disconnected', true); continue; }
    try {
      const token = await validToken(pool, acc, cfg);
      if (!u.strava_upload_id) {
        const ride = (await pool.query('select name, started_at, summary from ride where id=$1', [u.ride_id])).rows[0];
        let samples = await loadSamples(pool, Number(u.ride_id)); if (!acc.include_hr) samples = samples.map((s) => ({ ...s, hr: null }));
        const fit = encodeActivityFit({ startedAtMs: ride.started_at.getTime(), samples, summary: ride.summary ?? summarize(samples, 200) });
        const form = new FormData(); form.set('file', new Blob([fit.buffer as ArrayBuffer]), `myfitbike-ride-${u.ride_id}.fit`); form.set('data_type', 'fit'); form.set('external_id', `myfitbike-ride-${u.ride_id}`);
        form.set('name', String(acc.name_template).replace('{name}', ride.name)); form.set('trainer', '1'); form.set('sport_type', 'VirtualRide');
        const res = await cfg.fetch(`${cfg.apiBase}/uploads`, { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: form });
        if (res.status === 429) { await retry(pool, u.ride_id, u.attempts, 'Strava rate limit reached', cfg, 15 * 60); continue; }
        const body = (await res.json()) as { id?: number; error?: string | null };
        if (!res.ok || !body.id) { await retry(pool, u.ride_id, u.attempts, body.error ?? `upload failed (${res.status})`, cfg); continue; }
        await pool.query("update strava_upload set status='uploading', strava_upload_id=$2, updated_at=now(), next_attempt_at=to_timestamp($3) where ride_id=$1", [u.ride_id, body.id, cfg.now() / 1000 + 2]);
        continue;
      }
      const res = await cfg.fetch(`${cfg.apiBase}/uploads/${u.strava_upload_id}`, { headers: { authorization: `Bearer ${token}` } });
      if (res.status === 429) { await retry(pool, u.ride_id, u.attempts, 'Strava rate limit reached', cfg, 15 * 60); continue; }
      const st = (await res.json()) as { activity_id?: number | null; error?: string | null; status?: string };
      if (st.activity_id) await pool.query("update strava_upload set status='done', strava_activity_id=$2, last_error=null, updated_at=now() where ride_id=$1", [u.ride_id, st.activity_id]);
      else if (st.error) { const dup = /duplicate of activity (\d+)/.exec(st.error); if (dup) await pool.query("update strava_upload set status='done', strava_activity_id=$2, last_error=null, updated_at=now() where ride_id=$1", [u.ride_id, Number(dup[1])]); else await fail(pool, u.ride_id, st.error, true); }
      else await pool.query('update strava_upload set next_attempt_at=to_timestamp($2), updated_at=now() where ride_id=$1', [u.ride_id, cfg.now() / 1000 + 2]); // still processing
    } catch (e) { await retry(pool, u.ride_id, u.attempts, (e as Error).message, cfg); }
  }
}
async function validToken(pool: pg.Pool, acc: { profile_id: number; access_token_enc: string; refresh_token_enc: string; expires_at: Date }, cfg: StravaConfig): Promise<string> {
  if (acc.expires_at.getTime() - cfg.now() > 60_000) return decrypt(acc.access_token_enc, cfg.encKeyHex);
  const res = await cfg.fetch(`${OAUTH}/token`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: cfg.clientId, client_secret: cfg.clientSecret, grant_type: 'refresh_token', refresh_token: decrypt(acc.refresh_token_enc, cfg.encKeyHex) }) });
  if (!res.ok) throw new Error(`token refresh failed (${res.status})`);
  const t = (await res.json()) as { access_token: string; refresh_token: string; expires_at: number }; // always store the latest refresh token
  await pool.query('update strava_account set access_token_enc=$2, refresh_token_enc=$3, expires_at=to_timestamp($4) where profile_id=$1', [acc.profile_id, encrypt(t.access_token, cfg.encKeyHex), encrypt(t.refresh_token, cfg.encKeyHex), t.expires_at]);
  return t.access_token;
}
async function retry(pool: pg.Pool, rideId: number, attempts: number, error: string, cfg: StravaConfig, delayS?: number) {
  if (attempts + 1 >= 5) return fail(pool, rideId, error, false); // give up after 5 attempts and show why
  const wait = delayS ?? Math.min(600, 10 * 2 ** attempts);
  await pool.query("update strava_upload set attempts=attempts+1, last_error=$2, status='queued', strava_upload_id=null, next_attempt_at=to_timestamp($3), updated_at=now() where ride_id=$1", [rideId, error, cfg.now() / 1000 + wait]);
}
async function fail(pool: pg.Pool, rideId: number, error: string, final: boolean) {
  await pool.query("update strava_upload set status='failed', last_error=$2, attempts=attempts+$3, updated_at=now() where ride_id=$1", [rideId, error, final ? 0 : 1]);
}
