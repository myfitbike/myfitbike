// Workout detail — E2 veloworld_workout_detail_sweet_spot_3x12. Graph, stats, interval list, start.
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { effectiveFtp, flatten, targetAt, zoneOf } from '@myfitbike/shared';
import { Button, Chip, Icon, Label, cx } from '../design/primitives';
import { useApp } from '../app/store';
import { api } from '../app/api';
import { CATEGORY_LABEL, findWorkout, type CatalogItem } from '../app/workouts';
import { WorkoutGraph } from '../hud/WorkoutGraph';
import { ZONE_BG, fmtTime } from '../hud/zones';
import { exportZwo } from '../formats/workoutFiles';

export function WorkoutDetail() {
  const { id = '' } = useParams(); const nav = useNavigate(); const profile = useApp((s) => s.profile); const ftp = profile ? effectiveFtp(profile) : 200;
  const [w, setW] = useState<CatalogItem | null | undefined>(undefined);
  useEffect(() => { void findWorkout(decodeURIComponent(id)).then((x) => setW(x ?? null)); }, [id]);
  if (w === undefined) return null;
  if (w === null) return <div className="p-12 text-text-secondary">Workout not found.</div>;
  const blocks = flatten(w.steps); const mode = w.test === 'ramp' ? 'ftpRamp' : w.test === 'ftp20' ? 'ftp20' : 'workout';
  const download = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([exportZwo(w)], { type: 'application/xml' })); a.download = `${w.name.replace(/\W+/g, '_')}.zwo`; a.click(); };
  return (
    <div className="max-w-[1440px] mx-auto px-12 py-8 space-y-6">
      <button className="text-label-caps uppercase text-text-secondary hover:text-text flex items-center gap-1" onClick={() => nav('/workouts')}><Icon name="chevron_right" className="rotate-180" size={16} />All workouts</button>
      <div className="flex items-end justify-between gap-6">
        <div><Chip tone="accent">{CATEGORY_LABEL[w.category]}</Chip><h1 className="text-headline-lg text-text mt-2">{w.name}</h1><p className="text-body-lg text-on-surface-variant max-w-3xl mt-2">{w.description}</p></div>
        <div className="flex gap-3">
          <Button icon="download" onClick={download}>Export ZWO</Button>
          {w.source === 'import' && <Button variant="danger" icon="delete" onClick={() => void api.deleteWorkout(w.id).then(() => nav('/workouts'))}>Delete</Button>}
          <Button variant="primary" size="lg" icon="play_arrow" onClick={() => nav(`/ride?mode=${mode}&workout=${encodeURIComponent(w.id)}`)}>{w.test ? 'Start test' : 'Start workout'}</Button>
        </div>
      </div>
      <div className="grid grid-cols-4 gap-4">{[['Duration', fmtTime(w.durationS), ''], ['Stress', String(w.tss), 'TSS'], ['Intensity', w.if.toFixed(2), 'IF'], ['Intervals', String(blocks.length), 'steps']].map(([l, v, u]) => (
        <div key={l} className="rounded-xl bg-surface-container-low/70 p-5"><Label>{l}</Label><div className="mt-2"><span className="font-metric-live text-metric-xl text-text">{v}</span> <span className="text-metric-unit text-text-secondary">{u}</span></div></div>))}</div>
      <div className="rounded-2xl bg-surface-container-low/70 p-6"><Label className="mb-3">Profile at your FTP ({ftp} W)</Label><WorkoutGraph blocks={blocks} ftp={ftp} className="w-full h-56" /></div>
      <div className="rounded-2xl bg-surface-container-low/70 p-6">
        <Label className="mb-4">Intervals</Label>
        <div className="divide-y divide-white/6">{blocks.map((b) => { const a = targetAt(blocks, b.startS, ftp), z = targetAt(blocks, b.endS - 0.01, ftp); const zone = a.watts ? zoneOf(Math.max(a.watts, z.watts ?? 0), ftp) : 1; return (
          <div key={b.i} className="flex items-center gap-4 py-2.5 text-body-md">
            <span className="w-8 text-text-muted tabular">{b.i + 1}</span><span className={cx('w-3 h-3 rounded-sm', b.kind === 'free' ? 'bg-text-muted' : ZONE_BG[zone - 1])} />
            <span className="w-20 tabular text-text">{fmtTime(b.endS - b.startS)}</span>
            <span className="flex-1 text-text">{b.kind === 'free' ? 'Free ride (ERG off)' : a.type === 'slopePct' ? `Slope ${a.value.toFixed(1)} %` : b.kind === 'ramp' ? `Ramp ${a.watts} → ${z.watts} W` : `${a.watts} W`}</span>
            {b.cadence && <span className="text-text-secondary">{b.cadence} rpm</span>}{b.cues[0] && <span className="text-text-secondary italic truncate max-w-md">“{b.cues[0].text}”</span>}
          </div>); })}</div>
      </div>
    </div>
  );
}
