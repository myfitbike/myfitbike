// Design-system primitives ported from the Stitch component sheet (E3 veloworld_component_sheet).
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';
import { ICONS, type IconName } from './icons.generated';

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

export function Icon({ name, size = 20, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg viewBox="0 -960 960 960" width={size} height={size} fill="currentColor" aria-hidden className={cx('shrink-0', className)}>
      <path d={ICONS[name]} />
    </svg>
  );
}

type Variant = 'primary' | 'glass' | 'danger' | 'ghost';
const variants: Record<Variant, string> = {
  primary: 'bg-accent text-on-accent shadow-accent-glow hover:brightness-108',
  glass: 'bg-white/10 text-text border border-white/15 hover:bg-white/16',
  danger: 'bg-error-container/40 text-status-danger border border-status-danger/30 hover:bg-error-container/60',
  ghost: 'text-text-secondary hover:text-text hover:bg-white/8',
};
export function Button({ variant = 'glass', icon, iconRight, size = 'md', className, children, ...rest }:
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; icon?: IconName; iconRight?: IconName; size?: 'sm' | 'md' | 'lg' }) {
  const sizes = { sm: 'px-3 py-1.5 text-label-caps', md: 'px-6 py-3 text-body-md font-semibold', lg: 'px-10 py-4 text-body-lg font-semibold tracking-wide' };
  return (
    <button {...rest} className={cx('inline-flex items-center justify-center gap-2 rounded-control uppercase tracking-wider transition-all duration-200 active:scale-98 disabled:opacity-40 disabled:pointer-events-none focus-visible:outline-1 focus-visible:outline-accent', variants[variant], sizes[size], className)}>
      {icon && <Icon name={icon} size={size === 'sm' ? 16 : 20} />}{children}{iconRight && <Icon name={iconRight} size={20} />}
    </button>
  );
}

export function IconButton({ icon, label, className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { icon: IconName; label: string }) {
  return (
    <button {...rest} aria-label={label} title={label} className={cx('w-12 h-12 rounded-full bg-white/8 backdrop-blur-md flex items-center justify-center text-text hover:bg-white/16 transition-colors', className)}>
      <Icon name={icon} size={22} />
    </button>
  );
}

export function Card({ className, children, level = 1 }: { className?: string; children: ReactNode; level?: 1 | 2 | 3 }) {
  const lv = { 1: 'bg-surface-container-low/70 border border-white/6', 2: 'bg-surface-container/80 border border-white/10', 3: 'bg-slate-solid border border-white/16 shadow-modal' };
  return <div className={cx('rounded-card shadow-ambient backdrop-blur-xl', lv[level], className)}>{children}</div>;
}

export function Label({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('text-label-caps uppercase text-text-secondary', className)}>{children}</div>;
}

export function Metric({ value, unit, size = 'xl', className, tone }: { value: ReactNode; unit?: string; size?: 'hero' | 'xl' | 'lg' | 'md'; className?: string; tone?: string }) {
  const s = { hero: 'text-metric-hero', xl: 'text-metric-xl', lg: 'text-metric-lg', md: 'text-metric-md' }[size];
  return (
    <span className={cx('inline-flex items-baseline gap-1', className)}>
      <span className={cx('font-metric-live', s, tone ?? 'text-text')}>{value}</span>
      {unit && <span className="text-metric-unit uppercase text-text-muted">{unit}</span>}
    </span>
  );
}

export type ChipTone = 'success' | 'warning' | 'danger' | 'connected' | 'neutral' | 'accent';
const chipTones: Record<ChipTone, string> = {
  success: 'bg-status-success/15 text-status-success', warning: 'bg-status-warning/15 text-status-warning', danger: 'bg-status-danger/15 text-status-danger',
  connected: 'bg-status-connected/15 text-status-connected', neutral: 'bg-white/8 text-text-secondary', accent: 'bg-accent/20 text-accent',
};
export function Chip({ tone = 'neutral', icon, children, className }: { tone?: ChipTone; icon?: IconName; children: ReactNode; className?: string }) {
  return <span className={cx('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-label-caps uppercase', chipTones[tone], className)}>{icon && <Icon name={icon} size={14} />}{children}</span>;
}
export function Dot({ tone }: { tone: ChipTone }) {
  const c = { success: 'bg-status-success', warning: 'bg-status-warning', danger: 'bg-status-danger', connected: 'bg-status-connected', neutral: 'bg-text-muted', accent: 'bg-accent' }[tone];
  return <span className={cx('inline-block w-2 h-2 rounded-full', c)} />;
}

export function Toggle({ checked, onChange, label, tone = 'success' }: { checked: boolean; onChange: (v: boolean) => void; label: string; tone?: 'success' | 'accent' }) {
  return (
    <button role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)}
      className={cx('relative w-11 h-6 rounded-full transition-colors duration-200', checked ? (tone === 'accent' ? 'bg-accent' : 'bg-status-success') : 'bg-white/15')}>
      <span className={cx('absolute top-[3px] left-[3px] w-[18px] h-[18px] rounded-full bg-white transition-transform duration-200', checked && 'translate-x-5')} />
    </button>
  );
}

export function TextField({ label, suffix, icon, className, ...rest }: InputHTMLAttributes<HTMLInputElement> & { label?: string; suffix?: string; icon?: IconName }) {
  return (
    <label className={cx('block', className)}>
      {label && <Label className="mb-2">{label}</Label>}
      <span className="flex items-center gap-3 h-14 px-4 rounded-control bg-white/6 border border-white/12 focus-within:border-accent focus-within:ring-3 focus-within:ring-accent/20">
        {icon && <Icon name={icon} className="text-text-secondary" />}
        <input {...rest} className={cx('flex-1 min-w-0 bg-transparent outline-none text-text', rest.type === 'number' ? 'font-metric-live text-metric-md' : 'text-body-lg')} />
        {suffix && <span className="text-metric-unit uppercase text-text-secondary">{suffix}</span>}
      </span>
    </label>
  );
}

export function SectionHeader({ eyebrow, title, right }: { eyebrow?: ReactNode; title: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-4 mb-4">
      <div>{eyebrow && <Label className="mb-1">{eyebrow}</Label>}<h2 className="text-headline-md text-text">{title}</h2></div>
      {right}
    </div>
  );
}
