// Radio in the ride (PLAN 16.24): favourites in the ride menu (tap to play, stop, mute) and a one-tap mute button on
// the HUD while a station plays. Plays through pauses; stops when the ride screen closes.
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { RadioStation } from '@myfitbike/shared';
import { Button, Card, IconButton, Label, cx } from '../design/primitives';
import { api } from '../app/api';
import { addFavourite, radio, removeFavourite } from './player';
import { useRadio } from './useRadio';
import { StationFinder } from './StationFinder';

/** Search any station mid-ride (not just favourites); what you play keeps playing when this closes. */
function FindStationModal({ favourites, onFavourites, onClose }: { favourites: RadioStation[]; onFavourites: (l: RadioStation[]) => void; onClose: () => void }) {
  const isFav = (u: string) => favourites.some((f) => f.uuid === u);
  const toggle = (st: RadioStation) => { const l = isFav(st.uuid) ? removeFavourite(favourites, st.uuid) : addFavourite(favourites, st); onFavourites(l); void api.saveSetting('radio.favourites', l); };
  return createPortal( /* to <body>: the ride menu drawer would otherwise box in a fixed overlay */
    <div className="fixed inset-0 z-[80] bg-black/60 flex items-center justify-center p-4" role="dialog" aria-modal aria-labelledby="find-station" onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Escape') onClose(); }}>
      <Card level={3} className="w-full max-w-[720px] max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between p-5 pb-3"><h2 id="find-station" className="text-headline-md text-text">Find a station</h2><IconButton icon="close" label="Close" onClick={onClose} /></div>
        <div className="overflow-y-auto px-5 pb-5"><StationFinder isFav={isFav} onFav={toggle} playLabel="Play" /></div>
      </Card>
    </div>, document.body);
}

export function RideRadioMenu({ favourites, onFavourites }: { favourites: RadioStation[]; onFavourites: (l: RadioStation[]) => void }) {
  const r = useRadio(); const [finding, setFinding] = useState(false);
  return (
    <div className="pt-4"><div className="flex items-center justify-between mb-2"><Label>Radio</Label>{r.station && <div className="flex gap-2">
      <Button size="sm" icon={r.muted ? 'volume_off' : 'volume_up'} onClick={() => radio.toggleMute()}>{r.muted ? 'Unmute' : 'Mute'}</Button><Button size="sm" icon="stop" onClick={() => radio.stop()}>Stop</Button></div>}</div>
      {r.status === 'error' && <p className="text-[12px] text-status-danger mb-2">{r.error}</p>}
      {favourites.length ? <div className="flex flex-wrap gap-2">{favourites.map((f) => { const on = r.station?.uuid === f.uuid; return (
        <button key={f.uuid} onClick={() => (on ? radio.stop() : void radio.play(f))} className={cx('px-3 py-2 rounded-lg text-body-md text-left max-w-full truncate border', on ? 'border-accent text-accent bg-accent/10' : 'border-white/12 text-text hover:bg-white/8')}>
          {on && r.status === 'loading' ? '… ' : on ? '♪ ' : ''}{f.name}</button>); })}</div>
        : <p className="text-body-md text-text-secondary">No favourites yet — find a station and tap its star.</p>}
      <Button size="sm" icon="search" className="mt-3" onClick={() => setFinding(true)}>Find a station</Button>
      {finding && <FindStationModal favourites={favourites} onFavourites={onFavourites} onClose={() => setFinding(false)} />}
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
