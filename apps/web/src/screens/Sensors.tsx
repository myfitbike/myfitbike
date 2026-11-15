// Sensors / pairing — ported from E3 veloworld_sensors. Behaviour from plan 5.1, 5.8, 10.5 F.
// Deviations (appearance only): ANT+ panel replaced by Bluetooth status (app is Bluetooth-only).
import { effectiveFtp, speedOf, unitLabels, zoneOf } from '@myfitbike/shared';
import { type SlotId, type SlotState, unitsNow, useApp, useUnits } from '../app/store';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { Button, Chip, Icon, Label, Toggle, cx, type ChipTone } from '../design/primitives';
import type { IconName } from '../design/icons.generated';
import { devices } from '../devices/DeviceManager';
import { support } from '../app/support';
import { SimulatedTrainer } from '../devices/SimulatedTrainer';
import { telemetry } from '../devices/telemetry';
import { FtmsTrainer } from '../devices/FtmsTrainer';
import { CalibrateDialog } from './CalibrateDialog';

const ZONE_TEXT = ['text-zone-1', 'text-zone-2', 'text-zone-3', 'text-zone-4', 'text-zone-5', 'text-zone-6', 'text-zone-7'];
const ZONE_NAME = ['Recovery', 'Endurance', 'Tempo', 'Threshold', 'VO2 max', 'Anaerobic', 'Sprint'];

/** Writes a live number into the DOM on a fixed tick (4 Hz) — no React re-render per sample (plan 10.3). */
function Live({ read, className, hz = 4 }: { read: () => string; className?: string; hz?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => { const id = setInterval(() => { if (ref.current) ref.current.textContent = read(); }, 1000 / hz); return () => clearInterval(id); }, [read, hz]);
  return <span ref={ref} className={className}>{read()}</span>;
}
const fmt = (v: number | null, d = 0) => (v === null || Number.isNaN(v) ? '— —' : v.toFixed(d));

function MetricTile({ label, icon, tone, children, foot }: { label: string; icon: IconName; tone: string; children: ReactNode; foot: ReactNode }) {
  return (
    <div className="relative overflow-hidden bg-surface-container-low/70 backdrop-blur-2xl rounded-xl p-4 flex flex-col justify-between shadow-md">
      <div className="flex items-center justify-between"><Label className="tracking-widest">{label}</Label><Icon name={icon} size={18} className={tone} /></div>
      <div className="flex items-baseline gap-1 mt-3">{children}</div>
      <div className="mt-3 flex items-center justify-between text-[10px] font-semibold tracking-wider uppercase">{foot}</div>
    </div>
  );
}

const SLOT_META: Record<SlotId, { title: string; icon: IconName; hint: string }> = {
  trainer: { title: 'Controllable trainer', icon: 'pedal_bike', hint: 'Wake the trainer by pedalling' },
  power: { title: 'Power source', icon: 'bolt', hint: 'From the trainer — or pair power pedals' },
  cadence: { title: 'Cadence sensor', icon: 'sync', hint: 'Spin the cranks to wake it' },
  heartRate: { title: 'Heart rate monitor', icon: 'favorite', hint: 'Wet the strap electrodes' },
  speed: { title: 'Speed sensor', icon: 'speed', hint: '' },
};
const chipFor = (s: SlotState): [ChipTone, string] =>
  s.status === 'connected' ? ['success', 'Active'] : s.status === 'searching' || s.status === 'connecting' ? ['warning', s.status === 'searching' ? 'Pairing' : 'Connecting'] : s.status === 'lost' ? ['danger', 'Lost'] : s.status === 'bypassed' ? ['neutral', 'Not needed'] : ['neutral', 'Not paired'];

function SlotTile({ id, onSearch, live }: { id: SlotId; onSearch?: () => void; live?: ReactNode }) {
  const s = useApp((st) => st.slots[id]); const m = SLOT_META[id]; const [tone, text] = chipFor(s);
  const active = s.status === 'connected', bypass = id === 'speed';
  return (
    <div className={cx('rounded-xl overflow-hidden flex flex-col shadow-md backdrop-blur-xl', active ? 'bg-secondary-container/15' : 'bg-surface-container-low/70', bypass && 'opacity-60')}>
      <div className="p-4 flex-1">
        <div className="flex items-start justify-between mb-3">
          <div className={cx('w-11 h-11 rounded-lg flex items-center justify-center', active ? 'bg-secondary-container/40 text-secondary' : 'bg-white/8 text-text-secondary')}><Icon name={m.icon} size={22} /></div>
          <Chip tone={tone} icon={active ? 'check_circle' : s.status === 'bypassed' ? 'lock' : undefined}>{text}</Chip>
        </div>
        <Label className={active ? 'text-secondary' : tone === 'warning' ? 'text-accent' : tone === 'danger' ? 'text-status-danger' : ''}>{m.title}</Label>
        <div className="text-body-lg font-semibold text-text mt-1 truncate">{bypass ? 'Direct-drive trainer' : s.name ?? '—'}</div>
        <div className="text-[11px] uppercase tracking-wider text-text-secondary mt-1">{bypass ? 'Not used: the Flux 2 has no rear wheel, so speed comes from the physics model' : s.detail ?? (s.status === 'idle' ? m.hint : '')}</div>
      </div>
      <div className="px-4 py-3 bg-black/15 flex items-end justify-between min-h-[64px]">
        <div><Label className="text-[10px]">{bypass ? 'Virtual speed' : active ? 'Live' : 'Stream'}</Label>{live}</div>
        {onSearch && !bypass && s.status !== 'connected' && s.status !== 'searching' && s.status !== 'connecting' && (
          <Button size="sm" variant="glass" icon={s.status === 'lost' ? 'refresh' : undefined} onClick={onSearch}>{s.status === 'lost' ? 'Retry' : 'Search'}</Button>
        )}
      </div>
    </div>
  );
}

function SimControls({ sim }: { sim: SimulatedTrainer }) {
  const [, force] = useState(0); const bump = (fn: () => void) => { fn(); force((n) => n + 1); };
  return (
    <div className="px-6 py-4 bg-black/15 space-y-3">
      <div className="flex items-center justify-between"><Label>Rider effort</Label>
        <div className="flex items-center gap-2"><Button size="sm" icon="remove" aria-label="less power" onClick={() => bump(() => (sim.effortW = Math.max(0, sim.effortW - 10)))} />
          <span className="font-metric-live text-metric-md w-16 text-center">{sim.effortW} W</span>
          <Button size="sm" icon="add" aria-label="more power" onClick={() => bump(() => (sim.effortW += 10))} /></div></div>
      <div className="flex items-center justify-between"><Label>Cadence</Label>
        <input aria-label="simulated cadence" type="range" min={0} max={120} value={sim.cadence} onChange={(e) => bump(() => (sim.cadence = +e.target.value))} className="accent-accent w-40" />
        <span className="font-metric-live text-metric-md w-16 text-right">{sim.cadence}</span></div>
      <p className="text-[11px] text-text-muted">Keyboard: Shift + ↑/↓ effort, Shift + ←/→ cadence (works everywhere while the demo trainer is on).</p>
    </div>
  );
}

const CHECKLIST = [
  'Close Tacx Training, Zwift, Rouvy and Garmin Connect on this Mac and on your phone — only one app can control the trainer.',
  'Your Garmin Edge 550 or watch must not have the trainer paired as a controller during app rides (it fights for control).',
  'HRM 200 / HRM 600 straps allow only a few Bluetooth connections: if a phone app holds one, pairing here can fail.',
  'Wet the strap electrodes; wake the cadence sensor by spinning the cranks; wake the trainer by pedalling.',
  'A Garmin speed sensor is not needed: the Flux 2 is direct-drive and speed comes from the physics model.',
];

export function Sensors() {
  const u = useUnits();
  const nav = useNavigate(); const slots = useApp((s) => s.slots); const profile = useApp((s) => s.profile);
  const [error, setError] = useState<string | null>(null); const [open, setOpen] = useState(false); const [calibrating, setCalibrating] = useState(false); const [, setTick] = useState(0);
  const ftp = profile ? effectiveFtp(profile) : 200;
  const run = <A extends unknown[]>(p: (...a: A) => Promise<unknown> | unknown) => async (...a: A) => { setError(null); try { await p(...a); } catch (e) { setError((e as Error).message); } setTick((n) => n + 1); };
  const t = devices.trainer; const sim = t instanceof SimulatedTrainer ? t : null; const ftms = t instanceof FtmsTrainer ? t : null;
  const essentials = (['trainer', 'cadence', 'heartRate'] as SlotId[]).filter((id) => slots[id].status === 'connected').length;
  const bt = typeof navigator !== 'undefined' && 'bluetooth' in navigator;

  return (
    <div className="max-w-[1520px] mx-auto px-4 md:px-8 xl:px-12 py-6 flex flex-col gap-10 pb-16">
      <div className="flex items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2"><span className="text-label-caps text-primary-fixed-dim uppercase tracking-[0.2em]">Hardware</span><span className="w-1.5 h-1.5 rounded-full bg-secondary" /><span className="text-label-caps text-on-surface-variant uppercase tracking-wider">Bluetooth</span></div>
          <h1 className="font-metric text-[44px] leading-[44px] md:text-metric-hero tracking-tighter uppercase text-on-surface leading-none">Sensors</h1>
          <div className="flex items-center gap-2 mt-1"><Icon name="info" size={16} className="text-secondary" /><p className="text-body-md text-on-surface-variant">Close other cycling apps so they release the trainer.</p></div>
        </div>
        <div className="flex flex-wrap items-center gap-4 bg-surface-container-high/40 backdrop-blur-xl px-4 py-2 rounded-xl">
          <span className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider"><span className={cx('w-2.5 h-2.5 rounded-full', bt ? 'bg-tertiary' : 'bg-error')} />{bt ? 'Bluetooth ready' : 'Bluetooth unavailable'}</span>
          {!devices.canAutoReconnect && <><span className="h-3 w-px bg-surface-variant" /><span className="text-[10px] uppercase tracking-wider text-on-surface-variant">Auto-reconnect off (Chrome flag)</span></>}
        </div>
      </div>

      {calibrating && ftms && <CalibrateDialog trainer={ftms} onClose={() => setCalibrating(false)} />}
      {error && <div role="alert" className="rounded-xl bg-error-container/30 border border-status-danger/30 px-4 py-3 text-status-danger flex gap-2 items-center"><Icon name="error" />{error}</div>}

      <section className="flex flex-col gap-1">
        <div className="flex items-center justify-between"><Label className="tracking-widest">Live values</Label><span className="text-[10px] text-on-surface-variant">Refresh 4 Hz</span></div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricTile label="Watts" icon="bolt" tone="text-tertiary" foot={<Live className="text-tertiary" read={() => (telemetry.powerW ? `Zone ${zoneOf(telemetry.powerW, ftp)} (${ZONE_NAME[zoneOf(telemetry.powerW, ftp) - 1]})` : 'No power yet')} />}>
            <Live className={cx('font-metric-live text-metric-xl font-bold tracking-tight leading-none', ZONE_TEXT[2])} read={() => fmt(telemetry.powerW)} /><span className="text-metric-unit uppercase text-on-surface-variant">W</span>
          </MetricTile>
          <MetricTile label="Speed" icon="speed" tone="text-secondary" foot={<><span className="text-secondary">Trainer speed</span><span className="text-on-surface-variant">ride speed uses physics</span></>}>
            <Live className="font-metric-live text-metric-xl font-bold text-secondary tracking-tight leading-none" read={() => fmt(telemetry.speedKph === null || telemetry.speedKph === undefined ? telemetry.speedKph : speedOf(telemetry.speedKph / 3.6, unitsNow()), 1)} /><span className="text-metric-unit uppercase text-on-surface-variant">{unitLabels(u).speed}</span>
          </MetricTile>
          <MetricTile label="Cadence" icon="sync" tone="text-on-surface-variant" foot={<span className="text-on-surface-variant">{slots.cadence.detail ?? (slots.cadence.status === 'connected' ? 'Crank sensor' : 'Not paired')}</span>}>
            <Live className="font-metric-live text-metric-xl font-bold text-text tracking-tight leading-none" read={() => fmt(telemetry.cadenceRpm)} /><span className="text-metric-unit uppercase text-on-surface-variant">rpm</span>
          </MetricTile>
          <MetricTile label="Heart rate" icon="favorite" tone="text-status-danger" foot={<span className={slots.heartRate.status === 'connected' ? 'text-status-success' : 'text-status-danger'}>{slots.heartRate.status === 'connected' ? slots.heartRate.name : 'Strap not paired'}</span>}>
            <Live className="font-metric-live text-metric-xl font-bold text-text tracking-tight leading-none" read={() => fmt(telemetry.hr)} /><span className="text-metric-unit uppercase text-on-surface-variant">bpm</span>
          </MetricTile>
        </div>
      </section>

      <section>
        <div className="flex items-end justify-between mb-4"><h2 className="text-headline-lg text-text">Paired devices</h2><Label className="tracking-widest">5 slots</Label></div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          <SlotTile id="trainer" onSearch={support.bluetooth ? run(() => devices.connectTrainer()) : undefined} live={<Live className="font-metric-live text-metric-md" read={() => (telemetry.powerW === null ? '—' : `${telemetry.powerW} W`)} />} />
          <SlotTile id="power" onSearch={support.bluetooth ? run(() => devices.connectPowerMeter()) : undefined} live={<Live className="font-metric-live text-metric-md" read={() => (telemetry.powerW === null ? '—' : `${telemetry.powerW} W`)} />} />
          <SlotTile id="cadence" onSearch={support.bluetooth ? run(() => devices.connectCadence()) : undefined} live={<Live className="font-metric-live text-metric-md" read={() => `${fmt(telemetry.cadenceRpm)} rpm`} />} />
          <SlotTile id="heartRate" onSearch={support.bluetooth ? run(() => devices.connectHeartRate()) : undefined} live={<Live className="font-metric-live text-metric-md" read={() => `${fmt(telemetry.hr)} bpm`} />} />
          <SlotTile id="speed" live={<span className="text-[11px] text-text-muted">from physics</span>} />
        </div>
      </section>

      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        <div className="col-span-2 rounded-xl bg-surface-container-low/70 backdrop-blur-xl p-8 shadow-ambient">
          <div className="flex items-center justify-between mb-6">
            <span className="flex items-center gap-2 text-body-md font-bold uppercase tracking-wider text-text"><Icon name="hub" className="text-secondary" />Active trainer</span>
            {t && <Chip tone="success">{t.kind === 'simulator' ? 'Demo mode' : `Connected · ${t.kind.toUpperCase()}`}</Chip>}
          </div>
          {t ? (
            <div className="flex gap-8 items-start">
              <div className="flex-1">
                <h3 className="text-headline-lg text-text mb-2">{t.name}</h3>
                <p className="text-body-lg text-on-surface-variant mb-4">{t.kind === 'ftms' ? 'Bluetooth FTMS control: ERG, gradient simulation and resistance.' : t.kind === 'fec' ? 'Tacx FE-C over Bluetooth (older firmware).' : 'Simulated trainer — responds to ERG and gradient like the real one, including lag.'}</p>
                <div className="flex flex-wrap gap-2">
                  {[['ERG', t.caps.erg], ['Gradient', t.caps.sim], ['Resistance', t.caps.resistance], ['Spin-down', t.caps.spinDown]].map(([n, ok]) => <Chip key={n as string} tone={ok ? 'connected' : 'neutral'} icon={ok ? 'check' : 'close'}>{n as string}</Chip>)}
                  <Chip tone="neutral">Power {t.caps.powerRange[0]}–{t.caps.powerRange[1]} W</Chip><Chip tone="neutral">Max grade {t.caps.maxGradePct} %</Chip>
                </div>
              </div>
              <div className="flex flex-col gap-3 w-56">
                {ftms?.caps.spinDown ? <Button icon="build" onClick={() => setCalibrating(true)}>Calibrate</Button>
                  : t.kind !== 'simulator' && <p className="text-[12px] text-text-muted">Calibration: use the Tacx Utility app on your phone.</p>}
                <Button variant="danger" icon="power_settings_new" onClick={run(() => devices.disconnectAll().then(() => { for (const id of ['trainer', 'power', 'cadence', 'heartRate'] as SlotId[]) useApp.getState().setSlot(id, { status: 'idle', name: undefined, detail: undefined }); }))}>Disconnect</Button>
              </div>
            </div>
          ) : <p className="text-body-lg text-text-secondary">No trainer yet. Click <b>Search</b> on the trainer tile, or turn on the demo trainer.</p>}
        </div>
        <div className="flex flex-col gap-6">
          <div className="rounded-xl bg-surface-container-low/70 backdrop-blur-xl overflow-hidden shadow-ambient">
            <div className="p-6"><div className="flex items-center gap-2 mb-2"><h3 className="text-headline-md text-text">Demo trainer</h3><Chip>Sim mode</Chip></div>
              <p className="text-body-md text-on-surface-variant">Ride without hardware. Responds to ERG and gradient like a real trainer; rides on it are never uploaded.</p></div>
            <div className="px-6 py-4 bg-black/15 flex items-center justify-between"><Label>Use demo trainer</Label><Toggle label="Use demo trainer" checked={!!sim} onChange={run((on: boolean) => (on ? devices.useSimulator() : devices.disconnectAll()))} /></div>
            {sim && <SimControls sim={sim} />}
          </div>
          <div className="rounded-xl bg-surface-container-low/70 backdrop-blur-xl p-6 shadow-ambient space-y-3">
            <div className="flex justify-between"><Label className="text-text">Bluetooth</Label><span className={cx('text-[11px]', bt ? 'text-status-success' : 'text-status-danger')}>{bt ? 'Available' : 'Unavailable'}</span></div>
            <div className="flex justify-between text-body-md"><span className="flex items-center gap-2"><Dotc ok={window.isSecureContext} />Secure context</span><code className="text-text-secondary">{location.host}</code></div>
            <div className="flex justify-between text-body-md"><span className="flex items-center gap-2"><Dotc ok={devices.canAutoReconnect} />Auto-reconnect after reload</span><span className="text-text-secondary text-[12px]">{devices.canAutoReconnect ? 'on' : 'needs Chrome flag'}</span></div>
          </div>
        </div>
      </section>

      <section className="rounded-xl bg-surface-container-low/70 backdrop-blur-xl shadow-ambient">
        <button className="w-full flex items-center justify-between px-8 py-5" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          <span className="flex items-center gap-3 text-headline-md text-text"><Icon name="info" className="text-accent" />Trouble connecting? Quick checklist <Chip>{CHECKLIST.length} steps</Chip></span>
          <Icon name="keyboard_arrow_down" className={cx('transition-transform', open && 'rotate-180')} />
        </button>
        {open && <ol className="px-8 pb-6 space-y-2 list-decimal list-inside text-body-lg text-on-surface-variant">{CHECKLIST.map((c) => <li key={c}>{c}</li>)}</ol>}
      </section>

      <section className="rounded-xl bg-surface-container-high/60 backdrop-blur-xl px-4 sm:px-6 py-5 flex flex-wrap items-center justify-between gap-4 shadow-ambient">
        <div className="flex items-center gap-4">
          <span className={cx('w-3 h-3 rounded-full', slots.trainer.status === 'connected' ? 'bg-status-success' : 'bg-status-warning')} />
          <div><div className="text-body-lg font-semibold text-text">{slots.trainer.status === 'connected' ? 'Ready to ride' : 'Trainer not connected'}</div><Label>{essentials} of 3 essential sensors paired</Label></div>
          <span className="h-8 w-px bg-white/10 mx-2" />
          {slots.power.status === 'connected' && <Chip tone="success">Power: active</Chip>}
          {t?.caps.erg && <Chip tone="success">Smart resistance: on</Chip>}
        </div>
        <div className="flex flex-wrap gap-3"><Button variant="glass" onClick={() => nav('/')}>Just look around</Button><Button variant="primary" size="lg" iconRight="arrow_forward" disabled={slots.trainer.status !== 'connected'} onClick={() => nav('/')}>Continue</Button></div>
      </section>
    </div>
  );
}
function Dotc({ ok }: { ok: boolean }) { return <span className={cx('inline-block w-2 h-2 rounded-full', ok ? 'bg-status-success' : 'bg-status-warning')} />; }
