// Ride summary — E1 veloworld_ride_summary. Behaviour: plan 10.2 #8, 6.4 (FTP tests), 8.1 (Strava button).
import { distOf, elevOf, ftpFrom20min, ftpFromRamp, speedOf, unitLabels, zoneOf, type ProfileInput, type Sample } from '@veloworld/shared';
import { useApp, useUnits } from '../app/store';
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { Button, Chip, Icon, Label, cx } from '../design/primitives';
import { api, type RideRow } from '../app/api';
import { ZONE_BG, ZONE_NAMES, fmtTime, tokenColor, zoneColor } from '../hud/zones';
import { StravaUpload } from './StravaUpload';
import { refreshProgress } from '../app/useProgress';

function Chart({ samples, ftp }: { samples: Sample[]; ftp: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current; if (!c || !samples.length) return; const w = (c.width = c.clientWidth * devicePixelRatio), h = (c.height = c.clientHeight * devicePixelRatio); const g = c.getContext('2d')!;
    const maxP = Math.max(ftp * 1.5, ...samples.map((s) => s.power ?? 0)), n = samples.length;
    samples.forEach((s, i) => { const p = s.power ?? 0, x = (i / n) * w, y = h - (p / maxP) * h; g.fillStyle = zoneColor(zoneOf(p, ftp)); g.globalAlpha = 0.75; g.fillRect(x, y, w / n + 0.6, h - y); });
    g.globalAlpha = 1; const hrs = samples.map((s) => s.hr ?? 0); const maxH = Math.max(200, ...hrs);
    g.strokeStyle = tokenColor('--color-status-danger'); g.lineWidth = 1.5 * devicePixelRatio; g.beginPath(); hrs.forEach((v, i) => { const x = (i / n) * w, y = h - (v / maxH) * h; if (i && v) g.lineTo(x, y); else g.moveTo(x, y); }); g.stroke();
    const tg = samples.map((s) => s.target); if (tg.some((v) => v)) { g.strokeStyle = 'rgba(255,255,255,.6)'; g.setLineDash([3, 3]); g.beginPath(); tg.forEach((v, i) => { const x = (i / n) * w, y = h - ((v ?? 0) / maxP) * h; if (i) g.lineTo(x, y); else g.moveTo(x, y); }); g.stroke(); }
  }, [samples, ftp]);
  return <canvas ref={ref} className="w-full h-56" role="img" aria-label="Power (bars, zone coloured), heart rate (red line) and target (dashed)" />;
}

export function Summary() {
  const u = useUnits();
  const { id = '' } = useParams(); const [qs] = useSearchParams(); const nav = useNavigate(); const profile = useApp((s) => s.profile); const setProfile = useApp((s) => s.setProfile);
  const [ride, setRide] = useState<(RideRow & { samples: Sample[] }) | null>(null); const [applied, setApplied] = useState(false); const [err, setErr] = useState<string | null>(null);
  useEffect(() => { api.getRide(Number(id)).then(setRide).catch((e: Error) => setErr(e.message)); void refreshProgress(); }, [id]);
  if (err) return <div className="p-12 text-status-danger">{err}</div>;
  if (!ride?.summary) return <div className="p-12 text-text-secondary">Loading…</div>;
  const S = ride.summary; const ftp = S.ftpUsed; const test = qs.get('test');
  const power = ride.samples.map((s) => s.power ?? 0);
  const newFtp = test === 'ramp' ? ftpFromRamp(power) : test === 'ftp20' ? ftpFrom20min(Math.max(...[0, ...power.map((_, i) => (i + 1200 <= power.length ? power.slice(i, i + 1200).reduce((a, b) => a + b, 0) / 1200 : 0))])) : null;
  const stars = new Set(ride.samples.filter((s) => s.step !== null).map((s) => s.step)).size;
  const applyFtp = async () => { if (!profile || !newFtp) return; const { id: _i, ...p } = profile; setProfile(await api.saveProfile({ ...(p as ProfileInput), ftpW: newFtp })); setApplied(true); };
  const tiles: [string, string, string, string?][] = [['Time', fmtTime(S.movingS), ''], ['Distance', distOf(S.distanceM, u).toFixed(2), unitLabels(u).dist], ['Avg power', String(S.avgPower), 'W', 'text-accent'], ['Normalized', String(S.np), 'W'],
    ['TSS', String(S.tss), '', 'text-accent'], ['IF', S.if.toFixed(2), ''], ['Work', String(S.kj), 'kJ'], ['Avg HR', S.avgHr ? String(S.avgHr) : '—', 'bpm', 'text-status-danger'], ['Avg cadence', S.avgCadence ? String(S.avgCadence) : '—', 'rpm'], ['Avg speed', speedOf(S.avgSpeedKph / 3.6, u).toFixed(1), unitLabels(u).speed, 'text-secondary'], ['Max power', String(S.maxPower), 'W'], ['Elevation', String(Math.round(elevOf(S.elevationGainM, u))), unitLabels(u).elev]];
  const totalZ = S.zones.reduce((a, b) => a + b, 0) || 1;
  return (
    <div className="max-w-[1440px] mx-auto px-12 py-8 space-y-6">
      <div className="flex items-end justify-between">
        <div><Label className="text-accent">Ride complete · {new Date(ride.startedAt).toLocaleString()}</Label><h1 className="text-headline-lg text-text mt-1">{ride.name}</h1>{ride.simulator && <Chip className="mt-2">Demo trainer — not uploaded anywhere</Chip>} <Chip tone="accent" className="mt-2">+{Math.round(S.movingS / 60) + 10 * (S.stars ?? 0)} XP{S.stars ? ` · ${S.stars} ★` : ''}</Chip></div>
        <div className="flex gap-3"><a href={api.fitUrl(ride.id)} download><Button icon="download">Export FIT</Button></a>{!ride.simulator && <StravaUpload rideId={ride.id} />}<Button variant="primary" onClick={() => nav('/activity')}>Done</Button></div>
      </div>
      {newFtp !== null && (
        <div className="rounded-2xl bg-accent/12 border border-accent/40 p-6 flex items-center justify-between">
          <div><Label className="text-accent">FTP test result</Label><div className="text-headline-lg text-text mt-1">{profile?.ftpW ?? '—'} W → <span className="text-accent font-metric-live text-metric-xl">{newFtp} W</span></div><p className="text-body-md text-text-secondary">{test === 'ramp' ? '75 % of your best 1-minute power.' : '95 % of your best 20-minute average.'}</p></div>
          <Button variant="primary" disabled={applied || newFtp < 50} onClick={() => void applyFtp()}>{applied ? 'FTP updated ✓' : 'Apply new FTP'}</Button>
        </div>
      )}
      <div className="grid grid-cols-6 gap-4">{tiles.map(([l, v, u, tone]) => <div key={l} className="rounded-xl bg-surface-container-low/70 p-4"><Label>{l}</Label><div className="mt-1"><span className={cx('font-metric-live text-metric-lg', tone ?? 'text-text')}>{v}</span> <span className="text-metric-unit text-text-secondary">{u}</span></div></div>)}</div>
      <div className="rounded-2xl bg-surface-container-low/70 p-6"><div className="flex justify-between mb-3"><Label>Power, heart rate and target</Label>{stars > 0 && <span className="text-body-md text-accent"><Icon name="flag" size={16} className="inline" /> {stars} intervals ridden</span>}</div><Chart samples={ride.samples} ftp={ftp} /></div>
      <div className="grid grid-cols-2 gap-6">
        <div className="rounded-2xl bg-surface-container-low/70 p-6"><Label className="mb-4">Time in power zones (FTP {ftp} W)</Label>
          <div className="space-y-2">{S.zones.map((s, i) => <div key={i} className="flex items-center gap-3 text-body-md"><span className="w-28 text-text-secondary">Z{i + 1} {ZONE_NAMES[i]}</span><div className="flex-1 h-3 rounded-full bg-white/6 overflow-hidden"><div className={cx('h-full', ZONE_BG[i])} style={{ width: `${(s / totalZ) * 100}%` }} /></div><span className="w-16 text-right tabular text-text">{fmtTime(s)}</span></div>)}</div></div>
        <div className="rounded-2xl bg-surface-container-low/70 p-6"><Label className="mb-4">Best efforts</Label>
          <div className="grid grid-cols-5 gap-3">{([[5, '5 s'], [60, '1 min'], [300, '5 min'], [1200, '20 min'], [3600, '60 min']] as const).map(([d, l]) => <div key={d} className="rounded-lg bg-black/25 p-3 text-center"><Label>{l}</Label><div className="font-metric-live text-metric-md text-text mt-1">{S.best[d] ?? '—'}<span className="text-metric-unit text-text-secondary ml-1">W</span></div></div>)}</div></div>
      </div>
    </div>
  );
}
