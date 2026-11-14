// Ported from spikes/world (Phase 0c). JavaScript, not type-checked yet — see PROGRESS tech debt.
// Grand-Tour-style checkpoints (PLAN 16.15): inflatable arch, banner barriers, feather flags, road marking,
// and a cheering crowd whose waving/jumping intensifies as the rider approaches. All branding is VeloWorld's own.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const LABEL = { start: 'START · FINISH', climb: 'CLIMB START', summit: 'KOM · SUMMIT', sprint: 'SPRINT', 'sprint-end': 'SPRINT FINISH' };
const ROAD_TEXT = { start: 'START', climb: 'CLIMB', summit: 'KOM', sprint: 'SPRINT', 'sprint-end': 'FINISH' };

function textTexture(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}
const brandFont = (px) => `italic 800 ${px}px "Barlow Condensed", "Avenir Next Condensed", "Arial Narrow", sans-serif`;
const bannerTex = textTexture(1024, 128, (g, w, h) => {
  g.fillStyle = '#1e2633'; g.fillRect(0, 0, w, h); g.fillStyle = '#f2c14e'; g.fillRect(0, h - 10, w, 10); g.fillRect(0, 0, w, 6);
  g.font = brandFont(78); g.textBaseline = 'middle';
  for (let x = 20, i = 0; x < w; i++) { const t = i % 2 ? 'KEEP PEDALLING' : 'VELOWORLD'; g.fillStyle = i % 2 ? '#ffffff' : '#f2c14e'; g.fillText(t, x, h / 2 + 2); x += g.measureText(t).width + 50; }
});
bannerTex.wrapS = THREE.RepeatWrapping;
const flagTex = textTexture(128, 512, (g, w, h) => {
  const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#319eb1'); gr.addColorStop(1, '#1e2633'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
  g.save(); g.translate(w / 2 + 22, h / 2); g.rotate(-Math.PI / 2); g.font = brandFont(70); g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.fillText('VELOWORLD', 0, 0); g.restore();
  g.fillStyle = '#f2c14e'; g.fillRect(0, h - 40, w, 14);
});

function archFor(cp) {
  const W = cp.width, H = 6.2, R = 0.55; const g = new THREE.Group();
  const path = new THREE.CatmullRomCurve3([[-W / 2, -0.5], [-W / 2, H - 1.4], [-W / 2 + 0.6, H - 0.35], [-W / 2 + 1.6, H], [W / 2 - 1.6, H], [W / 2 - 0.6, H - 0.35], [W / 2, H - 1.4], [W / 2, -0.5]].map(([x, y]) => new THREE.Vector3(0, y, x)), false, 'centripetal');
  const tubeMat = new THREE.MeshStandardMaterial({ color: 0x1e2633, roughness: 0.55 });
  g.add(new THREE.Mesh(new THREE.TubeGeometry(path, 80, R, 16, false), tubeMat));
  const stripe = new THREE.MeshStandardMaterial({ color: 0xf2c14e, roughness: 0.5 });
  for (const s of [-1, 1]) { const band = new THREE.Mesh(new THREE.TorusGeometry(R * 1.02, 0.08, 8, 24), stripe); band.rotation.x = Math.PI / 2; band.position.set(0, 2.2, (s * W) / 2); g.add(band); }
  const label = textTexture(1024, 192, (gg, w, h) => {
    gg.fillStyle = '#1e2633'; gg.fillRect(0, 0, w, h); gg.fillStyle = '#f2c14e'; gg.fillRect(0, 0, w, 10); gg.fillRect(0, h - 10, w, 10);
    gg.textAlign = 'center'; gg.textBaseline = 'middle'; gg.font = brandFont(56); gg.fillStyle = '#f2c14e'; gg.fillText('VELOWORLD', w / 2, 52); gg.font = brandFont(84); gg.fillStyle = '#ffffff'; gg.fillText(LABEL[cp.kind] ?? 'CHECKPOINT', w / 2, 128);
  });
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(W - 3.6, (W - 3.6) * 0.19), new THREE.MeshStandardMaterial({ map: label, roughness: 0.6, side: THREE.DoubleSide }));
  // approach side (-x) carries the panel facing -x; the far side carries one facing +x. Single-sided so text never shows mirrored.
  panel.material.side = THREE.FrontSide; panel.position.set(-0.62, H - 0.05, 0); panel.rotation.y = -Math.PI / 2; g.add(panel);
  const back = panel.clone(); back.position.x = 0.62; back.rotation.y = Math.PI / 2; g.add(back);
  // painted road marking just before the arch
  const mark = textTexture(512, 128, (gg, w, h) => { gg.font = brandFont(110); gg.fillStyle = 'rgba(245,245,240,.92)'; gg.textAlign = 'center'; gg.textBaseline = 'middle'; gg.fillText(ROAD_TEXT[cp.kind] ?? '', w / 2, h / 2 + 6); });
  const road = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 1.05), new THREE.MeshStandardMaterial({ map: mark, transparent: true, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
  road.rotation.set(-Math.PI / 2, 0, -Math.PI / 2); road.position.set(-7, 0.09, 0); g.add(road);
  g.position.set(cp.x, cp.y, cp.z); g.rotation.y = -cp.heading; g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

function barriersFor(cp) {
  const panels = [], feet = [];
  // printed side faces the road on both sides (a banner seen from behind reads mirrored)
  for (const [ri, run] of cp.barriers.entries()) for (let k = 3; k < run.length; k += 3) {
    const a = new THREE.Vector3(run[k - 3], run[k - 2], run[k - 1]), b = new THREE.Vector3(run[k], run[k + 1], run[k + 2]); const len = a.distanceTo(b);
    const p = new THREE.PlaneGeometry(len, 1.0); const uv = p.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * (len / 5) + k * 0.13);
    p.rotateY(-Math.atan2(b.z - a.z, b.x - a.x) + (ri === 1 ? Math.PI : 0)).translate((a.x + b.x) / 2, (a.y + b.y) / 2 + 0.75, (a.z + b.z) / 2); panels.push(p);
    feet.push(new THREE.BoxGeometry(0.08, 0.3, 0.6).rotateY(-Math.atan2(b.z - a.z, b.x - a.x)).translate(a.x, a.y + 0.15, a.z));
  }
  const g = new THREE.Group();
  g.add(new THREE.Mesh(mergeGeometries(panels), new THREE.MeshStandardMaterial({ map: bannerTex, roughness: 0.7, side: THREE.DoubleSide })));
  g.add(new THREE.Mesh(mergeGeometries(feet), new THREE.MeshStandardMaterial({ color: 0x9aa0a6, roughness: 0.5 })));
  // feather flags at the barrier ends
  const flagGeo = new THREE.PlaneGeometry(0.9, 3.4, 1, 8); const pos = flagGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) { const y = pos.getY(i) / 3.4 + 0.5; pos.setX(i, pos.getX(i) + Math.sin(y * 2.2) * 0.25 * (pos.getX(i) > 0 ? 1 : 0.2)); }
  const flagMat = new THREE.MeshStandardMaterial({ map: flagTex, side: THREE.DoubleSide, roughness: 0.7 }), poleMat = new THREE.MeshStandardMaterial({ color: 0x2b2f36 });
  for (const run of cp.barriers) for (const idx of [0, Math.floor(run.length / 6) * 3, run.length - 3]) {
    const x = run[idx], y = run[idx + 1], z = run[idx + 2];
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 4.2), poleMat); pole.position.set(x, y + 2.1, z); g.add(pole);
    // printed face toward the approaching rider; flag hangs beside its pole
    const fl = new THREE.Mesh(flagGeo, flagMat); fl.rotation.y = Math.atan2(-Math.cos(cp.heading), -Math.sin(cp.heading));
    fl.position.set(x, y + 2.4, z).add(new THREE.Vector3(0.48, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), fl.rotation.y)); g.add(fl);
  }
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

// ---- crowd: varied spectators (poses, headwear, hair, clothes, kids) ----
const C = (arr) => arr.map((c) => new THREE.Color(c));
const SHIRTS = C([0xf2c14e, 0x319eb1, 0xd64541, 0xf4f4f2, 0x3fa36b, 0x3b6fd8, 0xe87fb0, 0xff8a3d, 0x8e44ad, 0x2c3e50]);
const TROUSERS = C([0x3b5b8a, 0x22252b, 0xb59f74, 0x6b6f76, 0xe8e4da, 0x4a5a3a]);
const SKINS = C([0xf1d3bc, 0xe0b593, 0xc68e6a, 0xa26a45, 0x7a4b2e]);
const HATS = C([0xf2c14e, 0x319eb1, 0xd64541, 0xf4f4f2, 0x1e2633, 0x3fa36b, 0xff8a3d]);
const HAIR = C([0x1b1612, 0x3b2a20, 0x6b4a2b, 0xd8b86a, 0xb5b5b5, 0x8a3b1f]);
const FLAGS = C([0xf2c14e, 0x319eb1, 0xd64541, 0xf4f4f2, 0x3fa36b, 0x3b6fd8, 0xff8a3d]);

function part(g, arm = 0) { // white vertex colour (tinted per instance) + arm tag for the shader
  g = g.index ? g.toNonIndexed() : g; g.deleteAttribute('uv'); const n = g.attributes.position.count;
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3)); g.setAttribute('aArm', new THREE.BufferAttribute(new Float32Array(n).fill(arm), 1)); return g;
}
const SH = 1.42, SZ = 0.2; // shoulder height and half-width; spectators face +x (the road)
const armUp = (side, tilt = 0.3) => part(new THREE.CapsuleGeometry(0.045, 0.5, 2, 6).translate(0, 0.3, 0).rotateX(side * tilt).translate(0, SH, side * SZ), side);
const armDown = (side) => part(new THREE.CapsuleGeometry(0.045, 0.5, 2, 6).translate(0, -0.3, 0).rotateX(-side * 0.12).translate(0, SH, side * SZ), 0);
const armFwd = (side, ang) => part(new THREE.CapsuleGeometry(0.045, 0.5, 2, 6).translate(0, -0.3, 0).rotateZ(ang).translate(0, SH, side * SZ), side);
const head = () => part(new THREE.SphereGeometry(0.11, 10, 8).translate(0, 1.62, 0));
// pose 0 wave both arms · 1 flag (right arm + stick + flag swing together) · 2 clap · 3 filming on a phone
const POSES = [
  { skin: () => mergeGeometries([head(), armUp(1), armUp(-1)]) },
  { skin: () => mergeGeometries([head(), armUp(1, 0.15), armDown(-1)]),
    extra: () => mergeGeometries([part(new THREE.CylinderGeometry(0.012, 0.012, 1.1, 5).translate(0, SH + 0.62 + 0.55, SZ + 0.1), 1)]),
    flag: () => part(new THREE.PlaneGeometry(0.75, 0.48, 6, 1).rotateY(Math.PI / 2).translate(0, SH + 1.45, SZ + 0.1 + 0.38), 1) },
  { skin: () => mergeGeometries([head(), armFwd(1, 1.15), armFwd(-1, 1.15)]) },
  { skin: () => mergeGeometries([head(), armFwd(1, 2.3), armDown(-1)]),
    extra: () => part(new THREE.BoxGeometry(0.02, 0.14, 0.08).translate(0, -0.6, 0).rotateZ(2.3).translate(0.02, SH, SZ), 1) },
];
function crowdMaterial(uniforms, pose) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, side: pose === 9 ? THREE.DoubleSide : THREE.FrontSide });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uniforms.uTime; sh.uniforms.uExcite = uniforms.uExcite;
    sh.vertexShader = `uniform float uTime; uniform float uExcite; attribute float aArm;\n#define POSE ${pose}\n` + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      float ph = fract(sin(dot(instanceMatrix[3].xz, vec2(12.9898, 78.233))) * 43758.5453) * 6.283;
      float ex = 0.25 + 0.75 * uExcite; float osc = 0.5 + 0.5 * sin(uTime * (6.0 + 3.0 * fract(ph)) + ph);
      vec3 sh0 = vec3(0.0, ${SH.toFixed(2)}, ${SZ.toFixed(2)} * sign(aArm));
      #if POSE == 0 || POSE == 1 || POSE == 9
        if (aArm != 0.0) { // sideways swing about the shoulder
          float a = aArm * (POSE == 0 ? 0.35 + 0.55 * ex * osc : -0.25 + 0.7 * ex * osc);
          vec3 d = transformed - sh0; float c = cos(a), s = sin(a); transformed = sh0 + vec3(d.x, c * d.y - s * d.z, s * d.y + c * d.z);
        }
      #elif POSE == 2
        if (aArm != 0.0) { // clap: arms sweep in and out about a vertical axis
          float a = aArm * (0.05 + 0.32 * (0.5 + 0.5 * sin(uTime * 11.0 + ph)) * ex);
          vec3 d = transformed - sh0; float c = cos(a), s = sin(a); transformed = sh0 + vec3(c * d.x + s * d.z, d.y, -s * d.x + c * d.z);
        }
      #elif POSE == 3
        if (aArm != 0.0) transformed.y += sin(uTime * 1.3 + ph) * 0.02; // steady hands, filming
      #endif
      #if POSE == 9
        transformed.x += sin(uTime * 7.0 + ph + transformed.z * 9.0) * 0.06 * (transformed.z - ${(SZ + 0.1).toFixed(2)}); // flag flutter
      #endif
      transformed.y += max(0.0, sin(uTime * 4.5 + ph * 3.0)) * 0.22 * ex * step(0.6, fract(ph * 1.7)); // some jump`);
  };
  return m;
}

export function buildCheckpoints(scene, bake) {
  const uniforms = { uTime: { value: 0 }, uExcite: { value: 0 } };
  for (const cp of bake.checkpoints) { scene.add(archFor(cp)); scene.add(barriersFor(cp)); }
  const crowdMeshes = [];
  const people = []; for (const cp of bake.checkpoints) for (let i = 0; i < cp.crowd.length; i += 6) people.push(cp.crowd.slice(i, i + 6));
  const hash = (i, k) => { const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return x - Math.floor(x); };
  // per-person look, deterministic from index
  const look = people.map((_, i) => {
    const r = hash(i, 1); const pose = r < 0.38 ? 0 : r < 0.58 ? 1 : r < 0.83 ? 2 : 3;
    const h = hash(i, 2); const headwear = h < 0.28 ? 'cap' : h < 0.4 ? 'sunhat' : h < 0.75 ? 'short' : h < 0.93 ? 'long' : 'bald';
    return { pose, headwear, kid: hash(i, 3) < 0.12, shirt: Math.floor(hash(i, 4) * SHIRTS.length), trousers: Math.floor(hash(i, 5) * TROUSERS.length), skin: Math.floor(hash(i, 6) * SKINS.length), hat: Math.floor(hash(i, 7) * HATS.length), hair: Math.floor(hash(i, 8) * HAIR.length), flag: Math.floor(hash(i, 9) * FLAGS.length) };
  });
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), Y = new THREE.Vector3(0, 1, 0);
  const matrixOf = (i) => { const [x, y, z, rot] = people[i]; const L = look[i]; const s = (L.kid ? 0.66 : 0.92 + hash(i, 10) * 0.16); return m4.compose(new THREE.Vector3(x, y - 0.3, z), q.setFromAxisAngle(Y, rot), new THREE.Vector3(s, s, s)).clone(); };
  const mats = new Map(); const matFor = (pose) => { if (!mats.has(pose)) mats.set(pose, crowdMaterial(uniforms, pose)); return mats.get(pose); };
  function add(geo, pose, idx, colorOf, shadow = true) {
    if (!idx.length) return; const m = new THREE.InstancedMesh(geo, matFor(pose), idx.length); crowdMeshes.push(m);
    idx.forEach((i, k) => { m.setMatrixAt(k, matrixOf(i)); m.setColorAt(k, colorOf(look[i], i)); }); m.castShadow = shadow; scene.add(m);
  }
  const all = people.map((_, i) => i);
  add(mergeGeometries([part(new THREE.CapsuleGeometry(0.075, 0.7, 2, 6).translate(0, 0.42, 0.09)), part(new THREE.CapsuleGeometry(0.075, 0.7, 2, 6).translate(0, 0.42, -0.09))]), -1, all, (L) => TROUSERS[L.trousers]);
  add(part(new THREE.CapsuleGeometry(0.17, 0.42, 3, 8).scale(0.75, 1, 1).translate(0, 1.15, 0)), -1, all, (L) => SHIRTS[L.shirt]);
  POSES.forEach((P, pose) => {
    const idx = all.filter((i) => look[i].pose === pose);
    add(P.skin(), pose, idx, (L) => SKINS[L.skin]);
    if (P.extra) add(P.extra(), pose, idx, () => new THREE.Color(pose === 3 ? 0x15171b : 0x6b5a45), false);
    if (P.flag) add(P.flag(), 9, idx, (L) => FLAGS[L.flag], false);
  });
  const hw = (k) => all.filter((i) => look[i].headwear === k);
  add(mergeGeometries([part(new THREE.SphereGeometry(0.122, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 1.64, 0)), part(new THREE.BoxGeometry(0.16, 0.012, 0.18).translate(0.13, 1.645, 0))]), -1, hw('cap'), (L) => HATS[L.hat], false);
  add(mergeGeometries([part(new THREE.SphereGeometry(0.12, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 1.65, 0)), part(new THREE.CylinderGeometry(0.24, 0.24, 0.012, 16).translate(0, 1.66, 0))]), -1, hw('sunhat'), (L) => (L.hat % 2 ? new THREE.Color(0xe9dcb8) : HATS[L.hat]), false);
  add(part(new THREE.SphereGeometry(0.118, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.6).translate(-0.01, 1.635, 0)), -1, hw('short'), (L) => HAIR[L.hair], false);
  add(mergeGeometries([part(new THREE.SphereGeometry(0.12, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.6).translate(-0.01, 1.635, 0)), part(new THREE.CapsuleGeometry(0.075, 0.18, 2, 6).scale(0.7, 1, 1.3).translate(-0.07, 1.5, 0))]), -1, hw('long'), (L) => HAIR[L.hair], false);

  return function update(t, rx, rz) {
    uniforms.uTime.value = t; let d = Infinity; for (const cp of bake.checkpoints) d = Math.min(d, Math.hypot(cp.x - rx, cp.z - rz));
    for (const m of crowdMeshes) m.visible = d < 600; // crowds are only drawn near a checkpoint (triangle budget)
    uniforms.uExcite.value = Math.max(0, Math.min(1, 1 - (d - 20) / 120)); // crowd gets louder (visually) as you approach
  };
}
