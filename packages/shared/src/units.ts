// Display units. Everything is stored, computed, uploaded and exported in metric; these helpers only convert what
// the rider sees and types. International mile / foot / pound (exact definitions).
export type Units = 'metric' | 'imperial';
export const M_PER_MI = 1609.344, M_PER_FT = 0.3048, KG_PER_LB = 0.45359237;

export const unitLabels = (u: Units) => (u === 'imperial' ? { dist: 'mi', speed: 'mph', elev: 'ft', weight: 'lb', wkg: 'W/kg' } : { dist: 'km', speed: 'km/h', elev: 'm', weight: 'kg', wkg: 'W/kg' });
/** Metres → km or miles. */
export const distOf = (m: number, u: Units) => (u === 'imperial' ? m / M_PER_MI : m / 1000);
/** m/s → km/h or mph. */
export const speedOf = (mps: number, u: Units) => (u === 'imperial' ? (mps * 3600) / M_PER_MI : mps * 3.6);
/** Metres of elevation → m or ft. */
export const elevOf = (m: number, u: Units) => (u === 'imperial' ? m / M_PER_FT : m);
/** kg → kg or lb, and back (for inputs). */
export const weightOf = (kg: number, u: Units) => (u === 'imperial' ? kg / KG_PER_LB : kg);
export const weightToKg = (v: number, u: Units) => (u === 'imperial' ? v * KG_PER_LB : v);

/** Ready-made strings: fmtDist(12345, 'metric') → "12.3 km". */
export const fmtDist = (m: number, u: Units, digits = 1) => `${distOf(m, u).toFixed(digits)} ${unitLabels(u).dist}`;
export const fmtElev = (m: number, u: Units) => `${Math.round(elevOf(m, u))} ${unitLabels(u).elev}`;
export const fmtSpeed = (mps: number, u: Units, digits = 1) => `${speedOf(mps, u).toFixed(digits)} ${unitLabels(u).speed}`;
export const fmtWeight = (kg: number, u: Units, digits = 0) => `${weightOf(kg, u).toFixed(digits)} ${unitLabels(u).weight}`;
/** Short distances ("starts in …", "… to go"): metres, or feet up to 1000 ft then miles. */
export const fmtShort = (m: number, u: Units) => (u === 'imperial' ? (m < 1000 * M_PER_FT ? `${Math.round(m / M_PER_FT)} ft` : `${(m / M_PER_MI).toFixed(2)} mi`) : `${Math.round(m)} m`);
/** Length of one distance unit in metres (km or mile): splits and profile distance flags. */
export const unitM = (u: Units) => (u === 'imperial' ? M_PER_MI : 1000);
/** Units guessed from the browser language (en-US → imperial). The US, Liberia and Myanmar use imperial road units. */
export function unitsForLocale(lang: string | undefined): Units {
  const region = /[-_]([A-Za-z]{2})\b/.exec(lang ?? '')?.[1]?.toUpperCase(); return region && ['US', 'LR', 'MM'].includes(region) ? 'imperial' : 'metric';
}
