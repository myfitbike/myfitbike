// The TV list is a promise to riders (owner decision): only official broadcaster streams, only https. These tests
// fail the build if someone adds a channel that breaks it — an http stream would be blocked on myfitbike.com anyway,
// and a stream on an unknown host may be an unauthorised rebroadcast.
import { describe, expect, it } from 'vitest';
import { CATEGORIES, CHANNELS, OFFICIAL_HOSTS } from './channels';

describe('curated TV channels', () => {
  it('uses https for every stream', () => {
    for (const c of CHANNELS) expect(c.url, c.id).toMatch(/^https:\/\//);
  });
  it('only uses hosts on the official allow-list, owned by the broadcaster named on the channel', () => {
    for (const c of CHANNELS) {
      const host = new URL(c.url).hostname;
      expect(OFFICIAL_HOSTS[host], `${c.id}: ${host} is not an approved official host`).toBeDefined();
      expect(OFFICIAL_HOSTS[host], `${c.id}: host belongs to ${OFFICIAL_HOSTS[host]}, not ${c.owner}`).toBe(c.owner);
    }
  });
  it('gives every channel a unique id, a name, a known category and a verification date', () => {
    expect(new Set(CHANNELS.map((c) => c.id)).size).toBe(CHANNELS.length);
    for (const c of CHANNELS) {
      expect(c.name.trim(), c.id).not.toBe('');
      expect(CATEGORIES, c.id).toContain(c.category);
      expect(c.verifiedAt, c.id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});
