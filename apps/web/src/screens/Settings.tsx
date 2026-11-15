// Settings — layout from E1 veloworld_settings_trainer_graphics (section list + glass cards).
// Deviation: the export shows a text sidebar; we keep the icon rail used by every other design (consistency).
import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, Navigate, Route, Routes, useNavigate } from 'react-router';
import { COUNTRIES, DEFAULT_SETTINGS, unitLabels, weightOf, weightToKg, type Avatar, type ProfileInput, type SettingKey, type Units } from '@myfitbike/shared';
import { Button, Chip, Icon, Label, TextField, Toggle, cx } from '../design/primitives';
import type { IconName } from '../design/icons.generated';
import { useApp, useUnits } from '../app/store';
import { api } from '../app/api';
import { AvatarEditor } from './AvatarEditor';
import { Connections } from './Connections';
import { RadioSettings } from './RadioSettings';
import { TvSettings } from './TvSettings';
import { authEnabled, signOut, useAuth } from '../app/auth';
import { cheer, chime, countdown, setVolumes } from '../hud/audio';
import attributions from '../../../../content/ATTRIBUTIONS.md?raw';

const SECTIONS: { path: string; label: string; icon: IconName; badge?: string; phase?: number }[] = [
  { path: 'profile', label: 'Profile', icon: 'person' }, { path: 'units', label: 'Units', icon: 'tune', badge: 'Metric' },
  { path: 'trainer', label: 'Trainer', icon: 'speed' }, { path: 'hud', label: 'HUD', icon: 'visibility' },
  { path: 'graphics', label: 'Graphics', icon: 'landscape' }, { path: 'audio', label: 'Audio', icon: 'sensors' },
  { path: 'radio', label: 'Radio', icon: 'radio' }, { path: 'tv', label: 'TV', icon: 'live_tv' }, { path: 'downloads', label: 'Downloads', icon: 'download' }, { path: 'connections', label: 'Connections', icon: 'hub' },
  { path: 'about', label: 'About', icon: 'info', badge: 'v0.1' },
];

function useSettings() {
  const [s, setS] = useState<Record<string, unknown>>(DEFAULT_SETTINGS);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { api.getSettings().then((v) => v && setS(v)).catch((e: Error) => setErr(e.message)); }, []);
  const save = (k: SettingKey, v: unknown) => { setS((o) => ({ ...o, [k]: v })); api.saveSetting(k, v).catch((e: Error) => setErr(`Could not save ${k}: ${e.message}`)); };
  return { s, save, err };
}

function Panel({ title, eyebrow, children, badge }: { title: string; eyebrow?: string; children: ReactNode; badge?: ReactNode }) {
  return <section className="rounded-2xl bg-surface-container-low/70 backdrop-blur-xl p-8 shadow-ambient"><div className="flex items-start justify-between mb-6"><div>{eyebrow && <Label className="text-accent mb-1">{eyebrow}</Label>}<h2 className="text-headline-lg text-text uppercase">{title}</h2></div>{badge}</div><div className="space-y-5">{children}</div></section>;
}
function Row({ title, sub, children, desc }: { title: string; sub?: string; desc?: string; children: ReactNode }) {
  return <div className="rounded-xl bg-black/25 p-5"><div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 sm:gap-6"><div><div className="text-body-lg font-semibold text-text">{title}</div>{sub && <Label className="mt-0.5">{sub}</Label>}{desc && <p className="text-body-md text-on-surface-variant mt-2 max-w-md">{desc}</p>}</div><div className="sm:shrink-0 max-w-full">{children}</div></div></div>;
}
function Slider({ value, min, max, step = 1, onChange, unit, marks, label }: { value: number; min: number; max: number; step?: number; onChange: (v: number) => void; unit: string; marks?: string[]; label: string }) {
  return (
    <div className="w-full sm:w-80">
      <div className="text-right mb-2"><span className="font-metric-live text-metric-md text-accent">{value}</span> <span className="text-metric-unit text-text-secondary">{unit}</span></div>
      <input aria-label={label} type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-accent" />
      {marks && <div className="flex justify-between text-[11px] text-text-secondary mt-1">{marks.map((m) => <span key={m}>{m}</span>)}</div>}
    </div>
  );
}
function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: [T, string][]; onChange: (v: T) => void; label: string }) {
  return <div role="radiogroup" aria-label={label} className="inline-flex flex-wrap max-w-full rounded-control bg-black/30 p-1">{options.map(([v, l]) => <button key={v} role="radio" aria-checked={value === v} onClick={() => onChange(v)} className={cx('px-4 py-2 rounded-md text-body-md font-semibold', value === v ? 'bg-accent text-on-accent' : 'text-text-secondary hover:text-text')}>{l}</button>)}</div>;
}

/** Display units only: rides, physics, Strava and FIT files stay metric. */
function UnitsSettings() {
  const profile = useApp((s) => s.profile); const setProfile = useApp((s) => s.setProfile); const [err, setErr] = useState<string | null>(null);
  if (!profile) return null;
  const change = async (units: Units) => { try { const { id: _id, ...input } = profile; setProfile(await api.saveProfile({ ...input, units })); setErr(null); } catch (e) { setErr((e as Error).message); } };
  return <Panel title="Units">{err && <Chip tone="danger">{err}</Chip>}
    <Row title="Measurement system" desc={profile.units === 'imperial' ? 'Miles, pounds, mph, feet. Rides are still saved and uploaded in metric.' : 'Kilometres, kilograms, km/h, metres.'}>
      <Segmented label="Measurement system" value={profile.units} options={[['metric', 'Metric (km, kg)'], ['imperial', 'Imperial (mi, lb)']]} onChange={(v) => void change(v)} /></Row></Panel>;
}

function ProfileSettings() {
  const nav = useNavigate();
  const profile = useApp((s) => s.profile); const setProfile = useApp((s) => s.setProfile);
  const [p, setP] = useState(profile && !profile.setupComplete && profile.name === 'Rider' ? { ...profile, name: '' } : profile); const [msg, setMsg] = useState<string | null>(null); // the default "Rider" is a placeholder
  // weights are typed in the rider's units and stored in kg
  const u = profile?.units ?? 'metric'; const disp = (kg: number) => String(+weightOf(kg, u).toFixed(1));
  const [w, setW] = useState(() => (profile ? disp(profile.weightKg) : '')); const [bw, setBw] = useState(() => (profile ? disp(profile.bikeWeightKg) : ''));
  if (!p) return null;
  const save = async () => { try { const { id: _id, ...input } = p; setProfile(await api.saveProfile({ ...input, name: input.name.trim() || 'Rider', setupComplete: true /* saving here confirms the profile (PLAN 16.21) */, weightKg: +weightToKg(Number(w), u).toFixed(1), bikeWeightKg: +weightToKg(Number(bw), u).toFixed(1) } as ProfileInput)); setMsg('Saved'); } catch (e) { setMsg((e as Error).message); } };
  const n = (v: string) => (v === '' ? null : Number(v));
  return (
    <div className="space-y-6">
      <Panel title="Rider profile" eyebrow="You" badge={<Button variant="primary" onClick={save}>Save</Button>}>
        {msg && <Chip tone={msg === 'Saved' ? 'success' : 'danger'}>{msg}</Chip>}
        {!profile?.setupComplete && <div className="rounded-xl bg-accent/10 border border-accent/30 p-4 mb-4 flex items-center justify-between gap-4"><div className="text-body-md"><div className="text-text font-semibold">These are starting estimates</div><div className="text-text-secondary">Put in your name, weight and FTP (if you know it), then press Save. Workouts and climbing speed use these.</div></div>
          <Button onClick={() => nav('/welcome')}>Guided setup</Button></div>}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <TextField label="Name" value={p.name} placeholder="Your name" onChange={(e) => setP({ ...p, name: e.target.value })} />
          <TextField label="Weight" type="number" suffix={unitLabels(u).weight} value={w} onChange={(e) => setW(e.target.value)} />
          <TextField label="Bike weight" type="number" suffix={unitLabels(u).weight} value={bw} onChange={(e) => setBw(e.target.value)} />
          <TextField label="FTP" type="number" suffix="W" value={p.ftpW ?? ''} placeholder="ramp test" onChange={(e) => setP({ ...p, ftpW: n(e.target.value) })} />
          <TextField label="Max heart rate" type="number" suffix="bpm" value={p.maxHr ?? ''} onChange={(e) => setP({ ...p, maxHr: n(e.target.value) })} />
          <label className="block"><Label className="mb-2">Country</Label><select aria-label="Country" value={p.country ?? ''} onChange={(e) => setP({ ...p, country: e.target.value || null })} className="w-full h-14 px-4 rounded-control bg-white/6 border border-white/12 text-text text-body-lg outline-none focus:border-accent"><option value="">Prefer not to say</option>{Object.entries(COUNTRIES).map(([c, n]) => <option key={c} value={c}>{n}</option>)}</select></label>
          <TextField label="Resting heart rate" type="number" suffix="bpm" value={p.restingHr ?? ''} onChange={(e) => setP({ ...p, restingHr: n(e.target.value) })} />
        </div>
      </Panel>
      <Panel title="Your rider" eyebrow="Look" badge={<Button variant="primary" onClick={save}>Save</Button>}><AvatarEditor value={p.avatar} onChange={(avatar: Avatar) => setP({ ...p, avatar })} /></Panel>
    </div>
  );
}

function TrainerSettings() {
  const { s, save, err } = useSettings();
  return (
    <Panel title="Trainer & ERG" eyebrow="Control" badge={<Chip tone="connected">Bluetooth FTMS</Chip>}>
      {err && <Chip tone="danger">{err}</Chip>}
      <Row title="Trainer difficulty — uphill" sub="Gradient scaling" desc="Scales the gradient sent to the trainer. Your speed always uses the true gradient."><Slider label="uphill difficulty" value={s['trainer.difficultyUpPct'] as number} min={0} max={100} step={5} unit="%" marks={['0 % flat', '100 % true road']} onChange={(v) => save('trainer.difficultyUpPct', v)} /></Row>
      <Row title="Trainer difficulty — downhill" sub="Descents" desc="Lower keeps the pedals turning smoothly on descents."><Slider label="downhill difficulty" value={s['trainer.difficultyDownPct'] as number} min={0} max={100} step={5} unit="%" marks={['0 % free spin', '100 %']} onChange={(v) => save('trainer.difficultyDownPct', v)} /></Row>
      <Row title="Auto-pause delay" sub="When you stop pedalling" desc="The ride pauses after this long without pedalling and resumes on your first pedal stroke."><Slider label="auto-pause delay" value={s['ride.autoPauseDelayS'] as number} min={1} max={10} unit="s" onChange={(v) => save('ride.autoPauseDelayS', v)} /></Row>
      <Row title="Power display averaging" desc="Smooths the power number on screen. Recording and physics always use raw power."><Segmented label="power averaging" value={s['display.powerAveraging'] as '3s' | '1s' | '0s'} options={[['3s', '3 s (recommended)'], ['1s', '1 s'], ['0s', 'Instant']]} onChange={(v) => save('display.powerAveraging', v)} /></Row>
      <Row title="Weekly goal" desc="Hours per week, shown as the ring in the top bar."><Slider label="Weekly goal" value={Number(s['goal.weeklyHours'] ?? 5)} min={1} max={20} unit="h" onChange={(v) => save('goal.weeklyHours', v)} /></Row>
      <Row title="Release ERG at low cadence" desc="Below 40 rpm for 3 s the target is released so you can restart after stalling, then ramps back over 3 s. Always on."><Chip tone="success" icon="check">On</Chip></Row>
      <Row title="Calibration" desc="Spin-down runs from the Sensors screen when your trainer supports it; otherwise use the Tacx Utility app."><Chip>Sensors → Calibrate</Chip></Row>
    </Panel>
  );
}

function HudSettings() {
  const { s, save } = useSettings();
  return (
    <Panel title="HUD" eyebrow="In ride">
      <Row title="Layout preset" desc="Start from a preset; the layout editor arrives in Phase 5."><Segmented label="HUD preset" value={s['hud.preset'] as 'broadcast' | 'cockpit' | 'focus'} options={[['broadcast', 'Broadcast'], ['cockpit', 'Cockpit'], ['focus', 'Focus']]} onChange={(v) => save('hud.preset', v)} /></Row>
      <Row title="HUD size" desc="Scales every HUD widget together, including the profile strip."><Segmented label="HUD size" value={s['hud.size'] as 'small' | 'medium' | 'large'} options={[['small', 'Small'], ['medium', 'Medium'], ['large', 'Large']]} onChange={(v) => save('hud.size', v)} /></Row>
      <Row title="Terrain profile strip" desc="The gradient-coloured route profile with your position, shown in every ride view."><Toggle label="Terrain profile strip" tone="accent" checked={s['hud.profileStrip'] as boolean} onChange={(v) => save('hud.profileStrip', v)} /></Row>
      <WidgetEditor value={s['hud.widgets'] as Record<string, string[]> | null} onChange={(v) => save('hud.widgets', v)} />
    </Panel>
  );
}

// Layout editor (plan 10.5 J): per-preset widget toggles with a live schematic preview.
const WIDGETS: [string, string][] = [['power', 'Power pod (power, zone bar, speed, HR, cadence)'], ['profile', 'Terrain / workout profile strip'], ['steps', 'Workout step list'], ['road', 'On the road (ghosts, pacers)'], ['climb', 'Climb card and segment timer'], ['next2km', 'Next 2 km gradient close-up'], ['minimap', 'Minimap']];
const DEFAULT_ON = ['power', 'profile', 'steps', 'road', 'climb', 'next2km'];
function WidgetEditor({ value, onChange }: { value: Record<string, string[]> | null; onChange: (v: Record<string, string[]>) => void }) {
  const [preset, setPreset] = useState<'broadcast' | 'cockpit' | 'focus'>('broadcast'); const cur = value?.[preset] ?? DEFAULT_ON;
  const toggle = (w: string) => onChange({ ...(value ?? {}), [preset]: cur.includes(w) ? cur.filter((x) => x !== w) : [...cur, w] });
  const box = (w: string, cls: string, label: string) => cur.includes(w) && <div className={cx('absolute rounded bg-accent/30 border border-accent/60 text-[9px] text-text p-1', cls)}>{label}</div>;
  return (
    <div className="rounded-xl bg-black/25 p-5 grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
      <div><div className="flex justify-between mb-3"><div className="text-body-lg font-semibold text-text">Widgets</div><Segmented label="Preset to edit" value={preset} options={[['broadcast', 'Broadcast'], ['cockpit', 'Cockpit'], ['focus', 'Focus']]} onChange={setPreset} /></div>
        <div className="space-y-2">{WIDGETS.map(([id, l]) => <label key={id} className="flex items-center justify-between text-body-md text-text">{l}<Toggle label={l} checked={cur.includes(id)} onChange={() => toggle(id)} /></label>)}</div></div>
      <div className="relative aspect-video rounded-lg bg-gradient-to-b from-canvas-top to-canvas-bottom border border-white/10" aria-label="Layout preview">
        {box('steps', 'left-2 top-2 w-20 h-14', 'Steps')}{box('road', 'left-2 top-[4.2rem] w-20 h-10', 'On the road')}{box('climb', 'left-24 top-2 w-20 h-10', 'Climb')}{box('minimap', 'right-2 top-2 w-16 h-12', 'Map')}
        {box('power', 'left-2 bottom-2 w-24 h-16', 'Power')}{box('profile', 'left-28 right-2 bottom-2 h-10', 'Profile')}{box('next2km', 'right-2 bottom-14 w-24 h-8', 'Next 2 km')}
      </div>
    </div>
  );
}

function AudioSettings() {
  const { s, save } = useSettings(); const ui = Number(s['audio.interface'] ?? 70), world = Number(s['audio.world'] ?? 60);
  useEffect(() => setVolumes(ui, world), [ui, world]);
  return (
    <Panel title="Audio" eyebrow="Sound">
      <Row title="Interface volume" desc="Interval countdown beeps and star chimes."><div className="flex items-center gap-3"><Slider label="Interface volume" value={ui} min={0} max={100} step={5} unit="%" onChange={(v) => save('audio.interface', v)} /><Button size="sm" onClick={() => countdown()}>Test</Button><Button size="sm" onClick={() => chime()}>★</Button></div></Row>
      <Row title="World volume" desc="Crowds cheering at checkpoints."><div className="flex items-center gap-3"><Slider label="World volume" value={world} min={0} max={100} step={5} unit="%" onChange={(v) => save('audio.world', v)} /><Button size="sm" onClick={() => cheer()}>Test</Button></div></Row>
    </Panel>
  );
}

// Downloads manager (plan 10.5 J): region packs cached in the browser (Cache API); delete frees space. The app ships them,
// so "download" here means "keep offline".
function DownloadsSettings() {
  const [packs, setPacks] = useState<{ id: string; bytes: number; cached: boolean }[]>([]); const [busy, setBusy] = useState<string | null>(null);
  const load = async () => {
    const m = await fetch('/world/velora/manifest.json').then((r) => r.json()); const c = await caches.open('velora-world'); const keys = new Set((await c.keys()).map((k) => new URL(k.url).pathname));
    setPacks(await Promise.all((m.packs as string[]).filter((p) => p !== 'sea').map(async (id) => { const url = `/world/velora/scenery-${id}.json`; const h = await fetch(url, { method: 'HEAD' }); return { id, bytes: Number(h.headers.get('content-length') ?? 0), cached: keys.has(url) }; })));
  };
  useEffect(() => { void load(); }, []);
  const keep = async (id: string) => { setBusy(id); const c = await caches.open('velora-world'); await c.addAll([`/world/velora/scenery-${id}.json`, '/world/velora/manifest.json', '/world/velora/scenery-common.json', '/world/velora/far.f32']); setBusy(null); void load(); };
  const drop = async (id: string) => { const c = await caches.open('velora-world'); await c.delete(`/world/velora/scenery-${id}.json`); void load(); };
  return (
    <Panel title="Downloads" eyebrow="Offline world packs">
      <p className="text-body-md text-text-secondary">Velora ships with the app. Packs you keep here stay available with no network; terrain chunks are cached automatically as you ride.</p>
      <div className="divide-y divide-white/6">{packs.map((p) => <div key={p.id} className="flex items-center justify-between py-3 text-body-md"><span className="text-text capitalize">{p.id.replace('-', ' ')}</span><span className="text-text-secondary">{(p.bytes / 1e6).toFixed(1)} MB</span>
        {p.cached ? <span className="flex items-center gap-2"><Chip tone="success">Kept offline</Chip><Button size="sm" variant="danger" icon="delete" onClick={() => void drop(p.id)}>Delete</Button></span> : <Button size="sm" icon="download" disabled={busy === p.id} onClick={() => void keep(p.id)}>{busy === p.id ? 'Saving…' : 'Keep offline'}</Button>}</div>)}</div>
    </Panel>
  );
}

function GraphicsSettings() {
  const { s, save } = useSettings();
  return (
    <Panel title="Graphics" eyebrow="3D world">
      <Row title="Quality preset" desc="Resolution scale, shadows, haze and view distance. Dynamic resolution also steps down automatically if frames take longer than 18 ms for 2 s."><Segmented label="Quality preset" value={s['graphics.quality'] as 'low' | 'medium' | 'high' | 'ultra'} options={[['low', 'Low'], ['medium', 'Medium'], ['high', 'High'], ['ultra', 'Ultra']]} onChange={(v) => save('graphics.quality', v)} /></Row>
      <Row title="Default camera" desc="Keys 1–6 during a ride: chase, close chase, first person, side, helicopter, top-down."><Segmented label="Default camera" value={String(s['graphics.camera'] ?? 1) as '1'} options={[['1', 'Chase'], ['2', 'Close'], ['3', 'First person'], ['4', 'Side'], ['5', 'Heli'], ['6', 'Top']]} onChange={(v) => save('graphics.camera', Number(v))} /></Row>
      <Row title="Frame-time readout" desc="Press F during a ride to show fps, frame time, draw calls and triangles."><Chip>F key</Chip></Row>
    </Panel>
  );
}

function Later({ title, phase }: { title: string; phase: number }) { return <Panel title={title}><p className="text-body-lg text-text-secondary">Arrives in phase {phase}.</p></Panel>; }

/** Which account is signed in, and the way out (only when accounts are on, PLAN 17.2). */
function AccountBox() {
  const { session } = useAuth(); if (!authEnabled || !session) return null;
  return <div className="mt-4 lg:mt-8 rounded-xl bg-black/25 p-4 space-y-2"><Label>Signed in as</Label><div className="text-body-md text-text truncate" title={session.user.email ?? ''}>{session.user.email}</div>
    <Button size="sm" icon="logout" onClick={() => void signOut()}>Sign out</Button></div>;
}

export function Settings() {
  const units = useUnits();
  return (
    <div className="px-4 md:px-10 py-6 md:py-8 grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-8 max-w-[1440px] mx-auto">
      <nav aria-label="Settings sections">
        <Label className="text-accent mb-1 flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-accent" />Configuration</Label>
        <h1 className="text-headline-lg text-text mb-3 lg:mb-6">Settings</h1>
        <div className="flex lg:block gap-1 overflow-x-auto lg:overflow-visible lg:space-y-1 -mx-4 px-4 lg:mx-0 lg:px-0 pb-1">{SECTIONS.map((sec) => (
          <NavLink key={sec.path} to={`/settings/${sec.path}`} className={({ isActive }) => cx('flex shrink-0 items-center gap-3 px-3 py-2.5 rounded-lg text-body-lg whitespace-nowrap', isActive ? 'bg-white/10 text-text' : 'text-on-surface-variant hover:bg-white/5 hover:text-text')}>
            <Icon name={sec.icon} size={20} />{sec.label}<span className="hidden lg:inline ml-auto text-[10px] font-semibold uppercase text-text-muted">{sec.path === 'units' ? (units === 'imperial' ? 'Imperial' : 'Metric') : sec.badge ?? (sec.phase ? `phase ${sec.phase}` : '')}</span>
          </NavLink>))}</div>
        <AccountBox />
      </nav>
      <div>
        <Routes>
          <Route index element={<Navigate to="profile" replace />} />
          <Route path="profile" element={<ProfileSettings />} />
          <Route path="units" element={<UnitsSettings />} />
          <Route path="trainer" element={<TrainerSettings />} />
          <Route path="hud" element={<HudSettings />} />
          <Route path="graphics" element={<GraphicsSettings />} />
          <Route path="audio" element={<AudioSettings />} />
          <Route path="downloads" element={<DownloadsSettings />} />
          <Route path="connections" element={<Connections />} />
          <Route path="radio" element={<RadioSettings />} />
          <Route path="tv" element={<TvSettings />} />
          <Route path="about" element={<Panel title="About MyFitBike" eyebrow="Open source · MIT (pending owner confirmation)"><pre className="whitespace-pre-wrap break-words text-body-md text-on-surface-variant font-sans">{attributions}</pre></Panel>} />
        </Routes>
      </div>
    </div>
  );
}
