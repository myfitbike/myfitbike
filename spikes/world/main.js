// Phase 0b/0c spike (throwaway): render the bake from build.mjs and ride it with keyboard power.
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeNoise2, fbm } from './lib/core.mjs?v=2';
import { createRider } from './rider.js?v=2';
import { buildScenery } from './scenery.js?v=2';
import { buildCheckpoints } from './checkpoints.js?v=2';
import { buildGraffiti } from './graffiti.js?v=2';
const cn = makeNoise2(99), cn2 = makeNoise2(100);

const params = new URLSearchParams(location.search);
let camModeInit = 1;
const debugAt = params.get('at') ? params.get('at').split(',').map(Number) : null;
const $ = (id) => document.getElementById(id);
const bake = await (await fetch('./out/slice.json', { cache: 'no-store' })).json();
const loadF32 = async (f) => new Float32Array(await (await fetch(`./out/${f}`, { cache: 'no-store' })).arrayBuffer());
const nearH = await loadF32(bake.terrain.near.file), farH = await loadF32(bake.terrain.far.file);

// ---------- renderer, scene, sky ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, +(params.get('dpr') || 2)));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.6;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.prepend(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.3, 16000);
addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); });

const sky = new Sky(); sky.scale.setScalar(450000);
const su = sky.material.uniforms; su.turbidity.value = 5; su.rayleigh.value = 1.4; su.mieCoefficient.value = 0.004; su.mieDirectionalG.value = 0.8;
const sunDir = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - 34), THREE.MathUtils.degToRad(215));
su.sunPosition.value.copy(sunDir); scene.add(sky);
const pmrem = new THREE.PMREMGenerator(renderer); const envScene = new THREE.Scene(); envScene.add(sky.clone());
scene.environment = pmrem.fromScene(envScene).texture; scene.environmentIntensity = 0.55;
scene.fog = new THREE.FogExp2(0xc3d3df, 0.00021); // haze matched to the horizon, hides the world edge

const sun = new THREE.DirectionalLight(0xfff1dc, 2.6); sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -70, right: 70, top: 70, bottom: -70, near: 1, far: 500 });
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.6; scene.add(sun, sun.target);
scene.add(new THREE.HemisphereLight(0xcfe3ff, 0x4a5a3a, 0.35));

// ---------- textures (generated, no third-party assets) ----------
function canvasTex(w, h, draw, repeat = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}
let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const detail = canvasTex(256, 256, (g, w, h) => { const im = g.createImageData(w, h); for (let i = 0; i < w * h; i++) { const v = 205 + rnd() * 50; im.data.set([v, v, v, 255], i * 4); } g.putImageData(im, 0, 0); });
const asphalt = canvasTex(256, 1024, (g, w, h) => {
  const im = g.createImageData(w, h); for (let i = 0; i < w * h; i++) { const v = 52 + rnd() * 22; im.data.set([v, v + 1, v + 4, 255], i * 4); } g.putImageData(im, 0, 0);
  g.fillStyle = 'rgba(235,235,225,.9)'; g.fillRect(w * 0.06, 0, w * 0.016, h); g.fillRect(w * 0.924, 0, w * 0.016, h);
  g.fillRect(w * 0.494, 0, w * 0.012, h * 0.4);
});

// ---------- terrain ----------
function terrainMesh(t, H, uvScale, sinkEdge = 0) {
  const { nx, nz, ox, oz, step } = t; const pos = new Float32Array(nx * nz * 3), uv = new Float32Array(nx * nz * 2);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const k = j * nx + i, x = ox + i * step, z = oz + j * step; pos.set([x, H[k], z], k * 3); uv.set([x / uvScale, z / uvScale], k * 2); }
  const idx = new Uint32Array((nx - 1) * (nz - 1) * 6); let p = 0;
  for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) { const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1; idx.set([a, c, b, b, c, d], p); p += 6; }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); geo.setIndex(new THREE.BufferAttribute(idx, 1)); geo.computeVertexNormals();
  const n = geo.attributes.normal.array, col = new Float32Array(nx * nz * 3); const c = new THREE.Color(), grass = new THREE.Color(0x5d7f3a), dry = new THREE.Color(0x8f9450), rock = new THREE.Color(0x7d7468), sand = new THREE.Color(0xcdbb8e), snow = new THREE.Color(0xf2f4f7), forest = new THREE.Color(0x3c5a2c), meadow = new THREE.Color(0x8aa04a), crop = new THREE.Color(0xb7a85a);
  for (let k = 0; k < nx * nz; k++) {
    const x = pos[k * 3], h = pos[k * 3 + 1], z = pos[k * 3 + 2], up = n[k * 3 + 1];
    // field mosaic: rotated cells with their own tint, broken up by two noise scales
    const cx = Math.floor((x * 0.94 + z * 0.34) / 140), cz = Math.floor((z * 0.94 - x * 0.34) / 95);
    const cell = Math.abs(Math.sin(cx * 127.1 + cz * 311.7) * 43758.5) % 1;
    const macro = 0.5 + 0.5 * fbm(cn, x / 900, z / 900, 3), meso = 0.5 + 0.5 * fbm(cn2, x / 120, z / 120, 3);
    c.copy(grass).lerp(dry, macro * 0.7);
    if (h < 60 && macro < 0.62) c.lerp(cell < 0.3 ? meadow : cell < 0.5 ? crop : cell < 0.75 ? grass : forest, 0.45);
    c.multiplyScalar(0.82 + meso * 0.3); if (sinkEdge) c.lerp(forest, 0.35);
    if (h < 3.2) c.copy(sand); if (h < 0) c.copy(sand).multiplyScalar(0.7);
    if (up < 0.82) c.lerp(rock, Math.min(1, (0.82 - up) * 5)); if (h > 120) c.lerp(rock, Math.min(1, (h - 120) / 220));
    if (h > 560 && up > 0.6) c.lerp(snow, Math.min(1, (h - 560) / 90));
    col.set([c.r, c.g, c.b], k * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, map: detail, roughness: 0.95 })); m.receiveShadow = !sinkEdge; return m;
}
scene.add(terrainMesh(bake.terrain.near, nearH, 7), terrainMesh(bake.terrain.far, farH, 60, 1));
const water = new THREE.Mesh(new THREE.PlaneGeometry(40000, 40000).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x1b5a74, roughness: 0.07, metalness: 0.15 }));
water.position.y = 0.4; scene.add(water);

// ---------- roads (ribbons on the baked 5 m samples) ----------
function ribbon(s, half, lift, uvLen) {
  const n = s.x.length, pos = new Float32Array(n * 6), uv = new Float32Array(n * 4), idx = [];
  let dist = 0;
  for (let k = 0; k < n; k++) {
    const a = Math.max(0, k - 1), b = Math.min(n - 1, k + 1); let tx = s.x[b] - s.x[a], tz = s.z[b] - s.z[a]; const l = Math.hypot(tx, tz); tx /= l; tz /= l;
    if (k) dist += Math.hypot(s.x[k] - s.x[k - 1], s.z[k] - s.z[k - 1]);
    pos.set([s.x[k] + tz * half, s.y[k] + lift, s.z[k] - tx * half, s.x[k] - tz * half, s.y[k] + lift, s.z[k] + tx * half], k * 6);
    uv.set([0, dist / uvLen, 1, dist / uvLen], k * 4); if (k < n - 1) { const i = k * 2; idx.push(i, i + 1, i + 2, i + 1, i + 3, i + 2); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals(); return g;
}
const roadMat = new THREE.MeshStandardMaterial({ map: asphalt, roughness: 0.85, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
const shoulderMat = new THREE.MeshStandardMaterial({ color: 0x6b6658, roughness: 1, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
for (const r of Object.values(bake.roads)) {
  const road = new THREE.Mesh(ribbon(r, r.width / 2, 0.06, 14), roadMat); road.receiveShadow = true;
  const sh = new THREE.Mesh(ribbon(r, r.width / 2 + 0.7, 0.0, 14), shoulderMat); sh.receiveShadow = true; scene.add(sh, road);
}

// ---------- scenery ----------
const colored = (geo, hex) => { geo = geo.index ? geo.toNonIndexed() : geo; const c = new THREE.Color(hex), n = geo.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3); geo.setAttribute('color', new THREE.BufferAttribute(a, 3)); geo.deleteAttribute('uv'); return geo; };
const sceneryUpdate = buildScenery(scene, bake, water.material);
const checkpointsUpdate = buildCheckpoints(scene, bake);
buildGraffiti(scene, bake, params.get('name') || 'RIDER', (params.get('country') || 'IN').toUpperCase()); // app: profile name + country

const walls = [0xe9dfcc, 0xd9c3a5, 0xf3efe6, 0xc7d3d8, 0xe2b8a0], roofs = [0x9c4a34, 0x5d5f66, 0x7a3b2e];
const houseGeos = bake.houses.map((h) => {
  const H = h.floors * 3; const rotm = new THREE.Matrix4().makeRotationY(-h.rot); const tr = new THREE.Matrix4().makeTranslation(h.x, h.y, h.z);
  const body = colored(new THREE.BoxGeometry(h.w, H + 3, h.d).translate(0, (H + 3) / 2 - 3, 0), walls[h.wall]);
  const roof = colored(new THREE.ConeGeometry(Math.SQRT1_2, 1, 4).rotateY(Math.PI / 4).scale(h.w * 1.15, 2.6 + h.w * 0.12, h.d * 1.15).translate(0, H + (2.6 + h.w * 0.12) / 2, 0), roofs[h.roof]);
  return mergeGeometries([body, roof]).applyMatrix4(rotm).applyMatrix4(tr);
});
const lh = bake.landmarks.find((l) => l.kind === 'lighthouse').pos; const lhParts = [];
for (let b = 0; b < 6; b++) lhParts.push(colored(new THREE.CylinderGeometry(2.2 - (b + 1) * 0.15, 2.2 - b * 0.15, 3.6, 16).translate(0, 1.8 + b * 3.6, 0), b % 2 ? 0xf4f1ea : 0xc0392b));
lhParts.push(colored(new THREE.CylinderGeometry(1.5, 1.5, 2.2, 12).translate(0, 22.7, 0), 0xffe7a0), colored(new THREE.ConeGeometry(1.9, 2.4, 12).translate(0, 25, 0), 0x2b2f36), colored(new THREE.CylinderGeometry(3.4, 3.8, 1.2, 16).translate(0, 0.2, 0), 0x9aa0a6));
houseGeos.push(mergeGeometries(lhParts).translate(lh[0], lh[1], lh[2]));
const town = new THREE.Mesh(mergeGeometries(houseGeos), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, flatShading: true }));
town.castShadow = town.receiveShadow = true; scene.add(town);

// ---------- rider (placeholder primitives; real rigged avatar is Phase 4) ----------
const avatarOpts = {}; for (const k of ['jersey', 'accent', 'shorts', 'socks', 'shoes', 'helmet', 'frame', 'skin', 'hair']) if (params.get(k)) avatarOpts[k] = parseInt(params.get(k), 16); if (params.get('body')) avatarOpts.body = params.get('body');
const cyclist = createRider(avatarOpts); const rider = cyclist.group; scene.add(rider);

// ---------- route following (5 m samples per edge; junction choice at n-east) ----------
const roadOf = (id, rev) => { const r = bake.roads[id]; const n = r.x.length; const at = (k) => (rev ? n - 1 - k : k); return { id, rev, r, n, len: r.length, at }; };
let cur = roadOf(params.get('edge') || 'e-north', false), s = +(params.get('s') || 20), spurArmed = false;
if (params.get('cam')) camModeInit = +params.get('cam');
function nextEdge() {
  if (cur.id === 'e-north') return spurArmed ? roadOf('e-spur', false) : roadOf('e-south', false);
  if (cur.id === 'e-south') return roadOf('e-north', false);
  if (cur.id === 'e-spur' && !cur.rev) return roadOf('e-spur', true); // dead end: U-turn
  return roadOf('e-south', false);
}
function sampleAt(edge, dist) {
  const f = Math.max(0, Math.min(edge.n - 1.001, (dist / edge.len) * (edge.n - 1))); const k = Math.floor(f), t = f - k; const a = edge.at(k), b = edge.at(k + 1), R = edge.r;
  return { x: R.x[a] + (R.x[b] - R.x[a]) * t, y: R.y[a] + (R.y[b] - R.y[a]) * t, z: R.z[a] + (R.z[b] - R.z[a]) * t, dx: R.x[b] - R.x[a], dz: R.z[b] - R.z[a] };
}

// ---------- physics (plan 6.1), fixed 50 ms steps ----------
let powerW = +(params.get('power') || 200), v = 0, ridden = 0, gradePct = 0, ascent = 0, noPedalS = 0, paused = false;
const AUTO_PAUSE_S = 3, FTP = 250, MAX_HR = 185; let hr = 62;
const M = 85, G = 9.81, CRR = 0.004, CDA = 0.32, EFF = 0.975;
function step(dt) {
  const p0 = sampleAt(cur, s), p1 = sampleAt(cur, Math.min(cur.len, s + 10)); const run = Math.hypot(p1.x - p0.x, p1.z - p0.z);
  gradePct = run > 0.5 ? ((p1.y - p0.y) / run) * 100 : gradePct;
  const th = Math.atan(gradePct / 100), rho = 1.225 * Math.exp(-p0.y / 8434);
  const a = (powerW * EFF / Math.max(v, 0.5) - M * G * Math.sin(th) - M * G * Math.cos(th) * CRR - 0.5 * rho * CDA * v * v) / M;
  // Auto-pause (PLAN 16.9): no pedalling for AUTO_PAUSE_S -> paused, bike brakes to rest; first pedal stroke resumes.
  if (powerW > 0) { noPedalS = 0; paused = false; } else if ((noPedalS += dt) >= AUTO_PAUSE_S) paused = true;
  // simulated heart rate: rises toward a power-dependent target with a ~25 s lag, recovers when paused
  hr += ((paused ? 70 : 62 + Math.min(1, powerW / (FTP * 1.2)) * (MAX_HR - 70)) - hr) * (dt / 25);
  if (paused) { v = Math.max(0, v - 4 * dt); return; }
  const y0 = p0.y; v = Math.min(25, Math.max(0, v + a * dt)); s += v * dt; ridden += v * dt;
  const y1 = sampleAt(cur, Math.min(cur.len, s)).y; if (y1 > y0) ascent += y1 - y0;
  if (s >= cur.len) { s -= cur.len; const was = cur.id; cur = nextEdge(); if (was === 'e-north') spurArmed = false; }
}

// ---------- input ----------
let camMode = camModeInit;
addEventListener('keydown', (e) => {
  if (e.key === 'ArrowUp') powerW = Math.min(1500, powerW + (e.shiftKey ? 50 : 10));
  if (e.key === 'ArrowDown') powerW = Math.max(0, powerW - (e.shiftKey ? 50 : 10));
  if ('1234'.includes(e.key)) camMode = +e.key;
  if (e.key === 'z' || e.key === 'Z') setHudSize(HUD_SIZES[(HUD_SIZES.indexOf(hudSize) + 1) % 3]);
  if (e.key === 'p' || e.key === 'P') $('profile').hidden ^= 1;
  if (e.key === 'h' || e.key === 'H') for (const id of ['hud', 'perf', 'help']) document.getElementById(id).hidden ^= 1;
});

// ---------- HUD (4 Hz) and always-on terrain profile (PLAN 16.8) ----------
const ZONE_C = ['#8a94a0', '#3b8bff', '#35d07f', '#ffd23f', '#ff8a3d', '#ff4d4d', '#a259ff'], ZONE_N = ['Recovery', 'Endurance', 'Tempo', 'Threshold', 'VO2 max', 'Anaerobic', 'Sprint'], ZONE_U = [0.55, 0.75, 0.9, 1.05, 1.2, 1.5, 9];
const gradeColor = (g) => (g < -0.5 ? '#48cae4' : g < 3 ? '#35d07f' : g < 6 ? '#ffd23f' : g < 9 ? '#ff8a3d' : g < 12 ? '#ff4d4d' : '#8e1b1b');
const BANDS = [[-99, -0.5, '#48cae4'], [-0.5, 3, '#35d07f'], [3, 6, '#ffd23f'], [6, 9, '#ff8a3d'], [9, 12, '#ff4d4d'], [12, 99, '#8e1b1b']];
const gradeWord = (g) => (g < -0.5 ? 'downhill' : g < 1 ? 'flat' : g < 3 ? 'gentle' : g < 6 ? 'moderate' : g < 9 ? 'steep' : g < 12 ? 'severe' : 'extreme');
const route = bake.routes[0]; const lenNorth = bake.roads['e-north'].length;
const elev = []; for (const e of route.edges) { const r = bake.roads[e.id]; for (let k = 0; k < r.y.length - 1; k += 2) elev.push(r.y[k]); }
const routeLen = route.lengthM;
const pc = $('profileCanvas'); let profileBg = null;
function drawProfileBg() {
  const w = (pc.width = pc.clientWidth * devicePixelRatio), h = (pc.height = pc.clientHeight * devicePixelRatio);
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
  const lo = Math.min(...elev) - 5, hi = Math.max(...elev) + 15, Y = (y) => h - 6 - ((y - lo) / (hi - lo)) * (h - 16), X = (i) => (i / (elev.length - 1)) * w;
  let prevBand = null;
  for (let i = 0; i < elev.length - 1; i++) { // one filled column per 10 m, coloured by its gradient
    let sum = 0, n = 0; for (let j = Math.max(0, i - 10); j <= Math.min(route.gradePer10m.length - 1, i + 10); j++) { sum += route.gradePer10m[j]; n++; } // 200 m average
    const avgG = sum / n; // hysteresis: keep the previous colour band unless the average clearly leaves it (no stripes on a climb sitting at a threshold)
    if (prevBand === null || avgG < BANDS[prevBand][0] - 0.4 || avgG >= BANDS[prevBand][1] + 0.4) prevBand = BANDS.findIndex(([lo, hi]) => avgG >= lo && avgG < hi);
    g.fillStyle = BANDS[prevBand][2]; g.globalAlpha = 0.85;
    g.beginPath(); g.moveTo(X(i), h); g.lineTo(X(i), Y(elev[i])); g.lineTo(X(i + 1) + 0.5, Y(elev[i + 1])); g.lineTo(X(i + 1) + 0.5, h); g.fill();
  }
  g.globalAlpha = 1; g.strokeStyle = 'rgba(255,255,255,.7)'; g.lineWidth = devicePixelRatio; g.beginPath(); elev.forEach((y, i) => (i ? g.lineTo(X(i), Y(y)) : g.moveTo(X(i), Y(y)))); g.stroke();
  g.fillStyle = 'rgba(255,255,255,.55)'; g.font = `${11 * devicePixelRatio}px -apple-system, sans-serif`;
  for (let km = 1; km < routeLen / 1000; km++) { const x = (km * 1000 / routeLen) * w; g.fillRect(x, h - 10 * devicePixelRatio, devicePixelRatio, 10 * devicePixelRatio); g.fillText(`${km} km`, x + 4, h - 3 * devicePixelRatio); }
  profileBg = { c, Y, lo, hi };
}
addEventListener('resize', () => { profileBg = null; });
const HUD_SIZES = ['large', 'medium', 'small'], HUD_ZOOM = { large: 1, medium: 0.82, small: 0.66 }; let hudSize = 'large';
function setHudSize(sz) { hudSize = sz; const z = HUD_ZOOM[sz]; $('hud').style.zoom = z; $('profile').style.height = `${84 * z}px`; $('hud').style.bottom = `${(20 + 84 * z + 14) / z}px`; profileBg = null; }
setHudSize(params.get('hud') || 'large');
function routeDist() { return cur.id === 'e-north' ? s : cur.id === 'e-south' ? lenNorth + s : lenNorth; }
function updateHud(p) {
  const z = ZONE_U.findIndex((u) => powerW / FTP <= u);
  $('hPower').textContent = powerW; $('hPower').style.color = powerW ? ZONE_C[z] : '#fff';
  $('hZone').textContent = powerW ? `Z${z + 1} · ${ZONE_N[z]}` : 'not pedalling';
  $('zoneMark').style.left = `calc(${Math.min(99, (Math.min(powerW / FTP, 1.6) / 1.6) * 100)}% - 1px)`;
  const hz = [0.6, 0.7, 0.8, 0.9, 2].findIndex((u) => hr / MAX_HR <= u); $('hHr').textContent = hr.toFixed(0); $('hHr').style.color = ['#8a94a0', '#3b8bff', '#35d07f', '#ff8a3d', '#ff4d4d'][hz]; $('hHrZ').textContent = `Z${hz + 1} · simulated`;
  $('hSpeed').textContent = (v * 3.6).toFixed(1); $('hCad').textContent = `${cadence().toFixed(0)} rpm`;
  const gc = gradeColor(gradePct); $('hGrade').textContent = gradePct.toFixed(1); $('hGrade').style.color = gc; $('hGradeTxt').textContent = gradeWord(gradePct);
  const rise = Math.max(-10, Math.min(18, gradePct)); $('wedgePoly').setAttribute('points', `2,28 42,28 42,${28 - Math.max(1, rise * 1.4)}`); $('wedgePoly').style.fill = gc;
  const d = routeDist(); $('hDist').textContent = (ridden / 1000).toFixed(2); $('hRemain').textContent = `${((routeLen - d) / 1000).toFixed(2)} km to go`;
  $('hElev').textContent = p.y.toFixed(0); $('hAscent').textContent = `+${ascent.toFixed(0)} m climbed`;
  $('paused').style.display = paused ? 'block' : 'none';
  if (!$('profile').hidden) {
    if (!profileBg) drawProfileBg(); const g = pc.getContext('2d'); g.clearRect(0, 0, pc.width, pc.height); g.drawImage(profileBg.c, 0, 0);
    const x = (d / routeLen) * pc.width, y = profileBg.Y(p.y), r = 6 * devicePixelRatio;
    g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(0, 0, x, pc.height); // ridden part dimmed
    g.strokeStyle = '#f2c14e'; g.lineWidth = 2 * devicePixelRatio; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, pc.height); g.stroke();
    g.fillStyle = '#fff'; g.beginPath(); g.arc(x, y, r, 0, 6.283); g.fill(); g.lineWidth = 2.5 * devicePixelRatio; g.strokeStyle = '#f2c14e'; g.stroke(); // rider: white with amber ring
  }
}

// ---------- frame loop ----------
const camPos = new THREE.Vector3(), camLook = new THREE.Vector3(), tmp = new THREE.Vector3(), fwd = new THREE.Vector3();
const camOff = new THREE.Vector3(), camLookOff = new THREE.Vector3(), camFwd = new THREE.Vector3(1, 0, 0), tmp2 = new THREE.Vector3(), tmp3 = new THREE.Vector3(), tmp4 = new THREE.Vector3();
const cadence = () => (powerW > 0 && !paused ? Math.min(98, 72 + powerW / 25) : 0);
const CAMS = { 1: [6.5, 2.4], 2: [3.6, 1.6], 3: [34, 20], 4: [0, 0] }; // 4 = side view
const frameMs = []; let last = performance.now(), acc = 0, hudT = 0, firstFrame = true, over33 = 0, worstRun = 0;
const bench = params.has('bench') ? { until: performance.now() + 1000 * +(params.get('bench') || 20), samples: [] } : null;
function frameLoop(now) {
  const dt = Math.min(0.25, (now - last) / 1000); frameMs.push(now - last); if (frameMs.length > 240) frameMs.shift();
  if (now - last > 33.4) { over33++; worstRun = Math.max(worstRun, over33); } else over33 = 0;
  if (bench && !firstFrame) bench.samples.push(now - last);
  last = now; acc += dt; while (acc >= 0.05) { step(0.05); acc -= 0.05; }
  // Render between simulation steps: extrapolate by the unconsumed accumulator so motion is smooth at any frame rate.
  const rs = Math.min(cur.len - 0.01, s + (paused ? 0 : v * acc));
  const p = sampleAt(cur, rs);
  const pa = sampleAt(cur, Math.max(0, rs - 5)), pb = sampleAt(cur, Math.min(cur.len, rs + 5)); // heading over ±5 m, no snapping at samples
  fwd.set(pb.x - pa.x, 0, pb.z - pa.z).normalize();
  const right = tmp.set(-fwd.z, 0, fwd.x);
  rider.position.set(p.x + right.x * 1.6, p.y + 0.06, p.z + right.z * 1.6); // keeps to the right lane
  rider.rotation.set(0, Math.atan2(-fwd.z, fwd.x), Math.atan(gradePct / 100));
  cyclist.update(dt, { cadenceRpm: cadence(), speedMps: v, stopped: paused && v < 0.3 });
  // Camera: smooth only the offset relative to the rider (in the rider's frame), so speed never makes it lag behind.
  const [back, up] = CAMS[camMode]; const rp = rider.position;
  const offF = camMode === 4 ? 0.3 : -back, offR = camMode === 4 ? -4.8 : 0, offU = camMode === 4 ? 1.1 : up;
  const lookF = camMode === 4 ? 0.3 : 6, lookU = camMode === 4 ? 0.85 : 1.2;
  const k = firstFrame ? 1 : 1 - Math.exp(-dt * 4);
  camOff.lerp(tmp2.set(offF, offU, offR), k); camLookOff.lerp(tmp3.set(lookF, lookU, 0), k);
  const hf = firstFrame ? 1 : 1 - Math.exp(-dt * 6); camFwd.lerp(fwd, hf).normalize(); firstFrame = false;
  const cr = tmp4.set(-camFwd.z, 0, camFwd.x);
  camPos.set(rp.x + camFwd.x * camOff.x + cr.x * camOff.z, rp.y + camOff.y, rp.z + camFwd.z * camOff.x + cr.z * camOff.z);
  camLook.set(rp.x + camFwd.x * camLookOff.x, rp.y + camLookOff.y, rp.z + camFwd.z * camLookOff.x);
  camera.position.copy(camPos); camera.lookAt(camLook);
  if (debugAt) { camera.position.set(debugAt[0] + 70, debugAt[1] + 45, debugAt[2] + 90); camera.lookAt(debugAt[0], debugAt[1], debugAt[2]); } // dev-only inspection camera
  sceneryUpdate(now / 1000, rider.position.x, rider.position.z); checkpointsUpdate(now / 1000, rider.position.x, rider.position.z);
  sun.position.copy(rider.position).addScaledVector(sunDir, 250); sun.target.position.copy(rider.position);
  renderer.render(scene, camera);
  if (now - hudT > 250) { // HUD at 4 Hz, never per frame
    hudT = now; updateHud(p);
    const sorted = [...frameMs].sort((a, b) => a - b); const avg = frameMs.reduce((a, b) => a + b, 0) / frameMs.length;
    const info = renderer.info.render;
    $('perf').textContent = `fps      ${(1000 / avg).toFixed(0)}\nframe ms avg ${avg.toFixed(1)}  p95 ${sorted[Math.floor(sorted.length * 0.95)].toFixed(1)}  max ${sorted[sorted.length - 1].toFixed(1)}\n>33 ms run (worst) ${worstRun}\ndraw calls ${info.calls}  tris ${(info.triangles / 1e6).toFixed(2)} M\npixels ${renderer.domElement.width}×${renderer.domElement.height}\nedge ${cur.id}${cur.rev ? ' (rev)' : ''}`;
  }
  if (bench && now > bench.until) {
    const a = bench.samples.sort((x, y) => x - y); const avg = a.reduce((x, y) => x + y, 0) / a.length;
    window.__bench = { frames: a.length, avgMs: +avg.toFixed(2), p95Ms: +a[Math.floor(a.length * 0.95)].toFixed(2), maxMs: +a[a.length - 1].toFixed(2), worstRunOver33: worstRun, calls: renderer.info.render.calls, trisM: +(renderer.info.render.triangles / 1e6).toFixed(2), px: [renderer.domElement.width, renderer.domElement.height] };
    console.log('BENCH', JSON.stringify(window.__bench)); bench.until = Infinity;
  }
  requestAnimationFrame(frameLoop);
}
requestAnimationFrame(frameLoop);
