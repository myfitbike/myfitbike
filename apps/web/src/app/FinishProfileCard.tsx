// Home: "Finish your profile" (PLAN 16.21 — ride first, profile later). Non-blocking; weight and FTP inline, the
// full guided setup one click away. Hidden once the profile is confirmed, or when dismissed on this browser.
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { effectiveFtp, unitLabels, weightOf, weightToKg, type ProfileInput } from '@veloworld/shared';
import { Button, Card, Chip, Icon, Label, TextField } from '../design/primitives';
import { useApp } from './store';
import { api } from './api';

const KEY = 'vw.finishProfileDismissed';
const dismissedHere = () => { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } };

export function FinishProfileCard() {
  const nav = useNavigate(); const profile = useApp((s) => s.profile); const setProfile = useApp((s) => s.setProfile);
  const [hidden, setHidden] = useState(dismissedHere); const u = profile?.units ?? 'metric';
  const [w, setW] = useState(() => (profile ? String(+weightOf(profile.weightKg, u).toFixed(1)) : '')); const [ftp, setFtp] = useState(profile?.ftpW ? String(profile.ftpW) : '');
  const [err, setErr] = useState<string | null>(null); const [saving, setSaving] = useState(false);
  if (!profile || profile.setupComplete || hidden) return null;
  const kg = weightToKg(Number(w), u); const ftpN = ftp === '' ? null : Number(ftp);
  const ok = kg >= 30 && kg <= 250 && (ftpN === null || (ftpN >= 50 && ftpN <= 700));
  async function save() {
    setSaving(true); setErr(null);
    try { const { id: _id, ...input } = profile!; setProfile(await api.saveProfile({ ...input, weightKg: +kg.toFixed(1), ftpW: ftpN, setupComplete: true } as ProfileInput)); }
    catch (e) { setErr((e as Error).message); } finally { setSaving(false); }
  }
  const dismiss = () => { try { localStorage.setItem(KEY, '1'); } catch { /* private mode: hide for this visit only */ } setHidden(true); };
  return (
    <Card className="p-6 flex flex-col gap-4">
      <div className="flex justify-between items-start gap-4">
        <div><Label className="text-accent flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-accent" />Finish your profile · 20 seconds</Label>
          <p className="text-body-md text-on-surface-variant mt-1 max-w-3xl">Your weight sets climbing speed; your FTP sets every workout target. Until then VeloWorld uses estimates ({`${Math.round(weightOf(profile.weightKg, u))} ${unitLabels(u).weight}`}, FTP {profile.ftpW ?? effectiveFtp(profile)} W), marked "est." on the ride screen.</p></div>
        <button aria-label="Dismiss" className="text-text-muted hover:text-text" onClick={dismiss}><Icon name="close" size={20} /></button>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <TextField label="Your weight" type="number" suffix={unitLabels(u).weight} value={w} onChange={(e) => setW(e.target.value)} className="w-44" />
        <TextField label="FTP (if you know it)" type="number" suffix="W" value={ftp} placeholder="not sure" onChange={(e) => setFtp(e.target.value)} className="w-52" />
        <Button variant="primary" icon="check" disabled={!ok || saving} onClick={() => void save()}>Save</Button>
        <Button variant="ghost" onClick={() => nav('/ride?mode=ftpRamp&workout=builtin-test-ramp')}>Don't know your FTP? Ramp test</Button>
        <Button variant="ghost" onClick={() => nav('/welcome')}>Guided setup (look, sensors)</Button>
        <Button variant="ghost" onClick={() => nav('/ride?mode=workout&workout=builtin-guided-spin')}>2-min guided spin</Button>
      </div>
      {err && <Chip tone="danger">{err}</Chip>}
    </Card>
  );
}
