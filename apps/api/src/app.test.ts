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
const rider = { name: 'Test Rider', weightKg: 80, bikeWeightKg: 8.5, ftpW: null, maxHr: null, restingHr: null, units: 'metric', setupComplete: false, avatar: DEFAULT_AVATAR };

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
