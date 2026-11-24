// intervals.icu workout sync (Phase 6). Verified against the intervals.icu OpenAPI spec and developer forum posts
// (PROGRESS VERIFY log): Basic auth "API_KEY:<key>", athlete id 0 = key owner, GET /api/v1/athlete/0/events.
// The key is stored encrypted and only used server-side, so it never reaches the browser.
import { Hono } from 'hono';
import type pg from 'pg';
import { estimateStress, flatten, type Step } from '@myfitbike/shared';
import { decrypt, encrypt } from './strava.js';
import { MAX_ICU_BYTES, MAX_ICU_EVENTS, MAX_STEP_DEPTH, MAX_WORKOUTS } from './limits.js';
import { cleanSteps } from './workoutSteps.js';

type IcuStep = { duration?: number; reps?: number; steps?: IcuStep[]; freeride?: boolean; ramp?: boolean; text?: string; cadence?: { value?: number }; power?: { value?: number; start?: number; end?: number; units?: string } };
export function icuToSteps(list: IcuStep[], depth = 0): Step[] {
  if (!Array.isArray(list) || depth > MAX_STEP_DEPTH) return []; /* the rider's calendar decides the nesting; cleanSteps checks the rest */
  return list.flatMap((s): Step[] => {
    if (!s || typeof s !== 'object') return [];
    if (s.reps && s.steps?.length) return [{ kind: 'repeat', times: s.reps, steps: icuToSteps(s.steps, depth + 1) }];
    const durS = Math.round(s.duration ?? 0); if (!durS) return [];
    const text = s.text ? [{ atS: 0, text: s.text }] : undefined; const cadence = s.cadence?.value;
    const unit = (s.power?.units ?? '%ftp').toLowerCase(); const t = (v: number) => ({ type: unit === 'w' || unit === 'watts' ? ('watts' as const) : ('ftpPct' as const), value: v });
    if (s.freeride || !s.power) return [{ kind: 'free', durS, text }];
    if (s.ramp && s.power.start !== undefined && s.power.end !== undefined) return [{ kind: 'ramp', durS, from: t(s.power.start), to: t(s.power.end), cadence, text }];
    const v = s.power.value ?? (s.power.start !== undefined && s.power.end !== undefined ? (s.power.start + s.power.end) / 2 : undefined);
    return v === undefined ? [{ kind: 'free', durS, text }] : [{ kind: 'steady', durS, target: t(v), cadence, text }];
  });
}

export function intervalsRoutes(pool: pg.Pool, profileId: () => Promise<number | null>, cfg: { encKeyHex: string; fetch: typeof fetch; base?: string }) {
  const r = new Hono(); const base = cfg.base ?? 'https://intervals.icu';
  const ok = () => /^[0-9a-f]{64}$/i.test(cfg.encKeyHex);
  const getKey = async (pid: number) => { const v = (await pool.query("select value from settings where profile_id=$1 and key='intervals.key'", [pid])).rows[0]?.value as string | undefined; return v ? decrypt(v, cfg.encKeyHex, `intervals:${pid}`) : null; };
  r.get('/status', async (c) => { const pid = await profileId(); return c.json({ configured: ok(), connected: pid !== null && ok() && !!(await getKey(pid).catch(() => null)) }); });
  r.put('/key', async (c) => {
    if (!ok()) return c.json({ error: 'Set TOKEN_ENCRYPTION_KEY in apps/api/.env first (openssl rand -hex 32)' }, 503);
    const pid = await profileId(); if (pid === null) return c.json({ error: 'create the profile first' }, 409); const { apiKey } = (await c.req.json()) as { apiKey: string };
    if (typeof apiKey !== 'string' || apiKey.length < 10 || apiKey.length > 200) return c.json({ error: 'That does not look like an intervals.icu API key' }, 400);
    await pool.query("insert into settings(profile_id, key, value) values ($1,'intervals.key',$2) on conflict (profile_id, key) do update set value=excluded.value", [pid, JSON.stringify(encrypt(apiKey.trim(), cfg.encKeyHex, `intervals:${pid}`))]);
    return c.body(null, 204);
  });
  r.delete('/key', async (c) => { const pid = await profileId(); if (pid !== null) await pool.query("delete from settings where profile_id=$1 and key='intervals.key'", [pid]); return c.body(null, 204); });
  r.post('/sync', async (c) => {
    const pid = await profileId(); if (pid === null || !ok()) return c.json({ error: 'not configured' }, 409); const key = await getKey(pid); if (!key) return c.json({ error: 'Add your intervals.icu API key first' }, 409);
    const today = new Date(); const oldest = today.toISOString().slice(0, 10); const newest = new Date(today.getTime() + 14 * 864e5).toISOString().slice(0, 10);
    const res = await cfg.fetch(`${base}/api/v1/athlete/0/events?oldest=${oldest}&newest=${newest}&category=WORKOUT`, { headers: { authorization: `Basic ${Buffer.from(`API_KEY:${key}`).toString('base64')}`, accept: 'application/json' } });
    if (res.status === 401 || res.status === 403) return c.json({ error: 'intervals.icu rejected the API key' }, 400); if (!res.ok) return c.json({ error: `intervals.icu error ${res.status}` }, 502);
    const body = await res.text(); if (body.length > MAX_ICU_BYTES) return c.json({ error: 'intervals.icu sent too much data' }, 502); /* the rider controls their calendar (security audit 2, V5) */
    let all: unknown; try { all = JSON.parse(body); } catch { return c.json({ error: 'intervals.icu sent an unreadable answer' }, 502); } if (!Array.isArray(all)) return c.json({ error: 'intervals.icu sent an unreadable answer' }, 502);
    const events = all.slice(0, MAX_ICU_EVENTS) as { id: number; name?: string; start_date_local?: string; type?: string; workout_doc?: { steps?: IcuStep[] }; description?: unknown }[];
    const imported: { id: string; name: string }[] = []; let skipped = 0;
    let stored = (await pool.query<{ n: number }>('select count(*)::int as n from workout where profile_id=$1', [pid])).rows[0]!.n;
    for (const e of events) {
      if (!e || !Number.isSafeInteger(e.id) || (e.type && e.type !== 'Ride' && e.type !== 'VirtualRide')) continue;
      const steps = cleanSteps(icuToSteps(e.workout_doc?.steps ?? [])); if (!steps) continue; /* before flatten / estimateStress, which loop over every repeat and second */
      const id = `intervals-${e.id}`; const known = (await pool.query('select 1 from workout where id=$1 and profile_id=$2', [id, pid])).rowCount;
      if (!known) { if (stored >= MAX_WORKOUTS) { skipped++; continue; } stored++; } /* the same cap as POST /workouts; updating a synced workout never counts */
      const st = estimateStress(flatten(steps)); const name = `${String(e.start_date_local ?? '').slice(0, 10)} · ${e.name ?? 'Planned workout'}`.slice(0, 120);
      await pool.query("insert into workout(id, profile_id, source, name, category, duration_s, tss_estimate, steps, description, tags) values ($1,$2,'import',$3,$4,$5,$6,$7,$8,$9) on conflict (profile_id, id) do update set name=excluded.name, steps=excluded.steps, duration_s=excluded.duration_s, tss_estimate=excluded.tss_estimate",
        [id, pid, name, st.if > 0.9 ? 'threshold' : st.if > 0.8 ? 'sweetspot' : st.if > 0.7 ? 'tempo' : 'endurance', st.durationS, st.tss, JSON.stringify(steps), typeof e.description === 'string' ? e.description.slice(0, 2000) : 'Planned on intervals.icu', ['intervals.icu']]);
      imported.push({ id, name });
    }
    return c.json({ imported, checked: events.length, skipped });
  });
  return r;
}
