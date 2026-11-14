// "Upload to Strava" on the summary (plan 8.1). Hidden entirely until Strava is connected (opt-in, off by default).
import { useEffect, useState } from 'react';
import { Button } from '../design/primitives';

type Status = { connected: boolean; upload?: { status: string; stravaActivityId: number | null; lastError: string | null } | null };
export function StravaUpload({ rideId }: { rideId: number }) {
  const [s, setS] = useState<Status | null>(null); const [busy, setBusy] = useState(false);
  const load = () => fetch(`/api/strava/status?rideId=${rideId}`).then((r) => (r.ok ? r.json() : null)).then(setS).catch(() => setS(null));
  useEffect(() => { void load(); }, [rideId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!s?.upload || !['queued', 'uploading'].includes(s.upload.status)) return; const id = setTimeout(() => void load(), 3000); return () => clearTimeout(id); }, [s]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!s?.connected) return null;
  const u = s.upload;
  if (u?.status === 'done' && u.stravaActivityId) return <a href={`https://www.strava.com/activities/${u.stravaActivityId}`} target="_blank" rel="noreferrer"><Button icon="check_circle">Uploaded ✓ View on Strava</Button></a>;
  if (u && ['queued', 'uploading'].includes(u.status)) return <Button disabled icon="progress_activity">Uploading to Strava…</Button>;
  return <Button icon="upload" disabled={busy} title={u?.lastError ?? undefined} onClick={async () => { setBusy(true); await fetch('/api/strava/uploads', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ rideId }) }); setBusy(false); void load(); }}>{u?.status === 'failed' ? 'Retry Strava upload' : 'Upload to Strava'}</Button>;
}
