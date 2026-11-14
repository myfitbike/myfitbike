import { Card, Icon, Label } from '../design/primitives';

/** Honest placeholder for screens that arrive in a later phase (no fake data). */
export function Placeholder({ title, phase }: { title: string; phase: number }) {
  return (
    <div className="px-12 py-10">
      <Label className="text-accent mb-2">Coming in phase {phase}</Label>
      <h1 className="text-headline-lg text-text mb-6">{title}</h1>
      <Card className="p-8 max-w-xl flex gap-4 items-start"><Icon name="info" className="text-status-connected" /><p className="text-body-lg text-text-secondary">This screen is part of a later build phase. Pair your devices and set up your profile in the meantime.</p></Card>
    </div>
  );
}
