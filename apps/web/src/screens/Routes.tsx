// Routes browser — E3 veloworld_routes_browser. Tabs per plan 10.5 G (World tab and Collections arrive in Phase 5).
// Card images are generated map crops of Velora (design photos of real places are placeholders and are not shipped).
import { distOf, effectiveFtp, elevOf, fmtDist, fmtElev, unitLabels } from '@myfitbike/shared';
import { useApp, useUnits } from '../app/store';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { Button, Chip, Icon, Label, cx } from '../design/primitives';
import { WORLD, allRoutes, difficultyOf, estimateTime, mapUrl, regionName, routeOverlay } from '../app/routesData';
import { StageProfile } from '../hud/StageProfile';
import { RealRoadsTab } from './RealRoads';
import { fmtTime } from '../hud/zones';

const DIFF_TONE = { Easy: 'success', Moderate: 'warning', Hard: 'danger', Extreme: 'danger' } as const;
const COLLECTIONS: { id: string; name: string; test: (r: ReturnType<typeof allRoutes>[number]) => boolean }[] = [
  { id: 'flat', name: 'Flat and fast', test: (r) => r.ascentM / (r.lengthM / 1000) < 3 },
  { id: 'climbs', name: 'Climbs', test: (r) => r.climbs.some((c) => ['HC', '1', '2', '3'].includes(c.category)) },
  { id: 'rolling', name: 'Rolling', test: (r) => r.tags.includes('rolling') || (r.ascentM / (r.lengthM / 1000) >= 3 && r.ascentM / (r.lengthM / 1000) < 15) },
  { id: 'short', name: 'Short and sharp', test: (r) => r.lengthM < 16000 && r.maxGradePct >= 6 },
  { id: 'epics', name: 'Epics', test: (r) => r.lengthM > 60000 },
];
function WorldTab() {
  const u = useUnits();
  const nav = useNavigate(); const [hover, setHover] = useState<string | null>(null);
  const regions = WORLD.regions.map((g) => ({ ...g, routes: allRoutes().filter((r) => r.region === g.id) }));
  return (
    <div className="grid grid-cols-[1fr_360px] gap-6">
      <div className="relative rounded-2xl overflow-hidden h-[620px] bg-black/40"><img src={mapUrl()} alt="Illustrated map of Velora" className="w-full h-full object-cover" />
        {hover && (() => { const r = allRoutes().find((x) => x.id === hover); return r ? <img src={routeOverlay(r)} alt="" className="absolute inset-0 w-full h-full object-cover pointer-events-none" /> : null; })()}</div>
      <div className="rounded-2xl bg-surface-container-low/70 p-4 overflow-auto h-[620px] space-y-4">{regions.map((g) => (
        <div key={g.id}><Label className="mb-1" >{g.name}</Label>{g.routes.length ? g.routes.map((r) => <button key={r.id} onMouseEnter={() => setHover(r.id)} onMouseLeave={() => setHover(null)} onClick={() => nav(`/routes/${r.id}`)} className="w-full flex justify-between px-3 py-2 rounded-lg hover:bg-white/8 text-body-md"><span className="text-text">{r.name}</span><span className="text-text-secondary">{fmtDist(r.lengthM, u)} · {fmtElev(r.ascentM, u)}</span></button>) : <p className="text-[12px] text-text-muted px-3">Ridden as part of longer routes.</p>}</div>))}</div>
    </div>
  );
}
function CollectionsTab() {
  const u = useUnits();
  const nav = useNavigate(); const [rides, setRides] = useState<Record<string, number>>({});
  useEffect(() => { void fetch('/api/rides').then((r) => r.json()).then((rs: { name: string }[]) => { const m: Record<string, number> = {}; for (const r of allRoutes()) m[r.id] = rs.filter((x) => x.name === r.name).length; setRides(m); }).catch(() => {}); }, []);
  return <div className="grid grid-cols-2 gap-6">{COLLECTIONS.map((c) => { const rs = allRoutes().filter(c.test); return (
    <div key={c.id} className="rounded-2xl bg-surface-container-low/70 p-6"><div className="flex justify-between"><h3 className="text-headline-md text-text">{c.name}</h3><Chip>{rs.length} routes</Chip></div>
      <div className="flex gap-6 my-3 text-body-md text-text-secondary"><span>{fmtDist(rs.reduce((a, r) => a + r.lengthM, 0), u, 0)} total</span><span>{fmtElev(rs.reduce((a, r) => a + r.ascentM, 0), u)} climbing</span><span>{rs.reduce((a, r) => a + (rides[r.id] ?? 0), 0)} rides</span></div>
      <div className="space-y-1">{rs.map((r) => <button key={r.id} onClick={() => nav(`/routes/${r.id}`)} className="w-full flex justify-between px-3 py-2 rounded-lg bg-black/20 hover:bg-white/8 text-body-md"><span className="text-text">{r.name}</span><span className="text-text-secondary">{fmtDist(r.lengthM, u)} · {difficultyOf(r)}</span></button>)}</div></div>); })}</div>;
}

export function Routes() {
  const u = useUnits();
  const nav = useNavigate(); const profile = useApp((s) => s.profile); const ftp = profile ? effectiveFtp(profile) : 200; const mass = (profile?.weightKg ?? 75) + (profile?.bikeWeightKg ?? 8);
  const [q, setQ] = useState(''); const [diff, setDiff] = useState<string>('all'); const [tab, setTab] = useState<'world' | 'routes' | 'collections' | 'real roads'>('routes');
  const list = useMemo(() => allRoutes().filter((r) => (diff === 'all' || difficultyOf(r) === diff) && (!q || `${r.name} ${r.description} ${regionName(r.region)}`.toLowerCase().includes(q.toLowerCase()))), [q, diff]);
  return (
    <div className="max-w-[1520px] mx-auto px-12 py-8 space-y-6">
      <div className="flex items-end justify-between">
        <div><Label className="text-primary-fixed-dim tracking-[0.2em] flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-accent" />The island of Velora</Label><h1 className="font-metric text-metric-hero uppercase leading-none text-on-surface">Routes</h1></div>
        <Button variant="primary" icon="play_arrow" onClick={() => nav('/ride?mode=route&route=harbour-spin')}>Just ride: Harbour Spin</Button>
      </div>
      <div className="inline-flex rounded-xl bg-surface-container-low/70 p-1" role="tablist">{(['world', 'routes', 'collections', 'real roads'] as const).map((t) => <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={cx('px-6 py-2.5 rounded-lg text-body-md font-semibold uppercase tracking-wider', tab === t ? 'bg-accent text-on-accent' : 'text-text-secondary')}>{t}</button>)}</div>
      {tab === 'world' && <WorldTab />}
      {tab === 'collections' && <CollectionsTab />}
      {tab === 'real roads' && <RealRoadsTab />}
      {tab === 'routes' && <>
      <div className="rounded-2xl bg-surface-container-low/60 p-4 flex items-center justify-between gap-4">
        <div className="inline-flex rounded-lg bg-black/25 p-1" role="radiogroup" aria-label="Difficulty">{['all', 'Easy', 'Moderate', 'Hard', 'Extreme'].map((d) => <button key={d} role="radio" aria-checked={diff === d} onClick={() => setDiff(d)} className={cx('px-3 py-1.5 rounded-md text-label-caps uppercase', diff === d ? 'bg-white/12 text-text' : 'text-text-secondary')}>{d === 'all' ? 'All' : d}</button>)}</div>
        <label className="flex items-center gap-2 h-11 px-4 rounded-lg bg-black/25 w-80"><Icon name="search" size={18} className="text-text-secondary" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search routes" aria-label="Search routes" className="bg-transparent outline-none flex-1 text-text" /></label>
      </div>
      <div className="grid grid-cols-3 gap-6">{list.map((r) => { const d = difficultyOf(r); return (
        <article key={r.id} className="rounded-2xl overflow-hidden bg-surface-container-low/70 backdrop-blur-xl shadow-ambient flex flex-col">
          <button className="relative h-44 bg-black/40" onClick={() => nav(`/routes/${r.id}`)} aria-label={`Open ${r.name}`}>
            <img src={mapUrl(r)} alt="" className="absolute inset-0 w-full h-full object-cover" />
            <div className="absolute top-3 left-3 flex gap-2"><Chip tone="neutral" className="bg-black/50">{regionName(r.region)}</Chip><Chip tone={DIFF_TONE[d]} className="bg-black/50">{d}</Chip></div>
          </button>
          <div className="p-5 flex-1 flex flex-col">
            <h3 className="text-headline-md text-text cursor-pointer" onClick={() => nav(`/routes/${r.id}`)}>{r.name}</h3>
            <div className="grid grid-cols-4 gap-2 my-3">{[['Distance', distOf(r.lengthM, u).toFixed(1), unitLabels(u).dist], ['Ascent', String(Math.round(elevOf(r.ascentM, u))), unitLabels(u).elev], ['Max', `${r.maxGradePct}`, '%'], ['Est. time', fmtTime(estimateTime(r, ftp, mass)), '']].map(([l, v, u]) => (
              <div key={l}><Label className="text-[10px]">{l}</Label><span className="font-metric-live text-metric-md text-text">{v}</span><span className="text-metric-unit text-text-secondary ml-0.5">{u}</span></div>))}</div>
            <div className="h-16 rounded-lg bg-black/25 overflow-hidden"><StageProfile route={r} className="w-full h-full" banners={false} /></div>
            <div className="flex justify-between items-center mt-4"><span className="text-[11px] uppercase tracking-wider text-text-secondary">{r.climbs.length} climbs · {r.segments.length} segments{r.loop ? ' · loop' : ''}</span><Button size="sm" variant="primary" onClick={() => nav(`/ride?mode=route&route=${r.id}`)}>Ride route</Button></div>
          </div>
        </article>); })}</div>
      </>}
    </div>
  );
}
