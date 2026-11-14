// Zone and gradient colours resolved from the design tokens at runtime (canvas cannot use Tailwind classes).
const css = (v: string) => (typeof document === 'undefined' ? '#888' : getComputedStyle(document.documentElement).getPropertyValue(v).trim() || '#888');
export const zoneColor = (zone: number) => css(`--color-zone-${Math.min(7, Math.max(1, zone))}`);
export const ZONE_TEXT = ['text-zone-1', 'text-zone-2', 'text-zone-3', 'text-zone-4', 'text-zone-5', 'text-zone-6', 'text-zone-7'];
export const ZONE_BG = ['bg-zone-1', 'bg-zone-2', 'bg-zone-3', 'bg-zone-4', 'bg-zone-5', 'bg-zone-6', 'bg-zone-7'];
export const ZONE_NAMES = ['Recovery', 'Endurance', 'Tempo', 'Threshold', 'VO2 max', 'Anaerobic', 'Sprint'];
export function gradeColor(g: number) { return css(g < -0.5 ? '--color-grade-down' : g < 3 ? '--color-grade-flat' : g < 6 ? '--color-grade-moderate' : g < 9 ? '--color-grade-steep' : g < 12 ? '--color-grade-severe' : '--color-grade-extreme'); }
export const tokenColor = css;
export const fmtTime = (s: number) => { s = Math.max(0, Math.round(s)); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60; return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`; };
