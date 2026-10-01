// INKWAVE — squidkid FACE: sculpted head + neck as one seamless surface, socketed eyeballs under sliding lids, a modelled
// mouth (lips, inner lips, cavity, teeth, tongue) that opens with the jaw, cupped ears, and a baked vertex AO.
//
// Topology. A lat-long "carrier" grid covers the head (rays from HEAD_C; below the jaw line the rays come from a point
// in the neck and meet a smooth union of skull + neck, so the neck grows out of the head with no seam). The carrier has
// three rectangular holes in (az, el): one per eye, one for the mouth. Each hole is filled by a ring patch whose outer
// ring IS the hole's boundary (shared vertices — nothing is stitched) and whose rings morph inward to the lid aperture /
// lip line and then roll under (lid margin, inner lip); the mouth's rings go on into a cavity bag.
//
// Eye space. Each eyeball is the unit sphere under an affine map  kid = C + M·s  (M = frame × radii; the right eye's
// frame is the mirror of the left, so +s.x is always the outer corner and every formula is side-free). The aperture,
// the lid travel and the iris all live in that space: x = s.x, λ = atan2(s.y, s.z) (angle about the eye's horizontal
// axis). A lid closes by rotating its vertices about that axis in eye space (skin vertex shader, character-mats.js), so it
// slides exactly over the (ellipsoidal) eyeball and can never cut into it; the eye look is the same rotation of the ball.
//
// This module is a leaf (three + ctx only) so character-geo.js and character-mats.js can both import it without a cycle.
// Detail: faceLevel(lod, quality) → 0 far · 1 game@low/med · 2 game@high/ultra (and hero@low) · 3 hero@med/high · 4 hero@ultra.
import * as THREE from 'three';
import { G } from '../core/ctx.js';

const V3 = THREE.Vector3;
const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const gauss = (x, s) => Math.exp(-((x / s) ** 2));
const smaxK = (a, b, k) => { const h = clamp(0.5 + (0.5 * (a - b)) / k, 0, 1); return lerp(b, a, h) + k * h * (1 - h); };
const sminK = (a, b, k) => { const h = clamp(0.5 + (0.5 * (b - a)) / k, 0, 1); return lerp(b, a, h) - k * h * (1 - h); };

// ------------------------------------------------------------------------------------------------
// Head sculpt (analytic: the hair cap, bangs and brows hug it through headSurf in character-geo.js)
// ------------------------------------------------------------------------------------------------
export const HEAD_C = new V3(0, 1.214, 0.012);
const HR = { x: 0.178, y: 0.176, z: 0.165 };
export const EYE = { az: 0.355, el: 0.14, daz: 0.172, del: 0.222, tilt: 0.1 };
export const MOUTH = { el: -0.41, halfAz: 0.12 };
export const BROW = { az0: 0.19, az1: 0.54, el: 0.455 };
export const EAR = { az: 1.5, el: -0.035 };
// fixed core-skeleton indices (BODY_BONES order in character-geo.js; the rig is append-only so these never move)
export const FACE_BONES = { head: 4, eyeL: 19, eyeR: 20 };

/** Mask (Inkling eye mask) signed distance in the head's (az, el): > 0 inside. Same shape as the skin shader's pigment. */
export function visorSD(az, el) {
  const ax = Math.abs(az);
  const lobe = (1 - Math.hypot((ax - 0.355) / 0.3, (el - 0.15) / 0.29)) * 0.26;
  const bridge = ax < 0.42 ? 0.1 + 0.1 * sstep(0, 0.36, ax) - Math.abs(el - 0.17) : -1;
  const s = (ax - 0.42) / 0.9;
  const wc = 0.16 + 0.2 * Math.pow(clamp(s, 0, 1), 1.35);
  const wh = 0.205 * Math.pow(clamp(1 - s, 0, 1), 0.8);
  const wing = s > -0.1 && s <= 1 ? wh - Math.abs(el - wc) : -1;
  return smaxK(smaxK(lobe, bridge, 0.06), wing, 0.07);
}
/** Scalp (hair cap) hairline elevation as a function of azimuth. */
export function hairline(az) {
  const a = Math.abs(az) / Math.PI;
  let h = lerp(0.58, 0.3, sstep(0.1, 0.42, a));
  h = lerp(h, -0.8, sstep(0.5, 0.96, a));
  return h;
}

/** Sculpted head: unit direction (dx,dy,dz) → surface point relative to HEAD_C.
 *  Silhouette (pass 2): an Inkling "mochi" — the back of the skull stays the round egg the hair was fitted to, but
 *  front-on the head is widest across the cheek line just under the eyes and tapers quickly into a small soft chin;
 *  in profile the forehead leans back, the face plane is flatter than the skull's arc, the cheek apples push forward,
 *  the chin tucks, and a flat under-jaw plane runs from under the chin back to the throat (smooth-min with a plane, so
 *  the jaw line appears wherever it meets the sides). Then the features: brow ridge, recessed mask, button nose with
 *  wings and nostrils, philtrum, mouth mound, mentolabial fold. */
const JAW_PLANE = { n: new V3(0, -1, 0.35).normalize(), d: 0, k: 0.016 };
JAW_PLANE.d = 0.152 / Math.hypot(1, 0.35);                         // plane through (0, −0.152, 0) from HEAD_C, rising 35 % forward
export function headShape(dx, dy, dz, out) {
  let x = dx * HR.x, y = dy * HR.y, z = dz * HR.z;
  const el = Math.asin(clamp(dy, -1, 1)), az = Math.atan2(dx, dz), aa = Math.abs(az);
  const front = Math.max(0, dz);
  if (dy < 0) {
    const k = Math.pow(-dy, 1.3);
    // inverted egg: full width through the cheek line, then a quicker taper into a small chin
    x *= 1 - 0.235 * k - 0.1 * sstep(-0.3, -0.66, el) - 0.19 * sstep(-0.6, -1.05, el);
    if (dz > 0) z *= 1 - 0.04 * k - 0.085 * sstep(-0.55, -0.95, el) * front;  // chin tucks back under the mouth
    y *= 1 - 0.03 * k;
  }
  x *= 1 + 0.04 * gauss(el + 0.1, 0.32) * sstep(-0.45, 0.25, dz);   // widest across the cheek line (face half only)
  if (dz < 0) z *= 1 + 0.06 * -dz * (1 - Math.abs(dy));             // fuller back of the skull
  if (dy > 0) y *= 1 - 0.045 * dy * dy;                              // slightly flattened crown
  if (dy > 0) z *= 1 - 0.07 * sstep(0.3, 0.95, el) * front * front;  // forehead leans back
  let off = 0;
  off += 0.0032 * gauss(el + 0.18, 0.2) * gauss(az, 0.55);          // flatter face plane: the mid-face comes forward
  off += 0.0085 * Math.exp(-(((aa - 0.6) / 0.36) ** 2) - (((el + 0.3) / 0.22) ** 2));    // cheek volume
  off += 0.0048 * Math.exp(-(((aa - 0.42) / 0.17) ** 2) - (((el + 0.2) / 0.12) ** 2));   // cheek apples
  off += 0.0019 * Math.exp(-(((aa - 0.8) / 0.2) ** 2) - (((el + 0.03) / 0.12) ** 2));    // cheekbone under the outer eye
  off += 0.0072 * Math.exp(-(((aa - 1.0) / 0.34) ** 2) - (((el + 0.27) / 0.2) ** 2));    // mochi cheeks round out the silhouette
  off += 0.0022 * Math.exp(-((az / 0.19) ** 2) - (((el + 0.76) / 0.1) ** 2));            // small soft chin
  off += 0.0024 * Math.exp(-((az / 0.28) ** 2) - (((el - MOUTH.el) / 0.14) ** 2));      // mouth mound (dental arch)
  off += 0.0064 * Math.exp(-((az / 0.052) ** 2) - (((el + 0.13) / 0.056) ** 2));         // nose: button tip
  off += 0.0019 * Math.exp(-(((aa - 0.05) / 0.03) ** 2) - (((el + 0.156) / 0.034) ** 2)); // nose wings
  off -= 0.0012 * Math.exp(-(((aa - 0.027) / 0.015) ** 2) - (((el + 0.177) / 0.011) ** 2)); // nostrils
  off -= 0.0008 * Math.exp(-((az / 0.07) ** 2) - (((el + 0.215) / 0.022) ** 2));         // subnasal tuck
  off += 0.0012 * Math.exp(-((az / 0.1) ** 2) - (((el + 0.06) / 0.07) ** 2));            // nose bridge
  off -= 0.0005 * Math.exp(-((az / 0.034) ** 2) - (((el + 0.29) / 0.045) ** 2));         // philtrum (soft)
  off -= 0.0024 * Math.exp(-((az / 0.55) ** 2) - (((el - 0.14) / 0.2) ** 2));            // mask plane
  off -= 0.0034 * Math.exp(-(((aa - 1.15) / 0.25) ** 2) - (((el - 0.25) / 0.2) ** 2));   // temples
  off += 0.0024 * Math.exp(-(((aa - 0.33) / 0.2) ** 2) - (((el - 0.475) / 0.07) ** 2));  // brow ridge
  off += 0.0008 * Math.exp(-((az / 0.09) ** 2) - (((el - 0.43) / 0.07) ** 2));           // glabella
  off -= 0.0022 * Math.exp(-((az / 0.17) ** 2) - (((el + 0.57) / 0.045) ** 2));          // mentolabial fold
  off -= 0.0005 * sstep(-0.02, 0.05, visorSD(az, el));                                    // mask: a whisper of a recess
  let r = Math.hypot(x, y, z);
  const r1 = r + off;
  // under-jaw plane (front half only; the round back of the skull and the nape are left alone)
  const nd = JAW_PLANE.n.y * dy + JAW_PLANE.n.z * dz;
  let rr = r1;
  if (nd > 1e-4) { const tp = JAW_PLANE.d / nd; rr = lerp(r1, sminK(r1, tp, JAW_PLANE.k), sstep(-0.55, -0.2, dz)); }
  return out.set(x, y, z).multiplyScalar(rr / r);
}
const _d = new V3(), _q0 = new V3(), _q1 = new V3(), _q2 = new V3(), _qa = new V3(), _qn = new V3();
export function dirAE(az, el, out) { const c = Math.cos(el); return out.set(Math.sin(az) * c, Math.sin(el), Math.cos(az) * c); }
/** Head surface point (kid space) at (az, el), offset `off` along the surface normal (nOut receives the normal). */
export function headSurfFace(az, el, off, out, nOut) {
  dirAE(az, el, _d); headShape(_d.x, _d.y, _d.z, _q0);
  const e = clamp(el, -1.555, 1.555);
  dirAE(az + 1e-3, e, _d); headShape(_d.x, _d.y, _d.z, _q1);
  dirAE(az, e + 1e-3, _d); headShape(_d.x, _d.y, _d.z, _q2);
  dirAE(az, e, _d); headShape(_d.x, _d.y, _d.z, _qa);
  _q1.sub(_qa); _q2.sub(_qa);
  _qn.crossVectors(_q1, _q2).normalize();
  if (Math.abs(el) > 1.55) _qn.set(0, Math.sign(el), 0);
  if (nOut) nOut.copy(_qn);
  return out.copy(_q0).addScaledVector(_qn, off).add(HEAD_C);
}
/** Radial head field (≈ signed distance near the surface): < 0 inside. */
const _hf = new V3(), _hs = new V3();
function headField(p) {
  _hf.subVectors(p, HEAD_C); const r = _hf.length(); if (r < 1e-6) return -0.15;
  _hf.multiplyScalar(1 / r); headShape(_hf.x, _hf.y, _hf.z, _hs);
  return r - _hs.length();
}

// ------------------------------------------------------------------------------------------------
// Neck: elliptic tube (slight forward lean) unioned with the skull by a smooth minimum
// ------------------------------------------------------------------------------------------------
const NECK_Y = [0.84, 0.935, 0.985, 1.04, 1.09, 1.18], NECK_R = [0.0386, 0.0382, 0.0392, 0.0373, 0.0352, 0.0338];
const neckR = (y) => { let i = 0; while (i < NECK_Y.length - 2 && y > NECK_Y[i + 1]) i++; const t = clamp((y - NECK_Y[i]) / (NECK_Y[i + 1] - NECK_Y[i]), 0, 1); return lerp(NECK_R[i], NECK_R[i + 1], t * t * (3 - 2 * t)); };
const neckZ = (y) => lerp(-0.0135, -0.0035, clamp((y - 0.93) / 0.2, 0, 1));
function neckField(p) {
  const dx = p.x / 1.05, dz = (p.z - neckZ(p.y)) / 0.95;
  return Math.max(Math.hypot(dx, dz) - neckR(p.y), 0.8 - p.y);
}
const NECK_K = 0.017;
const unionField = (p) => sminK(headField(p), neckField(p), NECK_K);
const NECK_O = new V3(0, 1.075, -0.001); // ray origin for the jaw/neck rows (inside skull ∩ neck, both star-shaped from it)
const NECK_BOTTOM = 0.935;                // bottom ring (under the tee collar)

// ------------------------------------------------------------------------------------------------
// Detail ladder
// ------------------------------------------------------------------------------------------------
const QI = { low: 0, medium: 1, high: 2, ultra: 3 };
export function faceLevel(lod = 'hero', quality = G.settings?.quality || 'high') {
  if (typeof lod === 'number') return clamp(Math.round(lod), 0, 4);
  const q = QI[quality] ?? 2;
  if (lod === 'far') return 0;
  if (lod === 'game') return q >= 2 ? 2 : 1;
  return q >= 3 ? 4 : q >= 1 ? 3 : 2;
}
// step: carrier angular step in the face (rad) · low: jaw/neck rows · eye: [lid rings, margin roll] ·
// mouth: [lip rings, inner-lip roll, cavity rings] · ear: [along, around] · cap: eyeball [rings, segments] · teeth: segments
const RES = [
  { step: 0.14, low: 4, eye: [2, 1], mouth: [2, 1, 1], ear: [5, 6], cap: [4, 14], teeth: 0, lash: 0 },
  { step: 0.075, low: 8, eye: [5, 2], mouth: [3, 2, 2], ear: [9, 10], cap: [8, 24], teeth: 6, lash: 3 },
  { step: 0.058, low: 10, eye: [6, 2], mouth: [4, 2, 3], ear: [12, 14], cap: [10, 30], teeth: 8, lash: 4 },
  { step: 0.034, low: 18, eye: [11, 3], mouth: [7, 3, 5], ear: [22, 24], cap: [18, 48], teeth: 16, lash: 6 },
  { step: 0.027, low: 23, eye: [14, 3], mouth: [9, 3, 6], ear: [28, 30], cap: [22, 60], teeth: 22, lash: 8 },
];

// ------------------------------------------------------------------------------------------------
// Eye space
// ------------------------------------------------------------------------------------------------
// rx/ry/rz: eyeball ellipsoid radii (m) · xh: aperture half-width (eye-space x) · hu/hl: upper/lower aperture height (λ) ·
// l0: aperture centre λ · close: where the lids meet (fraction up from the lower lid) · over: upper-lid overshoot ·
// lidU/lidL: lid shell radius (eye space, 1 = eyeball) · k: lid/socket blend · dip: socket hollow · apex: eyeball apex
// depth under the (recessed) skin · yaw: eye axis turned outward · rest: iris rest yaw (converges the gaze) · iris/pupil radii
export const EYEB = { rx: 0.052, ry: 0.0605, rz: 0.035, xh: 0.5, hu: 0.6, hl: 0.57, l0: 0.0, close: 0.22, over: 0.035,
  lidU: 1.075, lidL: 1.05, k: 0.07, dip: 0.055, apex: 0.0008, yaw: 0.2, rest: -0.06, iris: 0.37, cornea: 0.045 };
const lamU = (x) => { const u = x / EYEB.xh, q = 1 - u * u; return q <= 0 ? EYEB.l0 : EYEB.l0 + EYEB.hu * Math.sqrt(q); };
const lamL = (x) => { const u = x / EYEB.xh, q = 1 - u * u; return q <= 0 ? EYEB.l0 : EYEB.l0 - EYEB.hl * Math.sqrt(q); };
const lamClose = (x) => lamL(x) + EYEB.close * (lamU(x) - lamL(x));
/** Full-close rotation (rad, eye space) of the upper / lower lid edge at eye-space x. */
export const lidTravel = (x) => [lamU(x) - lamClose(x) + EYEB.over, lamClose(x) - lamL(x)];
function apertureDir(phi, e, out) {
  const s = Math.sin(phi);
  const x = clamp(EYEB.xh * e * Math.cos(phi), -0.999, 0.999);
  const lam = EYEB.l0 + e * s * (s > 0 ? EYEB.hu : EYEB.hl);
  const c = Math.sqrt(1 - x * x);
  return out.set(x, c * Math.sin(lam), c * Math.cos(lam));
}
/** Normalised aperture coordinates of an eye-space direction: e (1 on the aperture) and angle φ (0 = outer corner). */
function apertureCoords(d) {
  const lam = Math.atan2(d.y, d.z);
  const xn = d.x / EYEB.xh, ln = (lam - EYEB.l0) / (lam >= EYEB.l0 ? EYEB.hu : EYEB.hl);
  return { e: Math.hypot(xn, ln), phi: Math.atan2(ln, xn), lam };
}

function makeEyeFrame(sx) {
  const E0 = headSurfFace(sx * EYE.az, EYE.el, 0, new V3());
  const Z = new V3(Math.sin(EYEB.yaw) * sx, 0, Math.cos(EYEB.yaw)).normalize();
  let Y = new V3(0, 1, 0).addScaledVector(Z, -Z.y).normalize();
  let X = new V3().crossVectors(Y, Z).normalize();
  if (sx < 0) X.negate();                                   // +x = outer corner on both sides (mirrored frame)
  const t = EYE.tilt, c = Math.cos(t), s = Math.sin(t);     // outer corner up
  const X2 = X.clone().multiplyScalar(c).addScaledVector(Y, s), Y2 = Y.clone().multiplyScalar(c).addScaledVector(X, -s);
  X = X2; Y = Y2;
  const C = E0.clone().addScaledVector(Z, -(EYEB.rz + EYEB.apex));
  const M = new THREE.Matrix3().set(X.x * EYEB.rx, Y.x * EYEB.ry, Z.x * EYEB.rz, X.y * EYEB.rx, Y.y * EYEB.ry, Z.y * EYEB.rz, X.z * EYEB.rx, Y.z * EYEB.ry, Z.z * EYEB.rz);
  const Mi = M.clone().invert();
  return { sx, C, X, Y, Z, M, Mi, E0 };
}
export const EYE_FRAMES = [makeEyeFrame(1), makeEyeFrame(-1)];
const toEye = (F, p, out) => out.copy(p).sub(F.C).applyMatrix3(F.Mi);
const fromEye = (F, s, out) => out.copy(s).applyMatrix3(F.M).add(F.C);

/** Distance (eye-space units) along eye-space direction d from C to the head surface. */
const _ra = new V3(), _rp = new V3();
function headTAlong(F, d) {
  _ra.copy(d).applyMatrix3(F.M);
  let a = 0.3, b = 4;
  for (let it = 0; it < 18; it++) { const m = 0.5 * (a + b); _rp.copy(F.C).addScaledVector(_ra, m); if (headField(_rp) < 0) a = m; else b = m; }
  return 0.5 * (a + b);
}
/** Skin radius along an eye-space direction: the recessed socket (hollowed around the eye) draped over the lid shells. */
function eyeSkinT(F, d, wr = 1) {
  const tH = headTAlong(F, d);
  const { e, lam } = apertureCoords(d);
  const sock = 0.42 * sstep(1.33, 1.06, e) * sstep(0.05, 0.4, wr);  // socket: skull falls away inside the lid fold (0 on the patch rim)
  const up = sstep(-0.12, 0.12, lam - EYEB.l0);
  const lid = lerp(EYEB.lidL, EYEB.lidU, up) + 0.018 * sstep(1.0, 1.25, e);
  return smaxK(tH - sock, lid, EYEB.k);
}
/** Lid rotation angles (upper, lower) at full close for a rest-pose point, [0,0] away from the eyes. */
const _le = new V3();
function lidAngles(p) {
  const F = p.x >= 0 ? EYE_FRAMES[0] : EYE_FRAMES[1];
  toEye(F, p, _le); const L = _le.length(); if (L < 0.2 || _le.z < 0.05) return [0, 0];
  _le.multiplyScalar(1 / L);
  const { e, phi } = apertureCoords(_le);
  if (e > 1.4) return [0, 0];
  // the lid (aperture → fold) slides; the fold skin stretches; the socket and the mask rim above it stay put
  const x = EYEB.xh * Math.cos(phi), [tu, tl] = lidTravel(x);
  const s = Math.sin(phi);
  if (s >= 0) return [tu * sstep(1.3, 1.03, e), 0];
  return [0, tl * sstep(1.22, 1.03, e)];
}

// ------------------------------------------------------------------------------------------------
// Mouth frame (kid space) — shared with the skin shader (expression deformation, cavity shading)
// ------------------------------------------------------------------------------------------------
const MF = (() => {
  const n = new V3(); const C = headSurfFace(0, MOUTH.el, 0, new V3(), n);
  const U = new V3(0, 1, 0).addScaledVector(n, -n.y).normalize();
  const hw = headSurfFace(MOUTH.halfAz, MOUTH.el, 0, new V3()).x;
  return { C, F: n.clone(), U, X: new V3(1, 0, 0), hw };
})();
export const MOUTH_FRAME = MF;
export const JAW_PIVOT = HEAD_C.clone().add(new V3(0, -0.035, -0.035));

/** Constants for the skin / eye shaders (character-mats.js). */
export const FACE_SHADER = {
  eyeC: EYE_FRAMES.map((f) => f.C), eyeM: EYE_FRAMES.map((f) => f.M), eyeMi: EYE_FRAMES.map((f) => f.Mi),
  ap: new THREE.Vector4(EYEB.xh, EYEB.hu, EYEB.hl, EYEB.l0), lid: new THREE.Vector4(EYEB.close, EYEB.over, EYEB.lidU, EYEB.lidL),
  eyeR: new V3(EYEB.rx, EYEB.ry, EYEB.rz), iris: EYEB.iris, rest: EYEB.rest,
  mouthC: MF.C, mouthU: MF.U, mouthF: MF.F, mouthHW: MF.hw, mouthEl: MOUTH.el, mouthAz: MOUTH.halfAz, bones: FACE_BONES,
};

// ------------------------------------------------------------------------------------------------
// Mesh accumulator (positions + per-vertex face data), turned into one indexed BufferGeometry per part
// ------------------------------------------------------------------------------------------------
class Acc {
  constructor() { this.P = []; this.idx = []; this.sub = []; this.w = []; this.lid = []; this.mw = []; this.hd = []; this.uv = []; this.part = []; this.an = []; this.nb = {}; }
  v(p, o = {}) {
    this.P.push(p.clone()); this.sub.push(o.sub || 0); this.w.push(o.w || null); this.lid.push(o.lid || [0, 0]);
    this.mw.push(o.mw || 0); this.hd.push(o.hd === undefined ? true : o.hd); this.uv.push(o.uv || [0, 0]); this.part.push(o.part || 0); this.an.push(o.n ? o.n.clone() : null);
    return this.P.length - 1;
  }
  tri(a, b, c) { this.idx.push(a, b, c); }
  quad(a, b, c, d) { this.idx.push(a, b, c, a, c, d); }
  /** Flip the winding of triangles [t0, t1) if their normals mostly face toward `inside(p) → V3`. */
  orient(t0, t1, inside) {
    const e1 = new V3(), e2 = new V3(), n = new V3(), c = new V3(), o = new V3(); let acc = 0;
    for (let t = t0; t < t1; t += 3) {
      const A = this.P[this.idx[t]], B = this.P[this.idx[t + 1]], C = this.P[this.idx[t + 2]];
      e1.subVectors(B, A); e2.subVectors(C, A); n.crossVectors(e1, e2);
      c.copy(A).add(B).add(C).multiplyScalar(1 / 3);
      acc += n.dot(o.subVectors(c, inside(c)));
    }
    if (acc < 0) for (let t = t0; t < t1; t += 3) { const k = this.idx[t + 1]; this.idx[t + 1] = this.idx[t + 2]; this.idx[t + 2] = k; }
    return acc < 0;
  }
  flip(t0, t1) { for (let t = t0; t < t1; t += 3) { const k = this.idx[t + 1]; this.idx[t + 1] = this.idx[t + 2]; this.idx[t + 2] = k; } }
}

// ------------------------------------------------------------------------------------------------
// Sampling helpers
// ------------------------------------------------------------------------------------------------
/** Samples over [knots[0], knots[n-1]] including every knot; interval counts from ∫rho / step, rho-distributed inside. */
function piecewise(knots, rho, step) {
  const out = [knots[0]];
  for (let k = 0; k < knots.length - 1; k++) {
    const a = knots[k], b = knots[k + 1], N = 64; const cum = [0];
    for (let i = 0; i < N; i++) cum.push(cum[i] + rho(a + ((i + 0.5) / N) * (b - a)) * ((b - a) / N));
    const n = Math.max(1, Math.round(cum[N] / step));
    for (let j = 1; j < n; j++) {
      const tgt = (j / n) * cum[N]; let i = 0; while (i < N - 1 && cum[i + 1] < tgt) i++;
      const f = (tgt - cum[i]) / Math.max(1e-12, cum[i + 1] - cum[i]);
      out.push(a + ((i + clamp(f, 0, 1)) / N) * (b - a));
    }
    out.push(b);
  }
  return out;
}
const nearestIdx = (arr, v) => { let b = 0; for (let i = 1; i < arr.length; i++) if (Math.abs(arr[i] - v) < Math.abs(arr[b] - v)) b = i; return b; };

// rectangles cut out of the carrier (az / el knots are exact grid lines)
const EYE_RECT = { az0: 0.085, az1: 0.625, el0: -0.25, el1: 0.44 };
const MOUTH_RECT = { az: 0.3, el0: -0.6, el1: -0.27 };

// ------------------------------------------------------------------------------------------------
// Skin weights (rest-pose position → bones)
// ------------------------------------------------------------------------------------------------
const _wv = new V3();
function neckAxisDist(p) { return Math.hypot(p.x / 1.05, (p.z - neckZ(p.y)) / 0.95); }
/** Jaw influence for a skin point: the lower face below the mouth line, off toward the jaw angle and the throat. */
function jawCarrier(p) {
  _wv.subVectors(p, HEAD_C); const r = _wv.length();
  const az = Math.atan2(_wv.x, _wv.z), el = Math.asin(clamp(_wv.y / r, -1, 1));
  const below = sstep(MOUTH.el + 0.035, MOUTH.el - 0.1, el);
  const lat = sstep(1.3, 0.8, Math.abs(az));
  const throat = sstep(0.046, 0.072, neckAxisDist(p)) + sstep(1.1, 1.14, p.y) * (1 - sstep(0.046, 0.072, neckAxisDist(p)));
  return 0.97 * below * lat * clamp(throat, 0, 1);
}
function cheekCarrier(p) {
  _wv.subVectors(p, HEAD_C); const r = _wv.length();
  const az = Math.atan2(_wv.x, _wv.z), el = Math.asin(clamp(_wv.y / r, -1, 1));
  return 0.55 * gauss(Math.abs(az) - 0.6, 0.24) * gauss(el + 0.31, 0.16);
}
/** Head / neck / chest split by height and by distance from the neck axis (the under-jaw stays on the head). */
function neckSplit(p) {
  const w1 = sstep(0.975, 1.02, p.y);
  const w2 = Math.max(sstep(1.05, 1.1, p.y), sstep(0.05, 0.078, neckAxisDist(p)) * sstep(1.0, 1.05, p.y));
  return { chest: 1 - w1, neck: w1 * (1 - w2), head: w1 * w2 };
}
const JAW_GAIN = 0.65;   // jaw influence cap (see docs/RIG.md: ~3.5 cm lip drop at rotation.x 0.3)
function skinWeights(p, jawW, cheekW) {
  const s = neckSplit(p);
  const h = s.head, jaw = h * jawW * JAW_GAIN, ck = h * cheekW * (1 - jawW);
  const out = [['head', h - jaw - ck], ['jaw', jaw], ['neck', s.neck], ['chest', s.chest]];
  if (ck > 1e-4) out.push([p.x > 0 ? 'cheekL' : 'cheekR', ck]);
  return out;
}

// ------------------------------------------------------------------------------------------------
// Jaw / neck profile columns (cached across tiers, interpolated per carrier column)
// ------------------------------------------------------------------------------------------------
const PROF_COLS = 120, PROF_SAMPLES = 72;
let _prof = null;
function neckProfiles() {
  if (_prof) return _prof;
  const cols = [];
  const d = new V3(), p = new V3(), P0 = new V3();
  for (let c = 0; c < PROF_COLS; c++) {
    const az = -Math.PI + (c / PROF_COLS) * TAU;
    dirAE(az, MOUTH_RECT.el0, d); headShape(d.x, d.y, d.z, P0).add(HEAD_C);
    // rays from NECK_O: from the jaw-row point down to the collar ring; warm-started bisection
    const v0 = P0.clone().sub(NECK_O); const el0 = Math.asin(v0.y / v0.length());
    const pts = [P0.clone()]; let prevR = v0.length();
    const hit = (el) => {
      dirAE(az, el, d);
      let a = Math.max(0.004, prevR - 0.015), b = prevR + 0.015;
      p.copy(NECK_O).addScaledVector(d, a); if (unionField(p) > 0) a = 0.004;
      p.copy(NECK_O).addScaledVector(d, b); while (unionField(p) < 0 && b < 0.6) { b += 0.05; p.copy(NECK_O).addScaledVector(d, b); }
      for (let it = 0; it < 17; it++) { const m = 0.5 * (a + b); p.copy(NECK_O).addScaledVector(d, m); if (unionField(p) < 0) a = m; else b = m; }
      prevR = 0.5 * (a + b); return NECK_O.clone().addScaledVector(d, prevR);
    };
    const N = 80;
    for (let i = 1; i <= N; i++) {
      const el = lerp(el0, -1.45, i / N); const q = hit(el);
      pts.push(q); if (q.y <= NECK_BOTTOM) break;
    }
    // clip the last segment exactly at the collar height
    const L = pts.length; const A = pts[L - 2], B = pts[L - 1];
    if (B.y < NECK_BOTTOM && A.y > NECK_BOTTOM) B.lerpVectors(A, B, (A.y - NECK_BOTTOM) / (A.y - B.y));
    // resample by arclength
    const cum = [0]; for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + pts[i].distanceTo(pts[i - 1]));
    const tot = cum[cum.length - 1]; const res = []; let j = 0;
    for (let k = 0; k <= PROF_SAMPLES; k++) {
      const tgt = (k / PROF_SAMPLES) * tot; while (j < cum.length - 2 && cum[j + 1] < tgt) j++;
      const f = (tgt - cum[j]) / Math.max(1e-9, cum[j + 1] - cum[j]);
      res.push(pts[j].clone().lerp(pts[j + 1], clamp(f, 0, 1)));
    }
    cols.push(res);
  }
  return (_prof = cols);
}
/** Point k/n down the jaw→collar profile at azimuth az (interpolated between cached columns). */
function profilePoint(az, f, out) {
  const cols = neckProfiles();
  const u = ((az + Math.PI) / TAU) * PROF_COLS; const c0 = Math.floor(u), t = u - c0;
  const A = cols[((c0 % PROF_COLS) + PROF_COLS) % PROF_COLS], B = cols[(((c0 + 1) % PROF_COLS) + PROF_COLS) % PROF_COLS];
  const s = f * PROF_SAMPLES, i0 = Math.min(PROF_SAMPLES - 1, Math.floor(s)), g = s - i0;
  _pa.copy(A[i0]).lerp(A[i0 + 1], g); _pb.copy(B[i0]).lerp(B[i0 + 1], g);
  // interpolate in cylindrical terms around the neck axis so the ring stays round between columns
  return out.copy(_pa).lerp(_pb, t);
}
const _pa = new V3(), _pb = new V3(), _cn = new V3();

// ------------------------------------------------------------------------------------------------
// Ears (pointed, with a cupped scapha, rolled helix rim, concha bowl and real thickness)
// ------------------------------------------------------------------------------------------------
/** Ear frame (also used by the punk hoops in the hair code): root inside the skull, A along the ear, F out of the cup. */
export function earFrame(sx) {
  const root = headSurfFace(sx * EAR.az, EAR.el, -0.0085, new V3());
  const A = new V3(sx * 0.63, 0.43, -0.65).normalize();
  const F = new V3(sx * 0.46, 0.1, 0.88); F.addScaledVector(A, -F.dot(A)).normalize();
  const W = new V3().crossVectors(A, F).normalize();
  return { root, A, F, W, L: 0.106, width: (u) => 0.0268 * Math.pow(Math.max(0, 1 - u), 0.8) * sstep(-0.4, 0.28, u) + 0.0011 };
}
/**
 * Ear cross-section at u (0 root … 1 tip) in the ear plane: X across (W), Y out of the cup (F). A closed loop built from
 * explicit pieces with fixed vertex budgets (so rows correspond): convex back → rolled helix (a tube that curls over the
 * scapha) → bowl down to the centre → the mirror image. The bowl dips below the rim by more than the rim is thick, so it
 * reads as a real cup with a shadowed overhang; an antihelix ridge runs up the posterior side.
 */
function earSection(u, w, nB, nR, nW, out) {
  const tb = 0.0056 * (1 - 0.6 * u) + 0.0009;                        // back half-thickness (convex)
  const rr = Math.min(0.4 * w, (0.0026 * (1 - 0.55 * u) + 0.0006) * sstep(-0.05, 0.12, u) + 0.0009 * (1 - sstep(-0.05, 0.12, u)));
  const yc = 0.0012 * (1 - u);                                        // rim tube centre height
  const curl = lerp(2.2, 2.75, sstep(0.1, 0.5, u)) * sstep(0.0, 0.08, u) + 1.6 * (1 - sstep(0.0, 0.08, u)); // how far the helix rolls over
  const bd = (0.0052 * sstep(0.05, 0.22, u) * sstep(0.97, 0.66, u) + 0.0018 * gauss(u - 0.17, 0.08)); // bowl depth under the rim top
  const half = [];
  for (let i = 0; i < nB; i++) { const t = i / nB, a = t * Math.PI / 2; half.push([(w - rr) * Math.sin(a) + rr * Math.sin(a) ** 3, -tb * Math.cos(a) + yc * Math.sin(a) ** 2]); }
  const cx = w - rr;
  for (let i = 0; i < nR; i++) { const a = (i / nR) * curl; half.push([cx + rr * Math.cos(a), yc + rr * Math.sin(a)]); }
  const E = [cx + rr * Math.cos(curl), yc + rr * Math.sin(curl)];
  const yb = Math.max(-tb + 0.0012, yc + rr - bd);                     // bowl floor (keeps ≥ 1.2 mm of ear)
  return { half, E, yb, nW, tb };
}
function earLoop(u, w, nB, nR, nW, anti) {
  const { half, E, yb } = earSection(u, w, nB, nR, nW);
  const bowl = (sgn) => { const pts = []; for (let i = 0; i < nW; i++) { const t = i / nW, X = Math.max(0, E[0]) * (1 - t); const f = 1 - t; let Y = yb + (E[1] - yb) * Math.pow(f, 1.6); Y += anti * gauss(f - 0.45, 0.16) * (sgn > 0 ? 1 : 0.25); pts.push([sgn * X, Y]); } return pts; };
  const right = [...half, ...bowl(1)];
  const left = [...half.map(([X, Y]) => [-X, Y]), ...bowl(-1).map(([X, Y]) => [X, Y])];
  // loop: back centre → right side → centre of the bowl → left side back to the start
  const loop = [...right, [0, yb + anti * gauss(0.45, 0.16) * 0.25]];
  for (let i = left.length - 1; i >= 1; i--) loop.push(left[i]);
  return loop;
}
function addEar(acc, sx, R) {
  const { root, A, F, W, L, width } = earFrame(sx);
  const [nU, nAround] = R.ear;
  const nR = Math.max(3, Math.round(nAround * 0.22)), nW = Math.max(2, Math.round(nAround * 0.16)), nB = Math.max(2, Math.round(nAround * 0.12));
  const bone = sx > 0 ? 'earL' : 'earR';
  const rows = [], rowU = [];
  const C = new V3(), q = new V3(), hn = new V3(), hp = new V3();
  // rows from inside the skull (u < 0: a flared root that melts onto the head) to the tip; denser at both ends
  const U0 = -0.1;
  for (let j = 0; j <= nU; j++) { const t = j / nU; rowU.push(U0 + (1 - U0) * (t - 0.06 * Math.sin(TAU * t))); }
  let nTh = 0;
  for (let j = 0; j <= nU; j++) {
    const u = rowU[j], uc = clamp(u, 0, 1);
    C.copy(root).addScaledVector(A, u * L).addScaledVector(F, -0.011 * uc * uc).addScaledVector(W, 0.004 * Math.sin(Math.PI * uc));
    const br = sstep(0.14, -0.02, u);                                      // root blend
    const w = width(uc) * (1 + 0.45 * br);
    const loop = earLoop(uc, w, nB, nR, nW, 0.0016 * sstep(0.12, 0.3, uc) * sstep(0.72, 0.45, uc));
    nTh = loop.length;
    const row = [];
    const kW = sstep(0.02, 0.22, u);
    for (let i = 0; i < nTh; i++) {
      const [X, Y] = loop[i];
      q.copy(C).addScaledVector(W, X).addScaledVector(F, Y * (1 + 0.6 * br));
      let nb = 0;
      if (br > 0) {
        // melt the root onto the skull: points under the skin come up to just beneath it, points above settle toward it
        const f = headField(q);
        hp.subVectors(q, HEAD_C).normalize(); hn.copy(hp);
        if (f < -0.0006) q.addScaledVector(hn, (-0.0006 - f) * br);
        else q.addScaledVector(hn, -f * 0.55 * br);
        nb = br;
      }
      const cupK = Y > 0.0004 && Math.abs(X) < w * 0.75 ? sstep(0.04, 0.14, uc) * sstep(0.95, 0.8, uc) : 0;
      const id = acc.v(q, { sub: 8, w: [[bone, kW], ['head', 1 - kW]], hd: false, part: 2, uv: [cupK, 0] });
      if (nb > 0) acc.nb[id] = [hn.clone(), nb];
      row.push(id);
    }
    rows.push(row);
  }
  const t0 = acc.idx.length;
  for (let j = 0; j < nU; j++) for (let i = 0; i < nTh; i++) { const i1 = (i + 1) % nTh; acc.quad(rows[j][i], rows[j][i1], rows[j + 1][i1], rows[j + 1][i]); }
  const tip = acc.v(root.clone().addScaledVector(A, L * 1.035).addScaledVector(F, -0.0118), { sub: 8, w: [[bone, 1]], hd: false, part: 2 });
  for (let i = 0; i < nTh; i++) acc.tri(rows[nU][i], rows[nU][(i + 1) % nTh], tip);
  acc.orient(t0, acc.idx.length, (p) => { const k = clamp(p.clone().sub(root).dot(A), 0, L); return root.clone().addScaledVector(A, k); });
}

// ------------------------------------------------------------------------------------------------
// Head + face assembly
// ------------------------------------------------------------------------------------------------
/**
 * Build the head skin for a LOD tier: carrier + eye/mouth ring patches + inner lips + cavity + teeth + tongue + ears.
 * Returns { geo, data } — geo: indexed BufferGeometry (position, normal, uv); data: per-vertex arrays for the Builder
 * (skin weights, sub-material, aHead, aFace = [upper-lid angle, lower-lid angle, mouth weight, AO]).
 */
export function buildFaceSkin(lod = 'hero') {
  const lv = faceLevel(lod); const R = RES[lv];
  const acc = new Acc();
  // ---- carrier sampling (columns mirrored exactly about az = 0)
  const rhoAz = (a) => 1 + 0.55 * gauss(a, 0.09) - 0.4 * sstep(0.85, 1.25, a) + 0.1 * gauss(a - EAR.az, 0.25) - 0.3 * sstep(1.9, 2.4, a);
  const half = piecewise([0, EYE_RECT.az0, MOUTH_RECT.az, EYE_RECT.az1, 0.95, 1.3, 1.75, 2.3, Math.PI], rhoAz, R.step);
  const azs = [...half.slice(1, -1).map((a) => -a).reverse(), ...half.slice(0, -1)]; // [-π … π)
  azs.unshift(-Math.PI);
  const nAz = azs.length;
  const mir = (i) => (nAz - i) % nAz;
  const rhoEl = (e) => 1 + 0.35 * gauss(e + 0.14, 0.07) + 0.25 * gauss(e + MOUTH.el * -1, 0.08) - 0.45 * sstep(0.5, 0.75, e);
  const elsUp = piecewise([MOUTH_RECT.el0, MOUTH_RECT.el1, EYE_RECT.el0, EYE_RECT.el1, 0.62, 0.92], rhoEl, R.step);
  const nLow = R.low;
  // global rows: 0 … nLow-1 = jaw/neck profile (bottom first), nLow … = fixed-elevation rows
  const nRows = nLow + elsUp.length;
  const id = new Int32Array(nAz * nRows).fill(-1);
  const vid = (i, j) => id[j * nAz + (((i % nAz) + nAz) % nAz)];
  const d = new V3(), p = new V3();
  const covered = (az, el) => el > hairline(az) + 0.22;
  const rowEl = (j) => (j >= nLow ? elsUp[j - nLow] : -2);
  // which vertices are needed: skip quads fully under the cap or inside a hole
  const iEye0 = nearestIdx(azs, EYE_RECT.az0), iEye1 = nearestIdx(azs, EYE_RECT.az1);
  const iEyeR0 = mir(iEye1), iEyeR1 = mir(iEye0);
  const iM0 = nearestIdx(azs, -MOUTH_RECT.az), iM1 = nearestIdx(azs, MOUTH_RECT.az);
  const jEye0 = nLow + nearestIdx(elsUp, EYE_RECT.el0), jEye1 = nLow + nearestIdx(elsUp, EYE_RECT.el1);
  const jM0 = nLow + nearestIdx(elsUp, MOUTH_RECT.el0), jM1 = nLow + nearestIdx(elsUp, MOUTH_RECT.el1);
  const inRect = (i, j, i0, i1, j0, j1) => i >= i0 && i < i1 && j >= j0 && j < j1;
  const hole = (i, j) => inRect(i, j, iEye0, iEye1, jEye0, jEye1) || inRect(i, j, iEyeR0, iEyeR1, jEye0, jEye1) || inRect(i, j, iM0, iM1, jM0, jM1);
  const skipQ = (i, j) => { if (hole(i, j)) return true; const e = rowEl(j); return e > -1 && covered(azs[i], e) && covered(azs[(i + 1) % nAz], e); };
  const need = new Uint8Array(nAz * nRows);
  for (let j = 0; j < nRows - 1; j++) for (let i = 0; i < nAz; i++) if (!skipQ(i, j)) {
    for (const [a, b] of [[i, j], [i + 1, j], [i + 1, j + 1], [i, j + 1]]) need[b * nAz + (a % nAz)] = 1;
  }
  // carrier vertices
  const carrierVertex = (i, j) => {
    const az = azs[i];
    let n = null;
    if (j > nLow) { n = _cn; headSurfFace(az, elsUp[j - nLow], 0, p, n); }
    else if (j === nLow) { dirAE(az, elsUp[0], d); headShape(d.x, d.y, d.z, p).add(HEAD_C); }
    else profilePoint(az, 1 - j / nLow, p);
    const jw = jawCarrier(p), ck = cheekCarrier(p);
    return acc.v(p, { w: skinWeights(p, jw, ck), lid: lidAngles(p), mw: 0, part: 1, n });
  };
  for (let j = 0; j < nRows; j++) for (let i = 0; i < nAz; i++) if (need[j * nAz + i]) id[j * nAz + i] = carrierVertex(i, j);
  const tC0 = acc.idx.length;
  for (let j = 0; j < nRows - 1; j++) for (let i = 0; i < nAz; i++) {
    if (skipQ(i, j)) continue;
    acc.quad(vid(i, j), vid(i + 1, j), vid(i + 1, j + 1), vid(i, j + 1));
  }
  acc.orient(tC0, acc.idx.length, () => HEAD_C);
  // ---- hole boundary loops (counter-clockwise seen from the front: bottom → right → top → left)
  const rectLoop = (i0, i1, j0, j1) => {
    const L = [];
    for (let i = i0; i < i1; i++) L.push(vid(i, j0));
    for (let j = j0; j < j1; j++) L.push(vid(i1, j));
    for (let i = i1; i > i0; i--) L.push(vid(i, j1));
    for (let j = j1; j > j0; j--) L.push(vid(i0, j));
    return L;
  };
  addEyePatch(acc, EYE_FRAMES[0], rectLoop(iEye0, iEye1, jEye0, jEye1), R);
  addEyePatch(acc, EYE_FRAMES[1], rectLoop(iEyeR0, iEyeR1, jEye0, jEye1), R);
  addMouth(acc, rectLoop(iM0, iM1, jM0, jM1), R);
  addEar(acc, 1, R); addEar(acc, -1, R);
  return finishFace(acc);
}

// ---- eye ring patch -----------------------------------------------------------------------------
function addEyePatch(acc, F, loop, R) {
  const [K, m] = R.eye;
  const N = loop.length;
  const q = new V3(), dir = new V3(), a = new V3(), pos = new V3();
  const cols = loop.map((vi) => {
    toEye(F, acc.P[vi], q); const t = q.length(); const dr = q.clone().multiplyScalar(1 / t);
    const { phi } = apertureCoords(dr);
    return { vi, dr, phi, ck: acc.w[vi].find((w) => w[0].startsWith('cheek'))?.[1] || 0 };
  });
  const rings = [loop];
  // lid / socket rings: slerp the direction from the hole boundary toward the aperture; radius from the draped skin
  for (let r = 1; r <= K; r++) {
    const s = r / K, wr = 1 - Math.pow(1 - s, 1.45);
    const ring = [];
    for (const c of cols) {
      apertureDir(c.phi, 1, a);
      dir.copy(c.dr).lerp(a, wr).normalize();
      const t = eyeSkinT(F, dir, wr);
      fromEye(F, dir.multiplyScalar(t), pos);
      const ck = c.ck * (1 - wr) * (1 - wr);
      const id = acc.v(pos, { w: [['head', 1 - ck], [F.sx > 0 ? 'cheekL' : 'cheekR', ck]], lid: lidAngles(pos), part: 3 });
      const nbw = 1 - sstep(0.05, 0.45, wr);
      if (nbw > 0) acc.nb[id] = [skullNormal(pos), nbw];
      ring.push(id);
    }
    rings.push(ring);
  }
  // margin roll: a rounded lid edge that tucks under the eyeball surface (the wet line)
  for (let j = 1; j <= m; j++) {
    const sg = j / m, ring = [];
    for (let k = 0; k < N; k++) {
      const c = cols[k];
      const tEdge = eyeSkinT(F, apertureDir(c.phi, 1, a));
      const e = 1 - 0.04 * Math.sin((sg * Math.PI) / 2);
      const t = tEdge - (tEdge - 0.972) * (1 - Math.cos((sg * Math.PI) / 2));
      apertureDir(c.phi, e, dir);
      fromEye(F, dir.multiplyScalar(t), pos);
      const x = EYEB.xh * Math.cos(c.phi), [tu, tl] = lidTravel(x);
      const up = Math.sin(c.phi) >= 0;
      ring.push(acc.v(pos, { w: [['head', 1]], lid: up ? [tu, 0] : [0, tl], part: 3, uv: [sstep(0.2, 1, sg), 0] }));
    }
    rings.push(ring);
  }
  const t0 = acc.idx.length;
  for (let r = 0; r < rings.length - 1; r++) for (let k = 0; k < N; k++) {
    const k1 = (k + 1) % N; acc.quad(rings[r][k], rings[r][k1], rings[r + 1][k1], rings[r + 1][k]);
  }
  // orientation from the outer (visible) rings only: they face away from the eyeball centre
  const tOuter = t0 + (K * N) * 6;
  const flipped = acc.orient(t0, tOuter, () => F.C);
  if (flipped) acc.flip(tOuter, acc.idx.length);
  if (R.lash) for (const L of LASHES) addLash(acc, F, L, R.lash);
}
// lash tabs in aperture coordinates: centre (e, φ), radius (normalised aperture units)
export const LASHES = [{ e: 0.91, phi: 0.58, r: 0.155, tip: -1.2 }, { e: 0.93, phi: 0.24, r: 0.115, tip: -0.7 }];
const lashR = (L, a) => L.r * (1 + 0.9 * Math.pow(Math.max(0, Math.cos(a - L.tip)), 5)); // teardrop, tip down-and-out
function addLash(acc, F, L, n) {
  const segs = Math.max(8, n * 2), rings = Math.max(2, Math.round(n / 2));
  const cx = L.e * Math.cos(L.phi), cy = L.e * Math.sin(L.phi);
  const dir = new V3(), pos = new V3();
  const at = (xn, yn, rho) => {
    const lam = EYEB.l0 + yn * (yn > 0 ? EYEB.hu : EYEB.hl), x = clamp(EYEB.xh * xn, -0.999, 0.999), c = Math.sqrt(1 - x * x);
    dir.set(x, c * Math.sin(lam), c * Math.cos(lam)); fromEye(F, dir.multiplyScalar(rho), pos);
    const [tu] = lidTravel(EYEB.xh * clamp(xn, -1, 1));
    return acc.v(pos, { w: [['head', 1]], lid: [tu, 0], part: 3 });
  };
  const c0 = at(cx, cy, 1.066);
  const ids = [];
  for (let r = 1; r <= rings; r++) {
    const f = r / rings, row = [];
    for (let k = 0; k < segs; k++) { const a = (k / segs) * TAU, rr = lashR(L, a) * f; row.push(at(cx + rr * Math.cos(a), cy + rr * Math.sin(a), 1.066 - 0.016 * f * f)); }
    ids.push(row);
  }
  const t0 = acc.idx.length;
  for (let k = 0; k < segs; k++) acc.tri(c0, ids[0][k], ids[0][(k + 1) % segs]);
  for (let r = 0; r < rings - 1; r++) for (let k = 0; k < segs; k++) { const k1 = (k + 1) % segs; acc.quad(ids[r][k], ids[r + 1][k], ids[r + 1][k1], ids[r][k1]); }
  acc.orient(t0, acc.idx.length, () => F.C);
}

// ---- mouth: lip rings → inner lip roll → cavity bag; teeth + tongue --------------------------------
function mouthLip(az, el) {
  // lip relief (m, along the head normal) in mouth coordinates: a ∈ [-1, 1] across, b = el − mouth line (rad)
  const a = clamp(az / MOUTH.halfAz, -1.4, 1.4), b = el - MOUTH.el, aw = Math.max(0, 1 - a * a);
  let off = 0;
  off += 0.0017 * Math.pow(aw, 0.6) * gauss(b - 0.014, 0.011) * (1 - 0.25 * gauss(a, 0.12) * gauss(b - 0.024, 0.006)); // upper lip + cupid's bow
  off += 0.0025 * Math.pow(aw, 0.5) * gauss(b + 0.02, 0.014);                                                         // fuller lower lip
  off -= 0.0013 * Math.pow(aw, 0.3) * gauss(b, 0.0065);                                                              // lip line groove
  off -= 0.0011 * gauss(Math.abs(a) - 1.0, 0.13) * gauss(b, 0.03);                                                   // corner tuck
  return off;
}
function mouthPoint(az, el, out) {
  headSurfFace(az, el, 0, out, _mn);
  return out.addScaledVector(_mn, mouthLip(az, el));
}
const _mn = new V3();
/** Analytic skull normal at the direction of a rest-pose point (from HEAD_C). */
function skullNormal(p) {
  const v = p.clone().sub(HEAD_C); const r = v.length();
  const n = new V3(); headSurfFace(Math.atan2(v.x, v.z), Math.asin(clamp(v.y / r, -1, 1)), 0, new V3(), n); return n;
}
function addMouth(acc, loop, R) {
  const [K, m, nb] = R.mouth;
  const N = loop.length;
  const hwAz = MOUTH.halfAz;
  const v = new V3(), pos = new V3();
  const elTop = MOUTH_RECT.el1 - MOUTH.el, elBot = MOUTH.el - MOUTH_RECT.el0;
  const cols = loop.map((vi) => {
    v.subVectors(acc.P[vi], HEAD_C); const az = Math.atan2(v.x, v.z), el = Math.asin(v.y / v.length());
    const b = el - MOUTH.el; const phi = Math.atan2(b / (b >= 0 ? elTop : elBot), az / MOUTH_RECT.az);
    const up = Math.sin(phi) >= 0;
    const w = acc.w[vi]; const jw0 = w.find((x) => x[0] === 'jaw')?.[1] || 0; const hd0 = w.find((x) => x[0] === 'head')?.[1] || 0;
    const ck0 = w.find((x) => x[0].startsWith('cheek'))?.[1] || 0;
    return { vi, az, el, phi, up, jw0: jw0 / Math.max(1e-6, jw0 + hd0 + ck0) / JAW_GAIN, ck0 };
  });
  // jaw weight at the lips: lower lip on the jaw, upper lip on the skull, corners shared
  const coreJaw = (c) => { const a = Math.abs(Math.cos(c.phi)); return c.up ? 0.38 * sstep(0.6, 1.0, a) : 1 - 0.52 * sstep(0.55, 1.0, a); };
  const rings = [loop];
  const cAz = (c) => hwAz * Math.cos(c.phi);
  for (let r = 1; r <= K; r++) {
    const s = r / K, wr = 1 - Math.pow(1 - s, 1.7);
    const ring = [];
    for (const c of cols) {
      const az = lerp(c.az, cAz(c), wr), el = lerp(c.el, MOUTH.el, wr);
      mouthPoint(az, el, pos);
      const jw = lerp(c.jw0, coreJaw(c), sstep(0, 1, wr)), ck = c.ck0 * (1 - wr);
      const mw = sstep(0.0, 0.85, wr);
      const id = acc.v(pos, { w: [['head', 1 - jw * JAW_GAIN - ck * (1 - jw)], ['jaw', jw * JAW_GAIN], [c.az > 0 ? 'cheekL' : 'cheekR', ck * (1 - jw)]], mw: c.up ? mw : -mw, part: 4 });
      const nbw = 1 - sstep(0.3, 0.8, wr);                    // outer rings: skull normal (no seam with the carrier)
      if (nbw > 0) acc.nb[id] = [skullNormal(pos), nbw];
      ring.push(id);
    }
    rings.push(ring);
  }
  // inner lip roll (from the lip line into the mouth) and the cavity bag, in the mouth frame
  const X = MF.X, U = MF.U, Fw = MF.F;
  const contact = cols.map((c) => mouthPoint(cAz(c), MOUTH.el, new V3()));
  const bagRing = (sgn, dy, dz, sx) => cols.map((c, k) => {
    const x0 = contact[k].clone().sub(MF.C).dot(X);
    const a = x0 / MF.hw;
    const y = (c.up ? 1 : -1) * dy * Math.sqrt(Math.max(0, 1 - Math.min(1, a * a) ** 2) * 0.85 + 0.15);
    return contact[k].clone().addScaledVector(X, x0 * (sx - 1)).addScaledVector(U, y).addScaledVector(Fw, -dz - 0.004 * a * a * sgn);
  });
  const roll = [];
  for (let j = 1; j <= m; j++) {
    const sg = j / m;
    roll.push(bagRing(0, 0.0042 * Math.sin((sg * Math.PI) / 2) + 0.0006 * sg, 0.0038 * (1 - Math.cos((sg * Math.PI) / 2)) + 0.002 * sg, 1));
  }
  const bag = [];
  for (let b = 1; b <= nb; b++) {
    const be = b / nb;
    const dz = 0.0058 + 0.021 * be;
    const dy = lerp(0.0055, 0.0125, sstep(0, 0.45, be)) * (1 - 0.85 * sstep(0.62, 1, be) ** 1.5);
    const sx = (1.06 + 0.12 * Math.sin(Math.PI * Math.min(1, be * 1.3))) * (1 - 0.62 * sstep(0.7, 1, be));
    bag.push(bagRing(1, dy, dz, sx));
  }
  for (const [list, sub, deep] of [[roll, 10, 0], [bag, 10, 1]]) {
    list.forEach((pts, j) => {
      const ring = pts.map((pp, k) => {
        const c = cols[k]; const jw = coreJaw(c) * (deep ? lerp(1, c.up ? 0 : 1, sstep(0.2, 0.7, j / list.length)) : 1);
        const jwB = deep && c.up ? jw : deep ? Math.max(jw, 0.9 - 0.4 * Math.abs(Math.cos(c.phi))) : jw;
        const mw = deep ? lerp(1, 0.35, j / list.length) : 1;   // sign: + upper half, − lower half (shader: upper-lip lift)
        const inner = deep ? 1 : sstep(0, 1, (j + 1) / list.length);
        return acc.v(pp, { w: [['head', 1 - jwB * JAW_GAIN], ['jaw', jwB * JAW_GAIN]], mw: c.up ? mw : -mw, part: 4, uv: [0, inner] });
      });
      rings.push(ring);
    });
  }
  const t0 = acc.idx.length;
  for (let r = 0; r < rings.length - 1; r++) for (let k = 0; k < N; k++) {
    const k1 = (k + 1) % N; acc.quad(rings[r][k], rings[r][k1], rings[r + 1][k1], rings[r + 1][k]);
  }
  // close the bag with a fan at the throat
  const last = rings[rings.length - 1]; const cc = new V3(); for (const vi of last) cc.add(acc.P[vi]); cc.multiplyScalar(1 / N);
  const pole = acc.v(cc.addScaledVector(Fw, -0.003), { w: [['head', 1 - 0.5 * JAW_GAIN], ['jaw', 0.5 * JAW_GAIN]], mw: 0.3, part: 4, uv: [0, 1] });
  for (let k = 0; k < N; k++) acc.tri(last[k], last[(k + 1) % N], pole);
  const tOuter = t0 + K * N * 6;
  const flipped = acc.orient(t0, tOuter, () => HEAD_C);
  if (flipped) acc.flip(tOuter, acc.idx.length);
  if (R.teeth) addTeethTongue(acc, R);
}
/** Upper + lower teeth (smooth stylised bands, the shader draws the tooth gaps) and the tongue. */
function addTeethTongue(acc, R) {
  const X = MF.X, U = MF.U, Fw = MF.F, n = R.teeth, ns = Math.max(6, Math.round(n / 2));
  const band = (y0, hh, th, z0, bend, wx, bone, sub) => {
    const rows = [], c = new V3(), tng = new V3(), nrm = new V3(), q = new V3();
    for (let i = 0; i <= n; i++) {
      const u = lerp(-1, 1, i / n), x = u * MF.hw * wx;
      const z = z0 + bend * u * u;
      c.copy(MF.C).addScaledVector(X, x).addScaledVector(U, y0).addScaledVector(Fw, -z);
      tng.copy(X).addScaledVector(Fw, -2 * bend * u / (MF.hw * wx)).normalize();
      nrm.crossVectors(U, tng).normalize(); if (nrm.dot(Fw) < 0) nrm.negate();
      const taper = Math.pow(Math.max(0, 1 - u ** 8), 0.25);
      const row = [];
      for (let k = 0; k < ns; k++) {
        const ang = (k / ns) * TAU, cs = Math.cos(ang), sn = Math.sin(ang);
        const yy = hh * taper * Math.sign(sn) * Math.pow(Math.abs(sn), 0.55), zz = th * taper * Math.sign(cs) * Math.pow(Math.abs(cs), 0.7);
        q.copy(c).addScaledVector(U, yy).addScaledVector(nrm, zz);
        row.push(acc.v(q, { sub, w: bone === 'jaw' ? [['jaw', JAW_GAIN], ['head', 1 - JAW_GAIN]] : [['head', 1]], mw: bone === 'jaw' ? -0.3 : 0.3, hd: false, part: 5, uv: [u, k / ns] }));
      }
      rows.push(row);
    }
    const t0 = acc.idx.length;
    for (let i = 0; i < n; i++) for (let k = 0; k < ns; k++) { const k1 = (k + 1) % ns; acc.quad(rows[i][k], rows[i][k1], rows[i + 1][k1], rows[i + 1][k]); }
    for (const [row, sgn] of [[rows[0], -1], [rows[n], 1]]) { const cc = new V3(); for (const vi of row) cc.add(acc.P[vi]); cc.multiplyScalar(1 / ns); const pv = acc.v(cc, { sub, w: bone === 'jaw' ? [['jaw', JAW_GAIN], ['head', 1 - JAW_GAIN]] : [['head', 1]], hd: false, part: 5 }); for (let k = 0; k < ns; k++) { if (sgn > 0) acc.tri(row[k], row[(k + 1) % ns], pv); else acc.tri(row[(k + 1) % ns], row[k], pv); } }
    const axis = (pp) => { const x = clamp(pp.clone().sub(MF.C).dot(X), -MF.hw * wx, MF.hw * wx); const u = x / (MF.hw * wx); return MF.C.clone().addScaledVector(X, x).addScaledVector(U, y0).addScaledVector(Fw, -(z0 + bend * u * u)); };
    acc.orient(t0, acc.idx.length, axis);
  };
  band(0.0006, 0.0043, 0.0013, 0.0046, 0.0045, 0.8, 'head', 11);    // upper teeth: edge ~3.7 mm under the lip line (a white band when open)
  band(-0.0068, 0.0032, 0.0012, 0.0072, 0.004, 0.68, 'jaw', 11);    // lower teeth, behind the uppers
  // tongue: flattened blob on the cavity floor
  const tc = MF.C.clone().addScaledVector(U, -0.0085).addScaledVector(Fw, -0.0145);
  const nT = Math.max(6, n), t0 = acc.idx.length, rows = [];
  for (let j = 0; j <= nT / 2; j++) {
    const th = (j / (nT / 2)) * Math.PI, row = [];
    for (let k = 0; k < nT; k++) {
      const ph = (k / nT) * TAU;
      const sx = Math.sin(th) * Math.cos(ph), sy = Math.cos(th), sz = Math.sin(th) * Math.sin(ph);
      const q = tc.clone().addScaledVector(X, sx * MF.hw * 0.78).addScaledVector(U, sy * (sy > 0 ? 0.0042 : 0.003)).addScaledVector(Fw, sz * 0.0115 + 0.001 * sy);
      row.push(acc.v(q, { sub: 12, w: [['jaw', JAW_GAIN], ['head', 1 - JAW_GAIN]], mw: -0.25, hd: false, part: 5, uv: [sx, sz] }));
    }
    rows.push(row);
  }
  for (let j = 0; j < rows.length - 1; j++) for (let k = 0; k < nT; k++) { const k1 = (k + 1) % nT; acc.quad(rows[j][k], rows[j][k1], rows[j + 1][k1], rows[j + 1][k]); }
  acc.orient(t0, acc.idx.length, () => tc);
}

// ---- normals, AO, packing -----------------------------------------------------------------------
function finishFace(acc) {
  const n = acc.P.length;
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { pos[i * 3] = acc.P[i].x; pos[i * 3 + 1] = acc.P[i].y; pos[i * 3 + 2] = acc.P[i].z; }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(acc.idx);
  g.computeVertexNormals();
  const Nn = g.attributes.normal;
  for (let i = 0; i < n; i++) { const a = acc.an[i]; if (a) Nn.setXYZ(i, a.x, a.y, a.z); }
  // ear roots: bend the normals toward the skull's so the melt-in has no shading seam
  const nq = new V3();
  for (const k in acc.nb) { const [hn, b] = acc.nb[k]; nq.fromBufferAttribute(Nn, +k).lerp(hn, b).normalize(); Nn.setXYZ(+k, nq.x, nq.y, nq.z); }
  const uv = new Float32Array(n * 2); for (let i = 0; i < n; i++) { uv[i * 2] = acc.uv[i][0]; uv[i * 2 + 1] = acc.uv[i][1]; }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  const ao = bakeAO(acc, g.attributes.normal);
  return { geo: g, acc, ao };
}

/** Vertex AO from the surface's own proximity (Evans-style distance probes along the normal against a vertex hash, with
 *  the eyeballs as occluders), plus analytic terms for features finer than the probes (nostrils, lid margin, cavity). */
function bakeAO(acc, N) {
  const n = acc.P.length;
  const pts = acc.P.slice();
  // eyeball proxies (so the socket and lid margins darken against the ball)
  const s = new V3();
  for (const F of EYE_FRAMES) for (let i = 0; i < 260; i++) {
    const z = 1 - (i + 0.5) / 260 * 1.2, r = Math.sqrt(Math.max(0, 1 - z * z)), ph = i * 2.39996;
    if (z < -0.2) continue; s.set(r * Math.cos(ph), r * Math.sin(ph), z); pts.push(fromEye(F, s, new V3()));
  }
  const probes = [[0.0035, 0.3], [0.0075, 0.28], [0.014, 0.24], [0.026, 0.18]];
  const occ = new Float32Array(n);
  for (const [dist, wgt] of probes) {
    const cell = dist; const inv = 1 / cell; const grid = new Map();
    const key = (x, y, z) => (x + 1024) + (y + 1024) * 2048 + (z + 1024) * 4194304;
    const stride = Math.max(1, Math.round(dist / 0.006));   // coarser probes use a thinned point set
    for (let i = 0; i < pts.length; i += (i < n ? stride : 1)) {
      const P = pts[i]; const k = key(Math.floor(P.x * inv), Math.floor(P.y * inv), Math.floor(P.z * inv));
      let b = grid.get(k); if (!b) grid.set(k, (b = [])); b.push(P);
    }
    const q = new V3();
    for (let i = 0; i < n; i++) {
      q.set(N.getX(i), N.getY(i), N.getZ(i)).multiplyScalar(dist).add(acc.P[i]);
      const cx = Math.floor(q.x * inv), cy = Math.floor(q.y * inv), cz = Math.floor(q.z * inv);
      let best = dist * dist;
      for (let a = -1; a <= 1; a++) for (let b2 = -1; b2 <= 1; b2++) for (let c = -1; c <= 1; c++) {
        const B = grid.get(key(cx + a, cy + b2, cz + c)); if (!B) continue;
        for (const P of B) { const dx = P.x - q.x, dy = P.y - q.y, dz = P.z - q.z; const dd = dx * dx + dy * dy + dz * dz; if (dd < best) best = dd; }
      }
      occ[i] += wgt * (1 - Math.sqrt(best) / dist);
    }
  }
  const ao = new Float32Array(n);
  const v = new V3();
  for (let i = 0; i < n; i++) {
    let a = 1 - clamp(occ[i] * 1.7, 0, 0.85);
    const sub = acc.sub[i];
    if (acc.part[i] === 1 || acc.part[i] === 3 || acc.part[i] === 4) {
      v.subVectors(acc.P[i], HEAD_C); const r = v.length(); const az = Math.atan2(v.x, v.z), el = Math.asin(v.y / r);
      a *= 1 - 0.45 * gauss(Math.abs(az) - 0.027, 0.016) * gauss(el + 0.178, 0.013);   // nostrils
      a *= 1 - 0.12 * gauss(Math.abs(az) - 0.058, 0.03) * gauss(el + 0.17, 0.02);     // nose-wing crease
    }
    if (acc.part[i] === 3) a *= lerp(1, 0.55, acc.uv[i][0]);                          // tucked lid margin
    if (acc.part[i] === 4 && acc.uv[i][1] > 0) { const dz = MF.C.clone().sub(acc.P[i]).dot(MF.F); a = lerp(a, lerp(0.85, 0.3, sstep(0.003, 0.022, dz)), acc.uv[i][1]); }
    if (sub === 11) { const dz = MF.C.clone().sub(acc.P[i]).dot(MF.F); a = lerp(0.9, 0.55, sstep(0.004, 0.011, dz)); }
    if (sub === 12) { const dz = MF.C.clone().sub(acc.P[i]).dot(MF.F); a = lerp(0.8, 0.4, sstep(0.006, 0.024, dz)); }
    if (acc.part[i] === 1 && acc.P[i].y < 0.99) a *= lerp(0.7, 1, sstep(NECK_BOTTOM, 0.99, acc.P[i].y)); // collar contact
    ao[i] = clamp(a, 0.08, 1);
  }
  // one smoothing pass over the mesh edges (probe noise → soft gradients)
  const sum = new Float32Array(n), cnt = new Float32Array(n);
  const I = acc.idx;
  for (let t = 0; t < I.length; t += 3) for (let e = 0; e < 3; e++) { const a = I[t + e], b = I[t + ((e + 1) % 3)]; sum[a] += ao[b]; cnt[a]++; sum[b] += ao[a]; cnt[b]++; }
  for (let i = 0; i < n; i++) if (cnt[i]) ao[i] = 0.5 * ao[i] + 0.5 * (sum[i] / cnt[i]);
  return ao;
}

/** Add the head skin to a character-geo.js Builder (one draw call with the rest of the skin). */
export function addHeadSkin(B, lod = 'hero') {
  const { geo, acc, ao } = buildFaceSkin(lod);
  const hd = new V3();
  B.add(geo, {
    uv: true,
    v3: (p, i) => { if (!acc.hd[i]) return [0, 0, 0]; hd.subVectors(acc.P[i], HEAD_C).normalize(); return [hd.x, hd.y, hd.z]; },
    ex: (p, i) => acc.sub[i],
    color: (p, i) => _col.setScalar(lerp(1, ao[i], 0.3)),        // a little cavity darkening in direct light too
    face: (p, i) => [acc.lid[i][0], acc.lid[i][1], acc.mw[i], ao[i]],
    weights: (p, i) => acc.w[i],
  });
  return { verts: acc.P.length, tris: acc.idx.length / 3 };
}
const _col = new THREE.Color();

// ------------------------------------------------------------------------------------------------
// Eyeballs (unit-sphere caps + cornea bulge in eye space; the eye material rotates them for the gaze)
// ------------------------------------------------------------------------------------------------
/** Add both eyeball caps to a Builder: build it with B.build('aEx', 'aEyeS'). aEx = ±2 marks this socketed-eye mode. */
export function addEyeballs(B, lod = 'hero') {
  const [nR, nS] = RES[faceLevel(lod)].cap;
  const TH = 1.2;                                                     // cap half-angle (always under the lids / socket)
  const rho = (th) => 1 + EYEB.cornea * Math.pow(Math.max(0, Math.cos(Math.min(1, th / 0.5) * Math.PI / 2)), 1.6);
  // ring angles: dense across the cornea and the limbus
  const ths = piecewise([0, EYEB.iris * 0.55, EYEB.iris + 0.06, TH], (t) => 1 + 1.4 * gauss(t - EYEB.iris, 0.07), TH / nR);
  for (const F of EYE_FRAMES) {
    const pos = [], nrm = [], uv = [], S = [], idx = [];
    const s = new V3(), nu = new V3(), p = new V3(), nk = new V3();
    const MiT = F.Mi.clone().transpose();
    const push = (th, ps) => {
      const r = rho(th), dr = (rho(th + 1e-3) - rho(th - 1e-3)) / 2e-3;
      const st = Math.sin(th), ct = Math.cos(th), cp = Math.cos(ps), sp = Math.sin(ps);
      s.set(st * cp, st * sp, ct).multiplyScalar(r);
      // normal of r(θ)·dir: dir − (r'/r)·∂dir/∂θ
      nu.set(st * cp, st * sp, ct).addScaledVector(new V3(ct * cp, ct * sp, -st), -dr / r).normalize();
      fromEye(F, s, p); nk.copy(nu).applyMatrix3(MiT).normalize();
      pos.push(p.x, p.y, p.z); nrm.push(nk.x, nk.y, nk.z); uv.push(s.x, s.y); S.push(s.x, s.y, s.z);
    };
    push(0, 0);
    for (let i = 1; i < ths.length; i++) for (let k = 0; k < nS; k++) push(ths[i], (k / nS) * TAU);
    for (let k = 0; k < nS; k++) idx.push(0, 1 + k, 1 + ((k + 1) % nS));
    for (let i = 1; i < ths.length - 1; i++) {
      const a0 = 1 + (i - 1) * nS, a1 = 1 + i * nS;
      for (let k = 0; k < nS; k++) { const k1 = (k + 1) % nS; idx.push(a0 + k, a1 + k, a1 + k1, a0 + k, a1 + k1, a0 + k1); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    // winding: outward from the ball centre (the right eye's mirrored frame flips it)
    const e1 = new V3(), e2 = new V3(), fn = new V3(), a = new V3(), b = new V3(), c = new V3(); let acc = 0;
    for (let t = 0; t < idx.length; t += 3) {
      a.fromArray(pos, idx[t] * 3); b.fromArray(pos, idx[t + 1] * 3); c.fromArray(pos, idx[t + 2] * 3);
      fn.crossVectors(e1.subVectors(b, a), e2.subVectors(c, a)); acc += fn.dot(a.sub(F.C));
    }
    if (acc < 0) for (let t = 0; t < idx.length; t += 3) { const k = idx[t + 1]; idx[t + 1] = idx[t + 2]; idx[t + 2] = k; }
    g.setIndex(idx);
    B.add(g, { bone: 'head', uv: true, ex: 2 * F.sx, v3: (pp, i) => [S[i * 3], S[i * 3 + 1], S[i * 3 + 2]] });
  }
}
