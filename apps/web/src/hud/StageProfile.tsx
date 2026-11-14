// Stage profile (plan 7.5): Tour-de-France-style silhouette coloured by gradient (100 m bands with hysteresis so a
// steady climb reads as one colour), climb banners with category, km flags, sprint/climb segments, rider + ghost/pacer pins.
// The silhouette is cached as a bitmap; only markers redraw (1–4 Hz).
import { useEffect, useRef } from 'react';
import type { RouteProfile } from '@veloworld/world';
import { tokenColor } from './zones';

const BANDS: [number, number, string][] = [[-99, -0.5, '--color-grade-down'], [-0.5, 3, '--color-grade-flat'], [3, 6, '--color-grade-moderate'], [6, 9, '--color-grade-steep'], [9, 12, '--color-grade-severe'], [12, 99, '--color-grade-extreme']];
export type Pin = { d: number; label: string; kind: 'ghost' | 'pacer' };

function silhouette(r: RouteProfile, w: number, h: number, from: number, to: number, opts: { banners: boolean; dpr: number }) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d')!; const dpr = opts.dpr;
  const i0 = Math.max(0, Math.floor(from / r.step)), i1 = Math.min(r.y.length - 1, Math.ceil(to / r.step)); const ys = r.y.slice(i0, i1 + 1);
  const lo = Math.min(...ys) - 5, hi = Math.max(...ys) + Math.max(15, (Math.max(...ys) - Math.min(...ys)) * 0.35); const top = opts.banners ? 26 * dpr : 6 * dpr;
  const X = (d: number) => ((d - from) / (to - from)) * w, Y = (y: number) => h - 14 * dpr - ((y - lo) / (hi - lo)) * (h - top - 14 * dpr);
  const colors = BANDS.map((b) => tokenColor(b[2])); let band = -1; const per = Math.max(1, Math.round(10 / r.step)); const win = Math.round(100 / r.step);
  for (let i = i0; i < i1; i += per) {
    const a = Math.max(0, i - win), b = Math.min(r.y.length - 1, i + win); const avg = ((r.y[b]! - r.y[a]!) / ((b - a) * r.step)) * 100;
    if (band < 0 || avg < BANDS[band]![0] - 0.4 || avg >= BANDS[band]![1] + 0.4) band = BANDS.findIndex(([l, u]) => avg >= l && avg < u);
    const x0 = X(i * r.step), x1 = X(Math.min(i1, i + per) * r.step) + 0.6; g.fillStyle = colors[band]!; g.globalAlpha = 0.9;
    g.beginPath(); g.moveTo(x0, h - 14 * dpr); g.lineTo(x0, Y(r.y[i]!)); g.lineTo(x1, Y(r.y[Math.min(i1, i + per)]!)); g.lineTo(x1, h - 14 * dpr); g.fill();
  }
  g.globalAlpha = 1; g.strokeStyle = 'rgba(255,255,255,.75)'; g.lineWidth = 1.2 * dpr; g.beginPath(); for (let i = i0; i <= i1; i += per) { const x = X(i * r.step), y = Y(r.y[i]!); if (i === i0) g.moveTo(x, y); else g.lineTo(x, y); } g.stroke();
  g.font = `600 ${10 * dpr}px Inter, sans-serif`; g.fillStyle = 'rgba(255,255,255,.6)';
  const span = to - from; const km = span > 30000 ? 10000 : span > 8000 ? 5000 : span > 3000 ? 1000 : 500;
  for (let d = Math.ceil(from / km) * km; d < to; d += km) { const x = X(d); g.fillRect(x, h - 12 * dpr, dpr, 8 * dpr); g.fillText(km >= 1000 ? `${d / 1000} km` : `${d} m`, x + 3 * dpr, h - 3 * dpr); }
  const lab = Math.max(100, Math.ceil(((50 * dpr) / w) * span / 100) * 100); // labels at least 50 px apart
  if (span <= 3000) for (let d = Math.ceil(from / lab) * lab; d + 100 <= to; d += lab) { const a = Math.floor(d / r.step), b = Math.floor((d + 100) / r.step); const gr = ((r.y[b]! - r.y[a]!) / 100) * 100; g.fillStyle = '#fff'; g.font = `700 ${11 * dpr}px "Barlow Condensed", sans-serif`; g.fillText(`${gr.toFixed(1)}%`, X(d) + 4 * dpr, Y(Math.max(r.y[a]!, r.y[b]!)) - 6 * dpr); } // close-up: gradient per 100 m
  for (const s of r.segments) { if (s.endM < from || s.startM > to) continue; g.fillStyle = s.kind === 'sprint' ? tokenColor('--color-status-success') : tokenColor('--color-accent'); g.globalAlpha = 0.85; g.fillRect(X(s.startM), h - 14 * dpr, X(s.endM) - X(s.startM), 3 * dpr); }
  g.globalAlpha = 1;
  if (opts.banners) for (const cl of r.climbs) { if (cl.endM < from || cl.startM > to) continue; const x = X(cl.endM), y = Y(r.y[Math.floor(cl.endM / r.step)]!);
    g.strokeStyle = 'rgba(255,255,255,.8)'; g.setLineDash([2 * dpr, 2 * dpr]); g.beginPath(); g.moveTo(x, y); g.lineTo(x, 22 * dpr); g.stroke(); g.setLineDash([]);
    const label = `${cl.category === 'HC' ? 'HC' : `CAT ${cl.category}`} · ${(cl.lengthM / 1000).toFixed(1)} km · ${cl.avgGradePct}%`; g.font = `700 ${10 * dpr}px Inter, sans-serif`; const tw = g.measureText(label).width + 10 * dpr;
    g.fillStyle = tokenColor('--color-grade-severe'); g.fillRect(Math.min(w - tw, x - tw / 2), 4 * dpr, tw, 16 * dpr); g.fillStyle = '#fff'; g.fillText(label, Math.min(w - tw, x - tw / 2) + 5 * dpr, 15 * dpr); }
  return { c, X, Y };
}

export function StageProfile({ route, className, read, zoom = 'stage', banners = true }: { route: RouteProfile; className?: string; read?: () => { d: number; pins?: Pin[] } | null; zoom?: 'stage' | 'next2km'; banners?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current; if (!c) return; let cache: { key: string; c: HTMLCanvasElement; X: (d: number) => number; Y: (y: number) => number } | null = null;
    const draw = () => {
      const dpr = devicePixelRatio; const w = c.clientWidth * dpr, h = c.clientHeight * dpr; if (!w || !h) return; if (c.width !== w || c.height !== h) { c.width = w; c.height = h; cache = null; }
      const st = read?.() ?? null; const d = st ? ((st.d % route.lengthM) + route.lengthM) % route.lengthM : 0;
      const [from, to] = zoom === 'next2km' ? [Math.max(0, Math.min(route.lengthM - 2000, d - 200)), Math.min(route.lengthM, Math.max(2000, d + 1800))] : [0, route.lengthM];
      const key = `${w}x${h}:${Math.round(from / 100)}:${zoom}`; if (!cache || cache.key !== key) cache = { key, ...silhouette(route, w, h, from, to, { banners: banners && zoom === 'stage', dpr }) };
      const g = c.getContext('2d')!; g.clearRect(0, 0, w, h); g.drawImage(cache.c, 0, 0); if (!st) return;
      const x = cache.X(d); g.fillStyle = 'rgba(0,0,0,.32)'; g.fillRect(0, 0, x, h - 14 * dpr); // ridden part
      for (const p of st.pins ?? []) { const pd = ((p.d % route.lengthM) + route.lengthM) % route.lengthM; if (pd < from || pd > to) continue; const px = cache.X(pd), py = cache.Y(route.y[Math.floor(pd / route.step)]!);
        g.fillStyle = p.kind === 'ghost' ? tokenColor('--color-status-connected') : tokenColor('--color-text-secondary'); g.beginPath(); g.arc(px, py, 4 * dpr, 0, Math.PI * 2); g.fill();
        g.font = `700 ${9 * dpr}px Inter, sans-serif`; const tw = g.measureText(p.label).width + 8 * dpr; g.fillRect(px - tw / 2, py - 22 * dpr, tw, 13 * dpr); g.fillStyle = '#0d1320'; g.fillText(p.label, px - tw / 2 + 4 * dpr, py - 12 * dpr); }
      const y = cache.Y(route.y[Math.floor(d / route.step)] ?? 0); g.strokeStyle = tokenColor('--color-accent'); g.lineWidth = 2 * dpr; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h - 14 * dpr); g.stroke();
      g.fillStyle = '#fff'; g.beginPath(); g.arc(x, y, 6 * dpr, 0, Math.PI * 2); g.fill(); g.lineWidth = 3 * dpr; g.stroke(); // rider: white with amber ring
    };
    draw(); if (!read) { const ro = new ResizeObserver(draw); ro.observe(c); return () => ro.disconnect(); }
    const id = setInterval(draw, 250); return () => clearInterval(id);
  }, [route, read, zoom, banners]);
  return <canvas ref={ref} className={className} role="img" aria-label={`${route.name} elevation profile`} />;
}
