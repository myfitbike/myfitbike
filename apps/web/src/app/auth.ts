// Sign-in for the published app (PLAN 17.2), with Firebase Auth. The login page calls only the functions below; each
// resolves with an error to show, a notice ("check your e-mail"), or nothing on success. Every request to /api gets the
// rider's ID token added here, in one place, so no screen has to handle tokens. Without the VITE_FIREBASE_* values
// (local development) the app runs in single-rider mode with no login.
import { useSyncExternalStore } from 'react';
import { initializeApp } from '@firebase/app';
import {
  GoogleAuthProvider, createUserWithEmailAndPassword, getAuth, onAuthStateChanged, sendEmailVerification, sendPasswordResetEmail,
  signInWithEmailAndPassword, signInWithPopup, signOut as fbSignOut, updatePassword, type User,
} from '@firebase/auth';

const API_KEY = import.meta.env.VITE_FIREBASE_API_KEY as string | undefined, PROJECT = import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined;
/** API origin when it isn't served under /api on this site (e.g. a workers.dev URL). */
const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/$/, '');
export const auth = API_KEY && PROJECT
  ? getAuth(initializeApp({ apiKey: API_KEY, projectId: PROJECT, authDomain: (import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined) || `${PROJECT}.firebaseapp.com` }))
  : null;
/** True when Firebase is configured; without it the app runs in local single-rider mode with no login. */
export const authEnabled = !!auth;

export type AuthResult = { error?: string; notice?: string };
const back = (path = '/login') => ({ url: `${location.origin}${path}` });
/** Firebase reports codes, not sentences; these are the ones a rider can act on. */
const friendly = (e: unknown): string => {
  const code = (e as { code?: string }).code ?? '';
  if (/invalid-credential|wrong-password|user-not-found|invalid-email/.test(code)) return 'Wrong e-mail or password.';
  if (code.includes('email-already-in-use')) return 'There is already an account with this e-mail — log in instead.';
  if (code.includes('weak-password')) return 'Choose a longer password (at least 8 characters).';
  if (code.includes('too-many-requests')) return 'Too many attempts — please wait a minute and try again.';
  if (code.includes('popup-blocked')) return 'Your browser blocked the Google window — allow pop-ups for this site and try again.';
  if (code.includes('network-request-failed')) return 'No connection — check your internet and try again.';
  return 'Sign-in didn’t work — please try again.';
};
const off: AuthResult = { error: 'Sign-in is not set up on this copy of MyFitBike.' };
const unconfirmed = (email: string) => `Please confirm your e-mail first — we sent a new link to ${email}.`;

export async function signInWithPassword(email: string, password: string): Promise<AuthResult> {
  if (!auth) return off;
  try {
    const { user } = await signInWithEmailAndPassword(auth, email, password);
    /* the API only accepts confirmed e-mails (invite list, re-linking old accounts); resend the link so nobody is stuck */
    if (!user.emailVerified) { await sendEmailVerification(user, back()).catch(() => {}); await fbSignOut(auth); return { error: unconfirmed(email) }; }
    return {};
  } catch (e) { return { error: friendly(e) }; }
}
export async function signUpWithPassword(email: string, password: string): Promise<AuthResult> {
  if (!auth) return off;
  try {
    const { user } = await createUserWithEmailAndPassword(auth, email, password); await sendEmailVerification(user, back()); await fbSignOut(auth);
    return { notice: `Almost there — we sent a confirmation link to ${email}. Open it, then log in here.` };
  } catch (e) { return { error: friendly(e) }; }
}
/** Shown whenever sign-in is set up: switch the Google provider on in Firebase → Authentication → Sign-in method. */
export async function googleEnabled(): Promise<boolean> { return authEnabled; }
export async function signInWithGoogle(): Promise<AuthResult> {
  if (!auth) return off;
  try { await signInWithPopup(auth, new GoogleAuthProvider()); return {}; }
  catch (e) { return /popup-closed-by-user|cancelled-popup-request/.test((e as { code?: string }).code ?? '') ? {} : { error: friendly(e) }; }
}
/** The link opens Firebase's own "choose a new password" page, which returns to the login page. */
export async function sendPasswordReset(email: string): Promise<AuthResult> {
  if (!auth) return off;
  try { await sendPasswordResetEmail(auth, email, back()); } catch (e) { if (!(e as { code?: string }).code?.includes('user-not-found')) return { error: friendly(e) }; }
  return { notice: `If ${email} has an account, a link to choose a new password is on its way.` };
}
export async function setNewPassword(password: string): Promise<AuthResult> {
  if (!auth?.currentUser) return off; try { await updatePassword(auth.currentUser, password); return {}; } catch (e) { return { error: friendly(e) }; }
}
export async function signOut() { if (auth) await fbSignOut(auth); location.assign('/'); }

// ---- session state for React ----
type State = { ready: boolean; session: User | null; recovering: boolean };
let state: State = { ready: !auth, session: null, recovering: false }; const subs = new Set<() => void>();
const set = (p: Partial<State>) => { state = { ...state, ...p }; subs.forEach((f) => f()); };
/* an unconfirmed e-mail account is not signed in as far as the app is concerned (the API would refuse it) */
if (auth) onAuthStateChanged(auth, (u) => set({ ready: true, session: u && u.emailVerified ? u : null }));
/** The name the sign-in provider gives (Google: the account's full name), for a new rider's profile; null for e-mail sign-up. */
export function providerName(): string | null { const n = state.session?.displayName?.trim(); return n ? n.slice(0, 60) : null; }
/** { ready, session, recovering } — `ready` is false only while the stored session is being read at start-up. */
export const useAuth = () => useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => state);

// ---- every /api request carries the token (and goes to the API origin when it is separate) ----
if (auth || API_BASE) {
  const orig = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const path = url.startsWith(location.origin) ? url.slice(location.origin.length) : url;
    if (!path.startsWith('/api/')) return orig(input, init);
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    if (auth) await auth.authStateReady(); /* requests made at start-up wait for the stored session */
    const token = state.session ? await state.session.getIdToken().catch(() => undefined) : undefined; /* refreshes an expiring token */
    if (token) headers.set('authorization', `Bearer ${token}`);
    const target = API_BASE ? `${API_BASE}${path.slice(4)}` : path;
    const res = await orig(input instanceof Request ? new Request(target, input) : target, { ...init, headers });
    if (res.status === 401 && auth && state.session) void fbSignOut(auth); /* expired or revoked: back to the login page */
    return res;
  };
}
