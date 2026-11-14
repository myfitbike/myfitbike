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

// ---- crowd ----
const SHIRTS = [0xf2c14e, 0x319eb1, 0xd64541, 0xf4f4f2, 0x3fa36b, 0x3b6fd8, 0xe87fb0, 0xff8a3d].map((c) => new THREE.Color(c));
const SKINS = [0xf1d3bc, 0xe0b593, 0xc68e6a, 0xa26a45, 0x7a4b2e].map((c) => new THREE.Color(c));
function withColor(g, hex, arm = 0) {
  g = g.index ? g.toNonIndexed() : g; g.deleteAttribute('uv'); const n = g.attributes.position.count; const c = new THREE.Color(hex);
  const col = new Float32Array(n * 3), a = new Float32Array(n).fill(arm); for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setAttribute('aArm', new THREE.BufferAttribute(a, 1)); return g;
}
function cheerMaterial(uniforms) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uniforms.uTime; sh.uniforms.uExcite = uniforms.uExcite;
    sh.vertexShader = 'uniform float uTime; uniform float uExcite; attribute float aArm;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      float ph = fract(sin(dot(instanceMatrix[3].xz, vec2(12.9898, 78.233))) * 43758.5453) * 6.283;
      float ex = 0.25 + 0.75 * uExcite;
      if (aArm != 0.0) { // wave arms about the shoulder, sideways
        vec3 sh0 = vec3(0.0, 1.42, 0.2 * aArm); vec3 d = transformed - sh0;
        float a = aArm * (0.35 + 0.55 * ex * (0.5 + 0.5 * sin(uTime * (6.0 + 3.0 * fract(ph)) + ph)));
        float c = cos(a), s = sin(a); transformed = sh0 + vec3(d.x, c * d.y - s * d.z, s * d.y + c * d.z);
      }
      transformed.y += max(0.0, sin(uTime * 4.5 + ph * 3.0)) * 0.22 * ex * step(0.55, fract(ph * 1.7)); // some jump`);
  };
  return m;
}

export function buildCheckpoints(scene, bake) {
  const uniforms = { uTime: { value: 0 }, uExcite: { value: 0 } };
  for (const cp of bake.checkpoints) { scene.add(archFor(cp)); scene.add(barriersFor(cp)); }
  const body = mergeGeometries([
    withColor(new THREE.CapsuleGeometry(0.075, 0.7, 2, 6).translate(0, 0.42, 0.09), 0x3a3f48), withColor(new THREE.CapsuleGeometry(0.075, 0.7, 2, 6).translate(0, 0.42, -0.09), 0x3a3f48),
    withColor(new THREE.CapsuleGeometry(0.17, 0.42, 3, 8).scale(0.75, 1, 1).translate(0, 1.15, 0), 0xffffff),
  ]);
  const skin = mergeGeometries([
    withColor(new THREE.SphereGeometry(0.11, 10, 8).translate(0, 1.62, 0), 0xffffff),
    withColor(new THREE.CapsuleGeometry(0.045, 0.5, 2, 6).translate(0, 0.3, 0).rotateX(0.3).translate(0, 1.42, 0.2), 0xffffff, 1),
    withColor(new THREE.CapsuleGeometry(0.045, 0.5, 2, 6).translate(0, 0.3, 0).rotateX(-0.3).translate(0, 1.42, -0.2), 0xffffff, -1),
  ]);
  const people = []; for (const cp of bake.checkpoints) for (let i = 0; i < cp.crowd.length; i += 6) people.push(cp.crowd.slice(i, i + 6));
  const mat = cheerMaterial(uniforms);
  const bodies = new THREE.InstancedMesh(body, mat, people.length), heads = new THREE.InstancedMesh(skin, mat, people.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), Y = new THREE.Vector3(0, 1, 0);
  people.forEach(([x, y, z, rot, shirt], i) => {
    const s = 0.92 + ((i * 37) % 17) / 100; m4.compose(new THREE.Vector3(x, y - 0.3, z), q.setFromAxisAngle(Y, rot), new THREE.Vector3(s, s, s));
    bodies.setMatrixAt(i, m4); heads.setMatrixAt(i, m4); bodies.setColorAt(i, SHIRTS[shirt]); heads.setColorAt(i, SKINS[(i * 7) % SKINS.length]);
  });
  bodies.castShadow = heads.castShadow = true; scene.add(bodies, heads);
  return function update(t, rx, rz) {
    uniforms.uTime.value = t; let d = Infinity; for (const cp of bake.checkpoints) d = Math.min(d, Math.hypot(cp.x - rx, cp.z - rz));
    uniforms.uExcite.value = Math.max(0, Math.min(1, 1 - (d - 20) / 120)); // crowd gets louder (visually) as you approach
  };
}
