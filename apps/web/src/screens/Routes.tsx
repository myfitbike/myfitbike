// Routes browser — E3 veloworld_routes_browser. Tabs per plan 10.5 G (World tab and Collections arrive in Phase 5).
// Card images are generated map crops of Velora (design photos of real places are placeholders and are not shipped).
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { effectiveFtp } from '@veloworld/shared';
import { Button, Chip, Icon, Label, cx } from '../design/primitives';
import { useApp } from '../app/store';
import { allRoutes, difficultyOf, estimateTime, mapUrl, regionName } from '../app/routesData';
import { StageProfile } from '../hud/StageProfile';
import { fmtTime } from '../hud/zones';

const DIFF_TONE = { Easy: 'success', Moderate: 'warning', Hard: 'danger', Extreme: 'danger' } as const;
export function Routes() {
  const nav = useNavigate(); const profile = useApp((s) => s.profile); const ftp = profile ? effectiveFtp(profile) : 200; const mass = (profile?.weightKg ?? 75) + (profile?.bikeWeightKg ?? 8);
  const [q, setQ] = useState(''); const [diff, setDiff] = useState<string>('all');
  const list = useMemo(() => allRoutes().filter((r) => (diff === 'all' || difficultyOf(r) === diff) && (!q || `${r.name} ${r.description} ${regionName(r.region)}`.toLowerCase().includes(q.toLowerCase()))), [q, diff]);
  return (
    <div className="max-w-[1520px] mx-auto px-12 py-8 space-y-6">
      <div className="flex items-end justify-between">
        <div><Label className="text-primary-fixed-dim tracking-[0.2em] flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-accent" />The island of Velora</Label><h1 className="font-metric text-metric-hero uppercase leading-none text-on-surface">Routes</h1></div>
        <Button variant="primary" icon="play_arrow" onClick={() => nav('/ride?mode=route&route=harbour-spin')}>Just ride: Harbour Spin</Button>
      </div>
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
            <div className="grid grid-cols-4 gap-2 my-3">{[['Distance', (r.lengthM / 1000).toFixed(1), 'km'], ['Ascent', String(r.ascentM), 'm'], ['Max', `${r.maxGradePct}`, '%'], ['Est. time', fmtTime(estimateTime(r, ftp, mass)), '']].map(([l, v, u]) => (
              <div key={l}><Label className="text-[10px]">{l}</Label><span className="font-metric-live text-metric-md text-text">{v}</span><span className="text-metric-unit text-text-secondary ml-0.5">{u}</span></div>))}</div>
            <div className="h-16 rounded-lg bg-black/25 overflow-hidden"><StageProfile route={r} className="w-full h-full" banners={false} /></div>
            <div className="flex justify-between items-center mt-4"><span className="text-[11px] uppercase tracking-wider text-text-secondary">{r.climbs.length} climbs · {r.segments.length} segments{r.loop ? ' · loop' : ''}</span><Button size="sm" variant="primary" onClick={() => nav(`/ride?mode=route&route=${r.id}`)}>Ride route</Button></div>
          </div>
        </article>); })}</div>
    </div>
  );
}
