// Progression (plan 10.5 I): XP per minute ridden and per workout star, levels, badges, weekly goal, streaks,
// monthly challenges (Training Room) and analytics (weekly load, records, FTP history). All computed from rides.
import { Hono } from 'hono';
import type pg from 'pg';
import type { RideSummary } from '@myfitbike/shared';

export const xpForRide = (s: Pick<RideSummary, 'movingS'> & { stars?: number }) => Math.round(s.movingS / 60) + 10 * (s.stars ?? 0);
/** Level n needs 100·n^1.5 XP in total (gentle curve: level 2 at 283 XP, level 10 at ~3,160). */
export function levelOf(xp: number) { let n = 1; while (100 * (n + 1) ** 1.5 <= xp) n++; const cur = n === 1 ? 0 : Math.round(100 * n ** 1.5), next = Math.round(100 * (n + 1) ** 1.5); return { level: n, xp, intoLevel: xp - cur, forNext: next - cur }; }
const startOfWeek = (d: Date) => { const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); const dow = (x.getUTCDay() + 6) % 7; x.setUTCDate(x.getUTCDate() - dow); return x; };
type Row = { id: number; started_at: Date; route_id: string | null; mode: string; workout_id: string | null; summary: RideSummary & { stars?: number } };

export const BADGES = [
  { id: 'first-ride', name: 'First pedal strokes', test: (r: Row[]) => r.length >= 1 },
  { id: 'ten-rides', name: '10 rides', test: (r: Row[]) => r.length >= 10 },
  { id: 'century', name: '100 km total', test: (r: Row[]) => r.reduce((a, x) => a + x.summary.distanceM, 0) >= 100000 },
  { id: 'everest-lite', name: '1,000 m climbed', test: (r: Row[]) => r.reduce((a, x) => a + x.summary.elevationGainM, 0) >= 1000 },
  { id: 'solace', name: 'Solace summiteer', test: (r: Row[]) => r.some((x) => x.route_id === 'solace-summit' && x.summary.distanceM >= 12000) },
  { id: 'grand-tour', name: 'Grand Tour finisher', test: (r: Row[]) => r.some((x) => x.route_id === 'grand-tour' && x.summary.distanceM >= 110000) },
  { id: 'tester', name: 'Knows their FTP', test: (r: Row[]) => r.some((x) => x.mode === 'ftpRamp' || x.mode === 'ftp20') },
  { id: 'stars-25', name: '25 stars', test: (r: Row[]) => r.reduce((a, x) => a + (x.summary.stars ?? 0), 0) >= 25 },
];

export function progressRoutes(pool: pg.Pool, profileId: () => Promise<number | null>) {
  const r = new Hono();
  const rides = async (): Promise<Row[]> => { const pid = await profileId(); if (pid === null) return []; return (await pool.query("select id, started_at, route_id, mode, workout_id, summary from ride where profile_id=$1 and status='done' and summary is not null order by started_at", [pid])).rows.map((x) => ({ ...x, id: Number(x.id) })); };
  r.get('/progress', async (c) => {
    const rs = await rides(); const xp = rs.reduce((a, x) => a + xpForRide(x.summary), 0);
    const goal = Number((await pool.query("select value from settings where key='goal.weeklyHours' limit 1")).rows[0]?.value ?? 5);
    const wk = startOfWeek(new Date()); const thisWeek = rs.filter((x) => x.started_at >= wk);
    let streak = 0; for (let w = 0; ; w++) { const a = new Date(wk); a.setUTCDate(a.getUTCDate() - 7 * w); const b = new Date(a); b.setUTCDate(b.getUTCDate() + 7); if (rs.some((x) => x.started_at >= a && x.started_at < b)) streak++; else if (w > 0) break; else continue; if (w > 520) break; }
    const month = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)); const inMonth = rs.filter((x) => x.started_at >= month);
    const sum = (xs: Row[], f: (s: RideSummary) => number) => xs.reduce((a, x) => a + f(x.summary), 0);
    const challenges = [
      { id: 'month-distance', name: 'Monthly 300 km', unit: 'km', value: Math.round(sum(inMonth, (s) => s.distanceM) / 1000), target: 300 },
      { id: 'month-ascent', name: 'Monthly 3,000 m climbed', unit: 'm', value: Math.round(sum(inMonth, (s) => s.elevationGainM)), target: 3000 },
      { id: 'month-rides', name: '12 rides this month', unit: 'rides', value: inMonth.length, target: 12 },
      { id: 'velora-climbs', name: 'Seven climbs of Velora (21 days)', unit: 'climbs', target: 7, value: new Set(rs.filter((x) => Date.now() - x.started_at.getTime() < 21 * 864e5 && x.route_id && ['downs-rollers', 'cobble-crown', 'tea-trail', 'solace-summit', 'fjord-run', 'red-mesa', 'cinder-rim'].includes(x.route_id)).map((x) => x.route_id)).size },
    ];
    return c.json({ ...levelOf(xp), weekly: { goalHours: goal, hours: +(sum(thisWeek, (s) => s.movingS) / 3600).toFixed(2), tss: sum(thisWeek, (s) => s.tss), km: +(sum(thisWeek, (s) => s.distanceM) / 1000).toFixed(1), rides: thisWeek.length }, streakWeeks: streak,
      badges: BADGES.map((b) => ({ id: b.id, name: b.name, earned: b.test(rs) })), challenges });
  });
  r.get('/analytics', async (c) => {
    const rs = await rides(); const weeks: { week: string; tss: number; hours: number }[] = [];
    const wk = startOfWeek(new Date()); for (let w = 11; w >= 0; w--) { const a = new Date(wk); a.setUTCDate(a.getUTCDate() - 7 * w); const b = new Date(a); b.setUTCDate(b.getUTCDate() + 7); const xs = rs.filter((x) => x.started_at >= a && x.started_at < b); weeks.push({ week: a.toISOString().slice(0, 10), tss: xs.reduce((s, x) => s + x.summary.tss, 0), hours: +(xs.reduce((s, x) => s + x.summary.movingS, 0) / 3600).toFixed(1) }); }
    const records = (await pool.query("select duration_s as d, max(power_w) as w from best_effort be join ride r on r.id = be.ride_id where r.status='done' group by duration_s order by duration_s")).rows.map((x) => ({ durationS: x.d, watts: x.w }));
    const ftpHistory: { date: string; ftp: number }[] = []; for (const x of rs) { const f = x.summary.ftpUsed; if (!ftpHistory.length || ftpHistory[ftpHistory.length - 1]!.ftp !== f) ftpHistory.push({ date: x.started_at.toISOString().slice(0, 10), ftp: f }); }
    const days = rs.map((x) => ({ date: x.started_at.toISOString().slice(0, 10), tss: x.summary.tss, id: x.id }));
    return c.json({ weeks, records, ftpHistory, days });
  });
  return r;
}
