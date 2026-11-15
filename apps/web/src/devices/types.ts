// Device-layer contracts (plan 5.5). Every trainer — FTMS, FE-C, power-only, simulated — implements Trainer.
export type TrainerSample = { t: number; powerW: number; cadenceRpm?: number; speedKph?: number };
export type TrainerCaps = { erg: boolean; sim: boolean; resistance: boolean; spinDown: boolean; powerRange: [number, number]; maxGradePct: number };
export type Simulation = { gradePct: number; crr: number; cwa: number; windMs: number };

export interface Trainer {
  readonly kind: 'ftms' | 'fec' | 'power-only' | 'simulator';
  readonly name: string;
  readonly caps: TrainerCaps;
  onSample(cb: (s: TrainerSample) => void): () => void;
  setTargetPower(w: number): Promise<void>;
  setSimulation(p: Simulation): Promise<void>;
  setResistance(pct: number): Promise<void>;
  startSpinDown?(): Promise<unknown>;
  disconnect(): Promise<void>;
}

/** The subset of BluetoothRemoteGATTCharacteristic we use, so protocol code can be tested with fakes. */
export interface GattChar {
  readonly uuid: string;
  writeValueWithResponse(value: Uint8Array<ArrayBuffer>): Promise<void>;
  startNotifications(): Promise<unknown>;
  readValue?(): Promise<DataView>;
  addEventListener(type: 'characteristicvaluechanged', cb: (e: Event) => void): void;
}
export const valueOf = (e: Event) => (e.target as unknown as { value: DataView }).value;

/** Flux 2 limits (plan 5.7, confirmed in VERIFY log): 16 % max incline, no powered downhill. */
export const FLUX2_GRADE_RANGE: [number, number] = [-10, 16];
export const clampGrade = (g: number, [lo, hi] = FLUX2_GRADE_RANGE) => Math.max(lo, Math.min(hi, g));
