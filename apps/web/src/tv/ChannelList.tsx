// Curated channel list shared by Settings → TV and the ride's TV menu: filter by category and language, star
// favourites, tap to play in the floating player.
import { useState } from 'react';
import { Icon, Label, cx } from '../design/primitives';
import { CATEGORIES, CHANNELS, LANGUAGES, type TvChannel } from './channels';
import { tv, useTv } from './player';

const chip = (on: boolean) => cx('px-3 py-1.5 rounded-full text-[13px] border capitalize', on ? 'border-accent text-accent bg-accent/10' : 'border-white/12 text-text-secondary hover:bg-white/8');

export function ChannelRow({ ch, fav, onFav }: { ch: TvChannel; fav: boolean; onFav: () => void }) {
  const s = useTv(); const on = s.channel?.id === ch.id;
  return (
    <div className={cx('flex items-center gap-3 rounded-xl px-3 py-2', on ? 'bg-accent/10' : 'hover:bg-white/5')}>
      <button type="button" onClick={() => (on ? tv.stop() : void tv.play(ch))} aria-label={on ? `Stop ${ch.name}` : `Play ${ch.name}`}
        className={cx('w-10 h-10 shrink-0 rounded-full flex items-center justify-center border', on ? 'border-accent text-accent' : 'border-white/15 text-text hover:bg-white/10')}>
        <Icon name={on ? 'stop' : 'play_arrow'} size={20} /></button>
      <div className="min-w-0 flex-1"><div className="text-body-md text-text truncate">{ch.name}{on && s.status === 'loading' ? ' · tuning in…' : ''}</div>
        <div className="text-[12px] text-text-secondary truncate capitalize">{ch.category} · {ch.language} · {ch.owner}</div></div>
      <button type="button" onClick={onFav} aria-label={fav ? `Remove ${ch.name} from favourites` : `Add ${ch.name} to favourites`} aria-pressed={fav}
        className={cx('w-9 h-9 rounded-full flex items-center justify-center hover:bg-white/10', fav ? 'text-accent' : 'text-text-muted')}><Icon name="star" size={20} /></button>
    </div>
  );
}

export function ChannelList({ isFav, onFav }: { isFav: (id: string) => boolean; onFav: (id: string) => void }) {
  const [cat, setCat] = useState<string | null>(null); const [lang, setLang] = useState<string | null>(null);
  const list = CHANNELS.filter((c) => (!cat || c.category === cat) && (!lang || c.language === lang));
  return (
    <div className="space-y-3">
      <div><Label className="mb-2">Category</Label><div className="flex flex-wrap gap-2">
        <button type="button" className={chip(!cat)} onClick={() => setCat(null)}>All</button>
        {CATEGORIES.filter((c) => CHANNELS.some((x) => x.category === c)).map((c) => <button key={c} type="button" className={chip(cat === c)} onClick={() => setCat(cat === c ? null : c)}>{c}</button>)}</div></div>
      <div><Label className="mb-2">Language</Label><div className="flex flex-wrap gap-2">
        <button type="button" className={chip(!lang)} onClick={() => setLang(null)}>All</button>
        {LANGUAGES.map((l) => <button key={l} type="button" className={chip(lang === l)} onClick={() => setLang(lang === l ? null : l)}>{l}</button>)}</div></div>
      <div className="divide-y divide-white/5">{list.map((c) => <ChannelRow key={c.id} ch={c} fav={isFav(c.id)} onFav={() => onFav(c.id)} />)}</div>
      {!list.length && <p className="text-body-md text-text-secondary">No channels match these filters.</p>}
    </div>
  );
}
