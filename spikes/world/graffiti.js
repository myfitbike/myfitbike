// Hand-painted road writing before checkpoints (PLAN 16.16): the rider's name, cheers, place names, fan nicknames,
// arrows. One canvas atlas + one merged mesh. Text is always readable from the approach direction.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const CHEERS = ['ALLEZ!', 'VAS-Y!', 'FORZA!', 'VAMOS!', 'HOPP HOPP', 'KEEP PEDALLING', 'ALLEZ ALLEZ', 'SUPER!', 'GO GO GO', 'BRAVO'];
const PLACES = ['VELORA', 'PORT ANCHOR', 'GREENFOLD', 'SALTMARSH', 'SOLACE'];
const NICKS = ['EL MOTOR', 'DIESEL', 'THE HAMMER', 'TURBO', 'LA FUSÉE', 'ROCKET', 'KOM QUEEN', 'NONNA ♥', 'IL FALCO', 'BIG RING'];

export function buildGraffiti(scene, bake, riderName = 'RIDER') {
  const name = riderName.trim().toUpperCase().slice(0, 14) || 'RIDER';
  const texts = [`GO ${name}!`, `ALLEZ ${name}`, `${name} ♥`, `${name}!!`, ...CHEERS, ...PLACES, ...NICKS, '↑↑↑', '→ KOM'];
  const ROW = 128, W = 2048, H = ROW * texts.length;
  const c = document.createElement('canvas'); c.width = W; c.height = Math.min(H, 8192); const g = c.getContext('2d');
  let seed = 99; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const widths = texts.map((t, i) => {
    g.save(); g.translate(16, i * ROW + ROW * 0.78); g.font = `900 ${ROW * 0.82}px Impact, "Arial Black", "Helvetica Neue", sans-serif`;
    const w = Math.min(W - 32, g.measureText(t).width); g.scale(Math.min(1, (W - 32) / g.measureText(t).width), 1);
    g.fillStyle = '#ffffff'; g.fillText(t, 0, 0); g.restore();
    g.save(); g.globalCompositeOperation = 'destination-out'; // worn, brushed paint
    for (let k = 0; k < 900; k++) { g.globalAlpha = 0.25 + rnd() * 0.6; g.fillRect(16 + rnd() * w, i * ROW + rnd() * ROW, 1 + rnd() * 5, 1 + rnd() * 2); }
    g.restore(); return w + 32;
  });
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 16;

  const parts = [];
  const isName = (i) => i < 4;
  for (const cp of bake.checkpoints) {
    const r = bake.roads[cp.edge]; const n = r.x.length, step = r.length / (n - 1);
    const at = (d) => { const f = Math.max(0, Math.min(n - 1.001, d / step)); const k = Math.floor(f), t = f - k; const k2 = Math.min(n - 1, k + 1); const kb = Math.max(0, k - 1), ka = Math.min(n - 1, k + 2);
      const tx = r.x[ka] - r.x[kb], tz = r.z[ka] - r.z[kb], l = Math.hypot(tx, tz);
      return { x: r.x[k] + (r.x[k2] - r.x[k]) * t, y: r.y[k] + (r.y[k2] - r.y[k]) * t, z: r.z[k] + (r.z[k2] - r.z[k]) * t, tx: tx / l, tz: tz / l }; };
    const dense = cp.kind === 'summit' || cp.kind === 'climb' ? 1 : 0.55;
    for (let d = Math.max(5, cp.at - 300); d < cp.at - 12; d += (8 + rnd() * 14) / dense) {
      const near = 1 - (cp.at - d) / 300; // closer to the checkpoint: more of the rider's name, bigger
      const i = rnd() < 0.25 + near * 0.4 ? Math.floor(rnd() * 4) : 4 + Math.floor(rnd() * (texts.length - 4));
      const p = at(d); const len = Math.min(5.2, (isName(i) ? 3.4 + near * 1.6 : 2.2 + rnd() * 1.6)); const aspect = widths[i] / ROW; const wide = Math.min(len, 5.4), tall = wide / aspect;
      const geo = new THREE.PlaneGeometry(wide, Math.max(0.35, tall));
      const uv = geo.attributes.uv; const v0 = 1 - ((i + 1) * ROW) / c.height, v1 = 1 - (i * ROW) / c.height, u1 = widths[i] / W;
      for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * u1, v0 + uv.getY(k) * (v1 - v0));
      const yellow = rnd() < 0.3; const col = new Float32Array(uv.count * 3).fill(1); if (yellow) for (let k = 0; k < uv.count; k++) col.set([0.98, 0.84, 0.32], k * 3);
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      const lateral = (rnd() - 0.5) * 2.6, theta = Math.atan2(-p.tx, -p.tz) + (rnd() - 0.5) * 0.35; // text "up" points down the road
      geo.rotateX(-Math.PI / 2).rotateY(theta).translate(p.x - p.tz * lateral, p.y + 0.075, p.z + p.tx * lateral);
      parts.push(geo);
    }
  }
  if (!parts.length) return;
  const mesh = new THREE.Mesh(mergeGeometries(parts), new THREE.MeshStandardMaterial({ map: tex, vertexColors: true, transparent: true, roughness: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
  mesh.receiveShadow = true; mesh.renderOrder = 1; scene.add(mesh);
}
