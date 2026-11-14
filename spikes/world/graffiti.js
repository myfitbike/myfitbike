// Road graffiti before checkpoints (PLAN 16.16 / 16.17): the rider's name everywhere, witty fan slogans, distance
// countdowns at their true distance, and painted flags (the rider's country often, other nations as visiting fans).
// One canvas atlas + one merged mesh. Text always reads from the approach direction.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const SLOGANS = (N) => [
  `ALLEZ ${N}!`, `GO ${N} GO`, `CHAPEAU ${N}`, `${N} FOR KOM`, `${N} ♥♥♥`, `VAMOS ${N}`, `FORZA ${N}`, `${N} = LEGEND`, `${N} 4 PRESIDENT`, `HOPP ${N}!`,
  'LEGS? WHAT LEGS', 'SUFFER WITH STYLE', 'WATTS > WORDS', 'NO CHAIN NO GAIN', 'DROP THE HAMMER', 'BIG RING ONLY', 'EAT · SLEEP · CLIMB',
  'PAIN IS TEMPORARY', 'STRAVA OR IT DIDN\'T HAPPEN', 'ALMOST THERE (NOT REALLY)', 'DANCE ON THE PEDALS', 'SMOOTH IS FAST', 'KOM OR BUST', 'ALLEZ ALLEZ ALLEZ', 'VAS-Y!',
];
// Painted flags as simple stripe/cross specs (paint-friendly shapes).
const FLAGS = {
  IN: { h: ['#ff9933', '#ffffff', '#138808'], disc: '#000080' }, FR: { v: ['#0055a4', '#ffffff', '#ef4135'] }, IT: { v: ['#009246', '#ffffff', '#ce2b37'] },
  BE: { v: ['#000000', '#fdda24', '#ef3340'] }, IE: { v: ['#169b62', '#ffffff', '#ff883e'] }, DE: { h: ['#000000', '#dd0000', '#ffce00'] },
  NL: { h: ['#ae1c28', '#ffffff', '#21468b'] }, CO: { h: ['#fcd116', '#fcd116', '#003893', '#ce1126'] }, ES: { h: ['#aa151b', '#f1bf00', '#f1bf00', '#aa151b'] },
  AT: { h: ['#ed2939', '#ffffff', '#ed2939'] }, PL: { h: ['#ffffff', '#dc143c'] }, DK: { cross: ['#c8102e', '#ffffff'] }, NO: { cross: ['#ba0c2f', '#ffffff', '#00205b'] },
  SE: { cross: ['#006aa7', '#fecc02'] }, JP: { bg: '#ffffff', dot: '#bc002d' }, CH: { plus: ['#da291c', '#ffffff'] }, SI: { h: ['#ffffff', '#0000ff', '#ff0000'] },
  CA: { v: ['#d52b1e', '#ffffff', '#ffffff', '#d52b1e'], dot: '#d52b1e' }, US: { stripes: ['#b22234', '#ffffff'], canton: '#3c3b6e' }, GB: { union: true }, AU: { bg: '#00008b', canton: '#00008b', dot: '#ffffff' },
};
function drawFlag(g, code, x, y, w, h) {
  const f = FLAGS[code] ?? FLAGS.FR; g.save(); g.translate(x, y);
  if (f.bg) { g.fillStyle = f.bg; g.fillRect(0, 0, w, h); }
  if (f.h) f.h.forEach((c, i) => { g.fillStyle = c; g.fillRect(0, (i * h) / f.h.length, w, h / f.h.length + 1); });
  if (f.v) f.v.forEach((c, i) => { g.fillStyle = c; g.fillRect((i * w) / f.v.length, 0, w / f.v.length + 1, h); });
  if (f.cross) { g.fillStyle = f.cross[0]; g.fillRect(0, 0, w, h); g.fillStyle = f.cross[1]; g.fillRect(w * 0.28, 0, h * 0.22, h); g.fillRect(0, h * 0.39, w, h * 0.22); if (f.cross[2]) { g.fillStyle = f.cross[2]; g.fillRect(w * 0.31, 0, h * 0.11, h); g.fillRect(0, h * 0.445, w, h * 0.11); } }
  if (f.plus) { g.fillStyle = f.plus[0]; g.fillRect(0, 0, w, h); g.fillStyle = f.plus[1]; g.fillRect(w / 2 - h * 0.1, h * 0.2, h * 0.2, h * 0.6); g.fillRect(w / 2 - h * 0.3, h * 0.4, h * 0.6, h * 0.2); }
  if (f.stripes) { for (let i = 0; i < 7; i++) { g.fillStyle = f.stripes[i % 2]; g.fillRect(0, (i * h) / 7, w, h / 7 + 1); } }
  if (f.canton) { g.fillStyle = f.canton; g.fillRect(0, 0, w * 0.42, h * 0.54); }
  if (f.union) { g.fillStyle = '#012169'; g.fillRect(0, 0, w, h); g.strokeStyle = '#ffffff'; g.lineWidth = h * 0.2; g.beginPath(); g.moveTo(0, 0); g.lineTo(w, h); g.moveTo(w, 0); g.lineTo(0, h); g.stroke(); g.strokeStyle = '#c8102e'; g.lineWidth = h * 0.07; g.stroke(); g.fillStyle = '#ffffff'; g.fillRect(w * 0.42, 0, w * 0.16, h); g.fillRect(0, h * 0.36, w, h * 0.28); g.fillStyle = '#c8102e'; g.fillRect(w * 0.45, 0, w * 0.1, h); g.fillRect(0, h * 0.4, w, h * 0.2); }
  if (f.disc) { g.strokeStyle = f.disc; g.lineWidth = h * 0.03; g.beginPath(); g.arc(w / 2, h / 2, h * 0.13, 0, 6.283); g.stroke(); }
  if (f.dot) { g.fillStyle = f.dot; g.beginPath(); g.arc(f.canton ? w * 0.21 : w / 2, f.canton ? h * 0.27 : h / 2, h * (f.canton ? 0.08 : 0.22), 0, 6.283); g.fill(); }
  g.restore();
}

const PAINTS = [[1, 1, 1], [0.98, 0.84, 0.32], [0.95, 0.42, 0.32], [0.36, 0.78, 0.9], [0.45, 0.85, 0.5], [0.95, 0.55, 0.78], [0.55, 0.62, 1.0], [1.0, 0.6, 0.25]];

export function buildGraffiti(scene, bake, riderName = 'RIDER', country = 'IN') {
  const N = riderName.trim().toUpperCase().slice(0, 14) || 'RIDER';
  let seed = 99; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647); const pick = (a) => a[Math.floor(rnd() * a.length)];
  // atlas entries: { kind: 'text'|'flag', value }
  const nameTexts = [N, `GO ${N}`, `ALLEZ ${N}`, `${N}!!!`];
  const entries = [...nameTexts.map((v) => ({ kind: 'text', value: v, name: true })), ...SLOGANS(N).map((v) => ({ kind: 'text', value: v, name: v.includes(N) })),
    ...['1 KM', '500 M', '250 M', '100 M'].map((v) => ({ kind: 'text', value: v, countdown: true })), { kind: 'flag', value: country, mine: true },
    ...Object.keys(FLAGS).filter((c) => c !== country).map((c) => ({ kind: 'flag', value: c }))];
  const ROW = 128, W = 2048; const c = document.createElement('canvas'); c.width = W; c.height = ROW * entries.length; const g = c.getContext('2d');
  entries.forEach((e, i) => {
    const y = i * ROW;
    if (e.kind === 'flag') { drawFlag(g, e.value, 16, y + 8, 168, ROW - 16); e.w = 200; }
    else {
      g.save(); g.font = `900 ${ROW * 0.82}px Impact, "Arial Black", "Helvetica Neue", sans-serif`; const mw = g.measureText(e.value).width; const sx = Math.min(1, (W - 32) / mw);
      g.translate(16, y + ROW * 0.8); g.scale(sx, 1); g.fillStyle = '#ffffff'; g.fillText(e.value, 0, 0); g.restore(); e.w = Math.min(W, mw * sx + 32);
    }
    g.save(); g.globalCompositeOperation = 'destination-out'; // worn, brushed paint on rough asphalt
    for (let k = 0; k < (e.kind === 'flag' ? 300 : 900); k++) { g.globalAlpha = 0.2 + rnd() * 0.6; g.fillRect(16 + rnd() * (e.w - 16), y + rnd() * ROW, 1 + rnd() * 5, 1 + rnd() * 2); }
    g.restore();
  });
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 16;
  const idx = (pred) => entries.map((e, i) => (pred(e) ? i : -1)).filter((i) => i >= 0);
  const NAME = idx((e) => e.name), SLOG = idx((e) => e.kind === 'text' && !e.name && !e.countdown), FLAGI = idx((e) => e.kind === 'flag' && !e.mine), MINE = idx((e) => e.mine)[0];
  const countdownIdx = (label) => entries.findIndex((e) => e.value === label);

  const parts = [];
  function decal(i, p, lengthM, lateral, yaw, paint) {
    const e = entries[i]; const aspect = e.w / ROW; const wide = e.kind === 'flag' ? lengthM : Math.min(lengthM, 5.6), tall = e.kind === 'flag' ? lengthM * 0.62 : Math.max(0.4, wide / aspect);
    const geo = new THREE.PlaneGeometry(wide, tall); const uv = geo.attributes.uv; const v0 = 1 - ((i + 1) * ROW) / c.height, v1 = 1 - (i * ROW) / c.height, u0 = e.kind === 'flag' ? 16 / W : 0, u1 = e.kind === 'flag' ? 184 / W : e.w / W;
    for (let k = 0; k < uv.count; k++) uv.setXY(k, u0 + uv.getX(k) * (u1 - u0), v0 + uv.getY(k) * (v1 - v0));
    const col = new Float32Array(uv.count * 3); const pc = e.kind === 'flag' ? [0.92, 0.92, 0.92] : paint; for (let k = 0; k < uv.count; k++) col.set(pc, k * 3);
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const theta = Math.atan2(-p.tx, -p.tz) + yaw; // text "up" points down the road
    geo.rotateX(-Math.PI / 2).rotateY(theta).translate(p.x - p.tz * lateral, p.y + 0.075, p.z + p.tx * lateral); parts.push(geo);
  }
  for (const cp of bake.checkpoints) {
    const r = bake.roads[cp.edge]; const n = r.x.length, step = r.length / (n - 1);
    const at = (d) => { const f = Math.max(0, Math.min(n - 1.001, d / step)); const k = Math.floor(f), t = f - k; const k2 = Math.min(n - 1, k + 1); const kb = Math.max(0, k - 1), ka = Math.min(n - 1, k + 2);
      const tx = r.x[ka] - r.x[kb], tz = r.z[ka] - r.z[kb], l = Math.hypot(tx, tz); return { x: r.x[k] + (r.x[k2] - r.x[k]) * t, y: r.y[k] + (r.y[k2] - r.y[k]) * t, z: r.z[k] + (r.z[k2] - r.z[k]) * t, tx: tx / l, tz: tz / l }; };
    const span = Math.min(320, cp.at - 5); const big = cp.kind === 'summit' || cp.kind === 'climb';
    // road-wide name banner just before the arch, with the rider's flag after it
    if (cp.at > 40) { decal(nameTexts.indexOf(`ALLEZ ${N}`), at(cp.at - 26), 5.8, 0, 0, [0.98, 0.84, 0.32]); decal(MINE, at(cp.at - 33), 3.2, 0, 0); }
    for (const [label, dist] of [['100 M', 100], ['250 M', 250], ['500 M', 500], ['1 KM', 1000]]) if (cp.at - dist > 5) decal(countdownIdx(label), at(cp.at - dist), 3.6, 0, 0, [1, 1, 1]);
    for (let d = cp.at - span; d < cp.at - 40; d += (4.5 + rnd() * 6) / (big ? 1 : 0.6)) {
      const roll = rnd(); const p = at(d); const lateral = (rnd() - 0.5) * 0.9, yaw = (rnd() - 0.5) * 0.4;
      if (roll < 0.5) decal(pick(NAME), p, 3.6 + rnd() * 1.6, lateral, yaw, PAINTS[rnd() < 0.5 ? 0 : 1 + Math.floor(rnd() * 7)]);
      else if (roll < 0.62) decal(MINE, p, 2.2 + rnd() * 0.8, (rnd() - 0.5) * 1.6, yaw * 0.5);
      else if (roll < 0.72) decal(pick(FLAGI), p, 1.8 + rnd() * 0.6, (rnd() - 0.5) * 2.2, yaw);
      else decal(pick(SLOG), p, 3 + rnd() * 2, lateral, yaw, PAINTS[Math.floor(rnd() * PAINTS.length)]);
    }
  }
  if (!parts.length) return;
  const mesh = new THREE.Mesh(mergeGeometries(parts), new THREE.MeshStandardMaterial({ map: tex, vertexColors: true, transparent: true, roughness: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
  mesh.receiveShadow = true; mesh.renderOrder = 1; scene.add(mesh);
}
