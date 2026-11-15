// Settings → Data and connections → Strava (plan 8.1). Off by default; nothing is sent until the rider connects.
// Brand: Strava's guidelines offer an official "Connect with Strava" button asset (developers.strava.com/guidelines §1.1);
// until the owner adds that asset we show a plain text button and never use Strava's logo.
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { Button, Chip, Label, Toggle, cx } from '../design/primitives';

type Status = { configured: boolean; connected: boolean; athlete: { name: string; photo: string | null } | null; settings: { autoUpload: 'ask' | 'auto' | 'never'; nameTemplate: string; includeHr: boolean } | null; recent: { rideId: number; name: string; status: string; lastError: string | null; stravaActivityId: number | null; updatedAt: string }[] };
const MSG: Record<string, [string, 'success' | 'danger' | 'warning']> = { connected: ['Strava connected', 'success'], denied: ['You declined access on Strava', 'warning'], scope: ['Upload permission was unticked on Strava — connect again and keep "upload activities" ticked', 'warning'], error: ['Could not connect to Strava', 'danger'] };

export function Connections() {
  const [s, setS] = useState<Status | null>(null); const [qs] = useSearchParams(); const flag = qs.get('strava'); const [err, setErr] = useState<string | null>(null);
  const load = () => fetch('/api/strava/status').then((r) => (r.ok ? r.json() : Promise.reject(new Error(`API ${r.status}`)))).then(setS).catch((e: Error) => setErr(e.message));
  useEffect(() => { void load(); }, []);
  const patch = async (b: Partial<NonNullable<Status['settings']>>) => { await fetch('/api/strava/settings', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }); void load(); };
  return (
    <section className="rounded-2xl bg-surface-container-low/70 backdrop-blur-xl p-8 shadow-ambient space-y-6">
      <div><Label className="text-accent mb-1">Data and connections</Label><h2 className="text-headline-lg text-text uppercase">Strava</h2><p className="text-body-md text-on-surface-variant mt-1">Optional. Uploads your rides as indoor virtual rides. Velora rides have no GPS, so Strava shows data without a map.</p></div>
      {flag && MSG[flag] && <Chip tone={MSG[flag][1]}>{MSG[flag][0]}</Chip>}
      {err && <Chip tone="danger">{err}</Chip>}
      {s && !s.configured && <div className="rounded-xl bg-black/25 p-5 text-body-md text-text-secondary space-y-1"><div className="text-text font-semibold">Strava is not set up on this computer yet</div>
        <ol className="list-decimal list-inside space-y-1"><li>Create a free personal API application at strava.com/settings/api (Authorization Callback Domain: <code>localhost</code>).</li><li>Put its Client ID and Client Secret into <code>apps/api/.env</code>, plus <code>TOKEN_ENCRYPTION_KEY</code> (<code>openssl rand -hex 32</code>).</li><li>Restart <code>pnpm dev</code>, then come back here.</li></ol></div>}
      {s?.configured && !s.connected && <Button className="bg-strava text-white border-0 hover:brightness-110" onClick={() => void fetch('/api/strava/oauth/url').then((r) => r.json()).then((j: { url?: string; error?: string }) => { if (j.url) location.assign(j.url); else alert(j.error ?? 'Could not reach Strava'); })}>Connect with Strava</Button>}
      {s?.connected && s.settings && <>
        <div className="flex items-center justify-between rounded-xl bg-black/25 p-5"><div className="flex items-center gap-4">{s.athlete?.photo && <img src={s.athlete.photo} alt="" className="w-12 h-12 rounded-full" />}<div><div className="text-body-lg font-semibold text-text">{s.athlete?.name || 'Strava athlete'}</div><Chip tone="success">Connected</Chip></div></div>
          <Button variant="danger" onClick={() => void fetch('/api/strava', { method: 'DELETE' }).then(load)}>Disconnect</Button></div>
        <div className="rounded-xl bg-black/25 p-5 flex items-center justify-between"><div><div className="text-body-lg font-semibold text-text">Upload rides</div><p className="text-body-md text-on-surface-variant">Demo-trainer rides, discarded rides and rides under a minute are never uploaded.</p></div>
          <div className="inline-flex flex-wrap max-w-full rounded-control bg-black/30 p-1" role="radiogroup" aria-label="Upload rides">{(['ask', 'auto', 'never'] as const).map((v) => <button key={v} role="radio" aria-checked={s.settings!.autoUpload === v} onClick={() => void patch({ autoUpload: v })} className={cx('px-4 py-2 rounded-md text-body-md font-semibold', s.settings!.autoUpload === v ? 'bg-accent text-on-accent' : 'text-text-secondary')}>{{ ask: 'Ask after each ride', auto: 'Automatically', never: 'Never' }[v]}</button>)}</div></div>
        <div className="rounded-xl bg-black/25 p-5 flex items-center justify-between gap-6"><div className="flex-1"><div className="text-body-lg font-semibold text-text">Activity name</div><input defaultValue={s.settings.nameTemplate} onBlur={(e) => void patch({ nameTemplate: e.target.value })} className="mt-2 w-full h-11 px-3 rounded-control bg-white/6 border border-white/12 text-text" aria-label="Activity name template" /><p className="text-[12px] text-text-muted mt-1">{'{name}'} is replaced by the route or workout name.</p></div>
          <label className="flex items-center gap-3"><span className="text-body-md text-text">Include heart rate</span><Toggle label="Include heart rate" checked={s.settings.includeHr} onChange={(v) => void patch({ includeHr: v })} /></label></div>
        {s.recent.length > 0 && <div><Label className="mb-2">Recent uploads</Label><div className="divide-y divide-white/6">{s.recent.map((u) => (
          <div key={u.rideId} className="flex items-center justify-between py-2 text-body-md"><span className="text-text">{u.name}</span><span className="flex items-center gap-3">{u.lastError && <span className="text-status-danger text-[12px]">{u.lastError}</span>}
            <Chip tone={u.status === 'done' ? 'success' : u.status === 'failed' ? 'danger' : 'warning'}>{u.status}</Chip>
            {u.status === 'done' && u.stravaActivityId && <a className="text-strava font-bold underline" href={`https://www.strava.com/activities/${u.stravaActivityId}`} target="_blank" rel="noreferrer">View on Strava</a>}
            {u.status === 'failed' && <Button size="sm" onClick={() => void fetch('/api/strava/uploads', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ rideId: u.rideId }) }).then(load)}>Retry</Button>}</span></div>))}</div></div>}
      </>}
      <IntervalsCard />
    </section>
  );
}

// intervals.icu (Phase 6): the API key goes to our server, which stores it encrypted and does the fetching.
function IntervalsCard() {
  const [st, setSt] = useState<{ configured: boolean; connected: boolean } | null>(null); const [key, setKey] = useState(''); const [msg, setMsg] = useState<[string, 'success' | 'danger'] | null>(null); const [busy, setBusy] = useState(false);
  const load = () => fetch('/api/intervals/status').then((r) => r.json()).then(setSt).catch(() => setSt(null)); useEffect(() => { void load(); }, []);
  const call = async (method: string, path: string, body?: unknown) => { const r = await fetch(`/api/intervals/${path}`, { method, headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined }); const j = r.status === 204 ? {} : await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error ?? `API ${r.status}`); return j; };
  const run = (f: () => Promise<void>) => { setBusy(true); setMsg(null); f().catch((e: Error) => setMsg([e.message, 'danger'])).finally(() => { setBusy(false); void load(); }); };
  return (
    <div className="rounded-xl bg-black/25 p-5 space-y-3">
      <div className="flex items-center justify-between"><div><div className="text-body-lg font-semibold text-text">intervals.icu</div><p className="text-body-md text-on-surface-variant">Imports workouts planned on your intervals.icu calendar for the next 14 days into your library.</p></div>{st?.connected && <Chip tone="success">Connected</Chip>}</div>
      {msg && <Chip tone={msg[1]}>{msg[0]}</Chip>}
      {st && !st.configured && <p className="text-body-md text-text-secondary">Set <code>TOKEN_ENCRYPTION_KEY</code> in <code>apps/api/.env</code> (<code>openssl rand -hex 32</code>) and restart <code>pnpm dev</code> first.</p>}
      {st?.configured && !st.connected && <div className="flex gap-3 items-center"><input type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder="API key (intervals.icu → Settings → Developer)" aria-label="intervals.icu API key" className="flex-1 h-11 px-3 rounded-control bg-white/6 border border-white/12 text-text" autoComplete="off" />
        <Button variant="primary" disabled={busy || !key} onClick={() => run(async () => { await call('PUT', 'key', { apiKey: key }); setKey(''); setMsg(['API key saved', 'success']); })}>Save key</Button></div>}
      {st?.connected && <div className="flex flex-wrap gap-3"><Button variant="primary" icon="sync" disabled={busy} onClick={() => run(async () => { const r = (await call('POST', 'sync')) as { imported: unknown[]; checked: number }; setMsg([`Imported ${r.imported.length} planned workout${r.imported.length === 1 ? '' : 's'} (${r.checked} calendar entries checked)`, 'success']); })}>Sync planned workouts</Button>
        <Button variant="danger" disabled={busy} onClick={() => run(() => call('DELETE', 'key').then(() => undefined))}>Remove key</Button></div>}
    </div>
  );
}
