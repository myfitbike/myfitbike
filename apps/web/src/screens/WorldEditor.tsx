// World editor v1 (plan 7.0) — developer tool, available only in development builds. Not shown to riders.
// Top-down view: drag road control points, nodes (moves connected road ends) and landmarks; pan with the
// right mouse button or Space+drag, zoom with the wheel. The strip below shows the selected road's elevation
// coloured by gradient with limit warnings; drag points vertically there to change elevation. Save validates on
// the API and writes content/world/velora/world.json.
import { useEffect, useMemo, useRef, useState } from 'react';
import { gradesPer10m, sampleEdge, validateWorld, type Vec3, type World } from '@myfitbike/world';
import { Button, Chip, Label } from '../design/primitives';
import { WORLD } from '../app/routesData';
import { gradeColor, tokenColor } from '../hud/zones';

type Drag = { kind: 'point'; edge: string; i: number } | { kind: 'node'; id: string } | { kind: 'landmark'; id: string } | { kind: 'pan'; x: number; y: number } | { kind: 'elev'; edge: string; i: number } | null;

export default function WorldEditor() {
  const [world, setWorld] = useState<World>(() => structuredClone(WORLD));
  const [sel, setSel] = useState<string>(world.edges[0]!.id); const [msg, setMsg] = useState<string | null>(null); const [dirty, setDirty] = useState(false);
  const view = useRef({ cx: 0, cy: 3500, scale: 0.06 }); const drag = useRef<Drag>(null); const top = useRef<HTMLCanvasElement>(null); const strip = useRef<HTMLCanvasElement>(null);
  const errors = useMemo(() => validateWorld(world).errors, [world]);
  const edge = world.edges.find((e) => e.id === sel)!;
  const update = (fn: (w: World) => void) => { setWorld((w) => { const c = structuredClone(w); fn(c); return c; }); setDirty(true); };

  // ---- top-down canvas ----
  useEffect(() => {
    const c = top.current!; const g = c.getContext('2d')!; const dpr = devicePixelRatio; c.width = c.clientWidth * dpr; c.height = c.clientHeight * dpr;
    const { cx, cy, scale } = view.current; const S = (x: number, z: number): [number, number] => [(x - cx) * scale * dpr + c.width / 2, (z - cy) * scale * dpr + c.height / 2];
    g.fillStyle = '#163a52'; g.fillRect(0, 0, c.width, c.height);
    for (const r of world.regions) { g.fillStyle = r.color; g.globalAlpha = 0.35; g.beginPath(); r.polygon.forEach(([x, z], i) => { const [a, b] = S(x, z); if (i) g.lineTo(a, b); else g.moveTo(a, b); }); g.closePath(); g.fill(); g.globalAlpha = 1; const [lx, ly] = S(r.polygon[0]![0], r.polygon[0]![1]); g.fillStyle = '#fff'; g.font = `${12 * dpr}px Inter`; g.fillText(`${r.name} (≤${r.maxGradePct} %)`, lx + 6 * dpr, ly + 16 * dpr); }
    for (const e of world.edges) {
      const s = sampleEdge(e.points, 10); const gr = gradesPer10m(sampleEdge(e.points, 5));
      for (let i = 1; i < s.x.length; i++) { const [a, b] = S(s.x[i - 1]!, s.z[i - 1]!), [c2, d] = S(s.x[i]!, s.z[i]!); g.strokeStyle = gradeColor(gr[Math.min(gr.length - 1, i)] ?? 0); g.lineWidth = (e.id === sel ? 5 : 3) * dpr; g.beginPath(); g.moveTo(a, b); g.lineTo(c2, d); g.stroke(); }
      if (e.id === sel) e.points.forEach(([x, , z], i) => { const [a, b] = S(x, z); g.fillStyle = i === 0 || i === e.points.length - 1 ? '#888' : '#fff'; g.fillRect(a - 3 * dpr, b - 3 * dpr, 6 * dpr, 6 * dpr); });
    }
    for (const n of world.nodes) { const [a, b] = S(n.pos[0], n.pos[2]); g.fillStyle = tokenColor('--color-accent'); g.beginPath(); g.arc(a, b, 6 * dpr, 0, 7); g.fill(); g.fillStyle = '#fff'; g.fillText(n.id, a + 8 * dpr, b - 6 * dpr); }
    for (const l of world.landmarks) { const [a, b] = S(l.pos[0], l.pos[2]); g.strokeStyle = '#fff'; g.lineWidth = 2 * dpr; g.strokeRect(a - 6 * dpr, b - 6 * dpr, 12 * dpr, 12 * dpr); g.fillText(l.name, a + 9 * dpr, b + 4 * dpr); }
  }, [world, sel]);

  // ---- elevation strip ----
  useEffect(() => {
    const c = strip.current!; const g = c.getContext('2d')!; const dpr = devicePixelRatio; const w = (c.width = c.clientWidth * dpr), h = (c.height = c.clientHeight * dpr);
    const s = sampleEdge(edge.points, 5); const gr = gradesPer10m(s); const lo = Math.min(...s.y) - 10, hi = Math.max(...s.y) + 10; const X = (d: number) => (d / s.length) * w, Y = (y: number) => h - 20 * dpr - ((y - lo) / (hi - lo)) * (h - 40 * dpr);
    g.fillStyle = '#0d1320'; g.fillRect(0, 0, w, h);
    const limit = Math.max(...world.regions.map((r) => r.maxGradePct));
    gr.forEach((v, i) => { const d = i * 10; g.fillStyle = Math.abs(v) > limit ? tokenColor('--color-status-danger') : gradeColor(v); g.fillRect(X(d), Y(s.y[i * 2]!), Math.max(1, X(10) + 0.5), h - 20 * dpr - Y(s.y[i * 2]!)); });
    let acc = 0; edge.points.forEach((p, i) => { if (i) acc += Math.hypot(p[0] - edge.points[i - 1]![0], p[2] - edge.points[i - 1]![2]); g.fillStyle = '#fff'; g.beginPath(); g.arc(X(acc), Y(p[1]), 3 * dpr, 0, 7); g.fill(); });
    g.fillStyle = '#fff'; g.font = `${11 * dpr}px Inter`; g.fillText(`${edge.name} · ${(s.length / 1000).toFixed(2)} km · ${lo.toFixed(0)}–${hi.toFixed(0)} m · max ${Math.max(...gr.map(Math.abs)).toFixed(1)} %`, 8 * dpr, 14 * dpr);
  }, [edge, world.regions]);

  // ---- interaction ----
  const toWorld = (e: React.MouseEvent) => { const c = top.current!, r = c.getBoundingClientRect(); const { cx, cy, scale } = view.current; return { x: (e.clientX - r.left - r.width / 2) / scale + cx, z: (e.clientY - r.top - r.height / 2) / scale + cy }; };
  const near = (x: number, z: number, px = 10) => px / view.current.scale;
  function onDown(e: React.MouseEvent) {
    if (e.button === 2 || e.shiftKey) { drag.current = { kind: 'pan', x: e.clientX, y: e.clientY }; return; }
    const p = toWorld(e); const r = near(0, 0);
    const n = world.nodes.find((q) => Math.hypot(q.pos[0] - p.x, q.pos[2] - p.z) < r); if (n) { drag.current = { kind: 'node', id: n.id }; return; }
    const l = world.landmarks.find((q) => Math.hypot(q.pos[0] - p.x, q.pos[2] - p.z) < r); if (l) { drag.current = { kind: 'landmark', id: l.id }; return; }
    const i = edge.points.findIndex((q, k) => k > 0 && k < edge.points.length - 1 && Math.hypot(q[0] - p.x, q[2] - p.z) < r); if (i >= 0) { drag.current = { kind: 'point', edge: edge.id, i }; return; }
    let best: { id: string; d: number } | null = null; for (const ed of world.edges) for (const q of ed.points) { const d = Math.hypot(q[0] - p.x, q[2] - p.z); if (!best || d < best.d) best = { id: ed.id, d }; }
    if (best && best.d < near(0, 0, 16)) setSel(best.id); else drag.current = { kind: 'pan', x: e.clientX, y: e.clientY };
  }
  function onMove(e: React.MouseEvent) {
    const d = drag.current; if (!d) return;
    if (d.kind === 'pan') { view.current.cx -= (e.clientX - d.x) / view.current.scale; view.current.cy -= (e.clientY - d.y) / view.current.scale; drag.current = { ...d, x: e.clientX, y: e.clientY }; setWorld((w) => ({ ...w })); return; }
    const p = toWorld(e);
    if (d.kind === 'point') update((w) => { const pt = w.edges.find((x) => x.id === d.edge)!.points[d.i]!; pt[0] = Math.round(p.x); pt[2] = Math.round(p.z); });
    if (d.kind === 'landmark') update((w) => { const l = w.landmarks.find((x) => x.id === d.id)!; l.pos[0] = Math.round(p.x); l.pos[2] = Math.round(p.z); });
    if (d.kind === 'node') update((w) => { const n = w.nodes.find((x) => x.id === d.id)!; n.pos[0] = Math.round(p.x); n.pos[2] = Math.round(p.z);
      for (const ed of w.edges) { if (ed.from === n.id) { ed.points[0]![0] = n.pos[0]; ed.points[0]![2] = n.pos[2]; } if (ed.to === n.id) { const last = ed.points[ed.points.length - 1]!; last[0] = n.pos[0]; last[2] = n.pos[2]; } } });
  }
  function onStripDown(e: React.MouseEvent) {
    const c = strip.current!, r = c.getBoundingClientRect(); const s = sampleEdge(edge.points, 5); let acc = 0; const ds = edge.points.map((p, i) => (i ? (acc += Math.hypot(p[0] - edge.points[i - 1]![0], p[2] - edge.points[i - 1]![2])) : 0));
    const dClick = ((e.clientX - r.left) / r.width) * s.length; let bi = 1, bd = Infinity; ds.forEach((d, i) => { if (i > 0 && i < ds.length - 1 && Math.abs(d - dClick) < bd) { bd = Math.abs(d - dClick); bi = i; } });
    drag.current = { kind: 'elev', edge: edge.id, i: bi };
  }
  function onStripMove(e: React.MouseEvent) {
    const d = drag.current; if (d?.kind !== 'elev') return; const c = strip.current!, r = c.getBoundingClientRect(); const s = sampleEdge(edge.points, 5); const lo = Math.min(...s.y) - 10, hi = Math.max(...s.y) + 10;
    const y = lo + (1 - (e.clientY - r.top - 20) / (r.height - 40)) * (hi - lo); update((w) => { w.edges.find((x) => x.id === d.edge)!.points[d.i]![1] = Math.round(y * 10) / 10; });
  }
  async function save() {
    setMsg(null); const r = await fetch('/api/dev/world', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(world) });
    if (r.ok) { setMsg('Saved to content/world/velora/world.json — reload the app to ride it.'); setDirty(false); } else if (r.status === 404) setMsg('Saving is off: set WORLD_EDITOR=1 in apps/api/.env and restart pnpm dev'); else setMsg((await r.json()).errors?.slice(0, 3).join(' · ') ?? `Save failed (${r.status})`);
  }
  function addPoint() { update((w) => { const ed = w.edges.find((x) => x.id === sel)!; let bi = 0, bd = 0; for (let i = 1; i < ed.points.length; i++) { const a = ed.points[i - 1]!, b = ed.points[i]!; const d = Math.hypot(b[0] - a[0], b[2] - a[2]); if (d > bd) { bd = d; bi = i; } } const a = ed.points[bi - 1]!, b = ed.points[bi]!; ed.points.splice(bi, 0, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2] as Vec3); }); }

  return (
    <div className="fixed inset-0 bg-surface flex flex-col" onMouseUp={() => (drag.current = null)} onContextMenu={(e) => e.preventDefault()}>
      <div className="flex items-center gap-3 px-4 py-2 border-b border-white/10">
        <Label className="text-accent">World editor · dev only</Label>
        <select value={sel} onChange={(e) => setSel(e.target.value)} className="bg-white/6 border border-white/12 rounded px-2 py-1 text-text" aria-label="Road">{world.edges.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select>
        <Button size="sm" onClick={addPoint}>Add point</Button>
        {errors.length ? <Chip tone="danger">{errors.length} problems</Chip> : <Chip tone="success">Valid</Chip>}
        <div className="flex-1" />{msg && <span className="text-body-md text-text-secondary">{msg}</span>}
        <Button size="sm" variant="primary" disabled={!dirty || errors.length > 0} onClick={() => void save()}>Save</Button>
      </div>
      <div className="flex-1 flex min-h-0">
        <canvas ref={top} className="flex-1 cursor-crosshair" onMouseDown={onDown} onMouseMove={onMove} onWheel={(e) => { view.current.scale *= e.deltaY < 0 ? 1.15 : 1 / 1.15; setWorld((w) => ({ ...w })); }} />
        {errors.length > 0 && <div className="w-96 overflow-auto p-3 text-[12px] text-status-danger border-l border-white/10 space-y-1">{errors.slice(0, 60).map((e, i) => <div key={i}>{e}</div>)}</div>}
      </div>
      <canvas ref={strip} className="h-44 border-t border-white/10 cursor-ns-resize" onMouseDown={onStripDown} onMouseMove={onStripMove} />
    </div>
  );
}
