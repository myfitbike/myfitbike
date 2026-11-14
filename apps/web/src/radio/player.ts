// One radio player for the whole app (Settings test-play and the ride share it). Plain <audio> for MP3/AAC/Ogg
// streams; hls.js (lazy-loaded) for HLS stations when the browser can't play them natively. Streams come straight from
// each station. Playback must start from a tap or click (browser autoplay rules) — every play() here is user-initiated.
import type { RadioStation } from '@myfitbike/shared';

export type RadioState = { station: RadioStation | null; status: 'idle' | 'loading' | 'playing' | 'error'; muted: boolean; volume: number; error: string | null };
type HlsLike = { loadSource(u: string): void; attachMedia(a: HTMLMediaElement): void; destroy(): void; on(ev: string, cb: (e: unknown, d: { fatal?: boolean }) => void): void };

class RadioPlayer {
  state: RadioState = { station: null, status: 'idle', muted: false, volume: 0.7, error: null };
  private audio: HTMLAudioElement | null = null; private hls: HlsLike | null = null; private subs = new Set<() => void>(); private token = 0;
  subscribe(f: () => void) { this.subs.add(f); return () => { this.subs.delete(f); }; }
  private set(p: Partial<RadioState>) { this.state = { ...this.state, ...p }; this.subs.forEach((f) => f()); }
  private el() {
    if (!this.audio) {
      const a = new Audio(); a.preload = 'none'; this.audio = a;
      a.addEventListener('playing', () => this.set({ status: 'playing', error: null }));
      a.addEventListener('waiting', () => this.state.status === 'playing' && this.set({ status: 'loading' }));
      a.addEventListener('error', () => this.state.station && this.set({ status: 'error', error: 'This station isn’t reachable right now — try another.' }));
    }
    return this.audio;
  }

  async play(st: RadioStation) {
    if (!/^https?:\/\//.test(st.url)) { this.set({ station: st, status: 'error', error: 'Unsupported stream address' }); return; }
    const my = ++this.token; this.teardown(); const a = this.el(); a.volume = this.state.volume; a.muted = this.state.muted;
    this.set({ station: st, status: 'loading', error: null });
    const fresh = await fetch(`/api/radio/click/${st.uuid}`, { method: 'POST' }).then((r) => (r.ok ? r.json() : null)).catch(() => null) as { url: string | null } | null; // counts the play; freshest URL
    if (my !== this.token) return; const url = fresh?.url ?? st.url;
    const isHls = st.hls || /\.m3u8(\?|$)/i.test(url);
    try {
      if (isHls && !a.canPlayType('application/vnd.apple.mpegurl')) {
        const { default: Hls } = await import('hls.js'); if (my !== this.token) return;
        if (!Hls.isSupported()) throw new Error('HLS is not supported in this browser');
        const h = new Hls() as unknown as HlsLike; this.hls = h; h.on(Hls.Events.ERROR, (_e, d) => { if (d.fatal) this.set({ status: 'error', error: 'This station isn’t reachable right now — try another.' }); });
        h.loadSource(url); h.attachMedia(a);
      } else a.src = url;
      await a.play();
      this.mediaSession(st);
    } catch (e) { if (my === this.token) this.set({ status: 'error', error: (e as Error).name === 'NotAllowedError' ? 'Tap play to start the radio' : 'This station isn’t reachable right now — try another.' }); }
  }
  stop() { this.token++; this.teardown(); if (this.audio) this.audio.muted = false; this.set({ station: null, status: 'idle', error: null, muted: false }); /* mute is per listening session */ if ('mediaSession' in navigator) navigator.mediaSession.metadata = null; }
  toggleMute() { const m = !this.state.muted; if (this.audio) this.audio.muted = m; this.set({ muted: m }); }
  setVolume(v: number) { const vol = Math.max(0, Math.min(1, v)); if (this.audio) this.audio.volume = vol; this.set({ volume: vol }); }
  private teardown() { this.hls?.destroy(); this.hls = null; if (this.audio) { this.audio.pause(); this.audio.removeAttribute('src'); this.audio.load(); } }
  private mediaSession(st: RadioStation) { // station name on the lock screen / media keys
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.metadata = new MediaMetadata({ title: st.name, artist: [st.country, ...st.tags.slice(0, 2)].filter(Boolean).join(' · '), album: 'MyFitBike radio', artwork: st.favicon ? [{ src: st.favicon }] : [] });
    navigator.mediaSession.setActionHandler('pause', () => this.stop()); navigator.mediaSession.setActionHandler('stop', () => this.stop());
  }
}
export const radio = new RadioPlayer();

/** Favourites are a list in settings (radio.favourites); keep one entry per station, newest first. */
export const addFavourite = (list: RadioStation[], st: RadioStation) => [st, ...list.filter((x) => x.uuid !== st.uuid)].slice(0, 30);
export const removeFavourite = (list: RadioStation[], uuid: string) => list.filter((x) => x.uuid !== uuid);
