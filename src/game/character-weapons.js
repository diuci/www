// INKWAVE — procedural weapon models held by squidkids.
// Weapon space: grip centre at the origin, +Z = barrel forward, +Y = up, character's right = -X.
// Each weapon: body (vertex-coloured physical plastic with per-vertex surface class aMat — satin, gloss, rubber,
// metal, lens, LED, print), ink (team gloss), optional glow (charger coil) and drum (roller).
//
// Moving parts (character.js drives them from the firing state): def.parts = { name: { geo, pivot, mat, lamp? } } —
// each part's geometry is re-centred on its pivot (the part's Group sits at the pivot and slides / turns / scales
// about it); mat 'body' = shared plastic, 'ink' = team gloss, 'lamp' = a per-instance emissive (makeLampMaterial).
// def.bodyStatic / def.inkStatic = everything that never moves; def.body / def.ink stay the complete merged weapon
// (parts included, at rest) for tools that just want the static model. Parts per weapon:
//   shooter  trigger · bolt (cocking knob, cycles per shot) · can (ink canister, pulses per shot) · led (status lamp)
//   blaster  trigger · pump (foregrip slide — the left hand rides it) · needle (pressure gauge) · bulb (ink bulb)
//   charger  trigger · bolt (charging handle, draws back with the charge) · lens / eyepiece (scope glow) · ports
//            (muzzle-brake heat) · glow = coil rings with a per-vertex aSeg threshold (makeCoilMaterial lights them in order)
//   roller   led (reservoir lamp) · drum (spins; character.js gives it inertia)
//   dualies  trigger · slide / slideInk (snaps back on its own hand's shot) · led
//   slosher  surface (the ink, kept level against the swing) · lever (thumb lever)
//   splatling trigger · barrels (spin with the charge / stream) · glow = the 8-segment charge meter (makeCoilMaterial)
// Fork kinds (bucket, spinner, twins, brush, sp_*) are static shells; spinner carries its own `spin` barrel cluster
// (character.js turns it about +Z through spinAt) and twins sets `mirrorDual` (character.js mirrors a copy into the
// left fist — distinct from `dual`, which gives the left hand a full second instance with its own parts).
//
// Hands: the squidkid fist is modelled around a Ø 2.8 cm handle whose axis passes through HAND.hole (character-geo).
// A grip spec { pos, handZ, handY } says where that handle axis passes (pos), which way it runs toward the thumb
// (handZ) and which way the wrist lies (handY). Handles held by a hand are ≤ 1.5 cm in radius around that axis.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { superEllipsoid, lathe, smoothProfile, sweep, finalize, torus as torusG, HAND } from './character-geo.js';
import { WMAT } from './character-mats.js';

const V3 = THREE.Vector3;
const M = WMAT;
const C = {
  cream: '#f2ede1', white: '#eef0f3', bone: '#e4ddcc', dark: '#2a2e37', darker: '#1b1e25', gray: '#8f98a6', metal: '#c3c9d2',
  gunmetal: '#5b616c', rubber: '#26282e', lens: '#0b0f16', red: '#ff3b30', green: '#3dff7a', amber: '#ffb000', decal: '#f7f7f5', hazard: '#ffcf33',
};

class Parts {
  constructor() { this.list = []; }
  add(geo, color, mat = M.satin) {
    const g = geo.index ? geo : finalize(geo);
    const n = g.attributes.position.count; const col = new Float32Array(n * 3); const c = new THREE.Color(color);
    for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', g.attributes.position.clone());
    out.setAttribute('normal', g.attributes.normal.clone());
    out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    out.setAttribute('aMat', new THREE.Float32BufferAttribute(new Float32Array(n).fill(mat), 1));
    out.setIndex(g.index.clone());
    this.list.push(out); return this;
  }
  build() { return this.list.length ? mergeGeometries(this.list, false) : null; }
}

// ---------------------------------------------------------------------------------------------- helpers
/** Lathe along +Z from [r, z] profile. */
function latheZ(profile, seg = 16) { const g = lathe(profile, seg); g.rotateX(Math.PI / 2); return g; }
function torus(R, r, rs = 6, ts = 16, arc = Math.PI * 2) { return torusG(R, r, rs, ts, arc); }
function at(g, x, y, z) { g.translate(x, y, z); return g; }
/** Rounded box (w, h, d = full sizes), squareness e (smaller = boxier). */
function rbox(w, h, d, e = 0.3, ws = 12, hs = 8, deform) { return superEllipsoid(w / 2, h / 2, d / 2, e, e, ws, hs, deform); }
/** Orient geometry authored along +Y so that +Y → dir, then place at p. */
function orient(g, dir, p) { g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new V3(0, 1, 0), dir.clone().normalize())); return at(g, p.x, p.y, p.z); }
/** Small screw head (dome with a slot) facing n at p. */
function screw(P, p, n, r = 0.0032, col = C.metal) {
  const h = lathe([[0, 0], [r, 0], [r, 0.0006], [r * 0.72, 0.0014], [0, 0.0017]], 6);
  P.add(orient(h, n, p), col, M.metal);
}
/** Thin extruded decal from a 2D shape (in the XY plane), placed with basis (x, y) at p. */
function decal(shape, depth = 0.0006) {
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 5 });
  return finalize(g);
}
function placeXY(g, xAxis, yAxis, p) {
  const x = xAxis.clone().normalize(), y = yAxis.clone().addScaledVector(x, -yAxis.dot(x)).normalize(), z = new V3().crossVectors(x, y);
  g.applyMatrix4(new THREE.Matrix4().makeBasis(x, y, z).setPosition(p));
  return g;
}
/** Squid glyph (mantle arrow + head + eyes cut out) as a Shape of height ~1 (scale it). */
function squidShape(s = 1) {
  const sh = new THREE.Shape();
  sh.moveTo(0, 0.62 * s); sh.lineTo(0.42 * s, 0.1 * s); sh.quadraticCurveTo(0.38 * s, -0.08 * s, 0.26 * s, -0.12 * s);
  sh.lineTo(0.26 * s, -0.42 * s); sh.lineTo(0.14 * s, -0.42 * s); sh.lineTo(0.12 * s, -0.2 * s);
  sh.lineTo(0.05 * s, -0.2 * s); sh.lineTo(0.05 * s, -0.46 * s); sh.lineTo(-0.05 * s, -0.46 * s); sh.lineTo(-0.05 * s, -0.2 * s);
  sh.lineTo(-0.12 * s, -0.2 * s); sh.lineTo(-0.14 * s, -0.42 * s); sh.lineTo(-0.26 * s, -0.42 * s); sh.lineTo(-0.26 * s, -0.12 * s);
  sh.quadraticCurveTo(-0.38 * s, -0.08 * s, -0.42 * s, 0.1 * s); sh.lineTo(0, 0.62 * s);
  for (const ex of [0.12, -0.12]) { const e = new THREE.Path(); e.absellipse(ex * s, 0.02 * s, 0.055 * s, 0.07 * s, 0, Math.PI * 2, false); sh.holes.push(e); }
  return sh;
}
/** An animated sub-part built from its own Parts, authored in weapon space; re-centred on `pivot` in getWeaponDef. */
function part(P, pivot, mat = 'body', lamp = null) { return { src: P.build(), pivot: pivot.clone(), mat, lamp }; }

/** Per-instance glowing material for lamp parts (LEDs, scope lenses, hot muzzle ports). */
export function makeLampMaterial(spec = {}) {
  const m = new THREE.MeshStandardMaterial({ color: spec.color ?? 0x222222, emissive: spec.emissive ?? spec.color ?? 0xffffff, emissiveIntensity: spec.intensity ?? 1, roughness: spec.roughness ?? 0.25, metalness: 0 });
  m.name = 'iw-lamp';
  return m;
}

/** Charger coil: the rings light one after another as the charge passes their aSeg threshold (rear → muzzle), the ring
 *  being filled flickers hot, full charge ripples along the coil, the release flashes white. userData.u = uniforms
 *  { uCharge, uFull, uFlash, uTime }; emissive = team colour. */
export function makeCoilMaterial() {
  const m = new THREE.MeshStandardMaterial({ color: 0x1b1c22, emissive: 0xffffff, emissiveIntensity: 1, roughness: 0.3, metalness: 0.25 });
  const U = { uCharge: { value: 0 }, uFull: { value: 0 }, uFlash: { value: 0 }, uTime: { value: 0 } };
  m.userData.u = U;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aSeg;\nvarying float vSeg;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSeg = aSeg;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uCharge, uFull, uFlash, uTime;\nvarying float vSeg;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        {
          float lit = smoothstep(vSeg - 0.1, vSeg + 0.01, uCharge);
          float edge = exp(-pow((uCharge - vSeg + 0.05) * 11.0, 2.0)) * (1.0 - uFull);
          float I = 0.05 + lit * (0.9 + 1.7 * uCharge) + edge * (1.3 + 0.9 * sin(uTime * 57.0))
                  + uFull * (1.1 + 1.0 * (0.5 + 0.5 * sin(uTime * 34.0 - vSeg * 14.0))) + uFlash * 6.0;
          totalEmissiveRadiance = emissive * I + vec3(uFlash * 2.0);
        }`);
  };
  m.customProgramCacheKey = () => 'iw-coil-1';
  return m;
}

function chevronShape(w, h, n = 3, gap = 0.4) {
  const sh = []; const step = w / n;
  for (let i = 0; i < n; i++) {
    const s = new THREE.Shape(); const x0 = i * step, t = step * (1 - gap);
    s.moveTo(x0, 0); s.lineTo(x0 + t, 0); s.lineTo(x0 + t + h * 0.5, h * 0.5); s.lineTo(x0 + t, h); s.lineTo(x0, h); s.lineTo(x0 + h * 0.5, h * 0.5); s.lineTo(x0, 0);
    sh.push(s);
  }
  return sh;
}
/** Run fn(v) over every vertex of g in place, then refresh normals. */
function deformG(g, fn) {
  const p = g.attributes.position; const v = new V3();
  for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); fn(v); p.setXYZ(i, v.x, v.y, v.z); }
  g.computeVertexNormals();
  return g;
}
/** Deterministic PRNG (procedural clutter such as bristles is identical on every build). */
function rng(seed) { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); }
/** Surface |x| of an undeformed superEllipsoid(rx, ry, rz, e1, e2) at local (y, z), for seating screws and decals on flanks. */
function seX(rx, ry, rz, e1, e2, y, z) {
  const sl = Math.min(1, Math.abs(y) / ry) ** (1 / e1);
  const f = Math.sqrt(Math.max(0, 1 - sl * sl)) ** e1;
  const sw = Math.min(1, Math.abs(z) / (rz * f + 1e-9)) ** (1 / e2);
  return rx * f * Math.sqrt(Math.max(0, 1 - sw * sw)) ** e2;
}

// ---------------------------------------------------------------------------------------------- hands
/** Grip-hole axis point relative to the hand bone (right hand = mirror of the modelled left hand). */
export const GRIP_HOLE_L = HAND.hole.clone();
export const GRIP_HOLE_R = new V3(-HAND.hole.x, HAND.hole.y, HAND.hole.z);
/** Twirl pivot: the right fist's grip axis (so spins happen around the handle the kid is holding). */
export const FIST_OFFSET = GRIP_HOLE_R.clone();

/** Pistol grip around the handle axis A through the origin: rubber-paneled, finger-grooved front strap,
 *  beavertail over the web of the hand, trigger + guard for the index finger, flared base plate. */
const GRIP_AXIS = new V3(0, 1, 0.25).normalize();
function pistolGrip(P, opt = {}) {
  const A = GRIP_AXIS;
  const tilt = Math.atan2(A.z, A.y);
  // core: slim oval handle, finger grooves on the front strap
  const core = superEllipsoid(0.0118, 0.056, 0.0152, 0.62, 0.7, 12, 12, (q) => {
    if (q.z > 0) { const f = 0.5 + 0.5 * Math.cos(((q.y + 0.0006) / 0.0122) * Math.PI * 2); q.z -= 0.0016 * f * (1 - Math.abs(q.x) / 0.0118) * (q.y < 0.03 ? 1 : 0); }
    if (q.y < -0.046) { q.x *= 1.08; q.z *= 1.06; }
  });
  core.rotateX(tilt); P.add(at(core, 0, -0.008, -0.002), C.darker, M.satin);
  // rubber side panels (knurled)
  for (const sx of [1, -1]) {
    const pn = superEllipsoid(0.003, 0.038, 0.0118, 0.5, 0.55, 5, 8);
    pn.rotateX(tilt); P.add(at(pn, sx * 0.0104, -0.012, -0.004), C.rubber, M.rubber);
  }
  // beavertail + back strap
  const bt = superEllipsoid(0.0118, 0.012, 0.016, 0.5, 0.6, 8, 5, (q) => { if (q.z < 0) q.y -= 0.006 * (q.z / 0.016) ** 2; });
  bt.rotateX(tilt - 0.35); P.add(at(bt, 0, 0.042, -0.018), C.darker, M.satin);
  // base plate (flared magazine foot)
  const base = superEllipsoid(0.0138, 0.0048, 0.0188, 0.45, 0.5, 10, 4);
  base.rotateX(tilt); P.add(at(base, 0, -0.062, -0.018), opt.baseCol || C.dark, M.gloss);
  // trigger guard (loop in front of the index finger) + trigger blade
  const g0 = new V3(0, 0.03, 0.012), g1 = new V3(0, 0.018, 0.043), g2 = new V3(0, 0.002, 0.05), g3 = new V3(0, -0.006, 0.028);
  const guard = sweep([g0, g1, g2, g3], { seg: 8, radial: 5, capSteps: 2, radius: () => 0.0032, flat: 1.9, outward: (Pp, o) => o.set(1, 0, 0) });
  P.add(guard.geo, C.dark, M.satin);
  const trig = superEllipsoid(0.0034, 0.0105, 0.0034, 0.7, 0.7, 6, 6, (q) => { q.z += 16 * q.y * q.y; });
  trig.rotateX(-0.25); (opt.T || P).add(at(trig, 0, 0.0215, 0.0305), C.metal, M.metal);
}
const GRIP_PISTOL = { pos: new V3(0, 0, 0), handZ: GRIP_AXIS.clone(), handY: new V3(0, 0.25, -1) };
/** Trigger blade hinge (top of the blade, inside the frame): the trigger part squeezes back about +X here. */
const TRIGGER_PIVOT = new V3(0, 0.0315, 0.0282);

// ---------------------------------------------------------------------------------------------- shooter
function buildShooter() {
  const P = new Parts(), I = new Parts(), T = new Parts(), BOLT = new Parts(), CAN = new Parts(), LED = new Parts();
  pistolGrip(P, { T });
  // receiver: cream shell, dark lower frame, team-ink spine
  const recv = superEllipsoid(0.0265, 0.034, 0.1, 0.42, 0.56, 14, 10, (q) => {
    if (q.z > 0.045) q.y *= 1 - 0.3 * (q.z - 0.045) / 0.055;          // taper to the nose
    if (q.y > 0) q.x *= 1 - 0.12 * (q.y / 0.034);                       // tumblehome
  });
  P.add(at(recv, 0, 0.068, 0.028), C.cream, M.satin);
  const frame = superEllipsoid(0.0232, 0.012, 0.094, 0.4, 0.5, 12, 6);
  P.add(at(frame, 0, 0.041, 0.03), C.dark, M.satin);
  const spine = superEllipsoid(0.0165, 0.0065, 0.086, 0.5, 0.6, 12, 5);
  I.add(at(spine, 0, 0.1005, 0.02));
  // panel seams + screws on both flanks, squid decal + chevrons on the left flank
  for (const sx of [1, -1]) {
    const seam = superEllipsoid(0.0006, 0.0205, 0.0006, 1, 1, 4, 6); P.add(at(seam, sx * 0.0262, 0.069, 0.052), C.darker, M.print);
    const seam2 = superEllipsoid(0.0006, 0.0006, 0.054, 1, 1, 4, 6); P.add(at(seam2, sx * 0.0258, 0.056, 0.016), C.darker, M.print);
    for (const [y, z] of [[0.078, -0.052], [0.078, 0.036], [0.05, 0.094]]) screw(P, new V3(sx * 0.026, y, z), new V3(sx, 0, 0), 0.0028);
  }
  const sq = decal(squidShape(0.028)); placeXY(sq, new V3(0, 0, -1), new V3(0, 1, 0), new V3(0.0272, 0.074, -0.012)); P.add(sq, C.decal, M.print);
  for (const s of chevronShape(0.03, 0.009, 3, 0.45)) { const g = decal(s); placeXY(g, new V3(0, 0, 1), new V3(0, 1, 0), new V3(0.0268, 0.052, 0.036)); I.add(g); }
  // nozzle assembly: turned barrel, vented shroud, team ring, flared tip
  const barrel = latheZ(smoothProfile([[0.0, 0.1], [0.0138, 0.1], [0.0138, 0.118], [0.0156, 0.121], [0.0156, 0.162], [0.0138, 0.166], [0.0125, 0.17], [0.0125, 0.184]], 10).concat([[0.0152, 0.187], [0.019, 0.199], [0.0198, 0.207], [0.0186, 0.2118], [0.0128, 0.2122], [0.0098, 0.207], [0.0082, 0.196], [0.0, 0.194]]), 12);
  P.add(at(barrel, 0, 0.066, 0), C.gunmetal, M.metal);
  for (let k = 0; k < 3; k++) { const v = torus(0.0158, 0.0013, 3, 12); P.add(at(v, 0, 0.066, 0.127 + k * 0.012), C.darker, M.satin); }
  const nr = torus(0.0145, 0.0034, 4, 14); I.add(at(nr, 0, 0.066, 0.176));
  // ink canister on top: team ink visible between cage bars, caps + valve
  const can = latheZ(smoothProfile([[0.0, -0.052], [0.0178, -0.05], [0.0184, -0.04], [0.0184, 0.04], [0.0178, 0.05], [0.0, 0.052]], 7), 12);
  CAN.add(at(can, 0, 0.123, 0.018));
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
    const bar = superEllipsoid(0.0026, 0.0026, 0.044, 0.6, 0.6, 4, 4);
    P.add(at(bar, Math.cos(a) * 0.0196, 0.123 + Math.sin(a) * 0.0196, 0.018), C.dark, M.satin);
  }
  for (const [z, s] of [[-0.036, -1], [0.072, 1]]) {
    const cap = latheZ([[0, -0.009 * s], [0.0206, -0.009 * s], [0.0218, -0.004 * s], [0.0218, 0.006 * s], [0.018, 0.0095 * s], [0, 0.01 * s]], 12);
    P.add(at(cap, 0, 0.123, z), C.dark, M.gloss);
  }
  const valve = lathe([[0, 0], [0.0052, 0], [0.0052, 0.006], [0.0078, 0.0075], [0.0078, 0.011], [0, 0.0115]], 8);
  P.add(at(valve, 0, 0.143, -0.028), C.metal, M.metal);
  const mount = superEllipsoid(0.0118, 0.012, 0.05, 0.5, 0.6, 8, 5); P.add(at(mount, 0, 0.105, 0.018), C.dark, M.satin);
  // sights + status LED
  const rear = superEllipsoid(0.0105, 0.0065, 0.0052, 0.4, 0.4, 6, 4, (q) => { if (q.y > 0.002 && Math.abs(q.x) < 0.003) q.y = 0.002; });
  P.add(at(rear, 0, 0.148, -0.03), C.darker, M.satin);
  const front = superEllipsoid(0.0022, 0.0078, 0.004, 0.6, 0.6, 5, 4); P.add(at(front, 0, 0.1485, 0.068), C.darker, M.satin);
  const led = superEllipsoid(0.0032, 0.0032, 0.0016, 1, 1, 8, 4); LED.add(orient(led, new V3(-1, 0, 0), new V3(-0.0268, 0.084, -0.046)), C.green, M.led);
  const ledBezel = torus(0.0036, 0.0009, 3, 10); P.add(orient(ledBezel.rotateX(Math.PI / 2), new V3(-1, 0, 0), new V3(-0.0266, 0.084, -0.046)), C.darker, M.satin);
  // rear cap + cocking knob
  const back = superEllipsoid(0.0232, 0.028, 0.0095, 0.45, 0.55, 10, 6); P.add(at(back, 0, 0.068, -0.075), C.dark, M.gloss);
  const knob = latheZ([[0, -0.0145], [0.0068, -0.0145], [0.0074, -0.01], [0.0074, 0.0], [0, 0.0]], 10); BOLT.add(at(knob, 0, 0.068, -0.078), C.metal, M.metal);
  for (let k = 0; k < 3; k++) BOLT.add(at(torus(0.0075, 0.0007, 3, 10), 0, 0.068, -0.0905 + k * 0.0035), C.gunmetal, M.metal);   // knurl rings
  const guide = latheZ([[0.0, -0.0835], [0.0086, -0.0835], [0.0092, -0.081], [0.0, -0.0805]], 12); P.add(at(guide, 0, 0.068, 0), C.darker, M.gloss);   // bolt guide collar
  // support foregrip for the left hand (vertical, under the nose)
  const fg = superEllipsoid(0.0118, 0.028, 0.0132, 0.55, 0.65, 10, 8, (q) => { if (q.z > 0) { const f = 0.5 + 0.5 * Math.cos((q.y / 0.0125) * Math.PI * 2); q.z -= 0.0012 * f; } });
  fg.rotateX(-0.12); P.add(at(fg, 0, 0.016, 0.07), C.darker, M.satin);
  const fgr = superEllipsoid(0.0124, 0.0175, 0.0095, 0.5, 0.55, 8, 6); fgr.rotateX(-0.12); P.add(at(fgr, 0, 0.012, 0.069), C.rubber, M.rubber);
  const fgCap = superEllipsoid(0.0134, 0.0042, 0.0152, 0.5, 0.5, 10, 4); P.add(at(fgCap, 0, -0.0125, 0.074), C.dark, M.gloss);
  return {
    kind: 'shooter', body: P.build(), ink: I.build(),
    parts: {
      trigger: part(T, TRIGGER_PIVOT),
      bolt: part(BOLT, new V3(0, 0.068, -0.078)),
      can: part(CAN, new V3(0, 0.123, 0.018), 'ink'),
      led: part(LED, new V3(-0.0268, 0.084, -0.046), 'lamp', { color: '#0f2a18', emissive: '#3dff7a', intensity: 1.3 }),
    },
    muzzle: new V3(0, 0.066, 0.212),
    gripR: GRIP_PISTOL,
    gripL: { pos: new V3(0, 0.02, 0.0705), handZ: new V3(0, 1, -0.12), handY: new V3(0.45, -0.05, -1) },
    twirl: new V3(0, 0.03, 0.03),
  };
}

// ---------------------------------------------------------------------------------------------- roller
function buildRoller() {
  const P = new Parts(), I = new Parts(), LED = new Parts();
  const L = 0.84; // grip -> drum axis
  // shaft: brushed tube, ferrules, two knurled rubber grips (top = right hand, mid = left hand)
  P.add(latheZ([[0, -0.072], [0.0098, -0.072], [0.0098, 0.715], [0, 0.715]], 10), C.metal, M.metal);
  const topGrip = latheZ(smoothProfile([[0, -0.094], [0.0112, -0.094], [0.0148, -0.086], [0.0142, -0.07], [0.0136, -0.03], [0.0138, 0.02], [0.0142, 0.052], [0.0158, 0.06], [0.0118, 0.066]], 10), 12);
  P.add(topGrip, C.rubber, M.rubber);
  const cap = latheZ([[0, -0.1], [0.0118, -0.0985], [0.0142, -0.094], [0, -0.094]], 12); P.add(cap, C.dark, M.gloss);
  I.add(at(torus(0.0142, 0.0028, 5, 14), 0, 0, 0.066));
  const midGrip = latheZ(smoothProfile([[0.0098, 0.13], [0.0136, 0.136], [0.0142, 0.15], [0.0138, 0.2], [0.0142, 0.235], [0.0136, 0.25], [0.0098, 0.256]], 8), 10);
  P.add(midGrip, C.rubber, M.rubber);
  for (const z of [0.128, 0.258]) I.add(at(torus(0.0118, 0.0022, 4, 12), 0, 0, z));
  // hazard band + squid decal wrapped on the shaft
  for (let k = 0; k < 5; k++) { const band = latheZ([[0.0101, 0], [0.0101, 0.008]], 8); P.add(at(band, 0, 0, 0.34 + k * 0.016), k % 2 ? C.dark : C.hazard, M.print); }
  // yoke: cast hub, twin swept arms, bearing bosses with bolt circles, ink reservoir with a window
  const hub = superEllipsoid(0.026, 0.024, 0.036, 0.5, 0.6, 12, 8); P.add(at(hub, 0, 0, 0.716), C.dark, M.satin);
  const collar = latheZ([[0.0098, 0.69], [0.0162, 0.692], [0.0168, 0.702], [0.0098, 0.704]], 12); P.add(collar, C.metal, M.metal);
  for (const sx of [1, -1]) {
    const arm = sweep([new V3(0, 0, 0.712), new V3(0.13 * sx, -0.004, 0.734), new V3(0.285 * sx, -0.012, 0.768), new V3(0.328 * sx, -0.02, 0.808), new V3(0.334 * sx, -0.022, L)], {
      seg: 12, radial: 7, capSteps: 2, radius: (t) => 0.0122 - 0.002 * t, flat: 0.62, outward: (Pp, o) => o.set(0, 1, 0),
    });
    P.add(arm.geo, C.gunmetal, M.metal);
    const boss = latheZ([[0, -0.014], [0.0262, -0.014], [0.0282, -0.01], [0.0284, 0.008], [0.025, 0.013], [0, 0.013]], 12);
    boss.rotateY(Math.PI / 2); P.add(at(boss, 0.322 * sx, -0.022, L), C.dark, M.gloss);
    for (let k = 0; k < 5; k++) { const a = (k / 5) * Math.PI * 2; screw(P, new V3(0.3355 * sx, -0.022 + Math.cos(a) * 0.017, L + Math.sin(a) * 0.017), new V3(sx, 0, 0), 0.0024); }
  }
  const res = superEllipsoid(0.056, 0.026, 0.036, 0.55, 0.6, 12, 7); I.add(at(res, 0, 0.03, 0.738));
  const resFrame = superEllipsoid(0.06, 0.009, 0.04, 0.4, 0.5, 14, 4); P.add(at(resFrame, 0, 0.052, 0.738), C.dark, M.gloss);
  const resBase = superEllipsoid(0.06, 0.008, 0.04, 0.4, 0.5, 14, 4); P.add(at(resBase, 0, 0.008, 0.738), C.dark, M.satin);
  for (const sx of [1, -1]) for (const sz of [1, -1]) { const post = superEllipsoid(0.004, 0.02, 0.004, 0.7, 0.7, 5, 5); P.add(at(post, sx * 0.05, 0.03, 0.738 + sz * 0.028), C.dark, M.satin); }
  const vcap = lathe([[0, 0], [0.009, 0], [0.0098, 0.004], [0.0082, 0.0085], [0, 0.009]], 10); P.add(at(vcap, 0.028, 0.06, 0.738), C.metal, M.metal);
  const led = superEllipsoid(0.0036, 0.0022, 0.0036, 1, 1, 8, 4); LED.add(at(led, -0.03, 0.062, 0.738), C.amber, M.led);
  const sq = decal(squidShape(0.032)); placeXY(sq, new V3(1, 0, 0), new V3(0, 0.3, -1), new V3(0, 0.0605, 0.738)); P.add(sq, C.decal, M.print);
  // drum (separate spinning mesh): axis along X, centred at origin; lumpy wet ink with raised tread ribs
  const drumProf = smoothProfile([[0.0, -0.3], [0.07, -0.3], [0.09, -0.296], [0.099, -0.283], [0.1015, -0.25], [0.1015, 0.25], [0.099, 0.283], [0.09, 0.296], [0.07, 0.3], [0.0, 0.3]], 16);
  const drum = lathe(drumProf, 26, (v) => {
    const a = Math.atan2(v.z, v.x); const rr = Math.hypot(v.x, v.z);
    if (rr > 0.085) {
      let k = 1 + 0.03 * Math.sin(a * 7 + v.y * 21) * Math.sin(a * 3 - v.y * 13);
      k += 0.018 * Math.max(0, Math.cos(v.y * 42)) * (Math.abs(v.y) < 0.26 ? 1 : 0);   // tread ribs
      v.x *= k; v.z *= k;
    }
  });
  drum.rotateZ(Math.PI / 2);
  const caps = new Parts();
  for (const sx of [1, -1]) {
    const c = latheZ([[0, -0.007], [0.074, -0.007], [0.081, -0.002], [0.081, 0.003], [0.064, 0.008], [0.03, 0.009], [0.018, 0.013], [0, 0.013]], 16);
    c.rotateY(sx * Math.PI / 2); caps.add(at(c, 0.302 * sx, 0, 0), C.dark, M.gloss);
    for (let k = 0; k < 4; k++) { const a = (k / 4) * Math.PI * 2 + 0.4; const b = lathe([[0, 0], [0.0042, 0], [0.0042, 0.002], [0, 0.0028]], 5); caps.add(orient(b, new V3(sx, 0, 0), new V3(0.3085 * sx + 0.002 * sx, Math.cos(a) * 0.05, Math.sin(a) * 0.05)), C.metal, M.metal); }
    const hubC = latheZ([[0, 0], [0.016, 0], [0.018, 0.006], [0.012, 0.012], [0, 0.013]], 10); hubC.rotateY(sx * Math.PI / 2); caps.add(at(hubC, 0.309 * sx, 0, 0), C.metal, M.metal);
  }
  return {
    kind: 'roller', body: P.build(), ink: I.build(), drum, drumCaps: caps.build(), drumAt: new V3(0, -0.022, L), drumR: 0.1,
    parts: { led: part(LED, new V3(-0.03, 0.062, 0.738), 'lamp', { color: '#3a2600', emissive: '#ffb000', intensity: 0.6 }) },
    muzzle: new V3(0, -0.022, L),
    gripR: { pos: new V3(0, 0, -0.022), handZ: new V3(0, 0, 1), handY: new V3(-0.3, 1, 0) },
    gripL: { pos: new V3(0, 0, 0.19), handZ: new V3(0, 0, 1), handY: new V3(0.5, 1, 0) },
    twirl: new V3(0, 0, 0),
  };
}

// ---------------------------------------------------------------------------------------------- charger
function buildCharger() {
  const P = new Parts(), I = new Parts(), G = new Parts(), T = new Parts(), BOLT = new Parts(), LENS = new Parts(), EYE = new Parts(), PORTS = new Parts();
  pistolGrip(P, { T });
  // receiver: long white body with a team-ink spine and dark rails
  const rec = superEllipsoid(0.0255, 0.038, 0.13, 0.4, 0.56, 14, 10, (q) => { if (q.z > 0.07) q.y *= 1 - 0.3 * (q.z - 0.07) / 0.06; if (q.y > 0) q.x *= 1 - 0.1 * q.y / 0.038; });
  P.add(at(rec, 0, 0.062, 0.035), C.white, M.satin);
  const recLow = superEllipsoid(0.0225, 0.011, 0.12, 0.4, 0.5, 12, 5); P.add(at(recLow, 0, 0.034, 0.04), C.dark, M.satin);
  const spine = superEllipsoid(0.0155, 0.0058, 0.11, 0.5, 0.6, 12, 5); I.add(at(spine, 0, 0.0975, 0.03));
  for (const sx of [1, -1]) {
    for (const [y, z] of [[0.07, -0.065], [0.07, 0.03], [0.07, 0.125]]) screw(P, new V3(sx * 0.0252, y, z), new V3(sx, 0, 0), 0.0026);
    const seam = superEllipsoid(0.0006, 0.0006, 0.095, 1, 1, 4, 6); P.add(at(seam, sx * 0.0248, 0.05, 0.035), C.darker, M.print);
  }
  const sq = decal(squidShape(0.026)); placeXY(sq, new V3(0, 0, -1), new V3(0, 1, 0), new V3(0.026, 0.066, -0.02)); P.add(sq, C.decal, M.print);
  // charging handle on the outer (right) flank: a machined slot with a T-knob that draws back as the charge builds
  const slot = superEllipsoid(0.0014, 0.0034, 0.0215, 0.5, 0.5, 6, 6); P.add(at(slot, -0.0252, 0.079, -0.0255), C.darker, M.satin);
  const slotRim = superEllipsoid(0.0009, 0.0048, 0.0235, 0.4, 0.5, 6, 6); P.add(at(slotRim, -0.0247, 0.079, -0.0255), C.gunmetal, M.metal);
  const stem = latheZ([[0, 0], [0.0024, 0], [0.0024, 0.011], [0, 0.011]], 8); stem.rotateY(-Math.PI / 2); BOLT.add(at(stem, -0.0245, 0.079, -0.008), C.metal, M.metal);
  const cap = superEllipsoid(0.0034, 0.0052, 0.0052, 0.6, 0.7, 8, 6); BOLT.add(at(cap, -0.0372, 0.079, -0.008), C.dark, M.gloss);
  const capRing = torus(0.0046, 0.0008, 3, 12); capRing.rotateY(Math.PI / 2); BOLT.add(at(capRing, -0.0358, 0.079, -0.008), C.metal, M.metal);
  // skeletal stock + rubber butt pad + cheek rest
  const stockTop = superEllipsoid(0.0115, 0.009, 0.088, 0.5, 0.6, 8, 5); stockTop.rotateX(0.04); P.add(at(stockTop, 0, 0.066, -0.17), C.dark, M.satin);
  const stockLow = sweep([new V3(0, 0.03, -0.09), new V3(0, 0.012, -0.16), new V3(0, 0.004, -0.228), new V3(0, 0.012, -0.252)], { seg: 8, radial: 6, capSteps: 2, radius: () => 0.0072, flat: 1.6, outward: (Pp, o) => o.set(1, 0, 0) });
  P.add(stockLow.geo, C.dark, M.satin);
  const cheek = superEllipsoid(0.0128, 0.006, 0.04, 0.5, 0.6, 8, 4); P.add(at(cheek, 0, 0.078, -0.16), C.rubber, M.rubber);
  const pad = superEllipsoid(0.0138, 0.042, 0.0078, 0.45, 0.55, 8, 8); pad.rotateX(0.08); P.add(at(pad, 0, 0.038, -0.262), C.rubber, M.rubber);
  // long barrel: fluted sleeve, charge coil (glow), muzzle brake with ports
  const barrel = latheZ(smoothProfile([[0, 0.14], [0.0122, 0.14], [0.0122, 0.61], [0.0128, 0.622]], 6).concat([[0.0178, 0.626], [0.0182, 0.672], [0.0165, 0.684], [0.0096, 0.684], [0.0, 0.68]]), 10);
  P.add(at(barrel, 0, 0.058, 0), C.gunmetal, M.metal);
  for (let k = 0; k < 2; k++) { const port = superEllipsoid(0.0186, 0.0026, 0.004, 0.6, 0.6, 8, 4); PORTS.add(at(port, 0, 0.058, 0.642 + k * 0.016), C.darker, M.satin); }
  const guard = superEllipsoid(0.0232, 0.026, 0.1, 0.42, 0.56, 12, 8, (q) => { if (q.y < 0) q.x *= 0.92; });
  P.add(at(guard, 0, 0.046, 0.23), C.white, M.satin);
  for (let k = 0; k < 3; k++) { const vent = superEllipsoid(0.0236, 0.0028, 0.012, 0.6, 0.6, 8, 4); P.add(at(vent, 0, 0.056, 0.196 + k * 0.026), C.darker, M.satin); }
  for (let i = 0; i < 4; i++) { const c = torus(0.0232, 0.0056, 5, 14); G.add(at(c, 0, 0.058, 0.365 + i * 0.047), '#ffffff'); }
  const coilCore = latheZ([[0.0168, 0.343], [0.0178, 0.35], [0.0178, 0.522], [0.0168, 0.53]], 12); P.add(at(coilCore, 0, 0.058, 0), C.darker, M.metal);
  for (const z of [0.34, 0.534]) { const r = latheZ([[0.0122, z - 0.006], [0.028, z - 0.005], [0.029, z], [0.028, z + 0.005], [0.0122, z + 0.006]], 12); P.add(at(r, 0, 0.058, 0), C.dark, M.gloss); }
  // underslung handguard for the left hand (horizontal grip)
  const hg = latheZ(smoothProfile([[0.0, 0.176], [0.0112, 0.178], [0.0132, 0.186], [0.0134, 0.236], [0.0128, 0.252], [0.0, 0.256]], 8), 12);
  P.add(at(hg, 0, 0.004, 0), C.rubber, M.rubber);
  const hgMount = superEllipsoid(0.008, 0.012, 0.03, 0.5, 0.6, 6, 5); P.add(at(hgMount, 0, 0.018, 0.216), C.dark, M.satin);
  // scope: tube, turrets, lens + sunshade, mounts
  const scope = latheZ(smoothProfile([[0, -0.052], [0.0182, -0.051], [0.0196, -0.038], [0.0162, -0.022], [0.0162, 0.104], [0.021, 0.124], [0.0225, 0.158], [0.0205, 0.162], [0.0, 0.16]], 9), 14);
  P.add(at(scope, 0, 0.122, 0), C.dark, M.satin);
  const lens = superEllipsoid(0.0192, 0.0192, 0.003, 1, 1, 12, 4); LENS.add(at(lens, 0, 0.122, 0.1605), C.lens, M.lens);
  const lensB = superEllipsoid(0.0158, 0.0158, 0.0024, 1, 1, 10, 4); EYE.add(at(lensB, 0, 0.122, -0.0525), C.lens, M.lens);
  const reticle = superEllipsoid(0.0142, 0.0004, 0.0003, 1, 1, 6, 4); P.add(at(reticle.clone(), 0, 0.122, 0.1638), C.darker, M.print);
  P.add(at(reticle.rotateZ(Math.PI / 2), 0, 0.122, 0.1638), C.darker, M.print);   // crosshair etched on the objective
  I.add(at(torus(0.0212, 0.0022, 3, 14), 0, 0.122, 0.157));
  for (const [dir, p] of [[new V3(0, 1, 0), new V3(0, 0.1375, 0.04)], [new V3(1, 0, 0), new V3(0.0155, 0.122, 0.04)]]) {
    const t = lathe([[0, 0], [0.0074, 0], [0.0076, 0.006], [0.0066, 0.0085], [0, 0.009]], 10); P.add(orient(t, dir, p), C.metal, M.metal);
  }
  for (const z of [-0.005, 0.085]) { const m = superEllipsoid(0.0092, 0.0162, 0.0105, 0.5, 0.6, 6, 5); P.add(at(m, 0, 0.102, z), C.dark, M.satin); }
  // visible ink cartridge under the receiver (windowed)
  const can = superEllipsoid(0.0158, 0.0158, 0.036, 1, 1, 10, 7); I.add(at(can, 0, 0.012, 0.118));
  for (let k = 0; k < 3; k++) { const a = (k / 3) * Math.PI * 2 + 0.5; const bar = superEllipsoid(0.0024, 0.0024, 0.032, 0.6, 0.6, 4, 4); P.add(at(bar, Math.cos(a) * 0.0172, 0.012 + Math.sin(a) * 0.0172, 0.118), C.dark, M.satin); }
  for (const z of [0.082, 0.154]) { const c = latheZ([[0, z - 0.004], [0.0182, z - 0.004], [0.0186, z + 0.004], [0, z + 0.004]], 12); P.add(at(c, 0, 0.012, 0), C.dark, M.gloss); }
  // coil rings light in order (rear → muzzle): per-vertex aSeg threshold for makeCoilMaterial
  const glow = G.build();
  {
    const pz = glow.attributes.position, seg = new Float32Array(pz.count), TH = [0.22, 0.47, 0.72, 0.96];
    for (let i = 0; i < pz.count; i++) seg[i] = TH[Math.max(0, Math.min(3, Math.round((pz.getZ(i) - 0.365) / 0.047)))];
    glow.setAttribute('aSeg', new THREE.Float32BufferAttribute(seg, 1));
  }
  return {
    kind: 'charger', body: P.build(), ink: I.build(), glow,
    parts: {
      trigger: part(T, TRIGGER_PIVOT),
      bolt: part(BOLT, new V3(-0.0245, 0.079, -0.008)),
      lens: part(LENS, new V3(0, 0.122, 0.1605), 'lamp', { color: '#0b0f16', emissive: '#ffffff', intensity: 0.2, roughness: 0.06 }),
      eyepiece: part(EYE, new V3(0, 0.122, -0.0525), 'lamp', { color: '#0b0f16', emissive: '#ffffff', intensity: 0.05, roughness: 0.06 }),
      ports: part(PORTS, new V3(0, 0.058, 0.65), 'lamp', { color: '#1b1e25', emissive: '#ffffff', intensity: 0, roughness: 0.5 }),
    },
    muzzle: new V3(0, 0.058, 0.686),
    gripR: GRIP_PISTOL,
    gripL: { pos: new V3(0, 0.004, 0.214), handZ: new V3(0, 0, 1), handY: new V3(0.75, -0.62, -0.1) },
    twirl: new V3(0, 0.03, 0.03),
  };
}

// ---------------------------------------------------------------------------------------------- blaster
function buildBlaster() {
  const P = new Parts(), I = new Parts(), T = new Parts(), PUMP = new Parts(), NEEDLE = new Parts(), BULB = new Parts();
  pistolGrip(P, { baseCol: C.dark, T });
  // pressurised ink bulb in a cream cage
  const bulb = superEllipsoid(0.066, 0.063, 0.084, 0.85, 0.9, 18, 12); BULB.add(at(bulb, 0, 0.092, 0.072));
  for (const z of [0.022, 0.072, 0.122]) { const r = torus(z === 0.072 ? 0.0655 : 0.058, 0.0068, 5, 20); P.add(at(r, 0, 0.092, z), C.cream, M.gloss); }
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    const rib = sweep([new V3(Math.cos(a) * 0.05, 0.092 + Math.sin(a) * 0.05, -0.006), new V3(Math.cos(a) * 0.069, 0.092 + Math.sin(a) * 0.069, 0.072), new V3(Math.cos(a) * 0.052, 0.092 + Math.sin(a) * 0.052, 0.148)], {
      seg: 8, radial: 4, capSteps: 2, radius: () => 0.0042, flat: 0.7, outward: (Pp, o) => o.set(Pp.x, Pp.y - 0.092, 0).normalize(),
    });
    P.add(rib.geo, C.cream, M.gloss);
  }
  const back = superEllipsoid(0.056, 0.056, 0.024, 0.6, 0.9, 14, 7); P.add(at(back, 0, 0.092, -0.016), C.cream, M.satin);
  const gauge = latheZ([[0, -0.006], [0.0128, -0.006], [0.0132, 0.0], [0.011, 0.002], [0, 0.002]], 14); P.add(at(gauge, 0, 0.092, -0.042), C.metal, M.metal);
  const face = superEllipsoid(0.0105, 0.0105, 0.001, 1, 1, 12, 4); P.add(at(face, 0, 0.092, -0.0445), C.white, M.gloss);
  // dial: 9 ticks over a 250° sweep (major every other), a red over-pressure arc, the needle on its own pivot
  for (let k = 0; k < 9; k++) {
    const a = -2.18 + (k / 8) * 4.36, major = k % 2 === 0, len = major ? 0.0028 : 0.0017;
    const tk = superEllipsoid(major ? 0.00055 : 0.0004, len / 2, 0.0003, 1, 1, 4, 4);
    tk.translate(0, 0.0083 - len / 2, 0); tk.rotateZ(a); P.add(at(tk, 0, 0.092, -0.0457), C.darker, M.print);
  }
  const red = torus(0.0079, 0.0007, 3, 10, 0.7); red.rotateZ(Math.PI / 2 + 1.5); P.add(at(red, 0, 0.092, -0.0457), C.red, M.print);
  const needle = superEllipsoid(0.00085, 0.0046, 0.00045, 0.7, 0.8, 5, 5, (q) => { q.x *= 1 - 0.75 * Math.max(0, q.y / 0.0046); });
  needle.translate(0, 0.0036, 0); NEEDLE.add(at(needle, 0, 0.092, -0.0461), C.red, M.gloss);
  const hub = lathe([[0, 0], [0.0014, 0], [0.0013, 0.0007], [0, 0.0011]], 8); hub.rotateX(-Math.PI / 2); NEEDLE.add(at(hub, 0, 0.092, -0.0459), C.dark, M.gloss);
  // bell muzzle: flared cream horn, dark throat, team lip
  const bell = latheZ(smoothProfile([[0.035, 0.13], [0.041, 0.16], [0.043, 0.2], [0.05, 0.24], [0.064, 0.29], [0.078, 0.325]], 9).concat([[0.082, 0.335], [0.078, 0.345], [0.066, 0.34], [0.05, 0.31], [0.034, 0.28], [0.0, 0.27]]), 18);
  P.add(at(bell, 0, 0.092, 0), C.cream, M.gloss);
  I.add(at(torus(0.078, 0.0068, 5, 18), 0, 0.092, 0.337));
  const inner = latheZ([[0.0, 0.275], [0.03, 0.28], [0.05, 0.305], [0.068, 0.335], [0.0, 0.335]], 16); P.add(at(inner, 0, 0.092, 0.001), C.darker, M.satin);
  for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; const fin = superEllipsoid(0.0024, 0.0125, 0.034, 0.6, 0.6, 4, 5, (q) => { q.y += 0.25 * q.z; }); fin.rotateZ(a); P.add(at(fin, Math.cos(a + Math.PI / 2) * -0.05, 0.092 + Math.sin(a + Math.PI / 2) * -0.05, 0.215), C.bone, M.satin); }
  // top carry rail + sight, side vents, decals
  const rail = superEllipsoid(0.0078, 0.0085, 0.06, 0.5, 0.6, 8, 5); P.add(at(rail, 0, 0.165, 0.05), C.dark, M.satin);
  const sight = superEllipsoid(0.0045, 0.0085, 0.006, 0.5, 0.5, 6, 4); P.add(at(sight, 0, 0.177, 0.088), C.darker, M.satin);
  for (const sx of [1, -1]) {
    for (let k = 0; k < 3; k++) { const v = superEllipsoid(0.002, 0.0026, 0.012, 0.6, 0.6, 4, 4); P.add(at(v, sx * 0.0548, 0.107 - k * 0.012, -0.012), C.darker, M.satin); }
    screw(P, new V3(sx * 0.0562, 0.075, -0.01), new V3(sx, 0, 0), 0.003);
  }
  const sq = decal(squidShape(0.03)); placeXY(sq, new V3(0, 0, -1), new V3(0, 1, 0), new V3(0.0485, 0.098, -0.02)); P.add(sq, C.decal, M.print);
  // pump foregrip for the left hand + slide tube
  const tube = latheZ([[0, 0.04], [0.0092, 0.04], [0.0092, 0.19], [0, 0.19]], 10); P.add(at(tube, 0, 0.012, 0), C.metal, M.metal);
  const stop = latheZ([[0.0092, 0.188], [0.0118, 0.19], [0.0118, 0.196], [0.0092, 0.198]], 12); P.add(at(stop, 0, 0.012, 0), C.dark, M.gloss);   // tube end stop
  const pump = latheZ(smoothProfile([[0.0, 0.118], [0.0118, 0.12], [0.0138, 0.128], [0.0138, 0.176], [0.0126, 0.186], [0.0, 0.188]], 8), 12);
  PUMP.add(at(pump, 0, 0.012, 0), C.rubber, M.rubber);
  for (let k = 0; k < 4; k++) PUMP.add(at(torus(0.0139, 0.0012, 3, 12), 0, 0.012, 0.134 + k * 0.012), C.darker, M.satin);
  const link = superEllipsoid(0.007, 0.022, 0.012, 0.5, 0.6, 6, 6); PUMP.add(at(link, 0, 0.034, 0.152), C.dark, M.satin);
  return {
    kind: 'blaster', body: P.build(), ink: I.build(),
    parts: {
      trigger: part(T, TRIGGER_PIVOT),
      pump: part(PUMP, new V3(0, 0.012, 0.152)),
      needle: part(NEEDLE, new V3(0, 0.092, -0.046)),
      bulb: part(BULB, new V3(0, 0.092, 0.072), 'ink'),
    },
    muzzle: new V3(0, 0.092, 0.345),
    gripR: GRIP_PISTOL,
    gripL: { pos: new V3(0, 0.012, 0.152), handZ: new V3(0, 0, 1), handY: new V3(0.8, -0.55, -0.1) },
    twirl: new V3(0, 0.03, 0.03),
  };
}

// ---------------------------------------------------------------------------------------------- dualies (one pistol)
// "Twinfin Dualies": a compact pistol per hand. Polymer frame + accessory rail, a cream slide that snaps back on every
// shot of its own hand (team-ink dorsal fin + ink window ride on it), turned nozzle, an ink capsule slung under the
// muzzle, rear status LED facing the player. The LEFT hand holds a second instance (def.dual: handL / inHandL below).
function buildDualies() {
  const P = new Parts(), I = new Parts(), T = new Parts(), SL = new Parts(), SLI = new Parts(), LED = new Parts();
  pistolGrip(P, { T, baseCol: C.dark });
  const frame = superEllipsoid(0.0185, 0.0105, 0.072, 0.4, 0.5, 12, 6, (q) => { if (q.z > 0.05) q.y *= 1 - 0.25 * (q.z - 0.05) / 0.022; });
  P.add(at(frame, 0, 0.041, 0.034), C.dark, M.satin);
  const rail = superEllipsoid(0.0105, 0.0035, 0.034, 0.4, 0.4, 8, 4); P.add(at(rail, 0, 0.0282, 0.086), C.darker, M.satin);
  for (let k = 0; k < 4; k++) P.add(at(superEllipsoid(0.0112, 0.0012, 0.0022, 0.6, 0.6, 6, 4), 0, 0.0252, 0.072 + k * 0.009), C.gunmetal, M.metal);
  // ink capsule under the muzzle
  const cap = latheZ(smoothProfile([[0, -0.027], [0.0092, -0.025], [0.0098, -0.017], [0.0098, 0.017], [0.0092, 0.025], [0, 0.027]], 6), 12);
  const CY = 0.0152;
  I.add(at(cap, 0, CY, 0.1));
  for (const z of [0.074, 0.126]) P.add(at(latheZ([[0, z - 0.0035], [0.011, z - 0.0035], [0.0114, z + 0.0035], [0, z + 0.0035]], 12), 0, CY, 0), C.dark, M.gloss);
  for (let k = 0; k < 3; k++) { const a = (k / 3) * Math.PI * 2 + 0.6; P.add(at(superEllipsoid(0.0018, 0.0018, 0.024, 0.6, 0.6, 4, 4), Math.cos(a) * 0.0104, CY + Math.sin(a) * 0.0104, 0.1), C.dark, M.satin); }
  for (const z of [0.08, 0.12]) P.add(at(superEllipsoid(0.0062, 0.0062, 0.0042, 0.6, 0.6, 6, 4), 0, 0.0245, z), C.dark, M.satin);   // clamp lugs to the rail
  // turned nozzle (static; the slide rides over its root)
  const noz = latheZ([[0.0, 0.098], [0.0102, 0.098], [0.0102, 0.126], [0.0118, 0.129], [0.0121, 0.14], [0.0109, 0.144], [0.0076, 0.1465], [0.0064, 0.141], [0.0, 0.14]], 12);
  P.add(at(noz, 0, 0.0645, 0), C.gunmetal, M.metal);
  I.add(at(torus(0.0112, 0.0026, 4, 14), 0, 0.0645, 0.1345));
  // slide (moving): cream shell, serrations, sights, ink window + dorsal fin (ink, rides along)
  const slide = superEllipsoid(0.0198, 0.0165, 0.078, 0.38, 0.55, 14, 8, (q) => { if (q.z > 0.05) q.y *= 1 - 0.22 * (q.z - 0.05) / 0.028; if (q.y > 0) q.x *= 1 - 0.1 * q.y / 0.0165; });
  SL.add(at(slide, 0, 0.0645, 0.03), C.cream, M.satin);
  for (const sx of [1, -1]) for (let k = 0; k < 5; k++) SL.add(at(superEllipsoid(0.0007, 0.0105, 0.0011, 0.8, 0.8, 4, 4), sx * 0.0194, 0.066, -0.043 + k * 0.0048), C.darker, M.satin);
  const rear = superEllipsoid(0.0085, 0.0048, 0.0042, 0.4, 0.4, 6, 4, (q) => { if (q.y > 0.0015 && Math.abs(q.x) < 0.0024) q.y = 0.0015; });
  SL.add(at(rear, 0, 0.0838, -0.036), C.darker, M.satin);
  SL.add(at(superEllipsoid(0.0018, 0.0048, 0.003, 0.6, 0.6, 5, 4), 0, 0.0826, 0.097), C.darker, M.satin);
  SLI.add(at(superEllipsoid(0.0007, 0.0052, 0.0145, 0.7, 0.7, 5, 6), -0.0196, 0.0685, 0.042));
  SLI.add(at(superEllipsoid(0.0007, 0.0052, 0.0145, 0.7, 0.7, 5, 6), 0.0196, 0.0685, 0.042));
  const fin = superEllipsoid(0.0031, 0.0105, 0.026, 0.6, 0.7, 6, 7, (q) => { const h = (q.y + 0.0105) / 0.021; q.z -= 0.024 * h; q.z *= 1 - 0.45 * h; q.x *= 1 - 0.4 * h; });
  SLI.add(at(fin, 0, 0.0865, 0.012));
  // decals + screws on the frame
  const sq = decal(squidShape(0.02)); placeXY(sq, new V3(0, 0, -1), new V3(0, 1, 0), new V3(0.0188, 0.041, 0.02)); P.add(sq, C.decal, M.print);
  for (const s of chevronShape(0.022, 0.0065, 3, 0.45)) { const g = decal(s); placeXY(g, new V3(0, 0, 1), new V3(0, 1, 0), new V3(-0.0188, 0.038, 0.012)); P.add(g, C.hazard, M.print); }
  for (const sx of [1, -1]) screw(P, new V3(sx * 0.0186, 0.043, 0.07), new V3(sx, 0, 0), 0.0024);
  // status LED on the back of the slide (faces the player)
  const led = superEllipsoid(0.0028, 0.0028, 0.0014, 1, 1, 8, 4); LED.add(at(led, 0.009, 0.074, -0.049), C.green, M.led);
  P.add(at(torus(0.0032, 0.0008, 3, 10), 0.009, 0.074, -0.0484), C.darker, M.satin);
  return {
    kind: 'dualies', body: P.build(), ink: I.build(),
    parts: {
      trigger: part(T, TRIGGER_PIVOT),
      slide: part(SL, new V3(0, 0.0645, 0.03)),
      slideInk: part(SLI, new V3(0, 0.0645, 0.03), 'ink'),
      led: part(LED, new V3(0.009, 0.074, -0.049), 'lamp', { color: '#0f2a18', emissive: '#3dff7a', intensity: 1.3 }),
    },
    muzzle: new V3(0, 0.0645, 0.147),
    gripR: GRIP_PISTOL,
    gripL: GRIP_PISTOL,          // dual: the left hand holds its own pistol by the same grip (see getWeaponDef → dual)
    dual: true,
    twirl: new V3(0, 0.03, 0.03),
  };
}

// ---------------------------------------------------------------------------------------------- slosher
// "Tidebucket Slosher": a thick-walled pail on a pitcher handle (right hand), a rubber carry bar under the front of the
// base (left hand, let go for the throw), hoops, a team-ink band, a pour lip, and the ink inside: a static fill plus a
// free surface disc (part 'surface' — kept level against the swing, rippling, drawn down by each throw). Thumb lever on
// the handle ('lever') trips as the ink leaves. Bucket axis = +Y; the throw goes out over the lip (+Z).
function buildSlosher() {
  const P = new Parts(), I = new Parts(), SURF = new Parts(), LEV = new Parts();
  const BZ = 0.148, BY = 0.012;
  const shell = lathe(smoothProfile([[0.0, -0.078], [0.074, -0.078], [0.083, -0.071], [0.1, 0.07], [0.106, 0.088], [0.112, 0.094]], 10)
    .concat([[0.1135, 0.0985], [0.1085, 0.1025], [0.1005, 0.098], [0.0945, 0.085], [0.0785, -0.06], [0.0, -0.062]]), 28);
  P.add(at(shell, 0, BY, BZ), C.cream, M.gloss);
  const wallR = (y) => 0.083 + (0.1 - 0.083) * ((y + 0.071) / 0.141);   // outer wall radius of the shell profile
  for (const y of [-0.045, 0.058]) { const h = torus(wallR(y) + 0.0035, 0.0042, 5, 30); h.rotateX(Math.PI / 2); P.add(at(h, 0, BY + y, BZ), C.dark, M.gloss); }
  const band = lathe([[wallR(-0.022) + 0.0005, -0.024], [wallR(-0.02) + 0.0028, -0.02], [wallR(0.03) + 0.0028, 0.03], [wallR(0.034) + 0.0005, 0.034]], 28); I.add(at(band, 0, BY, BZ));
  // ink run down the outside from the pour lip: three drips hugging the wall, fattest at their tips
  for (const [a, len] of [[0.12, 0.05], [-0.22, 0.034], [0.42, 0.024]]) {
    const y0 = 0.094, y1 = y0 - len, pts = [];
    for (let i = 0; i <= 4; i++) { const y = y0 - (y0 - y1) * (i / 4), r = wallR(y) + 0.0022; pts.push(new V3(Math.sin(a) * r, y, Math.cos(a) * r)); }
    const dr = sweep(pts, { seg: 8, radial: 6, capSteps: 2, radius: (t) => 0.0034 + 0.0032 * t * t, flat: 0.75, outward: (Pp, o) => o.set(Pp.x, 0, Pp.z).normalize() });
    I.add(at(dr.geo, 0, BY, BZ));
  }
  // pour lip at the front of the rim
  const lip = superEllipsoid(0.034, 0.006, 0.02, 0.5, 0.7, 10, 5, (q) => { q.y += 0.18 * q.z; q.x *= 1 - 0.4 * Math.max(0, q.z / 0.02); });
  P.add(at(lip, 0, BY + 0.097, BZ + 0.112), C.cream, M.gloss);
  // the ink: static fill + the free surface (part)
  const fill = lathe([[0.0, -0.059], [0.0775, -0.058], [0.0905, 0.048], [0.0, 0.048]], 24); I.add(at(fill, 0, BY, BZ));
  const surf = superEllipsoid(0.0905, 0.0045, 0.0905, 1, 0.9, 26, 5, (q) => { const r = Math.hypot(q.x, q.z); q.y += 0.0022 * Math.sin(r * 140) * Math.max(0, 1 - r / 0.09); });
  SURF.add(at(surf, 0, BY + 0.05, BZ));
  // pitcher handle: grooved vertical grip on two swept brackets
  const core = superEllipsoid(0.0118, 0.05, 0.0138, 0.62, 0.7, 12, 12, (q) => { if (q.z > 0) { const f = 0.5 + 0.5 * Math.cos((q.y / 0.0125) * Math.PI * 2); q.z -= 0.0015 * f * (Math.abs(q.y) < 0.04 ? 1 : 0); } });
  P.add(core, C.darker, M.satin);
  for (const sx of [1, -1]) { const pn = superEllipsoid(0.0028, 0.036, 0.0105, 0.5, 0.55, 5, 8); P.add(at(pn, sx * 0.0104, 0, -0.002), C.rubber, M.rubber); }
  for (const [y0, y1, z1] of [[0.045, BY + 0.062, BZ - wallR(0.05) + 0.004], [-0.046, BY - 0.05, BZ - wallR(-0.062) + 0.004]]) {
    const br = sweep([new V3(0, y0, 0.002), new V3(0, (y0 + y1) / 2 + (y0 > 0 ? 0.012 : -0.008), z1 * 0.5), new V3(0, y1, z1)], { seg: 8, radial: 6, capSteps: 2, radius: () => 0.0085, flat: 1.5, outward: (Pp, o) => o.set(1, 0, 0) });
    P.add(br.geo, C.dark, M.gloss);
  }
  P.add(at(superEllipsoid(0.0138, 0.0046, 0.0165, 0.45, 0.5, 10, 4), 0, -0.053, -0.001), C.dark, M.gloss);   // pommel
  // thumb lever on top of the handle (trips on the throw)
  const lev = superEllipsoid(0.0072, 0.0026, 0.016, 0.5, 0.6, 6, 4, (q) => { q.y += 0.12 * q.z; }); LEV.add(at(lev, 0, 0.0555, -0.004), C.metal, M.metal);
  // carry bar under the front of the base (left hand): rubber sleeve on two struts
  const bar = latheZ(smoothProfile([[0, -0.036], [0.0104, -0.035], [0.0112, -0.028], [0.0112, 0.028], [0.0104, 0.035], [0, 0.036]], 6), 12);
  bar.rotateY(Math.PI / 2); P.add(at(bar, 0, BY - 0.1, BZ + 0.052), C.rubber, M.rubber);
  for (const sx of [1, -1]) P.add(at(superEllipsoid(0.0045, 0.012, 0.0065, 0.6, 0.6, 5, 5), sx * 0.03, BY - 0.088, BZ + 0.05), C.dark, M.satin);
  // decals: squid glyph on the left flank, wave chevrons on the right
  const sq = decal(squidShape(0.045)); placeXY(sq, new V3(0, 0, -1), new V3(0, 1, 0.06), new V3(0.097, BY + 0.012, BZ)); P.add(sq, C.dark, M.print);
  for (const s of chevronShape(0.05, 0.014, 3, 0.4)) { const g = decal(s); placeXY(g, new V3(0, 0, 1), new V3(0, 1, 0.06), new V3(-0.0975, BY + 0.005, BZ - 0.025)); P.add(g, C.dark, M.print); }
  return {
    kind: 'slosher', body: P.build(), ink: I.build(),
    parts: {
      surface: part(SURF, new V3(0, BY + 0.05, BZ), 'ink'),
      lever: part(LEV, new V3(0, 0.0555, 0.012)),
    },
    muzzle: new V3(0, BY + 0.1, BZ + 0.03),
    gripR: { pos: new V3(0, 0, 0), handZ: new V3(0, 1, 0.1), handY: new V3(0, 0.12, -1) },
    gripL: { pos: new V3(0, BY - 0.1, BZ + 0.052), handZ: new V3(-1, 0, 0), handY: new V3(0.25, -0.85, 0.45) },
    twirl: new V3(0, 0.02, 0.08),
  };
}

// ---------------------------------------------------------------------------------------------- splatling
// "Gyre Splatling": rear pistol grip + vertical foregrip, a vented motor housing, a windowed ink drum on top with an
// 8-segment charge meter on its back face (per-vertex aSeg → makeCoilMaterial, faces the player), and a six-barrel
// cluster ('barrels') that spins up with the charge and screams while it streams.
function buildSplatling() {
  const P = new Parts(), I = new Parts(), T = new Parts(), BAR = new Parts(), G = new Parts();
  pistolGrip(P, { T });
  const hous = superEllipsoid(0.031, 0.04, 0.115, 0.38, 0.55, 14, 10, (q) => { if (q.z > 0.07) q.y *= 1 - 0.28 * (q.z - 0.07) / 0.045; if (q.y > 0) q.x *= 1 - 0.1 * q.y / 0.04; });
  P.add(at(hous, 0, 0.07, 0.055), C.white, M.satin);
  const low = superEllipsoid(0.027, 0.012, 0.105, 0.4, 0.5, 12, 5); P.add(at(low, 0, 0.036, 0.06), C.dark, M.satin);
  const spine = superEllipsoid(0.0165, 0.006, 0.08, 0.5, 0.6, 12, 5); I.add(at(spine, 0, 0.1085, 0.085));
  for (const sx of [1, -1]) {
    for (let k = 0; k < 4; k++) P.add(at(superEllipsoid(0.0012, 0.0062, 0.0105, 0.6, 0.6, 4, 5), sx * 0.0305, 0.07, 0.012 + k * 0.024), C.darker, M.satin);
    for (const [y, z] of [[0.09, -0.04], [0.09, 0.14], [0.046, 0.15]]) screw(P, new V3(sx * 0.0302, y, z), new V3(sx, 0, 0), 0.0026);
  }
  const sq = decal(squidShape(0.026)); placeXY(sq, new V3(0, 0, -1), new V3(0, 1, 0), new V3(0.0308, 0.066, 0.12)); P.add(sq, C.decal, M.print);
  // ink drum on top: windowed cylinder along Z, cage bars, end caps; the charge meter ring on the rear cap
  const DY = 0.148, DZ = 0.045;
  I.add(at(latheZ([[0, -0.052], [0.0395, -0.051], [0.0405, -0.044], [0.0405, 0.044], [0.0395, 0.051], [0, 0.052]], 18), 0, DY, DZ));
  for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2 + 0.26; P.add(at(superEllipsoid(0.0034, 0.0034, 0.047, 0.6, 0.6, 4, 4), Math.cos(a) * 0.0425, DY + Math.sin(a) * 0.0425, DZ), C.dark, M.satin); }
  for (const [z, s] of [[DZ - 0.056, -1], [DZ + 0.056, 1]]) P.add(at(latheZ([[0, -0.007 * s], [0.0455, -0.007 * s], [0.047, -0.002 * s], [0.047, 0.005 * s], [0.042, 0.0085 * s], [0, 0.009 * s]], 20), 0, DY, z), C.dark, M.gloss);
  for (let i = 0; i < 8; i++) {
    const a0 = Math.PI / 2 - (i / 8) * Math.PI * 2 - 0.06, seg = torus(0.03, 0.0042, 4, 6, (Math.PI * 2) / 8 - 0.12);
    seg.rotateZ(a0 - (Math.PI * 2) / 8 + 0.12); G.add(at(seg, 0, DY, DZ - 0.0655), '#ffffff');
  }
  P.add(at(torus(0.03, 0.0062, 4, 24).translate(0, 0, 0.002), 0, DY, DZ - 0.063), C.darker, M.satin);
  // drum feed neck into the housing
  P.add(at(latheZ([[0.012, 0], [0.014, 0.004], [0.014, 0.02], [0.012, 0.024]], 12).rotateX(-Math.PI / 2), 0, 0.104, 0.1), C.metal, M.metal);
  // barrel cluster (spins about Z at y 0.07): six barrels, hex clamp plates, spindle, crown
  const AX = 0.07, R = 0.019;
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    const b = latheZ([[0, 0.17], [0.0074, 0.17], [0.0074, 0.452], [0.0082, 0.456], [0.0082, 0.462], [0.0048, 0.4625], [0, 0.46]], 8);
    BAR.add(at(b, Math.cos(a) * R, AX + Math.sin(a) * R, 0), C.gunmetal, M.metal);
  }
  for (const [z, th] of [[0.19, 0.008], [0.33, 0.006], [0.435, 0.007]]) {
    const plate = latheZ([[0, z - th], [0.031, z - th], [0.0325, z], [0.031, z + th], [0, z + th]], 6); BAR.add(at(plate, 0, AX, 0), C.dark, M.gloss);
  }
  BAR.add(at(latheZ([[0, 0.17], [0.006, 0.17], [0.006, 0.45], [0, 0.45]], 8), 0, AX, 0), C.metal, M.metal);
  I.add(at(torus(0.0325, 0.0028, 4, 18), 0, AX, 0.4375));
  // static shroud + cooling jacket over the barrel roots
  P.add(at(latheZ(smoothProfile([[0.03, 0.165], [0.036, 0.17], [0.037, 0.19], [0.036, 0.255], [0.031, 0.262]], 6), 16), 0, AX, 0), C.white, M.satin);
  for (let k = 0; k < 4; k++) P.add(at(torus(0.0368, 0.0016, 3, 18), 0, AX, 0.2 + k * 0.016), C.darker, M.satin);
  // vertical foregrip for the left hand
  const fg = superEllipsoid(0.0118, 0.03, 0.0132, 0.55, 0.65, 10, 8, (q) => { if (q.z > 0) { const f = 0.5 + 0.5 * Math.cos((q.y / 0.0125) * Math.PI * 2); q.z -= 0.0012 * f; } });
  fg.rotateX(-0.12); P.add(at(fg, 0, 0.0, 0.152), C.darker, M.satin);
  P.add(at(superEllipsoid(0.0124, 0.019, 0.0095, 0.5, 0.55, 8, 6).rotateX(-0.12), 0, -0.004, 0.151), C.rubber, M.rubber);
  P.add(at(superEllipsoid(0.0134, 0.0042, 0.0152, 0.5, 0.5, 10, 4), 0, -0.031, 0.155), C.dark, M.gloss);
  const glow = G.build();
  {
    // meter segments light clockwise from the top as the charge builds: aSeg = segment index / 8 threshold
    const pz = glow.attributes.position, seg = new Float32Array(pz.count);
    for (let i = 0; i < pz.count; i++) {
      let a = Math.atan2(pz.getY(i) - DY, pz.getX(i)); let u = (Math.PI / 2 - a) / (Math.PI * 2); u -= Math.floor(u);
      seg[i] = (Math.floor(u * 8) + 1) / 8 - 0.02;
    }
    glow.setAttribute('aSeg', new THREE.Float32BufferAttribute(seg, 1));
  }
  return {
    kind: 'splatling', body: P.build(), ink: I.build(), glow,
    parts: { trigger: part(T, TRIGGER_PIVOT), barrels: part(BAR, new V3(0, AX, 0.3)) },
    muzzle: new V3(0, AX, 0.466),
    gripR: GRIP_PISTOL,
    gripL: { pos: new V3(0, 0.0, 0.1515), handZ: new V3(0, 1, -0.12), handY: new V3(0.45, -0.05, -1) },
    twirl: new V3(0, 0.03, 0.05),
  };
}

// ---------------------------------------------------------------------------------------------- bucket
/** Slosh pail: a stubby cream pail tipped mouth-forward on a trigger frame. The right fist holds the pistol post of a
 *  D-frame whose top bar arches over the pail; the left fist an underslung loop handle below the front. Ink surges up
 *  the pail and spills over a wide dark pour lip under the mouth. Pail space: axis PA tilts up toward +Z, PU = its up. */
function buildBucket() {
  const P = new Parts(), I = new Parts();
  pistolGrip(P);
  const al = 0.3;
  const PX = new V3(1, 0, 0), PU = new V3(0, Math.cos(al), -Math.sin(al)), PA = new V3(0, Math.sin(al), Math.cos(al));
  const B0 = new V3(0, 0.03, 0.068);                                    // centre of the pail base
  const pail = (g) => placeXY(g, PX, PU, B0);                          // pail-local (x, up, along axis) → weapon space
  const pp = (x, y, z) => B0.clone().addScaledVector(PX, x).addScaledVector(PU, y).addScaledVector(PA, z);
  const rOut = (z) => 0.0605 + 0.123 * (z - 0.012);                    // outer wall radius along the axis
  const rIn = (z) => 0.056 + 0.1265 * (z - 0.028);                     // inner wall radius
  // shell (thick walled, gloss cream), dark liner, rolled rim bead, metal hoops, rubber foot
  P.add(pail(latheZ([[0, 0], [0.05, 0], [0.057, 0.003], [0.0605, 0.012], [0.083, 0.192], [0.0822, 0.198], [0.0778, 0.198], [0.0765, 0.19], [0.056, 0.028], [0.05, 0.022], [0, 0.021]], 28)), C.cream, M.gloss);
  P.add(pail(latheZ([[0, 0.0228], [0.049, 0.0236], [0.0548, 0.0292], [0.0752, 0.191], [0.0738, 0.191], [0.0534, 0.0302], [0.0482, 0.0252], [0, 0.0244]], 28)), C.darker, M.satin);
  P.add(pail(at(torus(0.0806, 0.0064, 6, 28), 0, 0, 0.195)), C.dark, M.gloss);
  for (const z of [0.056, 0.148]) P.add(pail(at(torus(rOut(z) + 0.0006, 0.0036, 5, 28), 0, 0, z)), C.metal, M.metal);
  P.add(pail(latheZ(smoothProfile([[0, -0.009], [0.048, -0.009], [0.058, -0.006], [0.0636, 0.002], [0.0638, 0.012], [0.0606, 0.02]], 8).concat([[0, 0.02]]), 28)), C.rubber, M.rubber);
  P.add(pail(latheZ([[0, -0.0118], [0.042, -0.0118], [0.0455, -0.0098], [0.046, -0.006], [0, -0.006]], 24)), C.dark, M.gloss);   // base plate
  I.add(pail(at(torus(0.0335, 0.0036, 5, 24), 0, 0, -0.0118)));
  P.add(pail(latheZ([[0, -0.0158], [0.0085, -0.0158], [0.0095, -0.013], [0.0095, -0.01], [0, -0.01]], 6)), C.metal, M.metal);  // drain plug
  // ink inside: surges up toward the mouth, then drops over the lip (wavy surface clamps a lathe that fills the liner)
  const surf = (x, z) => (z < 0.15 ? -0.03 + 0.2 * (z - 0.03) : -0.006 - 1.4 * (z - 0.15)) + 0.0032 * Math.sin(x * 95 + z * 60) + 0.0022 * Math.sin(z * 150 - x * 40);
  const fillProf = [[0, 0.027]];
  for (let k = 0; k <= 12; k++) { const z = 0.03 + k * 0.013; fillProf.push([rIn(z) - 0.0045, z]); }
  fillProf.push([0, 0.19]);
  I.add(pail(deformG(latheZ(fillProf, 24), (v) => { v.y = Math.min(v.y, surf(v.x, v.z)); })));
  // pour lip: wide curved scoop under the mouth, flaring out and slightly down; ink tongue spilling over it + drips
  const lipR = (z) => 0.0772 + 0.42 * Math.max(0, z - 0.19);
  const lip = superEllipsoid(0.9, 0.0034, 0.033, 0.5, 0.4, 20, 5, (q) => {
    const th = q.x, z = 0.219 + q.z, r = lipR(z) - q.y;
    q.set(r * Math.sin(th), -r * Math.cos(th), z);
  });
  P.add(pail(lip), C.dark, M.gloss);
  const tongue = superEllipsoid(0.52, 0.0042, 0.036, 0.6, 0.55, 16, 5, (q) => {
    const th = q.x, s = q.z / 0.036;
    const front = 0.236 + 0.007 * Math.cos(th * 9) - 0.05 * th * th;
    const z = 0.172 + (s + 1) * 0.5 * (front - 0.172);
    const r = lipR(z) - 0.0076 - q.y * (1 + 0.35 * Math.sin(th * 7 + z * 80));
    q.set(r * Math.sin(th), -r * Math.cos(th), z);
  });
  I.add(pail(tongue));
  for (const [x, len] of [[0.022, 1], [-0.03, 0.7]]) {
    const hy = 0.0085 * len;
    const d = superEllipsoid(0.0048, hy, 0.0048, 1, 1, 8, 6, (q) => { if (q.y > 0) { const k = 1 - 0.7 * q.y / hy; q.x *= k; q.z *= k; } });
    const R = lipR(0.244) + 0.0034, p = pp(x, -Math.sqrt(R * R - x * x), 0.244);
    I.add(at(d, p.x, p.y - hy * 0.85, p.z));
  }
  // flank ink windows (below the waterline on both sides) + squid decal wrapped on the left flank
  for (const sx of [1, -1]) {
    const psi = sx > 0 ? -0.38 : Math.PI + 0.38, zc = 0.1, r = rOut(zc);
    const place = (g) => { g.rotateY(0.1225); g.rotateZ(psi); return pail(at(g, r * Math.cos(psi), r * Math.sin(psi), zc)); };
    P.add(place(superEllipsoid(0.0028, 0.0125, 0.034, 0.5, 0.45, 8, 6)), C.dark, M.gloss);
    I.add(place(superEllipsoid(0.0034, 0.0085, 0.029, 0.6, 0.5, 8, 6)));
  }
  {
    const zc = 0.1, psc = 0.42;
    const sq = deformG(decal(squidShape(0.032)), (v) => { const z = zc - v.x, r = rOut(z) + 0.0004 + v.z, ps = psc + v.y / r; v.set(r * Math.cos(ps), r * Math.sin(ps), z); });
    P.add(pail(sq), C.decal, M.print);
  }
  const valve = lathe([[0, 0], [0.0058, 0], [0.0058, 0.006], [0.0085, 0.0075], [0.0085, 0.0115], [0, 0.012]], 10);
  P.add(orient(valve, PU, pp(0, rOut(0.034) - 0.001, 0.034)), C.metal, M.metal);
  // trigger frame: dark block over the grip bolted to the pail base, carry bar arching over the pail to the rim
  P.add(at(superEllipsoid(0.02, 0.0145, 0.047, 0.45, 0.55, 10, 6), 0, 0.047, 0.01), C.dark, M.satin);
  for (const sx of [1, -1]) for (const z of [-0.018, 0.026]) screw(P, new V3(sx * seX(0.02, 0.0145, 0.047, 0.45, 0.55, 0.001, z - 0.01), 0.048, z), new V3(sx, 0, 0), 0.0026);
  P.add(orient(superEllipsoid(0.0032, 0.0016, 0.0032, 1, 1, 8, 4), new V3(-1, 0, 0), new V3(-0.0196, 0.052, 0.004)), C.green, M.led);
  const arch = sweep([new V3(0, 0.052, -0.024), new V3(0, 0.108, -0.016), new V3(0, 0.162, 0.024), new V3(0, 0.188, 0.09), new V3(0, 0.192, 0.155), new V3(0, 0.178, 0.216)], {
    seg: 20, radial: 7, capSteps: 2, radius: () => 0.0082, flat: 1.35, outward: (Pp, o) => o.set(1, 0, 0),
  });
  P.add(arch.geo, C.dark, M.satin);
  const sleevePts = []; for (let k = 0; k <= 6; k++) sleevePts.push(arch.curve.getPointAt(0.4 + k * 0.05));
  const sleeve = sweep(sleevePts, { seg: 14, radial: 7, capSteps: 2, radius: (t) => 0.0112 + 0.0007 * Math.cos(t * Math.PI * 14), flat: 1.25, outward: (Pp, o) => o.set(1, 0, 0) });
  P.add(sleeve.geo, C.rubber, M.rubber);
  const foot = superEllipsoid(0.0135, 0.008, 0.013, 0.5, 0.6, 8, 5); foot.rotateX(-al);
  const fp = pp(0, 0.086, 0.196); P.add(at(foot, fp.x, fp.y, fp.z), C.dark, M.gloss);
  // left hand: rubber loop handle slung under the front of the pail
  const loop = sweep([new V3(0, -0.012, 0.117), new V3(0, -0.043, 0.121), new V3(0, -0.05, 0.14), new V3(0, -0.05, 0.19), new V3(0, -0.042, 0.21), new V3(0, -0.002, 0.212)], {
    seg: 16, radial: 7, capSteps: 2, radius: () => 0.0068, flat: 1, outward: (Pp, o) => o.set(1, 0, 0),
  });
  P.add(loop.geo, C.dark, M.satin);
  P.add(at(latheZ(smoothProfile([[0, 0.13], [0.0112, 0.1315], [0.0134, 0.138], [0.0136, 0.188], [0.0126, 0.196], [0, 0.198]], 8), 12), 0, -0.05, 0), C.rubber, M.rubber);
  for (let k = 0; k < 4; k++) P.add(at(torus(0.0137, 0.0011, 3, 12), 0, -0.05, 0.146 + k * 0.012), C.darker, M.satin);
  return {
    kind: 'bucket', body: P.build(), ink: I.build(),
    muzzle: pp(0, -0.07, 0.25),
    gripR: GRIP_PISTOL,
    gripL: { pos: new V3(0, -0.05, 0.164), handZ: new V3(0, 0, 1), handY: new V3(0.8, -0.55, -0.1) },
    twirl: new V3(0, 0.03, 0.03),
  };
}

// ---------------------------------------------------------------------------------------------- spinner
/** Rotary ink cannon: in-line caged ink tank at the back, cream motor housing over the pistol grip, a fat fixed barrel
 *  shroud (left-hand foregrip underneath, motor pod on the right), carry handle on top. The six-barrel cluster in front
 *  is the separate `spin` mesh (authored in weapon space) turning about the axis +Z through `spinAt`. */
function buildSpinner() {
  const P = new Parts(), I = new Parts(), S = new Parts();
  pistolGrip(P);
  const y0 = 0.072, Z0 = 0.25;                                         // cluster axis height, shroud front face
  // housing: cream shell, dark lower frame, team-ink spine
  const HR = [0.034, 0.042, 0.092, 0.42, 0.56], HC = new V3(0, 0.07, 0.03);
  P.add(at(superEllipsoid(HR[0], HR[1], HR[2], HR[3], HR[4], 14, 10), HC.x, HC.y, HC.z), C.cream, M.satin);
  P.add(at(superEllipsoid(0.0305, 0.012, 0.086, 0.4, 0.5, 12, 6), 0, 0.038, 0.03), C.dark, M.satin);
  I.add(at(superEllipsoid(0.019, 0.0065, 0.056, 0.5, 0.6, 12, 5), 0, 0.1105, 0.045));
  const flankX = (y, z) => seX(HR[0], HR[1], HR[2], HR[3], HR[4], y - HC.y, z - HC.z);
  for (const sx of [1, -1]) for (const [y, z] of [[0.094, -0.02], [0.094, 0.085], [0.046, 0.085]]) screw(P, new V3(sx * flankX(y, z), y, z), new V3(sx, 0, 0), 0.0027);
  const sq = decal(squidShape(0.028)); placeXY(sq, new V3(0, 0, -1), new V3(0, 1, 0), new V3(flankX(0.07, 0) + 0.0002, 0.068, 0)); P.add(sq, C.decal, M.print);
  for (const s of chevronShape(0.034, 0.01, 3, 0.45)) { const g = decal(s); placeXY(g, new V3(0, 0, 1), new V3(0, 1, 0), new V3(flankX(0.048, 0.05) + 0.0002, 0.043, 0.03)); I.add(g); }
  P.add(orient(superEllipsoid(0.0034, 0.0016, 0.0034, 1, 1, 8, 4), new V3(-1, 0, 0), new V3(-flankX(0.07, 0), 0.07, 0)), C.amber, M.led);
  // rear ink tank: caged capsule in line with the barrels, dark end caps, metal band + valve
  const tz = -0.108;
  I.add(at(latheZ(smoothProfile([[0, -0.05], [0.033, -0.048], [0.0355, -0.038], [0.0355, 0.038], [0.033, 0.048], [0, 0.05]], 8), 16), 0, y0, tz));
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + Math.PI / 6;
    P.add(at(superEllipsoid(0.0028, 0.0028, 0.044, 0.6, 0.6, 4, 4), Math.cos(a) * 0.0372, y0 + Math.sin(a) * 0.0372, tz), C.dark, M.satin);
  }
  P.add(at(torus(0.0385, 0.0022, 4, 20), 0, y0, tz), C.metal, M.metal);
  P.add(at(latheZ([[0, -0.013], [0.028, -0.013], [0.0375, -0.009], [0.0398, -0.002], [0.0398, 0.006], [0.0365, 0.0095], [0, 0.0095]], 16), 0, y0, tz - 0.052), C.dark, M.gloss);
  P.add(at(latheZ([[0, -0.0095], [0.0365, -0.0095], [0.0398, -0.006], [0.0398, 0.004], [0.036, 0.009], [0, 0.009]], 16), 0, y0, tz + 0.05), C.dark, M.gloss);
  P.add(orient(lathe([[0, 0], [0.0075, 0], [0.0075, 0.006], [0.0105, 0.0078], [0.0105, 0.0135], [0, 0.0142]], 10), new V3(0, 0, -1), new V3(0, y0, tz - 0.064)), C.metal, M.metal);
  // fixed barrel shroud: collar into the housing, cooling fins, team ring at the lip, dark front face
  P.add(at(latheZ([[0, 0.112], [0.051, 0.113], [0.053, 0.12], [0.051, 0.127], [0, 0.128]], 24), 0, y0, 0), C.dark, M.gloss);
  P.add(at(latheZ(smoothProfile([[0, 0.096], [0.036, 0.098], [0.0475, 0.106], [0.0505, 0.122], [0.0505, 0.222], [0.0488, 0.242], [0.044, 0.25]], 10).concat([[0, 0.2505]]), 24), 0, y0, 0), C.cream, M.satin);
  P.add(at(latheZ([[0, Z0 - 0.001], [0.041, Z0 - 0.001], [0.041, Z0 + 0.0015], [0, Z0 + 0.0015]], 20), 0, y0, 0), C.darker, M.satin);
  for (let k = 0; k < 4; k++) P.add(at(torus(0.0508, 0.0019, 4, 24), 0, y0, 0.15 + k * 0.016), C.darker, M.satin);
  I.add(at(torus(0.0478, 0.0034, 5, 24), 0, y0, 0.238));
  // motor pod on the right flank (finned can, metal end cap)
  const mz = 0.172;
  P.add(at(latheZ(smoothProfile([[0, -0.042], [0.012, -0.041], [0.0158, -0.034], [0.0158, 0.034], [0.012, 0.041], [0, 0.042]], 7), 12), -0.046, 0.046, mz), C.dark, M.gloss);
  for (let k = 0; k < 4; k++) P.add(at(torus(0.0162, 0.0014, 3, 12), -0.046, 0.046, mz - 0.024 + k * 0.016), C.darker, M.satin);
  P.add(at(latheZ([[0, 0.0], [0.0085, 0.0], [0.0095, 0.004], [0.007, 0.0075], [0, 0.008]], 10), -0.046, 0.046, mz + 0.041), C.metal, M.metal);
  // carry handle over the housing (rubber pad on top)
  const handle = sweep([new V3(0, 0.104, -0.036), new V3(0, 0.148, -0.024), new V3(0, 0.166, 0.02), new V3(0, 0.166, 0.085), new V3(0, 0.15, 0.13), new V3(0, 0.116, 0.148)], {
    seg: 18, radial: 7, capSteps: 2, radius: () => 0.0085, flat: 1.4, outward: (Pp, o) => o.set(1, 0, 0),
  });
  P.add(handle.geo, C.dark, M.satin);
  const padPts = []; for (let k = 0; k <= 6; k++) padPts.push(handle.curve.getPointAt(0.33 + k * 0.055));
  P.add(sweep(padPts, { seg: 12, radial: 7, capSteps: 2, radius: (t) => 0.011 + 0.0007 * Math.cos(t * Math.PI * 12), flat: 1.3, outward: (Pp, o) => o.set(1, 0, 0) }).geo, C.rubber, M.rubber);
  // left-hand foregrip under the shroud (mounted at both ends so the fingers wrap freely)
  P.add(at(latheZ(smoothProfile([[0, 0.164], [0.0112, 0.166], [0.0134, 0.174], [0.0136, 0.236], [0.0124, 0.244], [0, 0.246]], 8), 12), 0, -0.012, 0), C.rubber, M.rubber);
  for (let k = 0; k < 4; k++) P.add(at(torus(0.0137, 0.0011, 3, 12), 0, -0.012, 0.186 + k * 0.012), C.darker, M.satin);
  for (const z of [0.16, 0.238]) P.add(at(superEllipsoid(0.0085, 0.02, 0.0075, 0.5, 0.6, 6, 5), 0, 0.008, z), C.dark, M.satin);
  // spinning cluster (weapon space, axis through (0, y0) along +Z): toothed drive gear, 6 barrels, clamp + front plates
  const gear = lathe([[0, 0], [0.043, 0], [0.0455, 0.003], [0.0455, 0.013], [0.043, 0.016], [0, 0.016]], 64, (v) => {
    const rr = Math.hypot(v.x, v.z);
    if (rr > 0.04) { const a = Math.atan2(v.z, v.x); const k = 1 + 0.07 * Math.max(-1, Math.min(1, Math.sin(a * 16) * 2.5)); v.x *= k; v.z *= k; }
  });
  gear.rotateX(Math.PI / 2); S.add(at(gear, 0, y0, Z0 + 0.001), C.gunmetal, M.metal);
  S.add(at(latheZ([[0, 0.0], [0.0095, 0.0], [0.0095, 0.19], [0, 0.19]], 10), 0, y0, Z0), C.metal, M.metal);
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2, bx = Math.cos(a) * 0.029, by = y0 + Math.sin(a) * 0.029;
    S.add(at(latheZ([[0, 0.012], [0.0088, 0.012], [0.0088, 0.186], [0.0096, 0.192], [0.0106, 0.2], [0.0106, 0.207], [0.0094, 0.2112], [0.0064, 0.2115], [0.0058, 0.2], [0, 0.199]], 10), bx, by, Z0), C.gunmetal, M.metal);
    S.add(at(latheZ([[0, 0.1995], [0.0055, 0.2], [0.0055, 0.203], [0, 0.203]], 8), bx, by, Z0), C.darker, M.satin);
  }
  S.add(at(latheZ([[0, 0.092], [0.04, 0.092], [0.0435, 0.095], [0.0435, 0.103], [0.04, 0.106], [0, 0.106]], 24), 0, y0, Z0), C.dark, M.gloss);
  S.add(at(latheZ([[0, 0.17], [0.04, 0.17], [0.0438, 0.1735], [0.0438, 0.1825], [0.04, 0.186], [0, 0.186]], 24), 0, y0, Z0), C.cream, M.gloss);
  S.add(at(latheZ([[0, 0.185], [0.012, 0.185], [0.0115, 0.19], [0.008, 0.195], [0, 0.197]], 12), 0, y0, Z0), C.metal, M.metal);
  // hazard index marks (make the rotation readable): on the clamp-plate rim and the front face, between two barrels
  const ia = Math.PI / 6;
  const m1 = superEllipsoid(0.0022, 0.006, 0.0072, 0.6, 0.6, 5, 5); m1.rotateZ(ia);
  S.add(at(m1, Math.cos(ia) * 0.0436, y0 + Math.sin(ia) * 0.0436, Z0 + 0.099), C.hazard, M.print);
  const m2 = superEllipsoid(0.0075, 0.0045, 0.0012, 0.6, 0.6, 6, 4); m2.rotateZ(ia);
  S.add(at(m2, Math.cos(ia) * 0.034, y0 + Math.sin(ia) * 0.034, Z0 + 0.1862), C.hazard, M.print);
  return {
    kind: 'spinner', body: P.build(), ink: I.build(), spin: S.build(), spinAt: new V3(0, y0, Z0),
    muzzle: new V3(0, y0, Z0 + 0.2115),
    gripR: GRIP_PISTOL,
    gripL: { pos: new V3(0, -0.012, 0.205), handZ: new V3(0, 0, 1), handY: new V3(0.75, -0.62, -0.1) },
    twirl: new V3(0, 0.03, 0.03),
  };
}

// ---------------------------------------------------------------------------------------------- twins
/** One of a pair of stubby ink pistols (the character mirrors a copy into the left fist): chunky cream receiver, a caged
 *  ink drum laid across the top, fat flared barrel with a team ring, and a vertical ink vial ahead of the trigger guard
 *  that doubles as the support grip. */
function buildTwins() {
  const P = new Parts(), I = new Parts();
  pistolGrip(P);
  const RR = [0.0272, 0.036, 0.06, 0.42, 0.56], RC = new V3(0, 0.07, 0.01);
  P.add(at(superEllipsoid(RR[0], RR[1], RR[2], RR[3], RR[4], 14, 10, (q) => { if (q.z > 0.028) q.y *= 1 - 0.2 * (q.z - 0.028) / 0.032; }), RC.x, RC.y, RC.z), C.cream, M.satin);
  P.add(at(superEllipsoid(0.0242, 0.0115, 0.058, 0.4, 0.5, 12, 6), 0, 0.04, 0.012), C.dark, M.satin);
  const flankX = (y, z) => seX(RR[0], RR[1], RR[2], RR[3], RR[4], y - RC.y, z - RC.z);
  // cross drum on top (axis X): team ink between dark end caps, two strap bands, metal hubs
  const dc = new V3(0, 0.112, -0.012);
  const drum = latheZ(smoothProfile([[0, -0.027], [0.021, -0.026], [0.0238, -0.019], [0.0238, 0.019], [0.021, 0.026], [0, 0.027]], 8), 18);
  drum.rotateY(Math.PI / 2); I.add(at(drum, dc.x, dc.y, dc.z));
  for (const sx of [1, -1]) {
    const cap = latheZ([[0, -0.0045], [0.0238, -0.0045], [0.026, -0.0015], [0.026, 0.003], [0.022, 0.0058], [0.01, 0.0064], [0, 0.0066]], 18);
    cap.rotateY(sx * Math.PI / 2); P.add(at(cap, dc.x + sx * 0.0265, dc.y, dc.z), C.dark, M.gloss);
    const hub = latheZ([[0, 0], [0.0072, 0], [0.0078, 0.0028], [0.005, 0.0048], [0, 0.005]], 10);
    hub.rotateY(sx * Math.PI / 2); P.add(at(hub, dc.x + sx * 0.032, dc.y, dc.z), C.metal, M.metal);
    const band = torus(0.0246, 0.0021, 4, 20); band.rotateY(Math.PI / 2); P.add(at(band, sx * 0.011, dc.y, dc.z), C.dark, M.satin);
  }
  // barrel: short and fat, vent rings, team ring in the waist, flared tip with a dark bore
  P.add(at(latheZ([[0, 0.058], [0.0158, 0.058], [0.0158, 0.072], [0.0172, 0.075], [0.0172, 0.1], [0.016, 0.104], [0.0186, 0.108], [0.0212, 0.116], [0.0214, 0.122], [0.0196, 0.1255], [0.013, 0.1258], [0.0098, 0.121], [0.0084, 0.113], [0, 0.111]], 14), 0, 0.068, 0), C.gunmetal, M.metal);
  P.add(at(latheZ([[0, 0.108], [0.008, 0.108], [0.008, 0.1142], [0, 0.1142]], 10), 0, 0.068, 0), C.darker, M.satin);
  for (const z of [0.082, 0.092]) P.add(at(torus(0.0174, 0.0012, 3, 14), 0, 0.068, z), C.darker, M.satin);
  I.add(at(torus(0.0166, 0.0032, 4, 14), 0, 0.068, 0.1055));
  // rear cap + cocking knob
  P.add(at(superEllipsoid(0.0245, 0.03, 0.0085, 0.45, 0.55, 10, 6), 0, 0.07, -0.05), C.dark, M.gloss);
  P.add(at(latheZ([[0, -0.011], [0.0066, -0.011], [0.0072, -0.007], [0.0072, 0.0], [0, 0.0]], 10), 0, 0.074, -0.056), C.metal, M.metal);
  // ink vial support grip (tilted like the shooter's foregrip), cage bars, foot cap, socket under the nose
  const vial = (g) => { g.rotateX(-0.12); return at(g, 0, 0.016, 0.072); };
  I.add(vial(lathe(smoothProfile([[0, -0.03], [0.0105, -0.029], [0.012, -0.022], [0.012, 0.024], [0.0105, 0.03], [0, 0.031]], 7), 14)));
  for (let k = 0; k < 4; k++) { const a = (k / 4) * Math.PI * 2 + Math.PI / 4; P.add(vial(at(superEllipsoid(0.0021, 0.025, 0.0021, 0.6, 0.6, 4, 4), Math.cos(a) * 0.0132, 0, Math.sin(a) * 0.0132)), C.dark, M.satin); }
  P.add(vial(lathe([[0, -0.038], [0.0118, -0.038], [0.0142, -0.034], [0.0146, -0.027], [0.0126, -0.023], [0, -0.023]], 14)), C.dark, M.gloss);
  P.add(at(superEllipsoid(0.0165, 0.0105, 0.019, 0.5, 0.6, 10, 5), 0, 0.047, 0.07), C.dark, M.gloss);
  // flank details: squid decal (left), screws, status LED (right)
  const sq = decal(squidShape(0.024)); placeXY(sq, new V3(0, 0, -1), new V3(0, 1, 0), new V3(flankX(0.066, -0.018) + 0.0002, 0.066, -0.018)); P.add(sq, C.decal, M.print);
  for (const sx of [1, -1]) for (const [y, z] of [[0.09, 0.04], [0.048, -0.028]]) screw(P, new V3(sx * flankX(y, z), y, z), new V3(sx, 0, 0), 0.0025);
  P.add(orient(superEllipsoid(0.003, 0.0015, 0.003, 1, 1, 8, 4), new V3(-1, 0, 0), new V3(-flankX(0.08, -0.025), 0.08, -0.025)), C.green, M.led);
  return {
    kind: 'twins', mirrorDual: true, body: P.build(), ink: I.build(),
    muzzle: new V3(0, 0.068, 0.1258),
    gripR: GRIP_PISTOL,
    gripL: { pos: new V3(0, 0.016, 0.072), handZ: new V3(0, 1, -0.12), handY: new V3(0.45, -0.05, -1) },
    twirl: new V3(0, 0.03, 0.03),
  };
}

// ---------------------------------------------------------------------------------------------- brush
/** Deck brush pushed along the ground like the roller (same hand stations on the shaft): ball-knob top grip, ink
 *  canister clipped on the shaft feeding a hose to the head, a lockable knuckle hinge, and a wide cream head canted down
 *  so the bristles meet the ground in the roller's pose. Bristle roots are natural, the tips soaked in team ink.
 *  Head space: HX across, HY up the head toward the hinge, HN out of the broad front face. */
function buildBrush() {
  const P = new Parts(), I = new Parts();
  const KZ = 0.724, be = 0.42;                                          // hinge on the shaft axis, head cant (rad)
  const K = new V3(0, 0, KZ), HX = new V3(1, 0, 0), HY = new V3(0, Math.sin(be), -Math.cos(be)), HN = new V3(0, Math.cos(be), Math.sin(be));
  const head = (g) => placeXY(g, HX, HY, K);
  const hp = (x, y, z) => K.clone().addScaledVector(HX, x).addScaledVector(HY, y).addScaledVector(HN, z);
  // shaft, rubber top grip with a cream ball knob (right hand), mid grip with dark collars (left hand)
  P.add(latheZ([[0, -0.07], [0.0098, -0.07], [0.0098, 0.69], [0, 0.69]], 10), C.metal, M.metal);
  P.add(latheZ(smoothProfile([[0, -0.086], [0.0116, -0.085], [0.0144, -0.076], [0.0138, -0.05], [0.0132, -0.02], [0.0136, 0.02], [0.0142, 0.046], [0.0156, 0.054], [0.0112, 0.06]], 10), 12), C.rubber, M.rubber);
  P.add(at(superEllipsoid(0.02, 0.02, 0.018, 0.85, 1, 14, 10), 0, 0, -0.1), C.cream, M.gloss);
  I.add(at(torus(0.0142, 0.0028, 5, 14), 0, 0, 0.062));
  P.add(latheZ(smoothProfile([[0.0098, 0.13], [0.0136, 0.136], [0.0142, 0.15], [0.0138, 0.19], [0.0142, 0.235], [0.0136, 0.25], [0.0098, 0.256]], 8), 10), C.rubber, M.rubber);
  for (const z of [0.126, 0.26]) P.add(at(latheZ([[0.0098, -0.005], [0.0148, -0.004], [0.0154, 0.0], [0.0148, 0.004], [0.0098, 0.005]], 12), 0, 0, z), C.dark, M.gloss);
  // ink canister clipped on top of the shaft: cage bars, caps, two band clamps
  const cz = 0.418, cy = 0.035;
  I.add(at(latheZ(smoothProfile([[0, -0.082], [0.0172, -0.08], [0.0192, -0.071], [0.0192, 0.071], [0.0172, 0.08], [0, 0.082]], 8), 12), 0, cy, cz));
  for (let k = 0; k < 4; k++) { const a = (k / 4) * Math.PI * 2 + Math.PI / 4; P.add(at(superEllipsoid(0.0024, 0.0024, 0.066, 0.6, 0.6, 4, 4), Math.cos(a) * 0.0203, cy + Math.sin(a) * 0.0203, cz), C.dark, M.satin); }
  for (const s of [-1, 1]) P.add(at(latheZ([[0, -0.009 * s], [0.0205, -0.009 * s], [0.0216, -0.004 * s], [0.0216, 0.006 * s], [0.018, 0.0095 * s], [0, 0.01 * s]], 12), 0, cy, cz + s * 0.078), C.dark, M.gloss);
  for (const z of [0.366, 0.47]) {
    P.add(at(superEllipsoid(0.0118, 0.0215, 0.0085, 0.5, 0.6, 8, 6), 0, 0.016, z), C.dark, M.satin);
    P.add(at(torus(0.0106, 0.0024, 4, 12), 0, 0, z), C.metal, M.metal);
  }
  // feed hose from the canister over the hinge (right side) into a fitting on the head's front face
  const fit = hp(-0.07, -0.036, 0.024);
  P.add(orient(lathe([[0, 0], [0.0078, 0], [0.0078, 0.006], [0.0062, 0.0085], [0.0062, 0.012], [0, 0.0125]], 10), HN, fit), C.metal, M.metal);
  const hose = sweep([new V3(0, 0.036, 0.5), new V3(-0.01, 0.045, 0.56), new V3(-0.045, 0.047, 0.65), new V3(-0.068, 0.036, 0.73), fit.clone().addScaledVector(HN, 0.011)], {
    seg: 18, radial: 6, capSteps: 2, radius: () => 0.0052, flat: 1, outward: (Pp, o) => o.set(0, 1, 0),
  });
  P.add(hose.geo, C.rubber, M.rubber);
  // knuckle hinge: collar, neck hub, gunmetal cheeks rising from the head, pivot pin, nut (right) + fluted lock knob (left)
  P.add(latheZ([[0.0098, 0.664], [0.0162, 0.666], [0.0168, 0.676], [0.0098, 0.678]], 12), C.metal, M.metal);
  P.add(at(superEllipsoid(0.0168, 0.0185, 0.034, 0.5, 0.6, 10, 8), 0, 0, 0.7), C.dark, M.satin);
  for (const sx of [1, -1]) P.add(head(at(superEllipsoid(0.0046, 0.031, 0.02, 0.5, 0.6, 6, 7), sx * 0.0262, -0.018, 0)), C.gunmetal, M.metal);
  const pin = latheZ([[0, -0.036], [0.0082, -0.036], [0.0082, 0.036], [0, 0.036]], 10); pin.rotateY(Math.PI / 2); P.add(at(pin, 0, 0, KZ), C.metal, M.metal);
  const nut = latheZ([[0, 0], [0.0098, 0], [0.0098, 0.0055], [0.0072, 0.0078], [0, 0.008]], 6); nut.rotateY(-Math.PI / 2); P.add(at(nut, -0.0306, 0, KZ), C.metal, M.metal);
  const knob = lathe(smoothProfile([[0, 0], [0.0175, 0.0], [0.0195, 0.005], [0.0185, 0.0125], [0.011, 0.0175], [0, 0.018]], 8), 42, (v) => {
    const rr = Math.hypot(v.x, v.z);
    if (rr > 0.006) { const a = Math.atan2(v.z, v.x); const k = 1 - 0.16 * Math.max(0, Math.cos(a * 7)) ** 2 * Math.min(1, (rr - 0.006) / 0.01); v.x *= k; v.z *= k; }
  });
  P.add(orient(knob, new V3(1, 0, 0), new V3(0.0306, 0, KZ)), C.dark, M.gloss);
  P.add(orient(lathe([[0, 0], [0.0062, 0], [0.0064, 0.0025], [0.004, 0.004], [0, 0.0042]], 10), new V3(1, 0, 0), new V3(0.0484, 0, KZ)), C.metal, M.metal);
  // head block: cream stock with rubber end bumpers, metal ferrule with crimp lines and rivets
  P.add(head(at(superEllipsoid(0.205, 0.0275, 0.026, 0.4, 0.38, 24, 8, (q) => { q.z *= 1 - 0.1 * (q.x / 0.205) ** 2; }), 0, -0.0475, 0)), C.cream, M.gloss);
  for (const sx of [1, -1]) P.add(head(at(superEllipsoid(0.013, 0.031, 0.0285, 0.5, 0.6, 8, 7), sx * 0.2, -0.05, 0)), C.rubber, M.rubber);
  P.add(head(at(superEllipsoid(0.194, 0.022, 0.0212, 0.35, 0.34, 24, 6), 0, -0.092, 0)), C.metal, M.metal);
  for (const y of [-0.08, -0.104]) P.add(head(at(superEllipsoid(0.1948, 0.0012, 0.0216, 0.6, 0.34, 24, 3), 0, y, 0)), C.gunmetal, M.metal);
  for (const x of [-0.14, -0.05, 0.05, 0.14]) for (const s of [1, -1]) screw(P, hp(x, -0.092, s * 0.0212), HN.clone().multiplyScalar(s), 0.0025);
  // back face (toward the kid): ink level window, squid decal, LED, screws; team chevrons on the top edge
  P.add(head(at(superEllipsoid(0.066, 0.0125, 0.0024, 0.5, 0.4, 14, 5), -0.1, -0.047, -0.0252)), C.dark, M.gloss);
  I.add(head(at(superEllipsoid(0.06, 0.0082, 0.003, 0.6, 0.45, 14, 5), -0.1, -0.047, -0.0252)));
  const sq = decal(squidShape(0.03)); placeXY(sq, new V3(-1, 0, 0), new V3(0, 1, 0), new V3(0.1, -0.049, -0.0252)); P.add(head(sq), C.decal, M.print);
  P.add(head(at(superEllipsoid(0.0034, 0.0034, 0.0014, 1, 1, 8, 4), 0.165, -0.047, -0.0254)), C.amber, M.led);
  for (const x of [-0.04, 0.04]) screw(P, hp(x, -0.062, -0.0254), HN.clone().negate(), 0.0028);
  for (const sx of [1, -1]) for (const s of chevronShape(0.05, 0.014, 3, 0.45)) { const g = decal(s); placeXY(g, new V3(sx, 0, 0), new V3(0, 0, -sx), new V3(sx * 0.058, -0.0204, sx * 0.007)); I.add(head(g)); }
  // bristles: three staggered rows of tapered clumps (natural roots, ink-soaked tips), chiselled so the tip line lies on
  // the ground plane of the roller pose; solid cores behind them keep the bed dense
  P.add(head(at(superEllipsoid(0.178, 0.03, 0.0125, 0.5, 0.5, 20, 6), 0, -0.132, 0)), C.bone, M.satin);
  I.add(head(at(superEllipsoid(0.17, 0.026, 0.0105, 0.5, 0.5, 20, 6), 0, -0.186, 0)));
  const rnd = rng(7), NC = 30, W = 0.178;
  [-0.0126, -0.0042, 0.0042, 0.0126].forEach((z0, ri) => {
    const n = ri % 2 ? NC - 1 : NC;
    for (let c = 0; c < n; c++) {
      const x = -W + (c + (ri % 2 ? 0.5 : 0)) * (2 * W / (NC - 1)) + (rnd() - 0.5) * 0.004;
      const zr = z0 + (rnd() - 0.5) * 0.002;
      const dir = new V3((x / W) * 0.09 + (rnd() - 0.5) * 0.06, -1, (z0 / 0.0126) * 0.07 + (rnd() - 0.5) * 0.05).normalize();   // root → tip
      const R0 = new V3(x, -0.104, zr);
      const yTip = -0.221 - 0.257 * (zr + dir.z * 0.117) + (rnd() - 0.5) * 0.009;
      const len = (R0.y - yTip) / -dir.y, up = dir.clone().negate();
      const w = 0.0052 + rnd() * 0.0014;
      P.add(head(orient(superEllipsoid(w, len * 0.26, w * 0.9, 0.45, 1, 5, 4), up, R0.clone().addScaledVector(dir, len * 0.26))), C.bone, M.satin);
      const th = len * 0.29;
      const tip = superEllipsoid(w * 1.12, th, w * 1.02, 0.55, 1, 5, 5, (q) => { const k = 0.62 + 0.19 * (q.y / th + 1); q.x *= k; q.z *= k; });
      I.add(head(orient(tip, up, R0.clone().addScaledVector(dir, len * 0.71))));
    }
  });
  return {
    kind: 'brush', body: P.build(), ink: I.build(),
    muzzle: hp(0, -0.221, 0),
    gripR: { pos: new V3(0, 0, -0.022), handZ: new V3(0, 0, 1), handY: new V3(-0.3, 1, 0) },
    gripL: { pos: new V3(0, 0, 0.19), handZ: new V3(0, 0, 1), handY: new V3(0.5, 1, 0) },
    twirl: new V3(0, 0, 0),
  };
}

// ---------------------------------------------------------------------------------------------- specials (held)
// Held only while a special runs. Same contract as the main weapons (weapon space, grips, muzzle); `spin` like the
// spinner's cluster (plastic only, turns about weapon +Z through spinAt while firing).

/** Twister Zooka: shoulder-fired vortex launcher. A fat cream tube (axis at y = 0.112) over the pistol grip, rubber
 *  shoulder pad under its tail, dark rear venturi, hazard band and a wide flared cream bell whose throat holds a
 *  vortex impeller (`spin`); a caged team-ink canister rides on top in two saddles, a reflex sight on the left, a
 *  vertical foregrip under the front for the left hand. ~0.98 m long (z −0.36 … 0.65). */
function buildZooka() {
  const P = new Parts(), I = new Parts(), S = new Parts();
  pistolGrip(P);
  const yT = 0.112, R = 0.058;
  const T = (g) => at(g, 0, yT, 0);
  // tube + joint collars
  P.add(T(latheZ([[0, -0.282], [R - 0.003, -0.282]].concat(smoothProfile([[R - 0.002, -0.28], [R, -0.27], [R, 0.25], [R + 0.001, 0.4], [R + 0.004, 0.43]], 10), [[0, 0.43]]), 26)), C.cream, M.gloss);
  P.add(T(at(torus(R + 0.003, 0.0062, 5, 26), 0, 0, 0.405)), C.dark, M.gloss);
  P.add(T(at(torus(R + 0.002, 0.0048, 5, 26), 0, 0, -0.262)), C.dark, M.gloss);
  for (let k = 0; k < 6; k++) P.add(T(latheZ([[R + 0.0009, 0.318 + k * 0.013], [R + 0.0009, 0.331 + k * 0.013]], 26)), k % 2 ? C.dark : C.hazard, M.print);
  // rear venturi: dark flared cone with a team rim, darker exhaust throat
  P.add(T(latheZ([[0, -0.268], [R - 0.004, -0.268], [R + 0.001, -0.285], [0.066, -0.326], [0.072, -0.35], [0.0705, -0.358], [0.064, -0.357], [0.054, -0.334], [0.036, -0.312], [0, -0.306]], 26)), C.dark, M.gloss);
  I.add(T(at(torus(0.0705, 0.0048, 5, 26), 0, 0, -0.354)));
  P.add(T(latheZ([[0, -0.309], [0.035, -0.313], [0.052, -0.333], [0, -0.333]], 18)), C.darker, M.satin);
  // flared muzzle bell: cream horn, team lip, dark throat
  const bellOut = smoothProfile([[R + 0.002, 0.425], [R + 0.006, 0.47], [0.07, 0.53], [0.09, 0.585], [0.112, 0.628], [0.12, 0.642]], 10);
  P.add(T(latheZ(bellOut.concat([[0.123, 0.648], [0.119, 0.655], [0.108, 0.652], [0.088, 0.62], [0.066, 0.582], [0.052, 0.556], [0, 0.55]]), 28)), C.cream, M.gloss);
  I.add(T(at(torus(0.118, 0.0072, 6, 28), 0, 0, 0.65)));
  P.add(T(latheZ([[0, 0.5505], [0.0535, 0.5505], [0.0535, 0.5565], [0, 0.558]], 20)), C.darker, M.satin);
  for (let k = 0; k < 4; k++) {  // swirl ribs on the bell (hint of the twister)
    const a0 = k * Math.PI / 2, pts = [];
    for (let i = 0; i <= 8; i++) { const t = i / 8, z = 0.47 + t * 0.15, rr = profR(bellOut, z) + 0.0018, a = a0 + t * 1.3; pts.push(new V3(Math.cos(a) * rr, yT + Math.sin(a) * rr, z)); }
    I.add(sweep(pts, { seg: 16, radial: 5, capSteps: 2, radius: (t) => 0.0042 + 0.0016 * t, flat: 0.7, outward: (Pp, o) => o.set(Pp.x, Pp.y - yT, 0).normalize() }).geo);
  }
  // vortex impeller in the bell (spin): dark hub cone, five twisted vanes (one hazard = index mark), metal tip
  const sz = 0.592;
  S.add(at(latheZ([[0, -0.012], [0.017, -0.012], [0.019, -0.004], [0.014, 0.01], [0.006, 0.022], [0, 0.026]], 14), 0, yT, sz), C.dark, M.gloss);
  for (let k = 0; k < 5; k++) {
    const v = superEllipsoid(0.024, 0.0028, 0.012, 0.6, 0.6, 8, 5, (q) => {
      const a = 0.55 + 8 * (q.x + 0.024), c = Math.cos(a), s = Math.sin(a), y = q.y, z = q.z;
      q.y = y * c - z * s; q.z = y * s + z * c; q.x += 0.037;
    });
    v.rotateZ(k * Math.PI * 2 / 5); S.add(at(v, 0, yT, sz + 0.004), k ? C.cream : C.hazard, M.gloss);
  }
  S.add(at(latheZ([[0, 0.022], [0.0055, 0.022], [0.0045, 0.03], [0, 0.031]], 8), 0, yT, sz), C.metal, M.metal);
  // receiver block over the grip, rubber shoulder pad under the tail
  P.add(at(superEllipsoid(0.026, 0.021, 0.072, 0.45, 0.55, 10, 6), 0, 0.06, 0.012), C.dark, M.satin);
  for (const sx of [1, -1]) for (const z of [-0.03, 0.05]) screw(P, new V3(sx * seX(0.026, 0.021, 0.072, 0.45, 0.55, 0.002, z - 0.012), 0.062, z), new V3(sx, 0, 0), 0.0027);
  P.add(at(superEllipsoid(0.042, 0.016, 0.08, 0.45, 0.5, 12, 6, (q) => { q.y -= 9 * q.x * q.x; }), 0, yT - R - 0.004, -0.14), C.rubber, M.rubber);
  // team-ink canister riding on top: cage bars, dark caps, saddles, valve, feed pipe, swirl decal on the front cap
  const yC = yT + R + 0.043, zC = -0.01;
  I.add(at(latheZ(smoothProfile([[0, -0.118], [0.03, -0.116], [0.0355, -0.104], [0.0355, 0.104], [0.03, 0.116], [0, 0.118]], 8), 16), 0, yC, zC));
  for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2 + Math.PI / 6; P.add(at(superEllipsoid(0.0031, 0.0031, 0.1, 0.6, 0.6, 4, 5), Math.cos(a) * 0.0378, yC + Math.sin(a) * 0.0378, zC), C.dark, M.satin); }
  for (const s of [-1, 1]) P.add(at(latheZ([[0, -0.011 * s], [0.0372, -0.011 * s], [0.0402, -0.005 * s], [0.0402, 0.007 * s], [0.035, 0.0115 * s], [0, 0.012 * s]], 18), 0, yC, zC + s * 0.114), C.dark, M.gloss);
  for (const z of [-0.07, 0.06]) {
    P.add(at(superEllipsoid(0.034, 0.024, 0.016, 0.5, 0.6, 10, 6), 0, yT + R + 0.008, zC + z), C.dark, M.satin);
    P.add(at(torus(0.0392, 0.0032, 4, 18), 0, yC, zC + z), C.metal, M.metal);
  }
  P.add(at(lathe([[0, 0], [0.0068, 0], [0.0068, 0.008], [0.0098, 0.0098], [0.0098, 0.0145], [0, 0.015]], 10), 0, yC + 0.036, zC - 0.08), C.metal, M.metal);
  P.add(sweep([new V3(0, yC - 0.012, zC + 0.124), new V3(0, yC - 0.014, zC + 0.148), new V3(0, yT + R + 0.016, 0.17), new V3(0, yT + R - 0.004, 0.176)], { seg: 10, radial: 7, capSteps: 2, radius: () => 0.0072, flat: 1, outward: (Pp, o) => o.set(1, 0, 0) }).geo, C.metal, M.metal);
  for (const s of swirlShapes(0.024, 2, 0.62)) { const g = decal(s, 0.0008); placeXY(g, new V3(1, 0, 0), new V3(0, 1, 0), new V3(0, yC, zC + 0.1255)); P.add(g, C.decal, M.print); }
  // reflex sight on the left (+X): bracket, dark housing, lens, team hood stripe
  const sp = new V3(0.064, yT + 0.046, 0.13);
  P.add(at(superEllipsoid(0.008, 0.018, 0.02, 0.5, 0.6, 6, 5), sp.x - 0.012, sp.y - 0.02, sp.z), C.dark, M.satin);
  P.add(at(rbox(0.026, 0.03, 0.052, 0.35, 10, 6), sp.x, sp.y, sp.z), C.dark, M.gloss);
  P.add(at(superEllipsoid(0.0098, 0.0112, 0.0025, 0.6, 0.6, 10, 4), sp.x, sp.y + 0.001, sp.z + 0.026), C.lens, M.lens);
  I.add(at(superEllipsoid(0.0135, 0.0035, 0.024, 0.5, 0.6, 8, 4), sp.x, sp.y + 0.0155, sp.z + 0.006));
  // flank decals: squid (left), forward chevrons (both), amber LED (right)
  P.add(wrapZ(refine(decal(squidShape(0.052)), 0.006), R + 0.0004, 0.25, -0.1, yT), C.dark, M.print);
  for (const sx of [1, -1]) for (const g of chevrons(0.07, 0.022, 3)) { g.rotateZ(Math.PI); I.add(wrapZ(g, R + 0.0004, sx > 0 ? 0.05 : Math.PI - 0.05, 0.215, yT)); }
  P.add(orient(superEllipsoid(0.0038, 0.0018, 0.0038, 1, 1, 8, 4), new V3(-1, 0.3, 0).normalize(), new V3(-R * 0.955, yT + R * 0.29, -0.03)), C.amber, M.led);
  // left-hand foregrip under the front of the tube
  const fg = superEllipsoid(0.0118, 0.036, 0.0132, 0.55, 0.65, 10, 10, (q) => { if (q.z > 0) { const f = 0.5 + 0.5 * Math.cos((q.y / 0.0125) * Math.PI * 2); q.z -= 0.0012 * f; } });
  fg.rotateX(-0.12); P.add(at(fg, 0, 0.008, 0.262), C.rubber, M.rubber);
  P.add(at(superEllipsoid(0.0134, 0.0042, 0.0152, 0.5, 0.5, 10, 4), 0, -0.029, 0.267), C.dark, M.gloss);
  P.add(at(superEllipsoid(0.0145, 0.014, 0.024, 0.5, 0.6, 8, 5), 0, 0.046, 0.258), C.dark, M.satin);
  return {
    kind: 'sp_zooka', body: P.build(), ink: I.build(), spin: S.build(), spinAt: new V3(0, yT, sz),
    muzzle: new V3(0, yT, 0.655),
    gripR: GRIP_PISTOL,
    gripL: { pos: new V3(0, 0.008, 0.262), handZ: new V3(0, 1, -0.12), handY: new V3(0.45, -0.05, -1) },
    twirl: new V3(0, 0.03, 0.03),
  };
}

/** Bubble Blower: chubby cream toy gun with a fan pod on its back; a flared team nozzle feeds a big wand ring
 *  (Ø 0.28, a soaked team-ink cord inside a cream frame, drips hanging off it) held by four spokes. An upside-down
 *  soap bottle plugs in underneath: its rubber-sleeved neck is the left hand's foregrip. Muzzle = ring centre. */
function buildBlower() {
  const P = new Parts(), I = new Parts();
  pistolGrip(P);
  const yB = 0.074, zR = 0.232, RR = 0.128;
  // body shell, dark lower frame, team spine, fan pod on the back
  const BR = [0.031, 0.04, 0.09, 0.55, 0.62], BC = new V3(0, 0.072, 0.03);
  P.add(at(superEllipsoid(BR[0], BR[1], BR[2], BR[3], BR[4], 14, 10, (q) => { if (q.z > 0.04) q.y *= 1 - 0.25 * (q.z - 0.04) / 0.05; }), BC.x, BC.y, BC.z), C.cream, M.gloss);
  P.add(at(superEllipsoid(0.027, 0.012, 0.084, 0.4, 0.5, 12, 6), 0, 0.039, 0.032), C.dark, M.satin);
  I.add(at(superEllipsoid(0.016, 0.006, 0.05, 0.5, 0.6, 10, 5), 0, 0.111, 0.045));
  const flankX = (y, z) => seX(BR[0], BR[1], BR[2], BR[3], BR[4], y - BC.y, z - BC.z);
  P.add(at(latheZ(smoothProfile([[0, -0.104], [0.028, -0.102], [0.042, -0.092], [0.046, -0.078], [0.045, -0.062], [0.036, -0.05]], 8).concat([[0, -0.05]]), 22), 0, yB, 0), C.dark, M.gloss);
  for (const [r, z] of [[0.0335, -0.1035], [0.021, -0.1055]]) P.add(at(torus(r, 0.0021, 4, 20), 0, yB, z), C.gunmetal, M.metal);
  P.add(at(latheZ([[0, -0.109], [0.0085, -0.109], [0.0092, -0.105], [0, -0.103]], 10), 0, yB, 0), C.metal, M.metal);
  I.add(at(torus(0.0445, 0.0034, 5, 22), 0, yB, -0.068));
  // soap window + bubble button on top, LED, screws, squid decal
  P.add(at(superEllipsoid(0.013, 0.012, 0.013, 0.8, 0.9, 12, 8), 0, 0.104, -0.022), C.dark, M.gloss);
  I.add(at(superEllipsoid(0.0105, 0.0105, 0.0105, 1, 1, 12, 8), 0, 0.115, -0.022));
  for (const sx of [1, -1]) for (const [y, z] of [[0.09, 0.06], [0.05, -0.02]]) screw(P, new V3(sx * flankX(y, z), y, z), new V3(sx, 0, 0), 0.0026);
  const sq = decal(squidShape(0.03)); placeXY(sq, new V3(0, 0, -1), new V3(0, 1, 0), new V3(flankX(0.072, 0.02) + 0.0002, 0.072, 0.02)); P.add(sq, C.decal, M.print);
  P.add(orient(superEllipsoid(0.0032, 0.0016, 0.0032, 1, 1, 8, 4), new V3(-1, 0, 0), new V3(-flankX(0.08, 0.0), 0.08, 0.0)), C.green, M.led);
  // nozzle: dark collar, flared team cone, dark lip
  P.add(at(latheZ([[0, 0.108], [0.024, 0.108], [0.027, 0.114], [0.024, 0.12], [0, 0.12]], 16), 0, yB, 0), C.dark, M.gloss);
  I.add(at(latheZ(smoothProfile([[0.0195, 0.116], [0.022, 0.135], [0.03, 0.158], [0.044, 0.176]], 7).concat([[0.046, 0.18], [0.04, 0.181], [0.026, 0.165], [0, 0.16]]), 18), 0, yB, 0));
  P.add(at(torus(0.0445, 0.004, 5, 20), 0, yB, 0.179), C.dark, M.gloss);
  // wand ring: cream frame (split front/back lips), soaked team cord inside, four spokes, drips
  P.add(at(deformG(torus(RR + 0.007, 0.0118, 8, 48), (v) => { v.z *= 0.8; }), 0, yB, zR), C.cream, M.gloss);
  I.add(at(deformG(torus(RR - 0.0065, 0.0082, 6, 48), (v) => { const a = Math.atan2(v.y, v.x), k = 1 + 0.18 * Math.sin(a * 11) * Math.sin(a * 5 + 1); const cx = Math.cos(a) * (RR - 0.0065), cy = Math.sin(a) * (RR - 0.0065); v.x = cx + (v.x - cx) * k; v.y = cy + (v.y - cy) * k; }), 0, yB, zR));
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + k * Math.PI / 2, c = Math.cos(a), s = Math.sin(a);
    const p0 = new V3(c * 0.04, yB + s * 0.04, 0.176), p1 = new V3(c * (RR - 0.006), yB + s * (RR - 0.006), zR - 0.006);
    const len = p0.distanceTo(p1);
    P.add(orient(lathe([[0, 0], [0.0045, 0.0], [0.0045, len], [0, len]], 6), p1.clone().sub(p0), p0), C.dark, M.satin);
    const clamp = superEllipsoid(0.0105, 0.0078, 0.0135, 0.5, 0.6, 8, 5); clamp.rotateZ(a - Math.PI / 2);
    P.add(at(clamp, c * (RR - 0.012), yB + s * (RR - 0.012), zR - 0.004), C.dark, M.gloss);
  }
  for (const [a, len] of [[-Math.PI / 2 - 0.18, 1], [-Math.PI / 2 + 0.4, 0.65]]) {
    const hy = 0.0105 * len, c = new V3(Math.cos(a) * (RR + 0.012), yB + Math.sin(a) * (RR + 0.012), zR);
    const d = superEllipsoid(0.0058, hy, 0.0058, 1, 1, 8, 6, (q) => { if (q.y > 0) { const f = 1 - 0.65 * q.y / hy; q.x *= f; q.z *= f; } });
    I.add(at(d, c.x, c.y - 0.006 - hy * 0.7, c.z));
  }
  // upside-down soap bottle underneath: neck in a rubber sleeve (left-hand grip), cream collar, team bulb, dark foot
  const bt = (g) => { g.rotateX(-0.12); return at(g, 0, 0.0, 0.112); };
  P.add(bt(lathe(smoothProfile([[0, -0.036], [0.0112, -0.0355], [0.0134, -0.029], [0.0128, 0.0], [0.0134, 0.028], [0.0112, 0.034], [0, 0.035]], 10), 12)), C.rubber, M.rubber);
  for (let k = 0; k < 4; k++) P.add(bt(hring(0.0135, 0.0011, -0.018 + k * 0.012, 3, 12)), C.darker, M.satin);
  P.add(bt(lathe([[0, 0.032], [0.0165, 0.032], [0.0182, 0.037], [0.0165, 0.047], [0, 0.048]], 14)), C.dark, M.gloss);
  P.add(bt(lathe([[0, -0.034], [0.0172, -0.034], [0.0192, -0.039], [0.0188, -0.046], [0, -0.046]], 16)), C.cream, M.gloss);
  I.add(bt(lathe(smoothProfile([[0, -0.044], [0.018, -0.046], [0.03, -0.058], [0.0345, -0.078], [0.033, -0.098], [0.024, -0.11], [0, -0.113]], 12), 18)));
  for (let k = 0; k < 4; k++) { const a = Math.PI / 4 + k * Math.PI / 2; P.add(bt(at(superEllipsoid(0.0026, 0.024, 0.0026, 0.6, 0.6, 4, 5), Math.cos(a) * 0.0335, -0.078, Math.sin(a) * 0.0335)), C.dark, M.satin); }
  P.add(bt(lathe([[0, -0.119], [0.018, -0.119], [0.0215, -0.1155], [0.02, -0.108], [0, -0.107]], 16)), C.dark, M.gloss);
  return {
    kind: 'sp_blower', body: P.build(), ink: I.build(),
    muzzle: new V3(0, yB, zR),
    ringR: RR,
    gripR: GRIP_PISTOL,
    gripL: { pos: new V3(0, 0.0, 0.112), handZ: new V3(0, 1, -0.12), handY: new V3(0.45, -0.05, -1) },
    twirl: new V3(0, 0.03, 0.03),
  };
}

/** Ink Jet hand cannon: fat cream pressure chamber (team ink windows on both flanks) between two dark intake pods,
 *  cooling fins on top, a gunmetal barrel ending in a flared afterburner nozzle (dark petals, team ring). A corrugated
 *  rubber hose leaves the dark rear cap and curls down behind the grip to a quick coupler (`hoseAt` = rear port,
 *  `hoseEnd` = coupler tip, where a longer hose can continue). Horizontal foregrip under the barrel (blaster pose). */
function buildJetgun() {
  const P = new Parts(), I = new Parts();
  pistolGrip(P, { baseCol: C.dark });
  const yJ = 0.09;
  const J = (g) => at(g, 0, yJ, 0);
  // chamber
  P.add(J(latheZ(smoothProfile([[0, -0.07], [0.036, -0.068], [0.05, -0.052], [0.054, -0.02], [0.054, 0.1], [0.049, 0.132], [0.036, 0.146], [0, 0.148]], 12), 24)), C.cream, M.gloss);
  for (const z of [-0.035, 0.12]) P.add(J(at(torus(0.0535, 0.0042, 5, 24), 0, 0, z)), C.dark, M.gloss);
  for (const sx of [1, -1]) {
    P.add(wrapZ(superEllipsoid(0.052, 0.018, 0.003, 0.4, 0.4, 12, 6), 0.0538, sx > 0 ? 0 : Math.PI, 0.04, yJ), C.dark, M.gloss);
    I.add(wrapZ(superEllipsoid(0.046, 0.0125, 0.0038, 0.5, 0.45, 12, 6), 0.0538, sx > 0 ? 0 : Math.PI, 0.04, yJ));
    // intake pods low on the flanks: dark cans with a team ring and a metal grille
    const px = sx * 0.058, py = yJ - 0.036;
    P.add(at(latheZ(smoothProfile([[0, -0.03], [0.014, -0.029], [0.019, -0.02], [0.019, 0.034], [0.022, 0.044], [0.022, 0.05]], 8).concat([[0, 0.05]]), 14), px, py, 0.02), C.dark, M.gloss);
    I.add(at(torus(0.0198, 0.0026, 4, 14), px, py, 0.052));
    P.add(at(latheZ([[0, 0.049], [0.0175, 0.049], [0.0175, 0.052], [0, 0.052]], 12), px, py, 0.02), C.darker, M.satin);
    for (const r of [0.006, 0.012]) P.add(at(torus(r, 0.0013, 3, 12), px, py, 0.0725), C.metal, M.metal);
    screw(P, new V3(sx * 0.0535, yJ + 0.03, -0.02), new V3(sx, 0.55, 0).normalize(), 0.0028);
  }
  // cooling fins + rear sight on top, LED on the right, squid decal on the left
  for (let k = 0; k < 5; k++) P.add(at(superEllipsoid(0.03, 0.009, 0.0032, 0.5, 0.5, 8, 4), 0, yJ + 0.054, 0.01 + k * 0.018), C.dark, M.satin);
  P.add(at(superEllipsoid(0.012, 0.0032, 0.048, 0.5, 0.5, 8, 4), 0, yJ + 0.05, 0.046), C.dark, M.satin);
  P.add(at(superEllipsoid(0.0105, 0.0078, 0.006, 0.4, 0.4, 6, 4, (q) => { if (q.y > 0.002 && Math.abs(q.x) < 0.003) q.y = 0.002; }), 0, yJ + 0.064, -0.036), C.darker, M.satin);
  P.add(wrapZ(refine(decal(squidShape(0.028)), 0.005), 0.0542, 0.62, -0.012, yJ), C.dark, M.print);
  P.add(orient(superEllipsoid(0.0034, 0.0016, 0.0034, 1, 1, 8, 4), new V3(-0.8, 0.6, 0), new V3(-0.043, yJ + 0.033, -0.04)), C.red, M.led);
  // barrel + afterburner nozzle
  P.add(J(latheZ([[0, 0.14], [0.026, 0.14], [0.026, 0.2], [0.03, 0.206], [0.03, 0.214], [0, 0.214]], 16)), C.gunmetal, M.metal);
  for (const z of [0.158, 0.172, 0.186]) P.add(J(at(torus(0.0265, 0.0017, 3, 16), 0, 0, z)), C.darker, M.satin);
  P.add(J(latheZ(smoothProfile([[0.026, 0.21], [0.03, 0.235], [0.04, 0.262], [0.05, 0.283]], 7).concat([[0.052, 0.288], [0.047, 0.29], [0.036, 0.27], [0.024, 0.245], [0, 0.24]]), 20)), C.dark, M.gloss);
  I.add(J(at(torus(0.0325, 0.0045, 5, 20), 0, 0, 0.228)));
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2 + Math.PI / 8;
    const pet = superEllipsoid(0.0105, 0.0022, 0.03, 0.4, 0.5, 6, 4, (q) => { q.y += 0.36 * (q.z + 0.03); });
    pet.rotateZ(a - Math.PI / 2); P.add(at(pet, Math.cos(a) * 0.041, yJ + Math.sin(a) * 0.041, 0.262), C.gunmetal, M.metal);
  }
  P.add(J(latheZ([[0, 0.242], [0.022, 0.247], [0.034, 0.266], [0.045, 0.285], [0, 0.285]], 18)), C.darker, M.satin);
  // rear cap + hose port
  P.add(J(latheZ([[0, -0.086], [0.03, -0.086], [0.046, -0.078], [0.052, -0.066], [0.052, -0.056], [0, -0.056]], 22)), C.dark, M.gloss);
  const port = new V3(0.03, yJ - 0.006, -0.08), pdir = new V3(0.62, -0.2, -0.76).normalize();
  P.add(orient(lathe([[0, -0.008], [0.013, -0.008], [0.013, 0.008], [0.0105, 0.011], [0.0105, 0.02], [0, 0.021]], 12), pdir, port), C.metal, M.metal);
  // corrugated hose: out of the rear-left, hanging down the left of the grip (clear of the right forearm), coupler
  const hp = [port.clone().addScaledVector(pdir, 0.016), new V3(0.056, yJ - 0.022, -0.1), new V3(0.072, yJ - 0.065, -0.108), new V3(0.076, -0.02, -0.094), new V3(0.07, -0.062, -0.07), new V3(0.06, -0.094, -0.052)];
  const hose = sweep(hp, { seg: 40, radial: 8, capSteps: 2, radius: (t) => 0.0098 + 0.0012 * Math.cos(t * Math.PI * 34), flat: 1, outward: (Pp, o) => o.set(1, 0, 0), transport: true });
  P.add(hose.geo, C.rubber, M.rubber);
  const he = hose.sample(1), hEnd = he.P.clone().addScaledVector(he.T, 0.024);
  P.add(orient(lathe([[0, -0.004], [0.0122, -0.004], [0.0132, 0.002], [0.0132, 0.014], [0.011, 0.017], [0.011, 0.022], [0, 0.024]], 12), he.T, he.P), C.metal, M.metal);
  I.add(orient(hring(0.0128, 0.0022, 0.008, 4, 12), he.T, he.P));
  // foregrip under the barrel (horizontal, blaster-style) + mount
  P.add(at(latheZ(smoothProfile([[0, 0.12], [0.0118, 0.122], [0.0136, 0.13], [0.0136, 0.182], [0.0124, 0.19], [0, 0.192]], 8), 12), 0, 0.012, 0), C.rubber, M.rubber);
  for (let k = 0; k < 4; k++) P.add(at(torus(0.0137, 0.0011, 3, 12), 0, 0.012, 0.138 + k * 0.012), C.darker, M.satin);
  P.add(at(superEllipsoid(0.009, 0.028, 0.02, 0.5, 0.6, 6, 6), 0, 0.038, 0.156), C.dark, M.satin);
  return {
    kind: 'sp_jetgun', body: P.build(), ink: I.build(),
    muzzle: new V3(0, yJ, 0.29),
    hoseAt: port.clone(), hoseEnd: hEnd,
    gripR: GRIP_PISTOL,
    gripL: { pos: new V3(0, 0.012, 0.156), handZ: new V3(0, 0, 1), handY: new V3(0.8, -0.55, -0.1) },
    twirl: new V3(0, 0.03, 0.03),
  };
}

/** Mega Stamp: long shaft (roller hand stations, cream ball knob) ending in a knuckle hinge that carries a big cream
 *  stamp block. The block is canted so that in the roller pose (weapon-space world-down ≈ STAMP_N) the face lies flat
 *  on the ground where the roller's drum would touch: dark rubber mount, team-ink pad with a raised squid emblem
 *  (mirrored, like a real stamp). Face 0.5 × 0.35, block 0.26 deep. `face` = { center, normal, size }; muzzle = centre. */
const STAMP_N = new V3(0, -0.58, 0.815).normalize();
/** Subdivide an indexed geometry until no edge is longer than maxLen (per-edge midpoint splits, so neighbours agree and
 *  no T-junctions appear). For flat decals that get bent onto curved surfaces (the caps otherwise cut under the curve). */
function refine(g, maxLen, maxIter = 10) {
  const pos = Array.from(g.attributes.position.array); let idx = Array.from(g.index.array);
  const m2 = maxLen * maxLen;
  const d2 = (a, b) => { const x = pos[a * 3] - pos[b * 3], y = pos[a * 3 + 1] - pos[b * 3 + 1], z = pos[a * 3 + 2] - pos[b * 3 + 2]; return x * x + y * y + z * z; };
  for (let it = 0; it < maxIter; it++) {
    const mids = new Map(), out = []; let any = false;
    const mid = (a, b) => {
      if (d2(a, b) <= m2) return -1;
      const k = a < b ? a * 1e7 + b : b * 1e7 + a;
      let m = mids.get(k);
      if (m === undefined) { m = pos.length / 3; pos.push((pos[a * 3] + pos[b * 3]) / 2, (pos[a * 3 + 1] + pos[b * 3 + 1]) / 2, (pos[a * 3 + 2] + pos[b * 3 + 2]) / 2); mids.set(k, m); }
      return m;
    };
    for (let i = 0; i < idx.length; i += 3) {
      let a = idx[i], b = idx[i + 1], c = idx[i + 2];
      let mab = mid(a, b), mbc = mid(b, c), mca = mid(c, a);
      const n = (mab >= 0) + (mbc >= 0) + (mca >= 0);
      if (!n) { out.push(a, b, c); continue; }
      any = true;
      if (n === 3) { out.push(a, mab, mca, mab, b, mbc, mca, mbc, c, mab, mbc, mca); continue; }
      // rotate so the pattern starts at edge ab
      for (let r = 0; r < 3 && !(n === 1 ? mab >= 0 : mca < 0); r++) { [a, b, c] = [b, c, a]; [mab, mbc, mca] = [mbc, mca, mab]; }
      if (n === 1) out.push(a, mab, c, mab, b, c);
      else out.push(mab, b, mbc, a, mab, mbc, a, mbc, c);                      // ab + bc split, ca intact
    }
    idx = out;
    if (!any) break;
  }
  const o = new THREE.BufferGeometry();
  o.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); o.setIndex(idx); o.computeVertexNormals();
  return o;
}
/** Rounded-rectangle Shape (w × h, corner radius r) centred on the origin. */
function roundRect(w, h, r) {
  const s = new THREE.Shape(), x = w / 2, y = h / 2;
  s.moveTo(-x + r, -y); s.lineTo(x - r, -y); s.quadraticCurveTo(x, -y, x, -y + r); s.lineTo(x, y - r); s.quadraticCurveTo(x, y, x - r, y);
  s.lineTo(-x + r, y); s.quadraticCurveTo(-x, y, -x, y - r); s.lineTo(-x, -y + r); s.quadraticCurveTo(-x, -y, -x + r, -y);
  return s;
}
function buildStamp() {
  const P = new Parts(), I = new Parts();
  const HX = new V3(1, 0, 0), HU = STAMP_N.clone().negate(), HT = new V3().crossVectors(HU, HX).normalize();
  const KZ = 0.644, K = new V3(0, 0, KZ);                                // hinge pin on the shaft axis
  const F = K.clone().addScaledVector(HU, -0.262);                       // face centre (relief tips)
  const head = (g) => placeXY(g, HX, HT, F);                             // head space: x across, y along HT, z up (HU)
  const hp = (x, t, u) => F.clone().addScaledVector(HX, x).addScaledVector(HT, t).addScaledVector(HU, u);
  // shaft, top grip (right hand) with a cream ball knob, mid grip (left hand) with dark collars, hazard band
  P.add(latheZ([[0, -0.07], [0.0105, -0.07], [0.0105, KZ - 0.03], [0, KZ - 0.03]], 10), C.metal, M.metal);
  P.add(latheZ(smoothProfile([[0, -0.086], [0.0116, -0.085], [0.0144, -0.076], [0.0138, -0.05], [0.0132, -0.02], [0.0136, 0.02], [0.0142, 0.046], [0.0156, 0.054], [0.0112, 0.06]], 10), 12), C.rubber, M.rubber);
  P.add(at(superEllipsoid(0.026, 0.026, 0.024, 0.85, 1, 16, 10), 0, 0, -0.104), C.cream, M.gloss);
  I.add(at(torus(0.0226, 0.0034, 5, 16), 0, 0, -0.098));
  I.add(at(torus(0.0142, 0.0028, 5, 14), 0, 0, 0.062));
  P.add(latheZ(smoothProfile([[0.0105, 0.13], [0.0136, 0.136], [0.0142, 0.15], [0.0138, 0.19], [0.0142, 0.235], [0.0136, 0.25], [0.0105, 0.256]], 8), 10), C.rubber, M.rubber);
  for (const z of [0.126, 0.26]) P.add(at(latheZ([[0.0105, -0.005], [0.015, -0.004], [0.0158, 0.0], [0.015, 0.004], [0.0105, 0.005]], 12), 0, 0, z), C.dark, M.gloss);
  // lower handle: fat cream sleeve (tapering into the knuckle) with a hazard band and a team ring
  P.add(latheZ(smoothProfile([[0.0105, 0.29], [0.0152, 0.298], [0.0172, 0.33], [0.0178, 0.45], [0.0172, 0.55], [0.0158, 0.585], [0.0105, 0.594]], 12), 14), C.cream, M.gloss);
  for (let k = 0; k < 5; k++) P.add(at(latheZ([[0.0181, 0], [0.0181, 0.012]], 14), 0, 0, 0.37 + k * 0.024), k % 2 ? C.dark : C.hazard, M.print);
  I.add(at(torus(0.0176, 0.0032, 5, 16), 0, 0, 0.52));
  // knuckle: collar + hub on the shaft end, pin, nut / fluted lock knob, gunmetal cheeks rising from the block's back
  P.add(latheZ([[0.0105, KZ - 0.058], [0.0172, KZ - 0.056], [0.0178, KZ - 0.044], [0.0105, KZ - 0.042]], 12), C.metal, M.metal);
  P.add(at(superEllipsoid(0.02, 0.022, 0.036, 0.5, 0.6, 10, 8), 0, 0, KZ - 0.012), C.dark, M.satin);
  const pin = latheZ([[0, -0.052], [0.0095, -0.052], [0.0095, 0.052], [0, 0.052]], 10); pin.rotateY(Math.PI / 2); P.add(at(pin, 0, 0, KZ), C.metal, M.metal);
  const nut = latheZ([[0, 0], [0.012, 0], [0.012, 0.007], [0.009, 0.0098], [0, 0.01]], 6); nut.rotateY(-Math.PI / 2); P.add(at(nut, -0.048, 0, KZ), C.metal, M.metal);
  const knob = lathe(smoothProfile([[0, 0], [0.021, 0.0], [0.0235, 0.006], [0.0222, 0.015], [0.013, 0.021], [0, 0.0215]], 8), 42, (v) => {
    const rr = Math.hypot(v.x, v.z);
    if (rr > 0.007) { const a = Math.atan2(v.z, v.x); const k = 1 - 0.16 * Math.max(0, Math.cos(a * 7)) ** 2 * Math.min(1, (rr - 0.007) / 0.012); v.x *= k; v.z *= k; }
  });
  P.add(orient(knob, new V3(1, 0, 0), new V3(0.048, 0, KZ)), C.dark, M.gloss);
  for (const sx of [1, -1]) {
    const ch = superEllipsoid(0.0055, 0.036, 0.046, 0.5, 0.6, 6, 8, (q) => { if (q.z > 0) { const f = q.z / 0.046; q.y *= 1 - 0.45 * f * f; } });
    P.add(placeXY(ch, HX, HT, K.clone().addScaledVector(HU, -0.024).addScaledVector(HX, sx * 0.0385)), C.gunmetal, M.metal);
  }
  // block stack (head space, z up from the face): squid relief + rim, ink pad, rubber mount, cream block, dark trim,
  // back plate. The relief reads the right way round in the PRINT (seen from above, top away from the kid).
  const W = 0.5, D = 0.35;
  const rim = roundRect(W, D, 0.03); rim.holes.push(new THREE.Path(roundRect(W - 0.04, D - 0.04, 0.018).getPoints(4)));
  I.add(head(decal(rim, 0.016)));
  const emb = decal(squidShape(0.25), 0.016); emb.translate(0, -0.02, 0); emb.rotateZ(Math.PI); I.add(head(emb));
  I.add(head(at(rbox(W, D, 0.03, 0.18, 16, 12), 0, 0, 0.03)));
  P.add(head(at(rbox(W + 0.012, D + 0.012, 0.022, 0.25, 16, 12), 0, 0, 0.052)), C.rubber, M.rubber);
  P.add(head(at(rbox(W - 0.004, D - 0.004, 0.16, 0.22, 18, 14), 0, 0, 0.14)), C.cream, M.gloss);
  P.add(head(at(rbox(W + 0.006, D + 0.006, 0.016, 0.3, 18, 14), 0, 0, 0.104)), C.dark, M.gloss);
  P.add(head(at(rbox(0.2, 0.16, 0.02, 0.35, 10, 8), 0, 0, 0.225)), C.dark, M.gloss);
  // back: team print preview labels + index bar, corner screws, LED; hazard stripes on the long sides; ink windows on the ends
  I.add(head(at(rbox(0.16, 0.012, 0.006, 0.5, 8, 4), 0, -0.12, 0.2195)));
  for (const s of [1, -1]) {
    const lab = decal(squidShape(0.07)); lab.rotateZ(Math.PI); I.add(head(at(lab, s * 0.165, 0, 0.2198)));
    for (let k = 0; k < 7; k++) {
      const st = superEllipsoid(0.0105, 0.0008, 0.024, 0.4, 0.4, 4, 4); st.rotateY(0.6);
      P.add(head(at(st, -0.15 + k * 0.05, s * 0.1732, 0.165)), k % 2 ? C.dark : C.hazard, M.print);
    }
    P.add(placeXY(superEllipsoid(0.07, 0.028, 0.003, 0.45, 0.4, 12, 6), HT, HU, hp(s * 0.2482, 0, 0.162)), C.dark, M.gloss);
    I.add(placeXY(superEllipsoid(0.062, 0.02, 0.0036, 0.55, 0.5, 12, 6), HT, HU, hp(s * 0.2482, 0, 0.162)));
    for (const t of [1, -1]) screw(P, hp(s * 0.21, t * 0.135, 0.2195), HU, 0.005);
  }
  P.add(orient(superEllipsoid(0.005, 0.0024, 0.005, 1, 1, 8, 4), HU, hp(0.16, -0.12, 0.2195)), C.amber, M.led);
  return {
    kind: 'sp_stamp', body: P.build(), ink: I.build(),
    muzzle: F.clone(),
    face: { center: F.clone(), normal: STAMP_N.clone(), size: [W, D], across: HX.clone(), along: HT.clone() },
    gripR: { pos: new V3(0, 0, -0.022), handZ: new V3(0, 0, 1), handY: new V3(-0.3, 1, 0) },
    gripL: { pos: new V3(0, 0, 0.19), handZ: new V3(0, 0, 1), handY: new V3(0.5, 1, 0) },
    twirl: new V3(0, 0, 0),
  };
}

const _cache = new Map();
const BUILDERS = {
  shooter: buildShooter, roller: buildRoller, charger: buildCharger, blaster: buildBlaster,
  dualies: buildDualies, slosher: buildSlosher, splatling: buildSplatling,
  bucket: buildBucket, spinner: buildSpinner, twins: buildTwins, brush: buildBrush,
  sp_zooka: buildZooka, sp_blower: buildBlower, sp_jetgun: buildJetgun, sp_stamp: buildStamp,
};
/** Main (selectable) weapons; the special-only held models are `SPECIAL_WEAPON_KINDS` (prefixed sp_). */
export const WEAPON_KINDS = Object.keys(BUILDERS).filter((k) => !k.startsWith('sp_'));
export const SPECIAL_WEAPON_KINDS = Object.keys(BUILDERS).filter((k) => k.startsWith('sp_'));
// Kit weapons (src/game/kits/*.js) bring their own model + part animation: build() returns the same shape as the
// builders above ({ kind, body, ink, parts?, gripR, gripL, … }); animate(w, st) runs after the built-in part animation.
const KIT_ANIM = {};
export function registerWeaponModel(kind, build, animate) {
  BUILDERS[kind] = build; if (animate) KIT_ANIM[kind] = animate; _cache.delete(kind);
  if (!kind.startsWith('sp_') && !WEAPON_KINDS.includes(kind)) WEAPON_KINDS.push(kind);
}

/** Hand bone frame (wrist origin) expressed in weapon space, from a grip spec and that hand's grip-hole offset. */
function handInWeapon(grip, hole) {
  const Y = grip.handY.clone().normalize();
  const Z = grip.handZ.clone().addScaledVector(Y, -grip.handZ.dot(Y)).normalize();
  const X = new V3().crossVectors(Y, Z).normalize();
  const m = new THREE.Matrix4().makeBasis(X, Y, Z);
  const q = new THREE.Quaternion().setFromRotationMatrix(m);
  const pos = grip.pos.clone().sub(hole.clone().applyQuaternion(q));
  return { pos, quat: q };
}

// ---------------------------------------------------------------------------------------------- part animation
// Arsenal owns how weapon parts move; character.js owns the body. character.js calls animateWeapon(w, st) once per
// frame per held weapon instance (the main one, and the left-hand one for dual wield):
//   w  = the instance it built (def, parts, body/ink/bodyFar/inkFar, drum, coil, lamps; state lives on it)
//   st = { t, dt, color, near,                      // clock, frame dt, team colour, near-LOD flag (false → merged far mesh)
//          hand,                                    // 0 = main (right) instance, 1 = left-hand instance (dual wield)
//          runner,                                  // the actor's WeaponRunner (null in labs/menus) — read-only (charging, streaming,
//                                                   //   burstFrac, sinceHand[2], dodge, lockT … see weapons.js)
//          sinceShoot, sinceFlick, sinceRelease,    // seconds since trigger 'shoot' / 'flick' / 'charge_release'
//          charge, full, chargeFlash, lowInk,       // smoothed charge 0..1, at-full flag, release flash 0..1, low-ink weight 0..1
//          firing, rolling, grounded, groundSpeed,  // AnimState bits (rolling = roller push weight 0..1)
//          worldQuat }                              // world quaternion of the weapon (w.off) — liquid surfaces stay level
// Writes: part transforms, lamp/coil uniforms, LOD visibility, and w.pump (0..1 blaster pump stroke — the body's left
// hand should ride it) + w.trig (0..1 trigger squeeze — the index finger can follow).
const _aq = new THREE.Quaternion(), _aq2 = new THREE.Quaternion(), _av = new V3(), _av2 = new V3(), _aw = new THREE.Color(1, 1, 1);
const _UPV = new V3(0, 1, 0);
const pulseE = (t, atk, dec) => (t < 0 ? 0 : t < atk ? t / atk : Math.exp(-(t - atk) * dec));
const mjE = (t) => { t = Math.min(1, Math.max(0, t)); return t * t * t * (10 + t * (6 * t - 15)); };
const dampE = (a, b, l, dt) => a + (b - a) * (1 - Math.exp(-l * dt));
function sprE(S, i, target, hz, zeta, dt) {   // exact damped spring (stable for any damping / step)
  const w = Math.PI * 2 * hz, x0 = S[i] - target, v0 = S[i + 1];
  let x, v;
  if (zeta < 0.999) {
    const wd = w * Math.sqrt(1 - zeta * zeta), e = Math.exp(-zeta * w * dt), c = Math.cos(wd * dt), sn = Math.sin(wd * dt), B = (v0 + zeta * w * x0) / wd;
    x = e * (x0 * c + B * sn); v = e * ((-zeta * w * x0 + wd * B) * c + (-zeta * w * B - wd * x0) * sn);
  } else { const e = Math.exp(-w * dt), B = v0 + w * x0; x = e * (x0 + B * dt); v = e * (v0 - w * B * dt); }
  S[i] = x + target; S[i + 1] = v; return S[i];
}

export function animateWeapon(w, st) {
  if (KIT_ANIM[w.def.kind]) { KIT_ANIM[w.def.kind](w, st); return; }   // kit weapons animate themselves
  const d = w.def, P = w.parts || {}, kind = d.kind, t = st.t, dt = Math.min(0.1, Math.max(0, st.dt || 0)), col = st.color;
  if (!w.ps) { w.ps = new Float32Array(12); w.ps[0] = 1.3; w.pump = 0; w.trig = 0; w.heat = 0; w.drumW = 0; w.drumA = 0; w.spinW = 0; w.spinA = 0; w.near = true; }
  const ps = w.ps, R = st.runner;
  // per-instance shot clock: dual wield keeps one per hand (runner.sinceHand = [right, left] seconds since that hand fired)
  let ts = st.sinceShoot ?? 99;
  if (d.dual && R && R.sinceHand) ts = R.sinceHand[st.hand || 0];
  // near/far LOD
  const near = st.near !== false;
  if (near !== w.near) {
    w.near = near;
    if (w.body) w.body.visible = near; if (w.ink) w.ink.visible = near;
    if (w.bodyFar) w.bodyFar.visible = !near; if (w.inkFar) w.inkFar.visible = !near;
    for (const g of w.partList || []) g.visible = near;
  }
  // roller drum: rolls with the ground, coasts down, gets flung round by the flick
  if (w.drum) {
    if ((st.rolling || 0) > 0.3 && st.grounded) w.drumW = (st.groundSpeed || 0) / (d.drumR || 0.1);
    else w.drumW *= Math.exp(-dt * 2.2);
    const ft = st.sinceFlick ?? 99;
    if (ft >= 0.15 && ft - dt < 0.15) w.drumW += 34;
    w.drumA += w.drumW * dt;
    w.drum.rotation.x = w.drumA;
  }
  const u = st.sinceShoot ?? 99;
  if (kind === 'blaster') {   // pump stroke — computed at every distance (the body's left hand rides it)
    let pk = 0;
    if (u < 0.6) pk = u < 0.14 ? 0 : u < 0.29 ? mjE((u - 0.14) / 0.15) : u < 0.33 ? 1 : u < 0.46 ? 1 - mjE((u - 0.33) / 0.13) : -0.1 * Math.sin(Math.PI * Math.min(1, (u - 0.46) / 0.12));
    w.pump = pk;
  }
  if (w.coil) {                 // charger coil / splatling meter (always drawn — a charging weapon is a tell at any range)
    const cu = w.coil.userData.u;
    let ch = st.charge || 0, full = st.full ? 1 : 0;
    if (kind === 'splatling' && R) { ch = R.charging ? R.charge : R.streaming ? R.burstFrac : 0; full = R.charging && R.charge >= 0.999 ? 1 : 0; }
    cu.uCharge.value = ch; cu.uFull.value = full; cu.uFlash.value = st.chargeFlash || 0; cu.uTime.value = t;
  }
  if (!near) return;
  const shotK = pulseE(ts, 0.006, 30);
  if (P.trigger) {
    const want = kind === 'charger' ? ((st.charge || 0) > 0.01 ? 1 : 0) : kind === 'splatling' ? (R ? (R.charging || R.streaming ? 1 : 0) : (st.firing ? 1 : 0))
      : kind === 'blaster' || kind === 'dualies' ? (ts < 0.07 ? 1 : 0) : (st.firing && u < 0.16 ? 1 : 0);
    w.trig = dampE(w.trig, want, want > w.trig ? 45 : 22, dt);
    P.trigger.rotation.x = 0.42 * w.trig;
  }
  if (kind === 'shooter') {
    P.bolt.position.z = P.bolt.userData.rest.z - 0.0095 * shotK;
    const ck = pulseE(ts, 0.01, 18);
    P.can.scale.set(1 + 0.07 * ck, 1 + 0.07 * ck, 1 - 0.035 * ck);
    ledShot(P.led, st, shotK, t);
  } else if (kind === 'dualies') {
    // each pistol's slide snaps back 13 mm on its own shot and rides home; LED blinks per shot / red when low
    const k = pulseE(ts, 0.005, 26);
    P.slide.position.z = P.slide.userData.rest.z - 0.013 * k;
    P.slideInk.position.z = P.slideInk.userData.rest.z - 0.013 * k;
    ledShot(P.led, st, k, t);
  } else if (kind === 'blaster') {
    P.pump.position.z = P.pump.userData.rest.z - 0.036 * w.pump;
    const dep = u < 0.36;
    const needle = sprE(ps, 0, dep ? -1.95 : 1.3, dep ? 9 : 4.2, dep ? 0.55 : 0.28, dt);
    P.needle.rotation.z = needle + 0.018 * Math.sin(t * 41) * (u > 0.6 ? 1 : 0.3);
    if (ts < dt * 1.5) ps[3] -= 7;
    if (u >= 0.33 && u - dt < 0.33) ps[3] += 4.5;
    const bq = Math.max(-0.3, Math.min(0.3, sprE(ps, 2, 0, 7, 0.22, dt)));
    P.bulb.scale.set(1 - 0.35 * bq, 1 - 0.35 * bq, 1 + 0.9 * bq);
  } else if (kind === 'charger') {
    const ch = st.charge || 0, full = st.full ? 1 : 0;
    const btg = -0.03 * Math.min(1, Math.max(0, ch));
    const bolt = sprE(ps, 4, btg, btg < ps[4] ? 5 : 16, 0.32, dt);
    P.bolt.position.z = P.bolt.userData.rest.z + Math.min(0.004, Math.max(-0.034, bolt));
    const lm = P.lens.userData.mesh.material;
    lm.emissive.copy(col).lerp(_aw, 0.25 * full);
    lm.emissiveIntensity = 0.12 + 3.2 * ch * ch + full * (1.2 + 0.8 * Math.sin(t * 31)) + 5 * (st.chargeFlash || 0);
    const em = P.eyepiece.userData.mesh.material;
    em.emissive.copy(col); em.emissiveIntensity = 0.04 + 0.9 * ch * ch + 0.6 * full;
    const rel = st.sinceRelease ?? 99;
    if (rel < dt * 1.5) w.heat = 1;
    w.heat *= Math.exp(-dt * 3.2);
    const pm = P.ports.userData.mesh.material;
    pm.emissive.copy(col).lerp(_aw, 0.5 * w.heat); pm.emissiveIntensity = 6 * w.heat * w.heat;
  } else if (kind === 'roller') {
    const m = P.led.userData.mesh.material;
    m.emissiveIntensity = (st.rolling || 0) > 0.3 ? 0.5 + 2.6 * (Math.sin(t * Math.PI * 8) > 0 ? 1 : 0.15) : 0.45;
  } else if (kind === 'slosher') {
    // the ink surface stays level against the swing (a lagging, ringing liquid, clamped to the rim), dips as each
    // throw empties the bucket and wells back up; the thumb lever trips as the ink leaves
    const s = P.surface;
    if (st.worldQuat) {
      _av.copy(_UPV).applyQuaternion(st.worldQuat);                     // bucket axis in world
      _aq.setFromUnitVectors(_av, _UPV);                                 // world tilt that would level the surface
      _aq2.copy(st.worldQuat).invert().multiply(_aq).multiply(st.worldQuat);   // … expressed in bucket space
      _av2.set(_aq2.x, _aq2.y, _aq2.z); const sn = _av2.length();
      let ang = 2 * Math.atan2(sn, _aq2.w); if (ang > Math.PI) ang -= Math.PI * 2;
      const lim = 0.6, a = Math.max(-lim, Math.min(lim, ang));
      if (sn > 1e-5) _av2.multiplyScalar(1 / sn); else _av2.set(1, 0, 0);
      sprE(ps, 6, _av2.x * a, 2.2, 0.16, dt); sprE(ps, 8, _av2.z * a, 2.2, 0.16, dt);
    }
    s.rotation.set(ps[6], 0, ps[8]);
    const drain = u < 0.6 ? (u < 0.16 ? mjE(u / 0.16) : 1 - mjE((u - 0.16) / 0.44)) : 0;
    s.position.y = s.userData.rest.y - 0.034 * drain + 0.002 * Math.sin(t * 7.3);
    const rip = 1 + 0.02 * Math.sin(t * 11 + 1.3) * (0.3 + drain);
    s.scale.set(rip * (1 - 0.1 * drain), 1, (2 - rip) * (1 - 0.1 * drain));
    P.lever.rotation.x = -0.4 * (u < 0.3 ? 1 - mjE(Math.max(0, u - 0.18) / 0.12) : 0);
  } else if (kind === 'splatling') {
    // barrel cluster: spins up with the charge, screams while it streams, spins down with inertia
    let want = 0;
    if (R) want = R.charging ? 14 + 46 * R.charge : R.streaming ? 64 : 0;
    else want = st.firing ? 30 + 30 * (st.charge || 0) : 0;
    w.spinW = dampE(w.spinW, want, want > w.spinW ? 5 : 1.6, dt);
    w.spinA = (w.spinA + w.spinW * dt) % (Math.PI * 2);
    P.barrels.rotation.z = w.spinA;
    P.barrels.position.z = P.barrels.userData.rest.z - 0.004 * shotK;   // each round nudges the cluster back
  }
}
function ledShot(g, st, k, t) {
  if (!g) return;
  const m = g.userData.mesh.material;
  if ((st.lowInk || 0) > 0.5) { m.emissive.setRGB(1, 0.16, 0.1); m.emissiveIntensity = 0.4 + 2.2 * (0.5 + 0.5 * Math.sin(t * Math.PI * 6.4)); }
  else { m.emissive.setRGB(0.24, 1, 0.48); m.emissiveIntensity = 1.1 + 4 * k; }
}

// ---------------------------------------------------------------------------------------------- sub: splat bomb prop
/** Hand-held splat bomb (held by its knurled cap in the LEFT fist while the sub is aimed).
 *  Bomb space: cap handle axis along +Y through the origin; ink bulb hangs below. */
function buildBomb() {
  const P = new Parts(), I = new Parts();
  P.add(lathe(smoothProfile([[0, -0.014], [0.0118, -0.014], [0.0128, -0.008], [0.0128, 0.009], [0.0104, 0.0145], [0, 0.0155]], 8), 14), C.rubber, M.rubber);
  P.add(lathe([[0, 0.015], [0.0048, 0.015], [0.0048, 0.021], [0.0062, 0.0225], [0, 0.024]], 8), C.metal, M.metal);
  P.add(lathe(smoothProfile([[0, -0.03], [0.022, -0.029], [0.0215, -0.019], [0.0142, -0.0145], [0, -0.014]], 6), 16), C.dark, M.gloss);
  const bulb = lathe(smoothProfile([[0, -0.118], [0.03, -0.114], [0.047, -0.098], [0.052, -0.074], [0.046, -0.05], [0.031, -0.034], [0.0185, -0.027], [0, -0.026]], 14), 20);
  I.add(bulb);
  P.add(at(torus(0.0515, 0.0042, 5, 20), 0, 0, 0).rotateX(Math.PI / 2).translate(0, -0.074, 0), C.cream, M.gloss);
  for (let k = 0; k < 3; k++) { const a = (k / 3) * Math.PI * 2; const fin = superEllipsoid(0.0035, 0.018, 0.012, 0.6, 0.6, 4, 5); fin.rotateY(a); P.add(at(fin, Math.sin(a) * 0.043, -0.052, Math.cos(a) * 0.043), C.cream, M.gloss); }
  const led = superEllipsoid(0.0028, 0.0028, 0.0028, 1, 1, 8, 5); P.add(at(led, 0, -0.022, 0.0205), C.red, M.led);
  const sq = decal(squidShape(0.026)); placeXY(sq, new V3(1, 0, 0), new V3(0, 1, 0), new V3(0, -0.075, 0.0548)); P.add(sq, C.decal, M.print);
  return { kind: 'bomb', body: P.build(), ink: I.build(), grip: { pos: new V3(0, 0, 0), handZ: new V3(0, 1, 0), handY: new V3(0.3, 0.1, -1) } };
}

// ---------------------------------------------------------------------------------------------- sub: world props
// Every prop below (not the bomb) is authored in PROP SPACE: origin at the BOTTOM CENTRE (the point that rests or sticks
// on a surface), +Y up away from that surface, +Z forward, metres. Each returns { kind, body, ink, grip } like the bomb
// (grip = LEFT-fist spec around a Ø ≤ 3 cm handle) plus per-kind extras. `glow` (optional) = team-ink parts meant to be
// lit (render with an emissive team material); the body always has an opaque socket behind them.
/** Grip frames. BOMB: as the splat bomb — the thumb runs toward prop +Y, so with the arm cocked for the throw the prop
 *  rides on top of the fist (upside down). UP: thumb toward prop -Y, the prop stays upright in the cocked fist. */
const HOLD_BOMB = { handZ: new V3(0, 1, 0), handY: new V3(0.3, 0.1, -1) };
const HOLD_UP = { handZ: new V3(0, -1, 0), handY: new V3(-0.3, -0.1, -1) };
const gripAt = (hold, x, y, z) => ({ pos: new V3(x, y, z), handZ: hold.handZ.clone(), handY: hold.handY.clone() });
/** Horizontal ring (axis +Y): radius R, tube r, at height y. */
function hring(R, r, y, rs = 5, ts = 24) { const g = torus(R, r, rs, ts); g.rotateX(Math.PI / 2); return at(g, 0, y, 0); }
/** Wrap a flat part around the +Y axis. Authored with x = along the surface, y = up, z = outward (decals: shape in XY,
 *  extruded +Z); lands on the cylinder of radius r at azimuth az (0 = +Z, π/2 = +X), lifted by y0. */
function wrapY(g, r, az, y0 = 0) {
  return deformG(g, (v) => { const R = r + v.z, a = az + v.x / r; v.set(R * Math.sin(a), y0 + v.y, R * Math.cos(a)); });
}
/** Same around the +Z axis: x runs back along -Z, y around the axis (az 0 = +X side, π/2 = top), z outward; axis at height yc. */
function wrapZ(g, r, az, z0, yc) {
  return deformG(g, (v) => { const R = r + v.z, a = az + v.y / r; v.set(R * Math.cos(a), yc + R * Math.sin(a), z0 - v.x); });
}
/** Radius of a lathe profile [[r, h], ...] at height h (first profile segment spanning h, linear). */
function profR(prof, h) {
  for (let i = 1; i < prof.length; i++) { const [r0, h0] = prof[i - 1], [r1, h1] = prof[i]; if (h1 !== h0 && (h - h0) * (h - h1) <= 0) return r0 + (r1 - r0) * (h - h0) / (h1 - h0); }
  return prof[h < prof[0][1] ? 0 : prof.length - 1][0];
}
/** wrapY onto a lathe wall of profile prof: the part's inner face follows the wall, `lift` off it. */
function wrapLathe(g, prof, az, y0, lift = 0.0003) {
  const r0 = profR(prof, y0);
  return deformG(g, (v) => { const R = profR(prof, y0 + v.y) + lift + v.z, a = az + v.x / r0; v.set(R * Math.sin(a), y0 + v.y, R * Math.cos(a)); });
}
/** Bend a flat decal placed on the tangent plane at c + n·R onto that sphere (each vertex keeps its height off the plane). */
function onSphere(g, c, n, R) {
  const p0 = c.clone().addScaledVector(n, R), d = new V3();
  return deformG(g, (v) => { const h = d.subVectors(v, p0).dot(n); d.subVectors(v, c).normalize(); v.copy(c).addScaledVector(d, R + h); });
}
/** Unit direction at azimuth az (0 = +Z) and elevation el on a sphere. */
const sphDir = (az, el) => new V3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
/** Sphere-zone lathe profile between elevations e0 < e1 (closed to the axis at both ends). */
function sphZone(R, yc, e0, e1, n = 8) {
  const pr = [[0, yc + R * Math.sin(e0)]];
  for (let i = 0; i <= n; i++) { const e = e0 + (e1 - e0) * i / n; pr.push([R * Math.cos(e), yc + R * Math.sin(e)]); }
  pr.push([0, yc + R * Math.sin(e1)]);
  return pr;
}
/** Swirl arms (comma-shaped Shapes) of radius ~r about the origin. */
function swirlShapes(r, arms = 2, turns = 0.62) {
  const out = [];
  for (let k = 0; k < arms; k++) {
    const a0 = (k / arms) * Math.PI * 2, n = 16, outer = [], inner = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n, a = a0 + t * turns * Math.PI * 2, rr = r * (0.16 + 0.84 * t), w = r * 0.15 * Math.sin(Math.PI * t) ** 0.8;
      outer.push(new THREE.Vector2(Math.cos(a) * (rr + w), Math.sin(a) * (rr + w)));
      inner.push(new THREE.Vector2(Math.cos(a) * (rr - w), Math.sin(a) * (rr - w)));
    }
    out.push(new THREE.Shape(outer.concat(inner.reverse())));
  }
  return out;
}
/** Chevrons centred on the origin, pointing along +x, or +y when up. */
function chevrons(w, h, n, up = false, gap = 0.45) {
  return chevronShape(w, h, n, gap).map((s) => { const g = decal(s); g.translate(-w / 2 - h * 0.25, -h / 2, 0); if (up) g.rotateZ(Math.PI / 2); return g; });
}
/** Knurled rubber knob / grip sleeve along +Y from y0 to y1 (radius ≈ 1.25 cm). */
function gripSleeve(y0, y1, r = 0.0126) {
  const L = y1 - y0;
  return lathe(smoothProfile([[0, y0], [r - 0.0014, y0 + 0.0006], [r, y0 + 0.005], [r - 0.0004, y0 + L * 0.5], [r, y1 - 0.005], [r - 0.0014, y1 - 0.0006], [0, y1]], 10), 14);
}
/** Small LED dome facing n at p. */
function led(P, p, n, col, r = 0.0034) { P.add(orient(superEllipsoid(r, r * 0.55, r, 1, 1, 8, 5), n, p), col, M.led); }

/** Cling Charge: a squat cream charge on a big soft rubber suction pad, team goo squeezed out around the rim; ink windows
 *  on both flanks, knurled knob on top (the fist's handle) capped by the red fuse light. ~0.21 wide, 0.16 tall. */
function buildSticky() {
  const P = new Parts(), I = new Parts();
  // suction pad + adhesive goo (lumpy, flattened where it meets the surface at y = 0)
  P.add(lathe(smoothProfile([[0, 0.003], [0.06, 0.0025], [0.095, 0.002], [0.1035, 0.005], [0.1045, 0.0105], [0.097, 0.0175], [0.082, 0.025], [0.062, 0.031], [0.036, 0.034], [0, 0.035]], 14), 30), C.rubber, M.rubber);
  const Rg = 0.099;
  I.add(deformG(hring(Rg, 0.0074, 0, 6, 44), (v) => {
    const a = Math.atan2(v.z, v.x), cx = Math.cos(a) * Rg, cz = Math.sin(a) * Rg;
    const k = 1 + 0.3 * Math.max(0, Math.sin(a * 5 + 0.7)) ** 2 + 0.1 * Math.sin(a * 13);
    v.x = cx + (v.x - cx) * k; v.z = cz + (v.z - cz) * k; v.y = Math.max(0, 0.0064 + v.y * 0.85 * k);
  }));
  // dark base plate, cream dome, clamp tabs with screws
  P.add(lathe([[0, 0.028], [0.08, 0.028], [0.0858, 0.031], [0.0866, 0.038], [0.0828, 0.0425], [0, 0.0425]], 30), C.dark, M.gloss);
  const dome = smoothProfile([[0, 0.04], [0.0775, 0.041], [0.0822, 0.051], [0.0822, 0.069], [0.0765, 0.086], [0.061, 0.0995], [0.036, 0.1065], [0, 0.1085]], 14);
  P.add(lathe(dome, 30), C.cream, M.satin);
  for (const az of [Math.PI / 4, -Math.PI / 4, 3 * Math.PI / 4, -3 * Math.PI / 4]) {
    P.add(wrapY(superEllipsoid(0.0085, 0.0125, 0.0036, 0.5, 0.55, 6, 6), 0.0838, az, 0.043), C.dark, M.satin);
    screw(P, new V3(Math.sin(az) * 0.0872, 0.045, Math.cos(az) * 0.0872), new V3(Math.sin(az), 0, Math.cos(az)), 0.0028);
  }
  // ink windows on the flanks (dark gasket, bulging team pane)
  for (const az of [Math.PI / 2, -Math.PI / 2]) {
    P.add(wrapY(superEllipsoid(0.031, 0.0135, 0.003, 0.45, 0.4, 12, 6), 0.0818, az, 0.062), C.dark, M.gloss);
    I.add(wrapY(superEllipsoid(0.0265, 0.0098, 0.0038, 0.55, 0.5, 12, 6), 0.0818, az, 0.062));
  }
  // squid decal (front), team chevrons pointing down at the pad (back)
  P.add(wrapLathe(decal(squidShape(0.03)), dome, 0, 0.061), C.dark, M.print);
  for (const g of chevrons(0.03, 0.012, 3)) { g.rotateZ(-Math.PI / 2); I.add(wrapLathe(g, dome, Math.PI, 0.062)); }
  // top: collar + team ring, knurled knob, metal bezel, red fuse light
  P.add(lathe([[0, 0.103], [0.021, 0.103], [0.0232, 0.107], [0.021, 0.1125], [0, 0.1135]], 16), C.dark, M.gloss);
  I.add(hring(0.037, 0.0036, 0.1055, 5, 26));
  P.add(gripSleeve(0.111, 0.1505), C.rubber, M.rubber);
  P.add(lathe([[0, 0.15], [0.0142, 0.15], [0.0148, 0.1532], [0.0128, 0.1552], [0, 0.1556]], 14), C.metal, M.metal);
  P.add(at(superEllipsoid(0.0104, 0.0068, 0.0104, 1, 1, 12, 6), 0, 0.1542, 0), C.red, M.led);
  return { kind: 'sticky', body: P.build(), ink: I.build(), grip: gripAt(HOLD_BOMB, 0, 0.131, 0) };
}

/** Pop Pellet: a stubby capsule lying along Z — cream shells, a caged band of team ink core, a rubber contact-trigger
 *  nub with a metal plunger on the nose (+Z), swept tail fins and a knurled tail stub (the fist's handle). ~0.15 long. */
function buildBurst() {
  const P = new Parts(), I = new Parts();
  const yc = 0.0345, Z = (g) => at(g, 0, yc, 0);                     // capsule axis height (the gaskets touch the ground)
  const rear = smoothProfile([[0.001, -0.047], [0.016, -0.0455], [0.026, -0.04], [0.0318, -0.031], [0.0334, -0.024], [0.0334, -0.018]], 9);
  P.add(Z(latheZ([[0, -0.047]].concat(rear, [[0, -0.018]]), 20)), C.cream, M.gloss);
  P.add(Z(latheZ([[0, 0.027]].concat(smoothProfile([[0.0334, 0.027], [0.0334, 0.033], [0.031, 0.042], [0.0245, 0.0498], [0.0165, 0.0545]], 8), [[0, 0.055]]), 20)), C.cream, M.gloss);
  for (const z of [-0.0185, 0.0265]) P.add(Z(latheZ([[0, z - 0.0034], [0.0322, z - 0.0034], [0.0345, z - 0.0016], [0.0345, z + 0.0016], [0.0322, z + 0.0034], [0, z + 0.0034]], 20)), C.dark, M.gloss);
  // ink core + cage bars
  I.add(Z(latheZ(smoothProfile([[0, -0.018], [0.0302, -0.0178], [0.0316, -0.008], [0.0319, 0.004], [0.0316, 0.016], [0.0302, 0.0258], [0, 0.026]], 8), 20)));
  for (let k = 0; k < 4; k++) { const a = Math.PI / 4 + k * Math.PI / 2; P.add(Z(at(superEllipsoid(0.0024, 0.0024, 0.0205, 0.6, 0.6, 4, 5), Math.cos(a) * 0.0323, Math.sin(a) * 0.0323, 0.004)), C.dark, M.satin); }
  // nose: hazard collar, rubber trigger nub, metal plunger
  P.add(Z(latheZ([[0, 0.0505], [0.0178, 0.0505], [0.0186, 0.0525], [0.0178, 0.0548], [0, 0.0548]], 16)), C.hazard, M.gloss);
  P.add(Z(latheZ([[0, 0.052]].concat(smoothProfile([[0.0142, 0.0525], [0.0156, 0.057], [0.0146, 0.0615], [0.0105, 0.0648]], 6), [[0, 0.0652]]), 14)), C.rubber, M.rubber);
  P.add(Z(latheZ([[0, 0.063], [0.0058, 0.063], [0.0058, 0.0678], [0.0074, 0.0688], [0.0074, 0.0718], [0.0048, 0.0735], [0, 0.0738]], 10)), C.metal, M.metal);
  // tail: four swept fins (X pattern, clear of the ground), knurled stub, metal end cap
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + k * Math.PI / 2;
    const fin = superEllipsoid(0.0022, 0.0095, 0.0115, 0.6, 0.6, 4, 5, (q) => { q.z -= 0.45 * (q.y + 0.0095) * 0.5; });
    fin.rotateZ(a - Math.PI / 2); P.add(Z(at(fin, Math.cos(a) * 0.0305, Math.sin(a) * 0.0305, -0.03)), C.cream, M.gloss);
  }
  const stub = latheZ(smoothProfile([[0, -0.0745], [0.0112, -0.074], [0.0126, -0.0695], [0.0122, -0.06], [0.0126, -0.051], [0.0118, -0.0465]], 8).concat([[0, -0.046]]), 12);
  P.add(Z(stub), C.rubber, M.rubber);
  P.add(Z(latheZ([[0, -0.0785], [0.0082, -0.0785], [0.0104, -0.0768], [0.0106, -0.0738], [0, -0.0738]], 12)), C.metal, M.metal);
  // squid decal (left flank), armed LED on top
  P.add(deformG(wrapZ(decal(squidShape(0.017)), 0.0334, 0, -0.029, yc), (v) => {
    const a = Math.atan2(v.y - yc, v.x), R = Math.hypot(v.x, v.y - yc) - 0.0334 + profR(rear, v.z) + 0.0003;
    v.set(R * Math.cos(a), yc + R * Math.sin(a), v.z);
  }), C.dark, M.print);
  led(P, new V3(0, yc + 0.0322, -0.029), new V3(0, 1, 0.12), C.amber, 0.0031);
  return { kind: 'burst', body: P.build(), ink: I.build(), grip: { pos: new V3(0, yc, -0.0625), handZ: new V3(0, 0, -1), handY: new V3(0.3, -1, 0.1) } };
}

/** Skitter Bomb: a little ground-runner facing +Z — a bulbous team-ink shell on a dark chassis, four chunky lugged wheels
 *  under cream fenders, a cream bumper and a cyclops sensor eye (red pupil) up front, a wind-up key on the roof and a tow
 *  handle on the tail (the fist's handle). ~0.31 long incl. the handle, 0.155 tall; the wheels touch y = 0. */
function buildSeeker() {
  const P = new Parts(), I = new Parts();
  const wr = 0.032, wx = 0.071, wz = 0.088;
  // wheels: lugged rubber tyres, cream hub caps, metal nuts
  for (const sx of [1, -1]) for (const sz of [1, -1]) {
    const tyre = lathe(smoothProfile([[0, -0.0125], [0.022, -0.0127], [0.0282, -0.0104], [0.0295, -0.004], [0.0295, 0.004], [0.0282, 0.0104], [0.022, 0.0127], [0, 0.0125]], 10), 30, (v) => {
      const rr = Math.hypot(v.x, v.z);
      if (rr > 0.025) { const a = Math.atan2(v.z, v.x); const k = 1 + 0.085 * (0.5 + 0.5 * Math.max(-1, Math.min(1, Math.sin(a * 10) * 3))) * Math.min(1, (rr - 0.025) / 0.004); v.x *= k; v.z *= k; }
    });
    tyre.rotateZ(Math.PI / 2); P.add(at(tyre, sx * wx, wr, sz * wz), C.rubber, M.rubber);
    P.add(orient(lathe([[0, 0], [0.0188, 0], [0.0198, 0.0036], [0.0145, 0.0082], [0, 0.0092]], 14), new V3(sx, 0, 0), new V3(sx * (wx + 0.011), wr, sz * wz)), C.cream, M.gloss);
    P.add(orient(lathe([[0, 0], [0.0058, 0], [0.0058, 0.003], [0, 0.0038]], 6), new V3(sx, 0, 0), new V3(sx * (wx + 0.0195), wr, sz * wz)), C.metal, M.metal);
    // fender: chunky arc over the wheel
    const f = torus(0.0408, 0.0082, 5, 12, 2.3); f.rotateZ(Math.PI / 2 - 1.15); f.rotateY(Math.PI / 2); f.scale(1.9, 1, 1);
    P.add(at(f, sx * wx, wr, sz * wz), C.cream, M.gloss);
  }
  // chassis, ink shell, rear block + tail lights, front bumper
  P.add(at(superEllipsoid(0.056, 0.017, 0.118, 0.4, 0.45, 12, 6), 0, 0.04, 0), C.dark, M.gloss);
  I.add(at(superEllipsoid(0.058, 0.044, 0.098, 0.75, 0.8, 18, 12, (q) => { if (q.z < 0) q.y *= 1 + 0.08 * (-q.z / 0.098); }), 0, 0.078, -0.004));
  P.add(at(superEllipsoid(0.046, 0.016, 0.014, 0.45, 0.55, 10, 6), 0, 0.044, -0.124), C.dark, M.satin);
  for (const sx of [1, -1]) led(P, new V3(sx * 0.028, 0.048, -0.1375), new V3(0, 0, -1), C.red, 0.0042);
  P.add(at(superEllipsoid(0.052, 0.0145, 0.0135, 0.5, 0.6, 12, 6), 0, 0.041, 0.126), C.cream, M.gloss);
  P.add(at(superEllipsoid(0.046, 0.0056, 0.006, 0.6, 0.6, 10, 4), 0, 0.041, 0.1385), C.rubber, M.rubber);
  for (const sx of [1, -1]) screw(P, new V3(sx * 0.034, 0.0415, 0.1394), new V3(0, 0, 1), 0.0026);
  for (const sx of [1, -1]) for (const z of [-0.035, 0.035]) screw(P, new V3(sx * 0.0555, 0.04, z), new V3(sx, 0, 0), 0.0025);
  // cyclops sensor eye: cream bezel, black lens, red LED pupil, dark brow visor
  const ey = 0.084, ez = 0.084;
  P.add(at(torus(0.0192, 0.0046, 6, 20), 0, ey, ez + 0.008), C.cream, M.gloss);
  P.add(at(superEllipsoid(0.0172, 0.0172, 0.0085, 1, 1, 14, 8), 0, ey, ez + 0.0065), C.lens, M.lens);
  P.add(at(superEllipsoid(0.0056, 0.0056, 0.0026, 1, 1, 10, 5), 0, ey, ez + 0.0145), C.red, M.led);
  const brow = superEllipsoid(0.03, 0.0058, 0.012, 0.5, 0.6, 10, 5); brow.rotateX(-0.35); P.add(at(brow, 0, ey + 0.024, ez - 0.001), C.dark, M.gloss);
  // squid decals on both flanks of the shell
  for (const sx of [1, -1]) {
    const sq = decal(squidShape(0.024)); placeXY(sq, new V3(0, 0, -sx), new V3(0, 1, 0), new V3(0, 0.08, -0.03));
    P.add(deformG(sq, (v) => { const lz = v.z + 0.004, ly = (v.y - 0.078) / (1 + 0.08 * Math.max(0, -lz / 0.098)); v.x += sx * (seX(0.058, 0.044, 0.098, 0.75, 0.8, ly, lz) + 0.0003); }), C.decal, M.print);
  }
  // wind-up key on the roof: dark boss, metal stem, cream bow
  const kz = -0.052;
  P.add(at(lathe([[0, -0.006], [0.0158, -0.006], [0.017, -0.001], [0.0152, 0.004], [0, 0.0045]], 14), 0, 0.118, kz), C.dark, M.gloss);
  P.add(at(lathe([[0, 0.12], [0.0045, 0.12], [0.0045, 0.136], [0, 0.136]], 8), 0, 0, kz), C.metal, M.metal);
  for (const sx of [1, -1]) P.add(at(superEllipsoid(0.0122, 0.0095, 0.0042, 0.7, 0.9, 12, 6), sx * 0.0115, 0.1435, kz), C.cream, M.gloss);
  P.add(at(superEllipsoid(0.006, 0.006, 0.0054, 1, 1, 8, 6), 0, 0.1435, kz), C.metal, M.metal);
  // tow handle on the tail (the fist's handle): dark D-loop from the shell to the rear block, rubber sleeve on its upright
  const th = sweep([new V3(0, 0.104, -0.084), new V3(0, 0.113, -0.118), new V3(0, 0.1, -0.1515), new V3(0, 0.068, -0.1605), new V3(0, 0.036, -0.1535), new V3(0, 0.03, -0.132)], {
    seg: 18, radial: 7, capSteps: 2, radius: () => 0.0064, flat: 1.25, outward: (Pp, o) => o.set(1, 0, 0),
  });
  P.add(th.geo, C.dark, M.satin);
  const sl = []; for (let k = 0; k <= 6; k++) sl.push(th.curve.getPointAt(0.43 + k * 0.047));
  P.add(sweep(sl, { seg: 12, radial: 8, capSteps: 2, radius: (t) => 0.0102 + 0.0006 * Math.cos(t * Math.PI * 10), flat: 1.05, outward: (Pp, o) => o.set(1, 0, 0) }).geo, C.rubber, M.rubber);
  return { kind: 'seeker', body: P.build(), ink: I.build(), grip: gripAt(HOLD_UP, 0, 0.066, -0.16) };
}

/** Echo Orb: a white sphere with a glowing team band round its equator (dark gaskets, dark socket behind), sonar rings
 *  and a team ring on the crown, a rubber foot, and a short antenna whose knurled base is the fist's handle. Ø 0.18. */
function buildScan() {
  const P = new Parts(), I = new Parts(), L = new Parts();
  const R = 0.09, yc = 0.09, bh = 0.0088;                              // sphere radius / centre height, band half-height
  const eb = Math.asin(bh / R);
  P.add(lathe(sphZone(R, yc, eb, Math.PI / 2 - 0.02, 10), 30), C.white, M.gloss);
  P.add(lathe(sphZone(R, yc, -Math.PI / 2 + 0.02, -eb, 10), 30), C.white, M.gloss);
  P.add(lathe([[0, yc - bh - 0.001], [0.0888, yc - bh - 0.001], [0.0888, yc + bh + 0.001], [0, yc + bh + 0.001]], 30), C.darker, M.satin);   // socket
  L.add(lathe([[0, yc - bh], [0.0902, yc - bh], [0.0935, yc - bh * 0.5], [0.0938, yc], [0.0935, yc + bh * 0.5], [0.0902, yc + bh], [0, yc + bh]], 36));
  for (const s of [1, -1]) P.add(hring(Math.sqrt(R * R - (bh + 0.0012) ** 2), 0.0029, yc + s * (bh + 0.0012), 5, 32), C.dark, M.gloss);
  // crown: team ring + two sonar grooves; bottom: rubber foot
  for (const [el, col] of [[0.66, null], [0.92, C.darker], [1.14, C.darker]]) {
    const g = hring(R * Math.cos(el), col ? 0.0019 : 0.0034, yc + R * Math.sin(el), 4, 28);
    if (col) P.add(g, col, M.satin); else I.add(g);
  }
  P.add(lathe([[0, 0], [0.028, 0], [0.0322, 0.0022], [0.0322, 0.0068], [0, 0.0068]], 20), C.rubber, M.rubber);
  // squid decal on the front of the upper shell
  { const n = sphDir(0, 0.36), c = new V3(0, yc, 0); const sq = decal(squidShape(0.028)); placeXY(sq, new V3(1, 0, 0), new V3(0, Math.cos(0.36), -Math.sin(0.36)), c.clone().addScaledVector(n, R + 0.0003)); P.add(onSphere(sq, c, n, R), C.dark, M.print); }
  // antenna: collar, knurled base (grip), metal whip, glowing tip
  P.add(lathe([[0, 0.172], [0.0188, 0.172], [0.0206, 0.1768], [0.0196, 0.1832], [0.0146, 0.1862], [0, 0.1865]], 16), C.dark, M.gloss);
  P.add(gripSleeve(0.185, 0.2155), C.rubber, M.rubber);
  P.add(lathe([[0, 0.215], [0.0036, 0.215], [0.003, 0.2445], [0, 0.2455]], 8), C.metal, M.metal);
  P.add(lathe([[0, 0.2425], [0.0058, 0.2425], [0.0058, 0.2455], [0, 0.2455]], 10), C.dark, M.gloss);
  L.add(at(superEllipsoid(0.0078, 0.0078, 0.0078, 1, 1, 10, 7), 0, 0.2515, 0));
  return { kind: 'scan', body: P.build(), ink: I.build(), glow: L.build(), grip: gripAt(HOLD_BOMB, 0, 0.2, 0) };
}

/** Drip Curtain emitter: a low cream rail (X) on a rubber foot strip — hazard-striped dark end caps, a long team-ink
 *  window on the front, and a dark manifold with team feed lines along the top carrying seven metal nozzles (ink welling
 *  in each, tips at y ≈ 0.10) that the curtain rises from. The back has a squid decal, team up-chevrons and a D-handle
 *  (the fist's handle). ~0.42 × 0.1 × 0.12 (handle included: 0.14 deep); returns `width`. */
function buildCurtain() {
  const P = new Parts(), I = new Parts();
  P.add(at(rbox(0.392, 0.012, 0.084, 0.3, 16, 4), 0, 0.006, 0), C.rubber, M.rubber);
  P.add(at(superEllipsoid(0.178, 0.034, 0.04, 0.35, 0.4, 22, 8), 0, 0.044, 0), C.cream, M.satin);
  for (const sx of [1, -1]) {
    P.add(at(superEllipsoid(0.022, 0.044, 0.05, 0.4, 0.5, 8, 8), sx * 0.189, 0.046, 0), C.dark, M.gloss);
    for (const [x, col] of [[0.155, C.hazard], [0.1605, C.dark], [0.166, C.hazard]]) P.add(at(superEllipsoid(0.0027, 0.0357, 0.0418, 0.35, 0.4, 4, 8), sx * x, 0.044, 0), col, M.print);
    for (const y of [0.028, 0.064]) screw(P, new V3(sx * 0.2108, y, 0), new V3(sx, 0, 0), 0.003);
    led(P, new V3(sx * 0.189, 0.07, 0.0496), new V3(0, 0, 1), C.green, 0.0036);
  }
  // long team window on the front
  P.add(at(superEllipsoid(0.126, 0.0158, 0.004, 0.35, 0.4, 18, 5), 0, 0.042, 0.0392), C.dark, M.gloss);
  I.add(at(superEllipsoid(0.1205, 0.0118, 0.0047, 0.5, 0.45, 18, 5), 0, 0.042, 0.0392));
  for (const sx of [1, -1]) screw(P, new V3(sx * 0.14, 0.043, 0.0398), new V3(0, 0, 1), 0.0028);
  // manifold + nozzles (ink domes welling in the mouths)
  P.add(at(superEllipsoid(0.166, 0.0078, 0.0172, 0.4, 0.45, 18, 4), 0, 0.0795, 0), C.dark, M.gloss);
  for (const s of [1, -1]) I.add(at(superEllipsoid(0.158, 0.0032, 0.0034, 0.6, 0.6, 18, 4), 0, 0.083, s * 0.0118));
  for (let i = 0; i < 7; i++) {
    const x = -0.15 + i * 0.05;
    P.add(at(lathe([[0, 0], [0.0078, 0], [0.0078, 0.004], [0.0058, 0.006], [0.0052, 0.0128], [0.0067, 0.0142], [0.0067, 0.0172], [0.0044, 0.0182], [0, 0.018]], 10), x, 0.0832, 0), C.metal, M.metal);
    I.add(at(superEllipsoid(0.0041, 0.0022, 0.0041, 1, 1, 8, 4), x, 0.1004, 0));
  }
  // back D-handle (vertical rubber grip) + mounts; decals on the back face
  const hd = sweep([new V3(0, 0.068, -0.036), new V3(0, 0.074, -0.058), new V3(0, 0.063, -0.0735), new V3(0, 0.043, -0.077), new V3(0, 0.023, -0.0735), new V3(0, 0.012, -0.058), new V3(0, 0.018, -0.036)], {
    seg: 18, radial: 7, capSteps: 2, radius: () => 0.0066, flat: 1.25, outward: (Pp, o) => o.set(1, 0, 0),
  });
  P.add(hd.geo, C.dark, M.satin);
  const sl = []; for (let k = 0; k <= 6; k++) sl.push(hd.curve.getPointAt(0.3 + k * 0.0667));
  P.add(sweep(sl, { seg: 12, radial: 8, capSteps: 2, radius: (t) => 0.0104 + 0.0006 * Math.cos(t * Math.PI * 10), flat: 1.05, outward: (Pp, o) => o.set(1, 0, 0) }).geo, C.rubber, M.rubber);
  for (const y of [0.066, 0.02]) P.add(at(superEllipsoid(0.013, 0.0095, 0.0055, 0.5, 0.6, 8, 5), 0, y, -0.0418), C.dark, M.gloss);
  const sq = decal(squidShape(0.034)); placeXY(sq, new V3(-1, 0, 0), new V3(0, 1, 0), new V3(0.095, 0.0425, -0.0399)); P.add(sq, C.dark, M.print);
  for (const g of chevrons(0.036, 0.014, 3, true)) { placeXY(g, new V3(-1, 0, 0), new V3(0, 1, 0), new V3(-0.095, 0.0425, -0.0399)); I.add(g); }
  const body = P.build(); body.computeBoundingBox();
  return { kind: 'curtain', body, ink: I.build(), width: +(body.boundingBox.max.x - body.boundingBox.min.x).toFixed(3), grip: gripAt(HOLD_UP, 0, 0.043, -0.077) };
}

/** Twirl Sprinkler: a cream mounting base (rubber foot, team ring, three bolted lugs) with a riser whose knurled sleeve is
 *  the fist's handle. The head — hub, team-ink dome, three hooked arms with nozzles — is the separate `spin` mesh
 *  (+ `spinInk`), authored in prop space, turning about the +Y axis through `spinAt`. Base Ø 0.16, arms Ø ~0.17. */
function buildSprinkler() {
  const P = new Parts(), I = new Parts(), S = new Parts(), SI = new Parts();
  P.add(lathe([[0, 0], [0.0765, 0], [0.0802, 0.003], [0.0795, 0.0085], [0, 0.0085]], 32), C.rubber, M.rubber);
  P.add(lathe(smoothProfile([[0, 0.0065], [0.0742, 0.0065], [0.0768, 0.012], [0.0735, 0.02], [0.059, 0.0285], [0.036, 0.0335], [0.016, 0.0355], [0, 0.036]], 12), 32), C.cream, M.satin);
  I.add(hring(0.0596, 0.0034, 0.0272, 5, 30));
  for (let k = 0; k < 3; k++) {
    const az = Math.PI / 3 + k * Math.PI * 2 / 3, d = new V3(Math.sin(az), 0, Math.cos(az));
    const lug = superEllipsoid(0.0118, 0.0068, 0.0145, 0.5, 0.6, 8, 5); lug.rotateY(az); P.add(at(lug, d.x * 0.0735, 0.0125, d.z * 0.0735), C.dark, M.satin);
    screw(P, new V3(d.x * 0.0765, 0.0192, d.z * 0.0765), new V3(0, 1, 0), 0.0032);
  }
  const sq = decal(squidShape(0.022)); placeXY(sq, new V3(1, 0, 0), new V3(0, 0.6, -1), new V3(0, 0.0252, 0.0672)); P.add(sq, C.dark, M.print);
  // riser: collar, metal tube, knurled grip sleeve, bearing collar
  P.add(lathe([[0, 0.0335], [0.0182, 0.0335], [0.0198, 0.0375], [0.0182, 0.0418], [0, 0.042]], 16), C.dark, M.gloss);
  P.add(lathe([[0, 0.04], [0.0085, 0.04], [0.0085, 0.1], [0, 0.1]], 10), C.metal, M.metal);
  P.add(gripSleeve(0.0415, 0.0925), C.rubber, M.rubber);
  P.add(lathe([[0, 0.092], [0.0152, 0.092], [0.0162, 0.0948], [0.0152, 0.0985], [0, 0.0985]], 16), C.metal, M.metal);
  // spinning head (prop space, pivot spinAt on the +Y axis)
  const hy = 0.0985;
  S.add(lathe(smoothProfile([[0, hy], [0.0205, hy + 0.0005], [0.0245, hy + 0.0048], [0.0248, hy + 0.0128], [0.021, hy + 0.0178]], 7).concat([[0, hy + 0.018]]), 22), C.dark, M.gloss);
  SI.add(lathe(smoothProfile([[0, hy + 0.017], [0.019, hy + 0.0172], [0.0178, hy + 0.0228], [0.0115, hy + 0.0282], [0, hy + 0.0296]], 8), 20));
  S.add(at(lathe([[0, 0], [0.0042, 0], [0.0042, 0.0022], [0, 0.0032]], 8), 0, hy + 0.0292, 0), C.metal, M.metal);
  const ay = hy + 0.0095;
  for (let k = 0; k < 3; k++) {
    const a = k * Math.PI * 2 / 3, u = new V3(Math.cos(a), 0, Math.sin(a)), t = new V3(-Math.sin(a), 0, Math.cos(a));
    const pt = (r, s, dy = 0) => new V3(0, ay + dy, 0).addScaledVector(u, r).addScaledVector(t, s);
    const pts = [pt(0.018, 0), pt(0.042, 0.002, 0.0015), pt(0.063, 0.009, 0.002), pt(0.0735, 0.022, 0.001), pt(0.0712, 0.034)];
    S.add(sweep(pts, { seg: 14, radial: 6, capSteps: 2, radius: () => 0.0054, flat: 1, outward: (Pp, o) => o.set(0, 1, 0) }).geo, C.gunmetal, M.metal);
    const dir = pts[4].clone().sub(pts[3]).normalize(), tip = pts[4].clone().addScaledVector(dir, 0.002);
    S.add(orient(lathe([[0, 0], [0.0072, 0], [0.0072, 0.0042], [0.0054, 0.0068], [0.0054, 0.0112], [0, 0.0112]], 8), dir, tip), C.metal, M.metal);
    SI.add(orient(superEllipsoid(0.0042, 0.0024, 0.0042, 1, 1, 8, 4), dir, tip.clone().addScaledVector(dir, 0.0112)));
    const w = superEllipsoid(0.0085, 0.0085, 0.0085, 1, 1, 8, 6); S.add(at(w, pts[2].x, pts[2].y, pts[2].z), C.cream, M.gloss);   // balance knuckle
  }
  // hazard index mark on the hub rim (makes the rotation readable)
  { const a = Math.PI / 3; const m = superEllipsoid(0.0022, 0.0045, 0.006, 0.6, 0.6, 5, 5); m.rotateY(-a + Math.PI / 2); S.add(at(m, Math.cos(a) * 0.0248, hy + 0.009, Math.sin(a) * 0.0248), C.hazard, M.print); }
  return {
    kind: 'sprinkler', body: P.build(), ink: I.build(), spin: S.build(), spinInk: SI.build(), spinAt: new V3(0, hy, 0),
    grip: gripAt(HOLD_UP, 0, 0.067, 0),
  };
}

/** Lurk Mine: a flat dark disc on a rubber foot, cream deck, a metal pressure plate (rubber gasket, red LED) in the middle,
 *  team-ink seams (radial + rings) and ink slots round the rim; a small rim lug at the back is the fist's handle.
 *  Ø 0.3 (lug to 0.18 behind), 0.06 tall — sits flush in ink. */
function buildMine() {
  const P = new Parts(), I = new Parts();
  P.add(lathe([[0, 0], [0.1365, 0], [0.1412, 0.003], [0.1395, 0.0075], [0, 0.0075]], 40), C.rubber, M.rubber);
  P.add(lathe(smoothProfile([[0, 0.0052], [0.1405, 0.0052], [0.1486, 0.0105], [0.15, 0.021], [0.1472, 0.0305], [0.1385, 0.0365], [0.122, 0.0392]], 10).concat([[0, 0.0395]]), 40), C.dark, M.gloss);
  const deckY = (r) => 0.0502 - 0.078 * Math.max(0, r - 0.062) ** 1.6;
  const dk = [[0, 0.038]]; for (const r of [0.132, 0.1335, 0.13, 0.12, 0.1, 0.08, 0.062]) dk.push([r, r > 0.131 ? 0.0405 : deckY(r)]);
  dk.splice(1, 0, [0.128, 0.0378]); dk.push([0, 0.0502]);
  P.add(lathe(dk, 40), C.cream, M.satin);
  // pressure plate: rubber gasket, metal plate with grip grooves, red LED
  P.add(hring(0.0532, 0.0032, 0.0508, 5, 28), C.rubber, M.rubber);
  P.add(lathe(smoothProfile([[0, 0.05], [0.0492, 0.0502], [0.0506, 0.0536], [0.0478, 0.0566], [0.03, 0.0578], [0, 0.058]], 8), 28), C.metal, M.metal);
  for (const [r, y] of [[0.0385, 0.0572], [0.0245, 0.0578]]) P.add(hring(r, 0.0011, y, 3, 24), C.darker, M.satin);
  P.add(at(superEllipsoid(0.0068, 0.0032, 0.0068, 1, 1, 10, 5), 0, 0.0582, 0), C.red, M.led);
  // ink seams: ring round the plate, ring at the deck edge, six radial seams
  I.add(hring(0.059, 0.0034, 0.0497, 4, 30));
  I.add(hring(0.1318, 0.0036, 0.0402, 4, 44));
  for (let k = 0; k < 6; k++) {
    const az = Math.PI / 6 + k * Math.PI / 3, r = 0.094;
    const s = superEllipsoid(0.0036, 0.0019, 0.0295, 0.6, 0.6, 4, 6); s.rotateX(0.075); s.rotateY(az);
    I.add(at(s, Math.sin(az) * r, deckY(r) + 0.0004, Math.cos(az) * r));
  }
  // ink slots round the rim (none behind, where the lug is), screws and LEDs on the deck, squid decal up front
  for (const az of [0, Math.PI / 3, -Math.PI / 3, 2 * Math.PI / 3, -2 * Math.PI / 3]) I.add(wrapY(superEllipsoid(0.021, 0.0062, 0.0032, 0.5, 0.45, 10, 5), 0.1492, az, 0.0212));
  for (let k = 0; k < 6; k++) { const az = k * Math.PI / 3, r = 0.121; screw(P, new V3(Math.sin(az) * r, deckY(r) - 0.0004, Math.cos(az) * r), new V3(0, 1, 0), 0.003); }
  for (const s of [1, -1]) led(P, new V3(Math.sin(s * 2 * Math.PI / 3 + 0.2) * 0.106, deckY(0.106), Math.cos(s * 2 * Math.PI / 3 + 0.2) * 0.106), new V3(0, 1, 0), C.amber, 0.0036);
  const sq = decal(squidShape(0.034)); placeXY(sq, new V3(1, 0, 0), new V3(0, 0.07, -1), new V3(0, deckY(0.094) + 0.0003, 0.094)); P.add(sq, C.dark, M.print);
  // back rim lug: dark bracket with a short vertical rubber grip
  const lug = sweep([new V3(0, 0.012, -0.143), new V3(0, 0.009, -0.163), new V3(0, 0.017, -0.1735), new V3(0, 0.031, -0.1755), new V3(0, 0.045, -0.1735), new V3(0, 0.052, -0.163), new V3(0, 0.046, -0.141)], {
    seg: 16, radial: 7, capSteps: 2, radius: () => 0.0056, flat: 1.3, outward: (Pp, o) => o.set(1, 0, 0),
  });
  P.add(lug.geo, C.dark, M.satin);
  const sl = []; for (let k = 0; k <= 5; k++) sl.push(lug.curve.getPointAt(0.33 + k * 0.068));
  P.add(sweep(sl, { seg: 10, radial: 8, capSteps: 2, radius: (t) => 0.0098 + 0.0005 * Math.cos(t * Math.PI * 8), flat: 1.1, outward: (Pp, o) => o.set(1, 0, 0) }).geo, C.rubber, M.rubber);
  P.add(at(superEllipsoid(0.015, 0.0205, 0.0065, 0.5, 0.6, 8, 6), 0, 0.027, -0.1465), C.dark, M.gloss);
  return { kind: 'mine', body: P.build(), ink: I.build(), grip: gripAt(HOLD_UP, 0, 0.031, -0.1755) };
}

/** Hop Beacon: a weighted base (rubber foot, cream band with squid + team up-chevrons, dark dome, team ring), a metal mast
 *  with a knurled grip (the fist's handle) and a hop spring, and a cream dish crowned with team-tipped prongs around a
 *  glowing team light (`glow`, dark socket behind it). ~0.15 wide, 0.28 tall. */
function buildBeacon() {
  const P = new Parts(), I = new Parts(), L = new Parts();
  P.add(lathe([[0, 0], [0.0705, 0], [0.0745, 0.0032], [0.0735, 0.0092], [0, 0.0092]], 30), C.rubber, M.rubber);
  const band = [[0, 0.0082], [0.0726, 0.0082], [0.0742, 0.012], [0.0742, 0.0282], [0.0726, 0.032], [0, 0.032]];
  P.add(lathe(band, 30), C.cream, M.satin);
  P.add(lathe(smoothProfile([[0, 0.0305], [0.0702, 0.0305], [0.0716, 0.0345], [0.0645, 0.0432], [0.045, 0.0512], [0.024, 0.0556], [0.012, 0.0562]], 10).concat([[0, 0.0562]]), 30), C.dark, M.gloss);
  P.add(hring(0.0728, 0.0028, 0.0312, 4, 32), C.gunmetal, M.metal);
  I.add(hring(0.0512, 0.0034, 0.0498, 5, 28));
  P.add(wrapLathe(decal(squidShape(0.0158)), band.slice(1, 5), 0, 0.0196), C.dark, M.print);
  for (const az of [2 * Math.PI / 3, -2 * Math.PI / 3]) for (const g of chevrons(0.0165, 0.0095, 2, true, 0.4)) I.add(wrapLathe(g, band.slice(1, 5), az, 0.0202));
  // mast: collars, knurled grip, hop spring
  P.add(lathe([[0, 0.05], [0.0082, 0.05], [0.0082, 0.212], [0, 0.212]], 10), C.metal, M.metal);
  for (const [y0, y1] of [[0.052, 0.061], [0.083, 0.0895], [0.1465, 0.153]]) P.add(lathe([[0, y0], [0.0142, y0], [0.0154, y0 + 0.002], [0.0154, y1 - 0.002], [0.0142, y1], [0, y1]], 14), C.dark, M.gloss);
  P.add(gripSleeve(0.089, 0.147), C.rubber, M.rubber);
  const coil = []; for (let i = 0; i <= 40; i++) { const t = i / 40, a = t * Math.PI * 2 * 5; coil.push(new V3(Math.cos(a) * 0.0138, 0.1555 + t * 0.0435, Math.sin(a) * 0.0138)); }
  P.add(sweep(coil, { seg: 90, radial: 5, capSteps: 2, radius: () => 0.0026, curveType: 'catmullrom' }).geo, C.metal, M.metal);
  // dish + crown prongs with team tips, dark socket, glowing light, metal tip
  P.add(lathe([[0, 0.1985], [0.0158, 0.1985], [0.0176, 0.2025], [0.0158, 0.2068], [0, 0.207]], 16), C.dark, M.gloss);
  P.add(lathe([[0, 0.204], [0.018, 0.2048], [0.034, 0.2105], [0.05, 0.2208], [0.0592, 0.2305], [0.0612, 0.2352], [0.0585, 0.2385], [0.0505, 0.2352], [0.036, 0.2282], [0.022, 0.2242], [0, 0.2232]], 30), C.cream, M.gloss);
  P.add(lathe([[0, 0.2226], [0.0272, 0.2232], [0.0292, 0.2262], [0, 0.2266]], 20), C.darker, M.satin);
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2, d = new V3(Math.sin(a), 0, Math.cos(a));
    const up = new V3(d.x * 0.42, 1, d.z * 0.42).normalize(), base = new V3(d.x * 0.0555, 0.2338, d.z * 0.0555);
    P.add(orient(superEllipsoid(0.0052, 0.0118, 0.0052, 0.7, 0.8, 8, 6), up, base.clone().addScaledVector(up, 0.0085)), C.cream, M.gloss);
    I.add(at(superEllipsoid(0.0058, 0.0058, 0.0058, 1, 1, 8, 6), ...base.clone().addScaledVector(up, 0.0215).toArray()));
  }
  L.add(at(superEllipsoid(0.0262, 0.035, 0.0262, 0.9, 1, 18, 12), 0, 0.245, 0));
  return { kind: 'beacon', body: P.build(), ink: I.build(), glow: L.build(), grip: gripAt(HOLD_UP, 0, 0.118, 0) };
}

/** Murk Bomb: a round dark bomb with a proud cream vent collar (team ink glinting in its eight slots), three murky team
 *  portholes with dark swirls round its belly (metal bezels), a squid decal and a knurled cap on top like the splat
 *  bomb's (the fist's handle), sitting on a rubber foot. Ø ~0.2, 0.235 tall. */
function buildMist() {
  const P = new Parts(), I = new Parts();
  const R = 0.094, yc = 0.1, C0 = new V3(0, yc, 0);
  P.add(lathe([[0, 0], [0.034, 0], [0.0396, 0.0038], [0.0418, 0.0115], [0.0398, 0.0168], [0, 0.0168]], 22), C.rubber, M.rubber);
  P.add(lathe(sphZone(R, yc, -Math.PI / 2 + 0.02, 0.02, 11), 32), C.dark, M.gloss);
  P.add(lathe(sphZone(R, yc, 0.33, Math.PI / 2 - 0.02, 8), 32), C.dark, M.gloss);
  // vent collar with slots
  P.add(lathe(smoothProfile([[0, 0.0975], [0.0945, 0.0978], [0.0984, 0.1025], [0.0988, 0.1145], [0.0975, 0.1265], [0.0918, 0.1325]], 8).concat([[0, 0.133]]), 32), C.cream, M.satin);
  for (let k = 0; k < 8; k++) {
    const az = Math.PI / 8 + k * Math.PI / 4;
    P.add(wrapY(superEllipsoid(0.0072, 0.0104, 0.0024, 0.5, 0.5, 6, 6), 0.0986, az, 0.1152), C.darker, M.satin);
    I.add(wrapY(superEllipsoid(0.0048, 0.0078, 0.0028, 0.6, 0.6, 6, 6), 0.0986, az, 0.1152));
  }
  for (let k = 0; k < 4; k++) { const az = k * Math.PI / 2; screw(P, new V3(Math.sin(az) * 0.0988, 0.1148, Math.cos(az) * 0.0988), new V3(Math.sin(az), 0, Math.cos(az)), 0.0028); }
  // murky portholes: metal bezel, bulging team pane with swirl bumps, dark swirl streaks bent onto the pane
  const pr = 0.0262, ph = 0.0062;
  for (const az of [0, 2 * Math.PI / 3, -2 * Math.PI / 3]) {
    const n = sphDir(az, -0.42), c = C0.clone().addScaledVector(n, R - 0.0022);
    const bz = torus(0.0292, 0.0046, 6, 26); bz.rotateX(-Math.PI / 2); P.add(orient(bz, n, c), C.metal, M.metal);
    const pane = superEllipsoid(pr, ph, pr, 1, 1, 18, 8, (q) => { const rr = Math.hypot(q.x, q.z), a = Math.atan2(q.z, q.x); if (q.y > 0) q.y += 0.0011 * Math.sin(a * 2 + rr * 260) * (rr / pr); });
    I.add(orient(pane, n, c));
    const tU = new V3(0, 1, 0).addScaledVector(n, -n.y).normalize(), tX = new V3().crossVectors(tU, n);
    for (const s of swirlShapes(0.0205, 2, 0.6)) {
      const g = decal(s, 0.0005); g.rotateZ(az * 0.7);
      deformG(g, (v) => { const rr = Math.min(0.98, Math.hypot(v.x, v.y) / pr); v.z = ph * Math.sqrt(1 - rr * rr) + 0.0002 + v.z; });
      g.applyMatrix4(new THREE.Matrix4().makeBasis(tX, tU, n).setPosition(c)); g.computeVertexNormals();
      P.add(g, C.darker, M.print);
    }
  }
  // squid decal + amber LED on the upper shell
  { const n = sphDir(0, 0.62); const sq = decal(squidShape(0.03)); placeXY(sq, new V3(1, 0, 0), new V3(0, Math.cos(0.62), -Math.sin(0.62)), C0.clone().addScaledVector(n, R + 0.0003)); P.add(onSphere(sq, C0, n, R), C.decal, M.print); }
  { const n = sphDir(Math.PI * 0.72, 0.9); led(P, C0.clone().addScaledVector(n, R), n, C.amber, 0.0036); }
  // cap: dark collar, knurled knob (grip), metal valve
  P.add(lathe([[0, 0.185], [0.0272, 0.185], [0.0296, 0.1892], [0.0272, 0.1952], [0.02, 0.197], [0, 0.197]], 18), C.dark, M.gloss);
  I.add(hring(0.0305, 0.003, 0.1868, 4, 24));
  P.add(gripSleeve(0.1955, 0.2275), C.rubber, M.rubber);
  P.add(lathe([[0, 0.2272], [0.0052, 0.2272], [0.0052, 0.2318], [0.0072, 0.2332], [0.0072, 0.2358], [0, 0.2366]], 10), C.metal, M.metal);
  return { kind: 'mist', body: P.build(), ink: I.build(), grip: gripAt(HOLD_BOMB, 0, 0.2115, 0) };
}

const SUB_BUILDERS = {
  bomb: buildBomb, sticky: buildSticky, burst: buildBurst, seeker: buildSeeker, scan: buildScan,
  curtain: buildCurtain, sprinkler: buildSprinkler, mine: buildMine, beacon: buildBeacon, mist: buildMist,
};
export const SUB_KINDS = Object.keys(SUB_BUILDERS);
/** Kit subs (src/game/kits/*.js): build() returns { kind, body, ink, glow?, grip, … } like the builders above. */
export function registerSubModel(kind, build) { SUB_BUILDERS[kind] = build; _subCache.delete(kind); if (!SUB_KINDS.includes(kind)) SUB_KINDS.push(kind); }
const _subCache = new Map();
/** Sub-weapon prop for the LEFT hand: { body, ink, handL:{pos,quat} (hand in prop space), inHandL:{pos,quat} (prop in hand space) }
 *  plus the kind's extras (see the builders). Attach like a weapon: prop group under handL at inHandL (plastic body + team
 *  ink material). Unknown kinds fall back to the splat bomb. */
export function getSubDef(kind = 'bomb') {
  if (!_subCache.has(kind)) {
    const d = (SUB_BUILDERS[kind] || buildBomb)();
    d.handL = handInWeapon(d.grip, GRIP_HOLE_L);
    const inv = new THREE.Matrix4().compose(d.handL.pos, d.handL.quat, new V3(1, 1, 1)).invert();
    d.inHandL = { pos: new V3(), quat: new THREE.Quaternion() };
    inv.decompose(d.inHandL.pos, d.inHandL.quat, new V3());
    _subCache.set(kind, d);
  }
  return _subCache.get(kind);
}

/** Split a builder's output: bodyStatic/inkStatic (never move), parts re-centred on their pivots, and body/ink = the
 *  complete weapon at rest (static + parts merged in place) for tools that render it whole. */
function finishParts(d) {
  d.bodyStatic = d.body; d.inkStatic = d.ink;
  const body = [d.body], ink = [d.ink];
  const parts = d.parts || {};
  for (const k in parts) {
    const p = parts[k];
    if (!p.src) continue;
    (p.mat === 'ink' ? ink : body).push(p.src);
    p.geo = p.src.clone().translate(-p.pivot.x, -p.pivot.y, -p.pivot.z);
    delete p.src;
  }
  d.body = body.length > 1 ? mergeGeometries(body.filter(Boolean), false) : d.body;
  d.ink = ink.length > 1 ? mergeGeometries(ink.filter(Boolean), false) : d.ink;
  d.parts = parts;
  return d;
}

export function getWeaponDef(kind) {
  if (!_cache.has(kind)) {
    const d = finishParts((BUILDERS[kind] || buildShooter)());
    d.handR = handInWeapon(d.gripR, GRIP_HOLE_R);
    d.handL = handInWeapon(d.gripL, GRIP_HOLE_L);
    // weapon relative to right hand bone
    const inv = new THREE.Matrix4().compose(d.handR.pos, d.handR.quat, new V3(1, 1, 1)).invert();
    d.inHand = { pos: new V3(), quat: new THREE.Quaternion() };
    inv.decompose(d.inHand.pos, d.inHand.quat, new V3());
    // dual wield: a second instance of the same weapon sits in the LEFT fist — inHandL = that weapon in left-hand space
    // (d.handL = the left hand frame in its own weapon's space). Attach like the main one, under handL.
    if (d.dual) {
      const invL = new THREE.Matrix4().compose(d.handL.pos, d.handL.quat, new V3(1, 1, 1)).invert();
      d.inHandL = { pos: new V3(), quat: new THREE.Quaternion() };
      invL.decompose(d.inHandL.pos, d.inHandL.quat, new V3());
    }
    _cache.set(kind, d);
  }
  return _cache.get(kind);
}

/** Shared modelling kit (Parts merger, palette, surface classes and shape helpers) for other procedural prop modules
 *  (special-props.js). Read-only use. */
export const GEO_KIT = {
  Parts, C, M, latheZ, torus, at, rbox, orient, screw, decal, placeXY, squidShape, chevronShape, chevrons, deformG, rng, seX,
  hring, wrapY, wrapZ, profR, wrapLathe, onSphere, sphDir, sphZone, swirlShapes, gripSleeve, led, roundRect, refine,
};
