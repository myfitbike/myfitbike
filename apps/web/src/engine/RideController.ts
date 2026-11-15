// Main-thread side of a ride: feeds telemetry to the worker, applies its trainer commands, writes every second to
// the OPFS write-ahead log and to the API in 30 s batches (retried until acknowledged), and finishes or recovers rides.
import type { RideSummary, Sample, Workout } from '@myfitbike/shared';
import { api } from '../app/api';
import { useApp } from '../app/store';
import { devices } from '../devices/DeviceManager';
import { SimulatedTrainer } from '../devices/SimulatedTrainer';
import { subscribe, telemetry } from '../devices/telemetry';
import type { EngineEvent, RideConfig, RideMode, Snapshot } from './core';
import { Wal } from './wal';
import { routeById } from '../app/routesData';
import { sliceRoute } from '@myfitbike/world';
import type { GhostData } from './core';
import type { ToWorker } from './rideWorker';

export type RideSession = { rideId: number; name: string; mode: RideMode; workout?: Workout; startedAt: string; simulator: boolean; routeId?: string };
type Listener = () => void;

class RideControllerImpl {
  session: RideSession | null = null;
  snapshot: Snapshot | null = null;
  records: Sample[] = [];
  lastEvent: { ev: EngineEvent; at: number } | null = null;
  private worker: Worker | null = null; private wal: Wal | null = null; private unsub: (() => void) | null = null;
  private queue: Sample[] = []; private batchTimer: ReturnType<typeof setInterval> | null = null; private wakeLock: WakeLockSentinel | null = null;
  private listeners = new Set<Listener>(); private eventListeners = new Set<(e: EngineEvent) => void>();
  apiBacklog = 0;

  subscribe(l: Listener) { this.listeners.add(l); return () => { this.listeners.delete(l); }; }
  onEvent(l: (e: EngineEvent) => void) { this.eventListeners.add(l); return () => { this.eventListeners.delete(l); }; }
  private emit() { for (const l of this.listeners) l(); }

  private starting = false;
  async start(opts: { mode: RideMode; name: string; workout?: Workout; startPowerW?: number; startSlopePct?: number; routeId?: string; section?: { from: number; to: number }; ghost?: boolean; pacerWkg?: number; resume?: { rideId: number; startedAt: string; samples: Sample[] } }) {
    // one ride at a time: a second start (double click, StrictMode re-run) must not spawn a second worker
    if (this.starting || this.session) return; this.starting = true;
    try { await this.startInner(opts); } finally { this.starting = false; }
  }
  private async startInner(opts: Parameters<RideControllerImpl['start']>[0]) {
    const profile = useApp.getState().profile; if (!profile) throw new Error('No profile');
    const settings = await api.getSettings().catch(() => ({} as Record<string, unknown>));
    const ftp = profile.ftpW ?? Math.round(profile.weightKg * 2.5); const simulator = devices.trainer instanceof SimulatedTrainer;
    const last = opts.resume?.samples.at(-1);
    const base = opts.routeId ? routeById(opts.routeId) : undefined; const route = base && opts.section ? sliceRoute(base, opts.section.from, opts.section.to) : base;
    const ghosts: GhostData[] = route && opts.ghost ? await fetch(`/api/routes/${route.id}/ghost`).then((r) => (r.ok ? r.json() : [])).catch(() => []) : [];
    const cfg: RideConfig = { mode: opts.mode, steps: opts.workout?.steps ?? [], ftp, massKg: profile.weightKg + profile.bikeWeightKg, autoPauseS: Number(settings['ride.autoPauseDelayS'] ?? 3), startPowerW: opts.startPowerW, startSlopePct: opts.startSlopePct, route: route ? { id: route.id, step: route.step, lengthM: route.lengthM, loop: route.loop, x: route.x, y: route.y, z: route.z } : undefined,
      difficultyUpPct: Number(settings['trainer.difficultyUpPct'] ?? 100), difficultyDownPct: Number(settings['trainer.difficultyDownPct'] ?? 50), pacersWkg: opts.pacerWkg ? [opts.pacerWkg] : undefined, ghosts, maxGradePct: devices.trainer?.caps.maxGradePct, startElapsedS: last?.t, startDistanceM: last?.distance };
    const startedAt = opts.resume?.startedAt ?? new Date().toISOString();
    const rideId = opts.resume?.rideId ?? (await api.createRide({ mode: opts.mode, name: opts.name, startedAt, workoutId: opts.workout?.id, routeId: opts.routeId, simulator })).id;
    this.session = { rideId, name: opts.name, mode: opts.mode, workout: opts.workout, startedAt, simulator, routeId: opts.routeId };
    this.records = opts.resume?.samples ?? [];
    this.wal = await Wal.create({ rideId, startedAt, name: opts.name, workoutId: opts.workout?.id, routeId: opts.routeId, cfg }).catch(() => null);
    if (opts.resume && this.wal) for (const r of opts.resume.samples) this.wal.append(r);

    this.worker = new Worker(new URL('./rideWorker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (e: MessageEvent) => this.onWorker(e.data);
    this.post({ type: 'start', cfg });
    this.unsub = subscribe(() => this.post({ type: 'input', input: { powerW: telemetry.powerW, cadenceRpm: telemetry.cadenceRpm, hr: telemetry.hr } }));
    this.batchTimer = setInterval(() => void this.flushBatch(), 30_000); /* PLAN 17.1: 30 s keeps 100 riders inside free request limits; the OPFS log holds every second meanwhile */
    // Screen wake lock (plan 9) — requested without awaiting: the promise can stay pending while the tab is in the background
    void navigator.wakeLock?.request('screen').then((l) => { this.wakeLock = l; }).catch(() => { /* not critical */ });
    this.emit();
  }
  private post(m: ToWorker) { this.worker?.postMessage(m); }
  private onWorker(m: { type: string; c?: { kind: string; w?: number; gradePct?: number }; ev?: EngineEvent; r?: Sample; s?: Snapshot }) {
    if (m.type === 'snap') { this.snapshot = m.s!; this.emit(); return; }
    if (m.type === 'record') { this.records.push(m.r!); this.queue.push(m.r!); this.wal?.append(m.r!); return; }
    if (m.type === 'cmd') {
      const c = m.c!; const sim = { crr: 0.004, cwa: 0.51, windMs: 0 };
      const p = c.kind === 'power' ? devices.setTargetPower(c.w!) : devices.setSimulation({ gradePct: c.kind === 'sim' ? c.gradePct! : 0, ...sim });
      void p?.catch((err: Error) => console.warn('trainer command failed', err.message)); return;
    }
    if (m.type === 'event') { this.lastEvent = { ev: m.ev!, at: performance.now() }; for (const l of this.eventListeners) l(m.ev!); this.emit(); }
  }
  private async flushBatch() {
    if (!this.session || !this.queue.length) return; const batch = this.queue.splice(0, 300);
    try { await api.postSamples(this.session.rideId, batch); this.apiBacklog = this.queue.length; }
    catch { this.queue.unshift(...batch); this.apiBacklog = this.queue.length; } // API down: keep buffering (WAL has it too)
  }

  pause() { this.post({ type: 'control', action: 'pause' }); } resume() { this.post({ type: 'control', action: 'resume' }); }
  skip() { this.post({ type: 'control', action: 'skip' }); } extend() { this.post({ type: 'control', action: 'extend' }); }
  bias(delta: number) { this.post({ type: 'bias', delta }); } slope(delta: number) { this.post({ type: 'slope', delta }); } erg(on: boolean) { this.post({ type: 'erg', on }); }

  /** Save: upload what is left, let the API summarise, then drop the WAL. Rides under 1 minute are discarded (plan 8.1). */
  async finish(): Promise<{ rideId: number; summary: RideSummary | null }> {
    const s = this.session!; this.post({ type: 'control', action: 'end' }); this.stopWorker();
    if (this.records.length < 60) { await this.discard(); return { rideId: s.rideId, summary: null }; }
    while (this.queue.length) { const before = this.queue.length; await this.flushBatch(); if (this.queue.length >= before) throw new Error('Could not reach the local API — your ride is safe in the browser and will be saved when it is back.'); }
    const profile = useApp.getState().profile; const stars = this.snapshot?.stars.filter(Boolean).length ?? 0;
    const summary = await api.finishRide(s.rideId, { status: 'done', endedAt: new Date().toISOString(), ftp: profile?.ftpW ?? Math.round((profile?.weightKg ?? 75) * 2.5), stars });
    await Wal.remove(s.rideId); this.reset(); return { rideId: s.rideId, summary };
  }
  async discard() { const s = this.session; this.stopWorker(); if (s) { await api.finishRide(s.rideId, { status: 'discarded' }).catch(() => {}); await Wal.remove(s.rideId); } this.reset(); }
  private stopWorker() { this.post({ type: 'stop' }); this.worker?.terminate(); this.worker = null; this.unsub?.(); this.unsub = null; if (this.batchTimer) clearInterval(this.batchTimer); void this.wakeLock?.release().catch(() => {}); this.wakeLock = null; void devices.setSimulation({ gradePct: 0, crr: 0.004, cwa: 0.51, windMs: 0 })?.catch(() => {}); }
  private reset() { this.session = null; this.snapshot = null; this.records = []; this.queue = []; this.emit(); }

  /** Rides left in the browser by a crash or reload (plan 6.5): offer "Resume ride" or "Save and finish". */
  async recoverable() { return Wal.list(); }
  async saveRecovered(rideId: number, samples: Sample[]) {
    for (let i = 0; i < samples.length; i += 300) await api.postSamples(rideId, samples.slice(i, i + 300));
    const profile = useApp.getState().profile; const summary = samples.length >= 60 ? await api.finishRide(rideId, { status: 'done', ftp: profile?.ftpW ?? 200 }) : (await api.finishRide(rideId, { status: 'discarded' }), null);
    await Wal.remove(rideId); return summary;
  }
}
export const rides = new RideControllerImpl();
if (import.meta.env.DEV) (globalThis as unknown as { __rides: typeof rides }).__rides = rides; // dev-only inspection
