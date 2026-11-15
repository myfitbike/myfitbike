// Routes → Real roads (optional real-road mode, Phase 6): import a GPX / TCX / FIT track, prepare and bake it on
// this device, then ride it like a Velora route (route detail, ghosts, segment PBs on its climbs). World Tour routes
// (PLAN 16.26) ship with the app as GPX and are prepared the same way on first use; only the rider's imports can be deleted.
import { distOf, elevOf, unitLabels } from '@myfitbike/shared';
import { useUnits } from '../app/store';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { Button, Chip, Icon, Label } from '../design/primitives';
import { deleteRealRoute, importRealRoute, listRealRoutes, type RealRouteRow } from '../realroad/realRoads';
import { DEM_ATTRIBUTION } from '../realroad/dem';
import catalog from '../../../../content/real-roads/catalog.json';

type TourRoute = { key: string; name: string; region: string; blurb: string; file: string; approxKm: number };
const TOUR = catalog as TourRoute[];
const gpx = import.meta.glob('../../../../content/real-roads/*.gpx', { query: '?raw', import: 'default' }) as Record<string, () => Promise<string>>; /* loaded only when prepared */
const gpxFile = async (t: TourRoute) => new File([await gpx[`../../../../content/real-roads/${t.file}`]!()], t.file, { type: 'application/gpx+xml' });

export function RealRoadsTab() {
  const u = useUnits();
  const nav = useNavigate(); const file = useRef<HTMLInputElement>(null); const [rows, setRows] = useState<RealRouteRow[] | null>(null);
  const [busy, setBusy] = useState<{ stage: string; frac: number } | null>(null); const [msg, setMsg] = useState<{ text: string; tone: 'success' | 'warning' | 'danger' } | null>(null);
  const load = () => listRealRoutes().then(setRows).catch((e: Error) => setMsg({ text: e.message, tone: 'danger' })); useEffect(() => { void load(); }, []);
  async function onFile(f: File | undefined, builtin?: string) {
    if (!f) return; setMsg(null); setBusy({ stage: builtin ? `Preparing ${TOUR.find((t) => t.key === builtin)?.name}` : 'Reading file', frac: 0 });
    try { const r = await importRealRoute(f, (stage, frac) => setBusy({ stage, frac }), { builtin }); setMsg(r.warnings.length ? { text: `Imported with notes: ${r.warnings.join('; ')}`, tone: 'warning' } : { text: builtin ? 'Route prepared — ready to ride' : 'Route imported and baked', tone: 'success' }); await load(); }
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
      <section className="space-y-3"><div><h3 className="text-headline-md text-text">World Tour</h3><p className="text-body-md text-text-secondary">Famous climbs, ready to ride. Each is prepared once on this device (elevation and 3D world, about a minute) and then works offline.</p></div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">{TOUR.map((t) => { const r = rows?.find((x) => x.builtin === t.key); return (
          <article key={t.key} className="rounded-2xl bg-surface-container-low/70 p-5 flex flex-col gap-3">
            <div className="flex justify-between items-start gap-2"><Chip icon="alt_route">World Tour</Chip><span className="text-[12px] text-text-muted text-right">{t.region}</span></div>
            <h3 className={r ? 'text-headline-md text-text cursor-pointer' : 'text-headline-md text-text'} onClick={() => r && nav(`/routes/${r.id}`)}>{t.name}</h3>
            <p className="text-body-md text-on-surface-variant">{t.blurb}</p>
            <div className="flex gap-6 text-body-md">{r ? <><span><b className="font-metric-live text-metric-md text-text">{distOf(r.lengthM, u).toFixed(1)}</b> {unitLabels(u).dist}</span><span><b className="font-metric-live text-metric-md text-accent">{Math.round(elevOf(r.ascentM, u))}</b> {unitLabels(u).elev}</span></>
              : <span className="text-text-secondary">≈ <b className="font-metric-live text-metric-md text-text">{distOf(t.approxKm * 1000, u).toFixed(1)}</b> {unitLabels(u).dist}</span>}</div>
            <div className="flex gap-2 justify-end mt-auto">{r ? <><Button size="sm" onClick={() => nav(`/routes/${r.id}`)}>Details</Button><Button size="sm" variant="primary" icon="play_arrow" onClick={() => nav(`/ride?mode=route&route=${r.id}`)}>Ride</Button></>
              : <Button size="sm" variant="primary" icon="download" disabled={!!busy || !rows} onClick={() => void gpxFile(t).then((f) => onFile(f, t.key))}>Prepare (one-time download)</Button>}</div>
          </article>); })}</div></section>
      <section className="space-y-3"><h3 className="text-headline-md text-text">Your imports</h3>
      {rows && !rows.some((r) => !r.builtin) && <p className="text-body-md text-text-secondary">Nothing imported yet — use Import above for any GPX, TCX or FIT route.</p>}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">{rows?.filter((r) => !r.builtin).map((r) => (
        <article key={r.id} className="rounded-2xl bg-surface-container-low/70 p-5 flex flex-col gap-3">
          <div className="flex justify-between items-start"><Chip icon="alt_route">Real road</Chip><button aria-label={`Delete ${r.name}`} className="text-text-muted hover:text-status-danger" onClick={() => { if (confirm(`Delete "${r.name}"? Rides on it are kept.`)) void deleteRealRoute(r.id).then(load); }}><Icon name="delete" size={18} /></button></div>
          <h3 className="text-headline-md text-text cursor-pointer" onClick={() => nav(`/routes/${r.id}`)}>{r.name}</h3>
          <div className="flex gap-6 text-body-md"><span><b className="font-metric-live text-metric-md text-text">{distOf(r.lengthM, u).toFixed(1)}</b> {unitLabels(u).dist}</span><span><b className="font-metric-live text-metric-md text-accent">{Math.round(elevOf(r.ascentM, u))}</b> {unitLabels(u).elev}</span></div>
          <div className="text-[12px] text-text-muted truncate">{r.fileName} · {new Date(r.createdAt).toLocaleDateString()}</div>
          <div className="flex gap-2 justify-end mt-auto"><Button size="sm" onClick={() => nav(`/routes/${r.id}`)}>Details</Button><Button size="sm" variant="primary" icon="play_arrow" onClick={() => nav(`/ride?mode=route&route=${r.id}`)}>Ride</Button></div>
        </article>))}</div></section>
      <Label className="text-[11px] normal-case tracking-normal text-text-muted">{DEM_ATTRIBUTION} World Tour tracks: © OpenStreetMap contributors (ODbL), routed with OSRM.</Label>
    </div>
  );
}
