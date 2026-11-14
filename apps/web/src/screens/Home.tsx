// Home — E3 veloworld_home_dashboard (plan 10.5 E): hero cards (plan, recommended workout), quick-start tiles
// (Just Ride, Start Power, Start Slope — two clicks from launch), Velora route cards, weekly summary. Real data only.
import { distOf, effectiveFtp, elevOf, flatten, unitLabels } from '@myfitbike/shared';
import { useApp, useUnits } from '../app/store';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Button, Card, Chip, Icon, Label } from '../design/primitives';
import { api } from '../app/api';
import { useProgress } from '../app/useProgress';
import { FinishProfileCard } from '../app/FinishProfileCard';
import { BUILTIN, PLANS } from '../app/workouts';
import { allRoutes, difficultyOf, mapUrl, regionName } from '../app/routesData';
import { WorkoutGraph } from '../hud/WorkoutGraph';
import { StageProfile } from '../hud/StageProfile';
import { fmtTime } from '../hud/zones';

export function Home() {
  const u = useUnits();
  const nav = useNavigate(); const profile = useApp((s) => s.profile); const trainer = useApp((s) => s.slots.trainer); const prog = useProgress(); const ftp = profile ? effectiveFtp(profile) : 200;
  const [plan, setPlan] = useState<{ id: string; startedAt: string } | null>(null); const [w, setW] = useState(150); const [g, setG] = useState(4);
  useEffect(() => { api.getSettings().then((s) => setPlan((s?.['plan.active'] as never) ?? null)).catch(() => {}); }, []);
  const active = PLANS.find((p) => p.id === plan?.id); const week = active ? Math.min(active.weeks.length, Math.floor((Date.now() - new Date(plan!.startedAt).getTime()) / (7 * 864e5)) + 1) : 0;
  const nextId = active ? active.weeks[week - 1]?.[Math.min((prog?.weekly.rides ?? 0), (active.weeks[week - 1]?.length ?? 1) - 1)] : undefined;
  const rec = BUILTIN.find((x) => x.id === (nextId ?? (profile?.ftpW ? 'builtin-ss-4x10' : 'builtin-test-ramp'))) ?? BUILTIN[0]!;
  const routes = allRoutes().slice(0, 3);
  return (
    <div className="max-w-[1440px] mx-auto px-10 py-8 space-y-8">
      <FinishProfileCard />
      <div className="grid grid-cols-2 gap-6">
        <Card className="p-7 flex flex-col">
          <Label className="text-accent flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-accent" />{active ? 'Your plan' : 'Recommended plan'}</Label>
          <h2 className="text-headline-lg text-text mt-2">{active?.name ?? PLANS[0]!.name}</h2>
          <p className="text-body-md text-on-surface-variant mt-2 flex-1">{active?.description ?? PLANS[0]!.description}</p>
          <div className="flex gap-2 my-4"><Chip icon="timer">{(active ?? PLANS[0]!).weeks.length} weeks</Chip><Chip icon="sync">{(active ?? PLANS[0]!).weeks[0]!.length} rides / week</Chip></div>
          <div className="flex justify-between items-center"><div><Label>{active ? `Week ${week} · next session` : 'Starts with'}</Label><div className="text-body-lg text-text font-semibold">{rec.name}</div></div>
            <Button variant="primary" iconRight="arrow_forward" onClick={() => (active ? nav(`/workouts/${rec.id}`) : nav('/training'))}>{active ? 'Continue plan' : 'View plans'}</Button></div>
        </Card>
        <Card className="p-7 flex flex-col">
          <div className="flex justify-between"><Label className="text-accent flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-accent" />Recommended workout</Label><Chip>{rec.tss} TSS · IF {rec.if.toFixed(2)}</Chip></div>
          <h2 className="text-headline-lg text-text mt-2">{rec.name}</h2>
          <div className="text-body-md text-text-secondary">{Math.round(rec.durationS / 60)} min · at your FTP {ftp} W</div>
          <div className="rounded-xl bg-black/30 h-32 p-2 my-4"><WorkoutGraph blocks={flatten(rec.steps)} ftp={ftp} className="w-full h-full" /></div>
          <div className="flex justify-end"><Button icon="play_arrow" onClick={() => nav(`/ride?mode=${rec.test === 'ramp' ? 'ftpRamp' : 'workout'}&workout=${rec.id}`)}>Start workout in ERG</Button></div>
        </Card>
      </div>

      <section><Label className="mb-3 tracking-widest">Quick start modes</Label>
        <div className="grid grid-cols-3 gap-6">
          <Card className="p-6 flex flex-col gap-3"><div className="flex justify-between"><span className="w-10 h-10 rounded-lg bg-white/8 flex items-center justify-center text-accent"><Icon name="map" /></span><Chip>Free simulation</Chip></div><h3 className="text-headline-md text-text">Just Ride</h3><p className="text-body-md text-on-surface-variant flex-1">Ride Velora with gradient physics, starting at the Port Anchor pier.</p><Button variant="ghost" iconRight="arrow_forward" onClick={() => nav('/ride?mode=route&route=harbour-spin')}>Harbour Spin</Button></Card>
          <Card className="p-6 flex flex-col gap-3"><div className="flex justify-between"><span className="w-10 h-10 rounded-lg bg-white/8 flex items-center justify-center text-accent"><Icon name="bolt" /></span><Chip tone="accent">Hold target watts</Chip></div><h3 className="text-headline-md text-text">Start Power</h3><p className="text-body-md text-on-surface-variant flex-1">Fixed ERG power whatever your cadence.</p>
            <div className="flex justify-between items-center"><span className="inline-flex items-center gap-2"><Button size="sm" icon="remove" aria-label="less power" onClick={() => setW((v) => Math.max(50, v - 10))} /><span className="font-metric-live text-metric-md text-accent">{w} W</span><Button size="sm" icon="add" aria-label="more power" onClick={() => setW((v) => v + 10)} /></span><Button size="sm" onClick={() => nav(`/ride?mode=startPower&w=${w}`)}>Engage ERG</Button></div></Card>
          <Card className="p-6 flex flex-col gap-3"><div className="flex justify-between"><span className="w-10 h-10 rounded-lg bg-white/8 flex items-center justify-center text-secondary"><Icon name="landscape" /></span><Chip tone="connected">Custom incline</Chip></div><h3 className="text-headline-md text-text">Start Slope</h3><p className="text-body-md text-on-surface-variant flex-1">A constant gradient from −2 % to +16 %.</p>
            <div className="flex justify-between items-center"><span className="inline-flex items-center gap-2"><Button size="sm" icon="remove" aria-label="less slope" onClick={() => setG((v) => Math.max(-2, v - 0.5))} /><span className="font-metric-live text-metric-md text-secondary">{g.toFixed(1)} %</span><Button size="sm" icon="add" aria-label="more slope" onClick={() => setG((v) => Math.min(16, v + 0.5))} /></span><Button size="sm" onClick={() => nav(`/ride?mode=startSlope&g=${g}`)}>Lock slope</Button></div></Card>
        </div></section>

      <section><div className="flex justify-between mb-3"><Label className="tracking-widest">Explore Velora</Label><button className="text-label-caps uppercase text-accent" onClick={() => nav('/routes')}>View all routes ›</button></div>
        <div className="grid grid-cols-3 gap-6">{routes.map((r) => (
          <Card key={r.id} className="overflow-hidden"><button className="relative h-40 w-full" onClick={() => nav(`/routes/${r.id}`)}><img src={mapUrl(r)} alt="" className="absolute inset-0 w-full h-full object-cover" /><div className="absolute top-3 left-3 flex gap-2"><Chip className="bg-black/50">{regionName(r.region)}</Chip><Chip className="bg-black/50" tone="accent">{difficultyOf(r)}</Chip></div></button>
            <div className="p-5"><h3 className="text-headline-md text-text">{r.name}</h3><div className="flex gap-6 my-2 text-body-md"><span><b className="font-metric-live text-metric-md text-text">{distOf(r.lengthM, u).toFixed(1)}</b> {unitLabels(u).dist}</span><span><b className="font-metric-live text-metric-md text-accent">{Math.round(elevOf(r.ascentM, u))}</b> {unitLabels(u).elev}</span></div>
              <div className="h-12"><StageProfile route={r} banners={false} className="w-full h-full" /></div><div className="flex justify-end mt-3"><Button size="sm" variant="primary" onClick={() => nav(`/ride?mode=route&route=${r.id}`)}>Ride route</Button></div></div></Card>))}</div></section>

      <section><Label className="mb-3 tracking-widest">This week's training summary</Label>
        <Card className="p-6 grid grid-cols-5 gap-6">{[['Distance', prog ? distOf(prog.weekly.km * 1000, u).toFixed(1) : '—', unitLabels(u).dist], ['Ride time', prog ? fmtTime(prog.weekly.hours * 3600) : '—', ''], ['Stress', prog ? String(prog.weekly.tss) : '—', 'TSS'], ['Rides', prog ? String(prog.weekly.rides) : '—', ''], ['Streak', prog ? String(prog.streakWeeks) : '—', 'weeks']].map(([l, v, u]) => <div key={l}><Label>{l}</Label><div><span className="font-metric-live text-metric-xl text-text">{v}</span> <span className="text-metric-unit text-text-secondary">{u}</span></div></div>)}</Card></section>

      {trainer.status !== 'connected' && <Card className="p-5 flex items-center justify-between"><div className="flex items-center gap-3"><Icon name="sensors" className="text-secondary" /><span className="text-body-lg text-text">No trainer connected — pair the Flux 2 or use the demo trainer.</span></div><Button variant="primary" onClick={() => nav('/sensors')}>Open sensors</Button></Card>}
    </div>
  );
}
