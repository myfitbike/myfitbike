// Accounts (PLAN 17.2): once the app is public, one rider must never see or change another rider's data, and a missing
// or forged sign-in must get nothing. Runs on the real Postgres test database; only token verification is faked (the
// real verifier checks Google's signature, which tests can't produce).
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
const mk = (extra: { allowedEmails?: string[]; claimUnowned?: boolean } = {}) => createApp(pool, { auth: { mode: 'firebase', projectId: 'test-project', verify, ...extra } });
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
  const rateLimit = async (bucket: 'api' | 'costly' | 'public' | 'ip', key: string) => { if (bucket === 'ip') return true; /* tested on its own below */ seen.push({ bucket, key }); return seen.filter((x) => x.bucket === bucket && x.key === key).length < 3; };
  const mkRl = () => { seen.length = 0; return createApp(pool, { auth: { mode: 'firebase', projectId: 'test-project', verify }, rateLimit }); };
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
  // Security audit 2, V7: a request with a bad token was answered by sign-in before it reached any limiter.
  it('limits requests by IP before sign-in is checked, so a flood of bad tokens is refused too', async () => {
    const n = new Map<string, number>(); const ipOnly = async (bucket: string, key: string) => bucket !== 'ip' || (n.set(key, (n.get(key) ?? 0) + 1), n.get(key)! < 3);
    const app = createApp(pool, { auth: { mode: 'firebase', projectId: 'test-project', verify }, rateLimit: ipOnly });
    const from = (ip: string) => app.request('/rides', { headers: { 'cf-connecting-ip': ip } });
    expect([(await from('1.2.3.4')).status, (await from('1.2.3.4')).status, (await from('1.2.3.4')).status]).toEqual([401, 401, 429]);
    expect((await from('5.6.7.8')).status).toBe(401);
  });
});

// Audit M1: the link must be finished by the same signed-in rider who started it, or Bob could plant Ann's link on his
// profile (or Ann's Strava tokens on Bob's), and Strava must never be called for a state that isn't the caller's.
describe('a Strava account is linked only by the rider who started the link', () => {
  const stravaCalls: string[] = [];
  const fakeStrava = (async (url: string | URL) => { stravaCalls.push(String(url)); return new Response(JSON.stringify({ access_token: 'a', refresh_token: 'r', expires_at: 2_000_000_000, athlete: { id: 42, firstname: 'Ann' } }), { status: 200, headers: { 'content-type': 'application/json' } }); }) as typeof fetch;
  const strava = (now: number) => ({ clientId: '1', clientSecret: 's', encKeyHex: 'ab'.repeat(32), apiBase: 'https://strava.test', webBase: 'https://web.test', publicApiBase: 'https://web.test/api', fetch: fakeStrava, now: () => now });
  const mkS = (now = 1_000_000) => createApp(pool, { auth: { mode: 'firebase', projectId: 'test-project', verify }, strava: strava(now) });
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

// Audit L6: a real route is the rider's own. Riding "on" someone else's route id must not compute ghosts or segment
// times against their private route.
describe("real-route lookups respect the owner", () => {
  const world = (id: string) => { /* same 3 km test climb as app.test.ts */
    const pts: [number, number, number][] = Array.from({ length: 151 }, (_, i) => [0, 100 + Math.max(0, Math.min(150, (i * 20 - 1000) * 0.08)), -i * 20]);
    return { version: 1, seed: 1, size: [9000, 12000], name: 'Col Test', islands: [], lakes: [], heightStamps: [], regions: [], nodes: [], landmarks: [], towns: [], geo: { lat0: 45, lon0: 6 },
      edges: [{ id: 'e', name: 'Col Test', from: 'a', to: 'b', points: pts, surface: 'asphalt', width: 6 }], routes: [{ id, name: 'Col Test', description: '', edges: [{ id: 'e', reverse: false }], loop: false, region: 'real', tags: [] }], segments: [{ id: `${id}-climb-1`, name: 'Climb 1', kind: 'climb', edge: 'e', from: 1000, to: 2875 }] };
  };
  const climb = Array.from({ length: 400 }, (_, i) => ({ t: i, power: 250, cadence: 85, hr: 150, speed: 9, distance: i * 9, alt: 100, grade: 5, target: null, step: null }));
  const efforts = async (name: string) => (await pool.query('select count(*)::int n from segment_effort se join ride r on r.id=se.ride_id join profile p on p.id=r.profile_id where p.name=$1', [name])).rows[0].n;
  const rideOn = async (who: ReturnType<typeof as>, routeId: string) => {
    const { id } = await (await who('POST', '/rides', { mode: 'route', name: 'Climb', startedAt: new Date().toISOString(), routeId })).json();
    await who('POST', `/rides/${id}/samples`, climb); await who('PATCH', `/rides/${id}`, { status: 'done' });
  };
  it("computes no segment times or ghost for Bob on Ann's route, while Ann gets them on her own", async () => {
    const app = mk(); const ann = as(app, 'ann'), bob = as(app, 'bob'); await ann('PUT', '/profile', rider('Ann')); await bob('PUT', '/profile', rider('Bob'));
    const { id } = await (await ann('POST', '/real-routes', { name: 'Col Test', fileName: 'col.gpx' })).json(); expect((await ann('PUT', `/real-routes/${id}`, world(id))).status).toBe(200);
    await rideOn(bob, id); expect(await efforts('Bob')).toBe(0); expect(await (await bob('GET', `/routes/${id}/ghost`)).json()).toBeNull();
    await rideOn(ann, id); expect(await efforts('Ann')).toBeGreaterThan(0); expect(await (await ann('GET', `/routes/${id}/ghost`)).json()).toHaveLength(1); /* the positive path, so the check above can fail */
  });
});

// Audit L1 (now on Firebase): anonymous sessions are not rider accounts, and an unconfirmed e-mail must not pass the
// invite list or take over a profile by e-mail. Tested on the real verifier with a locally generated signing key (the
// key set is served through a stubbed fetch, as jose fetches it).
describe('the Firebase verifier refuses anonymous and unconfirmed sign-ins', () => {
  it('accepts a verified rider but not an anonymous session or an unverified e-mail', async () => {
    const { SignJWT, exportJWK, generateKeyPair } = await import('jose'); const { firebaseVerifier } = await import('./auth.js');
    const { publicKey, privateKey } = await generateKeyPair('RS256'); const jwk = { ...(await exportJWK(publicKey)), kid: 'k1', alg: 'RS256' };
    const real = globalThis.fetch; globalThis.fetch = (async () => new Response(JSON.stringify({ keys: [jwk] }), { headers: { 'content-type': 'application/json' } })) as typeof fetch;
    try {
      const token = (claims: Record<string, unknown>) => new SignJWT(claims).setProtectedHeader({ alg: 'RS256', kid: 'k1' }).setIssuer('https://securetoken.google.com/test-project').setAudience('test-project').setSubject('fbAnn').setExpirationTime('5m').sign(privateKey);
      const verify = firebaseVerifier('test-project');
      expect(await verify(await token({ email: 'Ann@Example.com', email_verified: true, firebase: { sign_in_provider: 'google.com' } }))).toEqual({ userId: 'fbAnn', email: 'ann@example.com' });
      await expect(verify(await token({ email_verified: true, firebase: { sign_in_provider: 'anonymous' } }))).rejects.toThrow(/anonymous/);
      await expect(verify(await token({ email: 'ann@example.com', email_verified: false, firebase: { sign_in_provider: 'password' } }))).rejects.toThrow(/verified/);
    } finally { globalThis.fetch = real; }
  });
});

// Moving sign-in from Supabase to Firebase gives every rider a new user id. Their verified e-mail must bring back their
// own rides and settings — but only from a Supabase-era profile, so an e-mail can never pull away a profile that a
// Firebase account already holds.
describe('riders moved from Supabase get their profile back by e-mail', () => {
  it('re-links an old Supabase profile once, and never takes one already on Firebase', async () => {
    await as(mk(), 'ann')('PUT', '/profile', rider('Ann')); /* created under Ann's Supabase uuid */
    const fb = { fbAnn: { userId: 'fbAnnUid0000000000000000000a', email: 'ann@example.com' }, fbAnn2: { userId: 'fbAnnUid0000000000000000000b', email: 'ann@example.com' } };
    const app2 = createApp(pool, { auth: { mode: 'firebase', projectId: 'test-project', verify: async (t: string) => { const u = fb[t as keyof typeof fb]; if (!u) throw new Error('bad'); return u; } } });
    expect((await (await as(app2, 'fbAnn')('GET', '/profile')).json()).name).toBe('Ann');
    expect((await pool.query('select auth_user_id from profile')).rows).toEqual([{ auth_user_id: fb.fbAnn.userId }]);
    expect((await as(app2, 'fbAnn2')('GET', '/profile')).status).toBe(404);
  });
});

// Audit L5: Supabase publishes every table in "public" through its Data API (publishable key). Row-level security with
// no policies closes a table to it; a table added later without it would be readable and writable by anyone.
describe('database tables are closed to the public Data API', () => {
  it('every table is closed to Supabase\'s public Data API (row-level security on)', async () => {
    const open = (await pool.query("select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and not c.relrowsecurity")).rows.map((r) => r.relname);
    expect(open).toEqual([]);
  });
});
