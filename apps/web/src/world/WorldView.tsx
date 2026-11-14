// 3D view host: lazy-loads three.js + the renderer (plan 9: keep the app shell under budget), runs the frame loop
// outside React, maps the engine snapshot to the renderer, and hands control back to 2D if WebGL is lost.
import { useEffect, useRef, useState } from 'react';
import type { RouteProfile } from '@myfitbike/world';
import { DEFAULT_AVATAR } from '@myfitbike/shared';
import { useApp } from '../app/store';
import { rides } from '../engine/RideController';
import { worldFor } from '../app/routesData';
import { bakeRealRoute, hasBake, isReal, opfsFetcher } from '../realroad/realRoads';
import type { Quality, VeloraRenderer } from './VeloraRenderer';

export function WorldView({ route, quality, camera, onFallback, ghosts, pacers }: { route: RouteProfile; quality: Quality; camera: number; onFallback: () => void; ghosts: number; pacers: number }) {
  const canvas = useRef<HTMLCanvasElement>(null); const r = useRef<VeloraRenderer | null>(null); const profile = useApp((s) => s.profile);
  const [status, setStatus] = useState(isReal(route.id) ? 'Loading the road…' : 'Loading Velora…'); const [stats, setStats] = useState(false); const statsRef = useRef<HTMLPreElement>(null);
  useEffect(() => {
    let raf = 0, alive = true, last = performance.now();
    void (async () => {
      try {
        const { VeloraRenderer: R } = await import('./VeloraRenderer');
        const real = isReal(route.id);
        if (real && !(await hasBake(route.id))) await bakeRealRoute(route.id.split('@')[0]!, (st, f) => alive && setStatus(`${st}… ${Math.round(f * 100)} %`)); // first ride on this device
        if (!alive) return;
        const inst = new R(canvas.current!, worldFor(route.id), { quality, avatar: (profile?.avatar ?? DEFAULT_AVATAR) as unknown as Record<string, string>, riderName: profile?.name ?? 'Rider', country: profile?.country ?? null, base: '/world/velora',
          ...(real ? { fetcher: opfsFetcher(route.id), waterLevel: Math.min(0.4, route.y.reduce((a, b) => Math.min(a, b), Infinity) - 3) } : {}) });
        inst.onContextLost = onFallback; inst.routeHint = { x: route.x, z: route.z }; await inst.load(); if (!alive) return inst.dispose(); inst.setRoute(route, ghosts, pacers); inst.cameraMode = camera; r.current = inst; setStatus('');
        const loop = (now: number) => {
          raf = requestAnimationFrame(loop); const dt = Math.min(0.1, (now - last) / 1000); last = now; const s = rides.snapshot; if (!s) return;
          // render between 20 Hz engine steps: extrapolate along the route by speed × time since the snapshot
          inst.frame(dt, { x: s.x, z: s.z, y: s.altM ?? 0, headingRad: s.headingRad, speedMps: s.speedMps, cadenceRpm: s.paused ? 0 : (s.cadenceRpm ?? 0), gradePct: s.gradePct, stopped: s.paused && s.speedMps < 0.3, ghosts: s.ghosts, pacers: s.pacers }, now / 1000);
          if (statsRef.current) { const t = inst.stats; statsRef.current.textContent = `fps ${t.fps}  frame ${t.frameMs} ms\ncalls ${t.calls}  tris ${t.trisM} M\nchunks ${t.chunks}  res ${Math.round(t.resScale * 100)} %`; }
        };
        raf = requestAnimationFrame(loop);
      } catch (e) { setStatus(`3D unavailable: ${(e as Error).message}`); onFallback(); }
    })();
    const onResize = () => r.current?.resize(); addEventListener('resize', onResize);
    return () => { alive = false; cancelAnimationFrame(raf); removeEventListener('resize', onResize); r.current?.dispose(); r.current = null; };
  }, [route, quality]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (r.current) r.current.cameraMode = camera; }, [camera]);
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'f' || e.key === 'F') setStats((v) => !v); }; addEventListener('keydown', k); return () => removeEventListener('keydown', k); }, []);
  return (<>
    <canvas ref={canvas} className="absolute inset-0 w-full h-full" />
    {status && <div className="absolute inset-0 flex items-center justify-center text-body-lg text-text-secondary">{status}</div>}
    {stats && <pre ref={statsRef} className="absolute top-24 right-6 glass-hud rounded-lg px-3 py-2 text-[12px] font-mono text-text z-20" />}
  </>);
}
