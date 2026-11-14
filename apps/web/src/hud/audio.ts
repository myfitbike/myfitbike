// Audio cues (plan 10.3 banners + PLAN 16.15 crowds): synthesised with WebAudio, so there are no sound assets to license.
let ctx: AudioContext | null = null; let vol = { ui: 0.7, world: 0.6 };
export function setVolumes(ui: number, world: number) { vol = { ui: ui / 100, world: world / 100 }; }
const ac = () => (ctx ??= new AudioContext());
function tone(freq: number, start: number, dur: number, gain: number) {
  const a = ac(), o = a.createOscillator(), g = a.createGain(); o.type = 'sine'; o.frequency.value = freq;
  g.gain.setValueAtTime(0, start); g.gain.linearRampToValueAtTime(gain, start + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, start + dur); o.connect(g).connect(a.destination); o.start(start); o.stop(start + dur + 0.05);
}
/** Interval countdown: three short beeps and a long one, one per second (plan 6.3). */
export function countdown() { if (!vol.ui) return; const t = ac().currentTime; [0, 1, 2].forEach((i) => tone(880, t + i, 0.12, 0.25 * vol.ui)); tone(1320, t + 3, 0.45, 0.3 * vol.ui); }
export function chime() { if (!vol.ui) return; const t = ac().currentTime; tone(988, t, 0.25, 0.2 * vol.ui); tone(1319, t + 0.12, 0.35, 0.2 * vol.ui); }
/** Crowd cheer: band-passed noise swells with a few whistle-like chirps. */
export function cheer(seconds = 3.5) {
  if (!vol.world) return; const a = ac(), t = a.currentTime, n = Math.floor(a.sampleRate * seconds), buf = a.createBuffer(1, n, a.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (0.6 + 0.4 * Math.sin(i / 900) * Math.sin(i / 3100));
  const src = a.createBufferSource(); src.buffer = buf; const bp = a.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1100; bp.Q.value = 0.7; const g = a.createGain();
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.35 * vol.world, t + 0.8); g.gain.linearRampToValueAtTime(0.25 * vol.world, t + seconds - 1); g.gain.linearRampToValueAtTime(0, t + seconds);
  src.connect(bp).connect(g).connect(a.destination); src.start(t);
  for (let k = 0; k < 4; k++) { const s = t + 0.5 + Math.random() * (seconds - 1.5); const o = a.createOscillator(), og = a.createGain(); o.frequency.setValueAtTime(1800, s); o.frequency.linearRampToValueAtTime(2600, s + 0.25); og.gain.setValueAtTime(0, s); og.gain.linearRampToValueAtTime(0.06 * vol.world, s + 0.05); og.gain.linearRampToValueAtTime(0, s + 0.3); o.connect(og).connect(a.destination); o.start(s); o.stop(s + 0.35); }
}
