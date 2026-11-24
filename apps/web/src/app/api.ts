// Thin client for the local API (all data access goes through it; plan 14.4).
import type { Profile, ProfileInput, RideSummary, Sample, Workout } from '@myfitbike/shared';
export type Progress = { level: number; xp: number; intoLevel: number; forNext: number; weekly: { goalHours: number; hours: number; tss: number; km: number; rides: number }; streakWeeks: number; badges: { id: string; name: string; earned: boolean }[]; challenges: { id: string; name: string; unit: string; value: number; target: number }[] };
export type RideRow = { id: number; startedAt: string; endedAt: string | null; mode: string; name: string; status: string; simulator: boolean; summary: RideSummary | null; workoutId: string | null };

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`/api${path}`, { ...init, headers: { 'content-type': 'application/json', ...init?.headers } });
  if (r.status === 404) return null as T;
  if (!r.ok) throw new Error(`${init?.method ?? 'GET'} ${path} → ${r.status}`);
  return r.status === 204 ? (undefined as T) : r.json();
}
export const api = {
  getProfile: () => req<Profile | null>('/profile'),
  saveProfile: (p: ProfileInput) => req<Profile>('/profile', { method: 'PUT', body: JSON.stringify(p) }),
  getSettings: () => req<Record<string, unknown>>('/settings'),
  saveSetting: (key: string, value: unknown) => req<void>(`/settings/${encodeURIComponent(key)}`, { method: 'PUT', body: JSON.stringify({ value }) }),
  listDevices: () => req<{ id: number; bleName: string; kind: string; lastSeen: string }[]>('/devices'),
  createRide: (b: { mode: string; name: string; startedAt: string; workoutId?: string; routeId?: string; simulator?: boolean }) => req<{ id: number }>('/rides', { method: 'POST', body: JSON.stringify(b) }),
  postSamples: (id: number, s: Sample[]) => req<void>(`/rides/${id}/samples`, { method: 'POST', body: JSON.stringify(s) }),
  finishRide: (id: number, b: { status: 'done' | 'discarded'; endedAt?: string; ftp?: number; name?: string; stars?: number }) => req<RideSummary | null>(`/rides/${id}`, { method: 'PATCH', body: JSON.stringify(b) }),
  listRides: () => req<RideRow[]>('/rides'),
  getRide: (id: number) => req<RideRow & { samples: Sample[] }>(`/rides/${id}`),
  deleteRide: (id: number) => req<void>(`/rides/${id}`, { method: 'DELETE' }),
  /** Saves the ride's FIT file. Fetched, not a plain link: a link can't carry the sign-in token, so it got 401. */
  downloadFit: async (id: number) => {
    const r = await fetch(`/api/rides/${id}/fit`); if (!r.ok) throw new Error(`FIT export failed (${r.status})`);
    const name = /filename="([^"]+)"/.exec(r.headers.get('content-disposition') ?? '')?.[1] ?? `ride_${id}.fit`;
    const a = document.createElement('a'); a.href = URL.createObjectURL(await r.blob()); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
  },
  listWorkouts: () => req<(Workout & { durationS: number; tss: number })[]>('/workouts'),
  saveWorkout: (w: Workout & { durationS: number; tss: number }) => req<void>('/workouts', { method: 'POST', body: JSON.stringify(w) }),
  deleteWorkout: (id: string) => req<void>(`/workouts/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  progress: () => req<Progress>('/progress'),
  analytics: () => req<{ weeks: { week: string; tss: number; hours: number }[]; records: { durationS: number; watts: number }[]; ftpHistory: { date: string; ftp: number }[]; days: { date: string; tss: number; id: number }[] }>('/analytics'),
  rememberDevice: (d: { bleName: string; kind: string; bleId?: string }) => req<void>('/devices', { method: 'POST', body: JSON.stringify(d) }),
};
