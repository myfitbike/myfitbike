// Activities — E1 veloworld_activities_ride_log. Ride list in AG Grid (house rule for data grids).
// Weekly load chart, records and FTP history arrive in Phase 5 (analytics).
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { AgGridReact } from 'ag-grid-react';
import { AllCommunityModule, ModuleRegistry, themeQuartz, type ColDef } from 'ag-grid-community';
import { Button, Label } from '../design/primitives';
import { api, type RideRow } from '../app/api';
import { fmtTime } from '../hud/zones';

ModuleRegistry.registerModules([AllCommunityModule]);
// Grid theme from design tokens (no raw hex in components: read the CSS variables)
const v = (n: string) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const gridTheme = () => themeQuartz.withParams({ backgroundColor: 'transparent', foregroundColor: v('--color-on-surface'), headerBackgroundColor: 'rgb(255 255 255 / 0.04)', headerTextColor: v('--color-text-secondary'), borderColor: 'rgb(255 255 255 / 0.08)', rowHoverColor: 'rgb(255 255 255 / 0.06)', accentColor: v('--color-accent'), fontFamily: 'Inter', fontSize: 14, headerFontSize: 11, oddRowBackgroundColor: 'rgb(255 255 255 / 0.02)' });

export default function Activities() {
  const nav = useNavigate(); const [rows, setRows] = useState<RideRow[] | null>(null); const [err, setErr] = useState<string | null>(null);
  useEffect(() => { api.listRides().then(setRows).catch((e: Error) => setErr(e.message)); }, []);
  const cols = useMemo<ColDef<RideRow>[]>(() => [
    { headerName: 'Date', field: 'startedAt', sort: 'desc', width: 170, valueFormatter: (p) => new Date(p.value as string).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) },
    { headerName: 'Ride', field: 'name', flex: 1, minWidth: 220 },
    { headerName: 'Mode', field: 'mode', width: 120 },
    { headerName: 'Time', width: 100, valueGetter: (p) => p.data?.summary?.movingS ?? 0, valueFormatter: (p) => fmtTime(p.value as number) },
    { headerName: 'km', width: 90, valueGetter: (p) => +((p.data?.summary?.distanceM ?? 0) / 1000).toFixed(1) },
    { headerName: 'Avg W', width: 95, valueGetter: (p) => p.data?.summary?.avgPower ?? null },
    { headerName: 'NP', width: 85, valueGetter: (p) => p.data?.summary?.np ?? null },
    { headerName: 'TSS', width: 85, valueGetter: (p) => p.data?.summary?.tss ?? null },
    { headerName: 'IF', width: 80, valueGetter: (p) => p.data?.summary?.if ?? null },
    { headerName: 'Avg HR', width: 95, valueGetter: (p) => p.data?.summary?.avgHr ?? null },
    { headerName: 'Trainer', width: 110, valueGetter: (p) => (p.data?.simulator ? 'Demo' : 'Real') },
  ], []);
  const total = rows?.reduce((a, r) => ({ s: a.s + (r.summary?.movingS ?? 0), km: a.km + (r.summary?.distanceM ?? 0) / 1000, tss: a.tss + (r.summary?.tss ?? 0) }), { s: 0, km: 0, tss: 0 });
  return (
    <div className="max-w-[1440px] mx-auto px-12 py-8 space-y-6">
      <div className="flex items-end justify-between"><div><Label className="text-accent">Ride log</Label><h1 className="font-metric text-metric-hero uppercase leading-none text-on-surface">Activities</h1></div>
        {total && <div className="flex gap-8 text-right">{[['Rides', String(rows!.length)], ['Time', fmtTime(total.s)], ['Distance', `${total.km.toFixed(0)} km`], ['TSS', String(total.tss)]].map(([l, x]) => <div key={l}><Label>{l}</Label><div className="font-metric-live text-metric-lg text-text">{x}</div></div>)}</div>}</div>
      {err && <p className="text-status-danger">{err}</p>}
      {rows && !rows.length && <div className="rounded-2xl bg-surface-container-low/70 p-8 flex justify-between items-center"><p className="text-body-lg text-text-secondary">No rides yet.</p><Button variant="primary" onClick={() => nav('/workouts')}>Pick a workout</Button></div>}
      {rows && rows.length > 0 && <div className="rounded-2xl bg-surface-container-low/70 p-2 h-[640px]"><AgGridReact<RideRow> theme={gridTheme()} rowData={rows} columnDefs={cols} defaultColDef={{ sortable: true, filter: true, resizable: true }} pagination paginationPageSize={20} onRowClicked={(e) => e.data && nav(`/summary/${e.data.id}`)} rowClass="cursor-pointer" /></div>}
    </div>
  );
}
