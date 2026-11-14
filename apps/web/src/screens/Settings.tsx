// Settings — layout from E1 veloworld_settings_trainer_graphics (section list + glass cards).
// Deviation: the export shows a text sidebar; we keep the icon rail used by every other design (consistency).
import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, Navigate, Route, Routes } from 'react-router';
import { COUNTRIES, DEFAULT_SETTINGS, type Avatar, type ProfileInput, type SettingKey } from '@veloworld/shared';
import { Button, Chip, Icon, Label, TextField, Toggle, cx } from '../design/primitives';
import type { IconName } from '../design/icons.generated';
import { useApp } from '../app/store';
import { api } from '../app/api';
import { AvatarEditor } from './AvatarEditor';
import { Connections } from './Connections';
import attributions from '../../../../content/ATTRIBUTIONS.md?raw';

const SECTIONS: { path: string; label: string; icon: IconName; badge?: string; phase?: number }[] = [
  { path: 'profile', label: 'Profile', icon: 'person' }, { path: 'units', label: 'Units', icon: 'tune', badge: 'Metric' },
  { path: 'trainer', label: 'Trainer', icon: 'speed' }, { path: 'hud', label: 'HUD', icon: 'visibility' },
  { path: 'graphics', label: 'Graphics', icon: 'landscape', phase: 4 }, { path: 'audio', label: 'Audio', icon: 'sensors', phase: 5 },
  { path: 'downloads', label: 'Downloads', icon: 'download', phase: 5 }, { path: 'connections', label: 'Connections', icon: 'hub' },
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
  return <div className="rounded-xl bg-black/25 p-5"><div className="flex items-start justify-between gap-6"><div><div className="text-body-lg font-semibold text-text">{title}</div>{sub && <Label className="mt-0.5">{sub}</Label>}{desc && <p className="text-body-md text-on-surface-variant mt-2 max-w-md">{desc}</p>}</div><div className="shrink-0">{children}</div></div></div>;
}
function Slider({ value, min, max, step = 1, onChange, unit, marks, label }: { value: number; min: number; max: number; step?: number; onChange: (v: number) => void; unit: string; marks?: string[]; label: string }) {
  return (
    <div className="w-80">
      <div className="text-right mb-2"><span className="font-metric-live text-metric-md text-accent">{value}</span> <span className="text-metric-unit text-text-secondary">{unit}</span></div>
      <input aria-label={label} type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-accent" />
      {marks && <div className="flex justify-between text-[11px] text-text-secondary mt-1">{marks.map((m) => <span key={m}>{m}</span>)}</div>}
    </div>
  );
}
function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: [T, string][]; onChange: (v: T) => void; label: string }) {
  return <div role="radiogroup" aria-label={label} className="inline-flex rounded-control bg-black/30 p-1">{options.map(([v, l]) => <button key={v} role="radio" aria-checked={value === v} onClick={() => onChange(v)} className={cx('px-4 py-2 rounded-md text-body-md font-semibold', value === v ? 'bg-accent text-on-accent' : 'text-text-secondary hover:text-text')}>{l}</button>)}</div>;
}

function ProfileSettings() {
  const profile = useApp((s) => s.profile); const setProfile = useApp((s) => s.setProfile);
  const [p, setP] = useState(profile); const [msg, setMsg] = useState<string | null>(null);
  if (!p) return null;
  const save = async () => { try { const { id: _id, ...input } = p; setProfile(await api.saveProfile(input as ProfileInput)); setMsg('Saved'); } catch (e) { setMsg((e as Error).message); } };
  const n = (v: string) => (v === '' ? null : Number(v));
  return (
    <div className="space-y-6">
      <Panel title="Rider profile" eyebrow="You" badge={<Button variant="primary" onClick={save}>Save</Button>}>
        {msg && <Chip tone={msg === 'Saved' ? 'success' : 'danger'}>{msg}</Chip>}
        <div className="grid grid-cols-3 gap-4">
          <TextField label="Name" value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} />
          <TextField label="Weight" type="number" suffix="kg" value={p.weightKg} onChange={(e) => setP({ ...p, weightKg: Number(e.target.value) })} />
          <TextField label="Bike weight" type="number" suffix="kg" value={p.bikeWeightKg} onChange={(e) => setP({ ...p, bikeWeightKg: Number(e.target.value) })} />
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
    </Panel>
  );
}

function Later({ title, phase }: { title: string; phase: number }) { return <Panel title={title}><p className="text-body-lg text-text-secondary">Arrives in phase {phase}.</p></Panel>; }

export function Settings() {
  return (
    <div className="px-10 py-8 grid grid-cols-[240px_1fr] gap-8 max-w-[1440px] mx-auto">
      <nav aria-label="Settings sections">
        <Label className="text-accent mb-1 flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-accent" />Configuration</Label>
        <h1 className="text-headline-lg text-text mb-6">Settings</h1>
        <div className="space-y-1">{SECTIONS.map((sec) => (
          <NavLink key={sec.path} to={sec.path} className={({ isActive }) => cx('flex items-center gap-3 px-3 py-2.5 rounded-lg text-body-lg', isActive ? 'bg-white/10 text-text' : 'text-on-surface-variant hover:bg-white/5 hover:text-text')}>
            <Icon name={sec.icon} size={20} />{sec.label}<span className="ml-auto text-[10px] font-semibold uppercase text-text-muted">{sec.badge ?? (sec.phase ? `phase ${sec.phase}` : '')}</span>
          </NavLink>))}</div>
      </nav>
      <div>
        <Routes>
          <Route index element={<Navigate to="profile" replace />} />
          <Route path="profile" element={<ProfileSettings />} />
          <Route path="units" element={<Panel title="Units"><Row title="Measurement system" desc="Kilometres, kilograms, km/h, metres, W/kg."><Chip tone="accent">Metric</Chip></Row></Panel>} />
          <Route path="trainer" element={<TrainerSettings />} />
          <Route path="hud" element={<HudSettings />} />
          <Route path="graphics" element={<Later title="Graphics" phase={4} />} />
          <Route path="audio" element={<Later title="Audio" phase={5} />} />
          <Route path="downloads" element={<Later title="Downloads" phase={5} />} />
          <Route path="connections" element={<Connections />} />
          <Route path="about" element={<Panel title="About VeloWorld" eyebrow="Open source · MIT (pending owner confirmation)"><pre className="whitespace-pre-wrap text-body-md text-on-surface-variant font-sans">{attributions}</pre></Panel>} />
        </Routes>
      </div>
    </div>
  );
}
