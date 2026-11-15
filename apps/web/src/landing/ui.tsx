// Shared pieces of the public pages (PLAN 17.4): logo, link buttons, top bar, footer and screenshot frames.
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Icon, cx } from '../design/primitives';
import type { IconName } from '../design/icons.generated';

export function Logo({ className }: { className?: string }) {
  return (
    <Link to="/landing" className={cx('inline-flex items-center gap-2.5 rounded-control focus-visible:outline-2 focus-visible:outline-accent', className)} aria-label="MyFitBike home">
      <span className="w-9 h-9 rounded-xl bg-accent text-on-accent flex items-center justify-center shadow-accent-glow"><Icon name="directions_bike" size={22} /></span>
      <span className="text-[20px] font-bold tracking-tight text-text">MyFit<span className="text-accent">Bike</span></span>
    </Link>
  );
}

/** A router link that looks like the design-system Button (same classes as primitives.tsx Button). */
export function LinkButton({ to, variant = 'primary', size = 'md', icon, iconRight, className, children }: { to: string; variant?: 'primary' | 'glass' | 'ghost'; size?: 'sm' | 'md' | 'lg'; icon?: IconName; iconRight?: IconName; className?: string; children: ReactNode }) {
  const v = { primary: 'bg-accent text-on-accent shadow-accent-glow hover:brightness-108', glass: 'bg-white/10 text-text border border-white/15 hover:bg-white/16', ghost: 'text-text-secondary hover:text-text hover:bg-white/8' }[variant];
  const s = { sm: 'px-4 py-2 text-label-caps', md: 'px-6 py-3 text-body-md font-semibold', lg: 'px-8 py-4 text-body-lg font-semibold tracking-wide' }[size];
  return (
    <Link to={to} className={cx('inline-flex items-center justify-center gap-2 rounded-control uppercase tracking-wider transition-all duration-200 active:scale-98 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent', v, s, className)}>
      {icon && <Icon name={icon} size={size === 'sm' ? 16 : 20} />}{children}{iconRight && <Icon name={iconRight} size={20} />}
    </Link>
  );
}

export function PublicHeader({ nav }: { nav?: { href: string; label: string }[] }) {
  return (
    <header className="sticky top-0 z-40 border-b border-white/8 bg-surface/75 backdrop-blur-xl">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
        <Logo />
        {nav && <nav aria-label="Page sections" className="hidden md:flex items-center gap-1">{nav.map((n) => <a key={n.href} href={n.href} className="px-3 py-2 rounded-control text-body-md text-text-secondary hover:text-text hover:bg-white/6 focus-visible:outline-2 focus-visible:outline-accent">{n.label}</a>)}</nav>}
        <div className="flex items-center gap-2">
          <LinkButton to="/login?mode=signup" variant="ghost" size="sm">Sign up</LinkButton>
          <LinkButton to="/login" variant="primary" size="sm" icon="person">Log in</LinkButton>
        </div>
      </div>
    </header>
  );
}

export function PublicFooter() {
  return (
    <footer className="border-t border-white/8 bg-surface-container-lowest/60">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-10 flex flex-col md:flex-row gap-6 md:items-center md:justify-between">
        <div className="space-y-2"><Logo /><p className="text-body-md text-text-muted max-w-sm">Free indoor cycling in your browser. The island of Velora is drawn by MyFitBike's own code.</p></div>
        <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-2 text-body-md">
          <Link to="/landing" className="text-text-secondary hover:text-accent">Home</Link>
          <Link to="/login" className="text-text-secondary hover:text-accent">Log in</Link>
          <Link to="/privacy" className="text-text-secondary hover:text-accent">Privacy</Link>
          <Link to="/attributions" className="text-text-secondary hover:text-accent">Attributions</Link>
        </nav>
      </div>
    </footer>
  );
}

/** A screenshot inside a drawn browser window (CSS only, no third-party art). */
export function BrowserFrame({ src, alt, lazy = true, className }: { src: string; alt: string; lazy?: boolean; className?: string }) {
  return (
    <figure className={cx('rounded-2xl overflow-hidden border border-white/12 bg-surface-container-lowest shadow-modal', className)}>
      <div className="h-8 px-3 flex items-center gap-1.5 bg-surface-container-high/80 border-b border-white/8" aria-hidden>
        <span className="w-2.5 h-2.5 rounded-full bg-white/20" /><span className="w-2.5 h-2.5 rounded-full bg-white/20" /><span className="w-2.5 h-2.5 rounded-full bg-white/20" />
        <span className="ml-3 h-4 flex-1 max-w-56 rounded-full bg-white/8" />
      </div>
      <img src={src} alt={alt} width={1440} height={900} loading={lazy ? 'lazy' : 'eager'} decoding="async" className="block w-full h-auto" />
    </figure>
  );
}

/** A phone-size screenshot inside a drawn phone outline. */
export function PhoneFrame({ src, alt, className }: { src: string; alt: string; className?: string }) {
  return (
    <figure className={cx('rounded-[2rem] p-2 bg-surface-container-highest border border-white/16 shadow-modal', className)}>
      <img src={src} alt={alt} width={390} height={844} loading="lazy" decoding="async" className="block w-full h-auto rounded-[1.5rem]" />
    </figure>
  );
}

/** Reading layout for the plain text pages (privacy, attributions). */
export function DocPage({ eyebrow, title, children }: { eyebrow: string; title: string; children: ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <PublicHeader />
      <main className="flex-1 mx-auto w-full max-w-3xl px-4 sm:px-6 py-12 md:py-16">
        <p className="text-label-caps uppercase text-accent mb-2">{eyebrow}</p>
        <h1 className="text-[40px] leading-[44px] md:text-[56px] md:leading-[60px] font-bold tracking-tight text-text mb-8">{title}</h1>
        {children}
      </main>
      <PublicFooter />
    </div>
  );
}
