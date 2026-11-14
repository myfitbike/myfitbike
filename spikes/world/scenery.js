// Scenery renderer (spike): realistic-ish procedural trees with wind sway, and the PLAN 16.10 catalogue —
// lake, reeds, ducks, sheep, cows, rocks, bushes, wildflowers, hay bales, walls, fences, boats, clouds, birds.
// Everything is instanced or merged per kind so draw calls stay low.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

let seed = 1234; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const prep = (g) => { g = g.index ? g.toNonIndexed() : g; g.deleteAttribute('uv'); return g; };
function paint(g, hex, shade = null) { // vertex colours; optional fake ambient occlusion by height
  g = prep(g); const c = new THREE.Color(hex), p = g.attributes.position, a = new Float32Array(p.count * 3); g.computeBoundingBox();
  const { min, max } = g.boundingBox;
  for (let i = 0; i < p.count; i++) { const k = shade ? shade(p.getY(i), min.y, max.y, i) : 1; a.set([c.r * k, c.g * k, c.b * k], i * 3); }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g;
}
function jitter(g, amt) { // displace vertices consistently (shared positions move together) for organic shapes
  const p = g.attributes.position, map = new Map();
  for (let i = 0; i < p.count; i++) { const key = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`; if (!map.has(key)) map.set(key, 1 + (rnd() - 0.5) * 2 * amt); const k = map.get(key); p.setXYZ(i, p.getX(i) * k, p.getY(i) * (1 + (k - 1) * 0.6), p.getZ(i) * k); }
  g.computeVertexNormals(); return g;
}
const ao = (lo, hi) => (y, min, max) => lo + (hi - lo) * ((y - min) / (max - min || 1));

// ---- trees ----
function broadleaf(variant) {
  const parts = []; const h = 3.2 + rnd() * 1.2;
  parts.push(paint(new THREE.CylinderGeometry(0.16, 0.34, h, 7).translate(0, h / 2, 0), 0x4a3728, ao(0.6, 1)));
  for (let b = 0; b < 3; b++) { // visible limbs into the crown
    const a = (b / 3) * 6.283 + rnd(), len = 1.6 + rnd();
    const g = new THREE.CylinderGeometry(0.05, 0.11, len, 5).translate(0, len / 2, 0).rotateZ(0.7 + rnd() * 0.3).rotateY(a).translate(0, h - 0.6, 0);
    parts.push(paint(g, 0x4a3728));
  }
  const greens = [0x4f7a34, 0x5b8a3a, 0x46702f, 0x648f3f];
  const clumps = 8 + Math.floor(rnd() * 4);
  for (let i = 0; i < clumps; i++) { // leaf clumps on an irregular ellipsoid
    const a = rnd() * 6.283, el = (rnd() - 0.3) * 1.3, r = 1.6 + rnd() * 0.9;
    const cx = Math.cos(a) * Math.cos(el) * 1.9, cy = h + 1.6 + Math.sin(el) * 1.7, cz = Math.sin(a) * Math.cos(el) * 1.9;
    const g = jitter(new THREE.IcosahedronGeometry(r, 1), 0.22).translate(cx, cy, cz);
    parts.push(paint(g, greens[(i + variant) % 4], (y) => 0.55 + 0.55 * Math.min(1, Math.max(0, (y - h) / 4.2))));
  }
  return mergeGeometries(parts);
}
function conifer(variant) {
  const parts = []; const tiers = 7 + variant, H = 11 + variant * 1.5;
  parts.push(paint(new THREE.CylinderGeometry(0.12, 0.3, H * 0.5, 6).translate(0, H * 0.25, 0), 0x4a3426));
  for (let t = 0; t < tiers; t++) {
    const f = t / tiers, r = 2.6 * (1 - f * 0.85) + 0.3, hh = 2.4 - f * 0.8, y = 1.6 + f * (H - 3);
    const g = jitter(new THREE.ConeGeometry(r, hh, 9, 2, true), 0.18).translate(0, y + hh / 2, 0);
    parts.push(paint(g, t % 2 ? 0x2c4f30 : 0x30573a, (yy, min, max) => 0.55 + 0.5 * ((yy - min) / (max - min || 1))));
  }
  return mergeGeometries(parts);
}
function swayMaterial(uniforms) { // wind: tops move, trunks stay; phase from instance position so trees don't move in lockstep
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uniforms.uTime;
    sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      float ph = instanceMatrix[3].x * 0.07 + instanceMatrix[3].z * 0.05;
      float bend = max(0.0, position.y - 2.5) * 0.018;
      transformed.x += sin(uTime * 1.1 + ph) * bend; transformed.z += cos(uTime * 0.9 + ph * 1.3) * bend * 0.6;`);
  };
  return m;
}

// Instances with distance LOD: within `radius` of the rider they use `geo`, beyond it `farGeo` (or are skipped).
// Matrices are precomputed once; repartitioning copies them, so it is cheap enough to run twice a second.
const lodGroups = [];
function instanced(geo, mat, data, stride, setter, shadow = true, lod = null) {
  const n = data.length / stride; const mats = new Float32Array(n * 16), cols = new Float32Array(n * 3), xz = new Float32Array(n * 2); let hasColor = false;
  const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), pos = new THREE.Vector3(), sc = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0), col = new THREE.Color(1, 1, 1);
  for (let i = 0; i < n; i++) { col.setRGB(1, 1, 1); const o = setter(data, i * stride, pos, sc, col); hasColor ||= !!o.color; mtx.compose(pos, q.setFromAxisAngle(Y, o.rot ?? 0), sc); mtx.toArray(mats, i * 16); cols.set([col.r, col.g, col.b], i * 3); xz[i * 2] = pos.x; xz[i * 2 + 1] = pos.z; }
  const mk = (g) => { const m = new THREE.InstancedMesh(g, mat, Math.max(1, n)); m.castShadow = shadow; m.receiveShadow = true; if (hasColor) m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, n) * 3), 3); m.frustumCulled = false; return m; };
  const near = mk(geo), far = lod?.farGeo ? mk(lod.farGeo) : null; if (far) far.castShadow = false;
  const grp = { n, mats, cols, xz, near, far, r2: lod ? lod.radius ** 2 : Infinity, hasColor };
  const fill = (m, idx, k, i) => { m.instanceMatrix.array.set(mats.subarray(i * 16, i * 16 + 16), k * 16); if (hasColor) m.instanceColor.array.set(cols.subarray(i * 3, i * 3 + 3), k * 3); };
  grp.update = (x, z) => {
    let a = 0, b = 0;
    for (let i = 0; i < n; i++) { const dx = xz[i * 2] - x, dz = xz[i * 2 + 1] - z; if (dx * dx + dz * dz < grp.r2) fill(near, 0, a++, i); else if (far) fill(far, 0, b++, i); }
    near.count = a; near.instanceMatrix.needsUpdate = true; if (hasColor) near.instanceColor.needsUpdate = true;
    if (far) { far.count = b; far.instanceMatrix.needsUpdate = true; if (hasColor) far.instanceColor.needsUpdate = true; }
  };
  grp.update(0, 0); lodGroups.push(grp);
  const g = new THREE.Group(); g.add(near); if (far) g.add(far); return g;
}

export function buildScenery(scene, bake, waterMat) {
  const uniforms = { uTime: { value: 0 } };
  const flat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
  const T = bake.trees; const variants = [broadleaf(0), broadleaf(1), broadleaf(2), conifer(0), conifer(1), conifer(2)];
  const groups = variants.map(() => []);
  for (let i = 0; i < T.length; i += 6) groups[T[i + 5] * 3 + (Math.floor(T[i] * 7 + T[i + 2] * 3) % 3 + 3) % 3].push(T[i], T[i + 1], T[i + 2], T[i + 3], T[i + 4]);
  const treeMat = swayMaterial(uniforms);
  const farBroad = mergeGeometries([paint(new THREE.CylinderGeometry(0.2, 0.3, 4, 4).translate(0, 2, 0), 0x4a3728), paint(jitter(new THREE.IcosahedronGeometry(3.1, 0), 0.15).scale(1.1, 0.95, 1.1).translate(0, 6, 0), 0x52793a, ao(0.6, 1.05))]);
  const farCone = mergeGeometries([paint(new THREE.CylinderGeometry(0.15, 0.3, 3, 4).translate(0, 1.5, 0), 0x4a3426), paint(new THREE.ConeGeometry(2.7, 10.5, 6).translate(0, 7.3, 0), 0x2e5334, ao(0.6, 1.05))]);
  variants.forEach((g, vi) => scene.add(instanced(g, treeMat, groups[vi], 5, (d, o, p, s, c) => {
    p.set(d[o], d[o + 1] - 0.3, d[o + 2]); const k = d[o + 3] * (vi >= 3 ? 1.05 : 1.0); s.set(k, k * (0.9 + ((o * 7) % 5) * 0.05), k);
    c.setHSL(0.27 + ((o * 13) % 9) * 0.006, 0.22, 0.45 + ((o * 7) % 10) * 0.02).multiplyScalar(2.1); return { rot: d[o + 4], color: true };
  }, true, { radius: 260, farGeo: vi >= 3 ? farCone : farBroad })));

  const P = bake.props;
  const sheep = mergeGeometries([paint(jitter(new THREE.IcosahedronGeometry(0.5, 2), 0.12).scale(1.35, 0.85, 0.9).translate(0, 0.75, 0), 0xe9e4d6, ao(0.75, 1)), paint(new THREE.SphereGeometry(0.18, 10, 8).scale(1.3, 1, 0.9).translate(0.72, 0.92, 0), 0x2a2522), ...[[0.38, 0.2], [0.38, -0.2], [-0.38, 0.2], [-0.38, -0.2]].map(([x, z]) => paint(new THREE.CylinderGeometry(0.05, 0.05, 0.5, 5).translate(x, 0.25, z), 0x2a2522))]);
  scene.add(instanced(sheep, flat, P.sheep, 4, (d, o, p, s) => { p.set(d[o], d[o + 1], d[o + 2]); s.setScalar(0.9 + ((o * 3) % 4) * 0.06); return { rot: d[o + 3] }; }));
  const cow = mergeGeometries([paint(new THREE.CapsuleGeometry(0.45, 1.1, 4, 10).rotateZ(Math.PI / 2).translate(0, 1.15, 0), 0x6b4a33, ao(0.8, 1)), paint(new THREE.BoxGeometry(0.5, 0.45, 0.4).translate(1.05, 1.3, 0), 0x5a3d2a), paint(new THREE.BoxGeometry(0.2, 0.18, 0.3).translate(1.33, 1.2, 0), 0xd9b8a0), ...[[0.5, 0.25], [0.5, -0.25], [-0.5, 0.25], [-0.5, -0.25]].map(([x, z]) => paint(new THREE.CylinderGeometry(0.09, 0.08, 0.85, 6).translate(x, 0.43, z), 0x4a3324))]);
  scene.add(instanced(cow, flat, P.cows, 4, (d, o, p, s) => { p.set(d[o], d[o + 1], d[o + 2]); s.setScalar(1); return { rot: d[o + 3] }; }));
  const rock = paint(jitter(new THREE.DodecahedronGeometry(1, 0), 0.28).scale(1, 0.6, 0.85), 0x8a857c, ao(0.65, 1));
  scene.add(instanced(rock, flat, P.rocks, 5, (d, o, p, s, c) => { p.set(d[o], d[o + 1] - d[o + 3] * 0.2, d[o + 2]); s.setScalar(d[o + 3]); c.setHSL(0.1, 0.06, 0.45 + ((o * 11) % 7) * 0.05).multiplyScalar(2); return { rot: d[o + 4], color: true }; }, true, { radius: 700 }));
  const bush = mergeGeometries([0, 1, 2].map((i) => paint(jitter(new THREE.IcosahedronGeometry(0.7 - i * 0.12, 0), 0.25).translate((i - 1) * 0.55, 0.55 + i * 0.1, (i % 2) * 0.3), [0x4b6e30, 0x557a35, 0x3f6229][i], ao(0.55, 1.05))));
  scene.add(instanced(bush, swayMaterial(uniforms), P.bushes, 5, (d, o, p, s, c) => { p.set(d[o], d[o + 1] - 0.15, d[o + 2]); s.setScalar(d[o + 3]); c.setHSL(0.25, 0.25, 0.42 + ((o * 7) % 9) * 0.025).multiplyScalar(2.1); return { rot: d[o + 4], color: true }; }, false, { radius: 650 }));
  const flower = mergeGeometries([paint(new THREE.BoxGeometry(0.02, 0.35, 0.02).translate(0, 0.17, 0), 0x3f6a2a), paint(new THREE.OctahedronGeometry(0.07, 0).scale(1, 0.5, 1).translate(0, 0.37, 0), 0xffffff)]);
  const FLOWER = [0xf2d24b, 0xf4f1ea, 0xa67ad8, 0xe2574c];
  scene.add(instanced(flower, flat, P.flowers, 4, (d, o, p, s, c) => { p.set(d[o], d[o + 1], d[o + 2]); s.setScalar(0.8 + ((o * 5) % 6) * 0.1); c.set(FLOWER[d[o + 3]]); return { rot: o, color: true }; }, false, { radius: 280 }));
  const bale = paint(new THREE.CylinderGeometry(0.75, 0.75, 1.2, 16).rotateX(Math.PI / 2).translate(0, 0.72, 0), 0xc9a55a, ao(0.8, 1.05));
  scene.add(instanced(bale, flat, P.bales, 4, (d, o, p, s) => { p.set(d[o], d[o + 1], d[o + 2]); s.setScalar(1); return { rot: d[o + 3] }; }));
  const reed = mergeGeometries([0, 1, 2, 3, 4].map((i) => paint(new THREE.ConeGeometry(0.03, 1.6 + (i % 3) * 0.4, 4).translate((i - 2) * 0.12, 0.8 + (i % 3) * 0.2, (i % 2) * 0.1), i === 2 ? 0x8b7a4a : 0x6d8a3c)));
  scene.add(instanced(reed, swayMaterial(uniforms), P.reeds, 4, (d, o, p, s) => { p.set(d[o], d[o + 1], d[o + 2]); s.setScalar(d[o + 3]); return { rot: o }; }, false));
  const duck = mergeGeometries([paint(new THREE.SphereGeometry(0.16, 10, 8).scale(1.5, 0.8, 1), 0x6b5a45), paint(new THREE.SphereGeometry(0.08, 8, 6).translate(0.2, 0.14, 0), 0x2f6b3a)]);
  scene.add(instanced(duck, flat, P.ducks, 4, (d, o, p, s) => { p.set(d[o], d[o + 1] + 0.05, d[o + 2]); s.setScalar(1); return { rot: d[o + 3] }; }, false));
  const BOAT = [0xf4f1ea, 0xc0392b, 0x2a6f9a];
  P.boats.length && scene.add(instanced(mergeGeometries([paint(new THREE.CylinderGeometry(1.2, 0.6, 7, 8, 1).rotateZ(Math.PI / 2).scale(1, 0.55, 1).translate(0, 0.2, 0), 0xffffff), paint(new THREE.BoxGeometry(2, 1.2, 1.4).translate(-0.6, 1.1, 0), 0xe8e4da), paint(new THREE.CylinderGeometry(0.05, 0.05, 6).translate(0.6, 3.3, 0), 0x6b5a45)]), flat, P.boats, 5, (d, o, p, s, c) => { p.set(d[o], d[o + 1], d[o + 2]); s.setScalar(1); c.set(BOAT[d[o + 4]]); return { rot: d[o + 3], color: true }; }));

  // walls and fences: merged geometry following the terrain
  const wallParts = [];
  for (const run of P.walls) for (let k = 3; k < run.length; k += 3) {
    const a = new THREE.Vector3(run[k - 3], run[k - 2], run[k - 1]), b = new THREE.Vector3(run[k], run[k + 1], run[k + 2]); const len = a.distanceTo(b) + 0.05;
    const g = new THREE.BoxGeometry(len, 0.9 + rnd() * 0.15, 0.55); jitter(g, 0.05);
    g.rotateY(-Math.atan2(b.z - a.z, b.x - a.x)).translate((a.x + b.x) / 2, (a.y + b.y) / 2 + 0.35, (a.z + b.z) / 2);
    wallParts.push(paint(g, 0x8f8778, ao(0.7, 1)));
  }
  for (const run of P.fences) for (let k = 0; k < run.length; k += 3) {
    const x = run[k], y = run[k + 1], z = run[k + 2]; if ((k / 3) % 3 === 0) wallParts.push(paint(new THREE.BoxGeometry(0.12, 1.25, 0.12).translate(x, y + 0.55, z), 0x6e5a42));
    if (k >= 3) { const a = new THREE.Vector3(run[k - 3], run[k - 2], run[k - 1]), b = new THREE.Vector3(x, y, z); const len = a.distanceTo(b);
      for (const hgt of [0.55, 1.0]) wallParts.push(paint(new THREE.BoxGeometry(len, 0.08, 0.05).rotateY(-Math.atan2(b.z - a.z, b.x - a.x)).translate((a.x + b.x) / 2, (a.y + b.y) / 2 + hgt, (a.z + b.z) / 2), 0x8a7356)); }
  }
  if (wallParts.length) { const m = new THREE.Mesh(mergeGeometries(wallParts), flat); m.castShadow = m.receiveShadow = true; scene.add(m); }

  for (const l of bake.lakes) { const w = new THREE.Mesh(new THREE.CircleGeometry(l.r * 1.45, 64).rotateX(-Math.PI / 2), waterMat); w.position.set(l.x, l.level, l.z); scene.add(w); }

  // sky life: clouds and circling birds
  const cloudMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, fog: false, transparent: true, opacity: 0.92 });
  const cloudParts = [];
  for (let c = 0; c < 14; c++) { const cx = (rnd() - 0.5) * 9000, cz = (rnd() - 0.5) * 9000 - 1500, cy = 650 + rnd() * 300; for (let i = 0; i < 7; i++) cloudParts.push(prep(new THREE.IcosahedronGeometry(60 + rnd() * 70, 2).scale(1.6, 0.55, 1).translate(cx + (rnd() - 0.5) * 260, cy + rnd() * 30, cz + (rnd() - 0.5) * 120))); }
  scene.add(new THREE.Mesh(mergeGeometries(cloudParts), cloudMat));
  const birdGeo = new THREE.BufferGeometry(); birdGeo.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, 0, -0.3, 0, 0, 0, 0, 0, 0, -0.5, 0, 0.3], 3));
  const birdMat = new THREE.LineBasicMaterial({ color: 0x1f242b });
  const flocks = [0, 1, 2].map((f) => { const g = new THREE.Group(); for (let i = 0; i < 7; i++) { const b = new THREE.LineSegments(birdGeo, birdMat); b.position.set(-i * 1.4, (i % 2) * 0.5, (i % 2 ? 1 : -1) * i * 0.9); b.scale.setScalar(1.6); g.add(b); } scene.add(g); return { g, cx: (rnd() - 0.5) * 2000, cz: (rnd() - 0.5) * 1200, r: 120 + rnd() * 200, y: 45 + rnd() * 40, sp: 0.06 + rnd() * 0.05 }; });

  let lastLod = -1;
  return function update(t, rx = 0, rz = 0) {
    uniforms.uTime.value = t;
    if (t - lastLod > 0.5) { lastLod = t; for (const g of lodGroups) if (g.r2 !== Infinity) g.update(rx, rz); }
    for (const f of flocks) { const a = t * f.sp; f.g.position.set(f.cx + Math.cos(a) * f.r, f.y + Math.sin(t * 0.7) * 3, f.cz + Math.sin(a) * f.r); f.g.rotation.y = -a - Math.PI / 2; f.g.children.forEach((b, i) => { b.scale.y = 1 + Math.sin(t * 9 + i) * 0.8; }); }
  };
}
