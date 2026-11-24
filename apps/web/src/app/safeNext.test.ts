import { describe, expect, it } from 'vitest';
import { safeNext } from './safeNext';

// A link like /login?next=//evil.example must not send a rider who just signed in to a look-alike site.
describe('after login the app only returns to a page on this site', () => {
  it('keeps a site path with its query', () => expect(safeNext('/rides/12?x=1')).toBe('/rides/12?x=1'));
  it('sends anything that is another site, or nothing, to the home page', () => {
    for (const n of [null, '', 'https://evil.example', '//evil.example', '/\\evil.example', 'javascript:alert(1)']) expect(safeNext(n)).toBe('/');
  });
});
