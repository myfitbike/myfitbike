// Bluetooth support (plan D1, relaxed by PLAN 16.23): the app opens in any modern browser so riders can explore on a
// phone or tablet and ride the demo trainer; only pairing a real trainer needs Web Bluetooth (Chrome/Edge on macOS,
// Windows, Linux, ChromeOS and Android, from https or localhost). We feature-detect rather than sniff the platform.
export type Support = { bluetooth: true } | { bluetooth: false; reason: string };
export function checkBrowser(nav: Pick<Navigator, 'userAgent'> & { bluetooth?: unknown; maxTouchPoints?: number }, secure: boolean): Support {
  const ua = nav.userAgent;
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && (nav.maxTouchPoints ?? 0) > 1); // iPadOS reports a Mac
  if (ios) return { bluetooth: false, reason: 'iPhone and iPad browsers have no Web Bluetooth, so a trainer can’t be paired here. You can browse and ride the demo trainer.' };
  if (!secure) return { bluetooth: false, reason: 'Bluetooth only works from a secure address (https or localhost). You can browse and ride the demo trainer.' };
  if (!nav.bluetooth) return { bluetooth: false, reason: 'This browser has no Web Bluetooth — use Chrome or Edge to pair a trainer. You can browse and ride the demo trainer.' };
  return { bluetooth: true };
}
