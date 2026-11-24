import { gunzipSync } from 'node:zlib';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import pg from 'pg';
import { DEFAULT_AVATAR } from '@myfitbike/shared';
import { createApp } from './app.js';
import { useWorldSource } from './routes.js';
import { nodeWorldSource } from './worldFile.js';
useWorldSource(nodeWorldSource());
import { migrate } from './db/migrate.js';
import { env } from './env.js';
import { createCipheriv, createHmac, randomBytes } from 'node:crypto';
import { decrypt, encrypt, processUploads, readState, type StravaConfig } from './strava.js';

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
  await pool.query("insert into strava_account(profile_id, athlete_id, athlete_name, access_token_enc, refresh_token_enc, expires_at) values ($1, 42, 'Test', $2, $3, to_timestamp($4))", [pid, encrypt('access-1', KEY, `strava:${pid}:access`), encrypt('refresh-1', KEY, `strava:${pid}:refresh`), clock / 1000 + expiresInS]);
}
beforeAll(async () => { await pool.query('drop schema public cascade; create schema public'); await migrate(pool); });
beforeEach(async () => { await pool.query('truncate profile restart identity cascade'); calls.length = 0; replies = []; await call('PUT', '/profile', rider); });
afterAll(() => pool.end());

// Audit L3: settings are what the browser reads back, so only known settings may go in or come out.
describe('settings never leak server-side secrets or accept made-up keys', () => {
  it('keeps the encrypted intervals.icu key out of GET /settings while the connection still works', async () => {
    expect((await call('PUT', '/intervals/key', { apiKey: 'abcdefghijklmnop' })).status).toBe(204);
    expect(await (await call('GET', '/settings')).json()).not.toHaveProperty('intervals.key');
    expect((await (await call('GET', '/intervals/status')).json()).connected).toBe(true);
  });
  it('refuses keys that only exist on every JavaScript object (constructor, __proto__, toString)', async () => {
    for (const k of ['constructor', '__proto__', 'toString']) expect((await call('PUT', `/settings/${k}`, { value: 1 })).status).toBe(400);
  });
  it('accepts TV favourites (the TV tab saves them)', async () => {
    expect((await call('PUT', '/settings/tv.favourites', { value: ['dw-english'] })).status).toBe(204);
    expect((await (await call('GET', '/settings')).json())['tv.favourites']).toEqual(['dw-english']);
  });
});

// Audit L4: stored Strava tokens and the intervals.icu key. Production already holds values in the old format, so those
// must keep decrypting; new values are versioned, use a derived key, and only decrypt for the row they were written for.
describe('stored secrets: derived keys, bound to their owner, old values still readable', () => {
  /** The pre-v2 format exactly as it was written until now (raw master key, no associated data). */
  const legacyEncrypt = (plain: string, keyHex: string) => { const iv = randomBytes(12), c = createCipheriv('aes-256-gcm', Buffer.from(keyHex, 'hex'), iv); const enc = Buffer.concat([c.update(plain, 'utf8'), c.final()]); return [iv, c.getAuthTag(), enc].map((b) => b.toString('base64')).join('.'); };
  it('writes a versioned value that round-trips', () => { const e = encrypt('tok', KEY, 'strava:1:access'); expect(e.startsWith('v2.')).toBe(true); expect(decrypt(e, KEY, 'strava:1:access')).toBe('tok'); });
  it("makes a ciphertext copied into another rider's row useless", () => { expect(() => decrypt(encrypt('tok', KEY, 'strava:1:access'), KEY, 'strava:2:access')).toThrow(); });
  it('still decrypts values written in the old format (tokens already stored in production)', () => { expect(decrypt(legacyEncrypt('old-token', KEY), KEY, 'anything')).toBe('old-token'); });
  it('refuses an OAuth state signed with the raw master key (encryption and signing no longer share a key)', () => {
    const body = `7.${clock + 60_000}.abcd`; const old = `${body}.${createHmac('sha256', Buffer.from(KEY, 'hex')).update(body).digest('base64url')}`;
    expect(readState(old, KEY, clock)).toBeNull();
  });
  it('keeps uploading for an account stored in the old format, and rewrites it as v2 on the next token refresh', async () => {
    await call('PUT', '/profile', rider); const pid = (await pool.query('select id from profile limit 1')).rows[0].id;
    await pool.query("insert into strava_account(profile_id, athlete_id, athlete_name, access_token_enc, refresh_token_enc, expires_at) values ($1, 42, 'Old', $2, $3, to_timestamp($4))", [pid, legacyEncrypt('access-old', KEY), legacyEncrypt('refresh-old', KEY), clock / 1000 - 10]);
    const id = await ride(); await call('POST', '/strava/uploads', { rideId: id });
    replies = [(u) => (u.includes('/oauth/token') ? json({ access_token: 'access-new', refresh_token: 'refresh-new', expires_at: clock / 1000 + 21600 }) : undefined), (u) => (u.endsWith('/uploads') ? json({ id: 6 }, 201) : undefined)];
    await processUploads(pool, cfg);
    expect(String(calls.find((c) => c.url.includes('/oauth/token'))!.body)).toContain('refresh_token=refresh-old'); /* the old value was read */
    const acc = (await pool.query('select refresh_token_enc from strava_account')).rows[0]; expect(acc.refresh_token_enc.startsWith('v2.')).toBe(true); expect(decrypt(acc.refresh_token_enc, KEY, `strava:${pid}:refresh`)).toBe('refresh-new');
  });
  // Security audit 2, V12: riders who never upload keep old-format values forever, so the old path could never go.
  it('rewrites every old-format value as v2 bound to its owner, and a second run changes nothing', async () => {
    const { reencrypt } = await import('../scripts/reencrypt.js'); const pid = (await pool.query('select id from profile limit 1')).rows[0].id;
    await pool.query("insert into strava_account(profile_id, athlete_id, athlete_name, access_token_enc, refresh_token_enc, expires_at) values ($1, 42, 'Old', $2, $3, now())", [pid, legacyEncrypt('access-old', KEY), legacyEncrypt('refresh-old', KEY)]);
    await pool.query("insert into settings(profile_id, key, value) values ($1, 'intervals.key', $2)", [pid, JSON.stringify(legacyEncrypt('icu-old', KEY))]);
    expect(await reencrypt(pool, KEY, true)).toEqual({ found: 2, rewritten: 0, failed: 0 }); /* dry run only counts */
    expect(await reencrypt(pool, KEY)).toEqual({ found: 2, rewritten: 2, failed: 0 });
    const a = (await pool.query('select access_token_enc, refresh_token_enc from strava_account')).rows[0];
    expect(decrypt(a.access_token_enc, KEY, `strava:${pid}:access`)).toBe('access-old'); expect(decrypt(a.refresh_token_enc, KEY, `strava:${pid}:refresh`)).toBe('refresh-old');
    const k = (await pool.query("select value from settings where key='intervals.key'")).rows[0].value; expect(k.startsWith('v2.')).toBe(true); expect(decrypt(k, KEY, `intervals:${pid}`)).toBe('icu-old');
    expect(await reencrypt(pool, KEY)).toEqual({ found: 0, rewritten: 0, failed: 0 });
  });
});

describe('Strava — opt-in upload that can never duplicate or block a ride', () => {
  it('refuses an upload-name template over 120 characters (it is stored per rider and sent to Strava with every upload)', async () => {
    await connect(); expect((await call('PATCH', '/strava/settings', { nameTemplate: 'x'.repeat(121) })).status).toBe(400);
  });
  it('encrypts tokens at rest (AES-GCM) and decrypts them back', () => { const e = encrypt('tok', KEY, 'strava:1:access'); expect(e).not.toContain('tok'); expect(decrypt(e, KEY, 'strava:1:access')).toBe('tok'); });
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
    const acc = (await pool.query('select profile_id, refresh_token_enc from strava_account')).rows[0]; expect(decrypt(acc.refresh_token_enc, KEY, `strava:${acc.profile_id}:refresh`)).toBe('refresh-2');
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

// Security audit 2, V5: the rider's own key decides what their calendar holds, and the server expands it.
describe('planned workouts from intervals.icu are bounded', () => {
  const ev = (id: number, steps: unknown[]) => ({ id, name: `W${id}`, type: 'Ride', start_date_local: '2026-11-16T07:00:00', workout_doc: { steps } });
  const ok = [{ duration: 600, power: { value: 80, units: '%ftp' } }];
  const answer = (body: unknown) => { replies = [(u) => (u.includes('icu.test/api/v1/athlete/0/events') ? (typeof body === 'string' ? new Response(body, { status: 200 }) : json(body)) : undefined)]; };
  const sync = async () => { const t0 = performance.now(); const r = await call('POST', '/intervals/sync'); return { status: r.status, body: await r.json(), ms: performance.now() - t0 }; };
  beforeEach(async () => { await call('PUT', '/intervals/key', { apiKey: 'abcdef1234567890' }); });
  it('skips a repeat of 3,000,000 at once instead of expanding it (623 MB before)', async () => {
    answer([ev(1, [{ reps: 3_000_000, steps: [{ duration: 1, power: { value: 50 } }] }])]); const r = await sync();
    expect(r.status).toBe(200); expect(r.body.imported).toEqual([]); expect(r.ms).toBeLessThan(1000);
  });
  it('skips a step of 2,000,000,000 seconds at once (14.7 s of CPU before)', async () => {
    answer([ev(1, [{ duration: 2e9, power: { value: 50 } }])]); const r = await sync(); expect(r.body.imported).toEqual([]); expect(r.ms).toBeLessThan(1000);
  });
  it('reads at most 60 calendar entries', async () => {
    answer(Array.from({ length: 61 }, (_, i) => ev(i + 1, ok))); expect((await sync()).body.checked).toBe(60);
  });
  it('refuses an answer over 2 MB', async () => {
    answer(JSON.stringify([ev(1, ok), { pad: 'x'.repeat(3 * 1024 * 1024) }])); expect((await sync()).status).toBe(502);
  });
  it('counts against the 500-workout cap, but still updates a workout it imported before', async () => {
    const pid = (await pool.query('select id from profile limit 1')).rows[0].id;
    await pool.query(`insert into workout(id, profile_id, source, name, category, duration_s, steps) select 'w' || g, $1, 'custom', 'x', 'endurance', 60, '[]' from generate_series(1, 499) g`, [pid]);
    await pool.query(`insert into workout(id, profile_id, source, name, category, duration_s, steps) values ('intervals-9', $1, 'import', 'old', 'endurance', 60, '[]')`, [pid]);
    answer([ev(9, ok), ev(10, ok), ev(11, ok)]); const r = (await sync()).body;
    expect(r.imported.map((x: { id: string }) => x.id)).toEqual(['intervals-9']); expect(r.skipped).toBe(2);
    expect((await pool.query("select name from workout where id='intervals-9'")).rows[0].name).toBe('2026-11-16 · W9');
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
    expect(await (await app2.request('/radio/click/11111111-2222-3333-4444-555555555555', { method: 'POST', headers: { 'content-type': 'application/json' } /* as the web app sends it */ })).json()).toEqual({ url: 'https://stream.test/jazz2' });
    expect((await app2.request('/radio/click/not-a-uuid', { method: 'POST', headers: { 'content-type': 'application/json' } /* as the web app sends it */ })).status).toBe(400);
  });
  // Audit L8: station icons come from a community directory; plain-http ones are dropped (the page's policy blocks them),
  // and the directory's error text (host names, status codes) stays in the server log.
  it('drops http station icons and answers a directory outage with a generic message', async () => {
    const st = { stationuuid: '11111111-2222-3333-4444-555555555555', name: 'A', url: '', url_resolved: 'https://s.test/a', codec: 'MP3', bitrate: 1, hls: 0, favicon: 'http://img.test/a.png', country: '', countrycode: '', tags: '', homepage: '', lastcheckok: 1 };
    const ok = createApp(pool, { radio: { fetch: (async () => json([st])) as typeof fetch, servers: async () => ['up.test'] } });
    expect(((await (await ok.request('/radio/search?name=a')).json()) as { favicon: string | null }[])[0]!.favicon).toBeNull();
    const down = createApp(pool, { radio: { fetch: (async () => new Response('nope', { status: 503 })) as typeof fetch, servers: async () => ['secret-host.test'] } });
    const r = await down.request('/radio/search?name=a'); expect(r.status).toBe(502); expect(JSON.stringify(await r.json())).not.toContain('secret-host');
  });
  // Security audit 2, V11: a hijacked DNS answer must not choose the hosts this server fetches from.
  it("uses only the directory's own server names from DNS", async () => {
    const { DIRECTORY_HOST } = await import('./radio.js');
    for (const h of ['de1.api.radio-browser.info', 'all.api.radio-browser.info']) expect(DIRECTORY_HOST.test(h), h).toBe(true);
    for (const h of ['evil.example', 'api.radio-browser.info.evil.example', 'evil.example/x.api.radio-browser.info']) expect(DIRECTORY_HOST.test(h), h).toBe(false);
  });
  // A whole country's list (the US: ~7,000 stations, 2.6 MB of JSON) is sent at once so name/genre filtering is instant;
  // compression keeps that first load small.
  it('sends a big station list gzipped, and it still decodes to the same stations', async () => {
    const many = Array.from({ length: 2000 }, (_, i) => ({ stationuuid: `00000000-0000-0000-0000-${String(i).padStart(12, '0')}`, name: `Station ${i}`, url: '', url_resolved: `https://stream.test/${i}`, codec: 'MP3', bitrate: 128, hls: 0, favicon: '', country: 'United States Of America', countrycode: 'US', tags: 'pop,rock', homepage: '', lastcheckok: 1 }));
    const app3 = createApp(pool, { radio: { fetch: (async () => json(many)) as typeof fetch, servers: async () => ['up.test'] } });
    const res = await app3.request('/radio/search?countrycode=US&limit=10000', { headers: { 'accept-encoding': 'gzip' } });
    expect(res.headers.get('content-encoding')).toBe('gzip');
    const raw = new Uint8Array(await res.arrayBuffer()); const text = new TextDecoder().decode(gunzipSync(raw));
    expect(raw.byteLength).toBeLessThan(text.length / 4); expect(JSON.parse(text)).toHaveLength(2000);
  });
});
