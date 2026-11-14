import { describe, expect, it } from 'vitest';
import type { RadioStation } from '@myfitbike/shared';
import { addFavourite, removeFavourite } from './player';

const st = (uuid: string, name = uuid): RadioStation => ({ uuid, name, url: `https://s.test/${uuid}`, codec: 'MP3', bitrate: 128, hls: false, favicon: null, country: '', countryCode: '', tags: [], homepage: null });
describe('radio favourites — the ride menu lists them, so no duplicates and the latest choice comes first', () => {
  it('adds to the front without duplicating, caps the list, removes by id', () => {
    let l = addFavourite([], st('a')); l = addFavourite(l, st('b')); l = addFavourite(l, st('a', 'A again'));
    expect(l.map((x) => x.name)).toEqual(['A again', 'b']); expect(removeFavourite(l, 'a').map((x) => x.uuid)).toEqual(['b']);
    let big: RadioStation[] = []; for (let i = 0; i < 40; i++) big = addFavourite(big, st(`s${i}`)); expect(big).toHaveLength(30);
  });
});
