import { serve } from '@hono/node-server';
import pg from 'pg';
import { env } from './env.js';
import { migrate } from './db/migrate.js';
import { createApp } from './app.js';

const pool = new pg.Pool({ connectionString: env.databaseUrl });
const applied = await migrate(pool);
if (applied.length) console.log(`migrations applied: ${applied.join(', ')}`);
serve({ fetch: createApp(pool).fetch, port: env.port, hostname: '127.0.0.1' }, (i) => console.log(`VeloWorld API on http://127.0.0.1:${i.port}`));
