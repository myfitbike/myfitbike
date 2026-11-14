import { describe, expect, it } from 'vitest';
import { decodeFit } from '@myfitbike/shared';
import { checkTrack, parseTrack } from '@myfitbike/world';

// Minimal FIT course: file_id, course (31) name, then record (20) messages with semicircle positions and
// enhanced_altitude (scale 5, offset 500) — the layout Garmin Connect course exports use.
function fitCourse(n: number): Uint8Array {
  const body: number[] = []; const u32 = (v: number) => [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255];
  body.push(0x40, 0, 0, 0, 0, 1, 0, 1, 0x00); body.push(0x00, 6); // def local 0 = file_id {type uint8}; data: type 6 = course
  const name = [...new TextEncoder().encode('Garmin Climb'), 0]; body.push(0x41, 0, 0, 31, 0, 1, 5, name.length, 0x07); body.push(0x01, ...name); // course.name
  body.push(0x42, 0, 0, 20, 0, 3, 0, 4, 0x85, 1, 4, 0x85, 78, 4, 0x86); // record: position_lat, position_long (sint32), enhanced_altitude (uint32)
  for (let i = 0; i < n; i++) { const lat = 45 + i * 1e-4, lon = 6; body.push(0x02, ...u32(Math.round((lat * 2 ** 31) / 180)), ...u32(Math.round((lon * 2 ** 31) / 180)), ...u32((800 + i + 500) * 5)); }
  const hdr = [14, 0x20, 0, 0, ...u32(body.length), ...'.FIT'.split('').map((c) => c.charCodeAt(0)), 0, 0];
  return new Uint8Array([...hdr, ...body, 0, 0]);
}

describe('real roads from FIT course files (Garmin Connect exports)', () => {
  it('reads the course name, positions and altitude so the route matches what the rider planned', () => {
    const t = parseTrack(fitCourse(60), 'course.fit', decodeFit);
    expect(t.name).toBe('Garmin Climb'); expect(t.points).toHaveLength(60);
    expect(t.points[0]!.lat).toBeCloseTo(45, 6); expect(t.points[0]!.lon).toBeCloseTo(6, 6); expect(t.points[10]!.ele).toBeCloseTo(810, 6);
    expect(checkTrack(t).errors).toEqual([]); // 59 × ~11 m ≈ 650 m: long enough to ride
  });
});
