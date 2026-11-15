import { serve } from '@hono/node-server';
import pg from 'pg';
import { env } from './env.js';
import { migrate } from './db/migrate.js';
import { createApp } from './app.js';
import { nodeWorldSource } from './worldFile.js';
import { useWorldSource } from './routes.js';
import { processUploads, stravaConfigured, type StravaConfig } from './strava.js';

const pool = new pg.Pool({ connectionString: env.databaseUrl });
const applied = await migrate(pool);
if (applied.length) console.log(`migrations applied: ${applied.join(', ')}`);
const strava: StravaConfig = { clientId: env.stravaClientId, clientSecret: env.stravaClientSecret, encKeyHex: env.tokenKey, apiBase: 'https://www.strava.com/api/v3', webBase: env.webBase, publicApiBase: `http://localhost:${env.port}`, fetch, now: Date.now };
if (stravaConfigured(strava)) setInterval(() => void processUploads(pool, strava).catch((e) => console.error('strava queue', e.message)), 5000);
else console.log('Strava not configured (optional): set STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET, TOKEN_ENCRYPTION_KEY in apps/api/.env');
useWorldSource(nodeWorldSource());
const auth = env.supabaseUrl ? { mode: 'supabase' as const, supabaseUrl: env.supabaseUrl, allowedEmails: env.allowedEmails, claimUnowned: env.claimLocalProfile } : { mode: 'none' as const };
console.log(auth.mode === 'supabase' ? `Sign-in required (Supabase ${env.supabaseUrl})` : 'Local mode: no sign-in (set SUPABASE_URL in apps/api/.env to require accounts)');
serve({ fetch: createApp(pool, { strava, auth }).fetch, port: env.port, hostname: '127.0.0.1' }, (i) => console.log(`MyFitBike API on http://127.0.0.1:${i.port}`));
