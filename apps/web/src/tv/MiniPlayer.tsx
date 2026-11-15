// Floating TV player (picture-in-picture inside the app). Shown on every screen while a channel plays, including the
// ride: drag it by its title bar and it snaps to the nearest corner; small or large; mute, volume, the browser's own
// picture-in-picture window, close. It starts bottom-left, away from the ride HUD's main numbers.
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon, cx } from '../design/primitives';
import type { IconName } from '../design/icons.generated';
import { tv, useTv } from './player';

type Corner = 'bl' | 'br' | 'tl' | 'tr';
const KEY = 'tv.mini'; /* per-browser convenience: last corner and size */
const load = (): { corner: Corner; large: boolean } => { try { return { corner: 'bl', large: false, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }; } catch { return { corner: 'bl', large: false }; } };
const save = (v: { corner: Corner; large: boolean }) => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* private mode */ } };
/** Compact title-bar button (the shared 48 px icon button is too big for a 320 px player). */
const Btn = ({ icon, label, on, onClick }: { icon: IconName; label: string; on?: boolean; onClick: () => void }) => (
  <button type="button" aria-label={label} title={label} onClick={onClick} className={cx('w-8 h-8 rounded-full flex items-center justify-center hover:bg-white/12 focus-visible:outline-1 focus-visible:outline-accent', on ? 'text-accent' : 'text-text')}><Icon name={icon} size={18} /></button>);
const PLACE: Record<Corner, string> = { bl: 'left-4 bottom-4', br: 'right-4 bottom-4', tl: 'left-4 top-20', tr: 'right-4 top-20' };

export function TvMiniPlayer() {
  const s = useTv(); const frame = useRef<HTMLDivElement>(null); const box = useRef<HTMLDivElement>(null);
  const [pref, setPref] = useState(load); const [drag, setDrag] = useState<{ x: number; y: number } | null>(null); const start = useRef({ px: 0, py: 0, x: 0, y: 0 });
  const update = (p: Partial<typeof pref>) => setPref((o) => { const n = { ...o, ...p }; save(n); return n; });

  useEffect(() => { if (s.channel && frame.current) frame.current.appendChild(tv.element()); }, [s.channel]);
  if (!s.channel) return null;

  const onDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button,input')) return;
    const r = box.current!.getBoundingClientRect(); start.current = { px: e.clientX, py: e.clientY, x: r.left, y: r.top };
    setDrag({ x: r.left, y: r.top }); (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => { if (drag) setDrag({ x: start.current.x + e.clientX - start.current.px, y: start.current.y + e.clientY - start.current.py }); };
  const onUp = () => {
    if (!drag || !box.current) return; const r = box.current.getBoundingClientRect(); const cx_ = r.left + r.width / 2, cy = r.top + r.height / 2;
    update({ corner: `${cy < innerHeight / 2 ? 't' : 'b'}${cx_ < innerWidth / 2 ? 'l' : 'r'}` as Corner }); setDrag(null);
  };

  return createPortal(
    <div ref={box} role="region" aria-label={`TV: ${s.channel.name}`} onKeyDown={(e) => e.stopPropagation() /* keep ride shortcuts off while using the player */}
      className={cx('fixed z-[75] rounded-xl overflow-hidden shadow-2xl border border-white/12 bg-surface-container-high/95 backdrop-blur-md', pref.large ? 'w-[min(480px,calc(100vw-2rem))]' : 'w-[min(320px,calc(100vw-2rem))]', !drag && PLACE[pref.corner])}
      style={drag ? { left: drag.x, top: drag.y } : undefined}>
      <div onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} className="flex items-center gap-1 pl-3 pr-1 py-1 cursor-grab active:cursor-grabbing select-none touch-none">
        <Icon name="live_tv" size={16} className="text-accent shrink-0" />
        <span className="text-[13px] text-text font-semibold truncate flex-1">{s.channel.name}</span>
        <Btn icon={s.muted ? 'volume_off' : 'volume_up'} label={s.muted ? 'Unmute' : 'Mute'} onClick={() => tv.toggleMute()} />
        {tv.pipSupported && <Btn icon="picture_in_picture_alt" label={s.pip ? 'Back to the app' : 'Picture-in-picture window'} on={s.pip} onClick={() => void tv.togglePip()} />}
        <Btn icon={pref.large ? 'close_fullscreen' : 'open_in_full'} label={pref.large ? 'Smaller' : 'Larger'} onClick={() => update({ large: !pref.large })} />
        <Btn icon="close" label="Close TV" onClick={() => tv.stop()} />
      </div>
      <div className="relative aspect-video bg-black">
        <div ref={frame} className="absolute inset-0" />
        {s.pip && <div className="absolute inset-0 flex items-center justify-center text-[12px] text-text-secondary bg-black">Playing in the picture-in-picture window</div>}
        {s.status === 'loading' && !s.pip && <div className="absolute inset-0 flex items-center justify-center text-[12px] text-text-secondary">Tuning in…</div>}
        {s.status === 'error' && <div role="alert" className="absolute inset-0 flex items-center justify-center p-4 text-center text-[13px] text-status-danger bg-black/80">{s.error}</div>}
      </div>
      {pref.large && <div className="flex items-center gap-2 px-3 py-2"><Icon name="volume_up" size={16} className="text-text-secondary" />
        <input aria-label="TV volume" type="range" min={0} max={100} value={Math.round(s.volume * 100)} onChange={(e) => tv.setVolume(Number(e.target.value) / 100)} className="flex-1 accent-accent" /></div>}
    </div>, document.body);
}
