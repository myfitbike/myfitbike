// "Choose a new password" for a signed-in rider. (Reset e-mails now open Firebase's own page, which returns to /login.)
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Button, Card, Chip, Label, TextField } from '../design/primitives';
import { setNewPassword } from '../app/auth';

export function ResetPassword() {
  const nav = useNavigate(); const [pw, setPw] = useState(''); const [pw2, setPw2] = useState(''); const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  const ok = pw.length >= 8 && pw === pw2;
  async function save() { setBusy(true); setErr(null); const r = await setNewPassword(pw); setBusy(false); if (r.error) setErr(r.error); else nav('/', { replace: true }); }
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card level={3} className="w-full max-w-md p-8 space-y-5">
        <div><Label className="text-accent">MyFitBike</Label><h1 className="text-headline-md text-text mt-1">Choose a new password</h1></div>
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (ok) void save(); }}>
          <TextField label="New password" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />
          <TextField label="Repeat it" type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} />
          {pw2 && pw !== pw2 && <p className="text-[12px] text-status-warning">The two passwords don't match.</p>}
          {err && <Chip tone="danger">{err}</Chip>}
          <Button variant="primary" type="submit" disabled={!ok || busy} className="w-full">{busy ? 'Saving…' : 'Save and continue'}</Button>
        </form>
        <p className="text-[12px] text-text-muted">At least 8 characters.</p>
      </Card>
    </div>
  );
}
