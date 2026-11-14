// Route-mode HUD widgets (plan 10.3, 10.5 A/B): on-the-road list, climb card, segment panel, gradient wedge,
// Cockpit preset pieces, and the full-screen 2D views (stage profile and map) cycled with V.
import { distOf, elevOf, fmtDist, fmtElev, fmtShort, speedOf, unitLabels, unitM } from '@myfitbike/shared';
import { unitsNow, useUnits } from '../app/store';
import { useEffect, useState, type ReactNode } from 'react';
import type { RouteProfile } from '@myfitbike/world';
import { Icon, Label, cx } from '../design/primitives';
import { rides } from '../engine/RideController';
import { mapUrl } from '../app/routesData';
import { MiniMap } from './MiniMap';
import { StageProfile, type Pin } from './StageProfile';
import { fmtTime, gradeColor } from './zones';
import { useLive } from './live';

export const Pod = ({ children, className }: { children: ReactNode; className?: string }) => <div className={cx('glass-hud rounded-xl shadow-ambient', className)}>{children}</div>;
export const readPos = () => { const s = rides.snapshot; return s ? { x: s.x, z: s.z, headingRad: s.headingRad, d: s.routeD } : null; };
export const readStage = () => { const s = rides.snapshot; if (!s) return null; const pins: Pin[] = [...s.ghosts.map((g) => ({ d: g.d, label: g.label === 'Personal best' ? 'PB' : 'LAST', kind: 'ghost' as const })), ...s.pacers.map((p) => ({ d: p.d, label: 'PACER', kind: 'pacer' as const }))]; return { d: s.routeD, pins }; };

export function OnTheRoad({ name }: { name: string }) {
  const [, tick] = useState(0); useEffect(() => { const id = setInterval(() => tick((n) => n + 1), 1000); return () => clearInterval(id); }, []);
  const s = rides.snapshot; if (!s || (!s.ghosts.length && !s.pacers.length)) return null;
  const rows = [...s.ghosts.map((g) => ({ label: g.label, sub: 'ghost', gap: g.gapS === null ? '—' : `${g.gapS > 0 ? '+' : ''}${fmtTime(Math.abs(g.gapS))}`, ahead: (g.gapS ?? 0) > 0, icon: 'flag' as const })),
    ...s.pacers.map((p) => ({ label: p.label, sub: 'pacer', gap: `${p.gapM > 0 ? '+' : '−'}${fmtShort(Math.abs(p.gapM), unitsNow())}`, ahead: p.gapM > 0, icon: 'speed' as const }))];
  return (
    <Pod className="w-80 p-4">
      <div className="flex justify-between mb-2"><Label className="text-text flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-status-success" />On the road</Label><Label>Gap</Label></div>
      {rows.map((r) => <div key={r.label} className="flex items-center justify-between py-2 px-2 rounded-lg"><span className="flex items-center gap-2"><Icon name={r.icon} size={18} className="text-status-connected" /><span><span className="text-body-md text-text font-semibold">{r.label}</span><span className="block text-[11px] text-text-muted">{r.sub}</span></span></span><span className={cx('font-metric-live text-metric-md', r.ahead ? 'text-status-danger' : 'text-status-success')}>{r.gap}</span></div>)}
      <div className="flex items-center justify-between py-2 px-2 rounded-lg bg-accent/15 border border-accent/40"><span className="text-body-md font-semibold text-accent">You · {name}</span><span className="font-metric-live text-metric-md text-text">0.0</span></div>
      {s.ghosts.some((g) => g.gapS !== null && g.gapS > 0 && g.gapS < 10) && <div className="mt-2 text-center text-[12px] font-semibold text-accent">Close the gap!</div>}
    </Pod>
  );
}

/** Climb card: from 300 m before a categorised climb to its summit (plan 10.3). Segment timer vs PB (10.5 B). */
export function ClimbAndSegment({ route }: { route: RouteProfile }) {
  const [pbs, setPbs] = useState<Record<string, number | null>>({});
  useEffect(() => { for (const s of route.segments) void fetch(`/api/segments/${s.id}/best`).then((r) => r.json()).then((b) => setPbs((p) => ({ ...p, [s.id]: b.pbS }))).catch(() => {}); }, [route]);
  const [, tick] = useState(0); const [segStart, setSegStart] = useState<Record<string, number>>({});
  useEffect(() => { const id = setInterval(() => tick((n) => n + 1), 500); return () => clearInterval(id); }, []);
  const s = rides.snapshot; if (!s) return null; const d = s.routeD;
  const climb = route.climbs.find((c) => d >= c.startM - 300 && d <= c.endM);
  const seg = route.segments.find((x) => d >= x.startM && d <= x.endM);
  if (seg && segStart[seg.id] === undefined) setSegStart((m) => ({ ...m, [seg.id]: s.elapsedS }));
  if (!seg && Object.keys(segStart).length) setSegStart({});
  if (!climb && !seg) return null;
  return (
    <div className="flex flex-col gap-3 w-80">
      {climb && <Pod className="p-4 border-grade-severe/50"><div className="flex justify-between"><Label className="text-grade-severe">{climb.category === 'HC' ? 'HC climb' : `Cat ${climb.category} climb`}</Label><Label>{climb.avgGradePct} % avg · max {climb.maxGradePct} %</Label></div>
        {d < climb.startM ? <div className="text-headline-md text-text mt-1">Starts in {fmtShort(climb.startM - d, unitsNow())}</div>
          : <div className="flex gap-6 mt-1"><div><span className="font-metric-live text-metric-lg text-text">{distOf(climb.endM - d, unitsNow()).toFixed(2)}</span> <span className="text-metric-unit text-text-secondary">{unitLabels(unitsNow()).dist} to top</span></div><div><span className="font-metric-live text-metric-lg text-text">{Math.max(0, Math.round(elevOf(route.y[Math.floor(climb.endM / route.step)]! - (s.altM ?? 0), unitsNow())))}</span> <span className="text-metric-unit text-text-secondary">{unitLabels(unitsNow()).elev} to climb</span></div></div>}
        <div className="h-1.5 mt-3 rounded-full bg-white/10 overflow-hidden"><div className="h-full bg-grade-severe" style={{ width: `${Math.max(0, Math.min(100, ((d - climb.startM) / climb.lengthM) * 100))}%` }} /></div></Pod>}
      {seg && <Pod className="p-4"><div className="flex justify-between"><Label className={seg.kind === 'sprint' ? 'text-status-success' : 'text-accent'}>{seg.kind} segment</Label><Label>{fmtShort(seg.endM - d, unitsNow())} to go</Label></div>
        <div className="text-body-lg font-semibold text-text">{seg.name}</div>
        <div className="flex gap-6 mt-1"><div><span className="font-metric-live text-metric-lg text-text">{fmtTime(s.elapsedS - (segStart[seg.id] ?? s.elapsedS))}</span> <span className="text-metric-unit text-text-secondary">now</span></div><div><span className="font-metric-live text-metric-lg text-text-secondary">{pbs[seg.id] ? fmtTime(pbs[seg.id]!) : '—'}</span> <span className="text-metric-unit text-text-secondary">PB</span></div></div></Pod>}
    </div>
  );
}

export function GradeWedge({ bind }: { bind: (k: string) => (el: HTMLElement | null) => void }) {
  return <svg width="64" height="40" viewBox="0 0 64 40" aria-hidden><polygon ref={bind('wedge') as unknown as React.Ref<SVGPolygonElement>} points="2,38 62,38 62,30" /></svg>;
}
export function useWedge() { return () => { const g = rides.snapshot?.gradePct ?? 0; const rise = Math.max(-10, Math.min(18, g)); return { wedgePts: `2,38 62,38 62,${38 - Math.max(1, rise * 1.9)}`, color: gradeColor(g) }; }; }

export function UpcomingGradient({ route }: { route: RouteProfile }) {
  return <Pod className="p-3 w-[420px]"><div className="flex justify-between mb-1"><Label>Next {useUnits() === 'imperial' ? '1.2 mi' : '2 km'}</Label></div><div className="h-28"><StageProfile route={route} read={readStage} zoom="next2km" className="w-full h-full" /></div></Pod>;
}

/** Cockpit preset (plan 10.5 A, modelled on reference 15/16/18): power tile TL, bar top-centre, minimap TR, splits + stats left, road list right. */
export function CockpitTop({ route, name }: { route: RouteProfile; name: string }) {
  const units = useUnits(); const U = unitLabels(units);
  const bind = useLive(4, (): Record<string, string | { width: string }> => { const s = rides.snapshot; if (!s) return {}; return { cSpeed: speedOf(s.speedMps, unitsNow()).toFixed(1), cDist: distOf(s.distanceM, unitsNow()).toFixed(2), cElev: String(Math.round(elevOf(s.altM ?? 0, unitsNow()))), cTime: fmtTime(s.elapsedS), cLap: `Lap ${s.lap}`, cProg: { width: `${Math.min(100, (s.routeD / route.lengthM) * 100)}%` } }; });
  const [splits, setSplits] = useState<{ km: number; t: number; p: number; hr: number }[]>([]);
  useEffect(() => { const id = setInterval(() => { const r = rides.records; const out: typeof splits = []; let lastT = 0, i0 = 0; for (let i = 0; i < r.length; i++) { const km = Math.floor(r[i]!.distance / unitM(unitsNow())); if (km > out.length) { const seg = r.slice(i0, i + 1); out.push({ km, t: r[i]!.t - lastT, p: Math.round(seg.reduce((a, x) => a + (x.power ?? 0), 0) / seg.length), hr: Math.round(seg.reduce((a, x) => a + (x.hr ?? 0), 0) / seg.length) }); lastT = r[i]!.t; i0 = i; } } setSplits(out.slice(-6)); }, 2000); return () => clearInterval(id); }, []);
  return (<>
    <Pod className="absolute top-6 left-1/2 -translate-x-1/2 px-6 py-3 flex items-center gap-8">
      {[['cSpeed', U.speed], ['cDist', U.dist], ['cElev', U.elev], ['cTime', '']].map(([k, u]) => <div key={k}><span className="font-metric-live text-metric-lg text-text" ref={bind(k!)} /> <span className="text-metric-unit text-text-secondary">{u}</span></div>)}
      <div className="w-40"><div className="flex justify-between text-[10px] text-text-secondary"><span ref={bind('cLap')} /><span>{fmtDist(route.lengthM, units)}</span></div><div className="h-1.5 rounded-full bg-white/10 overflow-hidden mt-1"><div ref={bind('cProg')} className="h-full bg-accent" /></div></div>
    </Pod>
    <Pod className="absolute top-24 right-6 w-80 overflow-hidden"><MiniMap route={route} read={readPos} className="w-full h-56" /><div className="h-16 border-t border-white/8"><StageProfile route={route} read={readStage} banners={false} className="w-full h-full" /></div></Pod>
    <Pod className="absolute top-[300px] left-6 w-80 p-4"><Label className="mb-2 text-text">Splits (per {U.dist === 'mi' ? 'mile' : 'km'})</Label>
      {splits.length ? splits.map((s) => <div key={s.km} className="flex justify-between text-body-md py-0.5"><span className="text-text-secondary">{U.dist} {s.km}</span><span className="tabular text-text">{fmtTime(s.t)}</span><span className="tabular text-text">{s.p} W</span><span className="tabular text-text-secondary">{s.hr || '—'} bpm</span></div>) : <p className="text-[12px] text-text-muted">After the first {U.dist === 'mi' ? 'mile' : 'kilometre'}.</p>}</Pod>
    <div className="absolute top-[440px] right-6"><OnTheRoad name={name} /></div>
  </>);
}

/** Full-screen 2D views (V cycles HUD → stage profile → map). */
export function FullStage({ route }: { route: RouteProfile }) {
  return <div className="absolute inset-0 pt-28 pb-44 px-10 flex flex-col gap-4 bg-surface/95"><Label className="text-text text-center">Stage profile · {route.name} · {fmtDist(route.lengthM, unitsNow())} · +{fmtElev(route.ascentM, unitsNow())}</Label><Pod className="flex-1 p-4"><StageProfile route={route} read={readStage} className="w-full h-full" /></Pod><Pod className="h-40 p-3"><StageProfile route={route} read={readStage} zoom="next2km" className="w-full h-full" /></Pod></div>;
}
export function FullMap({ route }: { route: RouteProfile }) {
  return <div className="absolute inset-0 pt-24 pb-44 px-10 flex gap-4 bg-surface/95"><Pod className="flex-1 overflow-hidden"><MiniMap route={route} read={readPos} radiusM={2600} headingUp={false} className="w-full h-full" /></Pod><Pod className="w-96 overflow-hidden"><img src={mapUrl(route, 500)} alt="Route overview" className="w-full h-64 object-cover" /><div className="p-4 text-body-md text-text-secondary">North up · the amber line is your route. Press V to cycle views, M for the minimap.</div></Pod></div>;
}
