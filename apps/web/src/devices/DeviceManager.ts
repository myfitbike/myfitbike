// Owns every Bluetooth device (main thread, plan section 4). Picks the best trainer protocol, fills the five slots
// (plan 5.8), applies source priority with 5 s fallback, reconnects with backoff 1/2/4/8 s, and re-sends the
// current trainer target after a reconnect.
import { useApp, type SlotId } from '../app/store';
import { api } from '../app/api';
import { FEC_NOTIFY, FEC_SERVICE, FEC_WRITE } from './codecs/fec';
import { CadenceCalculator, parseCsc, parseCyclingPower, parseHeartRate } from './codecs/sensors';
import { FecTrainer } from './FecTrainer';
import { FtmsTrainer } from './FtmsTrainer';
import { SimulatedTrainer } from './SimulatedTrainer';
import { publish, telemetry } from './telemetry';
import { valueOf, type GattChar, type Simulation, type Trainer, type TrainerSample } from './types';

const S = { ftms: 0x1826, cps: 0x1818, csc: 0x1816, hrs: 0x180d, dis: 0x180a, bat: 0x180f } as const;
const OPTIONAL = [S.ftms, S.cps, S.csc, S.hrs, S.dis, S.bat, FEC_SERVICE];
const BACKOFF_S = [1, 2, 4, 8];
const SILENCE_MS = 5000;

type LastCommand = { kind: 'power'; w: number } | { kind: 'sim'; p: Simulation } | { kind: 'resistance'; pct: number } | null;
export type DeviceToast = { id: number; text: string; tone: 'warning' | 'danger' | 'success' };

class DeviceManagerImpl {
  trainer: Trainer | null = null;
  private devices = new Map<SlotId, BluetoothDevice>();
  private lastCommand: LastCommand = null;
  private cadenceCalc = new CadenceCalculator();
  private crankSensorAt = 0; private toastId = 0;
  log: string[] = [];
  onToast: (t: DeviceToast) => void = () => {};
  private slot = (id: SlotId, s: Parameters<ReturnType<typeof useApp.getState>['setSlot']>[1]) => useApp.getState().setSlot(id, s);
  private note(m: string) { this.log.push(`${new Date().toISOString().slice(11, 19)} ${m}`); if (this.log.length > 200) this.log.shift(); }
  private toast(text: string, tone: DeviceToast['tone']) { this.onToast({ id: ++this.toastId, text, tone }); }

  constructor() { setInterval(() => this.checkSilence(), 1000); }

  // ---------- trainer ----------
  async connectTrainer(): Promise<void> {
    this.slot('trainer', { status: 'searching' });
    try {
      const device = await navigator.bluetooth.requestDevice({ filters: [{ services: [S.ftms] }, { services: [FEC_SERVICE] }, { namePrefix: 'Tacx' }], optionalServices: OPTIONAL });
      await this.attachTrainer(device);
    } catch (e) { this.slot('trainer', { status: 'idle' }); this.note(`trainer: ${(e as Error).message}`); if ((e as DOMException).name !== 'NotFoundError') throw e; }
  }
  private async attachTrainer(device: BluetoothDevice, isReconnect = false): Promise<void> {
    this.slot('trainer', { status: 'connecting', name: device.name ?? 'Trainer', source: 'ble' });
    const server = await device.gatt!.connect(); this.devices.set('trainer', device);
    if (!isReconnect) device.addEventListener('gattserverdisconnected', () => this.onDisconnected('trainer', device));
    const svc = (uuid: number | string) => server.getPrimaryService(uuid).catch(() => null);
    const ftms = await svc(S.ftms); let trainer: Trainer;
    if (ftms) {
      const ch = (u: number) => ftms.getCharacteristic(u).catch(() => undefined) as Promise<GattChar | undefined>;
      const [ibd, cp, st, feat, pr, rr] = await Promise.all([ch(0x2ad2), ch(0x2ad9), ch(0x2ada), ch(0x2acc), ch(0x2ad8), ch(0x2ad6)]);
      if (!ibd || !cp) throw new Error('FTMS service without bike data or control point');
      const t = new FtmsTrainer(device.name ?? 'Trainer', { indoorBikeData: ibd, controlPoint: cp, machineStatus: st, feature: feat, powerRange: pr, resistanceRange: rr });
      t.onLog = (m) => this.note(m); t.onControlLost = () => { this.toast('Another app or device took control of the trainer', 'danger'); void t.regainControl().catch(() => {}); };
      await t.init(); trainer = t;
    } else {
      const fec = await svc(FEC_SERVICE); if (!fec) throw new Error('This trainer offers neither FTMS nor Tacx FE-C control');
      const p = useApp.getState().profile; const t = new FecTrainer(device.name ?? 'Trainer', (await fec.getCharacteristic(FEC_NOTIFY)) as GattChar, (await fec.getCharacteristic(FEC_WRITE)) as GattChar);
      await t.init(p?.weightKg ?? 75, p?.bikeWeightKg ?? 8.5); trainer = t;
    }
    this.useTrainer(trainer, 'ble');
    if (isReconnect) await this.resendLast();
    else api.rememberDevice({ bleName: device.name ?? 'Trainer', kind: 'trainer', bleId: device.id }).catch(() => {});
    this.note(`trainer connected via ${trainer.kind}`);
  }

  useSimulator(): SimulatedTrainer {
    const sim = new SimulatedTrainer(); sim.start(); this.useTrainer(sim, 'simulator'); this.note('demo trainer started'); return sim;
  }
  private useTrainer(t: Trainer, source: 'ble' | 'simulator') {
    void this.trainer?.disconnect(); this.trainer = t;
    this.slot('trainer', { status: 'connected', name: t.name, source, detail: t.kind.toUpperCase() });
    this.slot('power', { status: 'connected', name: t.name, source, detail: 'from trainer' });
    if (this.crankSensorAt === 0) this.slot('cadence', { status: 'connected', name: t.name, source, detail: 'estimated by trainer' });
    t.onSample((s) => this.onTrainerSample(s));
  }
  private onTrainerSample(s: TrainerSample) {
    const crankFresh = performance.now() - this.crankSensorAt < SILENCE_MS;
    publish({ powerW: s.powerW, speedKph: s.speedKph ?? null, ...(crankFresh || s.cadenceRpm === undefined ? {} : { cadenceRpm: s.cadenceRpm }) });
  }

  // Commands are remembered so they can be re-sent after a reconnect.
  setTargetPower(w: number) { this.lastCommand = { kind: 'power', w }; return this.trainer?.setTargetPower(w); }
  setSimulation(p: Simulation) { this.lastCommand = { kind: 'sim', p }; publish({ gradePct: p.gradePct }); return this.trainer?.setSimulation(p); }
  setResistance(pct: number) { this.lastCommand = { kind: 'resistance', pct }; return this.trainer?.setResistance(pct); }
  private async resendLast() {
    const c = this.lastCommand; if (!c || !this.trainer) return;
    if (c.kind === 'power') await this.trainer.setTargetPower(c.w); else if (c.kind === 'sim') await this.trainer.setSimulation(c.p); else await this.trainer.setResistance(c.pct);
  }

  // ---------- sensors ----------
  async connectHeartRate() { await this.connectSensor('heartRate', S.hrs, 0x2a37, (dv) => { const r = parseHeartRate(dv); publish({ hr: r.bpm }); }); }
  async connectCadence() {
    await this.connectSensor('cadence', S.csc, 0x2a5b, (dv) => { const r = parseCsc(dv); if (!r.crank) return; this.crankSensorAt = performance.now(); publish({ cadenceRpm: Math.round(this.cadenceCalc.push(r.crank, performance.now())) }); });
  }
  async connectPowerMeter() { await this.connectSensor('power', S.cps, 0x2a63, (dv) => publish({ powerW: parseCyclingPower(dv).powerW })); }
  private async connectSensor(id: SlotId, service: number, charUuid: number, onValue: (dv: DataView) => void, device?: BluetoothDevice) {
    this.slot(id, { status: 'searching' });
    try {
      device ??= await navigator.bluetooth.requestDevice({ filters: [{ services: [service] }], optionalServices: [S.dis, S.bat] });
      this.slot(id, { status: 'connecting', name: device.name ?? id, source: 'ble' });
      const server = await device.gatt!.connect(); const c = await (await server.getPrimaryService(service)).getCharacteristic(charUuid);
      c.addEventListener('characteristicvaluechanged', (e) => onValue(valueOf(e))); await c.startNotifications();
      if (!this.devices.has(id)) device.addEventListener('gattserverdisconnected', () => this.onDisconnected(id, device!));
      this.devices.set(id, device); this.slot(id, { status: 'connected', name: device.name ?? id, detail: undefined });
      api.rememberDevice({ bleName: device.name ?? id, kind: id, bleId: device.id }).catch(() => {});
      (this.reconnectors as Record<string, () => Promise<void>>)[id] = () => this.connectSensor(id, service, charUuid, onValue, device);
    } catch (e) { this.slot(id, { status: 'idle' }); this.note(`${id}: ${(e as Error).message}`); if ((e as DOMException).name !== 'NotFoundError') throw e; }
  }
  private reconnectors: Partial<Record<SlotId, () => Promise<void>>> = {};

  // ---------- reconnect ----------
  private async onDisconnected(id: SlotId, device: BluetoothDevice) {
    this.slot(id, { status: 'lost' }); this.toast(`${device.name ?? id} disconnected — reconnecting`, 'warning'); this.note(`${id} disconnected`);
    for (const s of BACKOFF_S) {
      await new Promise((r) => setTimeout(r, s * 1000));
      try {
        if (id === 'trainer') await this.attachTrainer(device, true); else await this.reconnectors[id]?.();
        this.toast(`${device.name ?? id} reconnected`, 'success'); return;
      } catch (e) { this.note(`${id} reconnect after ${s}s failed: ${(e as Error).message}`); }
    }
    this.toast(`${device.name ?? id} did not come back. Open Sensors to reconnect.`, 'danger');
  }
  /** After a reload: reconnect silently if Chrome exposes getDevices() (flag on), otherwise the UI shows a one-click banner. */
  get canAutoReconnect() { return typeof navigator.bluetooth?.getDevices === 'function'; }
  async autoReconnect(): Promise<number> {
    if (!this.canAutoReconnect) return 0; const known = await navigator.bluetooth.getDevices(); let n = 0;
    for (const d of known) {
      try {
        const services = await d.gatt!.connect().then((s) => s.getPrimaryServices()).catch(() => []); const uuids = services.map((s) => s.uuid);
        if (uuids.some((u) => u.startsWith('00001826') || u === FEC_SERVICE)) { await this.attachTrainer(d); n++; }
        else if (uuids.some((u) => u.startsWith('0000180d'))) { await this.connectSensor('heartRate', S.hrs, 0x2a37, (dv) => publish({ hr: parseHeartRate(dv).bpm }), d); n++; }
        else if (uuids.some((u) => u.startsWith('00001816'))) { await this.connectSensor('cadence', S.csc, 0x2a5b, (dv) => { const r = parseCsc(dv); if (r.crank) { this.crankSensorAt = performance.now(); publish({ cadenceRpm: Math.round(this.cadenceCalc.push(r.crank, performance.now())) }); } }, d); n++; }
      } catch (e) { this.note(`auto-reconnect ${d.name}: ${(e as Error).message}`); }
    }
    return n;
  }

  // ---------- source fallback (plan 5.8) ----------
  private checkSilence() {
    const now = performance.now(); const st = useApp.getState().slots;
    if (this.crankSensorAt && now - this.crankSensorAt > SILENCE_MS && now - this.crankSensorAt < SILENCE_MS + 1100 && this.trainer) {
      this.toast('Cadence sensor silent — using the trainer\'s cadence', 'warning'); this.slot('cadence', { detail: 'estimated by trainer (sensor silent)' });
    }
    if (st.heartRate.status === 'connected' && now - telemetry.updatedAt.hr > SILENCE_MS && telemetry.hr !== null) { publish({ hr: null }); this.slot('heartRate', { detail: 'no data — check strap contact' }); }
  }

  async disconnectAll() { for (const d of this.devices.values()) d.gatt?.disconnect(); await this.trainer?.disconnect(); this.trainer = null; }
}

export const devices = new DeviceManagerImpl();
