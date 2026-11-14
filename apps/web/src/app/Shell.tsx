// App shell from E3 veloworld_home_dashboard: 88 px icon rail + 64 px top status bar (plan 10.5 E).
import { NavLink, Outlet, useNavigate } from 'react-router';
import { Icon, cx, type ChipTone } from '../design/primitives';
import type { IconName } from '../design/icons.generated';
import { useApp, type SlotId, type SlotState } from './store';

const NAV: { to: string; icon: IconName; label: string }[] = [
  { to: '/', icon: 'home', label: 'Home' },
  { to: '/routes', icon: 'alt_route', label: 'Routes' },
  { to: '/workouts', icon: 'fitness_center', label: 'Workouts' },
  { to: '/training', icon: 'sports_score', label: 'Training' },
  { to: '/activity', icon: 'history', label: 'Activity' },
  { to: '/search', icon: 'search', label: 'Search' },
];

function RailLink({ to, icon, label }: { to: string; icon: IconName; label: string }) {
  return (
    <NavLink to={to} end={to === '/'} className={({ isActive }) => cx(
      'flex flex-col items-center justify-center w-16 h-16 rounded-xl gap-1 transition-all',
      isActive ? 'bg-primary-container text-on-primary-container font-semibold shadow-accent-glow' : 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface')}>
      <Icon name={icon} size={24} />
      <span className="text-[10px] font-semibold tracking-wider uppercase">{label}</span>
    </NavLink>
  );
}

const SLOT_ICON: Record<SlotId, IconName> = { trainer: 'speed', power: 'bolt', cadence: 'sync', heartRate: 'favorite', speed: 'speed' };
const toneOf = (s: SlotState): ChipTone => s.status === 'connected' ? 'success' : s.status === 'lost' ? 'danger' : s.status === 'searching' || s.status === 'connecting' ? 'warning' : 'neutral';
const DOT: Record<ChipTone, string> = { success: 'bg-tertiary-container animate-pulse', danger: 'bg-error', warning: 'bg-status-warning animate-pulse', neutral: 'bg-text-muted', connected: 'bg-status-connected', accent: 'bg-accent' };
const FALLBACK: Record<SlotId, string> = { trainer: 'Trainer', power: 'Power', cadence: 'Cadence', heartRate: 'Heart rate', speed: 'Speed' };

function StatusBar() {
  const profile = useApp((s) => s.profile);
  const slots = useApp((s) => s.slots);
  const nav = useNavigate();
  const trainerUp = slots.trainer.status === 'connected';
  return (
    <header className="fixed top-0 left-[88px] right-0 h-16 z-40 px-6 flex items-center justify-between bg-surface-container-lowest/80 backdrop-blur-2xl shadow-[0_4px_24px_rgb(0_0_0/0.25)]">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-on-primary"><Icon name="person" size={18} /></div>
        <span className="text-body-md font-semibold text-on-surface tracking-tight">{profile?.name || 'Rider'}</span>
      </div>
      <div className="flex items-center gap-2">
        {(['trainer', 'power', 'cadence', 'heartRate'] as SlotId[]).map((id) => {
          const s = slots[id]; const tone = toneOf(s);
          return (
            <button key={id} onClick={() => nav('/sensors')} className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-surface-container-low/70 backdrop-blur-md hover:bg-surface-container-high" title={`${FALLBACK[id]}: ${s.status}`}>
              <span className={cx('w-2 h-2 rounded-full', DOT[tone])} />
              <Icon name={SLOT_ICON[id]} size={15} className={tone === 'danger' ? 'text-error' : 'text-on-surface-variant'} />
              <span className={cx('text-[10px] font-semibold tracking-wider', tone === 'neutral' ? 'text-on-surface-variant' : 'text-on-surface')}>{s.name ?? FALLBACK[id]}</span>
            </button>
          );
        })}
        {!trainerUp && (
          <button onClick={() => nav('/sensors')} className="flex items-center gap-1.5 px-2 py-1.5 rounded-full bg-surface-container-high/60 hover:bg-surface-container-highest">
            <Icon name="sensors" size={16} className="text-primary-fixed-dim" /><span className="text-[11px] font-semibold text-on-surface">Connect Trainer</span>
          </button>
        )}
      </div>
    </header>
  );
}

export function Shell() {
  return (
    <div className="min-h-full">
      <aside className="fixed left-0 top-0 h-screen w-[88px] z-50 flex flex-col items-center justify-between py-4 bg-surface-container-lowest/80 backdrop-blur-2xl shadow-ambient">
        <div className="flex flex-col items-center w-full gap-6">
          <div className="w-12 h-12 rounded-xl bg-surface-container-high/60 flex items-center justify-center p-1">
            <div className="w-9 h-9 rounded-lg bg-primary-container flex items-center justify-center shadow-[0_0_16px_rgb(242_193_78/0.4)] text-on-primary-container"><Icon name="pedal_bike" size={22} /></div>
          </div>
          <nav className="flex flex-col items-center gap-2 w-full px-1">{NAV.map((n) => <RailLink key={n.to} {...n} />)}</nav>
        </div>
        <nav className="px-1"><RailLink to="/settings" icon="settings" label="Settings" /></nav>
      </aside>
      <StatusBar />
      <main className="pl-[88px] pt-16 min-h-screen"><Outlet /></main>
    </div>
  );
}
