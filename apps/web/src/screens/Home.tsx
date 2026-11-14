// Home — shell content from E3 veloworld_home_dashboard. Phase 1 shows only what exists: devices and setup.
// Hero cards, route rows and weekly totals arrive with workouts (Phase 2) and routes (Phase 3); no placeholder data.
import { useNavigate } from 'react-router';
import { Button, Card, Chip, Icon, Label } from '../design/primitives';
import { useApp } from '../app/store';

export function Home() {
  const nav = useNavigate(); const profile = useApp((s) => s.profile); const trainer = useApp((s) => s.slots.trainer);
  return (
    <div className="px-12 py-10 max-w-[1440px] mx-auto space-y-10">
      <div><Label className="text-accent mb-2">Welcome back</Label><h1 className="text-headline-lg text-text">Hello, {profile?.name}</h1></div>
      <section>
        <Label className="mb-4 tracking-widest">Quick start modes</Label>
        <div className="grid grid-cols-3 gap-6">
          {[{ t: 'Just Ride', d: 'Free ride on Velora with simulated gradient physics.', chip: 'Phase 3', icon: 'map' as const }, { t: 'Start Power', d: 'Hold a fixed wattage in ERG, whatever your cadence.', chip: 'Workouts →', icon: 'bolt' as const, to: '/workouts' }, { t: 'Start Slope', d: 'Ride at a constant gradient from -2 % to +16 %.', chip: 'Workouts →', icon: 'landscape' as const, to: '/workouts' }].map((m) => (
            <Card key={m.t} className="p-6 flex flex-col gap-3 relative">{'to' in m && <button className="absolute inset-0" aria-label={m.t} onClick={() => nav((m as { to: string }).to)} />}
              <div className="flex justify-between"><span className="w-10 h-10 rounded-lg bg-white/8 flex items-center justify-center text-accent"><Icon name={m.icon} /></span><Chip>{m.chip}</Chip></div>
              <h3 className="text-headline-md text-text">{m.t}</h3><p className="text-body-md text-on-surface-variant">{m.d}</p>
            </Card>
          ))}
        </div>
      </section>
      <Card className="p-6 flex items-center justify-between">
        <div className="flex items-center gap-4"><Icon name="sensors" className="text-secondary" size={28} /><div><div className="text-body-lg font-semibold text-text">{trainer.status === 'connected' ? `${trainer.name} connected` : 'No trainer connected'}</div><div className="text-body-md text-text-secondary">Pair your Flux 2, cadence sensor and heart-rate strap, or use the demo trainer.</div></div></div>
        <Button variant="primary" iconRight="arrow_forward" onClick={() => nav('/sensors')}>Open sensors</Button>
      </Card>
    </div>
  );
}
