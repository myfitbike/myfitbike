// Settings → Radio (PLAN 16.24): find free online stations by name, genre and country (radio-browser.info), test-play
// them, and keep favourites for the ride screen's radio button.
import { useEffect, useState } from 'react';
import type { RadioStation } from '@myfitbike/shared';
import { Icon, Label } from '../design/primitives';
import { api } from '../app/api';
import { addFavourite, radio, removeFavourite } from '../radio/player';
import { useRadio } from '../radio/useRadio';
import { StationFinder, StationRow } from '../radio/StationFinder';

export function RadioSettings() {
  const [favs, setFavs] = useState<RadioStation[]>([]); const r = useRadio();
  useEffect(() => {
    void api.getSettings().then((s) => { setFavs((s?.['radio.favourites'] as RadioStation[] | undefined) ?? []); radio.setVolume(Number(s?.['radio.volume'] ?? 70) / 100); });
    return () => radio.stop(); // test-play ends when you leave this page
  }, []);
  const saveFavs = (l: RadioStation[]) => { setFavs(l); void api.saveSetting('radio.favourites', l); };
  const isFav = (u: string) => favs.some((f) => f.uuid === u);
  const toggle = (st: RadioStation) => saveFavs(isFav(st.uuid) ? removeFavourite(favs, st.uuid) : addFavourite(favs, st));
  return (
    <section className="rounded-2xl bg-surface-container-low/70 backdrop-blur-xl p-5 md:p-8 shadow-ambient space-y-6">
      <div><Label className="text-accent mb-1">Music while you ride</Label><h2 className="text-headline-lg text-text uppercase">Radio</h2>
        <p className="text-body-md text-on-surface-variant mt-1">Free online stations from around the world. Star the ones you like; during a ride, tap the radio button to play one. Station list from radio-browser.info (open, community-run); audio streams come from each station.</p></div>
      <div className="rounded-xl bg-black/25 p-4 flex flex-wrap items-center gap-4"><Icon name="volume_up" className="text-text-secondary" /><Label>Radio volume</Label>
        <input aria-label="Radio volume" type="range" min={0} max={100} value={Math.round(r.volume * 100)} onChange={(e) => { radio.setVolume(Number(e.target.value) / 100); void api.saveSetting('radio.volume', Number(e.target.value)); }} className="flex-1 min-w-40 accent-accent" />
        <span className="font-metric-live text-metric-md text-text w-12 text-right">{Math.round(r.volume * 100)}</span></div>
      <div><Label className="mb-2">Favourites · {favs.length}</Label>
        {favs.length ? favs.map((f) => <StationRow key={f.uuid} st={f} fav onFav={() => toggle(f)} />) : <p className="text-body-md text-text-secondary">No favourites yet — search below and tap the star.</p>}</div>
      <StationFinder isFav={isFav} onFav={toggle} />
    </section>
  );
}
