// Station search shared by Settings → Radio and the ride's radio menu: pick a country to list all its stations and
// narrow them by name/genre, or "All countries" to search the whole directory (radio-browser.info via our API).
import { useEffect, useMemo, useState } from 'react';
import type { RadioStation } from '@myfitbike/shared';
import { Button, Chip, Icon, Label, cx } from '../design/primitives';
import { useApp } from '../app/store';
import { radio } from './player';
import { useRadio } from './useRadio';

const sel = 'h-11 px-3 rounded-control bg-white/6 border border-white/12 text-text text-body-md outline-none focus:border-accent';

export function StationRow({ st, fav, onFav, playLabel = 'Test' }: { st: RadioStation; fav: boolean; onFav: () => void; playLabel?: string }) {
  const r = useRadio(); const playing = r.station?.uuid === st.uuid && r.status !== 'idle';
  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-white/6">
      {st.favicon ? <img src={st.favicon} alt="" loading="lazy" className="w-10 h-10 rounded-lg object-cover bg-white/6 shrink-0" onError={(e) => { (e.target as HTMLImageElement).style.visibility = 'hidden'; }} />
        : <span className="w-10 h-10 rounded-lg bg-white/6 flex items-center justify-center shrink-0"><Icon name="radio" size={20} className="text-text-secondary" /></span>}
      <div className="min-w-0 flex-1"><div className="text-body-md text-text font-semibold truncate">{st.name}</div>
        <div className="text-[12px] text-text-secondary truncate">{[st.country, st.tags.slice(0, 3).join(', '), st.codec && st.codec !== 'UNKNOWN' ? `${st.codec}${st.bitrate ? ` ${st.bitrate} kbps` : ''}` : st.hls ? 'HLS' : ''].filter(Boolean).join(' · ')}</div>
        {playing && r.status === 'error' && <div className="text-[12px] text-status-danger">{r.error}</div>}</div>
      <Button size="sm" icon={playing ? 'stop' : 'play_arrow'} onClick={() => (playing ? radio.stop() : void radio.play(st))}>{playing ? (r.status === 'loading' ? 'Loading…' : 'Stop') : playLabel}</Button>
      <button aria-label={fav ? `Remove ${st.name} from favourites` : `Add ${st.name} to favourites`} onClick={onFav} className={cx('w-9 h-9 rounded-full flex items-center justify-center shrink-0', fav ? 'text-accent' : 'text-text-muted hover:text-text')}><Icon name="star" size={20} /></button>
    </div>
  );
}

export function StationFinder({ isFav, onFav, playLabel }: { isFav: (uuid: string) => boolean; onFav: (st: RadioStation) => void; playLabel?: string }) {
  const [tags, setTags] = useState<{ name: string; count: number }[]>([]); const [countries, setCountries] = useState<{ code: string; name: string; count: number }[]>([]);
  const [q, setQ] = useState(''); const [tag, setTag] = useState(''); const [cc, setCc] = useState(''); const [res, setRes] = useState<RadioStation[] | null>(null); const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  const home = useApp((s) => s.profile?.country ?? null)?.toUpperCase() ?? null;
  const [list, setList] = useState<RadioStation[] | null>(null); /* a country's stations; name and genre then filter them here */
  useEffect(() => { if (home) setCc(home); }, [home]); /* default: the rider's country, if the profile has one */
  useEffect(() => {
    if (!cc) { setList(null); return; } let live = true; setBusy(true); setErr(null); setRes(null);
    fetch(`/api/radio/search?countrycode=${cc}&limit=10000`).then(async (x) => { const j = await x.json(); if (!x.ok) throw new Error(j.error ?? `API ${x.status}`); if (live) setList(j); })
      .catch((e: Error) => live && setErr(e.message)).finally(() => live && setBusy(false));
    return () => { live = false; };
  }, [cc]);
  const shown = useMemo(() => { if (!list) return res; const n = q.trim().toLowerCase(), t = tag.toLowerCase();
    return list.filter((s) => (!n || s.name.toLowerCase().includes(n)) && (!t || s.tags.some((x) => x.toLowerCase().includes(t)))); }, [list, res, q, tag]);
  const [more, setMore] = useState(100); useEffect(() => setMore(100), [cc, q, tag]); /* render 100 rows at a time: big countries have thousands */
  const sortedCountries = useMemo(() => { const mine = countries.find((c) => c.code === home); return mine ? [mine, ...countries.filter((c) => c !== mine)] : countries; }, [countries, home]);
  useEffect(() => { void fetch('/api/radio/tags').then((x) => (x.ok ? x.json() : [])).then(setTags).catch(() => {}); void fetch('/api/radio/countries').then((x) => (x.ok ? x.json() : [])).then(setCountries).catch(() => {}); }, []);
  async function search() {
    setBusy(true); setErr(null);
    try { const p = new URLSearchParams(); if (q.trim()) p.set('name', q.trim()); if (tag) p.set('tag', tag); if (cc) p.set('countrycode', cc);
      const x = await fetch(`/api/radio/search?${p}`); const j = await x.json(); if (!x.ok) throw new Error(j.error ?? `API ${x.status}`); setRes(j); }
    catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  return (
    <div className="space-y-3"><Label>Find stations</Label>
        <form className="flex flex-wrap gap-3" onSubmit={(e) => { e.preventDefault(); if (!list) void search(); }}>
          <input aria-label="Station name" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Station name" className={cx(sel, 'flex-1 min-w-48')} />
          <select aria-label="Genre" value={tag} onChange={(e) => setTag(e.target.value)} className={sel}><option value="">Any genre</option>{tags.map((t) => <option key={t.name} value={t.name}>{t.name}</option>)}</select>
          <select aria-label="Country" value={cc} onChange={(e) => setCc(e.target.value)} className={cx(sel, 'max-w-60')}><option value="">All countries (search)</option>{sortedCountries.map((c) => <option key={c.code} value={c.code}>{c.code === home ? `${c.name} (your country)` : c.name} · {c.count}</option>)}</select>
          {list ? <span className="self-center text-body-md text-text-secondary">{busy ? 'Loading stations…' : `${shown?.length ?? 0} of ${list.length} stations`}</span>
            : <Button variant="primary" icon="search" type="submit" disabled={busy}>{busy ? 'Searching…' : 'Search'}</Button>}
        </form>
        {err && <Chip tone="danger">{err}</Chip>}
        {list && <p className="text-[12px] text-text-muted">Most popular first. Type a name or pick a genre to narrow the list; choose “All countries” to search the whole directory.</p>}
        {shown && (shown.length ? <div>{shown.slice(0, more).map((st) => <StationRow key={st.uuid} st={st} fav={isFav(st.uuid)} onFav={() => onFav(st)} playLabel={playLabel} />)}
          {shown.length > more && <div className="flex justify-center pt-4"><Button onClick={() => setMore((m) => m + 100)}>Show more ({shown.length - more} left)</Button></div>}</div> : <p className="text-body-md text-text-secondary">No working stations match — try fewer filters.</p>)}
      </div>
  );
}
