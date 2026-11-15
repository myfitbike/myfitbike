// Accounts (PLAN 17.2). With Supabase configured, every request (except the public ones) must carry the Supabase
// access token; it is verified against the project's public signing keys (JWKS) — no shared secret. The rider's
// profile is looked up per request and every query is scoped to it. Without Supabase (local development, tests) the
// API keeps serving the single local profile.
import { AsyncLocalStorage } from 'node:async_hooks';
import type { MiddlewareHandler } from 'hono';
import type pg from 'pg';
import { createRemoteJWKSet, jwtVerify } from 'jose';

export type Identity = { userId: string; email: string | null };
export type AuthConfig =
  | { mode: 'none' }
  | { mode: 'supabase'; supabaseUrl: string; allowedEmails?: string[]; claimUnowned?: boolean; verify?: (token: string) => Promise<Identity> };

type Ctx = { id: Identity | null; profileId?: number | null };
const store = new AsyncLocalStorage<Ctx>();
/** The signed-in rider for this request (null in local mode). */
export const identity = () => store.getStore()?.id ?? null;

/** Paths reachable without a token: health checks only. (Strava returns to the web app, which is signed in.) */
const PUBLIC = [/^\/health$/];

export function supabaseVerifier(supabaseUrl: string): (token: string) => Promise<Identity> {
  const base = supabaseUrl.replace(/\/$/, ''); const jwks = createRemoteJWKSet(new URL(`${base}/auth/v1/.well-known/jwks.json`));
  return async (token) => {
    const { payload } = await jwtVerify(token, jwks, { issuer: `${base}/auth/v1`, audience: 'authenticated' });
    if (typeof payload.sub !== 'string') throw new Error('token has no subject');
    return { userId: payload.sub, email: typeof payload.email === 'string' ? payload.email.toLowerCase() : null };
  };
}

export function authMiddleware(cfg: AuthConfig): MiddlewareHandler {
  if (cfg.mode === 'none') return async (_c, next) => store.run({ id: null }, next);
  const verify = cfg.verify ?? supabaseVerifier(cfg.supabaseUrl); const allow = cfg.allowedEmails?.map((e) => e.trim().toLowerCase()).filter(Boolean) ?? [];
  return async (c, next) => {
    if (c.req.method === 'OPTIONS' || PUBLIC.some((p) => p.test(c.req.path))) return store.run({ id: null }, next);
    const token = /^Bearer (.+)$/.exec(c.req.header('authorization') ?? '')?.[1];
    if (!token) return c.json({ error: 'sign in required' }, 401);
    let id: Identity; try { id = await verify(token); } catch { return c.json({ error: 'your session has expired — sign in again' }, 401); }
    if (allow.length && !(id.email && allow.includes(id.email))) return c.json({ error: 'this account is not on the invite list yet' }, 403);
    return store.run({ id }, next);
  };
}

/** Profile id of the current rider (null until they have one). Local mode: the single local profile. */
export function profileResolver(pool: pg.Pool, cfg: AuthConfig) {
  return async (): Promise<number | null> => {
    const ctx = store.getStore(); if (ctx && ctx.profileId !== undefined) return ctx.profileId;
    let pid: number | null;
    if (cfg.mode === 'none' || !ctx?.id) pid = cfg.mode === 'none' ? ((await pool.query<{ id: number }>('select id from profile order by id limit 1')).rows[0]?.id ?? null) : null;
    else {
      pid = (await pool.query<{ id: number }>('select id from profile where auth_user_id=$1', [ctx.id.userId])).rows[0]?.id ?? null;
      if (pid === null && cfg.claimUnowned) /* local install: the first account to sign in takes over the existing profile (owner decision 17.2) */
        pid = (await pool.query<{ id: number }>('update profile set auth_user_id=$1, email=$2 where id=(select id from profile where auth_user_id is null order by id limit 1) returning id', [ctx.id.userId, ctx.id.email])).rows[0]?.id
          ?? (await pool.query<{ id: number }>('select id from profile where auth_user_id=$1', [ctx.id.userId])).rows[0]?.id ?? null; /* a parallel request may have just claimed it */
    }
    if (ctx) ctx.profileId = pid; return pid;
  };
}
