// Training Room — E2 veloworld_training_room. Tabs: Challenges, Tests, Training plans (plan 10.5 H). Progress from ride history.
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Button, Chip, Icon, Label, cx } from '../design/primitives';
import { api } from '../app/api';
import { useProgress, refreshProgress } from '../app/useProgress';
import { BUILTIN, PLANS } from '../app/workouts';
import { fmtTime } from '../hud/zones';

export function TrainingRoom() {
  const nav = useNavigate(); const prog = useProgress(); const [tab, setTab] = useState<'challenges' | 'tests' | 'plans'>('challenges');
  const [active, setActive] = useState<{ id: string; startedAt: string } | null>(null);
  useEffect(() => { void refreshProgress(); api.getSettings().then((s) => setActive((s?.['plan.active'] as never) ?? null)).catch(() => {}); }, []);
  const tests = BUILTIN.filter((w) => w.category === 'test');
  const startPlan = async (id: string) => { const v = { id, startedAt: new Date().toISOString() }; await api.saveSetting('plan.active', v); setActive(v); };
  return (
    <div className="max-w-[1440px] mx-auto px-12 py-8 space-y-6">
      <div><Label className="text-accent">Structure your season</Label><h1 className="font-metric text-metric-hero uppercase leading-none text-on-surface">Training Room</h1></div>
      <div className="inline-flex rounded-xl bg-surface-container-low/70 p-1" role="tablist">{(['challenges', 'tests', 'plans'] as const).map((t) => <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={cx('px-6 py-2.5 rounded-lg text-body-md font-semibold uppercase tracking-wider', tab === t ? 'bg-accent text-on-accent' : 'text-text-secondary')}>{t === 'plans' ? 'Training plans' : t}</button>)}</div>
      {tab === 'challenges' && <div className="space-y-6">
        <div className="grid grid-cols-2 gap-6">{prog?.challenges.map((c) => (
          <div key={c.id} className="rounded-2xl bg-surface-container-low/70 p-6"><div className="flex justify-between"><h3 className="text-headline-md text-text">{c.name}</h3>{c.value >= c.target && <Chip tone="success" icon="check_circle">Done</Chip>}</div>
            <div className="mt-3 flex items-baseline gap-2"><span className="font-metric-live text-metric-xl text-accent">{c.value}</span><span className="text-text-secondary">/ {c.target} {c.unit}</span></div>
            <div className="h-2 rounded-full bg-white/8 mt-3 overflow-hidden"><div className="h-full bg-accent" style={{ width: `${Math.min(100, (c.value / c.target) * 100)}%` }} /></div></div>))}</div>
        <div><Label className="mb-3">Badges · streak {prog?.streakWeeks ?? 0} week{prog?.streakWeeks === 1 ? '' : 's'}</Label><div className="grid grid-cols-4 gap-4">{prog?.badges.map((b) => (
          <div key={b.id} className={cx('rounded-xl p-4 flex items-center gap-3', b.earned ? 'bg-accent/15 border border-accent/40' : 'bg-surface-container-low/60 opacity-60')}><Icon name={b.earned ? 'check_circle' : 'lock'} className={b.earned ? 'text-accent' : 'text-text-muted'} /><span className="text-body-md text-text">{b.name}</span></div>))}</div></div>
      </div>}
      {tab === 'tests' && <div className="grid grid-cols-2 gap-6">{tests.map((w) => (
        <div key={w.id} className="rounded-2xl bg-surface-container-low/70 p-6 flex flex-col gap-3"><h3 className="text-headline-md text-text">{w.name}</h3><p className="text-body-md text-on-surface-variant flex-1">{w.description}</p><div className="flex justify-between items-center"><span className="text-text-secondary">{fmtTime(w.durationS)}{w.test === 'ramp' ? ' max' : ''}</span><Button variant="primary" icon="play_arrow" onClick={() => nav(`/ride?mode=${w.test === 'ramp' ? 'ftpRamp' : w.test === 'ftp20' ? 'ftp20' : 'workout'}&workout=${w.id}`)}>Start test</Button></div></div>))}</div>}
      {tab === 'plans' && <div className="grid grid-cols-3 gap-6">{PLANS.map((p) => { const on = active?.id === p.id; const week = on ? Math.min(p.weeks.length, Math.floor((Date.now() - new Date(active!.startedAt).getTime()) / (7 * 864e5)) + 1) : 0; return (
        <div key={p.id} className={cx('rounded-2xl p-6 flex flex-col gap-3', on ? 'bg-accent/10 border border-accent/40' : 'bg-surface-container-low/70')}>
          <div className="flex justify-between"><h3 className="text-headline-md text-text">{p.name}</h3>{on && <Chip tone="accent">Week {week} / {p.weeks.length}</Chip>}</div><p className="text-body-md text-on-surface-variant">{p.description}</p>
          <ol className="space-y-1 text-body-md text-text-secondary flex-1">{p.weeks.map((w, i) => <li key={i} className={cx(on && i + 1 === week && 'text-text font-semibold')}>Week {i + 1}: {w.length} rides</li>)}</ol>
          {on ? <Button onClick={() => void api.saveSetting('plan.active', null).then(() => setActive(null))}>Stop plan</Button> : <Button variant="primary" onClick={() => void startPlan(p.id)}>Start plan</Button>}
        </div>); })}</div>}
    </div>
  );
}
