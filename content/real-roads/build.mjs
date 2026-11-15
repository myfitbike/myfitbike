// Built-in real roads (PLAN 7.6 World Tour, first set). Each track is routed once with the public OSRM demo server on
// OpenStreetMap data (© OpenStreetMap contributors, ODbL) between the climb's start, optional via points and its top,
// then written as GPX. Elevation is NOT taken from here: the app looks it up from open terrain tiles when the rider
// prepares a route, exactly as for an imported file. Re-run: node content/real-roads/build.mjs
import { writeFileSync } from 'node:fs';
const ROUTES = [
  { key: 'alpe-dhuez', name: "Alpe d'Huez", region: 'Isère, France', blurb: 'Twenty-one numbered hairpins from Le Bourg-d’Oisans to the ski station.', pts: [[45.0556, 6.0306], [45.0905, 6.0640]] },
  { key: 'mont-ventoux', name: 'Mont Ventoux from Bédoin', region: 'Provence, France', blurb: 'Forest switchbacks, then the bare white moonscape to the summit tower.', pts: [[44.1245, 5.1795], [44.1740, 5.2786]] },
  { key: 'tourmalet', name: 'Col du Tourmalet from Luz', region: 'Pyrenees, France', blurb: 'The west side through Barèges to the highest paved pass of the central Pyrenees.', pts: [[42.8723, -0.0036], [42.9086, 0.1453]] },
  { key: 'galibier', name: 'Col du Galibier from Valloire', region: 'Savoie, France', blurb: 'Open high valley, then steep ramps above Plan Lachat to 2,642 m.', pts: [[45.1650, 6.4290], [45.0640, 6.4078]] },
  { key: 'stelvio', name: 'Passo dello Stelvio from Prato', region: 'South Tyrol, Italy', blurb: 'Forty-eight hairpins up the north ramp to 2,757 m.', pts: [[46.6190, 10.5920], [46.5525, 10.5110], [46.5286, 10.4533]] },
  { key: 'pordoi', name: 'Passo Pordoi from Arabba', region: 'Dolomites, Italy', blurb: 'Steady switchbacks beneath the Sella towers.', pts: [[46.4970, 11.8740], [46.4877, 11.8126]] },
  { key: 'grossglockner', name: 'Grossglockner from Heiligenblut', region: 'Carinthia, Austria', blurb: 'The alpine road from the village church to the Hochtor tunnel.', pts: [[47.0395, 12.8430], [47.0830, 12.8420]] },
  { key: 'sa-calobra', name: 'Sa Calobra', region: 'Mallorca, Spain', blurb: 'The famous snake of a road from the cove up to Coll dels Reis.', pts: [[39.8497, 2.8040], [39.8296, 2.8223]] },
];
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/'/g, '&apos;');
const catalog = [];
for (const r of ROUTES) {
  const coords = r.pts.map(([la, lo]) => `${lo},${la}`).join(';');
  const res = await fetch(`https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`, { headers: { 'user-agent': 'MyFitBike-content-build' } });
  const j = await res.json(); const route = j.routes?.[0]; if (!route) throw new Error(`${r.key}: ${j.code}`);
  const c = route.geometry.coordinates;
  writeFileSync(new URL(`${r.key}.gpx`, import.meta.url), `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="MyFitBike (OSRM, © OpenStreetMap contributors, ODbL)"><trk><name>${esc(r.name)}</name><trkseg>\n${c.map(([lo, la]) => `<trkpt lat="${la.toFixed(6)}" lon="${lo.toFixed(6)}"/>`).join('\n')}\n</trkseg></trk></gpx>\n`);
  catalog.push({ key: r.key, name: r.name, region: r.region, blurb: r.blurb, file: `${r.key}.gpx`, approxKm: +(route.distance / 1000).toFixed(1) });
  console.log(r.key, c.length, 'pts', (route.distance / 1000).toFixed(1), 'km'); await new Promise((ok) => setTimeout(ok, 1100)); // demo server: ≤ 1 request / s
}
writeFileSync(new URL('catalog.json', import.meta.url), JSON.stringify(catalog, null, 2) + '\n');
