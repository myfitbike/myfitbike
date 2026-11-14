// Workout builder — E2 veloworld_workout_builder (plan 10.2 #5): blocks on a timeline, edit duration/target,
// repeat groups, text cues, live stress estimate, save to the library and export to ZWO.
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { effectiveFtp, estimateStress, flatten, type Step, type Workout } from '@myfitbike/shared';
import { Button, Chip, Icon, Label, TextField, cx } from '../design/primitives';
import { useApp } from '../app/store';
import { api } from '../app/api';
import { WorkoutGraph } from '../hud/WorkoutGraph';
import { exportZwo } from '../formats/workoutFiles';
import { fmtTime } from '../hud/zones';

type Block = { id: number; kind: 'steady' | 'ramp' | 'free' | 'repeat'; min: number; pct: number; pct2: number; cadence: string; cue: string; reps: number; offMin: number; offPct: number };
let nextId = 1;
const mk = (kind: Block['kind'], over: Partial<Block> = {}): Block => ({ id: nextId++, kind, min: kind === 'repeat' ? 4 : 5, pct: kind === 'repeat' ? 105 : 75, pct2: 95, cadence: '', cue: '', reps: 4, offMin: 3, offPct: 55, ...over });
function toSteps(bs: Block[]): Step[] {
  return bs.map((b): Step => {
    const text = b.cue ? [{ atS: 0, text: b.cue }] : undefined; const cadence = b.cadence ? Number(b.cadence) : undefined;
    if (b.kind === 'free') return { kind: 'free', durS: b.min * 60, text };
    if (b.kind === 'ramp') return { kind: 'ramp', durS: b.min * 60, from: { type: 'ftpPct', value: b.pct }, to: { type: 'ftpPct', value: b.pct2 }, cadence, text };
    if (b.kind === 'repeat') return { kind: 'repeat', times: b.reps, steps: [{ kind: 'steady', durS: b.min * 60, target: { type: 'ftpPct', value: b.pct }, cadence, text }, { kind: 'steady', durS: b.offMin * 60, target: { type: 'ftpPct', value: b.offPct } }] };
    return { kind: 'steady', durS: b.min * 60, target: { type: 'ftpPct', value: b.pct }, cadence, text };
  });
}

export function WorkoutBuilder() {
  const nav = useNavigate(); const profile = useApp((s) => s.profile); const ftp = profile ? effectiveFtp(profile) : 200;
  const [name, setName] = useState('My workout'); const [desc, setDesc] = useState('');
  const [blocks, setBlocks] = useState<Block[]>(() => [mk('ramp', { min: 10, pct: 45, pct2: 70, cue: 'Warm up' }), mk('repeat'), mk('ramp', { min: 8, pct: 65, pct2: 40, cue: 'Cool down' })]);
  const [drag, setDrag] = useState<number | null>(null); const [msg, setMsg] = useState<string | null>(null);
  const steps = useMemo(() => toSteps(blocks), [blocks]); const flat = useMemo(() => flatten(steps), [steps]); const stress = estimateStress(flat);
  const upd = (id: number, p: Partial<Block>) => setBlocks((bs) => bs.map((b) => (b.id === id ? { ...b, ...p } : b)));
  const workout = (): Workout => ({ id: `custom-${name.toLowerCase().replace(/\W+/g, '-')}-${Date.now().toString(36)}`, name, category: stress.if > 0.9 ? 'threshold' : stress.if > 0.8 ? 'sweetspot' : stress.if > 0.7 ? 'tempo' : 'endurance', description: desc, steps, source: 'custom' });
  async function save() { try { const w = workout(); await api.saveWorkout({ ...w, durationS: stress.durationS, tss: stress.tss }); setMsg('Saved to your library'); setTimeout(() => nav(`/workouts/${encodeURIComponent(w.id)}`), 600); } catch (e) { setMsg((e as Error).message); } }
  const download = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([exportZwo(workout())], { type: 'application/xml' })); a.download = `${name.replace(/\W+/g, '_')}.zwo`; a.click(); };
  const num = (v: string, d: number) => (v === '' ? d : Number(v));
  return (
    <div className="max-w-[1440px] mx-auto px-4 md:px-8 xl:px-12 py-6 md:py-8 space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4"><div><Label className="text-accent">Create</Label><h1 className="font-metric text-[44px] leading-[44px] md:text-metric-hero uppercase leading-none text-on-surface">Workout builder</h1></div>
        <div className="flex flex-wrap gap-3">{msg && <Chip tone={msg.startsWith('Saved') ? 'success' : 'danger'}>{msg}</Chip>}<Button icon="download" onClick={download}>Export ZWO</Button><Button variant="primary" icon="check" onClick={() => void save()}>Save workout</Button></div></div>
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
        <div className="rounded-2xl bg-surface-container-low/70 p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4"><TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} /><TextField label="Description" value={desc} onChange={(e) => setDesc(e.target.value)} /></div>
          <div className="h-44 rounded-xl bg-black/30 p-2"><WorkoutGraph blocks={flat} ftp={ftp} className="w-full h-full" /></div>
          <div className="flex flex-wrap gap-2">{(['steady', 'ramp', 'repeat', 'free'] as const).map((k) => <Button key={k} size="sm" icon="add" onClick={() => setBlocks((bs) => [...bs.slice(0, -1), mk(k), ...bs.slice(-1)])}>{k === 'repeat' ? 'Intervals' : k}</Button>)}</div>
          <div className="space-y-2">{blocks.map((b, i) => (
            <div key={b.id} draggable onDragStart={() => setDrag(i)} onDragOver={(e) => e.preventDefault()} onDrop={() => { if (drag === null || drag === i) return; setBlocks((bs) => { const c = [...bs]; const [m] = c.splice(drag, 1); c.splice(i, 0, m!); return c; }); setDrag(null); }}
              className={cx('rounded-xl bg-black/25 p-3 flex items-center gap-3 flex-wrap', drag === i && 'ring-1 ring-accent')}>
              <span className="cursor-grab text-text-muted" title="Drag to reorder">⋮⋮</span><Chip tone="accent">{b.kind === 'repeat' ? 'intervals' : b.kind}</Chip>
              {b.kind === 'repeat' && <label className="text-body-md text-text-secondary">× <input aria-label="Repeats" type="number" min={1} max={50} value={b.reps} onChange={(e) => upd(b.id, { reps: num(e.target.value, 1) })} className="w-14 bg-white/6 rounded px-2 py-1 text-text" /></label>}
              <label className="text-body-md text-text-secondary">{b.kind === 'repeat' ? 'on' : 'min'} <input aria-label="Minutes" type="number" min={0.25} step={0.25} value={b.min} onChange={(e) => upd(b.id, { min: num(e.target.value, 1) })} className="w-16 bg-white/6 rounded px-2 py-1 text-text" /></label>
              {b.kind !== 'free' && <label className="text-body-md text-text-secondary">{b.kind === 'ramp' ? 'from' : '%FTP'} <input aria-label="Percent FTP" type="number" min={20} max={250} value={b.pct} onChange={(e) => upd(b.id, { pct: num(e.target.value, 50) })} className="w-16 bg-white/6 rounded px-2 py-1 text-text" /></label>}
              {b.kind === 'ramp' && <label className="text-body-md text-text-secondary">to <input aria-label="Ramp end percent" type="number" min={20} max={250} value={b.pct2} onChange={(e) => upd(b.id, { pct2: num(e.target.value, 50) })} className="w-16 bg-white/6 rounded px-2 py-1 text-text" /></label>}
              {b.kind === 'repeat' && <><label className="text-body-md text-text-secondary">off min <input aria-label="Recovery minutes" type="number" min={0.25} step={0.25} value={b.offMin} onChange={(e) => upd(b.id, { offMin: num(e.target.value, 1) })} className="w-16 bg-white/6 rounded px-2 py-1 text-text" /></label>
                <label className="text-body-md text-text-secondary">off % <input aria-label="Recovery percent" type="number" min={20} max={100} value={b.offPct} onChange={(e) => upd(b.id, { offPct: num(e.target.value, 50) })} className="w-16 bg-white/6 rounded px-2 py-1 text-text" /></label></>}
              {b.kind !== 'free' && <label className="text-body-md text-text-secondary">rpm <input aria-label="Cadence" type="number" min={40} max={130} value={b.cadence} placeholder="—" onChange={(e) => upd(b.id, { cadence: e.target.value })} className="w-16 bg-white/6 rounded px-2 py-1 text-text" /></label>}
              <input aria-label="Cue text" value={b.cue} placeholder="Cue text (optional)" onChange={(e) => upd(b.id, { cue: e.target.value })} className="flex-1 min-w-40 bg-white/6 rounded px-2 py-1 text-text" />
              <button aria-label="Remove block" className="text-text-muted hover:text-status-danger" onClick={() => setBlocks((bs) => bs.filter((x) => x.id !== b.id))}><Icon name="delete" size={18} /></button>
            </div>))}</div>
        </div>
        <div className="rounded-2xl bg-surface-container-low/70 p-6 space-y-4 h-fit">
          <Label>Live estimate at {ftp} W</Label>
          {[['Duration', fmtTime(stress.durationS)], ['Training stress', `${stress.tss} TSS`], ['Intensity factor', stress.if.toFixed(2)], ['Intervals', String(flat.length)]].map(([l, v]) => <div key={l}><Label className="text-[10px]">{l}</Label><div className="font-metric-live text-metric-lg text-text">{v}</div></div>)}
          <p className="text-[12px] text-text-muted">Drag blocks to reorder. Targets are % of FTP so the workout scales when your FTP changes.</p>
        </div>
      </div>
    </div>
  );
}
