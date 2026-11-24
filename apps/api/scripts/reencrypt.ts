// Rewrites every stored secret still in the pre-v2 format (raw master key, no owner binding) as v2, so the old decrypt
// path can be removed (security audit 2, V12). Run once per database:
//   DATABASE_URL=… TOKEN_ENCRYPTION_KEY=… pnpm --filter @myfitbike/api reencrypt [--dry-run]
// A value that does not decrypt is counted and left alone, never deleted.
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { env } from '../src/env.js';
import { decrypt, encrypt } from '../src/strava.js';

export type ReencryptResult = { found: number; rewritten: number; failed: number };

export async function reencrypt(pool: pg.Pool, keyHex: string, dryRun = false): Promise<ReencryptResult> {
  if (!/^[0-9a-f]{64}$/i.test(keyHex)) throw new Error('TOKEN_ENCRYPTION_KEY must be 64 hex characters');
  const out: ReencryptResult = { found: 0, rewritten: 0, failed: 0 }; const old = (v: string) => !v.startsWith('v2.');
  const strava = (await pool.query<{ profile_id: number; access_token_enc: string; refresh_token_enc: string }>("select profile_id, access_token_enc, refresh_token_enc from strava_account where access_token_enc not like 'v2.%' or refresh_token_enc not like 'v2.%'")).rows;
  for (const r of strava) {
    out.found++; if (dryRun) continue;
    try {
      const re = (v: string, part: string) => (old(v) ? encrypt(decrypt(v, keyHex, ''), keyHex, `strava:${r.profile_id}:${part}`) : v);
      const q = await pool.query('update strava_account set access_token_enc=$2, refresh_token_enc=$3 where profile_id=$1 and access_token_enc=$4 and refresh_token_enc=$5', /* unchanged since read: a token the upload queue refreshed meanwhile is not overwritten */
        [r.profile_id, re(r.access_token_enc, 'access'), re(r.refresh_token_enc, 'refresh'), r.access_token_enc, r.refresh_token_enc]);
      if (q.rowCount) out.rewritten++;
    } catch { out.failed++; }
  }
  const icu = (await pool.query<{ profile_id: number; v: string }>("select profile_id, value #>> '{}' as v from settings where key='intervals.key' and value #>> '{}' not like 'v2.%'")).rows;
  for (const r of icu) {
    out.found++; if (dryRun) continue;
    try {
      const q = await pool.query("update settings set value=$2 where profile_id=$1 and key='intervals.key' and value #>> '{}' = $3", [r.profile_id, JSON.stringify(encrypt(decrypt(r.v, keyHex, ''), keyHex, `intervals:${r.profile_id}`)), r.v]);
      if (q.rowCount) out.rewritten++;
    } catch { out.failed++; }
  }
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const pool = new pg.Pool({ connectionString: env.databaseUrl }); const dryRun = process.argv.includes('--dry-run');
  reencrypt(pool, env.tokenKey, dryRun).then((r) => { console.log(`${dryRun ? 'dry run — ' : ''}old-format values found: ${r.found}, rewritten: ${r.rewritten}, failed to decrypt: ${r.failed}`); return pool.end(); })
    .catch((e) => { console.error(e.message); process.exit(1); });
}
