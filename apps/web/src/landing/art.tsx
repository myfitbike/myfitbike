// Drawn graphics for the public pages: our own SVG shapes only (no third-party artwork or brand marks).
import { cx } from '../design/primitives';

/** Layered mountain ridges with a glowing elevation line — the hero backdrop. */
export function RidgeBackdrop({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 1440 520" preserveAspectRatio="xMidYMax slice" aria-hidden className={cx('pointer-events-none', className)}>
      <defs>
        <linearGradient id="lr1" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--color-glow-teal)" stopOpacity="0.45" /><stop offset="1" stopColor="var(--color-surface)" stopOpacity="0" /></linearGradient>
        <linearGradient id="lr2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--color-glow-plum)" stopOpacity="0.5" /><stop offset="1" stopColor="var(--color-surface)" stopOpacity="0" /></linearGradient>
        <linearGradient id="lline" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="var(--color-grade-flat)" /><stop offset="0.45" stopColor="var(--color-grade-moderate)" /><stop offset="0.75" stopColor="var(--color-grade-steep)" /><stop offset="1" stopColor="var(--color-grade-severe)" /></linearGradient>
      </defs>
      <path d="M0 330 L120 270 L210 300 L330 200 L420 250 L540 150 L640 230 L760 120 L880 210 L990 160 L1100 240 L1220 140 L1330 220 L1440 180 V520 H0Z" fill="url(#lr2)" />
      <path d="M0 400 L150 330 L260 370 L380 290 L500 350 L620 270 L730 330 L860 250 L980 320 L1100 260 L1230 330 L1340 280 L1440 320 V520 H0Z" fill="url(#lr1)" />
      <path d="M0 470 C160 460 260 440 380 420 S600 380 720 330 S960 250 1080 200 S1300 120 1440 90" fill="none" stroke="url(#lline)" strokeWidth="3" strokeLinecap="round" opacity="0.9" />
      <circle cx="1080" cy="200" r="6" fill="var(--color-accent)" /><circle cx="1080" cy="200" r="14" fill="var(--color-accent)" opacity="0.25" />
    </svg>
  );
}

/** A small elevation profile coloured by gradient, like the app's terrain strip. */
export function ProfileBars({ className, bars = [2, 3, 3, 4, 6, 7, 8, 9, 9, 10, 11, 12, 11, 9, 7, 5, 4, 6, 8, 10] }: { className?: string; bars?: number[] }) {
  const tone = (v: number, p?: number) => { const g = p === undefined ? 0 : v - p; return g <= 0 ? 'var(--color-grade-down)' : g < 1 ? 'var(--color-grade-flat)' : g < 2 ? 'var(--color-grade-moderate)' : 'var(--color-grade-steep)'; };
  return (
    <svg viewBox={`0 0 ${bars.length * 10} 60`} preserveAspectRatio="none" aria-hidden className={className}>
      {bars.map((b, i) => <rect key={i} x={i * 10} y={60 - b * 4.5} width="9" height={b * 4.5} rx="1.5" fill={tone(b, bars[i - 1])} />)}
    </svg>
  );
}

/** Generic drawings of the device types (no real products). */
export function DeviceArt({ kind, className }: { kind: 'trainer' | 'power' | 'hr' | 'cadence'; className?: string }) {
  const s = { fill: 'none', stroke: 'currentColor', strokeWidth: 2.2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return (
    <svg viewBox="0 0 64 64" aria-hidden className={className}>
      {kind === 'trainer' && <g {...s}><circle cx="34" cy="30" r="13" /><circle cx="34" cy="30" r="4" /><path d="M14 52 L26 40 M54 52 L42 40 M10 52 H58 M21 30 H12 M34 17 V10" /><path d="M8 24 l3 3 l-3 3" opacity="0.6" /></g>}
      {kind === 'power' && <g {...s}><circle cx="24" cy="36" r="14" /><circle cx="24" cy="36" r="4" /><path d="M24 36 L50 18" strokeWidth="5" /><rect x="46" y="12" width="12" height="7" rx="2" /><path d="M36 50 l4 -6 h-5 l4 -6" stroke="var(--color-accent)" /></g>}
      {kind === 'hr' && <g {...s}><path d="M6 34 C6 26 18 24 32 24 C46 24 58 26 58 34" /><rect x="22" y="27" width="20" height="12" rx="6" /><path d="M10 48 h10 l4 -8 l5 14 l5 -18 l4 12 h16" stroke="var(--color-status-danger)" /></g>}
      {kind === 'cadence' && <g {...s}><circle cx="30" cy="34" r="16" /><path d="M30 34 L30 18" /><path d="M48 18 a20 20 0 0 1 4 16" stroke="var(--color-secondary)" /><path d="M49 31 l3 3 l3 -4" stroke="var(--color-secondary)" /><rect x="26" y="30" width="8" height="8" rx="2" /></g>}
    </svg>
  );
}

/** Concentric signal arcs used behind the Bluetooth step. */
export function SignalArcs({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 60" aria-hidden className={className}>
      {[18, 34, 50].map((r, i) => <path key={r} d={`M${60 - r} 58 A${r} ${r} 0 0 1 ${60 + r} 58`} fill="none" stroke="var(--color-secondary)" strokeWidth="3" strokeLinecap="round" opacity={1 - i * 0.28} />)}
      <circle cx="60" cy="56" r="5" fill="var(--color-secondary)" />
    </svg>
  );
}
