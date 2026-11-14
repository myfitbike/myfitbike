// Thin client for the local API (all data access goes through it; plan 14.4).
import type { Profile, ProfileInput } from '@veloworld/shared';

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
  rememberDevice: (d: { bleName: string; kind: string; bleId?: string }) => req<void>('/devices', { method: 'POST', body: JSON.stringify(d) }),
};
