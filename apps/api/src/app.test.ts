import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import pg from 'pg';
import { DEFAULT_AVATAR } from '@myfitbike/shared';
import { createApp } from './app.js';
import { useWorldSource } from './routes.js';
import { nodeWorldSource } from './worldFile.js';
useWorldSource(nodeWorldSource());
import { migrate } from './db/migrate.js';
import { env } from './env.js';

// Runs against the real Postgres test database (house rule: Postgres only, no fakes).
const pool = new pg.Pool({ connectionString: env.testDatabaseUrl });
const app = createApp(pool);
type Res = { status: number; json(): Promise<any> };
const call = async (method: string, path: string, body?: unknown): Promise<Res> => app.request(path, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
const rider = { name: 'Test Rider', weightKg: 80, bikeWeightKg: 8.5, ftpW: null, maxHr: null, restingHr: null, units: 'metric', setupComplete: false, avatar: DEFAULT_AVATAR, country: null };

beforeAll(async () => { await pool.query('drop schema public cascade; create schema public'); await migrate(pool); });
beforeEach(async () => { await pool.query('truncate profile restart identity cascade'); });
afterAll(() => pool.end());

describe('profile — the first-run wizard depends on these rules', () => {
  it('reports "no profile" before first run, so the app sends the rider to the wizard', async () => expect((await call('GET', '/profile')).status).toBe(404));
  it('creates then updates the single profile instead of making a second one', async () => {
    await call('PUT', '/profile', rider); const r = await call('PUT', '/profile', { ...rider, ftpW: 250, setupComplete: true });
    expect(await r.json()).toMatchObject({ id: 1, ftpW: 250, setupComplete: true, weightKg: 80 });
    expect((await pool.query('select count(*)::int as n from profile')).rows[0].n).toBe(1);
  });
  it('rejects an impossible weight, because physics and W/kg would be nonsense', async () => {
    const r = await call('PUT', '/profile', { ...rider, weightKg: 8 }); expect(r.status).toBe(400); expect((await r.json()).errors).toContain('weightKg: 30–250');
  });
  it('keeps the rider look (body and kit colours) so the 3D rider matches what they chose', async () => {
    await call('PUT', '/profile', { ...rider, avatar: { ...DEFAULT_AVATAR, body: 'female', jersey: '#c0392b' } });
    expect((await (await call('GET', '/profile')).json()).avatar).toMatchObject({ body: 'female', jersey: '#c0392b' });
  });
  it('rejects a malformed colour rather than storing something the renderer cannot use', async () => {
    expect((await call('PUT', '/profile', { ...rider, avatar: { ...DEFAULT_AVATAR, shoes: 'red' } })).status).toBe(400);
  });
});

describe('country — its flag is painted on the road, so only valid codes are stored', () => {
  it('stores IN and rejects a free-text country', async () => {
    expect((await (await call('PUT', '/profile', { ...rider, country: 'IN' })).json()).country).toBe('IN');
    expect((await call('PUT', '/profile', { ...rider, country: 'India' })).status).toBe(400);
  });
});

describe('settings — defaults must apply until the rider changes them', () => {
  it('returns plan defaults (auto-pause 3 s, profile strip on, HUD large) for a new profile', async () => {
    await call('PUT', '/profile', rider);
    expect(await (await call('GET', '/settings')).json()).toMatchObject({ 'ride.autoPauseDelayS': 3, 'hud.profileStrip': true, 'hud.size': 'large' });
  });
  it('stores an override and refuses unknown keys so typos do not silently do nothing', async () => {
    await call('PUT', '/profile', rider);
    expect((await call('PUT', '/settings/hud.size', { value: 'small' })).status).toBe(204);
    expect((await (await call('GET', '/settings')).json())['hud.size']).toBe('small');
    expect((await call('PUT', '/settings/hud.colour', { value: 1 })).status).toBe(400);
  });
});

describe('devices — remembered so the Sensors screen can offer one-click reconnect', () => {
  it('upserts by name and kind, refreshing last_seen instead of duplicating', async () => {
    await call('PUT', '/profile', rider);
    await call('POST', '/devices', { bleName: 'Tacx Flux 2', kind: 'trainer' }); await call('POST', '/devices', { bleName: 'Tacx Flux 2', kind: 'trainer' });
    expect(await (await call('GET', '/devices')).json()).toHaveLength(1);
  });
});

describe('rides — a 2-hour ride must survive crashes and replays without losing or duplicating data', () => {
  const sample = (t: number) => ({ t, power: 200, cadence: 90, hr: 140, speed: 9, distance: t * 9, alt: null, grade: 0, target: 200, step: 0 });
  it('creates a ride, accepts batches idempotently, and summarises on finish', async () => {
    await call('PUT', '/profile', rider);
    const { id } = await (await call('POST', '/rides', { mode: 'workout', name: 'Test', startedAt: '2026-11-14T07:00:00Z', simulator: true })).json();
    await call('POST', `/rides/${id}/samples`, Array.from({ length: 300 }, (_, i) => sample(i + 1)));
    await call('POST', `/rides/${id}/samples`, Array.from({ length: 100 }, (_, i) => sample(i + 201))); // WAL replay overlaps
    const summary = await (await call('PATCH', `/rides/${id}`, { status: 'done', ftp: 250 })).json();
    expect(summary).toMatchObject({ durationS: 300, avgPower: 200, np: 200 });
    expect((await (await call('GET', `/rides/${id}`)).json()).samples).toHaveLength(300);
  });
  it('lists unfinished rides so the app can offer resume after a crash', async () => {
    await call('PUT', '/profile', rider);
    const { id } = await (await call('POST', '/rides', { mode: 'workout', name: 'Crashed', startedAt: '2026-11-14T07:00:00Z' })).json();
    await call('POST', `/rides/${id}/samples`, [sample(1), sample(2), sample(3)]);
    expect(await (await call('GET', '/rides/recording')).json()).toMatchObject([{ id, lastT: 3 }]);
  });
  it('serves a FIT file for Garmin Connect / Strava', async () => {
    await call('PUT', '/profile', rider);
    const { id } = await (await call('POST', '/rides', { mode: 'workout', name: 'Sweet Spot 3x12', startedAt: '2026-11-14T07:00:00Z' })).json();
    await call('POST', `/rides/${id}/samples`, Array.from({ length: 60 }, (_, i) => sample(i + 1))); await call('PATCH', `/rides/${id}`, { status: 'done', ftp: 250 });
    const r = await app.request(`/rides/${id}/fit`); const buf = new Uint8Array(await r.arrayBuffer());
    expect(r.headers.get('content-disposition')).toContain('Sweet_Spot_3x12'); expect(String.fromCharCode(...buf.slice(8, 12))).toBe('.FIT');
  });
});

describe('route rides — segment PBs and ghosts come from your own earlier rides', () => {
  it('records Pier Dash efforts on a Harbour Spin ride and serves the PB and the ghost', async () => {
    await call('PUT', '/profile', rider);
    const { id } = await (await call('POST', '/rides', { mode: 'route', name: 'Harbour Spin', startedAt: new Date().toISOString(), routeId: 'harbour-spin' })).json();
    const samples = Array.from({ length: 1000 }, (_, i) => ({ t: i + 1, power: 200, cadence: 90, hr: 140, speed: 9, distance: (i + 1) * 9, alt: 4, grade: 0, target: null, step: null }));
    for (let i = 0; i < samples.length; i += 300) await call('POST', `/rides/${id}/samples`, samples.slice(i, i + 300)); /* batches of 300, as the app sends them */
    await call('PATCH', `/rides/${id}`, { status: 'done', ftp: 250 });
    const best = await (await call('GET', '/segments/seg-pier-dash/best')).json(); expect(best.pbS).toBeCloseTo(400 / 9, 0); expect(best.efforts).toBe(2); // 9 km covers the start of a second lap, which passes the Pier Dash again
    const ghost = await (await call('GET', '/routes/harbour-spin/ghost')).json(); expect(ghost[0].label).toBe('Personal best'); expect(ghost[0].dAt[100]).toBe(900);
  });
});

describe('progression — XP, levels and badges come only from real rides', () => {
  it('awards XP per minute and per star, and the first-ride badge', async () => {
    await call('PUT', '/profile', rider);
    const { id } = await (await call('POST', '/rides', { mode: 'workout', name: 'W', startedAt: new Date().toISOString() })).json();
    await call('POST', `/rides/${id}/samples`, Array.from({ length: 600 }, (_, i) => ({ t: i + 1, power: 200, cadence: 90, hr: 140, speed: 9, distance: i * 9, alt: null, grade: 0, target: 200, step: 0 })));
    await call('PATCH', `/rides/${id}`, { status: 'done', ftp: 250, stars: 3 });
    const p = await (await call('GET', '/progress')).json();
    expect(p.xp).toBe(10 + 30); expect(p.level).toBe(1); expect(p.badges.find((b: { id: string }) => b.id === 'first-ride').earned).toBe(true); expect(p.weekly.rides).toBe(1); expect(p.streakWeeks).toBe(1);
  });
});

describe('real roads — an imported route is stored once and rides on it are timed like Velora rides', () => {
  const world = (id: string) => {
    const pts: [number, number, number][] = Array.from({ length: 151 }, (_, i) => [0, 100 + Math.max(0, Math.min(150, (i * 20 - 1000) * 0.08)), -i * 20]);
    return { version: 1, seed: 1, size: [9000, 12000], name: 'Col Test', islands: [], lakes: [], heightStamps: [], regions: [], nodes: [], landmarks: [], towns: [], geo: { lat0: 45, lon0: 6 },
      edges: [{ id: 'e', name: 'Col Test', from: 'a', to: 'b', points: pts, surface: 'asphalt', width: 6 }], routes: [{ id, name: 'Col Test', description: '', edges: [{ id: 'e', reverse: false }], loop: false, region: 'real', tags: [] }], segments: [{ id: `${id}-climb-1`, name: 'Climb 1', kind: 'climb', edge: 'e', from: 1000, to: 2875 }] };
  };
  it('reserves an id, stores the prepared world (length and climbing computed by the server), lists and deletes it', async () => {
    expect((await call('PUT', '/profile', rider)).status).toBe(200);
    const { id } = await (await call('POST', '/real-routes', { name: 'Col Test', fileName: 'col.gpx' })).json(); expect(id).toMatch(/^real-\d+$/);
    expect((await call('PUT', `/real-routes/${id}`, world('real-999'))).status).toBe(400); // a world built for another id is refused
    const saved = await (await call('PUT', `/real-routes/${id}`, world(id))).json(); expect(saved.lengthM).toBeGreaterThan(2990); expect(saved.ascentM).toBeGreaterThan(140);
    const list = await (await call('GET', '/real-routes')).json(); expect(list).toEqual([expect.objectContaining({ id, name: 'Col Test', fileName: 'col.gpx' })]);
    expect((await (await call('GET', `/real-routes/${id}`)).json()).geo).toEqual({ lat0: 45, lon0: 6 });
    expect((await call('GET', `/routes/${id}/ghost`)).status).toBe(200); // ghost lookup resolves real routes
    expect((await call('DELETE', `/real-routes/${id}`)).status).toBe(204); expect(await (await call('GET', '/real-routes')).json()).toEqual([]);
  });
  // Built-ins ship with the app, so a stray click must not throw one away; a failed preparation must still clean up,
  // and the rider's own imports stay deletable.
  it('keeps prepared built-in routes from being deleted, but lets a half-prepared one be cleaned up', async () => {
    expect((await call('PUT', '/profile', rider)).status).toBe(200);
    const half = (await (await call('POST', '/real-routes', { name: 'Col Test', fileName: 'col.gpx', builtin: 'col-test' })).json()).id;
    expect((await call('DELETE', `/real-routes/${half}`)).status).toBe(204); /* preparation failed: nothing left behind */
    const { id } = await (await call('POST', '/real-routes', { name: 'Col Test', fileName: 'col.gpx', builtin: 'col-test' })).json();
    expect((await call('PUT', `/real-routes/${id}`, world(id))).status).toBe(200);
    expect(await (await call('GET', '/real-routes')).json()).toEqual([expect.objectContaining({ id, builtin: 'col-test' })]);
    expect((await call('DELETE', `/real-routes/${id}`)).status).toBe(403);
    expect((await call('POST', '/real-routes', { name: 'Col Test', fileName: 'col.gpx', builtin: 'col-test' })).status).toBe(409); /* one copy per rider */
    expect(await (await call('GET', '/real-routes')).json()).toHaveLength(1);
  });

  // Security audit 2, V1/V2: the road's length decides how many samples the server builds and how often the segment
  // loop runs, so a few bytes of world must not cost hundreds of MB, and a 0 m road must not loop forever.
  describe('a real-route world is checked before the server builds anything from it', () => {
    let id = ''; const put = (w: unknown) => call('PUT', `/real-routes/${id}`, w);
    const withPoints = (points: unknown[]) => { const w = world(id); w.edges[0]!.points = points as [number, number, number][]; w.segments = []; return w; };
    beforeEach(async () => { await call('PUT', '/profile', rider); id = (await (await call('POST', '/real-routes', { name: 'Col Test', fileName: 'col.gpx' })).json()).id; });
    it('refuses a road of two identical points (a 0 m route made the segment loop run forever)', async () => {
      expect((await put(withPoints([[0, 0, 0], [0, 0, 0]]))).status).toBe(400);
      expect((await pool.query('select count(*)::int as n from real_route where length_m > 0')).rows[0].n).toBe(0);
    });
    it('refuses two points 25,000 km apart quickly, without building millions of samples first', async () => {
      const t0 = performance.now(); expect((await put(withPoints([[0, 0, 0], [0, 0, 25_000_000]]))).status).toBe(400); expect(performance.now() - t0).toBeLessThan(1000);
    });
    it('refuses points that are not three finite numbers', async () => {
      for (const p of [['a', 0, 20], [null, 0, 20], [0, 20], [0, 0, 20, 1]]) expect((await put(withPoints([[0, 0, 0], p, ...world(id).edges[0]!.points.slice(2)]))).status).toBe(400);
    });
    it('refuses more control points than a 300 km import can have', async () => {
      const { MAX_ROUTE_POINTS } = await import('./limits.js');
      expect((await put(withPoints(Array.from({ length: MAX_ROUTE_POINTS + 1 }, (_, i) => [0, 100, -i * 20])))).status).toBe(400);
    });
    it('refuses anything but one road ridden forwards once (each repeat copied the whole road again)', async () => {
      const w = () => world(id); const e = w().edges[0]!;
      expect((await put({ ...w(), edges: [e, { ...e, id: 'e2' }] })).status).toBe(400);
      expect((await put({ ...w(), routes: [w().routes[0], { ...w().routes[0], id: 'x' }] })).status).toBe(400);
      expect((await put({ ...w(), routes: [{ ...w().routes[0], edges: [{ id: 'e', reverse: false }, { id: 'e', reverse: false }] }] })).status).toBe(400);
      expect((await put({ ...w(), routes: [{ ...w().routes[0], edges: [{ id: 'e', reverse: true }] }] })).status).toBe(400);
    });
    it('refuses too many segments, a segment past the end of the road and one on an unknown road', async () => {
      const w = world(id), sg = w.segments[0]!;
      expect((await put({ ...w, segments: Array.from({ length: 201 }, (_, i) => ({ ...sg, id: `s${i}` })) })).status).toBe(400);
      expect((await put({ ...w, segments: [{ ...sg, to: 5000 }] })).status).toBe(400);
      expect((await put({ ...w, segments: [{ ...sg, edge: 'nope' }] })).status).toBe(400);
    });
    it('stores only known fields, so extra keys cannot fill the database', async () => {
      expect((await put({ ...world(id), junk: 'x'.repeat(1000) })).status).toBe(200);
      expect(await (await call('GET', `/real-routes/${id}`)).json()).not.toHaveProperty('junk');
    });
    it('refuses a body over 3 MB (a 300 km import is about 2.1 MB)', async () => {
      const raw = (body: string) => app.request(`/real-routes/${id}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body });
      expect((await raw(JSON.stringify({ name: 'x'.repeat(3.5 * 1024 * 1024) }))).status).toBe(413);
    });
  });

  describe('segment times are computed with bounded work', () => {
    const seg = { id: 's', name: 'S', kind: 'climb' as const, startM: 0, endM: 1 };
    const samples = (n: number, stepM: number) => Array.from({ length: n }, (_, i) => ({ t: i, power: 200, cadence: 90, hr: 140, speed: 9, distance: i * stepM, alt: 0, grade: 0, target: null, step: null }));
    it('returns no efforts on a 0 m route instead of looping forever', async () => {
      const { segmentEfforts } = await import('./routes.js');
      expect(segmentEfforts({ lengthM: 0, segments: [seg] } as never, samples(3, 10))).toEqual([]);
    });
    it('counts at most MAX_LAPS laps however far the ride claims to have gone', async () => {
      const { segmentEfforts } = await import('./routes.js'); const { MAX_LAPS } = await import('./limits.js');
      const out = segmentEfforts({ lengthM: 1000, segments: [seg] } as never, samples(2001, 1000)); expect(out.length).toBeGreaterThan(0); expect(out.length).toBeLessThanOrEqual(MAX_LAPS);
    });
    it('ignores a bad world stored before the check: the ride still saves, with no segment times', async () => {
      await call('PUT', '/profile', rider);
      const rid = (await pool.query("insert into real_route(profile_id, name, file_name, length_m, ascent_m, world) values (1, 'Old', 'old.gpx', 0, 0, '{}') returning id")).rows[0].id; const route = `real-${rid}`;
      const bad = { ...world(route), edges: [{ ...world(route).edges[0], points: [[0, 0, 0], [0, 0, 0]] }] };
      await pool.query('update real_route set world=$1 where id=$2', [JSON.stringify(bad), rid]);
      const { id } = await (await call('POST', '/rides', { mode: 'route', name: 'R', startedAt: new Date().toISOString(), routeId: route })).json();
      await call('POST', `/rides/${id}/samples`, samples(3, 10).map((s) => ({ ...s, t: s.t + 1 })));
      expect((await call('PATCH', `/rides/${id}`, { status: 'done' })).status).toBe(200);
      expect((await pool.query('select count(*)::int as n from segment_effort')).rows[0].n).toBe(0);
    });
  });
});

describe('units — imperial is a display choice; the stored weight stays in kg', () => {
  it('saves imperial, keeps kg, and refuses an unknown system', async () => {
    const r = await (await call('PUT', '/profile', { ...rider, units: 'imperial' })).json(); expect(r.units).toBe('imperial'); expect(r.weightKg).toBe(rider.weightKg);
    expect((await call('PUT', '/profile', { ...rider, units: 'furlongs' })).status).toBe(400);
    expect((await (await call('GET', '/profile')).json()).units).toBe('imperial');
  });
});

describe('ride first, profile later — the profile created on first launch must be accepted as is', () => {
  it('stores the default profile unconfirmed, with units guessed from the browser', async () => {
    const { defaultProfileInput } = await import('@myfitbike/shared');
    const r = await call('PUT', '/profile', defaultProfileInput('en-US')); expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ name: 'Rider', weightKg: 75, ftpW: null, setupComplete: false, units: 'imperial' });
  });
});

// Audit M2 / L2 / I1: everything below comes from the browser, which anyone can replace with a script.
describe('ride input is checked on the server (the browser is not trusted)', () => {
  const s = (t: number, extra: Record<string, unknown> = {}) => ({ t, power: 200, cadence: 90, hr: 140, speed: 9, distance: t * 9, alt: 4, grade: 0, target: null, step: null, ...extra });
  const newRide = async (extra: Record<string, unknown> = {}) => (await (await call('POST', '/rides', { mode: 'free', name: 'R', startedAt: new Date().toISOString(), ...extra })).json()).id as number;
  beforeEach(async () => { await call('PUT', '/profile', rider); });
  it('keeps the ghost small even if a stored ride claims a sample 230 days in (it was a 40 MB response)', async () => {
    const id = await newRide({ mode: 'route', routeId: 'harbour-spin' });
    expect((await call('POST', `/rides/${id}/samples`, [s(0), s(20_000_000, { distance: 9_000_000 })])).status).toBe(204);
    await call('PATCH', `/rides/${id}`, { status: 'done' });
    const r = await app.request('/routes/harbour-spin/ghost'); expect(r.status).toBe(200); expect((await r.text()).length).toBeLessThan(100_000);
  });
  it('drops samples with an impossible time instead of refusing the batch (the app would retry it forever)', async () => {
    const { MAX_RIDE_T_S } = await import('./limits.js'); const id = await newRide();
    expect((await call('POST', `/rides/${id}/samples`, [s(0), s(-1), s(1.5), s(MAX_RIDE_T_S + 1)])).status).toBe(204);
    expect((await (await call('GET', `/rides/${id}`)).json()).samples).toHaveLength(1);
  });
  it('clamps impossible values to what a rider can produce, and stores non-numbers as missing', async () => {
    const id = await newRide(); expect((await call('POST', `/rides/${id}/samples`, [s(1, { power: 99999, hr: 'abc', grade: 1e9 })])).status).toBe(204);
    expect((await (await call('GET', `/rides/${id}`)).json()).samples[0]).toMatchObject({ power: 3000, hr: null, grade: 50 });
  });
  it('refuses an oversized batch (Postgres would fail past 65,535 parameters, and rows per request must be bounded)', async () => {
    const id = await newRide(); expect((await call('POST', `/rides/${id}/samples`, Array.from({ length: 601 }, (_, i) => s(i)))).status).toBe(413);
  });
  it('accepts no samples once a ride is finished (they would replace the saved ride and its stats)', async () => {
    const id = await newRide(); await call('POST', `/rides/${id}/samples`, [s(1)]); await call('PATCH', `/rides/${id}`, { status: 'done' });
    expect((await call('POST', `/rides/${id}/samples`, [s(2)])).status).toBe(409);
  });
  it('checks what finishing a ride claims: status, stars (XP comes from them) and the end date', async () => {
    const id = await newRide(); await call('POST', `/rides/${id}/samples`, [s(1), s(2)]);
    expect((await call('PATCH', `/rides/${id}`, { status: 'whatever' })).status).toBe(400);
    expect((await call('PATCH', `/rides/${id}`, { status: 'done', endedAt: 'not a date' })).status).toBe(400);
    expect((await call('PATCH', `/rides/${id}`, { status: 'done', stars: 999999 })).status).toBe(200);
    expect((await (await call('GET', `/rides/${id}`)).json()).summary.stars).toBe(50);
  });
  it('refuses a ride with an overlong name or an unreadable start time', async () => {
    expect((await call('POST', '/rides', { mode: 'free', name: 'x'.repeat(200), startedAt: new Date().toISOString() })).status).toBe(400);
    expect((await call('POST', '/rides', { mode: 'free', name: 'R', startedAt: 'yesterday-ish' })).status).toBe(400);
  });
  it('caps unfinished rides per rider, so a script cannot open rides without end', async () => {
    for (let i = 0; i < 20; i++) expect((await call('POST', '/rides', { mode: 'free', name: `R${i}`, startedAt: new Date().toISOString() })).status).toBe(201);
    expect((await call('POST', '/rides', { mode: 'free', name: 'R21', startedAt: new Date().toISOString() })).status).toBe(409);
  });
  it('answers malformed JSON with 400, not a server error', async () => {
    expect((await app.request('/rides', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{not json' })).status).toBe(400);
  });
});

// Audit M3: sign-up is open, so one account must not be able to fill the shared database or burn CPU with huge bodies.
describe('stored data is bounded', () => {
  beforeEach(async () => { await call('PUT', '/profile', rider); });
  const raw = (method: string, path: string, body: string) => app.request(path, { method, headers: { 'content-type': 'application/json' }, body });
  it('refuses a request body over 256 KB', async () => {
    expect((await raw('PUT', '/settings/hud.widgets', JSON.stringify({ value: 'x'.repeat(300 * 1024) }))).status).toBe(413);
  });
  it('lets a large prepared real-road world through the size check (only that one endpoint gets the bigger limit)', async () => {
    expect((await raw('PUT', '/real-routes/real-1', JSON.stringify({ name: 'x'.repeat(2.5 * 1024 * 1024) }))).status).not.toBe(413);
  });
  it('refuses an oversized setting value, a too-long device name, an oversized or mislabelled workout and a nameless route', async () => {
    expect((await call('PUT', '/settings/hud.widgets', { value: 'x'.repeat(40_000) })).status).toBe(400);
    expect((await call('POST', '/devices', { bleName: 'x'.repeat(101), kind: 'trainer' })).status).toBe(400);
    const w = { id: 'custom-a', source: 'custom', name: 'A', category: 'endurance', durationS: 600, steps: [{ kind: 'free', durS: 600 }] };
    expect((await call('POST', '/workouts', { ...w, steps: Array.from({ length: 501 }, () => ({ kind: 'free', durS: 1 })) })).status).toBe(400);
    expect((await call('POST', '/workouts', { ...w, source: 'evil' })).status).toBe(400);
    expect((await call('POST', '/workouts', w)).status).toBe(204); /* a normal workout still saves */
    expect((await call('POST', '/real-routes', { fileName: 'a.gpx' })).status).toBe(400);
  });
  it('accepts an imported workout whose id carries a long file name (ids are import-<time>-<file name>)', async () => {
    expect((await call('POST', '/workouts', { id: `import-1763200000000-${'Sweet-Spot-3x12-coach-plan-week-4-day-2-'.repeat(2)}zwo`, source: 'import', name: 'SS', category: 'sweetspot', durationS: 600, steps: [{ kind: 'free', durS: 600 }] })).status).toBe(204);
  });
});

// Audit M4: in local mode there is no sign-in, so any web page the rider visits could otherwise write to 127.0.0.1.
describe('the local API only answers the local app', () => {
  it('refuses a write sent as text/plain (a "simple" cross-site request needs no CORS preflight)', async () => {
    await call('PUT', '/profile', rider);
    expect((await app.request('/devices', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: JSON.stringify({ bleName: 'Evil', kind: 'trainer' }) })).status).toBe(415);
    expect(await (await call('GET', '/devices')).json()).toEqual([]);
  });
  it('refuses a request whose Host is not the local app (DNS rebinding)', async () => {
    const local = createApp(pool, { allowedHosts: ['127.0.0.1:8787'] });
    expect((await local.request('/health', { headers: { host: 'evil.example:8787' } })).status).toBe(403);
    expect((await local.request('/health', { headers: { host: '127.0.0.1:8787' } })).status).toBe(200);
  });
});

// Audit M5: API answers carry rider data; browsers must not guess their type and shared caches must not keep them.
describe('API responses are marked private and not sniffable', () => {
  it('sends nosniff and no-store, including on a FIT download', async () => {
    await call('PUT', '/profile', rider); const r = await app.request('/profile');
    expect(r.headers.get('x-content-type-options')).toBe('nosniff'); expect(r.headers.get('cache-control')).toBe('no-store');
    const { id } = await (await call('POST', '/rides', { mode: 'free', name: 'Fit', startedAt: '2026-11-14T07:00:00Z' })).json();
    await call('POST', `/rides/${id}/samples`, Array.from({ length: 60 }, (_, i) => ({ t: i, power: 200, cadence: 90, hr: 140, speed: 9, distance: i * 9, alt: null, grade: 0, target: null, step: null })));
    await call('PATCH', `/rides/${id}`, { status: 'done' }); const fit = await app.request(`/rides/${id}/fit`);
    expect(fit.status).toBe(200); expect(fit.headers.get('content-disposition')).toContain('.fit'); expect(fit.headers.get('cache-control')).toBe('no-store');
  });
});

// Security audit 2, V3: counts and request sizes alone let one free account fill the shared database.
describe('one rider cannot fill the database', () => {
  const start = () => call('POST', '/rides', { mode: 'free', name: 'R', startedAt: new Date().toISOString() });
  const s = (t: number) => ({ t, power: 200, cadence: 90, hr: 140, speed: 9, distance: t * 9, alt: 4, grade: 0, target: null, step: null });
  beforeEach(async () => { await call('PUT', '/profile', rider); });
  it('caps the total number of rides', async () => {
    await pool.query("insert into ride(profile_id, started_at, mode, name, status, created_at) select 1, now(), 'free', 'x', 'done', now() - interval '2 days' from generate_series(1, 10000)");
    expect((await start()).status).toBe(409);
  });
  it('caps rides started in one day, but not rides started earlier', async () => {
    await pool.query("insert into ride(profile_id, started_at, mode, name, status) select 1, now(), 'free', 'x', 'done' from generate_series(1, 60)");
    expect((await start()).status).toBe(429);
    await pool.query("update ride set created_at = now() - interval '2 days'"); expect((await start()).status).toBe(201);
  });
  it('caps samples held in unfinished rides; discarding one frees the space', async () => {
    const id = (await (await start()).json()).id;
    const others = (await pool.query("insert into ride(profile_id, started_at, mode, name) select 1, now(), 'free', 'x' from generate_series(1, 3) returning id")).rows.map((r) => Number(r.id));
    for (const o of others) await pool.query('insert into ride_sample(ride_id, t_s) select $1, g from generate_series(0, 132999) g', [o]); /* 399,000 */
    const batch = Array.from({ length: 600 }, (_, i) => s(i)); expect((await call('POST', `/rides/${id}/samples`, batch)).status).toBe(204); /* 399,600 */
    expect((await call('POST', `/rides/${id}/samples`, Array.from({ length: 401 }, (_, i) => s(600 + i)))).status).toBe(409);
    expect((await call('PATCH', `/rides/${others[0]}`, { status: 'discarded' })).status).toBe(204);
    expect((await call('POST', `/rides/${id}/samples`, Array.from({ length: 401 }, (_, i) => s(600 + i)))).status).toBe(204);
  });
  it('refuses to finish a ride when finished rides already fill the allowance, and keeps the ride recording', async () => {
    await pool.query(`insert into ride(profile_id, started_at, mode, name, status, summary, created_at) select 1, now(), 'free', 'x', 'done', '{"durationS": 180000}', now() - interval '2 days' from generate_series(1, 100)`);
    const id = (await (await start()).json()).id; await call('POST', `/rides/${id}/samples`, [s(1), s(2)]);
    expect((await call('PATCH', `/rides/${id}`, { status: 'done' })).status).toBe(409);
    expect((await pool.query('select status from ride where id=$1', [id])).rows[0].status).toBe('recording');
  });
  it('caps the bytes of prepared real-road worlds per rider', async () => {
    const pts = Array.from({ length: 151 }, (_, i) => [0, 100, -i * 20]);
    await pool.query("insert into real_route(profile_id, name, file_name, length_m, ascent_m, world) select 1, 'pad', 'pad.gpx', 1, 0, jsonb_build_object('pad', (select string_agg(md5(random()::text || g || k), '') from generate_series(1, 40000) k)) from generate_series(1, 30) g");
    const { MAX_REAL_ROUTE_BYTES } = await import('./limits.js'); const sum = async () => (await pool.query('select sum(pg_column_size(world))::int as b from real_route')).rows[0].b as number;
    const top = Math.floor((MAX_REAL_ROUTE_BYTES - 30_000 - (await sum())) / 32); /* one more row brings the total to ~30 KB under the cap */
    await pool.query("insert into real_route(profile_id, name, file_name, length_m, ascent_m, world) select 1, 'pad', 'pad.gpx', 1, 0, jsonb_build_object('pad', (select string_agg(md5(random()::text || k), '') from generate_series(1, $1::int) k))", [top]);
    const seeded = await sum(); expect(seeded).toBeGreaterThan(MAX_REAL_ROUTE_BYTES - 60_000); expect(seeded).toBeLessThan(MAX_REAL_ROUTE_BYTES);
    const { id } = await (await call('POST', '/real-routes', { name: 'Big', fileName: 'big.gpx' })).json();
    const w = { version: 1, seed: 1, size: [9000, 12000], name: 'Big', geo: { lat0: 45, lon0: 6 }, edges: [{ id: 'e', name: 'Big', from: 'a', to: 'b', points: pts, surface: 'asphalt', width: 6 }],
      routes: [{ id, name: 'Big', description: 'x'.repeat(300), loop: false, region: 'real', tags: [], edges: [{ id: 'e', reverse: false }] }],
      segments: Array.from({ length: 200 }, (_, i) => ({ id: `s${i}`.padEnd(100, 'x'), name: 'n'.repeat(120), kind: 'climb', edge: 'e', from: 0, to: 10 })) };
    const fill = MAX_REAL_ROUTE_BYTES - seeded;
    expect(JSON.stringify(w).length).toBeGreaterThan(fill); /* the world itself crosses the line */
    expect((await call('PUT', `/real-routes/${id}`, w)).status).toBe(409);
  });
  it('stores only known avatar keys, as colours, in an object', async () => {
    expect((await call('PUT', '/profile', { ...rider, avatar: { ...DEFAULT_AVATAR, extra: '#000000' } })).status).toBe(400);
    expect((await call('PUT', '/profile', { ...rider, avatar: 'x' })).status).toBe(400);
    expect((await call('PUT', '/profile', { ...rider, avatar: [] })).status).toBe(400);
  });
});

// Security audit 2, V3/V5: steps were stored as sent, and flatten() / estimateStress() loop over every repeat and second.
describe('a workout is rebuilt from known fields', () => {
  const w = { id: 'custom-a', source: 'custom', name: 'A', category: 'endurance', durationS: 600 };
  const save = (steps: unknown) => call('POST', '/workouts', { ...w, steps });
  const sorted = (v: unknown): string => JSON.stringify(v, (_k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => a.localeCompare(b))) : x));
  beforeEach(async () => { await call('PUT', '/profile', rider); });
  it('keeps every built-in library workout exactly as it is (if one fails, the rule is wrong, not the library)', async () => {
    const { cleanSteps } = await import('./workoutSteps.js'); const { readFileSync } = await import('node:fs');
    const lib = JSON.parse(readFileSync(new URL('../../../content/workouts/library.json', import.meta.url), 'utf8')); const list = (Array.isArray(lib) ? lib : lib.workouts) as { id: string; steps: unknown }[];
    expect(list.length).toBeGreaterThan(10);
    for (const x of list) expect(sorted(cleanSteps(x.steps)), x.id).toBe(sorted(x.steps));
  });
  it('refuses repeats, durations and targets that are out of range or not numbers', async () => {
    const steady = { kind: 'steady', durS: 60, target: { type: 'ftpPct', value: 90 } };
    for (const steps of [[{ kind: 'repeat', times: 1e12, steps: [steady] }], [{ kind: 'repeat', times: 2.5, steps: [steady] }], [{ ...steady, durS: 1e15 }], [{ ...steady, durS: 0 }],
      [{ ...steady, target: { type: 'x', value: 90 } }], [{ kind: 'repeat', times: 2, steps: [{ kind: 'repeat', times: 2, steps: [{ kind: 'repeat', times: 2, steps: [{ kind: 'repeat', times: 2, steps: [steady] }] }] }] }],
      [{ kind: 'repeat', times: 2, steps: [] }]]) expect((await save(steps)).status, JSON.stringify(steps).slice(0, 80)).toBe(400);
  });
  it('refuses a step tree that expands to more blocks than any workout has (200 × 200 = 40,000)', async () => {
    expect((await save([{ kind: 'repeat', times: 200, steps: [{ kind: 'repeat', times: 200, steps: [{ kind: 'free', durS: 1 }] }] }])).status).toBe(400);
  });
  it('stores a step without the keys the Step type does not have', async () => {
    expect((await save([{ kind: 'free', durS: 600, junk: 'y'.repeat(1000) }])).status).toBe(204);
    expect((await (await call('GET', '/workouts')).json())[0].steps).toEqual([{ kind: 'free', durS: 600 }]);
  });
});
