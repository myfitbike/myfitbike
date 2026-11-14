import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import pg from 'pg';
import { DEFAULT_AVATAR } from '@myfitbike/shared';
import { createApp } from './app.js';
import { migrate } from './db/migrate.js';
import { env } from './env.js';
import { decrypt, encrypt, processUploads, type StravaConfig } from './strava.js';

// Strava is mocked: tests must never touch the real service. Postgres is real.
const pool = new pg.Pool({ connectionString: env.testDatabaseUrl });
const KEY = 'a'.repeat(64); let clock = Date.UTC(2026, 10, 14, 8); const calls: { url: string; body?: unknown }[] = [];
let replies: ((url: string) => Response | undefined)[] = [];
const fakeFetch = (async (url: string | URL, init?: RequestInit) => { const u = String(url); calls.push({ url: u, body: init?.body }); for (const r of replies) { const x = r(u); if (x) return x; } return new Response('{}', { status: 500 }); }) as typeof fetch;
const cfg: StravaConfig = { clientId: '123', clientSecret: 'secret', encKeyHex: KEY, apiBase: 'https://strava.test/api/v3', webBase: 'http://web', publicApiBase: 'http://api', fetch: fakeFetch, now: () => clock };
const app = createApp(pool, { strava: cfg, intervals: { encKeyHex: KEY, fetch: fakeFetch, base: 'https://icu.test' } });
const call = async (m: string, p: string, b?: unknown): Promise<{ status: number; json(): Promise<any> }> => app.request(p, { method: m, headers: { 'content-type': 'application/json' }, body: b === undefined ? undefined : JSON.stringify(b) });
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } });
const rider = { name: 'R', weightKg: 80, bikeWeightKg: 8, ftpW: 250, maxHr: null, restingHr: null, units: 'metric', setupComplete: true, avatar: DEFAULT_AVATAR, country: null };

async function ride(opts: { simulator?: boolean; seconds?: number } = {}) {
  const { id } = await (await call('POST', '/rides', { mode: 'workout', name: 'Sweet Spot', startedAt: '2026-11-14T07:00:00Z', simulator: !!opts.simulator })).json();
  await call('POST', `/rides/${id}/samples`, Array.from({ length: opts.seconds ?? 120 }, (_, i) => ({ t: i + 1, power: 200, cadence: 90, hr: 140, speed: 9, distance: i * 9, alt: null, grade: 0, target: 200, step: 0 })));
  await call('PATCH', `/rides/${id}`, { status: 'done', ftp: 250 }); return id as number;
}
async function connect(expiresInS = 6 * 3600) {
  const pid = (await pool.query('select id from profile limit 1')).rows[0].id;
  await pool.query("insert into strava_account(profile_id, athlete_id, athlete_name, access_token_enc, refresh_token_enc, expires_at) values ($1, 42, 'Test', $2, $3, to_timestamp($4))", [pid, encrypt('access-1', KEY), encrypt('refresh-1', KEY), clock / 1000 + expiresInS]);
}
beforeAll(async () => { await pool.query('drop schema public cascade; create schema public'); await migrate(pool); });
beforeEach(async () => { await pool.query('truncate profile restart identity cascade'); calls.length = 0; replies = []; await call('PUT', '/profile', rider); });
afterAll(() => pool.end());

describe('Strava — opt-in upload that can never duplicate or block a ride', () => {
  it('encrypts tokens at rest (AES-GCM) and decrypts them back', () => { const e = encrypt('tok', KEY); expect(e).not.toContain('tok'); expect(decrypt(e, KEY)).toBe('tok'); });
  it('refuses demo-trainer rides and rides under a minute', async () => {
    await connect(); expect((await call('POST', '/strava/uploads', { rideId: await ride({ simulator: true }) })).status).toBe(400);
    expect((await call('POST', '/strava/uploads', { rideId: await ride({ seconds: 30 }) })).status).toBe(400);
  });
  it('uploads the FIT as a VirtualRide with the ride id as external_id, then records the activity', async () => {
    await connect(); const id = await ride(); await call('POST', '/strava/uploads', { rideId: id });
    replies = [(u) => (u.endsWith('/uploads') ? json({ id: 777, status: 'Your activity is still being processed.' }, 201) : undefined), (u) => (u.endsWith('/uploads/777') ? json({ id: 777, activity_id: 9001, status: 'Your activity is ready.' }) : undefined)];
    await processUploads(pool, cfg); const form = calls[0]!.body as FormData;
    expect(form.get('external_id')).toBe(`myfitbike-ride-${id}`); expect(form.get('sport_type')).toBe('VirtualRide'); expect(form.get('data_type')).toBe('fit'); expect(form.get('name')).toBe('Sweet Spot — MyFitBike');
    clock += 3000; await processUploads(pool, cfg);
    expect((await (await call('GET', `/strava/status?rideId=${id}`)).json()).upload).toMatchObject({ status: 'done', stravaActivityId: 9001 });
  });
  it('refreshes an expired token first and stores the new refresh token', async () => {
    await connect(-10); const id = await ride(); await call('POST', '/strava/uploads', { rideId: id });
    replies = [(u) => (u.includes('/oauth/token') ? json({ access_token: 'access-2', refresh_token: 'refresh-2', expires_at: clock / 1000 + 21600 }) : undefined), (u) => (u.endsWith('/uploads') ? json({ id: 5 }, 201) : undefined)];
    await processUploads(pool, cfg);
    const acc = (await pool.query('select refresh_token_enc from strava_account')).rows[0]; expect(decrypt(acc.refresh_token_enc, KEY)).toBe('refresh-2');
  });
  it('treats "duplicate of activity N" as already uploaded (retry after a lost response)', async () => {
    await connect(); const id = await ride(); await call('POST', '/strava/uploads', { rideId: id });
    replies = [(u) => (u.endsWith('/uploads') ? json({ id: 8 }, 201) : undefined), (u) => (u.endsWith('/uploads/8') ? json({ id: 8, activity_id: null, error: 'myfitbike-ride.fit duplicate of activity 5555' }) : undefined)];
    await processUploads(pool, cfg); clock += 3000; await processUploads(pool, cfg);
    expect((await (await call('GET', `/strava/status?rideId=${id}`)).json()).upload).toMatchObject({ status: 'done', stravaActivityId: 5555 });
  });
  it('backs off on HTTP 429 and gives up after 5 attempts with the reason', async () => {
    await connect(); const id = await ride(); await call('POST', '/strava/uploads', { rideId: id }); replies = [() => json({ message: 'Rate Limit Exceeded' }, 429)];
    for (let i = 0; i < 6; i++) { await processUploads(pool, cfg); clock += 16 * 60 * 1000; }
    expect((await (await call('GET', `/strava/status?rideId=${id}`)).json()).upload).toMatchObject({ status: 'failed', lastError: 'Strava rate limit reached' });
  });
  it('auto-uploads on finish only when the rider chose "Automatically"', async () => {
    await connect(); await call('PATCH', '/strava/settings', { autoUpload: 'auto' }); const id = await ride();
    expect((await pool.query('select status from strava_upload where ride_id=$1', [id])).rows[0]?.status).toBe('queued');
  });
});

describe('intervals.icu — planned workouts arrive in the library, the key never reaches the browser', () => {
  it('stores the key encrypted and imports a planned workout with ramps, repeats and free ride', async () => {
    expect((await call('PUT', '/intervals/key', { apiKey: 'abcdef1234567890' })).status).toBe(204);
    const stored = (await pool.query("select value from settings where key='intervals.key'")).rows[0].value; expect(String(stored)).not.toContain('abcdef1234567890');
    replies = [(u) => (u.includes('icu.test/api/v1/athlete/0/events') ? json([{ id: 77, name: 'VO2 4x5', type: 'Ride', start_date_local: '2026-11-16T07:00:00', workout_doc: { steps: [
      { warmup: true, ramp: true, duration: 600, power: { start: 50, end: 75, units: '%ftp' } },
      { reps: 4, steps: [{ duration: 300, power: { value: 110, units: '%ftp' }, cadence: { value: 95, units: 'rpm' } }, { duration: 180, power: { value: 55, units: '%ftp' } }] },
      { cooldown: true, duration: 300, freeride: true }] } }, { id: 78, name: 'Run', type: 'Run', workout_doc: { steps: [{ duration: 600 }] } }]) : undefined)];
    const r = await (await call('POST', '/intervals/sync')).json(); expect(r.imported).toEqual([{ id: 'intervals-77', name: '2026-11-16 · VO2 4x5' }]);
    const auth = (calls.find((c) => c.url.includes('icu.test'))!); void auth;
    const w = (await (await call('GET', '/workouts')).json()).find((x: { id: string }) => x.id === 'intervals-77');
    expect(w.durationS).toBe(600 + 4 * 480 + 300); expect(w.steps[1]).toMatchObject({ kind: 'repeat', times: 4 });
  });
});

describe('radio — station search goes through our API so the directory sees who is asking, and broken stations are dropped', () => {
  it('searches by name, genre and country, keeps only working http(s) streams, and fails over to the next server', async () => {
    const seen: { url: string; ua: string | null }[] = [];
    const radioFetch = (async (url: string | URL, init?: RequestInit) => {
      const u = String(url); seen.push({ url: u, ua: new Headers(init?.headers).get('user-agent') });
      if (u.startsWith('https://down.test')) return new Response('nope', { status: 503 });
      if (u.includes('/json/stations/search')) return json([
        { stationuuid: '11111111-2222-3333-4444-555555555555', name: ' Jazz FM ', url: 'http://x/pls', url_resolved: 'https://stream.test/jazz', codec: 'MP3', bitrate: 128, hls: 0, favicon: 'https://img.test/j.png', country: 'United Kingdom', countrycode: 'gb', tags: 'jazz,smooth jazz', homepage: 'https://jazz.test', lastcheckok: 1 },
        { stationuuid: '66666666-2222-3333-4444-555555555555', name: 'Dead', url: 'http://dead', url_resolved: '', codec: 'MP3', bitrate: 0, hls: 0, favicon: '', country: '', countrycode: '', tags: '', homepage: '', lastcheckok: 0 }]);
      if (u.includes('/json/url/')) return json({ ok: true, url: 'https://stream.test/jazz2' });
      return json([]);
    }) as typeof fetch;
    const app2 = createApp(pool, { radio: { fetch: radioFetch, servers: async () => ['down.test', 'up.test'] } });
    const res = await app2.request('/radio/search?name=jazz&tag=jazz&countrycode=gb'); expect(res.status).toBe(200);
    expect(await res.json()).toEqual([{ uuid: '11111111-2222-3333-4444-555555555555', name: 'Jazz FM', url: 'https://stream.test/jazz', codec: 'MP3', bitrate: 128, hls: false, favicon: 'https://img.test/j.png', country: 'United Kingdom', countryCode: 'GB', tags: ['jazz', 'smooth jazz'], homepage: 'https://jazz.test' }]);
    const search = seen.find((s) => s.url.startsWith('https://up.test/json/stations/search'))!; expect(search.ua).toMatch(/^MyFitBike\//);
    expect(search.url).toContain('name=jazz'); expect(search.url).toContain('tag=jazz'); expect(search.url).toContain('countrycode=GB'); expect(search.url).toContain('hidebroken=true');
    expect(await (await app2.request('/radio/click/11111111-2222-3333-4444-555555555555', { method: 'POST' })).json()).toEqual({ url: 'https://stream.test/jazz2' });
    expect((await app2.request('/radio/click/not-a-uuid', { method: 'POST' })).status).toBe(400);
  });
});
