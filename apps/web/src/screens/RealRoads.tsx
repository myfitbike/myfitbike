// Routes → Real roads (optional real-road mode, Phase 6): import a GPX / TCX / FIT track, prepare and bake it on
// this device, then ride it like a Velora route (route detail, ghosts, segment PBs on its climbs).
import { distOf, elevOf, unitLabels } from '@myfitbike/shared';
import { useUnits } from '../app/store';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { Button, Chip, Icon, Label } from '../design/primitives';
import { deleteRealRoute, importRealRoute, listRealRoutes, type RealRouteRow } from '../realroad/realRoads';
import { DEM_ATTRIBUTION } from '../realroad/dem';

export function RealRoadsTab() {
  const u = useUnits();
  const nav = useNavigate(); const file = useRef<HTMLInputElement>(null); const [rows, setRows] = useState<RealRouteRow[] | null>(null);
  const [busy, setBusy] = useState<{ stage: string; frac: number } | null>(null); const [msg, setMsg] = useState<{ text: string; tone: 'success' | 'warning' | 'danger' } | null>(null);
  const load = () => listRealRoutes().then(setRows).catch((e: Error) => setMsg({ text: e.message, tone: 'danger' })); useEffect(() => { void load(); }, []);
  async function onFile(f: File | undefined) {
    if (!f) return; setMsg(null); setBusy({ stage: 'Reading file', frac: 0 });
    try { const r = await importRealRoute(f, (stage, frac) => setBusy({ stage, frac })); setMsg(r.warnings.length ? { text: `Imported with notes: ${r.warnings.join('; ')}`, tone: 'warning' } : { text: 'Route imported and baked', tone: 'success' }); await load(); }
    catch (e) { setMsg({ text: (e as Error).message, tone: 'danger' }); } finally { setBusy(null); if (file.current) file.current.value = ''; }
  }
  return (
    <div className="space-y-6">
      <div className="rounded-2xl bg-surface-container-low/70 p-6 flex items-center justify-between gap-6">
        <div><h3 className="text-headline-md text-text">Ride a real road</h3><p className="text-body-md text-on-surface-variant max-w-3xl">Import a route as GPX, TCX or FIT (from Garmin Connect, a route planner or a past ride). Elevation comes from open terrain data, smoothed so the trainer never jumps; the 3D world is built once on this computer and stored for offline riding.</p></div>
        <input ref={file} type="file" accept=".gpx,.tcx,.fit" hidden aria-label="Import a GPS route file" onChange={(e) => void onFile(e.target.files?.[0])} />
        <Button variant="primary" icon="upload" disabled={!!busy} onClick={() => file.current?.click()}>Import GPX / TCX / FIT</Button>
      </div>
      {busy && <div className="rounded-xl bg-black/25 p-4" role="status"><div className="flex justify-between text-body-md text-text mb-2"><span>{busy.stage}…</span><span>{Math.round(busy.frac * 100)} %</span></div><div className="h-2 rounded-full bg-white/10 overflow-hidden"><div className="h-full bg-accent transition-[width]" style={{ width: `${busy.frac * 100}%` }} /></div></div>}
      {msg && <Chip tone={msg.tone}>{msg.text}</Chip>}
      {rows && !rows.length && !busy && <p className="text-body-lg text-text-secondary">No real roads yet.</p>}
      <div className="grid grid-cols-3 gap-6">{rows?.map((r) => (
        <article key={r.id} className="rounded-2xl bg-surface-container-low/70 p-5 flex flex-col gap-3">
          <div className="flex justify-between items-start"><Chip icon="alt_route">Real road</Chip><button aria-label={`Delete ${r.name}`} className="text-text-muted hover:text-status-danger" onClick={() => { if (confirm(`Delete "${r.name}"? Rides on it are kept.`)) void deleteRealRoute(r.id).then(load); }}><Icon name="delete" size={18} /></button></div>
          <h3 className="text-headline-md text-text cursor-pointer" onClick={() => nav(`/routes/${r.id}`)}>{r.name}</h3>
          <div className="flex gap-6 text-body-md"><span><b className="font-metric-live text-metric-md text-text">{distOf(r.lengthM, u).toFixed(1)}</b> {unitLabels(u).dist}</span><span><b className="font-metric-live text-metric-md text-accent">{Math.round(elevOf(r.ascentM, u))}</b> {unitLabels(u).elev}</span></div>
          <div className="text-[12px] text-text-muted truncate">{r.fileName} · {new Date(r.createdAt).toLocaleDateString()}</div>
          <div className="flex gap-2 justify-end mt-auto"><Button size="sm" onClick={() => nav(`/routes/${r.id}`)}>Details</Button><Button size="sm" variant="primary" icon="play_arrow" onClick={() => nav(`/ride?mode=route&route=${r.id}`)}>Ride</Button></div>
        </article>))}</div>
      <Label className="text-[11px] normal-case tracking-normal text-text-muted">{DEM_ATTRIBUTION}</Label>
    </div>
  );
}
