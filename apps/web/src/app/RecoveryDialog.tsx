// Crash recovery (plan 6.5): an unacknowledged write-ahead log on start → "Resume ride" or "Save and finish".
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Button, Card, Label } from '../design/primitives';
import { rides } from '../engine/RideController';
import { findWorkout } from './workouts';
import { devices } from '../devices/DeviceManager';
import { fmtTime } from '../hud/zones';
import type { WalHeader } from '../engine/wal';
import type { Sample } from '@veloworld/shared';

export function RecoveryDialog() {
  const [found, setFound] = useState<{ header: WalHeader; samples: Sample[] } | null>(null); const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null); const nav = useNavigate();
  useEffect(() => { if (!rides.session) void rides.recoverable().then((l) => setFound(l[0] ?? null)); }, []);
  if (!found) return null;
  const { header, samples } = found;
  const save = async () => { setBusy(true); try { const s = await rides.saveRecovered(header.rideId, samples); setFound(null); if (s) nav(`/summary/${header.rideId}`); } catch (e) { setErr((e as Error).message); } setBusy(false); };
  const resume = async () => {
    setBusy(true); try {
      if (!devices.trainer) devices.useSimulator();
      const workout = header.workoutId ? await findWorkout(header.workoutId) : undefined;
      await rides.start({ mode: header.cfg.mode, name: header.name, workout, startPowerW: header.cfg.startPowerW, startSlopePct: header.cfg.startSlopePct, routeId: header.routeId, ghost: !!header.cfg.ghosts?.length, pacerWkg: header.cfg.pacersWkg?.[0], resume: { rideId: header.rideId, startedAt: header.startedAt, samples } });
      setFound(null); nav(`/ride?mode=${header.cfg.mode}${header.workoutId ? `&workout=${encodeURIComponent(header.workoutId)}` : ''}${header.routeId ? `&route=${header.routeId}` : ''}`);
    } catch (e) { setErr((e as Error).message); } setBusy(false);
  };
  return (
    <div className="fixed inset-0 z-[70] bg-black/50 flex items-center justify-center" role="dialog" aria-modal aria-labelledby="recover-title">
      <Card level={3} className="p-8 w-[480px] space-y-4">
        <Label className="text-accent">Unfinished ride found</Label>
        <h2 id="recover-title" className="text-headline-md text-text">{header.name}</h2>
        <p className="text-body-md text-text-secondary">Started {new Date(header.startedAt).toLocaleString()} · {fmtTime(samples.length)} recorded and kept safe in this browser.</p>
        {err && <p className="text-status-danger text-body-md">{err}</p>}
        <div className="flex gap-3 justify-end"><Button variant="ghost" disabled={busy} onClick={() => void rides.saveRecovered(header.rideId, []).then(() => setFound(null))}>Discard</Button><Button disabled={busy} onClick={() => void save()}>Save and finish</Button><Button variant="primary" disabled={busy} onClick={() => void resume()}>Resume ride</Button></div>
      </Card>
    </div>
  );
}
