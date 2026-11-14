// Rider look (PLAN 16.11): body and kit colours. The 3D rider uses the same values; this SVG preview keeps the
// settings screens free of three.js (which is lazy-loaded only for rides, plan 9 bundle budget).
import { SKIN_TONES, type Avatar } from '@veloworld/shared';
import { Label, cx } from '../design/primitives';

const KIT_SWATCHES = ['#2a8fa3', '#f2c14e', '#c0392b', '#1e2633', '#f4f4f2', '#3fa36b', '#3b6fd8', '#e87fb0', '#ff8a3d', '#8e44ad', '#14161a'];
const HAIR = ['#1b1612', '#3b2a20', '#6b4a2b', '#d8b86a', '#b5b5b5', '#8a3b1f'];

export function RiderPreview({ a, className }: { a: Avatar; className?: string }) {
  const female = a.body === 'female';
  return (
    <svg viewBox="0 0 200 140" className={className} role="img" aria-label={`${a.body} rider preview`}>
      <g stroke={a.frame} strokeWidth="4" fill="none" strokeLinecap="round"><circle cx="50" cy="105" r="28" stroke="#111" strokeWidth="5" /><circle cx="150" cy="105" r="28" stroke="#111" strokeWidth="5" />
        <path d="M50 105 L88 105 L80 62 L140 60 L150 105 M88 105 L140 60 M80 62 L50 105" /><path d="M140 60 L146 50 L160 52" stroke="#222" /></g>
      <path d={female ? 'M76 58 Q96 30 128 40 L134 48 Q104 46 86 66 Z' : 'M74 58 Q96 26 130 38 L136 48 Q104 44 86 66 Z'} fill={a.jersey} />
      <path d="M104 40 L118 38" stroke={a.accent} strokeWidth="4" />
      <path d="M128 42 L150 58" stroke={a.skin} strokeWidth="6" strokeLinecap="round" /><path d="M128 42 L132 40" stroke={a.jersey} strokeWidth="7" />
      <path d="M78 60 L98 82 L90 104" stroke={a.shorts} strokeWidth="11" strokeLinecap="round" fill="none" /><path d="M98 82 L92 100" stroke={a.skin} strokeWidth="7" />
      <rect x="86" y="99" width="9" height="6" fill={a.socks} /><path d="M84 106 h16" stroke={a.shoes} strokeWidth="5" strokeLinecap="round" />
      <circle cx="142" cy="30" r="9" fill={a.skin} />{female && <path d="M132 28 q-8 4 -10 12" stroke={a.hair} strokeWidth="5" fill="none" strokeLinecap="round" />}
      <path d="M131 28 a12 10 0 0 1 22 -2 l2 4 h-24 z" fill={a.helmet} /><rect x="144" y="29" width="9" height="3" rx="1.5" fill={a.lens} />
    </svg>
  );
}

function Swatches({ value, options, onChange, label }: { value: string; options: readonly string[]; onChange: (c: string) => void; label: string }) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap" role="radiogroup" aria-label={label}>
      {options.map((c) => <button key={c} role="radio" aria-checked={value.toLowerCase() === c} aria-label={c} onClick={() => onChange(c)} className={cx('w-6 h-6 rounded-full border border-white/20', value.toLowerCase() === c && 'ring-2 ring-accent ring-offset-2 ring-offset-surface')} style={{ background: c }} />)}
      <label className="w-6 h-6 rounded-full border border-dashed border-white/40 overflow-hidden cursor-pointer relative" title="Custom colour"><input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="absolute inset-0 opacity-0 cursor-pointer" aria-label={`${label} custom colour`} /></label>
    </div>
  );
}
function BodyToggle({ value, onChange }: { value: Avatar['body']; onChange: (b: Avatar['body']) => void }) {
  return (
    <div className="rounded-control bg-black/30 p-1 grid grid-cols-2" role="radiogroup" aria-label="Rider body">
      {(['male', 'female'] as const).map((b) => <button key={b} role="radio" aria-checked={value === b} onClick={() => onChange(b)} className={cx('rounded-md py-2 text-body-md font-semibold uppercase', value === b ? 'bg-accent text-on-accent' : 'text-text-secondary')}>{b}</button>)}
    </div>
  );
}

export function AvatarQuick({ value, onChange }: { value: Avatar; onChange: (a: Avatar) => void }) {
  return (
    <div>
      <Label className="mb-2">Your rider</Label>
      <div className="flex gap-4 items-center">
        <RiderPreview a={value} className="w-32 h-24 shrink-0" />
        <div className="space-y-3 flex-1"><BodyToggle value={value.body} onChange={(body) => onChange({ ...value, body })} /><Swatches label="Jersey colour" value={value.jersey} options={KIT_SWATCHES.slice(0, 7)} onChange={(jersey) => onChange({ ...value, jersey })} /></div>
      </div>
      <p className="text-[11px] text-text-muted mt-2">More kit colours in Settings → Profile.</p>
    </div>
  );
}

const FIELDS: [keyof Avatar, string, readonly string[]][] = [
  ['skin', 'Skin tone', SKIN_TONES], ['hair', 'Hair', HAIR], ['jersey', 'Jersey', KIT_SWATCHES], ['accent', 'Jersey accent', KIT_SWATCHES], ['shorts', 'Shorts', KIT_SWATCHES],
  ['socks', 'Socks', KIT_SWATCHES], ['shoes', 'Shoes', KIT_SWATCHES], ['helmet', 'Helmet', KIT_SWATCHES], ['lens', 'Glasses lens', ['#0d1117', '#3b6fd8', '#c0392b', '#f2c14e', '#6b4a2b']], ['frame', 'Bike frame', KIT_SWATCHES],
];
export function AvatarEditor({ value, onChange }: { value: Avatar; onChange: (a: Avatar) => void }) {
  return (
    <div className="grid grid-cols-[260px_1fr] gap-8">
      <div className="rounded-xl bg-black/25 p-4 flex flex-col items-center gap-4"><RiderPreview a={value} className="w-full" /><BodyToggle value={value.body} onChange={(body) => onChange({ ...value, body })} /></div>
      <div className="grid grid-cols-2 gap-x-8 gap-y-4">{FIELDS.map(([k, label, opts]) => (
        <div key={k}><Label className="mb-1.5">{label}</Label><Swatches label={label} value={value[k] as string} options={opts} onChange={(c) => onChange({ ...value, [k]: c })} /></div>
      ))}</div>
    </div>
  );
}
