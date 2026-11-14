import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import pg from 'pg';
import { DEFAULT_AVATAR } from '@veloworld/shared';
import { createApp } from './app.js';
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
