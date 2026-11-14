// Workout graph (plan 10.5 B): zone-coloured blocks, actual power trace drawn over them, rider marker at the current time.
// Static part is drawn once; the trace and marker redraw on a 1 Hz / 4 Hz tick without React re-rendering.
import { useEffect, useRef } from 'react';
import { durationOf, targetAt, zoneOf, type Block, type Sample } from '@myfitbike/shared';
import { tokenColor, zoneColor } from './zones';

export function drawWorkout(ctx: CanvasRenderingContext2D, w: number, h: number, blocks: Block[], ftp: number, opts: { trace?: Sample[]; nowS?: number; maxPct?: number; ftpLine?: boolean } = {}) {
  const dur = durationOf(blocks) || 1; const maxW = Math.max(ftp * (opts.maxPct ?? 1.6), ...blocks.map((b) => targetAt(blocks, b.startS, ftp).watts ?? 0)) * 1.05;
  const X = (t: number) => (t / dur) * w, Y = (p: number) => h - (Math.min(p, maxW) / maxW) * (h - 4);
  ctx.clearRect(0, 0, w, h);
  for (const b of blocks) {
    const step = b.kind === 'ramp' ? Math.max(2, (b.endS - b.startS) / 24) : b.endS - b.startS;
    for (let t = b.startS; t < b.endS; t += step) {
      const r = targetAt(blocks, t, ftp); const p = r.watts ?? (r.type === 'slopePct' ? ftp * (0.6 + r.value / 20) : ftp * 0.5);
      const done = opts.nowS !== undefined && t + step <= opts.nowS;
      ctx.fillStyle = r.type === 'free' ? tokenColor('--color-text-muted') : zoneColor(zoneOf(p, ftp)); ctx.globalAlpha = done ? 0.45 : 0.9;
      ctx.fillRect(X(t), Y(p), Math.max(1, X(Math.min(b.endS, t + step)) - X(t) - (t + step >= b.endS ? 1 : 0)), h - Y(p));
    }
  }
  ctx.globalAlpha = 1;
  if (opts.ftpLine) { ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(0, Y(ftp)); ctx.lineTo(w, Y(ftp)); ctx.stroke(); ctx.setLineDash([]); }
  if (opts.trace?.length) { ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5 * devicePixelRatio; ctx.beginPath(); opts.trace.forEach((s, i) => { const x = X(s.t), y = Y(s.power ?? 0); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }); ctx.stroke(); }
  if (opts.nowS !== undefined) {
    const x = X(opts.nowS); ctx.strokeStyle = tokenColor('--color-accent'); ctx.lineWidth = 2 * devicePixelRatio; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, 8 * devicePixelRatio, 5 * devicePixelRatio, 0, Math.PI * 2); ctx.fill(); ctx.lineWidth = 2.5 * devicePixelRatio; ctx.stroke(); // rider: white with amber ring
  }
}

export function WorkoutGraph({ blocks, ftp, className, live }: { blocks: Block[]; ftp: number; className?: string; live?: () => { trace: Sample[]; nowS: number } }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const draw = () => { const w = (c.width = c.clientWidth * devicePixelRatio), h = (c.height = c.clientHeight * devicePixelRatio); const ctx = c.getContext('2d'); if (ctx) drawWorkout(ctx, w, h, blocks, ftp, { ...(live?.() ?? {}), ftpLine: !!live }); };
    draw(); if (!live) { const ro = new ResizeObserver(draw); ro.observe(c); return () => ro.disconnect(); }
    const id = setInterval(draw, 1000); return () => clearInterval(id);
  }, [blocks, ftp, live]);
  return <canvas ref={ref} className={className} aria-label="Workout graph" role="img" />;
}
