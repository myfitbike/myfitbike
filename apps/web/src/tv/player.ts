// One TV player for the whole app (Settings → TV and the ride menu share it). A single <video> element that the
// floating mini-player displays; hls.js (lazy-loaded) where the browser has no native HLS. Radio and TV never play at
// once: starting one stops the other. Playback always starts from a tap (browser autoplay rules).
import { useSyncExternalStore } from 'react';
import { radio } from '../radio/player';
import type { TvChannel } from './channels';

export type TvState = { channel: TvChannel | null; status: 'idle' | 'loading' | 'playing' | 'error'; muted: boolean; volume: number; error: string | null; pip: boolean };
type HlsLike = { loadSource(u: string): void; attachMedia(v: HTMLMediaElement): void; destroy(): void; on(ev: string, cb: (e: unknown, d: { fatal?: boolean }) => void): void };
const UNAVAILABLE = 'This channel isn’t available right now — try another.';

class TvPlayer {
  state: TvState = { channel: null, status: 'idle', muted: false, volume: 0.7, error: null, pip: false };
  private video: HTMLVideoElement | null = null; private hls: HlsLike | null = null; private subs = new Set<() => void>(); private token = 0;
  subscribe(f: () => void) { this.subs.add(f); return () => { this.subs.delete(f); }; }
  private set(p: Partial<TvState>) { this.state = { ...this.state, ...p }; this.subs.forEach((f) => f()); }
  /** Picture-in-picture outside the page (the browser's own floating window), where the browser offers it. */
  get pipSupported() { return typeof document !== 'undefined' && 'pictureInPictureEnabled' in document && document.pictureInPictureEnabled; }

  /** The shared video element; the mini-player moves it into its frame. */
  element(): HTMLVideoElement {
    if (!this.video) {
      const v = document.createElement('video'); v.playsInline = true; v.className = 'w-full h-full object-contain bg-black'; this.video = v;
      v.addEventListener('playing', () => this.set({ status: 'playing', error: null }));
      v.addEventListener('waiting', () => this.state.status === 'playing' && this.set({ status: 'loading' }));
      v.addEventListener('error', () => this.state.channel && this.set({ status: 'error', error: UNAVAILABLE }));
      v.addEventListener('enterpictureinpicture', () => this.set({ pip: true }));
      v.addEventListener('leavepictureinpicture', () => this.set({ pip: false }));
    }
    return this.video;
  }

  async play(ch: TvChannel) {
    if (!ch.url.startsWith('https://')) { this.set({ channel: ch, status: 'error', error: UNAVAILABLE }); return; } // the list is https-only; belt and braces
    radio.stop();
    const my = ++this.token; this.teardown(); const v = this.element(); v.volume = this.state.volume; v.muted = this.state.muted;
    this.set({ channel: ch, status: 'loading', error: null });
    try {
      if (!v.canPlayType('application/vnd.apple.mpegurl')) {
        const { default: Hls } = await import('hls.js'); if (my !== this.token) return;
        if (!Hls.isSupported()) throw new Error('HLS is not supported in this browser');
        const h = new Hls() as unknown as HlsLike; this.hls = h;
        h.on(Hls.Events.ERROR, (_e, d) => { if (d.fatal && my === this.token) this.set({ status: 'error', error: UNAVAILABLE }); });
        h.loadSource(ch.url); h.attachMedia(v);
      } else v.src = ch.url;
      await v.play();
    } catch (e) { if (my === this.token) this.set({ status: 'error', error: (e as Error).name === 'NotAllowedError' ? 'Tap play to start the channel' : UNAVAILABLE }); }
  }
  stop() {
    this.token++; if (document.pictureInPictureElement === this.video) void document.exitPictureInPicture().catch(() => {});
    this.teardown(); this.set({ channel: null, status: 'idle', error: null, pip: false });
  }
  toggleMute() { const m = !this.state.muted; if (this.video) this.video.muted = m; this.set({ muted: m }); }
  setVolume(vol: number) { const x = Math.max(0, Math.min(1, vol)); if (this.video) this.video.volume = x; this.set({ volume: x }); }
  async togglePip() {
    const v = this.video; if (!v || !this.pipSupported) return;
    try { if (document.pictureInPictureElement) await document.exitPictureInPicture(); else await v.requestPictureInPicture(); } catch { /* the browser refused (e.g. not playing yet) */ }
  }
  private teardown() { this.hls?.destroy(); this.hls = null; if (this.video) { this.video.pause(); this.video.removeAttribute('src'); this.video.load(); } }
}
export const tv = new TvPlayer();
radio.onPlay = () => tv.stop(); // starting a radio station turns the TV off

export const useTv = (): TvState => useSyncExternalStore((f) => tv.subscribe(f), () => tv.state);

/** Favourites are a list of channel ids in settings (tv.favourites), newest first. */
export const toggleFavourite = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [id, ...list]);
