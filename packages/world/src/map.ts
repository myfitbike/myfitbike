// Illustrated world map (plan 7.0 "Maps"): flat layered style generated from world.json, so it is always correct.
// Returns SVG markup; the same function draws the World screen, route previews and the minimap source.
import { islandMask } from './terrain';
import { sampleWorld } from './validate';
import type { RouteProfile } from './route';
import type { World } from './types';

const PALETTE = { deep: '#163a52', mid: '#1d4d6a', shallow: '#2a6782', foam: '#7fb3c2', sand: '#d9c48f', land: '#6f8f4e', road: '#f4efe2', roadEdge: '#2a2f38', label: '#f7f3ea', labelShadow: '#1e2633', route: '#f2c14e' };

function coastPath(world: World, level: number, step = 120): string {
  const mask = islandMask(world); const paths: string[] = [];
  for (const isl of world.islands) {
    const pts: string[] = []; const [cx, cz] = isl.center; const R = Math.max(...isl.radii) * 1.6;
    for (let a = 0; a < 360; a += 2) { // march outward along each ray until the mask drops below `level`
      const rad = (a * Math.PI) / 180; let r = 0; while (r < R && mask(cx + Math.cos(rad) * r, cz + Math.sin(rad) * r) > level) r += step / 4;
      pts.push(`${(cx + Math.cos(rad) * r).toFixed(0)},${(cz + Math.sin(rad) * r).toFixed(0)}`);
    }
    paths.push(`M${pts.join('L')}Z`);
  }
  return paths.join(' ');
}

export function mapSvg(world: World, opts: { route?: RouteProfile; showLabels?: boolean; viewBox?: [number, number, number, number]; markers?: { x: number; z: number; kind: 'start' | 'finish' }[] } = {}): string {
  const [W, H] = world.size; const vb = opts.viewBox ?? [-W / 2, -H / 2, W, H]; const s = sampleWorld(world); const lbl = opts.showLabels !== false;
  const roads = world.edges.map((e) => { const p = s[e.id]!; let d = ''; for (let i = 0; i < p.x.length; i += 4) d += `${i ? 'L' : 'M'}${p.x[i]!.toFixed(0)},${p.z[i]!.toFixed(0)}`; return d; }).join(' ');
  const route = opts.route ? (() => { let d = ''; for (let i = 0; i < opts.route!.x.length; i += 4) d += `${i ? 'L' : 'M'}${opts.route!.x[i]!.toFixed(0)},${opts.route!.z[i]!.toFixed(0)}`; return d; })() : '';
  const k = vb[2] / 2400; // stroke scale relative to the view
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb.join(' ')}" preserveAspectRatio="xMidYMid slice">`,
    `<defs><radialGradient id="sea" cx="50%" cy="50%" r="70%"><stop offset="0" stop-color="${PALETTE.shallow}"/><stop offset="1" stop-color="${PALETTE.deep}"/></radialGradient><pattern id="hatch" width="${60 * k}" height="${60 * k}" patternUnits="userSpaceOnUse" patternTransform="rotate(35)"><line x1="0" y1="0" x2="0" y2="${60 * k}" stroke="#000" stroke-opacity=".06" stroke-width="${18 * k}"/></pattern></defs>`,
    `<rect x="${vb[0]}" y="${vb[1]}" width="${vb[2]}" height="${vb[3]}" fill="url(#sea)"/>`,
    `<path d="${coastPath(world, -0.35)}" fill="${PALETTE.mid}" opacity=".6"/>`, `<path d="${coastPath(world, -0.18)}" fill="${PALETTE.shallow}" opacity=".7"/>`,
    `<path d="${coastPath(world, -0.06)}" fill="none" stroke="${PALETTE.foam}" stroke-width="${10 * k}" opacity=".7"/>`,
    `<path d="${coastPath(world, 0.0)}" fill="${PALETTE.sand}"/>`, `<path d="${coastPath(world, 0.06)}" fill="${PALETTE.land}"/>`,
    ...world.regions.map((r) => `<polygon points="${r.polygon.map((p) => p.join(',')).join(' ')}" fill="${r.color}" opacity=".55"/>`),
    `<path d="${coastPath(world, 0.06)}" fill="url(#hatch)"/>`,
    ...world.lakes.map((l) => `<circle cx="${l.center[0]}" cy="${l.center[1]}" r="${l.radius}" fill="${PALETTE.shallow}" stroke="${PALETTE.foam}" stroke-width="${6 * k}"/>`),
    ...world.towns.map((t) => `<circle cx="${t.center[0]}" cy="${t.center[1]}" r="${t.radius}" fill="#c9b79a" opacity=".55"/>`),
    `<path d="${roads}" fill="none" stroke="${PALETTE.roadEdge}" stroke-width="${22 * k}" stroke-linecap="round" stroke-linejoin="round" opacity=".55"/>`,
    `<path d="${roads}" fill="none" stroke="${PALETTE.road}" stroke-width="${12 * k}" stroke-linecap="round" stroke-linejoin="round"/>`,
    route && `<path d="${route}" fill="none" stroke="${PALETTE.route}" stroke-width="${16 * k}" stroke-linecap="round" stroke-linejoin="round"/>`,
    ...(opts.markers ?? []).map((m) => `<g transform="translate(${m.x},${m.z})"><circle r="${34 * k}" fill="${m.kind === 'start' ? '#5fd39a' : '#f0787a'}" stroke="#1e2633" stroke-width="${8 * k}"/></g>`),
    ...world.landmarks.map((l) => `<g transform="translate(${l.pos[0]},${l.pos[2]})"><circle r="${26 * k}" fill="#f7f3ea" stroke="#1e2633" stroke-width="${7 * k}"/>${lbl ? `<text y="${-46 * k}" text-anchor="middle" font-family="Inter,sans-serif" font-size="${40 * k}" font-weight="600" fill="${PALETTE.label}" stroke="${PALETTE.labelShadow}" stroke-width="${8 * k}" paint-order="stroke">${l.name}</text>` : ''}</g>`),
    ...(lbl ? world.regions.map((r) => { const cx = r.polygon.reduce((a, p) => a + p[0], 0) / r.polygon.length, cz = r.polygon.reduce((a, p) => a + p[1], 0) / r.polygon.length; return `<text x="${cx}" y="${cz}" text-anchor="middle" font-family="'Barlow Condensed',sans-serif" font-style="italic" font-weight="700" font-size="${90 * k}" letter-spacing="${6 * k}" fill="${PALETTE.label}" stroke="${PALETTE.labelShadow}" stroke-width="${12 * k}" paint-order="stroke" opacity=".95">${r.name.toUpperCase()}</text>`; }) : []),
    `</svg>`,
  ];
  return parts.filter(Boolean).join('');
}
