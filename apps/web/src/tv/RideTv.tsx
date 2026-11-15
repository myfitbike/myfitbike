// TV in the ride menu: favourite channels as one-tap buttons, "Browse channels" for the full curated list. The picture
// plays in the floating mini-player (bottom-left by default, clear of the main HUD numbers).
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Button, Card, IconButton, Label, cx } from '../design/primitives';
import { api } from '../app/api';
import { channelById } from './channels';
import { ChannelList } from './ChannelList';
import { toggleFavourite, tv, useTv } from './player';

function BrowseModal({ favourites, onFavourites, onClose }: { favourites: string[]; onFavourites: (l: string[]) => void; onClose: () => void }) {
  const toggle = (id: string) => { const l = toggleFavourite(favourites, id); onFavourites(l); void api.saveSetting('tv.favourites', l); };
  return createPortal( /* to <body>: the menu drawer would box in a fixed overlay */
    <div className="fixed inset-0 z-[80] bg-black/60 flex items-center justify-center p-4" role="dialog" aria-modal aria-labelledby="browse-tv" onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Escape') onClose(); }}>
      <Card level={3} className="w-full max-w-[720px] max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between p-5 pb-3"><h2 id="browse-tv" className="text-headline-md text-text">TV channels</h2><IconButton icon="close" label="Close" onClick={onClose} /></div>
        <div className="overflow-y-auto px-5 pb-5"><ChannelList isFav={(id) => favourites.includes(id)} onFav={toggle} /></div>
      </Card>
    </div>, document.body);
}

export function RideTvMenu({ favourites, onFavourites }: { favourites: string[]; onFavourites: (l: string[]) => void }) {
  const s = useTv(); const [browsing, setBrowsing] = useState(false);
  const favs = favourites.map(channelById).filter((c) => !!c);
  return (
    <div className="pt-4"><div className="flex items-center justify-between mb-2"><Label>TV</Label>
      {s.channel && <Button size="sm" icon="stop" onClick={() => tv.stop()}>Stop</Button>}</div>
      {favs.length ? <div className="flex flex-wrap gap-2">{favs.map((c) => { const on = s.channel?.id === c.id; return (
        <button key={c.id} onClick={() => (on ? tv.stop() : void tv.play(c))} className={cx('px-3 py-2 rounded-lg text-body-md text-left max-w-full truncate border', on ? 'border-accent text-accent bg-accent/10' : 'border-white/12 text-text hover:bg-white/8')}>
          {on && s.status === 'loading' ? '… ' : on ? '▶ ' : ''}{c.name}</button>); })}</div>
        : <p className="text-body-md text-text-secondary">No favourite channels yet — browse and tap a star.</p>}
      <Button size="sm" icon="live_tv" className="mt-3" onClick={() => setBrowsing(true)}>Browse channels</Button>
      {browsing && <BrowseModal favourites={favourites} onFavourites={onFavourites} onClose={() => setBrowsing(false)} />}
    </div>
  );
}
