// Live HUD values are written straight into the DOM on fixed ticks (plan 10.3: "numbers update through refs, not React state").
import { useEffect, useRef } from 'react';
import { subscribe, telemetry } from '../devices/telemetry';

export type LiveValues = Record<string, string | { text?: string; color?: string; width?: string; left?: string }>;
export function useLive(hz: number, compute: () => LiveValues | Record<string, never>) {
  const refs = useRef<Record<string, HTMLElement | null>>({}); const fn = useRef(compute); fn.current = compute;
  useEffect(() => {
    const apply = () => { const v = fn.current(); for (const [k, val] of Object.entries(v)) { const el = refs.current[k]; if (!el) continue;
      if (typeof val === 'string') { if (el.textContent !== val) el.textContent = val; } else { if (val.text !== undefined && el.textContent !== val.text) el.textContent = val.text; if (val.color) el.style.color = val.color; if (val.width) el.style.width = val.width; if (val.left) el.style.left = val.left; } } };
    apply(); const id = setInterval(apply, 1000 / hz); return () => clearInterval(id);
  }, [hz]);
  return (key: string) => (el: HTMLElement | null) => { refs.current[key] = el; };
}
/** Displayed power averaging (plan 9: 3 s default, 1 s or instant). Raw power still drives physics and recording. */
const buf: { t: number; p: number }[] = [];
subscribe((t) => { if (t.powerW === null) return; const now = performance.now(); if (buf.length && now - buf[buf.length - 1]!.t < 50) return; buf.push({ t: now, p: t.powerW }); while (buf.length && now - buf[0]!.t > 3100) buf.shift(); });
export function displayedPower(window: '3s' | '1s' | '0s'): number | null {
  if (telemetry.powerW === null) return null; if (window === '0s') return telemetry.powerW;
  const ms = window === '3s' ? 3000 : 1000; const now = performance.now(); const xs = buf.filter((b) => now - b.t <= ms);
  return xs.length ? Math.round(xs.reduce((a, b) => a + b.p, 0) / xs.length) : telemetry.powerW;
}
