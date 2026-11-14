// Per-sample telemetry lives outside React (plan D9): a mutable snapshot plus cheap subscriptions.
// HUD numbers read it through refs on their own 4 Hz / 1 Hz ticks; React never re-renders per sample.
export type Telemetry = { powerW: number | null; cadenceRpm: number | null; speedKph: number | null; hr: number | null; gradePct: number | null; updatedAt: Record<'power' | 'cadence' | 'speed' | 'hr', number> };
export const telemetry: Telemetry = { powerW: null, cadenceRpm: null, speedKph: null, hr: null, gradePct: null, updatedAt: { power: 0, cadence: 0, speed: 0, hr: 0 } };
type Listener = (t: Telemetry) => void; const listeners = new Set<Listener>();
export function publish(patch: Partial<Omit<Telemetry, 'updatedAt'>>, now = performance.now()) {
  Object.assign(telemetry, patch);
  if ('powerW' in patch) telemetry.updatedAt.power = now; if ('cadenceRpm' in patch) telemetry.updatedAt.cadence = now;
  if ('speedKph' in patch) telemetry.updatedAt.speed = now; if ('hr' in patch) telemetry.updatedAt.hr = now;
  for (const l of listeners) l(telemetry);
}
export function subscribe(l: Listener) { listeners.add(l); return () => listeners.delete(l); }
