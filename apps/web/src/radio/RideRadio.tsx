// Radio in the ride (PLAN 16.24): favourites in the ride menu (tap to play, stop, mute) and a one-tap mute button on
// the HUD while a station plays. Plays through pauses; stops when the ride screen closes.
import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import type { RadioStation } from '@myfitbike/shared';
import { Button, IconButton, Label, cx } from '../design/primitives';
import { radio } from './player';
import { useRadio } from './useRadio';

export function RideRadioMenu({ favourites }: { favourites: RadioStation[] }) {
  const r = useRadio(); const nav = useNavigate();
  return (
    <div className="pt-4"><div className="flex items-center justify-between mb-2"><Label>Radio</Label>{r.station && <div className="flex gap-2">
      <Button size="sm" icon={r.muted ? 'volume_off' : 'volume_up'} onClick={() => radio.toggleMute()}>{r.muted ? 'Unmute' : 'Mute'}</Button><Button size="sm" icon="stop" onClick={() => radio.stop()}>Stop</Button></div>}</div>
      {r.status === 'error' && <p className="text-[12px] text-status-danger mb-2">{r.error}</p>}
      {favourites.length ? <div className="flex flex-wrap gap-2">{favourites.map((f) => { const on = r.station?.uuid === f.uuid; return (
        <button key={f.uuid} onClick={() => (on ? radio.stop() : void radio.play(f))} className={cx('px-3 py-2 rounded-lg text-body-md text-left max-w-full truncate border', on ? 'border-accent text-accent bg-accent/10' : 'border-white/12 text-text hover:bg-white/8')}>
          {on && r.status === 'loading' ? '… ' : on ? '♪ ' : ''}{f.name}</button>); })}</div>
        : <p className="text-body-md text-text-secondary">No stations yet. <button className="text-accent underline" onClick={() => nav('/settings/radio')}>Pick some in Settings → Radio</button></p>}
    </div>
  );
}

/** HUD button while a station is on: one tap mutes; the title shows what's playing. */
export function RadioHudButton() {
  const r = useRadio();
  useEffect(() => () => radio.stop(), []); // leaving the ride screen stops the radio
  if (!r.station) return null;
  return <IconButton icon={r.muted ? 'volume_off' : 'volume_up'} label={`${r.muted ? 'Unmute' : 'Mute'} ${r.station.name}`} className={r.muted ? 'text-text-muted' : 'text-accent'} onClick={() => radio.toggleMute()} />;
}
