import { describe, expect, it } from 'vitest';
import { bakeWorld, buildRealWorld, buildRoute, checkTrack, geoOrigin, parseTrack, project, resample, sampleWorld, smoothElevation, unproject, type TrackPoint } from './index';

// A straight 3 km track heading north from the equator-ish, climbing 150 m in its middle kilometre.
const track = (n = 301): TrackPoint[] => Array.from({ length: n }, (_, i) => { const d = i * 10; return { lat: 45 + d / 111195, lon: 6, ele: d < 1000 ? 500 : d < 2000 ? 500 + (d - 1000) * 0.15 : 650 }; });
const gpx = (pts: TrackPoint[]) => `<?xml version="1.0"?><gpx version="1.1"><metadata><name>meta</name></metadata><trk><name>Col Test</name><trkseg>${pts.map((p) => `<trkpt lat="${p.lat}" lon="${p.lon}"><ele>${p.ele}</ele></trkpt>`).join('')}</trkseg></trk></gpx>`;

describe('real-road import — what the rider loads must become a rideable, honest profile', () => {
  it('reads GPX tracks (name from the track, not the metadata) and TCX trackpoints', () => {
    const g = parseTrack(gpx(track()), 'my_ride.gpx'); expect(g.name).toBe('Col Test'); expect(g.points).toHaveLength(301); expect(g.points[0]).toMatchObject({ lat: 45, lon: 6, ele: 500 });
    const tcx = `<TrainingCenterDatabase><Courses><Course><Name>Loop</Name><Track>${track(30).map((p) => `<Trackpoint><Position><LatitudeDegrees>${p.lat}</LatitudeDegrees><LongitudeDegrees>${p.lon}</LongitudeDegrees></Position><AltitudeMeters>${p.ele}</AltitudeMeters></Trackpoint>`).join('')}</Track></Course></Courses></TrainingCenterDatabase>`;
    const t = parseTrack(tcx, 'x.tcx'); expect(t.name).toBe('Loop'); expect(t.points).toHaveLength(30);
    /* the World Tour GPX files escape apostrophes; the ride screen showed "Alpe d&apos;Huez" before names were decoded */
    expect(parseTrack(gpx(track()).replace('Col Test', 'Alpe d&apos;Huez &amp; Co &#233;'), 'a.gpx').name).toBe("Alpe d'Huez & Co é");
    expect(() => parseTrack('hello', 'notes.txt')).toThrow(/gpx/);
  });

  it('rejects files that cannot make a real ride (plan 7.2 rules) and warns about gaps', () => {
    expect(checkTrack({ name: '', points: track(10) }).errors[0]).toMatch(/20/);
    expect(checkTrack({ name: '', points: track(30).map((p, i) => ({ ...p, lat: 45 + i * 1e-6 })) }).errors[0]).toMatch(/500 m/);
    const gappy = track(); gappy.splice(100, 60); expect(checkTrack({ name: '', points: gappy }).warnings[0]).toMatch(/gap/);
    expect(checkTrack({ name: '', points: track() }).errors).toEqual([]);
  });

  it('projects to metres and back without drifting (the map and the ride must agree)', () => {
    const g = geoOrigin(track()); const [x, z] = project(g, 45.01, 6.01); const [lat, lon] = unproject(g, x, z);
    expect(lat).toBeCloseTo(45.01, 9); expect(lon).toBeCloseTo(6.01, 9); expect(Math.abs(z)).toBeGreaterThan(0);
  });

  it('resamples every 5 m so gradient control has an even grid', () => {
    const r = resample([[0, 0], [0, 0], [100, 0], [100, 50]]); expect(r.x).toHaveLength(31); expect(Math.hypot(r.x[1]! - r.x[0]!, r.z[1]! - r.z[0]!)).toBeCloseTo(5, 6);
  });

  it('a GPS/elevation spike never reaches the trainer: smoothing plus a ±25 % clamp', () => {
    const y = Array.from({ length: 200 }, () => 100); y[100] = 160; // a 60 m spike in one sample
    const s = smoothElevation(y); let maxG = 0; for (let i = 1; i < s.length; i++) maxG = Math.max(maxG, Math.abs((s[i]! - s[i - 1]!) / 5) * 100);
    expect(maxG).toBeLessThanOrEqual(25.0001); expect(Math.max(...s)).toBeLessThan(110);
  });

  it('a hairpin does not become a wall: smoothing widens through tight turns but keeps the total climb', () => {
    // two 300 m legs joined by a 180° turn; the track gains 20 m right at the apex (as GPS tracks of switchbacks do)
    const x: number[] = [], z: number[] = [], y: number[] = []; for (let i = 0; i <= 60; i++) { x.push(i * 5); z.push(0); y.push(100); }
    for (let k = 1; k <= 6; k++) { const a = (Math.PI * k) / 6; x.push(300 + 10 * Math.sin(a)); z.push(10 - 10 * Math.cos(a)); y.push(100 + (20 * k) / 6); }
    for (let i = 1; i <= 60; i++) { x.push(300 - i * 5); z.push(20); y.push(120); }
    const max100 = (s: number[]) => { let m = 0; for (let i = 0; i + 20 < s.length; i++) m = Math.max(m, s[i + 20]! - s[i]!); return m; };
    const plain = smoothElevation(y), aware = smoothElevation(y, 5, 50, 25, { x, z });
    expect(max100(aware)).toBeLessThan(max100(plain) * 0.75); expect(aware.at(-1)! - aware[0]!).toBeCloseTo(20, 0);
  });

  it('becomes a one-road world whose profile finds the climb, its arches, and bakes with real terrain heights', () => {
    const pts = track(); const g = geoOrigin(pts); const xz = pts.map((p) => project(g, p.lat, p.lon)); const r = resample(xz);
    const y = smoothElevation(r.x.map((_, i) => { const d = i * 5; return d < 1000 ? 500 : d < 2000 ? 500 + (d - 1000) * 0.15 : 650; }));
    const w = buildRealWorld({ id: 'real-1', name: 'Col Test', geo: g, ...r, y, step: 5, fileName: 'col.gpx', elevation: 'dem' });
    const p = buildRoute(w, 'real-1', sampleWorld(w));
    expect(p.lengthM).toBeGreaterThan(2950); expect(p.lengthM).toBeLessThan(3050); expect(p.loop).toBe(false);
    expect(p.climbs).toHaveLength(1); expect(p.climbs[0]!.avgGradePct).toBeGreaterThan(13); expect(p.climbs[0]!.avgGradePct).toBeLessThan(16);
    expect(w.segments).toHaveLength(1); expect(w.segments[0]!.to).toBeLessThanOrEqual(p.lengthM); // arches and segment timing need the summit on the route
    const bake = bakeWorld(w, { height: () => 480, farStep: 200, treeLine: 2000 });
    expect(bake.manifest.far.step).toBe(200); expect(bake.chunks.size).toBeGreaterThan(4);
    const anyChunk = bake.chunks.values().next().value!; expect(Math.min(...anyChunk)).toBeGreaterThan(470); // terrain comes from the supplied heights, not the island
    expect(bake.scenery.checkpoints.map((c) => c.kind)).toEqual(['start', 'climb', 'summit']);
  });
});
