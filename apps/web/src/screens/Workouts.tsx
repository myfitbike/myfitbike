// Workouts library — ported from E2 veloworld_workouts_library. Behaviour: plan 10.2 #4, 10.5 H, 6.4.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { effectiveFtp, flatten } from '@veloworld/shared';
import { Button, Chip, Icon, Label, cx } from '../design/primitives';
import { useApp } from '../app/store';
import { api } from '../app/api';
import { CATEGORY_LABEL, loadCatalog, type CatalogItem } from '../app/workouts';
import { WorkoutGraph } from '../hud/WorkoutGraph';
import { parseErgMrc, parseZwo } from '../formats/workoutFiles';

const DUR = [['all', 'All durations'], ['<30', '< 30m'], ['30-60', '30–60m'], ['60-90', '60–90m'], ['>90', '> 90m']] as const;
const INT = [['all', 'All intensities'], ['low', 'Low (<0.75)'], ['mod', 'Mod (0.75–0.88)'], ['high', 'High (>0.88)']] as const;
const CATS = ['getting-started', 'endurance', 'sweetspot', 'threshold', 'vo2max', 'anaerobic', 'sprint', 'climbing', 'recovery', 'cadence', 'test'];

function Stepper({ value, onChange, step, min, max, unit, fmt = (v: number) => String(v), tone }: { value: number; onChange: (v: number) => void; step: number; min: number; max: number; unit: string; fmt?: (v: number) => string; tone: string }) {
  return (
    <div className="inline-flex items-center rounded-xl bg-black/30 border border-white/10">
      <button aria-label={`decrease ${unit}`} className="w-12 h-14 text-text-secondary hover:text-text" onClick={() => onChange(Math.max(min, +(value - step).toFixed(1)))}><Icon name="remove" className="mx-auto" /></button>
      <span className="px-4 min-w-28 text-center"><span className={cx('font-metric-live text-metric-xl', tone)}>{fmt(value)}</span><span className="text-metric-unit text-text-secondary ml-1">{unit}</span></span>
      <button aria-label={`increase ${unit}`} className="w-12 h-14 text-text-secondary hover:text-text" onClick={() => onChange(Math.min(max, +(value + step).toFixed(1)))}><Icon name="add" className="mx-auto" /></button>
    </div>
  );
}

export function Workouts() {
  const nav = useNavigate(); const profile = useApp((s) => s.profile); const ftp = profile ? effectiveFtp(profile) : 200;
  const [all, setAll] = useState<CatalogItem[]>([]); const [cat, setCat] = useState<string | null>(null); const [dur, setDur] = useState<string>('all'); const [inten, setInten] = useState<string>('all'); const [q, setQ] = useState('');
  const [watts, setWatts] = useState(Math.round(ftp * 0.75 / 5) * 5); const [slope, setSlope] = useState(4.5); const [msg, setMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const reload = () => loadCatalog().then(setAll); useEffect(() => { void reload(); }, []);
  const list = useMemo(() => all.filter((w) => {
    const m = w.durationS / 60;
    return (!cat || w.category === cat) && (dur === 'all' || (dur === '<30' ? m < 30 : dur === '30-60' ? m >= 30 && m <= 60 : dur === '60-90' ? m > 60 && m <= 90 : m > 90))
      && (inten === 'all' || (inten === 'low' ? w.if < 0.75 : inten === 'mod' ? w.if >= 0.75 && w.if <= 0.88 : w.if > 0.88)) && (!q || `${w.name} ${w.description}`.toLowerCase().includes(q.toLowerCase()));
  }), [all, cat, dur, inten, q]);

  async function onImport(files: FileList | null) {
    if (!files?.length) return; setMsg(null);
    try {
      for (const f of Array.from(files)) {
        const text = await f.text(); const id = `import-${Date.now()}-${f.name.replace(/\W+/g, '-')}`;
        const w = /\.zwo$/i.test(f.name) ? parseZwo(text, id) : parseErgMrc(text, id, f.name);
        const item = all.length ? w : w; const s = flatten(item.steps); await api.saveWorkout({ ...w, durationS: s.at(-1)?.endS ?? 0, tss: 0 });
      }
      setMsg(`Imported ${files.length} workout${files.length > 1 ? 's' : ''}`); await reload();
    } catch (e) { setMsg((e as Error).message); }
  }

  return (
    <div className="max-w-[1520px] mx-auto px-12 py-8 space-y-8">
      <div className="flex items-end justify-between">
        <div><Label className="text-primary-fixed-dim tracking-[0.2em] flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-accent" />Structured ERG & slope training</Label><h1 className="font-metric text-metric-hero uppercase leading-none text-on-surface">Workouts</h1></div>
        <div className="flex gap-3">
          <input ref={fileRef} type="file" accept=".zwo,.erg,.mrc" multiple hidden onChange={(e) => void onImport(e.target.files)} aria-label="Import workout files" />
          <Button icon="upload" onClick={() => fileRef.current?.click()}>Import .zwo / .erg / .mrc</Button>
          <Button variant="primary" icon="add" onClick={() => nav('/workouts/builder')}>Build workout</Button>
        </div>
      </div>
      {msg && <Chip tone={msg.startsWith('Imported') ? 'success' : 'danger'}>{msg}</Chip>}

      <div className="grid grid-cols-2 gap-6">
        <div className="rounded-2xl bg-surface-container-low/70 backdrop-blur-xl p-7 shadow-ambient">
          <div className="flex gap-4 items-start mb-5"><span className="w-12 h-12 rounded-xl bg-white/8 flex items-center justify-center text-accent"><Icon name="bolt" size={26} /></span>
            <div><div className="flex items-center gap-2"><h2 className="text-headline-md text-text">Power control</h2><Chip tone="success">ERG</Chip></div><p className="text-body-md text-on-surface-variant">Hold an exact wattage regardless of cadence.</p></div></div>
          <div className="flex items-center gap-4"><Stepper value={watts} onChange={setWatts} step={5} min={50} max={1000} unit="W" tone="text-accent" />
            <Chip>FTP {Math.round((watts / ftp) * 100)} %</Chip><Button variant="primary" icon="play_arrow" onClick={() => nav(`/ride?mode=startPower&w=${watts}`)}>Engage ERG</Button></div>
        </div>
        <div className="rounded-2xl bg-surface-container-low/70 backdrop-blur-xl p-7 shadow-ambient">
          <div className="flex gap-4 items-start mb-5"><span className="w-12 h-12 rounded-xl bg-white/8 flex items-center justify-center text-secondary"><Icon name="landscape" size={26} /></span>
            <div><div className="flex items-center gap-2"><h2 className="text-headline-md text-text">Slope control</h2><Chip tone="connected">Sim</Chip></div><p className="text-body-md text-on-surface-variant">Ride at a constant gradient from −2 % to +16 %.</p></div></div>
          <div className="flex items-center gap-4"><Stepper value={slope} onChange={setSlope} step={0.5} min={-2} max={16} unit="%" fmt={(v) => (v > 0 ? `+${v.toFixed(1)}` : v.toFixed(1))} tone="text-secondary" />
            <Chip>{((profile?.weightKg ?? 75) + (profile?.bikeWeightKg ?? 8)).toFixed(0)} kg load</Chip><Button icon="lock" onClick={() => nav(`/ride?mode=startSlope&g=${slope}`)}>Lock slope</Button></div>
        </div>
      </div>

      <section>
        <div className="flex justify-between mb-3"><Label className="tracking-widest">Categories · {CATS.length}</Label>{cat && <button className="text-label-caps uppercase text-accent" onClick={() => setCat(null)}>Clear</button>}</div>
        <div className="grid grid-cols-11 gap-2">{CATS.map((c) => { const n = all.filter((w) => w.category === c).length; return (
          <button key={c} onClick={() => setCat(cat === c ? null : c)} className={cx('rounded-xl p-3 text-left bg-surface-container-low/70 border', cat === c ? 'border-accent' : 'border-transparent hover:border-white/15')}>
            <div className="flex justify-between text-[10px] text-text-secondary"><span className="uppercase tracking-wider">{n}</span></div><div className={cx('text-body-md font-semibold mt-1', cat === c ? 'text-accent' : 'text-text')}>{CATEGORY_LABEL[c]}</div></button>); })}</div>
      </section>

      <div className="rounded-2xl bg-surface-container-low/60 p-4 flex items-center justify-between gap-4">
        <div className="space-y-2">
          <div className="inline-flex rounded-lg bg-black/25 p-1" role="radiogroup" aria-label="Duration">{DUR.map(([v, l]) => <button key={v} role="radio" aria-checked={dur === v} onClick={() => setDur(v)} className={cx('px-3 py-1.5 rounded-md text-label-caps uppercase', dur === v ? 'bg-white/12 text-text' : 'text-text-secondary')}>{l}</button>)}</div>
          <div className="inline-flex rounded-lg bg-black/25 p-1 ml-3" role="radiogroup" aria-label="Intensity">{INT.map(([v, l]) => <button key={v} role="radio" aria-checked={inten === v} onClick={() => setInten(v)} className={cx('px-3 py-1.5 rounded-md text-label-caps uppercase', inten === v ? 'bg-white/12 text-text' : 'text-text-secondary')}>{l}</button>)}</div>
        </div>
        <label className="flex items-center gap-2 h-11 px-4 rounded-lg bg-black/25 w-80"><Icon name="search" size={18} className="text-text-secondary" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search workouts" className="bg-transparent outline-none flex-1 text-text" aria-label="Search workouts" /></label>
      </div>

      <div className="grid grid-cols-3 gap-6">{list.map((w) => (
        <article key={w.id} className="rounded-2xl bg-surface-container-low/70 backdrop-blur-xl p-5 shadow-ambient flex flex-col">
          <button onClick={() => nav(`/workouts/${encodeURIComponent(w.id)}`)} className="rounded-xl bg-black/35 h-28 p-2 mb-4"><WorkoutGraph blocks={flatten(w.steps)} ftp={ftp} className="w-full h-full" /></button>
          <div className="flex justify-between items-start"><Chip tone={w.category === 'test' ? 'accent' : 'neutral'}>{CATEGORY_LABEL[w.category] ?? w.category}{w.source === 'import' ? ' · imported' : ''}</Chip></div>
          <h3 className="text-headline-md text-text mt-2 cursor-pointer" onClick={() => nav(`/workouts/${encodeURIComponent(w.id)}`)}>{w.name}</h3>
          <p className="text-body-md text-on-surface-variant mt-1 line-clamp-2 flex-1">{w.description}</p>
          <div className="flex justify-between items-baseline my-4">
            <span><span className="font-metric-live text-metric-lg text-text">{Math.round(w.durationS / 60)}</span> <span className="text-metric-unit text-text-secondary">MIN</span></span>
            <span><span className="font-metric-live text-metric-lg text-accent">{w.tss}</span> <span className="text-metric-unit text-text-secondary">TSS</span></span>
            <span><span className="font-metric-live text-metric-lg text-text">{w.if.toFixed(2)}</span> <span className="text-metric-unit text-text-secondary">IF</span></span>
          </div>
          <Button icon="play_arrow" onClick={() => nav(`/ride?mode=${w.test === 'ramp' ? 'ftpRamp' : w.test === 'ftp20' ? 'ftp20' : 'workout'}&workout=${encodeURIComponent(w.id)}`)}>{w.test ? 'Start test' : 'Start in ERG'}</Button>
        </article>
      ))}</div>
      {!list.length && <p className="text-body-lg text-text-secondary">No workouts match these filters.</p>}
    </div>
  );
}
