import { describe, it, expect } from 'vitest';
import { checkBrowser } from './browserSupport';

const mac = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko)';
describe('Bluetooth support — the app opens everywhere; only pairing needs Web Bluetooth, and the rider is told why when it is missing', () => {
  it('Chrome on macOS can pair', () => expect(checkBrowser({ userAgent: `${mac} Chrome/156.0 Safari/537.36`, bluetooth: {} }, true)).toEqual({ bluetooth: true }));
  it('Chrome on Android tablets and phones can pair (Web Bluetooth is supported there)', () => expect(checkBrowser({ userAgent: 'Mozilla/5.0 (Linux; Android 15; Pixel Tablet) Chrome/156.0 Safari/537.36', bluetooth: {}, maxTouchPoints: 5 }, true)).toEqual({ bluetooth: true }));
  it('iPad is told it cannot pair, even though it reports itself as a Mac', () => { const r = checkBrowser({ userAgent: `${mac} Version/19.0 Safari/605.1.15`, maxTouchPoints: 5 }, true); expect(r.bluetooth).toBe(false); expect(!r.bluetooth && r.reason).toMatch(/iPad/); });
  it('iPhone Chrome is still WebKit with no Bluetooth', () => expect(checkBrowser({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X) CriOS/156.0 Mobile/15E148 Safari/604.1' }, true).bluetooth).toBe(false));
  it('Safari and Firefox on a desktop cannot pair', () => { expect(checkBrowser({ userAgent: `${mac} Version/19.0 Safari/605.1.15` }, true).bluetooth).toBe(false); expect(checkBrowser({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 15.0; rv:140.0) Gecko/20100101 Firefox/140.0' }, true).bluetooth).toBe(false); });
  it('an insecure address explains why Bluetooth is refused', () => { const r = checkBrowser({ userAgent: `${mac} Chrome/156.0`, bluetooth: {} }, false); expect(!r.bluetooth && r.reason).toMatch(/secure address/); });
});
