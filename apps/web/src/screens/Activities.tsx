// Activities — E1 veloworld_activities_ride_log. Ride list in AG Grid (house rule for data grids).
// Weekly load chart, records and FTP history arrive in Phase 5 (analytics).
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { AgGridReact } from 'ag-grid-react';
import { AllCommunityModule, ModuleRegistry, themeQuartz, type ColDef } from 'ag-grid-community';
import { Button, Chip, Label, cx } from '../design/primitives';
import { api, type RideRow } from '../app/api';
import { useUnits } from '../app/store';
import { distOf, fmtDist, unitLabels } from '@veloworld/shared';
import { fmtTime } from '../hud/zones';

ModuleRegistry.registerModules([AllCommunityModule]);
// Grid theme from design tokens (no raw hex in components: read the CSS variables)
const v = (n: string) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const gridTheme = () => themeQuartz.withParams({ backgroundColor: 'transparent', foregroundColor: v('--color-on-surface'), headerBackgroundColor: 'rgb(255 255 255 / 0.04)', headerTextColor: v('--color-text-secondary'), borderColor: 'rgb(255 255 255 / 0.08)', rowHoverColor: 'rgb(255 255 255 / 0.06)', accentColor: v('--color-accent'), fontFamily: 'Inter', fontSize: 14, headerFontSize: 11, oddRowBackgroundColor: 'rgb(255 255 255 / 0.02)' });

type Analytics = Awaited<ReturnType<typeof api.analytics>>;
function AnalyticsPanel({ a }: { a: NonNullable<Analytics> }) {
  const nav = useNavigate(); const maxT = Math.max(50, ...a.weeks.map((w) => w.tss)); const now = new Date(); const first = new Date(now.getFullYear(), now.getMonth(), 1); const days = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate(); const lead = (first.getDay() + 6) % 7;
  const byDay = new Map<string, { tss: number; id: number }>(); for (const d of a.days) byDay.set(d.date, { tss: (byDay.get(d.date)?.tss ?? 0) + d.tss, id: d.id });
  return (
    <div className="grid grid-cols-3 gap-6">
      <div className="rounded-2xl bg-surface-container-low/70 p-5 col-span-2"><Label className="mb-3">Weekly load (TSS), last 12 weeks</Label>
        <div className="flex items-end gap-2 h-40">{a.weeks.map((w) => <div key={w.week} className="flex-1 flex flex-col items-center gap-1" title={`${w.week}: ${w.tss} TSS, ${w.hours} h`}><span className="text-[10px] text-text-secondary">{w.tss || ''}</span><div className="w-full rounded-t bg-accent/80" style={{ height: `${(w.tss / maxT) * 120}px` }} /><span className="text-[10px] text-text-muted">{w.week.slice(5)}</span></div>)}</div></div>
      <div className="rounded-2xl bg-surface-container-low/70 p-5"><Label className="mb-3">{now.toLocaleString([], { month: 'long' })}</Label>
        <div className="grid grid-cols-7 gap-1 text-center text-[11px]">{['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => <span key={i} className="text-text-muted">{d}</span>)}{Array.from({ length: lead }, (_, i) => <span key={`l${i}`} />)}
          {Array.from({ length: days }, (_, i) => { const date = new Date(now.getFullYear(), now.getMonth(), i + 1); const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`; const r = byDay.get(key);
            return <button key={i} disabled={!r} onClick={() => r && nav(`/summary/${r.id}`)} className={cx('aspect-square rounded-md flex items-center justify-center', r ? 'bg-accent/30 text-text font-semibold' : 'bg-white/4 text-text-secondary')}>{i + 1}</button>; })}</div></div>
      <div className="rounded-2xl bg-surface-container-low/70 p-5"><Label className="mb-3">Personal records</Label>
        {a.records.length ? a.records.map((r) => <div key={r.durationS} className="flex justify-between py-1 text-body-md"><span className="text-text-secondary">{r.durationS < 60 ? `${r.durationS} s` : `${r.durationS / 60} min`}</span><span className="font-metric-live text-metric-md text-text">{r.watts} W</span></div>) : <p className="text-text-muted">Ride to set records.</p>}</div>
      <div className="rounded-2xl bg-surface-container-low/70 p-5 col-span-2"><Label className="mb-3">FTP history</Label>
        {a.ftpHistory.length ? <div className="flex gap-3 flex-wrap">{a.ftpHistory.map((f) => <Chip key={f.date} tone="accent">{f.date}: {f.ftp} W</Chip>)}</div> : <p className="text-text-muted">FTP changes appear after a test.</p>}</div>
    </div>
  );
}

export default function Activities() {
  const u = useUnits();
  const nav = useNavigate(); const [rows, setRows] = useState<RideRow[] | null>(null); const [err, setErr] = useState<string | null>(null); const [an, setAn] = useState<Analytics | null>(null);
  useEffect(() => { api.listRides().then(setRows).catch((e: Error) => setErr(e.message)); api.analytics().then(setAn).catch(() => {}); }, []);
  const cols = useMemo<ColDef<RideRow>[]>(() => [
    { headerName: 'Date', field: 'startedAt', sort: 'desc', width: 170, valueFormatter: (p) => new Date(p.value as string).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) },
    { headerName: 'Ride', field: 'name', flex: 1, minWidth: 220 },
    { headerName: 'Mode', field: 'mode', width: 120 },
    { headerName: 'Time', width: 100, valueGetter: (p) => p.data?.summary?.movingS ?? 0, valueFormatter: (p) => fmtTime(p.value as number) },
    { headerName: unitLabels(u).dist, width: 90, valueGetter: (p) => +distOf(p.data?.summary?.distanceM ?? 0, u).toFixed(1) },
    { headerName: 'Avg W', width: 95, valueGetter: (p) => p.data?.summary?.avgPower ?? null },
    { headerName: 'NP', width: 85, valueGetter: (p) => p.data?.summary?.np ?? null },
    { headerName: 'TSS', width: 85, valueGetter: (p) => p.data?.summary?.tss ?? null },
    { headerName: 'IF', width: 80, valueGetter: (p) => p.data?.summary?.if ?? null },
    { headerName: 'Avg HR', width: 95, valueGetter: (p) => p.data?.summary?.avgHr ?? null },
    { headerName: 'Trainer', width: 110, valueGetter: (p) => (p.data?.simulator ? 'Demo' : 'Real') },
  ], [u]);
  const total = rows?.reduce((a, r) => ({ s: a.s + (r.summary?.movingS ?? 0), km: a.km + (r.summary?.distanceM ?? 0), tss: a.tss + (r.summary?.tss ?? 0) }), { s: 0, km: 0, tss: 0 });
  return (
    <div className="max-w-[1440px] mx-auto px-12 py-8 space-y-6">
      <div className="flex items-end justify-between"><div><Label className="text-accent">Ride log</Label><h1 className="font-metric text-metric-hero uppercase leading-none text-on-surface">Activities</h1></div>
        {total && <div className="flex gap-8 text-right">{[['Rides', String(rows!.length)], ['Time', fmtTime(total.s)], ['Distance', fmtDist(total.km, u, 0)], ['TSS', String(total.tss)]].map(([l, x]) => <div key={l}><Label>{l}</Label><div className="font-metric-live text-metric-lg text-text">{x}</div></div>)}</div>}</div>
      {err && <p className="text-status-danger">{err}</p>}
      {an && <AnalyticsPanel a={an} />}
      {rows && !rows.length && <div className="rounded-2xl bg-surface-container-low/70 p-8 flex justify-between items-center"><p className="text-body-lg text-text-secondary">No rides yet.</p><Button variant="primary" onClick={() => nav('/workouts')}>Pick a workout</Button></div>}
      {rows && rows.length > 0 && <div className="rounded-2xl bg-surface-container-low/70 p-2 h-[640px]"><AgGridReact<RideRow> theme={gridTheme()} rowData={rows} columnDefs={cols} defaultColDef={{ sortable: true, filter: true, resizable: true }} pagination paginationPageSize={20} onRowClicked={(e) => e.data && nav(`/summary/${e.data.id}`)} rowClass="cursor-pointer" /></div>}
    </div>
  );
}
