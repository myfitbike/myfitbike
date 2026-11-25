// Cloudflare Workers entry (PLAN 17.3): the same Hono app as the Node server. Differences: Postgres via Hyperdrive (or a
// pooled DATABASE_URL), opened per request because Workers can't share sockets between requests; finished rides' samples
// in R2; the Strava upload queue runs from a cron trigger; the Velora world is bundled and built at start-up (~31 ms,
// outside the per-request CPU budget). Migrations are not run here: `pnpm --filter @myfitbike/api migrate` with
// DATABASE_URL pointing at the production database.
import pg from 'pg';
import type { World } from '@myfitbike/world';
import worldJson from '../../../content/world/velora/world.json';
import { createApp } from './app.js';
import { useWorldSource, world } from './routes.js';
import { useArchive } from './rides.js';
import { r2Archive, type R2Like } from './archive.js';
import { processUploads, stravaConfigured, type StravaConfig } from './strava.js';

export type Env = {
  HYPERDRIVE?: { connectionString: string }; DATABASE_URL?: string; RIDES?: R2Like;
  FIREBASE_PROJECT_ID?: string; ALLOWED_EMAILS?: string; WEB_BASE: string; PUBLIC_API_BASE: string;
  STRAVA_CLIENT_ID?: string; STRAVA_CLIENT_SECRET?: string; TOKEN_ENCRYPTION_KEY?: string;
  RL_API?: RateLimiter; RL_COSTLY?: RateLimiter; RL_PUBLIC?: RateLimiter; RL_IP?: RateLimiter; /* wrangler.toml [[ratelimits]] */
};
type RateLimiter = { limit(o: { key: string }): Promise<{ success: boolean }> };
type Ctx = { waitUntil(p: Promise<unknown>): void };

useWorldSource({ load: () => worldJson as unknown as World }); world(); /* build once per isolate, at start-up */

const pool = (env: Env) => {
  const connectionString = env.HYPERDRIVE?.connectionString ?? env.DATABASE_URL; if (!connectionString) throw new Error('No database: bind HYPERDRIVE or set DATABASE_URL');
  return new pg.Pool({ connectionString, max: 1 });
};
const strava = (env: Env): StravaConfig => ({ clientId: env.STRAVA_CLIENT_ID ?? '', clientSecret: env.STRAVA_CLIENT_SECRET ?? '', encKeyHex: env.TOKEN_ENCRYPTION_KEY ?? '', apiBase: 'https://www.strava.com/api/v3', webBase: env.WEB_BASE, publicApiBase: env.PUBLIC_API_BASE, fetch: (i, o) => fetch(i, o), now: Date.now });

export default {
  async fetch(req: Request, env: Env, ctx: Ctx): Promise<Response> {
    if (!env.FIREBASE_PROJECT_ID) return new Response('FIREBASE_PROJECT_ID is not set — refusing to serve without sign-in', { status: 500 }); /* never publish an open API */
    const db = pool(env);
    try {
      const app = createApp(db, { strava: strava(env), auth: { mode: 'firebase', projectId: env.FIREBASE_PROJECT_ID, allowedEmails: (env.ALLOWED_EMAILS ?? '').split(',').filter(Boolean) }, corsOrigins: [env.WEB_BASE], compress: false,
        rateLimit: async (bucket, key) => { const b = bucket === 'ip' ? env.RL_IP : bucket === 'api' ? env.RL_API : bucket === 'costly' ? env.RL_COSTLY : env.RL_PUBLIC; return b ? (await b.limit({ key })).success : true; },
        ...(env.RIDES ? { archive: r2Archive(env.RIDES) } : {}) });
      return await app.fetch(req.url.includes('/api/') ? new Request(req.url.replace('/api/', '/'), req) : req); /* served under /api on the site's domain, or bare on workers.dev */
    } finally { ctx.waitUntil(db.end()); }
  },
  async scheduled(_e: unknown, env: Env, ctx: Ctx) { /* Strava upload queue (Node: a 5 s timer) */
    const s = strava(env); if (!stravaConfigured(s)) return; if (env.RIDES) useArchive(r2Archive(env.RIDES));
    const db = pool(env); ctx.waitUntil(processUploads(db, s).finally(() => db.end()));
  },
};
