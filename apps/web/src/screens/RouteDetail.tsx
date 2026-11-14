// Route detail — E3 veloworld_route_detail_solace_summit: map with start/finish pins, filled profile, description,
// stats, climbs, segments with PBs, past activities. "Select a section" arrives in Phase 5.
import { distOf, effectiveFtp, fmtDist, fmtElev, unitLabels, type RideSummary } from '@veloworld/shared';
import { useApp, useUnits } from '../app/store';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Button, Chip, Icon, Label, Toggle } from '../design/primitives';
import { BUILTIN } from '../app/workouts';
import { difficultyOf, estimateTime, mapUrl, regionName } from '../app/routesData';
import { useRoute } from '../realroad/useRoute';
import { StageProfile } from '../hud/StageProfile';
import { fmtTime } from '../hud/zones';

export function RouteDetail() {
  const u = useUnits();
  const { id = '' } = useParams(); const nav = useNavigate(); const { route: r, loading } = useRoute(id); const profile = useApp((s) => s.profile);
  const [pbs, setPbs] = useState<Record<string, number | null>>({}); const [past, setPast] = useState<{ id: number; startedAt: string; summary: RideSummary | null }[]>([]);
  const [ghost, setGhost] = useState(true); const [sec, setSec] = useState<[number, number] | null>(null); const [pacer, setPacer] = useState<number | null>(null); const [workout, setWorkout] = useState('');
  useEffect(() => { if (!r) return; for (const s of r.segments) void fetch(`/api/segments/${s.id}/best`).then((x) => x.json()).then((b) => setPbs((p) => ({ ...p, [s.id]: b.pbS }))); void fetch(`/api/routes/${r.id}/rides`).then((x) => x.json()).then(setPast).catch(() => {}); }, [r]);
  if (!r) return <div className="p-12 text-text-secondary">{loading ? 'Loading route…' : 'Route not found.'}</div>;
  const ftp = profile ? effectiveFtp(profile) : 200; const mass = (profile?.weightKg ?? 75) + (profile?.bikeWeightKg ?? 8);
  const start = () => nav(`/ride?mode=${workout ? 'workout' : 'route'}&route=${r.id}${workout ? `&workout=${encodeURIComponent(workout)}` : ''}${ghost && !sec ? '&ghost=1' : ''}${pacer ? `&pacer=${pacer}` : ''}${sec ? `&from=${sec[0]}&to=${sec[1]}` : ''}`);
  return (
    <div className="max-w-[1440px] mx-auto px-12 py-8 space-y-6">
      <button className="text-label-caps uppercase text-text-secondary hover:text-text flex items-center gap-1" onClick={() => nav('/routes')}><Icon name="chevron_right" className="rotate-180" size={16} />All routes</button>
      <div className="grid grid-cols-[1.4fr_1fr] gap-6">
        <div className="rounded-2xl overflow-hidden h-[380px] relative bg-black/40"><img src={mapUrl(r, 600)} alt={`Map of ${r.name}`} className="w-full h-full object-cover" /><div className="absolute bottom-3 left-3 flex gap-2"><Chip className="bg-black/60" tone="success">● Start{r.loop ? ' / finish' : ''}</Chip>{!r.loop && <Chip className="bg-black/60" tone="danger">● Finish</Chip>}</div></div>
        <div className="space-y-4">
          <div className="flex gap-2"><Chip>{regionName(r.region)}</Chip><Chip tone="accent">{difficultyOf(r)}</Chip>{r.loop && <Chip>Loop</Chip>}</div>
          <h1 className="text-headline-lg text-text">{r.name}</h1><p className="text-body-lg text-on-surface-variant">{r.description}</p>
          <div className="grid grid-cols-2 gap-3">{[['Distance', fmtDist(r.lengthM, u)], ['Ascent', fmtElev(r.ascentM, u)], ['Max gradient', `${r.maxGradePct} %`], [`Est. time at ${Math.round(ftp * 0.75)} W`, fmtTime(estimateTime(r, ftp, mass))]].map(([l, v]) => <div key={l} className="rounded-xl bg-surface-container-low/70 p-4"><Label>{l}</Label><div className="font-metric-live text-metric-lg text-text">{v}</div></div>)}</div>
          <div className="rounded-xl bg-surface-container-low/70 p-4 space-y-3">
            <label className="flex justify-between items-center text-body-md text-text">Race my ghost (best and last ride)<Toggle label="Ghost" checked={ghost} onChange={setGhost} /></label>
            <label className="flex justify-between items-center text-body-md text-text">Pacer<select value={pacer ?? ''} onChange={(e) => setPacer(e.target.value ? Number(e.target.value) : null)} className="bg-white/6 border border-white/12 rounded-md px-2 py-1 text-text" aria-label="Pacer"><option value="">None</option>{[2.0, 2.5, 3.0, 3.5, 4.0].map((w) => <option key={w} value={w}>{w.toFixed(1)} W/kg</option>)}</select></label>
            <label className="flex justify-between items-center text-body-md text-text">Workout on this route<select value={workout} onChange={(e) => setWorkout(e.target.value)} className="bg-white/6 border border-white/12 rounded-md px-2 py-1 text-text max-w-56" aria-label="Workout on route"><option value="">No workout (gradient)</option>{BUILTIN.filter((w) => w.category !== 'test' && w.category !== 'climbing').map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select></label>
            <Button variant="primary" size="lg" icon="play_arrow" className="w-full" onClick={start}>Start</Button>
          </div>
        </div>
      </div>
      <div className="rounded-2xl bg-surface-container-low/70 p-6">
        <div className="flex justify-between mb-3"><Label>Elevation profile</Label><button className="text-label-caps uppercase text-accent" onClick={() => setSec(sec ? null : [0, Math.min(r.lengthM, 5000)])}>{sec ? 'Ride the whole route' : 'Select a section'}</button></div>
        <div className="relative"><StageProfile route={r} className="w-full h-56" />
          {sec && <div className="absolute inset-y-0 bg-accent/15 border-x-2 border-accent pointer-events-none" style={{ left: `${(sec[0] / r.lengthM) * 100}%`, width: `${((sec[1] - sec[0]) / r.lengthM) * 100}%` }} />}</div>
        {sec && <div className="grid grid-cols-2 gap-6 mt-3">
          <label className="text-body-md text-text-secondary">From {unitLabels(u).dist} {distOf(sec[0], u).toFixed(1)}<input aria-label="Section start" type="range" min={0} max={r.lengthM - 500} step={100} value={sec[0]} onChange={(e) => setSec([Math.min(Number(e.target.value), sec[1] - 500), sec[1]])} className="w-full accent-accent" /></label>
          <label className="text-body-md text-text-secondary">To {unitLabels(u).dist} {distOf(sec[1], u).toFixed(1)}<input aria-label="Section end" type="range" min={500} max={r.lengthM} step={100} value={sec[1]} onChange={(e) => setSec([sec[0], Math.max(Number(e.target.value), sec[0] + 500)])} className="w-full accent-accent" /></label>
        </div>}
      </div>
      <div className="grid grid-cols-2 gap-6">
        <div className="rounded-2xl bg-surface-container-low/70 p-6"><Label className="mb-3">Climbs and segments</Label>
          {r.climbs.map((c, i) => <div key={i} className="flex justify-between py-2 border-b border-white/6 text-body-md"><span className="text-text">{c.category === 'HC' ? 'HC' : `Cat ${c.category}`} climb at {unitLabels(u).dist} {distOf(c.startM, u).toFixed(1)}</span><span className="text-text-secondary">{fmtDist(c.lengthM, u)} · {c.avgGradePct} % · +{fmtElev(c.gainM, u)}</span></div>)}
          {r.segments.map((s) => <div key={s.id} className="flex justify-between py-2 border-b border-white/6 text-body-md"><span className="text-text"><Chip tone={s.kind === 'sprint' ? 'success' : 'accent'}>{s.kind}</Chip> {s.name}</span><span className="text-text-secondary">{fmtDist(s.endM - s.startM, u, 2)} · PB {pbs[s.id] ? fmtTime(pbs[s.id]!) : '—'}</span></div>)}
          {!r.climbs.length && !r.segments.length && <p className="text-text-secondary">No categorised climbs.</p>}</div>
        <div className="rounded-2xl bg-surface-container-low/70 p-6"><Label className="mb-3">Your rides on this route</Label>
          {past.length ? past.map((p) => <button key={p.id} onClick={() => nav(`/summary/${p.id}`)} className="w-full flex justify-between py-2 border-b border-white/6 text-body-md hover:bg-white/5"><span className="text-text">{new Date(p.startedAt).toLocaleDateString()}</span><span className="text-text-secondary">{fmtTime(p.summary?.movingS ?? 0)} · {p.summary?.avgPower ?? '—'} W</span></button>) : <p className="text-text-secondary">Not ridden yet.</p>}</div>
      </div>
    </div>
  );
}
