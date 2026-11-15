// Settings → TV: a hand-picked list of free live channels from the broadcasters themselves (official streams, https
// only — see tv/channels.ts). Star favourites for the ride menu; playing opens the floating player.
import { useEffect, useState } from 'react';
import { Label } from '../design/primitives';
import { api } from '../app/api';
import { CHANNELS, channelById } from '../tv/channels';
import { ChannelList, ChannelRow } from '../tv/ChannelList';
import { toggleFavourite } from '../tv/player';

export function TvSettings() {
  const [favs, setFavs] = useState<string[]>([]);
  useEffect(() => { void api.getSettings().then((s) => setFavs(((s?.['tv.favourites'] as string[] | undefined) ?? []).filter((id) => channelById(id)))); }, []);
  const toggle = (id: string) => { const l = toggleFavourite(favs, id); setFavs(l); void api.saveSetting('tv.favourites', l); };
  const favChannels = favs.map(channelById).filter((c) => !!c);
  return (
    <section className="rounded-2xl bg-surface-container-low/70 backdrop-blur-xl p-5 md:p-8 shadow-ambient space-y-6">
      <div><Label className="text-accent mb-1">Watch while you ride</Label><h2 className="text-headline-lg text-text uppercase">TV</h2>
        <p className="text-body-md text-on-surface-variant mt-1">{CHANNELS.length} free live channels, streamed directly from the broadcasters (official streams over https only). Playing a channel opens a small player you can drag to any corner — or pop it out into your browser’s picture-in-picture window. Star channels to find them in the ride menu. Some channels may be unavailable in your country.</p></div>
      <div><Label className="mb-2">Favourites · {favChannels.length}</Label>
        {favChannels.length ? favChannels.map((c) => <ChannelRow key={c.id} ch={c} fav onFav={() => toggle(c.id)} />) : <p className="text-body-md text-text-secondary">No favourites yet — tap the star on a channel below.</p>}</div>
      <ChannelList isFav={(id) => favs.includes(id)} onFav={toggle} />
    </section>
  );
}
