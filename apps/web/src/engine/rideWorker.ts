// Ride clock in a Web Worker (plan D11): worker timers keep running when the tab is hidden.
import { RideEngine, type Input, type RideConfig } from './core';

let engine: RideEngine | null = null; let input: Input = { powerW: null, cadenceRpm: null, hr: null }; let timer: ReturnType<typeof setInterval> | null = null; let last = 0;
export type ToWorker = { type: 'start'; cfg: RideConfig } | { type: 'input'; input: Input } | { type: 'control'; action: 'pause' | 'resume' | 'skip' | 'extend' | 'end' } | { type: 'bias'; delta: number } | { type: 'slope'; delta: number } | { type: 'erg'; on: boolean } | { type: 'stop' };

self.onmessage = (e: MessageEvent<ToWorker>) => {
  const m = e.data;
  if (m.type === 'start') {
    engine = new RideEngine(m.cfg);
    engine.onCommand = (c) => postMessage({ type: 'cmd', c }); engine.onEvent = (ev) => postMessage({ type: 'event', ev }); engine.onRecord = (r) => postMessage({ type: 'record', r });
    last = performance.now(); timer = setInterval(() => {
      const now = performance.now(); let dt = (now - last) / 1000; last = now; dt = Math.min(dt, 1); // catch up after a stall, but never more than 1 s per tick
      while (dt > 0) { const d = Math.min(0.05, dt); engine!.step(d, input); dt -= d; }
      postMessage({ type: 'snap', s: engine!.snapshot() });
    }, 50);
  } else if (m.type === 'input') input = m.input;
  else if (m.type === 'control' && engine) ({ pause: () => engine!.pause(), resume: () => engine!.resume(), skip: () => engine!.skipStep(), extend: () => engine!.extendStep(), end: () => engine!.end() })[m.action]();
  else if (m.type === 'bias') engine?.adjustBias(m.delta);
  else if (m.type === 'slope') engine?.adjustSlope(m.delta);
  else if (m.type === 'erg') engine?.setErg(m.on);
  else if (m.type === 'stop' && timer) { clearInterval(timer); timer = null; engine = null; }
};
