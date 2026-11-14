// Plan D1: Chrome or Edge on macOS only (Web Bluetooth). Everything else gets a blocking notice.
export type Support = { ok: true } | { ok: false; reason: string };
export function checkBrowser(nav: Pick<Navigator, 'userAgent'> & { bluetooth?: unknown }, secure: boolean): Support {
  const ua = nav.userAgent;
  const mac = /Macintosh|Mac OS X/.test(ua);
  const chromium = /Chrome\/\d+/.test(ua) && !/OPR\/|Firefox\//.test(ua);
  if (!mac) return { ok: false, reason: 'VeloWorld runs on macOS.' };
  if (!chromium) return { ok: false, reason: 'VeloWorld needs Google Chrome or Microsoft Edge, which support Web Bluetooth.' };
  if (!nav.bluetooth) return { ok: false, reason: 'Web Bluetooth is turned off in this browser.' };
  if (!secure) return { ok: false, reason: 'Open VeloWorld from http://localhost so Bluetooth is allowed.' };
  return { ok: true };
}
