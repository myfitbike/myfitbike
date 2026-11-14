// Procedural cyclist and road bike (spike). Local frame: +x forward, +y up, +z to the rider's right.
// Legs use two-bone IK onto pedals that turn with cadence, so the pedalling reads as real at any cadence.
import * as THREE from 'three';

const V = (x, y, z = 0) => new THREE.Vector3(x, y, z);
const UP = V(0, 1, 0);

// ---- bike geometry (road bike, ~56 cm, metres) ----
const WHEEL_R = 0.336;
const REAR = V(-0.405, WHEEL_R), FRONT = V(0.595, WHEEL_R), BB = V(0, 0.27);
const SEAT_TOP = V(-0.15, 0.80), SADDLE = V(-0.205, 0.985), HEAD_TOP = V(0.43, 0.86), HEAD_BOT = V(0.475, 0.70);
const STEM_END = V(0.535, 0.885), HOOD = V(0.6, 0.905), CRANK = 0.1725;

function tube(mat, a, b, r0, r1 = r0, seg = 10) {
  const d = new THREE.Vector3().subVectors(b, a); const len = d.length();
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, len, seg), mat);
  m.position.copy(a).addScaledVector(d, 0.5); m.quaternion.setFromUnitVectors(UP, d.normalize()); return m;
}
// Capsule limb between two moving points; geometry built at unit length and scaled along its axis.
function limb(mat, r) { const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, 1, 6, 12), mat); m.userData.r = r; return m; }
function place(m, a, b) {
  const d = new THREE.Vector3().subVectors(b, a); const len = d.length();
  m.position.copy(a).addScaledVector(d, 0.5); m.quaternion.setFromUnitVectors(UP, d.multiplyScalar(1 / len));
  m.scale.set(1, (len + m.userData.r) / (1 + 2 * m.userData.r), 1); // ends overlap the joints by r/2, like real limbs
}
// Two-bone IK in the plane containing the bend direction. Returns the middle joint.
function ik(root, end, a, b, bendDir) {
  const d = new THREE.Vector3().subVectors(end, root); let dist = d.length();
  dist = Math.min(Math.max(dist, Math.abs(a - b) + 1e-3), a + b - 1e-3);
  const dir = d.normalize(); const cosA = (a * a + dist * dist - b * b) / (2 * a * dist); const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
  const perp = bendDir.clone().addScaledVector(dir, -bendDir.dot(dir)).normalize();
  return root.clone().addScaledVector(dir, a * cosA).addScaledVector(perp, a * sinA);
}

// Avatar options (PLAN 16.11): body 'male' | 'female', skin, hair, and every kit colour.
export const DEFAULT_AVATAR = { body: 'male', skin: 0xc68e6a, hair: 0x3b2a20, jersey: 0x2a8fa3, accent: 0xf2c14e, shorts: 0x14161a, socks: 0xf2f2ee, shoes: 0xf4f4f2, helmet: 0xf6f6f4, lens: 0x0d1117, frame: 0x232a36 };
export function createRider(opts = {}) {
  const A = { ...DEFAULT_AVATAR, ...opts }; const { jersey, accent, frame, skin } = A; const female = A.body === 'female';
  const B = female ? { k: 0.95, shoulder: 0.165, chest: 0.115, hipW: 0.1, thigh: 0.064 } : { k: 1, shoulder: 0.19, chest: 0.125, hipW: 0.095, thigh: 0.066 };
  const M = (color, rough = 0.6, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: rough, ...extra });
  const mat = {
    frame: new THREE.MeshPhysicalMaterial({ color: frame, roughness: 0.35, metalness: 0.3, clearcoat: 1, clearcoatRoughness: 0.15 }),
    accent: M(accent, 0.4), tyre: M(0x1a1a1a, 0.92), rim: M(0x111317, 0.35, { metalness: 0.4 }), alloy: M(0x9aa1a8, 0.3, { metalness: 0.9 }),
    black: M(0x15171b, 0.55), jersey: M(jersey, 0.75), bib: M(A.shorts, 0.7), skin: M(skin, 0.65), sock: M(A.socks, 0.8), hair: M(A.hair, 0.8),
    shoe: M(A.shoes, 0.4), helmet: new THREE.MeshPhysicalMaterial({ color: A.helmet, roughness: 0.3, clearcoat: 0.8 }), lens: M(A.lens, 0.05, { metalness: 0.8 }),
  };
  const root = new THREE.Group(); const bike = new THREE.Group(); root.add(bike);

  // frame and fork
  const zc = 0.065;
  [[BB, SEAT_TOP, 0.016, 0.015], [SEAT_TOP, HEAD_TOP, 0.016, 0.017], [BB, HEAD_BOT, 0.022, 0.02], [HEAD_BOT, HEAD_TOP, 0.022]]
    .forEach(([a, b, r0, r1]) => bike.add(tube(mat.frame, a, b, r0, r1)));
  for (const s of [-1, 1]) {
    bike.add(tube(mat.frame, V(BB.x, BB.y, s * 0.02), V(REAR.x, REAR.y, s * zc), 0.011, 0.008));
    bike.add(tube(mat.frame, V(SEAT_TOP.x, SEAT_TOP.y - 0.02, s * 0.015), V(REAR.x, REAR.y, s * zc), 0.009, 0.007));
    bike.add(tube(mat.frame, V(HEAD_BOT.x, HEAD_BOT.y, s * 0.02), V(FRONT.x, FRONT.y, s * 0.05), 0.013, 0.009));
  }
  bike.add(tube(mat.accent, V(-0.02, 0.44), V(-0.07, 0.60), 0.0165)); // accent band on the seat tube
  bike.add(tube(mat.black, SEAT_TOP, V(SADDLE.x + 0.01, SADDLE.y - 0.02), 0.0135));
  const saddle = new THREE.Mesh(new THREE.CapsuleGeometry(0.035, 0.2, 4, 10).rotateZ(Math.PI / 2).scale(1, 0.45, 1), mat.black); saddle.position.copy(SADDLE); bike.add(saddle);
  bike.add(tube(mat.black, HEAD_TOP, STEM_END, 0.016));
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.42, 10).rotateX(Math.PI / 2), mat.black); bar.position.copy(STEM_END); bike.add(bar);
  for (const s of [-1, 1]) { // hoods and drops
    bike.add(tube(mat.black, V(STEM_END.x, STEM_END.y, s * 0.2), V(HOOD.x, HOOD.y, s * 0.205), 0.016));
    const drop = new THREE.Mesh(new THREE.TorusGeometry(0.065, 0.011, 8, 16, Math.PI), mat.black); drop.position.set(HOOD.x - 0.005, HOOD.y - 0.075, s * 0.205); drop.rotation.z = -Math.PI / 2; bike.add(drop);
  }
  // wheels
  const wheel = () => {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.TorusGeometry(WHEEL_R - 0.012, 0.0135, 10, 48), mat.tyre));
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(WHEEL_R - 0.026, WHEEL_R - 0.026, 0.024, 48, 1, true).rotateX(Math.PI / 2), mat.rim); g.add(rim);
    const inner = new THREE.Mesh(new THREE.CylinderGeometry(WHEEL_R - 0.07, WHEEL_R - 0.07, 0.018, 48, 1, true).rotateX(Math.PI / 2), mat.rim); g.add(inner);
    const sp = []; for (let i = 0; i < 24; i++) { const a = (i / 24) * Math.PI * 2, s = i % 2 ? 1 : -1; sp.push(0, 0, s * 0.03, Math.cos(a) * (WHEEL_R - 0.07), Math.sin(a) * (WHEEL_R - 0.07), 0); }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    g.add(new THREE.LineSegments(sg, new THREE.LineBasicMaterial({ color: 0x8a9096 })));
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.1, 12).rotateX(Math.PI / 2), mat.alloy));
    return g;
  };
  const rearW = wheel(), frontW = wheel(); rearW.position.copy(REAR); frontW.position.copy(FRONT); bike.add(rearW, frontW);
  // drivetrain
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.006, 6, 40), mat.alloy); ring.position.set(BB.x, BB.y, 0.045); bike.add(ring);
  const cassette = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.03, 20).rotateX(Math.PI / 2), mat.alloy); cassette.position.set(REAR.x, REAR.y, 0.04); bike.add(cassette);
  const crankset = new THREE.Group(); crankset.position.copy(BB); bike.add(crankset);
  const arms = [1, -1].map((s) => { const a = new THREE.Mesh(new THREE.BoxGeometry(0.018, CRANK, 0.012).translate(0, -CRANK / 2, 0), mat.black); a.position.z = s * 0.075; if (s < 0) a.rotation.z = Math.PI; crankset.add(a); return a; });

  // rider
  const body = new THREE.Group(); root.add(body);
  const L = { thigh: 0.45 * B.k, shin: 0.44 * B.k, upper: 0.29 * B.k, fore: 0.27 * B.k };
  const hipC = V(SADDLE.x + 0.01, SADDLE.y + 0.07);
  const legs = [1, -1].map((s) => ({ s, thigh: limb(mat.bib, B.thigh), shin: limb(mat.skin, 0.047), sock: limb(mat.sock, 0.041), foot: new THREE.Mesh(new THREE.CapsuleGeometry(0.04, 0.17, 4, 10).rotateZ(Math.PI / 2).scale(1, 0.7, 0.85), mat.shoe), knee: new THREE.Mesh(new THREE.SphereGeometry(0.052, 12, 10), mat.skin) }));
  for (const l of legs) body.add(l.thigh, l.shin, l.sock, l.foot, l.knee);
  const pelvis = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 12).scale(1.05, 0.75, 1.15), mat.bib); body.add(pelvis);
  const torso = limb(mat.jersey, B.chest); body.add(torso);
  const neckM = limb(mat.skin, 0.045); body.add(neckM);
  const shoulders = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, B.shoulder * 1.37, 6, 12).rotateX(Math.PI / 2), mat.jersey); body.add(shoulders);
  const ponytail = female ? new THREE.Mesh(new THREE.CapsuleGeometry(0.035, 0.12, 4, 8), mat.hair) : null; if (ponytail) body.add(ponytail);
  const accentBand = new THREE.Mesh(new THREE.CylinderGeometry(0.047, 0.047, 0.03, 12), mat.accent); body.add(accentBand); // sleeve band in the accent colour
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.105, 20, 16).scale(1.05, 1.1, 0.95), mat.skin); body.add(head);
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.122, 24, 14, 0, Math.PI * 2, 0, Math.PI * 0.55).scale(1.28, 0.88, 1.06), mat.helmet); body.add(helmet);
  const glasses = new THREE.Mesh(new THREE.CapsuleGeometry(0.022, 0.14, 4, 10).rotateX(Math.PI / 2).scale(0.6, 1, 1), mat.lens); body.add(glasses);
  const arms3 = [1, -1].map((s) => ({ s, upper: limb(mat.jersey, 0.046), fore: limb(mat.skin, 0.037), hand: new THREE.Mesh(new THREE.SphereGeometry(0.042, 10, 8).scale(1.3, 0.8, 0.9), mat.black) }));
  for (const a of arms3) body.add(a.upper, a.fore, a.hand);

  root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  let crank = 0, wheelAngle = 0, t = 0;
  const tmp = V(0, 0), fwd = V(1, 0), down = V(0, -1), back = V(-0.3, -1);

  function update(dt, { cadenceRpm = 85, speedMps = 0 } = {}) {
    t += dt; crank += (cadenceRpm / 60) * Math.PI * 2 * dt; wheelAngle -= (speedMps * dt) / WHEEL_R;
    rearW.rotation.z = frontW.rotation.z = wheelAngle; crankset.rotation.z = -crank; ring.rotation.z = -crank;
    const pedalling = cadenceRpm > 5;
    const bob = pedalling ? Math.sin(crank * 2) * 0.006 : 0, sway = pedalling ? Math.sin(crank) * 0.012 : 0;
    const hip = hipC.clone().add(V(0, bob));
    pelvis.position.copy(hip).add(V(0.0, 0.0)); pelvis.rotation.x = sway;
    // torso: hip to shoulders, forward lean onto the hoods
    const shoulder = V(0.31, 1.355 + bob * 0.5);
    place(torso, V(hip.x + 0.03, hip.y + 0.05), shoulder); torso.scale.z = 1.32; torso.scale.x = 0.82; torso.rotation.x += sway * 0.5;
    const neck = shoulder.clone().add(V(0.105, 0.095));
    place(neckM, shoulder.clone().add(V(0.02, 0.02)), neck); shoulders.position.copy(shoulder).add(V(-0.01, -0.015));
    head.position.copy(neck); head.rotation.z = -0.25;
    helmet.position.copy(neck).add(V(-0.01, 0.018)); helmet.rotation.z = 0.18;
    glasses.position.copy(neck).add(V(0.098, 0.012));
    if (ponytail) { ponytail.position.copy(neck).add(V(-0.15, -0.03)); ponytail.rotation.z = -1.1; }
    for (const l of legs) {
      const a = -crank + (l.s > 0 ? 0 : Math.PI); // right crank leads
      const pedal = V(BB.x + Math.sin(a) * CRANK, BB.y - Math.cos(a) * CRANK, l.s * 0.11);
      const ankle = pedal.clone().add(V(-0.045, 0.07 + 0.012 * Math.sin(a))); // heel drops slightly on the downstroke
      const h = V(hip.x, hip.y - 0.02, l.s * B.hipW);
      const knee = ik(h, ankle, L.thigh, L.shin, tmp.set(1, 0.25, 0));
      place(l.thigh, h, knee); place(l.shin, knee, ankle);
      const sockTop = ankle.clone().lerp(knee, 0.22); place(l.sock, ankle, sockTop);
      l.knee.position.copy(knee); l.foot.position.copy(ankle).lerp(pedal, 0.5).add(V(0.05, -0.012)); l.foot.rotation.z = -0.12 + 0.18 * Math.sin(a);
    }
    for (const a of arms3) {
      const sh = V(shoulder.x - 0.02, shoulder.y - 0.02, a.s * B.shoulder), hand = V(HOOD.x - 0.01, HOOD.y + 0.025, a.s * 0.205);
      const elbow = ik(sh, hand, L.upper, L.fore, V(-0.2, -1, a.s * 0.6));
      place(a.upper, sh, elbow); place(a.fore, elbow, hand); a.hand.position.copy(hand);
      if (a.s > 0) { accentBand.position.copy(sh).lerp(elbow, 0.75); accentBand.quaternion.copy(a.upper.quaternion); }
    }
  }
  update(0);
  return { group: root, update };
}
