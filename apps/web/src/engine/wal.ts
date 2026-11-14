// Write-ahead log (plan D8 conflict resolution): an append-only OPFS file per ride, one line per second.
// It is a crash buffer only — deleted once the server acknowledges the finished ride. Postgres stays the system of record.
import type { Sample } from '@myfitbike/shared';
import type { RideConfig } from './core';

export type WalHeader = { rideId: number; startedAt: string; name: string; workoutId?: string; routeId?: string; cfg: RideConfig };
const dir = () => navigator.storage.getDirectory();
const fileName = (id: number) => `ride-${id}.ndjson`;

export class Wal {
  private pending: string[] = []; private writing = false;
  private constructor(private readonly handle: FileSystemFileHandle) {}
  static async create(h: WalHeader): Promise<Wal> {
    const fh = await (await dir()).getFileHandle(fileName(h.rideId), { create: true }); const w = new Wal(fh);
    await w.write([JSON.stringify({ header: h })]); return w;
  }
  append(r: Sample) { this.pending.push(JSON.stringify(r)); void this.flush(); }
  private async flush() {
    if (this.writing || !this.pending.length) return; this.writing = true;
    const lines = this.pending.splice(0); try { await this.write(lines); } catch { this.pending.unshift(...lines); } finally { this.writing = false; if (this.pending.length) void this.flush(); }
  }
  private async write(lines: string[]) {
    const ws = await this.handle.createWritable({ keepExistingData: true }); const size = (await this.handle.getFile()).size;
    await ws.seek(size); await ws.write(lines.join('\n') + '\n'); await ws.close();
  }
  static async remove(id: number) { try { await (await dir()).removeEntry(fileName(id)); } catch { /* already gone */ } }
  static async list(): Promise<{ header: WalHeader; samples: Sample[] }[]> {
    const out: { header: WalHeader; samples: Sample[] }[] = [];
    try {
      for await (const [name, h] of (await dir()) as unknown as AsyncIterable<[string, FileSystemHandle]>) {
        if (!name.startsWith('ride-') || h.kind !== 'file') continue;
        const text = await (await (h as FileSystemFileHandle).getFile()).text(); const lines = text.split('\n').filter(Boolean);
        const first = lines.shift(); if (!first) continue; const header = (JSON.parse(first) as { header: WalHeader }).header;
        const samples: Sample[] = []; for (const l of lines) { try { samples.push(JSON.parse(l)); } catch { /* torn last line after a crash */ } }
        out.push({ header, samples });
      }
    } catch { /* OPFS unavailable */ }
    return out;
  }
}
