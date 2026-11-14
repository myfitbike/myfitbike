// First-run setup — ported from E3 veloworld_welcome_setup. Behaviour: plan 10.4 (browser check happens at app start).
// Deviations: units fixed to metric (owner decision); the 2-minute guided spin arrives with routes (Phase 3).
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { COUNTRIES, DEFAULT_AVATAR, powerZones, effectiveFtp, type ProfileInput } from '@veloworld/shared';
import { Button, Chip, Icon, Label, TextField, cx } from '../design/primitives';
import type { IconName } from '../design/icons.generated';
import { useApp, type SlotId } from '../app/store';
import { api } from '../app/api';
import { devices } from '../devices/DeviceManager';
import { AvatarQuick } from './AvatarEditor';

const ZONE_BG = ['bg-zone-1', 'bg-zone-2', 'bg-zone-3', 'bg-zone-4', 'bg-zone-5', 'bg-zone-6', 'bg-zone-7'];
const ZONE_TX = ['text-zone-1', 'text-zone-2', 'text-zone-3', 'text-zone-4', 'text-zone-5', 'text-zone-6', 'text-zone-7'];
const ZONE_SHORT = ['Z1 Recov', 'Z2 Endure', 'Z3 Tempo', 'Z4 Thresh', 'Z5 VO2', 'Z6 Anaer', 'Z7 Sprint'];
const num = (s: string) => (s.trim() === '' ? null : Number(s));

function StepNo({ n, active }: { n: number; active: boolean }) {
  return <span className={cx('inline-flex w-7 h-7 rounded-md items-center justify-center text-body-md font-bold', active ? 'bg-accent text-on-accent' : 'bg-white/10 text-text-secondary')}>{n}</span>;
}

export function Welcome() {
  const nav = useNavigate(); const setProfile = useApp((s) => s.setProfile); const existing = useApp((s) => s.profile); const slots = useApp((s) => s.slots);
  const [step, setStep] = useState(1); const [saving, setSaving] = useState(false); const [errors, setErrors] = useState<string[]>([]);
  const [f, setF] = useState({ name: existing?.name ?? '', weight: existing ? String(existing.weightKg) : '', bike: existing ? String(existing.bikeWeightKg) : '8.5', ftp: existing?.ftpW ? String(existing.ftpW) : '', maxHr: existing?.maxHr ? String(existing.maxHr) : '', restHr: existing?.restingHr ? String(existing.restingHr) : '', unknownFtp: existing ? existing.ftpW === null : false, country: existing?.country ?? '' });
  const [avatar, setAvatar] = useState(existing?.avatar ?? DEFAULT_AVATAR); const [spin, setSpin] = useState(true);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  const weight = num(f.weight); const ftpVal = f.unknownFtp ? null : num(f.ftp);
  const ftpForZones = weight ? effectiveFtp({ ftpW: ftpVal, weightKg: weight }) : 200;
  const step1Ok = f.name.trim().length > 0 && weight !== null && weight >= 30 && weight <= 250 && Number(f.bike) >= 3;
  const step2Ok = f.unknownFtp || (ftpVal !== null && ftpVal >= 50 && ftpVal <= 700);

  async function finish() {
    setSaving(true); setErrors([]);
    const p: ProfileInput = { name: f.name.trim(), weightKg: weight!, bikeWeightKg: Number(f.bike), ftpW: ftpVal, maxHr: num(f.maxHr), restingHr: num(f.restHr), units: 'metric', setupComplete: true, avatar, country: f.country || null };
    try { setProfile(await api.saveProfile(p)); nav(spin && slots.trainer.status === 'connected' ? '/ride?mode=workout&workout=builtin-guided-spin' : '/'); }
    catch (e) { setErrors([(e as Error).message, 'Is the local API running? (pnpm dev)']); }
    finally { setSaving(false); }
  }
  const next = () => (step < 3 ? setStep(step + 1) : finish());
  const steps: [number, string][] = [[1, 'Profile'], [2, 'Fitness & zones'], [3, 'Hardware']];

  return (
    <div className="min-h-full px-10 py-10 max-w-[1440px] mx-auto">
      <div className="text-center mb-8">
        <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/6 text-label-caps uppercase tracking-[0.2em] text-on-surface-variant"><span className="w-1.5 h-1.5 rounded-full bg-accent" />First-run setup</span>
        <h1 className="font-metric text-metric-xl uppercase text-on-surface mt-4">Welcome to VeloWorld</h1>
        <p className="text-body-lg text-on-surface-variant max-w-2xl mx-auto mt-2">Set up your rider profile, training baseline and Bluetooth devices to start riding.</p>
        <div className="flex items-center justify-center gap-0 mt-8">
          {steps.map(([n, label], i) => (
            <div key={n} className="flex items-center">
              {i > 0 && <span className={cx('w-32 h-1 rounded-full', step > i ? 'bg-accent' : 'bg-white/10')} />}
              <button onClick={() => n < step && setStep(n)} className={cx('flex items-center gap-3 px-4 py-2 rounded-full uppercase tracking-wider text-body-md font-semibold', step === n ? 'border-2 border-accent text-accent shadow-accent-glow px-5 py-3' : step > n ? 'text-on-surface' : 'text-text-muted')}>
                <span className={cx('w-8 h-8 rounded-full flex items-center justify-center', step > n ? 'bg-accent text-on-accent' : step === n ? 'bg-accent text-on-accent' : 'bg-white/10')}>{step > n ? <Icon name="check" size={18} /> : n}</span>{n}. {label}
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-[400px_1fr] gap-8 items-start">
        <section className={cx('rounded-2xl p-8 backdrop-blur-xl', step === 1 ? 'bg-surface-container/90 ring-1 ring-white/16 shadow-modal' : 'bg-surface-container-low/60')}>
          <div className="flex items-center justify-between mb-6"><h2 className="flex items-center gap-3 text-headline-lg text-text"><StepNo n={1} active={step === 1} />Rider profile</h2>{step > 1 && <Chip tone="success" icon="check_circle">Saved</Chip>}</div>
          <Label className="mb-2">System units</Label>
          <div className="rounded-control bg-black/30 p-1 mb-6"><div className="rounded-md bg-accent text-on-accent text-center py-2.5 text-body-md font-semibold uppercase">Metric (km, kg)</div></div>
          <TextField label="Full name" icon="badge" value={f.name} onChange={set('name')} placeholder="Your name" className="mb-6" maxLength={60} />
          <label className="block mb-6"><Label className="mb-2">Country</Label>
            <select aria-label="Country" value={f.country} onChange={(e) => setF({ ...f, country: e.target.value })} className="w-full h-14 px-4 rounded-control bg-white/6 border border-white/12 text-text text-body-lg outline-none focus:border-accent">
              <option value="">Prefer not to say</option>{Object.entries(COUNTRIES).map(([c, n]) => <option key={c} value={c}>{n}</option>)}
            </select></label>
          <div className="grid grid-cols-2 gap-3 mb-6">
            <TextField label="Rider weight" type="number" suffix="kg" value={f.weight} onChange={set('weight')} min={30} max={250} step={0.1} placeholder="—" />
            <TextField label="Bike weight" type="number" suffix="kg" value={f.bike} onChange={set('bike')} min={3} max={40} step={0.1} />
          </div>
          <AvatarQuick value={avatar} onChange={setAvatar} />
          {weight !== null && <div className="mt-6 rounded-lg bg-black/25 px-4 py-3 flex gap-3 items-center"><Icon name="directions_bike" className="text-accent" /><div className="text-body-md"><div className="text-text font-semibold">Combined rolling mass {(weight + Number(f.bike || 0)).toFixed(1)} kg</div><div className="text-text-secondary text-[12px]">Used by the physics for climbing and acceleration</div></div></div>}
        </section>

        <section className={cx('rounded-2xl p-8 backdrop-blur-xl', step === 2 ? 'bg-surface-container/90 ring-1 ring-white/16 shadow-modal' : 'bg-surface-container-low/60')}>
          <div className="flex items-start justify-between mb-6">
            <div><h2 className="flex items-center gap-3 text-headline-lg text-text"><StepNo n={2} active={step === 2} />Fitness baseline & heart rate</h2><Label className="mt-1 ml-10">Sets ERG workout zones and pacing</Label></div>
            {step === 2 && <Chip tone="accent">Active</Chip>}
          </div>
          <div className="grid grid-cols-[1.1fr_1fr_1fr] gap-4 mb-6">
            <div className="rounded-xl bg-black/30 p-5 flex flex-col">
              <div className="flex justify-between"><Label className="text-accent">Functional threshold power</Label><Icon name="bolt" className="text-accent" /></div>
              <div className="flex items-baseline gap-2 mt-3"><input aria-label="FTP in watts" type="number" disabled={f.unknownFtp} value={f.unknownFtp ? '' : f.ftp} onChange={set('ftp')} placeholder={f.unknownFtp ? String(ftpForZones) : '—'} className="w-36 bg-transparent font-metric-live text-metric-hero text-text outline-none disabled:text-text-muted" /><span className="text-metric-unit text-text-secondary">WATTS</span></div>
              {weight && <div className="text-body-md mt-2"><span className="text-status-success font-semibold">{(ftpForZones / weight).toFixed(2)} W/KG</span> <span className="text-text-secondary">{f.unknownFtp ? 'placeholder (2.5 W/kg)' : ''}</span></div>}
              <label className="mt-4 flex items-center gap-2 text-body-md text-accent font-semibold cursor-pointer"><input type="checkbox" checked={f.unknownFtp} onChange={(e) => setF({ ...f, unknownFtp: e.target.checked })} className="accent-accent" />I don't know — schedule a ramp test</label>
            </div>
            <div className="rounded-xl bg-black/30 p-5"><div className="flex justify-between"><Label>Max heart rate</Label><Icon name="favorite" className="text-status-danger" /></div>
              <div className="flex items-baseline gap-2 mt-4"><input aria-label="max heart rate" type="number" value={f.maxHr} onChange={set('maxHr')} placeholder="—" className="w-24 bg-transparent font-metric-live text-metric-xl text-text outline-none" /><span className="text-metric-unit text-text-secondary">BPM</span></div><div className="text-[12px] text-text-secondary mt-3">Optional — enables HR zones</div></div>
            <div className="rounded-xl bg-black/30 p-5"><div className="flex justify-between"><Label>Resting heart rate</Label><Icon name="monitor_heart" className="text-secondary" /></div>
              <div className="flex items-baseline gap-2 mt-4"><input aria-label="resting heart rate" type="number" value={f.restHr} onChange={set('restHr')} placeholder="—" className="w-24 bg-transparent font-metric-live text-metric-xl text-text outline-none" /><span className="text-metric-unit text-text-secondary">BPM</span></div><div className="text-[12px] text-text-secondary mt-3">Optional</div></div>
          </div>
          <div className="rounded-xl bg-black/30 p-5">
            <div className="flex justify-between mb-4"><span className="flex items-center gap-2 text-body-md font-bold uppercase tracking-wider text-text"><Icon name="tune" className="text-accent" />Coggan 7-zone power</span><span className="text-[12px] text-text-secondary">Relative to {ftpForZones} W FTP</span></div>
            <div className="grid grid-cols-7 gap-3">{powerZones(ftpForZones).map((z, i) => (
              <div key={z.zone}><div className={cx('h-1.5 rounded-full mb-2', ZONE_BG[i])} /><div className={cx('text-[12px] font-bold uppercase', i === 3 ? ZONE_TX[3] : 'text-text-secondary')}>{ZONE_SHORT[i]}</div><div className="font-metric-live text-[16px] text-text">{z.hi === null ? `${z.lo}W+` : i === 0 ? `< ${z.hi}W` : `${z.lo}-${z.hi}W`}</div></div>
            ))}</div>
          </div>
        </section>
      </div>

      <section className={cx('rounded-2xl p-8 mt-8 backdrop-blur-xl', step === 3 ? 'bg-surface-container/90 ring-1 ring-white/16 shadow-modal' : 'bg-surface-container-low/60')}>
        <div className="flex items-start justify-between mb-6">
          <div><h2 className="flex items-center gap-3 text-headline-lg text-text"><StepNo n={3} active={step === 3} />Quick connect hardware</h2><Label className="mt-1 ml-10">Bluetooth trainer and sensors</Label></div>
          <Button size="sm" icon="cell_tower" onClick={() => devices.useSimulator()}>Use demo trainer</Button>
        </div>
        <div className="grid grid-cols-4 gap-4">
          <QuickTile id="trainer" icon="speed" title="Trainer control" onClick={() => devices.connectTrainer()} />
          <QuickTile id="power" icon="bolt" title="Power source" />
          <QuickTile id="cadence" icon="sync" title="Cadence sensor" onClick={() => devices.connectCadence()} />
          <QuickTile id="heartRate" icon="favorite" title="Chest strap" onClick={() => devices.connectHeartRate()} />
        </div>
        <p className="mt-6 text-body-md text-text-secondary flex items-center gap-2"><Icon name="info" size={18} />You can pair or change devices any time in <b className="text-text">Sensors</b>. Hardware is optional for setup.</p>
        <label className="mt-4 flex items-center gap-3 text-body-md text-text"><input type="checkbox" checked={spin} onChange={(e) => setSpin(e.target.checked)} className="accent-accent" />After setup, take a 2-minute guided spin to check that resistance control works (needs a connected trainer)</label>
      </section>

      <div className="mt-8 rounded-2xl bg-surface-container-high/60 backdrop-blur-xl px-6 py-5 flex items-center justify-between">
        <div className="flex items-center gap-4"><span className="w-12 h-12 rounded-full bg-white/8 flex items-center justify-center"><Icon name="flag" /></span>
          <div><div className="text-body-md font-bold uppercase text-text">Step {step} of 3 <span className="text-accent">· {step === 3 ? 'Ready to ride' : 'Almost ready'}</span></div><div className="text-body-lg text-text-secondary">{errors.length ? <span className="text-status-danger">{errors.join(' — ')}</span> : 'Preferences apply immediately to your first ride.'}</div></div></div>
        <div className="flex gap-3">
          {step > 1 && <Button onClick={() => setStep(step - 1)}>Back</Button>}
          <Button variant="primary" size="lg" iconRight="arrow_forward" disabled={saving || (step === 1 && !step1Ok) || (step >= 2 && !step2Ok) || !step1Ok} onClick={next}>{step === 3 ? (saving ? 'Saving…' : 'Finish setup') : step === 1 ? 'Next: fitness & zones' : 'Next: hardware'}</Button>
        </div>
      </div>
      <p className="sr-only">{slots.trainer.status}</p>
    </div>
  );
}

function QuickTile({ id, icon, title, onClick }: { id: SlotId; icon: IconName; title: string; onClick?: () => Promise<void> }) {
  const s = useApp((st) => st.slots[id]); const [err, setErr] = useState<string | null>(null); const ok = s.status === 'connected'; const busy = s.status === 'searching' || s.status === 'connecting';
  return (
    <button disabled={!onClick || ok || busy} onClick={() => onClick?.().catch((e: Error) => setErr(e.message))} className={cx('text-left rounded-xl p-5 bg-black/25 transition-colors', busy && 'ring-1 ring-accent/60', onClick && !ok && 'hover:bg-black/35')}>
      <div className="flex items-start justify-between"><div className="flex gap-3 items-center"><span className="w-11 h-11 rounded-lg bg-white/8 flex items-center justify-center text-text-secondary"><Icon name={icon} size={22} /></span>
        <div><Label className={busy ? 'text-accent' : ''}>{title}</Label><div className="text-body-lg font-semibold text-text">{s.name ?? (onClick ? 'Click to search' : 'From trainer')}</div></div></div>
        {ok ? <Icon name="check_circle" className="text-status-success" /> : busy ? <Icon name="progress_activity" className="text-accent animate-spin" /> : null}</div>
      <div className="mt-4 pt-3 border-t border-white/8 text-[12px] flex justify-between"><span className={ok ? 'text-status-success' : err ? 'text-status-danger' : 'text-text-secondary'}>{err ?? (ok ? `Connected${s.detail ? ` · ${s.detail}` : ''}` : busy ? 'Searching for signal…' : 'Not connected')}</span></div>
    </button>
  );
}
