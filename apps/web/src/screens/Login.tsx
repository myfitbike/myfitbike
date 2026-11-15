// Public login page (PLAN 17.4): artwork + pitch on the left, the form on the right (stacks on phones).
// Calls only the functions in app/auth.ts; shows the error or notice each one returns.
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { googleEnabled, signInWithGoogle, signInWithPassword, signUpWithPassword, sendPasswordReset, type AuthResult } from '../app/auth';
import { Button, Icon, Label, cx } from '../design/primitives';
import type { IconName } from '../design/icons.generated';
import { Logo } from '../landing/ui';

/** Google's standard "G" mark, which Google's sign-in branding guidelines ask buttons to show. */
const GoogleG = () => (
  <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden className="shrink-0">
    <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
    <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
    <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
    <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
  </svg>
);

type Mode = 'login' | 'signup' | 'reset';
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TITLES: Record<Mode, [string, string]> = {
  login: ['Welcome back', 'Log in to pick up where you left off.'],
  signup: ['Create your account', 'Free, in your browser. Bring a smart trainer — or try the demo trainer.'],
  reset: ['Reset your password', "Enter your account e-mail and we'll send you a reset link."],
};

function ArtSide() {
  const points: [IconName, string][] = [['landscape', 'Ride the 3D island of Velora and eight famous real climbs'], ['bolt', 'ERG workouts, training plans and a ramp FTP test'], ['upload', 'Upload rides to Strava when you finish']];
  return (
    <aside className="relative overflow-hidden md:min-h-screen border-b md:border-b-0 md:border-r border-white/8">
      <img src="/landing/ride-climb.jpg" alt="" aria-hidden className="absolute inset-0 w-full h-full object-cover opacity-45 md:opacity-55" />
      <div aria-hidden className="absolute inset-0 bg-linear-to-t from-surface via-surface/70 to-surface/30" />
      <div aria-hidden className="absolute -top-24 -left-24 w-96 h-96 rounded-full bg-accent/20 blur-3xl" />
      <div className="relative h-full flex flex-col gap-6 p-5 sm:p-8 lg:p-12">
        <Logo />
        <div className="hidden md:block mt-auto space-y-6 max-w-lg">
          <h2 className="text-[44px] leading-[48px] lg:text-[56px] lg:leading-[58px] font-bold tracking-tight text-text">Your trainer.<br /><span className="text-accent">A whole island</span> to climb.</h2>
          <ul className="space-y-3">{points.map(([i, t]) => <li key={t} className="flex items-center gap-3 text-body-lg text-on-surface"><span className="w-9 h-9 rounded-lg bg-white/10 border border-white/12 flex items-center justify-center text-accent"><Icon name={i} size={20} /></span>{t}</li>)}</ul>
          <div className="flex items-end gap-4">
            <img src="/landing/route-detail.jpg" alt="Route page for Solace Summit with distance, ascent and a ghost toggle" loading="lazy" className="w-3/4 rounded-xl border border-white/14 shadow-modal" />
            <img src="/landing/phone-ride.jpg" alt="The ride screen on a phone" loading="lazy" className="w-1/4 rounded-xl border border-white/14 shadow-modal" />
          </div>
        </div>
      </div>
    </aside>
  );
}

function Field({ id, label, error, children }: { id: string; label: string; error?: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="block mb-2"><Label>{label}</Label></label>
      <div className={cx('flex items-center gap-3 h-14 px-4 rounded-control bg-white/6 border focus-within:border-accent focus-within:ring-3 focus-within:ring-accent/20', error ? 'border-status-danger/70' : 'border-white/12')}>{children}</div>
      {error && <p id={`${id}-err`} className="mt-1.5 text-body-md text-status-danger">{error}</p>}
    </div>
  );
}

export function Login() {
  const [params, setParams] = useSearchParams(); const nav = useNavigate();
  const m = params.get('mode'); const mode: Mode = m === 'signup' || m === 'reset' ? m : 'login';
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [show, setShow] = useState(false);
  const [google, setGoogle] = useState(false); useEffect(() => { void googleEnabled().then(setGoogle); }, []);
  const [busy, setBusy] = useState(false); const [result, setResult] = useState<AuthResult>({}); const [errs, setErrs] = useState<{ email?: string; password?: string }>({});

  const setMode = (next: Mode) => { setParams(next === 'login' ? {} : { mode: next }, { replace: true }); setResult({}); setErrs({}); };
  const run = async (fn: () => Promise<AuthResult>, onOk?: () => void) => {
    setBusy(true); setResult({});
    try { const r = await fn(); setResult(r); if (!r.error && !r.notice) onOk?.(); }
    catch (e) { setResult({ error: (e as Error).message || 'Something went wrong. Please try again.' }); }
    finally { setBusy(false); }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const v: typeof errs = {};
    if (!EMAIL.test(email.trim())) v.email = 'Enter a valid e-mail address.';
    if (mode === 'login' && !password) v.password = 'Enter your password.';
    if (mode === 'signup' && password.length < 8) v.password = 'Use at least 8 characters.';
    setErrs(v); if (v.email || v.password) return;
    const em = email.trim();
    if (mode === 'reset') void run(() => sendPasswordReset(em));
    else if (mode === 'signup') void run(() => signUpWithPassword(em, password), () => nav('/'));
    else void run(() => signInWithPassword(em, password), () => nav('/'));
  };

  const [title, sub] = TITLES[mode];
  return (
    <div className="min-h-screen grid md:grid-cols-2">
      <ArtSide />
      <main className="flex items-center justify-center px-4 py-10 sm:px-8 md:py-16">
        <div className="w-full max-w-md">
          {mode !== 'reset' && (
            <div role="tablist" aria-label="Account" className="grid grid-cols-2 rounded-xl bg-surface-container-low/80 border border-white/8 p-1 mb-8">
              {(['login', 'signup'] as const).map((t) => <button key={t} type="button" role="tab" aria-selected={mode === t} onClick={() => setMode(t)} className={cx('py-2.5 rounded-lg text-body-md font-semibold uppercase tracking-wider transition-colors focus-visible:outline-2 focus-visible:outline-accent', mode === t ? 'bg-accent text-on-accent' : 'text-text-secondary hover:text-text')}>{t === 'login' ? 'Log in' : 'Create account'}</button>)}
            </div>
          )}
          <h1 className="text-headline-lg text-text">{title}</h1>
          <p className="mt-2 mb-8 text-body-lg text-text-secondary">{sub}</p>

          <form onSubmit={submit} noValidate className="space-y-5" aria-busy={busy}>
            <Field id="email" label="E-mail" error={errs.email}>
              <Icon name="person" className="text-text-secondary" />
              <input id="email" type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={busy} aria-invalid={!!errs.email} aria-describedby={errs.email ? 'email-err' : undefined} placeholder="you@example.com" className="flex-1 min-w-0 bg-transparent outline-none text-body-lg text-text placeholder:text-text-muted" />
            </Field>
            {mode !== 'reset' && (
              <Field id="password" label="Password" error={errs.password}>
                <Icon name="lock" className="text-text-secondary" />
                <input id="password" type={show ? 'text' : 'password'} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} value={password} onChange={(e) => setPassword(e.target.value)} disabled={busy} aria-invalid={!!errs.password} aria-describedby={errs.password ? 'password-err' : mode === 'signup' ? 'password-hint' : undefined} className="flex-1 min-w-0 bg-transparent outline-none text-body-lg text-text" />
                <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? 'Hide password' : 'Show password'} aria-pressed={show} className="p-1.5 -mr-1.5 rounded-md text-text-secondary hover:text-text focus-visible:outline-2 focus-visible:outline-accent"><Icon name={show ? 'visibility_off' : 'visibility'} /></button>
              </Field>
            )}
            {mode === 'signup' && !errs.password && <p id="password-hint" className="-mt-3 text-body-md text-text-muted">At least 8 characters.</p>}
            {mode === 'login' && <div className="-mt-2 flex justify-end"><button type="button" onClick={() => setMode('reset')} className="text-body-md text-accent hover:underline underline-offset-2 rounded focus-visible:outline-2 focus-visible:outline-accent">Forgot password?</button></div>}

            {result.error && <div role="alert" className="rounded-control border border-status-danger/40 bg-status-danger/10 px-4 py-3 flex gap-2 text-body-md text-status-danger"><Icon name="error" size={18} className="mt-0.5" />{result.error}</div>}
            {result.notice && <div role="status" className="rounded-control border border-status-success/40 bg-status-success/10 px-4 py-3 flex gap-2 text-body-md text-status-success"><Icon name="check_circle" size={18} className="mt-0.5" />{result.notice}</div>}

            <Button type="submit" variant="primary" size="lg" disabled={busy} icon={busy ? 'progress_activity' : undefined} className="w-full">
              {busy ? 'Please wait…' : mode === 'login' ? 'Log in' : mode === 'signup' ? 'Create account' : 'Send reset link'}
            </Button>
          </form>

          {mode === 'reset' ? (
            <button type="button" onClick={() => setMode('login')} className="mt-6 inline-flex items-center gap-1 text-body-md text-text-secondary hover:text-text rounded focus-visible:outline-2 focus-visible:outline-accent"><Icon name="chevron_right" size={18} className="rotate-180" />Back to log in</button>
          ) : google && (<>
            <div className="my-6 flex items-center gap-4" aria-hidden><span className="h-px flex-1 bg-white/10" /><span className="text-label-caps uppercase text-text-muted">or</span><span className="h-px flex-1 bg-white/10" /></div>
            <Button type="button" variant="glass" size="lg" disabled={busy} onClick={() => void run(signInWithGoogle)} className="w-full normal-case tracking-normal"><GoogleG />Continue with Google</Button>
          </>)}

          <p className="mt-10 text-body-md text-text-muted">By continuing you agree to how we handle your data in our <Link to="/privacy" className="text-text-secondary underline underline-offset-2 hover:text-accent">privacy policy</Link>.</p>
          <Link to="/landing" className="mt-3 inline-flex items-center gap-1 text-body-md text-text-secondary hover:text-accent"><Icon name="home" size={18} />Back to the MyFitBike home page</Link>
        </div>
      </main>
    </div>
  );
}
