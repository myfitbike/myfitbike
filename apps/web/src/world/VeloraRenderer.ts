// Velora 3D renderer (plan 7.4). three.js directly; the frame loop never goes through React.
// Streams baked 500 m terrain chunks around the rider (≤ 1 GPU upload per frame), draws the far mesh for the
// skyline, roads, water, houses, landmarks, scenery (LOD), checkpoints with crowds and graffiti, the rider and
// ghost/pacer riders. Cameras 1–6 are spring-damped. Quality presets + dynamic resolution keep the frame budget.
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { sampleWorld, type BakeManifest, type RouteProfile, type Scenery, type World } from '@veloworld/world';
import { createRider } from './rider.js';
import { buildScenery } from './scenery.js';
import { buildCheckpoints } from './checkpoints.js';
import { buildGraffiti } from './graffiti.js';

export type Quality = 'low' | 'medium' | 'high' | 'ultra';
const QUALITY: Record<Quality, { scale: number; shadows: number; fog: number; far: number; dpr: number }> = {
  low: { scale: 0.75, shadows: 0, fog: 0.00032, far: 6000, dpr: 1 }, medium: { scale: 0.9, shadows: 1024, fog: 0.00026, far: 9000, dpr: 1.5 },
  high: { scale: 1, shadows: 2048, fog: 0.00021, far: 12000, dpr: 2 }, ultra: { scale: 1, shadows: 4096, fog: 0.00018, far: 16000, dpr: 2 },
};
export type RiderState = { x: number; z: number; y: number; headingRad: number; speedMps: number; cadenceRpm: number; gradePct: number; stopped: boolean; ghosts: { d: number }[]; pacers: { d: number }[] };
type Avatar = Record<string, string>;
const hex = (s: string) => parseInt(s.replace('#', ''), 16);
const CAMS: Record<number, { back: number; up: number; look: number; side?: number; fp?: boolean; top?: boolean }> = { 1: { back: 6.5, up: 2.4, look: 6 }, 2: { back: 3.6, up: 1.6, look: 6 }, 3: { back: -0.35, up: 1.45, look: 20, fp: true }, 4: { back: -0.3, up: 1.1, look: 0.3, side: -4.8 }, 5: { back: 34, up: 20, look: 10 }, 6: { back: 0.01, up: 90, look: 0.02, top: true } };

export class VeloraRenderer {
  readonly renderer: THREE.WebGLRenderer; private scene = new THREE.Scene(); private camera: THREE.PerspectiveCamera;
  private sun = new THREE.DirectionalLight(0xfff1dc, 2.6); private sunDir = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(56), THREE.MathUtils.degToRad(215));
  private manifest!: BakeManifest; private chunks = new Map<string, THREE.Mesh | 'loading'>(); private queue: { key: string; mesh: THREE.Mesh }[] = [];
  private terrainMat!: THREE.MeshStandardMaterial; private waterMat!: THREE.MeshStandardMaterial; private detail!: THREE.Texture;
  private rider!: ReturnType<typeof createRider>; private ghosts: ReturnType<typeof createRider>[] = []; private pacers: ReturnType<typeof createRider>[] = [];
  private sceneryUpdate: (t: number, x: number, z: number) => void = () => {}; private checkpointsUpdate: (t: number, x: number, z: number) => void = () => {};
  private turbines: THREE.Object3D[] = []; private route: RouteProfile | null = null;
  private camPos = new THREE.Vector3(); private camLook = new THREE.Vector3(); private camOff = new THREE.Vector3(); private camLookOff = new THREE.Vector3(); private camFwd = new THREE.Vector3(1, 0, 0); private first = true;
  cameraMode = 1; quality: Quality; private resScale = 1; private slowS = 0; private fastS = 0;
  stats = { fps: 0, frameMs: 0, calls: 0, trisM: 0, chunks: 0, resScale: 1 }; private frameTimes: number[] = [];
  onContextLost: () => void = () => {};

  constructor(private canvas: HTMLCanvasElement, private world: World, opts: { quality: Quality; avatar: Avatar; riderName: string; country: string | null; base: string }) {
    this.quality = opts.quality; const Q = QUALITY[opts.quality];
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: opts.quality !== 'low', powerPreference: 'high-performance' });
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 0.6; this.renderer.shadowMap.enabled = Q.shadows > 0; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.camera = new THREE.PerspectiveCamera(62, 1, 0.3, Q.far); this.resize();
    canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.onContextLost(); }); // plan 7.4: fall back to 2D, the ride keeps going
    this.base = opts.base; this.opts = opts;
  }
  routeHint: { x: number[]; z: number[] } | null = null;
  private base: string; private opts: { avatar: Avatar; riderName: string; country: string | null };

  async load(): Promise<void> {
    const Q = QUALITY[this.quality]; const [manifest, common, far] = await Promise.all([fetch(`${this.base}/manifest.json`).then((r) => r.json()), fetch(`${this.base}/scenery-common.json`).then((r) => r.json()), fetch(`${this.base}/far.f32`).then((r) => r.arrayBuffer())]);
    this.manifest = manifest;
    // only the region packs near the route (plan 7.0: packs load on first visit, then the browser caches them)
    const xs = this.routeHint?.x ?? [0], zs = this.routeHint?.z ?? [0]; const pad = 2500; const [x0, x1, z0, z1] = [Math.min(...xs) - pad, Math.max(...xs) + pad, Math.min(...zs) - pad, Math.max(...zs) + pad];
    const near = this.world.regions.filter((r) => { const px = r.polygon.map((p) => p[0]), pz = r.polygon.map((p) => p[1]); return Math.max(...px) > x0 && Math.min(...px) < x1 && Math.max(...pz) > z0 && Math.min(...pz) < z1; }).map((r) => r.id).filter((id) => (manifest.packs as string[]).includes(id));
    const packs = await Promise.all(near.map((id) => fetch(`${this.base}/scenery-${id}.json`).then((r) => r.json())));
    const scenery = { ...common, trees: packs.flatMap((p) => p.trees), houses: packs.flatMap((p) => p.houses), props: Object.fromEntries(Object.keys(packs[0]?.props ?? {}).map((k) => [k, packs.flatMap((p) => p.props[k])])) } as Scenery;
    // sky, environment light, haze matched to the horizon
    const sky = new Sky(); sky.scale.setScalar(450000); const su = sky.material.uniforms; su.turbidity!.value = 5; su.rayleigh!.value = 1.4; su.mieCoefficient!.value = 0.004; su.mieDirectionalG!.value = 0.8; su.sunPosition!.value.copy(this.sunDir); this.scene.add(sky);
    const pmrem = new THREE.PMREMGenerator(this.renderer); const env = new THREE.Scene(); env.add(sky.clone()); this.scene.environment = pmrem.fromScene(env).texture; this.scene.environmentIntensity = 0.55;
    this.scene.fog = new THREE.FogExp2(0xc3d3df, Q.fog);
    this.sun.castShadow = Q.shadows > 0; this.sun.shadow.mapSize.set(Q.shadows || 1, Q.shadows || 1); Object.assign(this.sun.shadow.camera, { left: -70, right: 70, top: 70, bottom: -70, near: 1, far: 500 }); this.sun.shadow.bias = -0.0004; this.sun.shadow.normalBias = 0.6;
    this.scene.add(this.sun, this.sun.target, new THREE.HemisphereLight(0xcfe3ff, 0x4a5a3a, 0.35));
    this.detail = this.noiseTexture(); this.terrainMat = new THREE.MeshStandardMaterial({ vertexColors: true, map: this.detail, roughness: 0.95 });
    this.waterMat = new THREE.MeshStandardMaterial({ color: 0x1b5a74, roughness: 0.07, metalness: 0.15 });
    const water = new THREE.Mesh(new THREE.PlaneGeometry(60000, 60000).rotateX(-Math.PI / 2), this.waterMat); water.position.y = 0.4; this.scene.add(water);
    this.scene.add(this.terrainMesh(new Float32Array(far), manifest.far.nx, manifest.far.nz, manifest.far.ox, manifest.far.oz, manifest.far.step, 60, true));
    this.buildRoads(); this.buildHouses(scenery); this.buildLandmarks(scenery);
    this.sceneryUpdate = buildScenery(this.scene, scenery, this.waterMat);
    const roads = this.roadsForGraffiti(); this.checkpointsUpdate = buildCheckpoints(this.scene, scenery); buildGraffiti(this.scene, { ...scenery, roads }, this.opts.riderName, (this.opts.country ?? 'IN').toUpperCase());
    const a = this.opts.avatar; this.rider = createRider({ body: a.body, ...Object.fromEntries(Object.entries(a).filter(([k]) => k !== 'body').map(([k, v]) => [k, hex(v)])) }); this.scene.add(this.rider.group);
  }

  setRoute(route: RouteProfile, ghosts: number, pacers: number) {
    this.route = route;
    const translucent = (r: ReturnType<typeof createRider>, color: number) => { r.group.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.material = (m.material as THREE.MeshStandardMaterial).clone(); const mat = m.material as THREE.MeshStandardMaterial; mat.transparent = true; mat.opacity = 0.42; mat.color.lerp(new THREE.Color(color), 0.6); m.castShadow = false; } }); this.scene.add(r.group); return r; };
    this.ghosts = Array.from({ length: ghosts }, () => translucent(createRider({ jersey: 0x71d4e9 }), 0x71d4e9)); // "Personal best" / "Last ride" holograms (plan 10.5 C)
    this.pacers = Array.from({ length: pacers }, () => translucent(createRider({ jersey: 0xf4f4f2 }), 0xdddddd));
  }

  /** One frame. Called from requestAnimationFrame by the view component; reads engine state, never React state. */
  frame(dt: number, s: RiderState, nowS: number) {
    const t0 = performance.now();
    const fwd = new THREE.Vector3(Math.cos(s.headingRad), 0, Math.sin(s.headingRad)); const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    this.rider.group.position.set(s.x + right.x * 1.6, s.y + 0.06, s.z + right.z * 1.6); this.rider.group.rotation.set(0, Math.atan2(-fwd.z, fwd.x), Math.atan(s.gradePct / 100));
    this.rider.update(dt, { cadenceRpm: s.cadenceRpm, speedMps: s.speedMps, stopped: s.stopped });
    const place = (r: ReturnType<typeof createRider>, d: number, lane: number) => { if (!this.route) return; const p = this.at(d); r.group.position.set(p.x - Math.sin(p.h) * lane, p.y + 0.06, p.z + Math.cos(p.h) * lane); r.group.rotation.set(0, -p.h, 0); r.update(dt, { cadenceRpm: 88, speedMps: 8 }); };
    this.ghosts.forEach((g, i) => place(g, s.ghosts[i]?.d ?? -999, 0.4 + i * 0.6)); this.pacers.forEach((p, i) => place(p, s.pacers[i]?.d ?? -999, -0.6));
    this.updateCamera(dt, fwd);
    this.sun.position.copy(this.rider.group.position).addScaledVector(this.sunDir, 250); this.sun.target.position.copy(this.rider.group.position);
    this.sceneryUpdate(nowS, s.x, s.z); this.checkpointsUpdate(nowS, s.x, s.z); for (const t of this.turbines) t.rotation.z -= dt * 1.4;
    this.stream(s.x, s.z);
    this.renderer.render(this.scene, this.camera);
    const info = this.renderer.info.render; const ms = performance.now() - t0; this.frameTimes.push(dt * 1000); if (this.frameTimes.length > 120) this.frameTimes.shift();
    const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length; this.stats = { fps: Math.round(1000 / avg), frameMs: +avg.toFixed(1), calls: info.calls, trisM: +(info.triangles / 1e6).toFixed(2), chunks: [...this.chunks.values()].filter((c) => c !== 'loading').length, resScale: this.resScale };
    this.dynamicResolution(dt * 1000); void ms;
  }

  /** Plan 7.4: drop resolution 10 % when frames exceed 18 ms for 2 s; recover below 12 ms. */
  private dynamicResolution(frameMs: number) {
    if (frameMs > 18) { this.slowS += frameMs / 1000; this.fastS = 0; } else if (frameMs < 12) { this.fastS += frameMs / 1000; this.slowS = 0; } else { this.slowS = 0; this.fastS = 0; }
    if (this.slowS > 2 && this.resScale > 0.5) { this.resScale = +(this.resScale - 0.1).toFixed(1); this.slowS = 0; this.resize(); }
    if (this.fastS > 4 && this.resScale < 1) { this.resScale = +(this.resScale + 0.1).toFixed(1); this.fastS = 0; this.resize(); }
  }
  resize() {
    const w = this.canvas.clientWidth || 1, h = this.canvas.clientHeight || 1; const Q = QUALITY[this.quality];
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, Q.dpr) * Q.scale * this.resScale); this.renderer.setSize(w, h, false); this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
  }
  dispose() { this.renderer.dispose(); this.scene.traverse((o) => { const m = o as THREE.Mesh; m.geometry?.dispose?.(); }); }

  // ---- internals ----
  private at(d: number) { const r = this.route!; const L = r.lengthM; const dd = r.loop ? ((d % L) + L) % L : Math.max(0, Math.min(L, d)); const f = dd / r.step; const i = Math.min(r.x.length - 2, Math.floor(f)), t = f - i;
    return { x: r.x[i]! + (r.x[i + 1]! - r.x[i]!) * t, y: r.y[i]! + (r.y[i + 1]! - r.y[i]!) * t, z: r.z[i]! + (r.z[i + 1]! - r.z[i]!) * t, h: Math.atan2(r.z[i + 1]! - r.z[i]!, r.x[i + 1]! - r.x[i]!) }; }
  private updateCamera(dt: number, fwd: THREE.Vector3) {
    const c = CAMS[this.cameraMode] ?? CAMS[1]!; const rp = this.rider.group.position; const k = this.first ? 1 : 1 - Math.exp(-dt * 4);
    // smooth the offset in the rider's frame (no speed-dependent lag), and the heading separately
    this.camOff.lerp(new THREE.Vector3(c.side !== undefined ? c.back : -c.back, c.up, c.side ?? 0), k); this.camLookOff.lerp(new THREE.Vector3(c.look, c.fp ? 1.3 : c.top ? 0 : c.side !== undefined ? 0.85 : 1.2, 0), k);
    this.camFwd.lerp(fwd, this.first ? 1 : 1 - Math.exp(-dt * 6)).normalize(); this.first = false; const cr = new THREE.Vector3(-this.camFwd.z, 0, this.camFwd.x);
    this.camPos.set(rp.x + this.camFwd.x * this.camOff.x + cr.x * this.camOff.z, rp.y + this.camOff.y, rp.z + this.camFwd.z * this.camOff.x + cr.z * this.camOff.z);
    this.camLook.set(rp.x + this.camFwd.x * this.camLookOff.x, rp.y + this.camLookOff.y, rp.z + this.camFwd.z * this.camLookOff.x);
    this.camera.position.copy(this.camPos); if (c.top) this.camera.up.set(this.camFwd.x, 0, this.camFwd.z); else this.camera.up.set(0, 1, 0); this.camera.lookAt(this.camLook);
    this.rider.group.visible = !c.fp;
  }
  /** Keep chunks within 2.2 km loaded, dispose beyond 3 km; at most one GPU upload per frame to avoid hitches. */
  private stream(x: number, z: number) {
    const C = this.manifest.chunk; const want = new Set<string>(); const R = 2200;
    for (const key of this.manifest.chunks) { const [i, j] = key.split('_').map(Number) as [number, number]; const cx = (i + 0.5) * C, cz = (j + 0.5) * C; const d = Math.hypot(cx - x, cz - z); if (d < R) want.add(key); else if (d > R + 800) { const m = this.chunks.get(key); if (m && m !== 'loading') { this.scene.remove(m); m.geometry.dispose(); this.chunks.delete(key); } } }
    const missing = [...want].filter((k) => !this.chunks.has(k)).sort((a, b) => this.chunkDist(a, x, z) - this.chunkDist(b, x, z)).slice(0, 4);
    for (const key of missing) { this.chunks.set(key, 'loading'); void fetch(`${this.base}/chunks/${key}.f32`).then((r) => r.arrayBuffer()).then((buf) => { const [i, j] = key.split('_').map(Number) as [number, number]; const n = this.manifest.nearN; this.queue.push({ key, mesh: this.terrainMesh(new Float32Array(buf), n, n, i * C, j * C, this.manifest.nearStep, 7, false) }); }).catch(() => this.chunks.delete(key)); }
    const next = this.queue.shift(); if (next) { this.scene.add(next.mesh); this.chunks.set(next.key, next.mesh); }
  }
  private chunkDist(key: string, x: number, z: number) { const C = this.manifest.chunk; const [i, j] = key.split('_').map(Number) as [number, number]; return Math.hypot((i + 0.5) * C - x, (j + 0.5) * C - z); }
  private regionColor(x: number, z: number) { for (const r of this.world.regions) { let inside = false; const p = r.polygon; for (let i = 0, j = p.length - 1; i < p.length; j = i++) { const [xi, zi] = p[i]!, [xj, zj] = p[j]!; if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside; } if (inside) return r.biome; } return null; }
  private terrainMesh(H: Float32Array, nx: number, nz: number, ox: number, oz: number, step: number, uvScale: number, isFar: boolean) {
    const pos = new Float32Array(nx * nz * 3), uv = new Float32Array(nx * nz * 2);
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const k = j * nx + i, x = ox + i * step, z = oz + j * step; pos.set([x, H[k]!, z], k * 3); uv.set([x / uvScale, z / uvScale], k * 2); }
    const idx = new Uint32Array((nx - 1) * (nz - 1) * 6); let p = 0; for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) { const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1; idx.set([a, c, b, b, c, d], p); p += 6; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setIndex(new THREE.BufferAttribute(idx, 1)); g.computeVertexNormals();
    const n = g.attributes.normal!.array as Float32Array, col = new Float32Array(nx * nz * 3); const c = new THREE.Color();
    const pal = { desert: new THREE.Color(0xb8643c), canyon: new THREE.Color(0x8e4a2c), jungle: new THREE.Color(0x2f5a2a), tea: new THREE.Color(0x6aa64a), ash: new THREE.Color(0x3b3633), fjord: new THREE.Color(0x5d7a5e), alpine: new THREE.Color(0x6d8a52), grass: new THREE.Color(0x5d7f3a), dry: new THREE.Color(0x8f9450), marsh: new THREE.Color(0x7d8f5a), crop: new THREE.Color(0xb7a85a), rock: new THREE.Color(0x7d7468), sand: new THREE.Color(0xcdbb8e), snow: new THREE.Color(0xf2f4f7), forest: new THREE.Color(0x3c5a2c), town: new THREE.Color(0x9a8f7a) };
    for (let k = 0; k < nx * nz; k++) {
      const x = pos[k * 3]!, h = pos[k * 3 + 1]!, z = pos[k * 3 + 2]!, up = n[k * 3 + 1]!; const biome = this.regionColor(x, z); const v = 0.5 + 0.5 * Math.sin(x * 0.011 + Math.sin(z * 0.008) * 2) * Math.cos(z * 0.009);
      c.copy(biome === 'marsh' ? pal.marsh : biome === 'desert' ? pal.desert : biome === 'rainforest' ? pal.jungle : biome === 'tea' ? pal.tea : biome === 'volcanic' ? pal.ash : biome === 'fjord' ? pal.fjord : biome === 'alpine' ? pal.alpine : pal.grass)
        .lerp(biome === 'farmland' ? pal.crop : biome === 'desert' ? pal.canyon : pal.dry, v * (biome === 'farmland' || biome === 'desert' ? 0.5 : 0.3));
      if (biome === 'tea') c.multiplyScalar(0.85 + 0.25 * (0.5 + 0.5 * Math.sin(h * 1.6))); // terrace rows follow the contours
      const cx = Math.floor((x * 0.94 + z * 0.34) / 140), cz = Math.floor((z * 0.94 - x * 0.34) / 95); const cell = Math.abs(Math.sin(cx * 127.1 + cz * 311.7) * 43758.5) % 1;
      if (biome === 'farmland' && h < 300) c.lerp(cell < 0.3 ? pal.crop : cell < 0.6 ? pal.grass : pal.forest, 0.35);
      if (isFar) c.lerp(pal.forest, 0.3); if (h < 3.2) c.copy(biome === 'volcanic' ? pal.ash : pal.sand); if (h < 0) c.copy(pal.sand).multiplyScalar(0.7);
      if (up < 0.82) c.lerp(pal.rock, Math.min(1, (0.82 - up) * 5)); if (h > 250) c.lerp(pal.rock, Math.min(1, (h - 250) / 400)); if (h > 900 && up > 0.6) c.lerp(pal.snow, Math.min(1, (h - 900) / 200));
      for (const t of this.world.towns) { const d = Math.hypot(x - t.center[0], z - t.center[1]); if (d < t.radius) c.lerp(pal.town, 0.35 * (1 - d / t.radius)); }
      col.set([c.r, c.g, c.b], k * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3)); const m = new THREE.Mesh(g, this.terrainMat); m.receiveShadow = !isFar; return m;
  }
  private noiseTexture() { const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d')!; const im = g.createImageData(256, 256); let s = 7; for (let i = 0; i < 65536; i++) { s = (s * 16807) % 2147483647; const v = 205 + (s / 2147483647) * 50; im.data.set([v, v, v, 255], i * 4); } g.putImageData(im, 0, 0); const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; return t; }
  private asphalt() { const c = document.createElement('canvas'); c.width = 256; c.height = 1024; const g = c.getContext('2d')!; const im = g.createImageData(256, 1024); let s = 3; for (let i = 0; i < 256 * 1024; i++) { s = (s * 16807) % 2147483647; const v = 52 + (s / 2147483647) * 22; im.data.set([v, v + 1, v + 4, 255], i * 4); } g.putImageData(im, 0, 0);
    g.fillStyle = 'rgba(235,235,225,.9)'; g.fillRect(256 * 0.06, 0, 256 * 0.016, 1024); g.fillRect(256 * 0.924, 0, 256 * 0.016, 1024); g.fillRect(256 * 0.494, 0, 256 * 0.012, 1024 * 0.4);
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = this.renderer.capabilities.getMaxAnisotropy(); return t; }
  private sampled: ReturnType<typeof sampleWorld> | null = null;
  private buildRoads() {
    this.sampled = sampleWorld(this.world); const roadMat = new THREE.MeshStandardMaterial({ map: this.asphalt(), roughness: 0.85, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const shoulderMat = new THREE.MeshStandardMaterial({ color: 0x6b6658, roughness: 1, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
    const ribbon = (s: { x: number[]; y: number[]; z: number[] }, half: number, lift: number) => { const n = s.x.length, pos = new Float32Array(n * 6), uv = new Float32Array(n * 4), idx: number[] = []; let dist = 0;
      for (let k = 0; k < n; k++) { const a = Math.max(0, k - 1), b = Math.min(n - 1, k + 1); let tx = s.x[b]! - s.x[a]!, tz = s.z[b]! - s.z[a]!; const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l; if (k) dist += Math.hypot(s.x[k]! - s.x[k - 1]!, s.z[k]! - s.z[k - 1]!);
        pos.set([s.x[k]! + tz * half, s.y[k]! + lift, s.z[k]! - tx * half, s.x[k]! - tz * half, s.y[k]! + lift, s.z[k]! + tx * half], k * 6); uv.set([0, dist / 14, 1, dist / 14], k * 4); if (k < n - 1) { const i = k * 2; idx.push(i, i + 1, i + 2, i + 1, i + 3, i + 2); } }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals(); return g; };
    const roads: THREE.BufferGeometry[] = [], shoulders: THREE.BufferGeometry[] = [];
    for (const e of this.world.edges) { const s = this.sampled[e.id]!; roads.push(ribbon(s, e.width / 2, 0.06)); shoulders.push(ribbon(s, e.width / 2 + 0.7, 0)); }
    const r = new THREE.Mesh(mergeGeometries(roads), roadMat), sh = new THREE.Mesh(mergeGeometries(shoulders), shoulderMat); r.receiveShadow = sh.receiveShadow = true; this.scene.add(sh, r);
  }
  private roadsForGraffiti() { const out: Record<string, { length: number; x: number[]; y: number[]; z: number[] }> = {}; for (const [id, s] of Object.entries(this.sampled!)) out[id] = { length: s.length, x: s.x, y: s.y, z: s.z }; return out; }
  private colored(geo: THREE.BufferGeometry, hexColor: number) { geo = geo.index ? geo.toNonIndexed() : geo; const c = new THREE.Color(hexColor), n = geo.attributes.position!.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3); geo.setAttribute('color', new THREE.BufferAttribute(a, 3)); geo.deleteAttribute('uv'); return geo; }
  private buildHouses(sc: Scenery) {
    if (!sc.houses.length) return; const walls = [0xe9dfcc, 0xd9c3a5, 0xf3efe6, 0xc7d3d8, 0xe2b8a0], roofs = [0x9c4a34, 0x5d5f66, 0x7a3b2e];
    const geos = sc.houses.map((h) => { const H = h.floors * 3; const body = this.colored(new THREE.BoxGeometry(h.w, H + 3, h.d).translate(0, (H + 3) / 2 - 3, 0), walls[h.wall]!); const rh = 2.6 + h.w * 0.12;
      const roof = this.colored(new THREE.ConeGeometry(Math.SQRT1_2, 1, 4).rotateY(Math.PI / 4).scale(h.w * 1.15, rh, h.d * 1.15).translate(0, H + rh / 2, 0), roofs[h.roof]!);
      return mergeGeometries([body, roof]).applyMatrix4(new THREE.Matrix4().makeRotationY(-h.rot)).applyMatrix4(new THREE.Matrix4().makeTranslation(h.x, h.y, h.z)); });
    const m = new THREE.Mesh(mergeGeometries(geos), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, flatShading: true })); m.castShadow = m.receiveShadow = true; this.scene.add(m);
  }
  private buildLandmarks(sc: Scenery) {
    const flat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, flatShading: true });
    for (const l of sc.landmarks) {
      const [x, y, z] = l.pos; const g = new THREE.Group(); g.position.set(x, y, z);
      if (l.kind === 'lighthouse') { const parts: THREE.BufferGeometry[] = []; for (let b = 0; b < 6; b++) parts.push(this.colored(new THREE.CylinderGeometry(2.2 - (b + 1) * 0.15, 2.2 - b * 0.15, 3.6, 16).translate(0, 1.8 + b * 3.6, 0), b % 2 ? 0xf4f1ea : 0xc0392b));
        parts.push(this.colored(new THREE.CylinderGeometry(1.5, 1.5, 2.2, 12).translate(0, 22.7, 0), 0xffe7a0), this.colored(new THREE.ConeGeometry(1.9, 2.4, 12).translate(0, 25, 0), 0x2b2f36), this.colored(new THREE.CylinderGeometry(3.4, 3.8, 1.2, 16).translate(0, 0.2, 0), 0x9aa0a6));
        const m = new THREE.Mesh(mergeGeometries(parts), flat); m.castShadow = true; g.add(m); }
      if (l.kind === 'wind-turbines') for (let i = 0; i < 6; i++) { // row of turbines with turning rotors (ambient life, plan 7.0)
        const t = new THREE.Group(); t.position.set(i * 140 * Math.cos(l.rot), 0, i * 140 * Math.sin(l.rot)); const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.6, 60, 10).translate(0, 30, 0), new THREE.MeshStandardMaterial({ color: 0xf2f2ee, roughness: 0.5 })); t.add(mast);
        const rotor = new THREE.Group(); rotor.position.set(0, 60, 1.8); for (let b = 0; b < 3; b++) { const blade = new THREE.Mesh(new THREE.BoxGeometry(0.9, 26, 0.3).translate(0, 13, 0), mast.material); blade.rotation.z = (b * Math.PI * 2) / 3; rotor.add(blade); } t.add(rotor); this.turbines.push(rotor); g.add(t); }
      if (l.kind === 'stone-circle') for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; const st = new THREE.Mesh(new THREE.BoxGeometry(1.6, 4 + (i % 3) * 0.6, 0.9), new THREE.MeshStandardMaterial({ color: 0x8f8778, roughness: 0.95, flatShading: true })); st.position.set(Math.cos(a) * 14, 1.8, Math.sin(a) * 14); st.rotation.y = -a; st.castShadow = true; g.add(st); }
      const M = (color: number) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, flatShading: true });
      if (l.kind === 'clock-tower') { const t = new THREE.Mesh(new THREE.BoxGeometry(7, 34, 7).translate(0, 17, 0), M(0xd9c3a5)); const roof = new THREE.Mesh(new THREE.ConeGeometry(5.6, 9, 4).rotateY(Math.PI / 4).translate(0, 38.5, 0), M(0x7a3b2e)); const clock = new THREE.Mesh(new THREE.CircleGeometry(2.2, 24).translate(0, 28, 3.55), M(0xf4f1ea)); g.add(t, roof, clock); }
      if (l.kind === 'observatory') { const base = new THREE.Mesh(new THREE.CylinderGeometry(9, 10, 8, 20).translate(0, 4, 0), M(0xe8e4da)); const dome = new THREE.Mesh(new THREE.SphereGeometry(8.5, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 8, 0), new THREE.MeshStandardMaterial({ color: 0xdfe6ea, metalness: 0.6, roughness: 0.3 })); g.add(base, dome); }
      if (l.kind === 'tea-estate') { const h = new THREE.Mesh(new THREE.BoxGeometry(22, 8, 12).translate(0, 4, 0), M(0xf3efe6)); const r = new THREE.Mesh(new THREE.ConeGeometry(13, 5, 4).rotateY(Math.PI / 4).scale(1, 1, 0.6).translate(0, 10.5, 0), M(0x3f6a3a)); g.add(h, r); }
      if (l.kind === 'canopy-bridge') { const deck = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.3, 40).translate(0, 16, 0), M(0x6b5a45)); deck.rotation.y = l.rot; g.add(deck); for (const s of [-18, 18]) { const tr = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 2.4, 40, 8).translate(0, 20, s), M(0x4a3426)); tr.rotation.y = l.rot; g.add(tr); } }
      if (l.kind === 'suspension-bridge') { const grp = new THREE.Group(); grp.rotation.y = l.rot; for (const s of [-160, 160]) for (const side of [-6, 6]) grp.add(new THREE.Mesh(new THREE.BoxGeometry(3, 70, 3).translate(s, 35, side), M(0xc0392b))); grp.add(new THREE.Mesh(new THREE.BoxGeometry(420, 2, 14).translate(0, 18, 0), M(0x8a8f96)));
        const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(-210, 40, 0), new THREE.Vector3(0, 10, 0), new THREE.Vector3(210, 40, 0)); for (const side of [-6, 6]) grp.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 40, 0.5, 6).translate(0, 30, side), M(0x2b2f36))); g.add(grp); }
      if (l.kind === 'rock-arch') { const arch = new THREE.Mesh(new THREE.TorusGeometry(26, 7, 8, 24, Math.PI), M(0xa4502e)); arch.rotation.y = l.rot; g.add(arch); }
      this.scene.add(g);
    }
  }
}
