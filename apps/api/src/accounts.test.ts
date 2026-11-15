// Accounts (PLAN 17.2): once the app is public, one rider must never see or change another rider's data, and a missing
// or forged sign-in must get nothing. Runs on the real Postgres test database; only token verification is faked (the
// real verifier checks Supabase's signature, which tests can't produce).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import pg from 'pg';
import { DEFAULT_AVATAR } from '@myfitbike/shared';
import { createApp } from './app.js';
import { useWorldSource } from './routes.js';
import { nodeWorldSource } from './worldFile.js';
import { migrate } from './db/migrate.js';
import { env } from './env.js';
import { readState, signState } from './strava.js';
import { decodeSamples, encodeSamples } from './archive.js';
useWorldSource(nodeWorldSource());

const pool = new pg.Pool({ connectionString: env.testDatabaseUrl });
const USERS: Record<string, { userId: string; email: string }> = {
  ann: { userId: '11111111-1111-4111-8111-111111111111', email: 'ann@example.com' },
  bob: { userId: '22222222-2222-4222-8222-222222222222', email: 'bob@example.com' },
};
const verify = async (t: string) => { const u = USERS[t]; if (!u) throw new Error('bad signature'); return u; };
const mk = (extra: { allowedEmails?: string[]; claimUnowned?: boolean } = {}) => createApp(pool, { auth: { mode: 'supabase', supabaseUrl: 'https://x.supabase.co', verify, ...extra } });
type Res = { status: number; json(): Promise<any> };
const as = (app: ReturnType<typeof mk>, who: string | null) => async (method: string, path: string, body?: unknown): Promise<Res> =>
  app.request(path, { method, headers: { 'content-type': 'application/json', ...(who ? { authorization: `Bearer ${who}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
const rider = (name: string) => ({ name, weightKg: 70, bikeWeightKg: 8.5, ftpW: 250, maxHr: null, restingHr: null, units: 'metric', setupComplete: true, avatar: DEFAULT_AVATAR, country: null });
const samples = Array.from({ length: 120 }, (_, i) => ({ t: i, power: 200 + (i % 7), cadence: 90, hr: 140, speed: 9, distance: i * 9, alt: 10, grade: 1.5, target: null, step: null }));

beforeAll(async () => { await pool.query('drop schema public cascade; create schema public'); await migrate(pool); });
beforeEach(async () => { await pool.query('truncate profile restart identity cascade'); });
afterAll(() => pool.end());

describe('sign-in is required once accounts are on', () => {
  it('refuses requests without a token or with a forged one, but keeps the health check public', async () => {
    const app = mk();
    expect((await as(app, null)('GET', '/profile')).status).toBe(401);
    expect((await as(app, 'forged')('GET', '/rides')).status).toBe(401);
    expect((await as(app, null)('GET', '/health')).status).toBe(200);
  });
  it('lets only invited e-mails in when an invite list is set (closed beta)', async () => {
    const app = mk({ allowedEmails: ['Ann@Example.com'] });
    expect((await as(app, 'ann')('GET', '/settings')).status).toBe(200);
    expect((await as(app, 'bob')('GET', '/settings')).status).toBe(403);
  });
});

describe('each rider sees only their own data', () => {
  it('gives every account its own profile', async () => {
    const app = mk(); await as(app, 'ann')('PUT', '/profile', rider('Ann'));
    expect((await as(app, 'bob')('GET', '/profile')).status).toBe(404); /* Bob hasn't made one yet — he must not get Ann's */
    await as(app, 'bob')('PUT', '/profile', rider('Bob'));
    expect((await (await as(app, 'ann')('GET', '/profile')).json()).name).toBe('Ann');
    expect((await (await as(app, 'bob')('GET', '/profile')).json()).name).toBe('Bob');
  });
  it("hides, protects and refuses changes to another rider's ride", async () => {
    const app = mk(); const ann = as(app, 'ann'), bob = as(app, 'bob');
    await ann('PUT', '/profile', rider('Ann')); await bob('PUT', '/profile', rider('Bob'));
    const { id } = await (await ann('POST', '/rides', { mode: 'free', name: 'Ann ride', startedAt: new Date().toISOString() })).json();
    expect((await bob('POST', `/rides/${id}/samples`, samples)).status).toBe(404);
    await ann('POST', `/rides/${id}/samples`, samples); await ann('PATCH', `/rides/${id}`, { status: 'done', ftp: 250 });
    expect((await bob('GET', `/rides/${id}`)).status).toBe(404);
    expect((await bob('GET', `/rides/${id}/fit`)).status).toBe(404);
    expect((await bob('PATCH', `/rides/${id}`, { status: 'discarded' })).status).toBe(404);
    expect(await (await bob('GET', '/rides')).json()).toEqual([]);
    await bob('DELETE', `/rides/${id}`);
    expect((await ann('GET', `/rides/${id}`)).status).toBe(200); /* still there */
    expect((await (await bob('GET', '/analytics')).json()).records).toEqual([]); /* Ann's power records aren't Bob's */
  });
  it("keeps two riders' workouts apart even when the browser gives them the same id", async () => {
    const app = mk(); const ann = as(app, 'ann'), bob = as(app, 'bob'); await ann('PUT', '/profile', rider('Ann')); await bob('PUT', '/profile', rider('Bob'));
    const w = (name: string) => ({ id: 'import-abc', source: 'import', name, category: 'endurance', durationS: 600, steps: [{ kind: 'free', durS: 600 }] });
    await ann('POST', '/workouts', w('Ann intervals')); await bob('POST', '/workouts', w('Bob intervals'));
    expect((await (await ann('GET', '/workouts')).json()).map((x: { name: string }) => x.name)).toEqual(['Ann intervals']);
    await bob('DELETE', '/workouts/import-abc');
    expect((await (await ann('GET', '/workouts')).json())).toHaveLength(1);
  });
  it("refuses to delete another rider's real route (ids are sequential, so one account could wipe everyone's)", async () => {
    const app = mk(); const ann = as(app, 'ann'), bob = as(app, 'bob'); await ann('PUT', '/profile', rider('Ann')); await bob('PUT', '/profile', rider('Bob'));
    const { id } = await (await ann('POST', '/real-routes', { name: 'Ann route', fileName: 'a.gpx' })).json();
    expect((await bob('DELETE', `/real-routes/${id}`)).status).toBe(204); /* same answer as for a missing id: does not reveal that it exists */
    expect((await (await ann('GET', '/real-routes')).json()).map((x: { id: string }) => x.id)).toEqual([id]);
    expect((await ann('DELETE', `/real-routes/${id}`)).status).toBe(204);
    expect(await (await ann('GET', '/real-routes')).json()).toEqual([]);
  });
});

describe('local installs', () => {
  it('lets the first account to sign in take over the existing local profile, and nobody after that', async () => {
    await createApp(pool).request('/profile', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(rider('Local')) });
    const app = mk({ claimUnowned: true });
    expect((await (await as(app, 'ann')('GET', '/profile')).json()).name).toBe('Local');
    expect((await as(app, 'bob')('GET', '/profile')).status).toBe(404);
  });
});

describe('finished rides are stored compactly (PLAN 17.1: rows would fill a free database in a month)', () => {
  it('moves a finished ride from per-second rows into one archive entry, and reads it back unchanged', async () => {
    const app = createApp(pool); const call = async (m: string, p: string, b?: unknown): Promise<Res> => app.request(p, { method: m, headers: { 'content-type': 'application/json' }, body: b === undefined ? undefined : JSON.stringify(b) });
    await call('PUT', '/profile', rider('Local')); const { id } = await (await call('POST', '/rides', { mode: 'free', name: 'r', startedAt: new Date().toISOString() })).json();
    await call('POST', `/rides/${id}/samples`, samples); await call('PATCH', `/rides/${id}`, { status: 'done', ftp: 250 });
    expect((await pool.query('select count(*)::int n from ride_sample where ride_id=$1', [id])).rows[0].n).toBe(0);
    expect((await pool.query('select n from ride_archive where ride_id=$1', [id])).rows[0].n).toBe(120);
    expect((await (await call('GET', `/rides/${id}`)).json()).samples).toEqual(samples);
  });
  it('compresses an hour of riding to a small fraction of its row size', async () => {
    const hour = Array.from({ length: 3600 }, (_, i) => ({ t: i, power: 180 + Math.round(30 * Math.sin(i / 20)), cadence: 88 + (i % 5), hr: 130 + (i % 11), speed: 8.5 + (i % 3) / 10, distance: i * 8.6, alt: 50 + Math.sin(i / 100) * 20, grade: Math.round(Math.sin(i / 100) * 30) / 10 || 0 /* JSON has no -0 */, target: null, step: null }));
    const gz = await encodeSamples(hour); expect(gz.byteLength).toBeLessThan(385_000 / 4); /* rows: ~385 KB per hour */
    expect(await decodeSamples(gz)).toEqual(hour);
  });
});

describe('Strava link state', () => {
  const KEY = 'ab'.repeat(32);
  it('names the rider who started the link and expires; a tampered or foreign state is refused', () => {
    const s = signState(7, KEY, 1_000); expect(readState(s, KEY, 2_000)).toBe(7);
    expect(readState(s, KEY, 1_000 + 16 * 60_000)).toBeNull(); /* 15 minutes */
    expect(readState(s.replace(/^7\./, '8.'), KEY, 2_000)).toBeNull(); /* someone else's profile id */
    expect(readState(s, 'cd'.repeat(32), 2_000)).toBeNull();
  });
});

// Audit M3: on Cloudflare every signed-in rider has their own request budget; the public health check is budgeted per IP.
describe('one rider cannot flood the API', () => {
  const seen: { bucket: string; key: string }[] = [];
  const rateLimit = async (bucket: 'api' | 'costly' | 'public', key: string) => { seen.push({ bucket, key }); return seen.filter((x) => x.bucket === bucket && x.key === key).length < 3; };
  const mkRl = () => { seen.length = 0; return createApp(pool, { auth: { mode: 'supabase', supabaseUrl: 'https://x.supabase.co', verify }, rateLimit }); };
  it("answers 429 with retry-after once a rider's budget is spent, without touching another rider's budget", async () => {
    const app = mkRl(); const ann = as(app, 'ann'), bob = as(app, 'bob');
    expect((await ann('GET', '/rides')).status).toBe(200); expect((await ann('GET', '/rides')).status).toBe(200);
    const r = await app.request('/rides', { headers: { authorization: 'Bearer ann' } }); expect(r.status).toBe(429); expect(r.headers.get('retry-after')).toBe('60');
    expect((await bob('GET', '/rides')).status).toBe(200);
  });
  it('counts Strava uploads in the small "costly" bucket and the anonymous health check per IP', async () => {
    const app = mkRl(); await as(app, 'ann')('POST', '/strava/uploads', { rideId: 1 });
    await app.request('/health', { headers: { 'cf-connecting-ip': '203.0.113.9' } });
    expect(seen).toEqual([{ bucket: 'costly', key: USERS.ann!.userId }, { bucket: 'public', key: '203.0.113.9' }]);
  });
});

// Audit M1: the link must be finished by the same signed-in rider who started it, or Bob could plant Ann's link on his
// profile (or Ann's Strava tokens on Bob's), and Strava must never be called for a state that isn't the caller's.
describe('a Strava account is linked only by the rider who started the link', () => {
  const stravaCalls: string[] = [];
  const fakeStrava = (async (url: string | URL) => { stravaCalls.push(String(url)); return new Response(JSON.stringify({ access_token: 'a', refresh_token: 'r', expires_at: 2_000_000_000, athlete: { id: 42, firstname: 'Ann' } }), { status: 200, headers: { 'content-type': 'application/json' } }); }) as typeof fetch;
  const strava = (now: number) => ({ clientId: '1', clientSecret: 's', encKeyHex: 'ab'.repeat(32), apiBase: 'https://strava.test', webBase: 'https://web.test', publicApiBase: 'https://web.test/api', fetch: fakeStrava, now: () => now });
  const mkS = (now = 1_000_000) => createApp(pool, { auth: { mode: 'supabase', supabaseUrl: 'https://x.supabase.co', verify }, strava: strava(now) });
  const accounts = async () => (await pool.query('select profile_id from strava_account')).rows;
  const start = async (app: ReturnType<typeof mkS>) => new URL((await (await as(app, 'ann')('GET', '/strava/oauth/url')).json()).url).searchParams;
  beforeEach(async () => { stravaCalls.length = 0; const app = mkS(); await as(app, 'ann')('PUT', '/profile', rider('Ann')); await as(app, 'bob')('PUT', '/profile', rider('Bob')); });
  it("refuses Bob finishing Ann's link without calling Strava, then links it for Ann", async () => {
    const app = mkS(); const q = await start(app); expect(q.get('redirect_uri')).toBe('https://web.test/settings/connections');
    const body = { code: 'c1', state: q.get('state'), scope: 'read,activity:write' };
    expect((await as(app, 'bob')('POST', '/strava/oauth/complete', body)).status).toBe(400); expect(stravaCalls).toEqual([]); expect(await accounts()).toEqual([]);
    const r = await as(app, 'ann')('POST', '/strava/oauth/complete', body); expect(r.status).toBe(200); expect(await r.json()).toEqual({ result: 'connected' });
    const annId = (await pool.query("select id from profile where name='Ann'")).rows[0].id; expect(await accounts()).toEqual([{ profile_id: annId }]);
  });
  it('has no public door any more: finishing a link needs a signed-in rider, and the old callback is gone', async () => {
    const app = mkS(); expect((await as(app, null)('POST', '/strava/oauth/complete', { code: 'c', state: 's', scope: 'activity:write' })).status).toBe(401);
    expect((await as(app, null)('GET', '/strava/oauth/callback?code=x&state=y')).status).toBe(401);
  });
  it('refuses a link without upload permission, or one started more than 15 minutes ago, before calling Strava', async () => {
    const app = mkS(); const state = (await start(app)).get('state');
    expect(await (await as(app, 'ann')('POST', '/strava/oauth/complete', { code: 'c', state, scope: 'read' })).json()).toEqual({ result: 'scope' });
    expect((await as(mkS(1_000_000 + 16 * 60_000), 'ann')('POST', '/strava/oauth/complete', { code: 'c', state, scope: 'activity:write' })).status).toBe(400);
    expect(stravaCalls).toEqual([]);
  });
});
