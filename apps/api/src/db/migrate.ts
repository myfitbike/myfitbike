// Minimal forward-only SQL migrations: files in ./migrations run once, in name order, each in a transaction.
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { env } from '../env.js';

const DIR = fileURLToPath(new URL('./migrations/', import.meta.url));

export async function migrate(pool: pg.Pool): Promise<string[]> {
  await pool.query('create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())');
  const done = new Set((await pool.query<{ name: string }>('select name from schema_migrations')).rows.map((r) => r.name));
  const applied: string[] = [];
  for (const file of readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort()) {
    if (done.has(file)) continue;
    const client = await pool.connect();
    try {
      await client.query('begin'); await client.query(readFileSync(DIR + file, 'utf8'));
      await client.query('insert into schema_migrations(name) values ($1)', [file]); await client.query('commit'); applied.push(file);
    } catch (e) { await client.query('rollback'); throw new Error(`migration ${file} failed: ${(e as Error).message}`); }
    finally { client.release(); }
  }
  return applied;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const pool = new pg.Pool({ connectionString: env.databaseUrl });
  migrate(pool).then((a) => { console.log(a.length ? `applied: ${a.join(', ')}` : 'up to date'); return pool.end(); }).catch((e) => { console.error(e.message); process.exit(1); });
}
