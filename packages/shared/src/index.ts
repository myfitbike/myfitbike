// Types and pure helpers shared by web and api.
/** Rider look (PLAN 16.11). Colours are #rrggbb. */
export type Avatar = { body: 'male' | 'female'; skin: string; hair: string; jersey: string; accent: string; shorts: string; socks: string; shoes: string; helmet: string; lens: string; frame: string };
export const DEFAULT_AVATAR: Avatar = { body: 'male', skin: '#c68e6a', hair: '#3b2a20', jersey: '#2a8fa3', accent: '#f2c14e', shorts: '#14161a', socks: '#f2f2ee', shoes: '#f4f4f2', helmet: '#f6f6f4', lens: '#0d1117', frame: '#232a36' };
export const SKIN_TONES = ['#f1d3bc', '#e0b593', '#c68e6a', '#a26a45', '#7a4b2e', '#4f3020'] as const;

export type Profile = {
  id: number;
  name: string;
  weightKg: number;
  bikeWeightKg: number;
  ftpW: number | null; // null until known; first run schedules a ramp test
  maxHr: number | null;
  restingHr: number | null;
  units: 'metric';
  setupComplete: boolean;
  avatar: Avatar;
  country: string | null; // ISO 3166-1 alpha-2
};
export type ProfileInput = Omit<Profile, 'id'>;

/** Plan 14.6: 2.5 W/kg placeholder until an FTP test sets the real value. */
export const effectiveFtp = (p: Pick<Profile, 'ftpW' | 'weightKg'>) => p.ftpW ?? Math.round(p.weightKg * 2.5);

/** Coggan 7-zone power bounds as fractions of FTP (upper bound of each zone; Z7 open-ended). */
export const POWER_ZONE_UPPER = [0.55, 0.75, 0.9, 1.05, 1.2, 1.5, Infinity] as const;
export const POWER_ZONE_NAMES = ['Recovery', 'Endurance', 'Tempo', 'Threshold', 'VO2 max', 'Anaerobic', 'Sprint'] as const;
export function powerZones(ftp: number) {
  return POWER_ZONE_UPPER.map((u, i) => {
    const lo = i === 0 ? 0 : Math.round(POWER_ZONE_UPPER[i - 1]! * ftp) + 1;
    return { zone: i + 1, name: POWER_ZONE_NAMES[i]!, lo, hi: Number.isFinite(u) ? Math.round(u * ftp) : null };
  });
}
export function zoneOf(watts: number, ftp: number): number {
  const r = watts / ftp; const i = POWER_ZONE_UPPER.findIndex((u) => r <= u); return i + 1;
}

export type SettingKey = 'trainer.difficultyUpPct' | 'trainer.difficultyDownPct' | 'ride.autoPauseDelayS' | 'hud.preset' | 'hud.profileStrip' | 'hud.size' | 'display.powerAveraging' | 'graphics.quality' | 'graphics.camera' | 'goal.weeklyHours' | 'hud.widgets' | 'audio.interface' | 'audio.world' | 'plan.active';
export const DEFAULT_SETTINGS: Record<SettingKey, unknown> = {
  'trainer.difficultyUpPct': 100,
  'trainer.difficultyDownPct': 50,
  'ride.autoPauseDelayS': 3,
  'hud.preset': 'broadcast',
  'hud.profileStrip': true,
  'hud.size': 'large',
  'display.powerAveraging': '3s',
  'graphics.quality': 'high',
  'graphics.camera': 1,
  'goal.weeklyHours': 5,
  'hud.widgets': null,
  'audio.interface': 70,
  'audio.world': 60,
  'plan.active': null,
};

/** Countries offered in the profile (flags the world can paint). ISO alpha-2 → name. */
export const COUNTRIES: Record<string, string> = { IN: 'India', AU: 'Australia', AT: 'Austria', BE: 'Belgium', CA: 'Canada', CO: 'Colombia', DK: 'Denmark', FR: 'France', DE: 'Germany', IE: 'Ireland', IT: 'Italy', JP: 'Japan', NL: 'Netherlands', NO: 'Norway', PL: 'Poland', SI: 'Slovenia', ES: 'Spain', SE: 'Sweden', CH: 'Switzerland', GB: 'United Kingdom', US: 'United States' };
export * from './workout';
export * from './metrics';
export * from './fit';
export * from './physics';
