// Trainer calibration (FTMS spin-down) as a guided panel. The trainer drives it: after "start" it replies with a
// speed to pedal past, then reports "stop pedalling" and finally success or error on Machine Status. Without these
// steps the Calibrate button looked dead — the command went out and nothing on screen changed.
import { useEffect, useRef, useState } from 'react';
import { speedOf, unitLabels } from '@myfitbike/shared';
import { Button, Card, Icon, Label } from '../design/primitives';
import { useUnits } from '../app/store';
import { telemetry } from '../devices/telemetry';
import { FtmsError, type FtmsTrainer } from '../devices/FtmsTrainer';
import { RESULT } from '../devices/codecs/ftms';

type Phase = 'starting' | 'speedUp' | 'coast' | 'done' | 'error';
const STEP_TIMEOUT_S = 90; /* no word from the trainer for this long → say so instead of waiting forever */

export function CalibrateDialog({ trainer, onClose }: { trainer: FtmsTrainer; onClose: () => void }) {
  const u = useUnits(); const [phase, setPhase] = useState<Phase>('starting'); const [err, setErr] = useState<string | null>(null);
  const [target, setTarget] = useState<number | null>(null); const [speed, setSpeed] = useState<number | null>(null); const lastStep = useRef(Date.now());
  const step = (p: Phase, e: string | null = null) => { lastStep.current = Date.now(); setPhase(p); setErr(e); };

  function start() {
    step('starting'); setTarget(null);
    trainer.startSpinDown().then((t) => { setTarget(t?.highKph ?? null); step('speedUp'); }).catch((e: unknown) => {
      const r = e instanceof FtmsError ? e.result : null;
      step('error', r === RESULT.notSupported ? 'This trainer doesn’t accept calibration over Bluetooth FTMS. Use the Tacx app on your phone.'
        : r === RESULT.failed || r === RESULT.invalidParameter ? 'The trainer refused to start calibration. Stop pedalling, wait a few seconds and try again.'
        : `No reply from the trainer (${(e as Error).message}). Check it’s powered and try again.`);
    });
  }
  useEffect(() => {
    trainer.onSpinDown = (s) => { if (s === 'speedUp') step('speedUp'); else if (s === 'stopPedalling') step('coast'); else if (s === 'success') step('done'); else step('error', 'Calibration didn’t finish — the speed dropped too early or you kept pedalling. Try again.'); };
    start();
    const id = setInterval(() => {
      setSpeed(telemetry.speedKph);
      setPhase((p) => { if ((p === 'speedUp' || p === 'coast') && Date.now() - lastStep.current > STEP_TIMEOUT_S * 1000) { setErr('The trainer stopped reporting progress. Try again, or calibrate with the Tacx app.'); return 'error'; } return p; });
    }, 250);
    return () => { clearInterval(id); trainer.onSpinDown = () => {}; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const sp = (kph: number) => `${Math.round(speedOf(kph / 3.6, u))} ${unitLabels(u).speed}`;
  const reached = target !== null && speed !== null && speed >= target;
  return (
    <div className="fixed inset-0 z-[70] bg-black/50 flex items-center justify-center p-4" role="dialog" aria-modal aria-labelledby="cal-title">
      <Card level={3} className="p-8 w-full max-w-[480px] space-y-5">
        <div><Label className="text-accent">Calibrate trainer · spin-down</Label><h2 id="cal-title" className="text-headline-md text-text mt-1">
          {phase === 'starting' ? 'Asking the trainer…' : phase === 'speedUp' ? 'Pedal up to speed' : phase === 'coast' ? 'Stop pedalling now' : phase === 'done' ? 'Calibrated' : 'Calibration stopped'}</h2></div>
        {phase === 'speedUp' && <p className="text-body-md text-on-surface-variant">{target ? `Ride steadily above ${sp(target)}. The trainer tells you when to stop.` : 'Pedal hard until the trainer tells you to stop (usually around 35 km/h).'}</p>}
        {phase === 'coast' && <p className="text-body-md text-on-surface-variant">Keep your feet still and let the flywheel spin down by itself. Don’t brake or pedal.</p>}
        {phase === 'done' && <p className="text-body-md text-on-surface-variant">The trainer measured its resistance. Power readings are now calibrated for today’s temperature and tyre pressure.</p>}
        {phase === 'error' && <p role="alert" className="text-body-md text-status-danger">{err}</p>}
        {(phase === 'speedUp' || phase === 'coast') && (
          <div className="rounded-xl bg-black/30 p-4 flex items-baseline justify-between">
            <Label>Speed</Label><span className={reached || phase === 'coast' ? 'font-metric-live text-metric-xl text-status-success' : 'font-metric-live text-metric-xl text-text'}>{speed === null ? '—' : sp(speed)}</span>
          </div>)}
        {phase === 'done' && <Icon name="check_circle" size={40} className="text-status-success" />}
        <div className="flex gap-3 justify-end">
          {phase === 'error' && <Button variant="primary" icon="refresh" onClick={start}>Try again</Button>}
          <Button variant={phase === 'done' ? 'primary' : 'ghost'} onClick={onClose}>{phase === 'done' || phase === 'error' ? 'Close' : 'Cancel'}</Button>
        </div>
      </Card>
    </div>
  );
}
