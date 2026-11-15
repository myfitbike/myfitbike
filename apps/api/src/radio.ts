// Online radio (PLAN 16.24): station search through radio-browser.info, the open community directory (TuneIn and
// Shoutcast need partner keys; Radio Garden has no public API). Requests go through this API so they carry a
// descriptive User-Agent (the directory asks for one; browsers can't set it) and are cached briefly. Audio streams are
// played by the browser straight from each station.
import { Hono } from 'hono';
import type { RadioStation } from '@myfitbike/shared';

export type RadioConfig = { fetch: typeof fetch; servers?: () => Promise<string[]> };
const UA = 'MyFitBike/0.1 (open-source indoor cycling app)';

/** Servers from the directory's DNS SRV record, shuffled (its docs: don't hard-code one; fail over on error). Node's DNS
 *  where available; DNS-over-HTTPS on Cloudflare Workers (no node:dns there). */
async function srvNames(): Promise<string[]> {
  try { const { resolveSrv } = await import('node:dns/promises'); return (await resolveSrv('_api._tcp.radio-browser.info')).map((r) => r.name); } catch { /* not Node, or DNS failed */ }
  const r = await fetch('https://cloudflare-dns.com/dns-query?name=_api._tcp.radio-browser.info&type=SRV', { headers: { accept: 'application/dns-json' } });
  const j = (await r.json()) as { Answer?: { data: string }[] }; return (j.Answer ?? []).map((a) => a.data.trim().split(/\s+/)[3]?.replace(/\.$/, '') ?? '').filter(Boolean);
}
async function discover(): Promise<string[]> {
  try { const names = await srvNames(); for (let i = names.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [names[i], names[j]] = [names[j]!, names[i]!]; } if (names.length) return names; } catch { /* fall through */ }
  return ['all.api.radio-browser.info'];
}

type Raw = { stationuuid: string; name: string; url: string; url_resolved: string; codec: string; bitrate: number; hls: number; favicon: string; country: string; countrycode: string; tags: string; homepage: string; lastcheckok: number };
export const toStation = (r: Raw): RadioStation => ({
  uuid: r.stationuuid, name: r.name.trim(), url: r.url_resolved || r.url, codec: r.codec || '', bitrate: r.bitrate || 0, hls: r.hls === 1,
  favicon: /^https?:\/\//.test(r.favicon) ? r.favicon : null, country: r.country || '', countryCode: (r.countrycode || '').toUpperCase(),
  tags: r.tags ? r.tags.split(',').map((t) => t.trim()).filter(Boolean).slice(0, 6) : [], homepage: /^https?:\/\//.test(r.homepage) ? r.homepage : null,
});

export function radioRoutes(cfg: RadioConfig) {
  const r = new Hono(); const cache = new Map<string, { at: number; data: unknown }>(); let servers: string[] | null = null;
  async function get(path: string, ttlMs = 10 * 60_000): Promise<unknown> {
    const hit = cache.get(path); if (hit && Date.now() - hit.at < ttlMs) return hit.data;
    servers ??= await (cfg.servers ?? discover)(); let lastErr: unknown = null;
    for (const host of servers) {
      try { const res = await cfg.fetch(`https://${host}${path}`, { headers: { 'user-agent': UA, accept: 'application/json' } }); if (!res.ok) throw new Error(`${host} ${res.status}`);
        const data = await res.json(); cache.set(path, { at: Date.now(), data }); return data; }
      catch (e) { lastErr = e; servers = [...servers.filter((s) => s !== host), host]; } // try the next server; move the failing one to the back
    }
    throw lastErr ?? new Error('no radio-browser server reachable');
  }
  const fail = (e: unknown) => ({ error: `Radio directory unreachable (${(e as Error).message})` });

  r.get('/search', async (c) => {
    const name = c.req.query('name')?.trim(), tag = c.req.query('tag')?.trim(), cc = c.req.query('countrycode')?.trim().toUpperCase();
    const cap = cc && !name && !tag ? 10000 : 300; /* a whole country's list (the largest has ~6,000) is browsed and filtered in the browser */
    const q = new URLSearchParams({ hidebroken: 'true', order: 'votes', reverse: 'true', limit: String(Math.min(cap, Number(c.req.query('limit') ?? 40) || 40)) });
    if (name) q.set('name', name.slice(0, 80)); if (tag) q.set('tag', tag.slice(0, 40)); if (cc && /^[A-Z]{2}$/.test(cc)) q.set('countrycode', cc);
    try { const raw = (await get(`/json/stations/search?${q}`)) as Raw[]; return c.json(raw.filter((s) => s.lastcheckok === 1 && /^https?:\/\//.test(s.url_resolved || s.url)).map(toStation)); }
    catch (e) { return c.json(fail(e), 502); }
  });
  r.get('/tags', async (c) => {
    try { const raw = (await get('/json/tags?order=stationcount&reverse=true&hidebroken=true&limit=80', 24 * 3600_000)) as { name: string; stationcount: number }[]; return c.json(raw.filter((t) => t.name && t.stationcount >= 20).map((t) => ({ name: t.name, count: t.stationcount }))); }
    catch (e) { return c.json(fail(e), 502); }
  });
  r.get('/countries', async (c) => {
    try { const raw = (await get('/json/countries?order=name&hidebroken=true', 24 * 3600_000)) as { name: string; iso_3166_1: string; stationcount: number }[]; return c.json(raw.filter((x) => /^[A-Z]{2}$/.test(x.iso_3166_1) && x.stationcount >= 5).map((x) => ({ code: x.iso_3166_1, name: x.name, count: x.stationcount }))); }
    catch (e) { return c.json(fail(e), 502); }
  });
  // The directory asks apps to report each play (it ranks stations by it); also returns the freshest stream URL.
  r.post('/click/:uuid', async (c) => {
    const uuid = c.req.param('uuid'); if (!/^[0-9a-f-]{36}$/i.test(uuid)) return c.json({ error: 'bad station id' }, 400);
    try { const d = (await get(`/json/url/${uuid}`, 0)) as { url?: string }; return c.json({ url: typeof d.url === 'string' && /^https?:\/\//.test(d.url) ? d.url : null }); }
    catch (e) { return c.json(fail(e), 502); }
  });
  return r;
}
