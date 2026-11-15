// Sign-in for the published app (PLAN 17.2), with Supabase Auth. The login page calls only the four functions below;
// each resolves with an error to show, a notice ("check your e-mail"), or nothing on success. Every request to /api
// gets the rider's access token added here, in one place, so no screen has to handle tokens. Without the two
// VITE_SUPABASE_* values (local development) the app runs in single-rider mode with no login.
import { useSyncExternalStore } from 'react';
import { createClient, type Session } from '@supabase/supabase-js';

const URL_ = import.meta.env.VITE_SUPABASE_URL as string | undefined, KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
/** API origin when it isn't served under /api on this site (e.g. a workers.dev URL). */
const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/$/, '');
export const supabase = URL_ && KEY ? createClient(URL_, KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }) : null;
/** True when Supabase is configured; without it the app runs in local single-rider mode with no login. */
export const authEnabled = !!supabase;

export type AuthResult = { error?: string; notice?: string };
const redirect = (path = '/') => `${location.origin}${path}`;
/** Supabase's messages are fine for riders, except a few that read like server logs. */
const friendly = (m: string) => (/invalid login credentials/i.test(m) ? 'Wrong e-mail or password.' : /email not confirmed/i.test(m) ? 'Please confirm your e-mail first — check your inbox for the link.' : /rate limit/i.test(m) ? 'Too many attempts — please wait a minute and try again.' : m);
const off: AuthResult = { error: 'Sign-in is not set up on this copy of MyFitBike.' };

export async function signInWithPassword(email: string, password: string): Promise<AuthResult> {
  if (!supabase) return off; const { error } = await supabase.auth.signInWithPassword({ email, password }); return error ? { error: friendly(error.message) } : {};
}
export async function signUpWithPassword(email: string, password: string): Promise<AuthResult> {
  if (!supabase) return off; const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: redirect('/') } });
  if (error) return { error: friendly(error.message) };
  return data.session ? {} : { notice: `Almost there — we sent a confirmation link to ${email}. Open it to finish creating your account.` };
}
export async function signInWithGoogle(): Promise<AuthResult> {
  if (!supabase) return off; const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: redirect('/') } }); return error ? { error: friendly(error.message) } : {};
}
export async function sendPasswordReset(email: string): Promise<AuthResult> {
  if (!supabase) return off; const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: redirect('/reset-password') });
  return error ? { error: friendly(error.message) } : { notice: `If ${email} has an account, a link to choose a new password is on its way.` };
}
export async function setNewPassword(password: string): Promise<AuthResult> {
  if (!supabase) return off; const { error } = await supabase.auth.updateUser({ password }); return error ? { error: friendly(error.message) } : {};
}
export async function signOut() { await supabase?.auth.signOut(); location.assign('/'); }

// ---- session state for React ----
type State = { ready: boolean; session: Session | null; recovering: boolean };
let state: State = { ready: !supabase, session: null, recovering: false }; const subs = new Set<() => void>();
const set = (p: Partial<State>) => { state = { ...state, ...p }; subs.forEach((f) => f()); };
if (supabase) {
  void supabase.auth.getSession().then(({ data }) => set({ ready: true, session: data.session }));
  supabase.auth.onAuthStateChange((ev, session) => set({ ready: true, session, ...(ev === 'PASSWORD_RECOVERY' ? { recovering: true } : {}) }));
}
/** { ready, session, recovering } — `ready` is false only while the stored session is being read at start-up. */
export const useAuth = () => useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => state);

// ---- every /api request carries the token (and goes to the API origin when it is separate) ----
if (supabase || API_BASE) {
  const orig = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const path = url.startsWith(location.origin) ? url.slice(location.origin.length) : url;
    if (!path.startsWith('/api/')) return orig(input, init);
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    const token = supabase ? (await supabase.auth.getSession()).data.session?.access_token : undefined; /* refreshes an expiring token */
    if (token) headers.set('authorization', `Bearer ${token}`);
    const target = API_BASE ? `${API_BASE}${path.slice(4)}` : path;
    const res = await orig(input instanceof Request ? new Request(target, input) : target, { ...init, headers });
    if (res.status === 401 && supabase && state.session) void supabase.auth.signOut(); /* expired or revoked: back to the login page */
    return res;
  };
}
