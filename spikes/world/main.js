// Phase 0b/0c spike (throwaway): render the bake from build.mjs and ride it with keyboard power.
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeNoise2, fbm } from './lib/core.mjs';
import { createRider } from './rider.js';
const cn = makeNoise2(99), cn2 = makeNoise2(100);

const params = new URLSearchParams(location.search);
let camModeInit = 1;
const bake = await (await fetch('./out/slice.json')).json();
const loadF32 = async (f) => new Float32Array(await (await fetch(`./out/${f}`)).arrayBuffer());
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
const conifer = mergeGeometries([colored(new THREE.CylinderGeometry(0.18, 0.28, 2.4, 5).translate(0, 1.2, 0), 0x5a4030), colored(new THREE.ConeGeometry(2.3, 5.5, 7).translate(0, 4.6, 0), 0x2f5233), colored(new THREE.ConeGeometry(1.6, 4.2, 7).translate(0, 7.4, 0), 0x355c39)]);
const broadleaf = mergeGeometries([colored(new THREE.CylinderGeometry(0.22, 0.32, 3.2, 5).translate(0, 1.6, 0), 0x5e4532), colored(new THREE.IcosahedronGeometry(2.9, 1).scale(1, 0.85, 1).translate(0, 5.4, 0), 0x4f7a34)]);
const treeMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true });
const T = bake.trees, counts = [0, 0]; for (let i = 0; i < T.length; i += 6) counts[T[i + 5]]++;
const treeMeshes = [broadleaf, conifer].map((g, type) => { const m = new THREE.InstancedMesh(g, treeMat, counts[type]); m.castShadow = true; m.receiveShadow = true; m.count = 0; return m; });
const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), tint = new THREE.Color(), Y = new THREE.Vector3(0, 1, 0);
for (let i = 0; i < T.length; i += 6) {
  const m = treeMeshes[T[i + 5]], s = T[i + 3] * (T[i + 5] ? 1.35 : 1.15);
  mtx.compose(new THREE.Vector3(T[i], T[i + 1] - 0.3, T[i + 2]), q.setFromAxisAngle(Y, T[i + 4]), new THREE.Vector3(s, s * (0.9 + (i % 7) * 0.04), s));
  m.setMatrixAt(m.count, mtx); m.setColorAt(m.count, tint.setHSL(0.25 + ((i * 13) % 10) * 0.006, 0.25, 0.42 + ((i * 7) % 10) * 0.025).multiplyScalar(2.2)); m.count++;
}
scene.add(...treeMeshes);

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
const cyclist = createRider(); const rider = cyclist.group; scene.add(rider);

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
let powerW = +(params.get('power') || 200), v = 0, ridden = 0, gradePct = 0;
const M = 85, G = 9.81, CRR = 0.004, CDA = 0.32, EFF = 0.975;
function step(dt) {
  const p0 = sampleAt(cur, s), p1 = sampleAt(cur, Math.min(cur.len, s + 10)); const run = Math.hypot(p1.x - p0.x, p1.z - p0.z);
  gradePct = run > 0.5 ? ((p1.y - p0.y) / run) * 100 : gradePct;
  const th = Math.atan(gradePct / 100), rho = 1.225 * Math.exp(-p0.y / 8434);
  const a = (powerW * EFF / Math.max(v, 0.5) - M * G * Math.sin(th) - M * G * Math.cos(th) * CRR - 0.5 * rho * CDA * v * v) / M;
  v = Math.min(25, Math.max(0, v + a * dt)); s += v * dt; ridden += v * dt;
  if (s >= cur.len) { s -= cur.len; const was = cur.id; cur = nextEdge(); if (was === 'e-north') spurArmed = false; }
}

// ---------- input ----------
let camMode = camModeInit;
addEventListener('keydown', (e) => {
  if (e.key === 'ArrowUp') powerW = Math.min(1500, powerW + (e.shiftKey ? 50 : 10));
  if (e.key === 'ArrowDown') powerW = Math.max(0, powerW - (e.shiftKey ? 50 : 10));
  if ('1234'.includes(e.key)) camMode = +e.key;
  if (e.key === 'h' || e.key === 'H') for (const id of ['hud', 'perf', 'help']) document.getElementById(id).hidden ^= 1;
});

// ---------- frame loop ----------
const $ = (id) => document.getElementById(id);
const camPos = new THREE.Vector3(), camLook = new THREE.Vector3(), tmp = new THREE.Vector3(), fwd = new THREE.Vector3();
const CAMS = { 1: [6.5, 2.4], 2: [3.6, 1.6], 3: [34, 20], 4: [0, 0] }; // 4 = side view
const frameMs = []; let last = performance.now(), acc = 0, hudT = 0, firstFrame = true, over33 = 0, worstRun = 0;
const bench = params.has('bench') ? { until: performance.now() + 1000 * +(params.get('bench') || 20), samples: [] } : null;
function frameLoop(now) {
  const dt = Math.min(0.25, (now - last) / 1000); frameMs.push(now - last); if (frameMs.length > 240) frameMs.shift();
  if (now - last > 33.4) { over33++; worstRun = Math.max(worstRun, over33); } else over33 = 0;
  if (bench && !firstFrame) bench.samples.push(now - last);
  last = now; acc += dt; while (acc >= 0.05) { step(0.05); acc -= 0.05; }
  const p = sampleAt(cur, s); fwd.set(p.dx, 0, p.dz).normalize();
  const right = tmp.set(-fwd.z, 0, fwd.x);
  rider.position.set(p.x + right.x * 1.6, p.y + 0.06, p.z + right.z * 1.6); // keeps to the right lane
  rider.rotation.set(0, Math.atan2(-fwd.z, fwd.x), Math.atan(gradePct / 100));
  cyclist.update(dt, { cadenceRpm: powerW > 0 && v > 0.5 ? Math.min(98, 72 + powerW / 25) : 0, speedMps: v });
  const [back, up] = CAMS[camMode]; const rp = rider.position;
  const want = camMode === 4 ? new THREE.Vector3(rp.x - right.x * 4.6 + fwd.x * 0.2, rp.y + 1.1, rp.z - right.z * 4.6 + fwd.z * 0.2) : new THREE.Vector3(rp.x - fwd.x * back, rp.y + up, rp.z - fwd.z * back);
  const lookAt = camMode === 4 ? new THREE.Vector3(rp.x, rp.y + 0.8, rp.z) : new THREE.Vector3(rp.x + fwd.x * 6, rp.y + 1.2, rp.z + fwd.z * 6);
  const k = firstFrame ? 1 : 1 - Math.exp(-dt * 3.5); camPos.lerp(want, k); camLook.lerp(lookAt, k); firstFrame = false; // spring-damped camera
  camera.position.copy(camPos); camera.lookAt(camLook);
  sun.position.copy(rider.position).addScaledVector(sunDir, 250); sun.target.position.copy(rider.position);
  renderer.render(scene, camera);
  if (now - hudT > 250) { // HUD at 4 Hz, never per frame
    hudT = now; $('hPower').textContent = powerW; $('hSpeed').textContent = (v * 3.6).toFixed(1); $('hGrade').textContent = gradePct.toFixed(1);
    $('hDist').textContent = (ridden / 1000).toFixed(2); $('hElev').textContent = p.y.toFixed(0);
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
