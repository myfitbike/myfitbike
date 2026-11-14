// Ride screen (2D, Phase 2). Visuals: E2 broadcast / focus HUDs, E1 menu drawer and paused overlay.
// Behaviour: plan 6.3, 10.3, 10.5 A/D, PLAN 16.8 (profile strip always on), 16.9 (auto-pause), 16.12 (HUD size), 16.13 (HR).
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { effectiveFtp, flatten, targetAt, zoneOf, type Block } from '@veloworld/shared';
import { Button, Chip, Icon, IconButton, Label, cx } from '../design/primitives';
import { useApp } from '../app/store';
import { api } from '../app/api';
import { findWorkout, type CatalogItem } from '../app/workouts';
import { devices } from '../devices/DeviceManager';
import { telemetry } from '../devices/telemetry';
import { rides } from '../engine/RideController';
import type { EngineEvent, RideMode } from '../engine/core';
import { drawWorkout } from '../hud/WorkoutGraph';
import { ZONE_BG, ZONE_NAMES, fmtTime, gradeColor, tokenColor, zoneColor } from '../hud/zones';
import { displayedPower, useLive } from '../hud/live';
import { routeById } from '../app/routesData';
import { sliceRoute } from '@veloworld/world';
import { StageProfile } from '../hud/StageProfile';
import { ClimbAndSegment, CockpitTop, FullMap, FullStage, OnTheRoad, UpcomingGradient, readStage, readPos } from '../hud/RouteWidgets';
import { MiniMap } from '../hud/MiniMap';
import { WorldView } from '../world/WorldView';
import type { Quality } from '../world/VeloraRenderer';

type Banner = { id: number; text: string; tone: 'accent' | 'warning' | 'danger' | 'info'; sticky?: string };
const ZOOM = { small: 0.72, medium: 0.86, large: 1 } as const;

function Pod({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('glass-hud rounded-xl shadow-ambient', className)}>{children}</div>;
}

/** Always-on profile strip: the workout's power profile with the rider marker; open modes show the power trace. */
function ProfileStrip({ blocks, ftp, open }: { blocks: Block[]; ftp: number; open: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const draw = () => {
      const c = ref.current; if (!c) return; const w = (c.width = c.clientWidth * devicePixelRatio), h = (c.height = c.clientHeight * devicePixelRatio); const ctx = c.getContext('2d')!;
      const snap = rides.snapshot; const now = snap?.workoutS ?? 0;
      // trace is placed at approximate workout time (skip/extend shift it)
      if (!open) { drawWorkout(ctx, w, h, blocks, ftp, { trace: rides.records.map((r) => ({ ...r, t: r.t + (snap ? snap.workoutS - snap.elapsedS : 0) })), nowS: now, ftpLine: true }); return; }
      const recs = rides.records.slice(-600); ctx.clearRect(0, 0, w, h); const maxP = Math.max(ftp * 1.4, ...recs.map((r) => r.power ?? 0));
      recs.forEach((r, i) => { const x = (i / 600) * w, bw = w / 600 + 0.5, p = r.power ?? 0, y = h - (p / maxP) * (h - 6); ctx.fillStyle = zoneColor(zoneOf(p, ftp)); ctx.globalAlpha = 0.85; ctx.fillRect(x, y, bw, h - y); });
      ctx.globalAlpha = 1; ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.setLineDash([4, 4]); const fy = h - (ftp / maxP) * (h - 6); ctx.beginPath(); ctx.moveTo(0, fy); ctx.lineTo(w, fy); ctx.stroke(); ctx.setLineDash([]);
    };
    draw(); const id = setInterval(draw, 1000); return () => clearInterval(id);
  }, [blocks, ftp, open]);
  return <canvas ref={ref} className="w-full h-full" role="img" aria-label="Ride profile" />;
}

function StepList({ blocks, ftp }: { blocks: Block[]; ftp: number }) {
  const [, force] = useState(0); const cur = useRef(-1);
  const bind = useLive(4, (): Record<string, string | { width: string }> => { const s = rides.snapshot; if (s && s.stepIndex !== cur.current) { cur.current = s.stepIndex; force((n) => n + 1); } if (!s) return {}; const b = blocks[s.stepIndex]; const frac = b ? 1 - s.stepRemainingS / Math.max(1, b.endS - b.startS) : 0; return { remain: fmtTime(s.stepRemainingS), bar: { width: `${Math.min(100, Math.max(0, frac * 100))}%` } }; });
  const i = rides.snapshot?.stepIndex ?? 0; const view = blocks.slice(i, i + 4);
  return (
    <Pod className="w-80 p-4">
      <div className="flex justify-between mb-3"><Label className="text-text">Workout</Label><Label>Step {i + 1} / {blocks.length}</Label></div>
      <div className="space-y-1.5">{view.map((b, k) => { const t = targetAt(blocks, b.startS, ftp), t2 = targetAt(blocks, b.endS - 0.01, ftp); const zone = t.watts ? zoneOf(Math.max(t.watts, t2.watts ?? 0), ftp) : 1; const active = k === 0; return (
        <div key={b.i} className={cx('rounded-lg px-3', active ? 'bg-white/10 py-3' : 'py-1.5 opacity-80')}>
          <div className="flex items-center gap-3"><span className={cx('w-2.5 h-6 rounded-sm', b.kind === 'free' ? 'bg-text-muted' : ZONE_BG[zone - 1])} />
            <span className={cx('font-metric-live', active ? 'text-metric-md text-text' : 'text-body-lg text-text-secondary')}>{active ? <span ref={bind('remain')} /> : fmtTime(b.endS - b.startS)}</span>
            <span className={cx('flex-1 text-right font-metric-live', active ? 'text-metric-md text-text' : 'text-body-lg text-text-secondary')}>{b.kind === 'free' ? 'Free' : t.type === 'slopePct' ? `${t.value.toFixed(1)} %` : b.kind === 'ramp' ? `${t.watts}→${t2.watts} W` : `${t.watts} W`}</span>
            {b.cadence && <span className="text-[11px] text-text-secondary w-14 text-right">{b.cadence} rpm</span>}</div>
          {active && <div className="mt-2 h-1 rounded-full bg-white/10 overflow-hidden"><div ref={bind('bar')} className="h-full bg-accent" /></div>}
        </div>); })}</div>
    </Pod>
  );
}

export function Ride() {
  const nav = useNavigate(); const [qs] = useSearchParams(); const profile = useApp((s) => s.profile); const trainerSlot = useApp((s) => s.slots.trainer);
  const ftp = profile ? effectiveFtp(profile) : 200; const mode = (qs.get('mode') ?? 'workout') as RideMode;
  const [workout, setWorkout] = useState<CatalogItem | null>(null); const [started, setStarted] = useState(!!rides.session); const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState<Record<string, unknown>>({}); const [menu, setMenu] = useState(false); const [hidden, setHidden] = useState(false);
  const [banners, setBanners] = useState<Banner[]>([]); const [paused, setPaused] = useState(false); const [ergOn, setErgOn] = useState(true); const [confirmEnd, setConfirmEnd] = useState(false); const [saving, setSaving] = useState(false);
  const bannerId = useRef(0);

  useEffect(() => { api.getSettings().then((s) => { if (s) { setSettings(s); setCam(Number(s['graphics.camera'] ?? 1)); } }).catch(() => {}); }, []);
  useEffect(() => { const id = qs.get('workout'); if (id) void findWorkout(id).then((w) => setWorkout(w ?? null)); }, [qs]);
  const blocks = useMemo(() => (workout ? flatten(workout.steps) : []), [workout]);
  const full = qs.get('route') ? routeById(qs.get('route')!) : undefined;
  const route = useMemo(() => (full && qs.get('from') !== null ? sliceRoute(full, Number(qs.get('from')), Number(qs.get('to'))) : full), [full, qs]); const [view, setView] = useState<'hud' | 'stage' | 'map'>('hud'); const [mini, setMini] = useState(false); const [no3d, setNo3d] = useState(false); const [cam, setCam] = useState(1);
  const open = mode === 'startPower' || mode === 'startSlope' || mode === 'route'; const needsWorkout = !open;
  const ready = !!devices.trainer && (!needsWorkout || !!workout);
  const title = route ? (workout ? `${workout.name} on ${route.name}` : route.name) : workout?.name ?? (mode === 'startPower' ? `Start Power ${qs.get('w')} W` : mode === 'startSlope' ? `Start Slope ${qs.get('g')} %` : 'Ride');

  async function begin() {
    setError(null);
    try { await rides.start({ mode, name: title, workout: workout ?? undefined, startPowerW: Number(qs.get('w') ?? 0) || undefined, startSlopePct: qs.get('g') !== null ? Number(qs.get('g')) : undefined, routeId: full?.id, section: route && full && route !== full ? { from: Number(qs.get('from')), to: Number(qs.get('to')) } : undefined, ghost: route === full && qs.get('ghost') === '1', pacerWkg: qs.get('pacer') ? Number(qs.get('pacer')) : undefined }); setStarted(true); }
    catch (e) { setError((e as Error).message); }
  }
  const began = useRef(false);
  useEffect(() => { if (!started && ready && !rides.session && !began.current) { began.current = true; void begin(); } }, [ready]); // auto-start once trainer + workout are ready // eslint-disable-line react-hooks/exhaustive-deps

  // Coarse events → banners (plan 10.3)
  useEffect(() => rides.onEvent((e: EngineEvent) => {
    const push = (text: string, tone: Banner['tone'], ms = 4000, sticky?: string) => { const id = ++bannerId.current; setBanners((b) => [...b.filter((x) => !sticky || x.sticky !== sticky), { id, text, tone, sticky }]); if (!sticky) setTimeout(() => setBanners((b) => b.filter((x) => x.id !== id)), ms); };
    const clear = (sticky: string) => setBanners((b) => b.filter((x) => x.sticky !== sticky));
    if (e.kind === 'countdown') push('Next interval in 3…', 'accent', 3000);
    else if (e.kind === 'cue') push(e.text, 'info', 6000);
    else if (e.kind === 'gearHint') push('Power stuck above target — shift to an easier gear', 'warning', 8000);
    else if (e.kind === 'ergReleased') push('Cadence low — resistance released. Pedal to pick it back up.', 'warning', 0, 'erg');
    else if (e.kind === 'ergResumed') clear('erg');
    else if (e.kind === 'autoPaused') { push('Paused — start pedalling to resume', 'accent', 0, 'pause'); setPaused(true); }
    else if (e.kind === 'resumed') { clear('pause'); setPaused(false); }
    else if (e.kind === 'star') push('★ Interval completed on target', 'accent', 3000);
    else if (e.kind === 'finished') { push(e.reason === 'testEnded' ? 'Test complete — great effort!' : 'Workout complete!', 'accent', 0, 'done'); setConfirmEnd(true); }
  }), []);
  useEffect(() => rides.subscribe(() => { const s = rides.snapshot; if (s) { setPaused(s.paused); setErgOn(s.ergOn); } }), []);

  // Keys (plan 10.3): space pause, arrows bias/slope, tab skip, E ERG, H hide, Esc menu
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!rides.session || e.shiftKey || e.target instanceof HTMLInputElement) return;
      if (e.key === ' ') { e.preventDefault(); if (rides.snapshot?.manualPause) rides.resume(); else rides.pause(); }
      else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); const d = e.key === 'ArrowUp' ? 1 : -1; if (mode === 'startSlope') rides.slope(d * 0.5); else rides.bias(d); }
      else if (e.key === 'Tab') { e.preventDefault(); rides.skip(); }
      else if (e.key === 'e' || e.key === 'E') rides.erg(!ergOn);
      else if (e.key === 'h' || e.key === 'H') setHidden((h) => !h);
      else if ((e.key === 'v' || e.key === 'V') && route) setView((v) => (v === 'hud' ? 'stage' : v === 'stage' ? 'map' : 'hud'));
      else if ((e.key === 'm' || e.key === 'M') && route) setMini((m) => !m);
      else if (route && '123456'.includes(e.key)) { setCam(Number(e.key)); void api.saveSetting('graphics.camera', Number(e.key)); }
      else if (e.key === 'Escape') setMenu((m) => !m);
    };
    addEventListener('keydown', onKey); return () => removeEventListener('keydown', onKey);
  }, [ergOn, mode, route]);

  const avg = (window: string) => (window === '1s' || window === '0s' ? window : '3s') as '3s' | '1s' | '0s';
  const bind = useLive(4, () => {
    const s = rides.snapshot; const p = displayedPower(avg(String(settings['display.powerAveraging'] ?? '3s'))); const z = p ? zoneOf(p, ftp) : 1;
    const recs = rides.records; const avgP = recs.length ? Math.round(recs.reduce((a, r) => a + (r.power ?? 0), 0) / recs.length) : 0;
    const maxHr = profile?.maxHr ?? 185; const hz = telemetry.hr ? Math.min(5, Math.max(1, Math.ceil(((telemetry.hr / maxHr) - 0.5) / 0.1))) : 0;
    return {
      power: { text: p === null ? '—' : String(p), color: p ? zoneColor(z) : '#fff' }, zone: p ? `Zone ${z} · ${ZONE_NAMES[z - 1]} (${Math.round((p / ftp) * 100)} % FTP)` : 'Not pedalling',
      zoneMark: { left: `${Math.min(98, ((p ?? 0) / ftp / 1.6) * 100)}%` }, avg: `${avgP}`, target: s?.targetW && mode !== 'route' ? `${s.targetW} W` : s?.sentGradePct !== null && s?.sentGradePct !== undefined ? `trainer ${s.sentGradePct.toFixed(1)} %` : s?.targetType === 'slopePct' ? `${(s.gradePct ?? 0).toFixed(1)} %` : 'Free',
      speed: (s ? s.speedMps * 3.6 : 0).toFixed(1), hr: telemetry.hr ? String(telemetry.hr) : '—', hrZone: telemetry.hr ? `Z${hz}` : 'no strap', cad: telemetry.cadenceRpm ? String(Math.round(telemetry.cadenceRpm)) : '—',
      time: fmtTime(s?.elapsedS ?? 0), remain: s && s.totalS ? `${fmtTime(Math.max(0, s.totalS - s.workoutS))} left` : 'open ride', dist: ((s?.distanceM ?? 0) / 1000).toFixed(2),
      bias: s && s.bias !== 1 ? `bias ${Math.round(s.bias * 100)} %` : '', grade: { text: `${(s?.gradePct ?? 0).toFixed(1)} %`, color: gradeColor(s?.gradePct ?? 0) },
      remainKm: route && s ? `→ ${((route.loop ? route.lengthM - s.routeD : Math.max(0, route.lengthM - s.routeD)) / 1000).toFixed(2)} km${route.loop ? ` · lap ${s.lap}` : ''}` : '', elev: s?.altM !== null && s?.altM !== undefined ? `${Math.round(s.altM)} m` : '',
      kj: `${Math.round(recs.reduce((a, r) => a + (r.power ?? 0), 0) / 1000)}`, backlog: rides.apiBacklog > 60 ? `Saving locally — API unreachable (${rides.apiBacklog} s queued)` : '',
    };
  });

  async function endRide(save: boolean) {
    setSaving(true); setError(null);
    try {
      if (!save) { await rides.discard(); nav('/'); return; }
      const { rideId, summary } = await rides.finish(); nav(summary ? `/summary/${rideId}${workout?.test ? `?test=${workout.test}` : ''}` : '/');
    } catch (e) { setError((e as Error).message); setSaving(false); }
  }

  const preset = String(settings['hud.preset'] ?? 'broadcast'); const size = (settings['hud.size'] as keyof typeof ZOOM) ?? 'large'; const strip = settings['hud.profileStrip'] !== false;
  const trainerLost = trainerSlot.status === 'lost';

  if (!started) return (
    <div className="min-h-screen flex items-center justify-center p-8">
      <Pod className="max-w-lg w-full p-8 space-y-5">
        <h1 className="text-headline-lg text-text">{title}</h1>
        {!devices.trainer ? <><p className="text-body-lg text-text-secondary">Connect your trainer first, or ride the demo trainer.</p>
          <div className="flex gap-3"><Button variant="primary" icon="cell_tower" onClick={() => { devices.useSimulator(); setStarted(false); setError(null); void begin(); }}>Use demo trainer</Button><Button onClick={() => nav('/sensors')}>Open sensors</Button></div></>
          : <p className="text-body-lg text-text-secondary">Getting ready…</p>}
        {error && <p className="text-status-danger">{error}</p>}
        <Button variant="ghost" onClick={() => nav(-1)}>Back</Button>
      </Pod>
    </div>
  );

  return (
    <div className="fixed inset-0 overflow-hidden select-none" style={{ background: `radial-gradient(1200px 700px at 50% 30%, color-mix(in srgb, var(--color-glow-teal) 30%, transparent), transparent), linear-gradient(var(--color-canvas-top), var(--color-canvas-bottom))` }}>
      {route && !no3d && <WorldView route={route} quality={(settings['graphics.quality'] as Quality) ?? 'high'} camera={cam} ghosts={qs.get('ghost') === '1' ? 2 : 0} pacers={qs.get('pacer') ? 1 : 0} onFallback={() => { setNo3d(true); setView('stage'); }} />}
      {/* banners */}
      <div className="absolute top-6 left-1/2 -translate-x-1/2 z-30 flex flex-col items-center gap-2" aria-live="assertive">
        {trainerLost && <div className="glass-hud rounded-xl px-6 py-3 text-body-lg font-semibold text-status-danger border-status-danger/50 flex gap-2 items-center"><Icon name="warning" />Trainer disconnected — reconnecting…</div>}
        {banners.map((b) => <div key={b.id} className={cx('glass-hud rounded-xl px-6 py-3 text-body-lg font-semibold', b.tone === 'warning' ? 'text-status-warning' : b.tone === 'danger' ? 'text-status-danger' : b.tone === 'info' ? 'text-text' : 'text-accent')}>{b.text}</div>)}
        <span ref={bind('backlog')} className="text-[12px] text-status-warning" />
      </div>
      {/* top-right: time and round buttons (plan 10.5 D) */}
      <div className="absolute top-6 right-6 z-20 flex items-center gap-3" style={{ zoom: ZOOM[size] }}>
        <Pod className="px-5 py-2 text-right"><div className="font-metric-live text-metric-lg text-text" ref={bind('time')} /><div className="text-[11px] text-text-secondary" ref={bind('remain')} /></Pod>
        <IconButton icon="map" label="Map (with routes, Phase 3)" disabled className="opacity-40" />
        <IconButton icon="tune" label="Menu (Esc)" onClick={() => setMenu(true)} />
        <IconButton icon="close" label="End ride" onClick={() => setConfirmEnd(true)} />
      </div>

      {route && view === 'stage' && <FullStage route={route} />}
      {route && view === 'map' && <FullMap route={route} />}
      {!hidden && view === 'hud' && route && preset === 'cockpit' && <div style={{ zoom: ZOOM[size] }} className="absolute inset-0"><CockpitTop route={route} name={profile?.name ?? 'You'} /></div>}
      {!hidden && view === 'hud' && (preset === 'focus' ? (
        <div className="absolute inset-0 p-8 pt-28 grid grid-cols-2 gap-6 content-start" style={{ zoom: ZOOM[size] }}>
          <Pod className="p-6"><div className="flex justify-between"><Label>Power</Label><span className="text-body-md text-text-secondary">target <span ref={bind('target')} /></span></div><div className="font-metric-live text-[140px] leading-none" ref={bind('power')} /><ZoneBar bind={bind} /><div className="text-body-md text-text-secondary mt-2" ref={bind('zone')} /></Pod>
          <Pod className="p-6"><Label>Heart rate</Label><div className="font-metric-live text-[140px] leading-none text-text"><span ref={bind('hr')} /></div><div className="flex gap-1 mt-3">{[1, 2, 3, 4, 5].map((z) => <span key={z} className={cx('h-2 flex-1 rounded-full', ZONE_BG[z - 1])} />)}</div><div className="text-body-md text-text-secondary mt-2" ref={bind('hrZone')} /></Pod>
          <div className="col-span-2 grid grid-cols-4 gap-6">{[['Energy', 'kj', 'kJ'], ['Cadence', 'cad', 'rpm'], ['Speed', 'speed', 'km/h'], ['Distance', 'dist', 'km']].map(([l, k, u]) => <Pod key={k} className="p-5"><Label>{l}</Label><div><span className="font-metric-live text-metric-xl text-text" ref={bind(k!)} /> <span className="text-metric-unit text-text-secondary">{u}</span></div></Pod>)}</div>
          {!open && <div className="col-span-2 flex gap-6 items-start"><StepList blocks={blocks} ftp={ftp} /><Pod className="flex-1 p-4 h-44"><ProfileStrip blocks={blocks} ftp={ftp} open={open} /></Pod><Button icon="chevron_right" onClick={() => rides.skip()}>Skip step</Button></div>}
        </div>
      ) : (
        <div style={{ zoom: ZOOM[size] }} className="absolute inset-0">
          <div className="absolute top-6 left-6 flex flex-col gap-3">{needsWorkout && <StepList blocks={blocks} ftp={ftp} />}{route && preset !== 'cockpit' && <OnTheRoad name={profile?.name ?? 'You'} />}{route && <ClimbAndSegment route={route} />}</div>
          {route && mini && <Pod className="absolute top-28 right-6 w-72 overflow-hidden"><MiniMap route={route} read={readPos} className="w-full h-52" /></Pod>}
          {route && <div className="absolute right-6 bottom-[236px]"><UpcomingGradient route={route} /></div>}
          {/* power pod bottom-left (Broadcast) */}
          <Pod className="absolute left-6 bottom-6 w-[460px] p-6">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-4"><span className="w-12 h-12 rounded-xl border border-accent/40 flex items-center justify-center text-accent"><Icon name="bolt" size={26} /></span><span className="font-metric-live text-[96px] leading-none" ref={bind('power')} /><span className="text-metric-unit text-text-secondary self-end mb-3">W</span></div>
              <div className="text-right mt-2"><Label>Session avg</Label><div className="font-metric-live text-metric-md text-text-secondary">AVG <span ref={bind('avg')} /> W</div><div className="text-[11px] text-text-secondary mt-1">TARGET <span ref={bind('target')} /></div><div className="text-[11px] text-accent" ref={bind('bias')} /></div>
            </div>
            <div className="text-body-md font-semibold text-text mt-3 flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-accent" /><span ref={bind('zone')} /></div>
            <ZoneBar bind={bind} />
            <div className="grid grid-cols-3 gap-4 mt-5 pt-4 border-t border-white/8">
              <div><Label>Speed</Label><span className="font-metric-live text-metric-lg text-secondary" ref={bind('speed')} /> <span className="text-metric-unit text-text-secondary">km/h</span></div>
              <div><Label className="flex items-center gap-2">HR <span className="text-status-success" ref={bind('hrZone')} /></Label><span className="font-metric-live text-metric-lg text-status-danger" ref={bind('hr')} /> <span className="text-metric-unit text-text-secondary">bpm</span></div>
              <div><Label>Cadence</Label><span className="font-metric-live text-metric-lg text-text" ref={bind('cad')} /> <span className="text-metric-unit text-text-secondary">rpm</span></div>
            </div>
          </Pod>
          {strip && <Pod className="absolute left-[500px] right-6 bottom-6 p-4">
            <div className="flex justify-between mb-2"><Label className="tracking-widest">{route ? 'Route profile' : open ? 'Power · last 10 min' : 'Workout profile'} <span className="text-text ml-2 normal-case tracking-normal">{title}</span></Label>{mode === 'startSlope' && <span className="text-body-md">Slope <b className="font-metric-live text-metric-md" ref={bind('grade')} /> <span className="text-text-secondary text-[11px]">↑/↓ to change</span></span>}</div>
            <div className="h-32">{route ? <StageProfile route={route} read={readStage} className="w-full h-full" /> : <ProfileStrip blocks={blocks} ftp={ftp} open={open} />}</div>
            <div className="mt-2 text-[12px] text-text-secondary">{route && <>SLOPE <b className="font-metric-live text-metric-md" ref={bind('grade')} /> · ELEV <span className="text-text" ref={bind('elev')} /> · </>}DISTANCE <span className="font-metric-live text-text text-metric-md" ref={bind('dist')} /> km <span className="text-text" ref={bind('remainKm')} /> · keys: space pause · ↑/↓ {mode === 'startSlope' ? 'slope' : 'bias'}{route ? ' · V view · M map · 1–6 camera · F stats' : ' · Tab skip'} · E ERG {ergOn ? 'on' : 'off'} · H hide · Esc menu</div>
          </Pod>}
        </div>
      ))}

      {/* manual pause overlay (E1 veloworld_in_ride_paused_overlay) */}
      {paused && rides.snapshot?.manualPause && <div className="absolute inset-0 z-30 bg-black/40 flex items-center justify-center"><Pod className="p-10 text-center space-y-5"><Icon name="pause" size={48} className="mx-auto text-accent" /><h2 className="text-headline-lg text-text">Paused</h2><div className="flex gap-3 justify-center"><Button variant="primary" icon="play_arrow" onClick={() => rides.resume()}>Resume</Button><Button onClick={() => setConfirmEnd(true)}>End ride</Button></div></Pod></div>}

      {/* slide-in menu (plan 10.5 D): world keeps running unless Pause is pressed */}
      <aside className={cx('absolute top-0 right-0 h-full w-[380px] z-40 bg-slate-solid/95 border-l border-white/10 shadow-modal p-6 transition-transform duration-200', menu ? 'translate-x-0' : 'translate-x-full')} aria-hidden={!menu}>
        <div className="flex justify-between items-center mb-6"><h2 className="text-headline-md text-text">Ride menu</h2><IconButton icon="close" label="Close menu" onClick={() => setMenu(false)} /></div>
        <div className="space-y-2">
          <MenuItem icon={rides.snapshot?.manualPause ? 'play_arrow' : 'pause'} label={rides.snapshot?.manualPause ? 'Resume' : 'Pause'} onClick={() => (rides.snapshot?.manualPause ? rides.resume() : rides.pause())} />
          {!open && <MenuItem icon="chevron_right" label="Skip step (Tab)" onClick={() => rides.skip()} />}
          {!open && <MenuItem icon="add" label="Extend step by 1 min" onClick={() => rides.extend()} />}
          <MenuItem icon="bolt" label={`ERG ${ergOn ? 'on' : 'off'} (E)`} onClick={() => rides.erg(!ergOn)} />
          <div className="flex gap-2"><Button size="sm" icon="remove" onClick={() => rides.bias(-1)}>Bias</Button><Button size="sm" icon="add" onClick={() => rides.bias(1)}>Bias</Button></div>
          <MenuItem icon="visibility" label={hidden ? 'Show HUD (H)' : 'Hide HUD (H)'} onClick={() => setHidden((h) => !h)} />
          <MenuItem icon="sensors" label="Sensors" onClick={() => window.open('/sensors', '_blank')} />
          <div className="pt-4"><Label className="mb-2">HUD size</Label><div className="flex gap-2">{(['small', 'medium', 'large'] as const).map((sz) => <Button key={sz} size="sm" variant={size === sz ? 'primary' : 'glass'} onClick={() => { setSettings((s) => ({ ...s, 'hud.size': sz })); void api.saveSetting('hud.size', sz); }}>{sz}</Button>)}</div></div>
          <div className="pt-2"><Label className="mb-2">Layout</Label><div className="flex gap-2">{(['broadcast', 'cockpit', 'focus'] as const).map((p) => <Button key={p} size="sm" variant={preset === p ? 'primary' : 'glass'} onClick={() => { setSettings((s) => ({ ...s, 'hud.preset': p })); void api.saveSetting('hud.preset', p); }}>{p}</Button>)}</div></div>
          <div className="pt-6"><Button variant="danger" className="w-full" icon="stop" onClick={() => setConfirmEnd(true)}>End ride</Button></div>
        </div>
      </aside>

      {confirmEnd && <div className="absolute inset-0 z-50 bg-black/50 flex items-center justify-center"><Pod className="p-8 w-[440px] space-y-4">
        <h2 className="text-headline-md text-text">End ride?</h2><p className="text-body-md text-text-secondary">{rides.records.length < 60 ? 'Rides under one minute are not saved.' : `${fmtTime(rides.records.length)} recorded. Save it to your activities, or discard it.`}</p>
        {error && <p className="text-status-danger text-body-md">{error}</p>}
        <div className="flex gap-3 justify-end"><Button variant="ghost" disabled={saving} onClick={() => setConfirmEnd(false)}>Keep riding</Button><Button variant="danger" disabled={saving} onClick={() => void endRide(false)}>Discard</Button><Button variant="primary" disabled={saving} onClick={() => void endRide(true)}>{saving ? 'Saving…' : 'Save ride'}</Button></div>
      </Pod></div>}
    </div>
  );
}

function ZoneBar({ bind }: { bind: (k: string) => (el: HTMLElement | null) => void }) {
  return <div className="relative flex gap-1 mt-3 h-2">{[1, 2, 3, 4, 5, 6, 7].map((z) => <span key={z} className={cx('flex-1 rounded-full opacity-60', ZONE_BG[z - 1])} />)}<span ref={bind('zoneMark')} className="absolute -top-1 w-1 h-4 rounded bg-white ring-2 ring-accent transition-[left] duration-200" /></div>;
}
function MenuItem({ icon, label, onClick }: { icon: Parameters<typeof Icon>[0]['name']; label: string; onClick: () => void }) {
  return <button onClick={onClick} className="w-full flex items-center gap-3 px-4 py-3 rounded-lg bg-white/5 hover:bg-white/10 text-body-lg text-text"><Icon name={icon} className="text-text-secondary" />{label}</button>;
}
void tokenColor; void readPos;
