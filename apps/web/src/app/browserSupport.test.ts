import { describe, it, expect } from 'vitest';
import { checkBrowser } from './browserSupport';

const mac = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko)';
describe('browser gate — Web Bluetooth exists only in Chromium, so other browsers must be stopped before pairing fails confusingly', () => {
  it('lets Chrome on macOS through', () => expect(checkBrowser({ userAgent: `${mac} Chrome/156.0 Safari/537.36`, bluetooth: {} }, true)).toEqual({ ok: true }));
  it('blocks Safari, which has no Web Bluetooth', () => expect(checkBrowser({ userAgent: `${mac} Version/19.0 Safari/605.1.15` }, true).ok).toBe(false));
  it('blocks Firefox', () => expect(checkBrowser({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 15.0; rv:140.0) Gecko/20100101 Firefox/140.0' }, true).ok).toBe(false));
  it('blocks Chrome on Windows (out of scope)', () => expect(checkBrowser({ userAgent: 'Mozilla/5.0 (Windows NT 10.0) Chrome/156.0', bluetooth: {} }, true).ok).toBe(false));
  it('blocks an insecure origin, where Chrome refuses Bluetooth', () => expect(checkBrowser({ userAgent: `${mac} Chrome/156.0`, bluetooth: {} }, false).ok).toBe(false));
});
