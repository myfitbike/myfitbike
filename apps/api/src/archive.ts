// Finished rides' one-second samples, stored as one gzipped JSON document per ride (PLAN 17.1/17.3): ~107 bytes per
// sample as Postgres rows would fill a free 500 MB database in about a month at 100 riders. Column-oriented arrays
// compress well. Production: an R2 bucket; local / tests: the ride_archive table. Uses CompressionStream so the same
// code runs on Node and Cloudflare Workers.
import type pg from 'pg';
import type { Sample } from '@myfitbike/shared';

export interface SampleArchive { put(rideId: number, samples: Sample[]): Promise<void>; get(rideId: number): Promise<Sample[] | null>; remove(rideId: number): Promise<void> }
const KEYS = ['t', 'power', 'cadence', 'hr', 'speed', 'distance', 'alt', 'grade', 'target', 'step'] as const;

async function pipe(data: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  return new Uint8Array(await new Response(new Blob([data as Uint8Array<ArrayBuffer>]).stream().pipeThrough(stream)).arrayBuffer());
}
export async function encodeSamples(samples: Sample[]): Promise<Uint8Array> {
  const cols = Object.fromEntries(KEYS.map((k) => [k, samples.map((s) => s[k] ?? null)]));
  return pipe(new TextEncoder().encode(JSON.stringify({ v: 1, n: samples.length, cols })), new CompressionStream('gzip'));
}
export async function decodeSamples(gz: Uint8Array): Promise<Sample[]> {
  const { n, cols } = JSON.parse(new TextDecoder().decode(await pipe(gz, new DecompressionStream('gzip')))) as { n: number; cols: Record<string, unknown[]> };
  return Array.from({ length: n }, (_, i) => Object.fromEntries(KEYS.map((k) => [k, k === 'distance' ? (cols[k]![i] ?? 0) : cols[k]![i]])) as unknown as Sample);
}

export function dbArchive(pool: pg.Pool): SampleArchive {
  return {
    put: async (id, s) => { await pool.query('insert into ride_archive(ride_id, n, samples_gz) values ($1,$2,$3) on conflict (ride_id) do update set n=excluded.n, samples_gz=excluded.samples_gz', [id, s.length, Buffer.from(await encodeSamples(s))]); },
    get: async (id) => { const r = (await pool.query<{ samples_gz: Buffer }>('select samples_gz from ride_archive where ride_id=$1', [id])).rows[0]; return r ? decodeSamples(new Uint8Array(r.samples_gz)) : null; },
    remove: async (id) => { await pool.query('delete from ride_archive where ride_id=$1', [id]); },
  };
}

/** The subset of Cloudflare's R2Bucket binding used here. */
export type R2Like = { put(key: string, value: Uint8Array, opts?: { httpMetadata?: { contentType?: string } }): Promise<unknown>; get(key: string): Promise<{ arrayBuffer(): Promise<ArrayBuffer> } | null>; delete(key: string): Promise<void> };
export function r2Archive(bucket: R2Like): SampleArchive {
  const key = (id: number) => `rides/${id}.json.gz`;
  return {
    put: async (id, s) => { await bucket.put(key(id), await encodeSamples(s), { httpMetadata: { contentType: 'application/gzip' } }); },
    get: async (id) => { const o = await bucket.get(key(id)); return o ? decodeSamples(new Uint8Array(await o.arrayBuffer())) : null; },
    remove: async (id) => { await bucket.delete(key(id)); },
  };
}
