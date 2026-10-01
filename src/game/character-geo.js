// INKWAVE — squidkid geometry: rig definition, procedural primitives and the shared (cached) meshes.
// Everything is authored in "kid space" (feet at y=0, facing +Z, character's right = -X) in the rest pose.
// Rest orientation of every bone is identity, so kid-space == bone-space up to a translation.
// Budget: the whole visible character (kid + held weapon) stays under 40k triangles; kid form ≈ 8–10 draw calls.
//
// Material contracts (see character-mats.js):
//   skin  : aEx = sub-material (0 skin · 1 nail · 2 inner ear), aHead = unit head direction for face decals
//   cloth : aEx = colour source (CS), aCloth = (part id, material class, param), uv = part coordinates
//   hair  : aTint + colour = strand data | cap flag | gear accessory (see makeHairMaterial)
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { CS, MC, PART } from './character-mats.js';
import { addBodyLimbs, addOutfit, bakeBodyAO, bodyLevel, tankGlass, armRadiusAt, armFlatAt, teeSurfacePoint } from './character-outfit.js';
import { HEAD_C, EYE, MOUTH, BROW, EAR, headShape, hairline, addHeadSkin, addEyeballs, JAW_PIVOT, FACE_BONES } from './character-face.js';
import { TentacleSurface, tentacleTube, suctionCups, curlTip, lockSpines, spineSamples, hairDetail, hairQuality } from './character-hair.js';

const V3 = THREE.Vector3;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const smax = (a, b, k) => { const h = clamp(0.5 + (0.5 * (a - b)) / k, 0, 1); return lerp(b, a, h) + k * h * (1 - h); };
const gauss = (x, s) => Math.exp(-((x / s) ** 2));
const TAU = Math.PI * 2;

// ------------------------------------------------------------------------------------------------
// Rig
// ------------------------------------------------------------------------------------------------
export const HAIR_MAX = 8;
export const HAIR_SEGS = 3;

// name, parent, rest position (kid space). Right side = -X.
const BODY_BONES = [
  ['hips', null, [0, 0.64, 0]],
  ['spine', 'hips', [0, 0.745, -0.004]],
  ['chest', 'spine', [0, 0.86, -0.01]],
  ['neck', 'chest', [0, 0.992, -0.008]],
  ['head', 'neck', [0, 1.05, -0.002]],
  ['clavL', 'chest', [0.035, 0.952, -0.012]],
  ['uArmL', 'clavL', [0.146, 0.946, -0.014]],
  ['fArmL', 'uArmL', [0.17, 0.736, -0.022]],
  ['handL', 'fArmL', [0.184, 0.542, -0.006]],
  ['clavR', 'chest', [-0.035, 0.952, -0.012]],
  ['uArmR', 'clavR', [-0.146, 0.946, -0.014]],
  ['fArmR', 'uArmR', [-0.17, 0.736, -0.022]],
  ['handR', 'fArmR', [-0.184, 0.542, -0.006]],
  ['thighL', 'hips', [0.078, 0.622, 0]],
  ['shinL', 'thighL', [0.081, 0.347, 0.012]],
  ['footL', 'shinL', [0.084, 0.085, -0.01]],
  ['thighR', 'hips', [-0.078, 0.622, 0]],
  ['shinR', 'thighR', [-0.081, 0.347, 0.012]],
  ['footR', 'shinR', [-0.084, 0.085, -0.01]],
  ['eyeL', 'head', [0, 0, 0]],
  ['eyeR', 'head', [0, 0, 0]],
  ['browL', 'head', [0, 0, 0]],
  ['browR', 'head', [0, 0, 0]],
  ['mouth', 'head', [0, 0, 0]],
  ['mouthO', 'head', [0, 0, 0]],
];
const REST_BODY = {};
for (const [n, , p] of BODY_BONES) REST_BODY[n] = new V3(...p);

// ---- hand design (canonical LEFT hand, wrist-relative; palm faces -X, thumb +Z, fingers -Y) ----
// The fingers wrap a Ø ≈ 3.2 cm handle whose axis runs along hand Z through GRIP_HOLE (the weapon grip point).
export const HAND = {
  hole: new V3(-0.0255, -0.0525, 0.0), // grip-hole axis point, LEFT hand (mirror X for the right hand)
  holeR: 0.014,                        // handle radius the fist is shaped around (Ø 2.8 cm)
  palmX: -0.0112,                      // palm (inner) surface
};
const FINGERS = [
  // name, MCP [x,y,z], radius, [proximal, middle, distal] lengths
  ['index', [0.0005, -0.0585, 0.0183], 0.0077, [0.0215, 0.0135, 0.0122]],
  ['middle', [0.0, -0.0605, 0.0058], 0.0081, [0.0235, 0.0145, 0.013]],
  ['ring', [0.0, -0.0592, -0.0063], 0.0076, [0.022, 0.0138, 0.0122]],
  ['pinky', [0.0012, -0.0558, -0.0178], 0.0066, [0.0178, 0.011, 0.0106]],
];
/** Finger joint chain (canonical left hand, wrist-relative) wrapping the grip circle. */
function fingerChain(mcp, r, lens) {
  const H = HAND.hole, rho = HAND.holeR + r * 0.98;
  // work in (a = -x, y) — the palm-direction plane; wrap counter-clockwise (under the handle, up the far side)
  const ca = -H.x, cy = H.y;
  const M = { a: -mcp[0], y: mcp[1] };
  const dM = Math.hypot(M.a - ca, M.y - cy);
  const phM = Math.atan2(M.y - cy, M.a - ca);
  const cosD = clamp((rho * rho + dM * dM - lens[0] * lens[0]) / (2 * rho * dM), -1, 1);
  let ph = phM + Math.acos(cosD);
  const pts = [new V3(mcp[0], mcp[1], mcp[2])];
  const at = (phi) => new V3(-(ca + rho * Math.cos(phi)), cy + rho * Math.sin(phi), mcp[2]);
  pts.push(at(ph));
  for (let k = 1; k < 3; k++) { ph += 2 * Math.asin(clamp(lens[k] / (2 * rho), -1, 1)); pts.push(at(ph)); }
  return pts; // [MCP, PIP, DIP, tip]
}
const THUMB = [[-0.0058, -0.0142, 0.0148], [-0.0158, -0.0272, 0.0252], [-0.0282, -0.0322, 0.0272], [-0.0372, -0.0438, 0.0238]];
const THUMB_R = [0.0106, 0.0089, 0.0083];

// extra bones (appended after the hair bones so existing indices never move)
/** Finger bone name: hand{L|R}_{thumb|index|middle|ring|pinky}{1|2} (1 = knuckle, 2 = middle joint). */
export const fb = (s, finger, k) => `hand${s}_${finger}${k}`;
const EXTRA_BONES = [];
for (const [s, sx] of [['L', 1], ['R', -1]]) {
  const W = REST_BODY['hand' + s];
  const m = (p) => new V3(p[0] * sx, p[1], p[2]).add(W);
  EXTRA_BONES.push([fb(s, 'thumb', 1), 'hand' + s, m(THUMB[0])], [fb(s, 'thumb', 2), fb(s, 'thumb', 1), m(THUMB[1])]);
  for (const [fn, mcp, r, lens] of FINGERS) {
    const ch = fingerChain(mcp, r, lens);
    EXTRA_BONES.push([fb(s, fn, 1), 'hand' + s, m([ch[0].x, ch[0].y, ch[0].z])], [fb(s, fn, 2), fb(s, fn, 1), m([ch[1].x, ch[1].y, ch[1].z])]);
  }
  const F = REST_BODY['foot' + s];
  EXTRA_BONES.push(['toe' + s, 'foot' + s, new V3(F.x, 0.028, F.z + 0.1)]);
}
EXTRA_BONES.push(['jaw', 'head', null], ['cheekL', 'head', null], ['cheekR', 'head', null], ['earL', 'head', null], ['earR', 'head', null]);
EXTRA_BONES.push(['hemF', 'hips', new V3(0, 0.712, 0.082)], ['hemB', 'hips', new V3(0, 0.712, -0.1)]);
EXTRA_BONES.push(['tank', 'chest', new V3(0, 0.848, -0.176)]);
for (let s = 0; s < HAIR_MAX; s++) EXTRA_BONES.push([`hairTip${s}`, `hair${s}_2`, null]);

export const BONE_NAMES = BODY_BONES.map((b) => b[0]);
for (let s = 0; s < HAIR_MAX; s++) for (let k = 0; k < HAIR_SEGS; k++) BONE_NAMES.push(`hair${s}_${k}`);
for (const [n] of EXTRA_BONES) BONE_NAMES.push(n);
export const BONE_INDEX = Object.fromEntries(BONE_NAMES.map((n, i) => [n, i]));
export const BONE_PARENT = {};
for (const [n, p] of BODY_BONES) BONE_PARENT[n] = p;
for (let s = 0; s < HAIR_MAX; s++) for (let k = 0; k < HAIR_SEGS; k++) BONE_PARENT[`hair${s}_${k}`] = k === 0 ? 'head' : `hair${s}_${k - 1}`;
for (const [n, p] of EXTRA_BONES) BONE_PARENT[n] = p;
for (const [n, , p] of EXTRA_BONES) if (p) REST_BODY[n] = p.clone();
/** Names of the bones added by the modeling stream (see docs/RIG.md → Added bones). */
export const ADDED_BONES = EXTRA_BONES.map((b) => b[0]);

// ------------------------------------------------------------------------------------------------
// Head surface (analytic, so face decals and hair hug it exactly)
// ------------------------------------------------------------------------------------------------
// The sculpt itself (headShape, HEAD_C, the face constants) lives in character-face.js.
export { HEAD_C, EYE, MOUTH, BROW };
const _hd = new V3(), _h0 = new V3(), _h1 = new V3(), _h2 = new V3(), _ha = new V3(), _hb = new V3();
function dirAE(az, el, out) { const c = Math.cos(el); return out.set(Math.sin(az) * c, Math.sin(el), Math.cos(az) * c); }
/** Point on the head surface (kid space) at azimuth/elevation (az=0 front, +az toward +X/left), offset along the normal. */
export function headSurf(az, el, off, out, nOut) {
  dirAE(az, el, _hd); headShape(_hd.x, _hd.y, _hd.z, _h0);
  const e = clamp(el, -1.555, 1.555);
  dirAE(az + 1e-3, e, _hd); headShape(_hd.x, _hd.y, _hd.z, _h1);
  dirAE(az, e + 1e-3, _hd); headShape(_hd.x, _hd.y, _hd.z, _h2);
  dirAE(az, e, _hd); headShape(_hd.x, _hd.y, _hd.z, _ha);
  _h1.sub(_ha); _h2.sub(_ha);
  _hb.crossVectors(_h1, _h2).normalize();
  if (Math.abs(el) > 1.55) _hb.set(0, Math.sign(el), 0);
  if (nOut) nOut.copy(_hb);
  return out.copy(_h0).addScaledVector(_hb, off).add(HEAD_C);
}

/** Hair-cap thickness above the skin at (az, el) (full volume; the rolled lip is added by the cap builder). */
export function capOffset(az, el) {
  const back = Math.max(0, -Math.cos(az));
  return 0.0075 + 0.003 * sstep(0.45, 1.0, el) + 0.0135 * back * sstep(-0.7, 0.4, el) + 0.0025 * sstep(0.8, 1.4, el);
}

if (BONE_INDEX.head !== FACE_BONES.head || BONE_INDEX.eyeL !== FACE_BONES.eyeL || BONE_INDEX.eyeR !== FACE_BONES.eyeR) console.error('character-face FACE_BONES out of sync with BONE_INDEX');

// face bone rest positions (derived from the head surface; see docs/RIG.md)
headSurf(EYE.az, EYE.el, 0.0022, REST_BODY.eyeL);
headSurf(-EYE.az, EYE.el, 0.0022, REST_BODY.eyeR);
headSurf((BROW.az0 + BROW.az1) / 2, BROW.el + 0.03, 0.002, REST_BODY.browL);
headSurf(-(BROW.az0 + BROW.az1) / 2, BROW.el + 0.03, 0.002, REST_BODY.browR);
headSurf(0, MOUTH.el, 0.002, REST_BODY.mouth);
headSurf(0, MOUTH.el - 0.02, 0.0005, REST_BODY.mouthO);
REST_BODY.jaw = JAW_PIVOT.clone();
REST_BODY.cheekL = headSurf(0.6, -0.31, -0.02, new V3());
REST_BODY.cheekR = headSurf(-0.6, -0.31, -0.02, new V3());
REST_BODY.earL = headSurf(EAR.az, EAR.el, -0.006, new V3());
REST_BODY.earR = headSurf(-EAR.az, EAR.el, -0.006, new V3());

// ------------------------------------------------------------------------------------------------
// Primitive helpers
// ------------------------------------------------------------------------------------------------
function finalize(geo) {
  geo.deleteAttribute('uv');
  if (geo.attributes.normal) geo.deleteAttribute('normal');
  const g = mergeVertices(geo, 1e-6);
  g.computeVertexNormals();
  return g;
}
function flipWinding(g) { const ix = g.index.array; for (let q = 0; q < ix.length; q += 3) { const t = ix[q + 1]; ix[q + 1] = ix[q + 2]; ix[q + 2] = t; } g.computeVertexNormals(); }
function signedPow(v, e) { return Math.sign(v) * Math.pow(Math.abs(v), e); }
/** Mirror a geometry across X (fixes winding + normals). Keeps custom attributes. */
function mirrorX(g) {
  g.scale(-1, 1, 1);
  const ix = g.index.array; for (let q = 0; q < ix.length; q += 3) { const t = ix[q + 1]; ix[q + 1] = ix[q + 2]; ix[q + 2] = t; }
  const n = g.attributes.normal; if (n) for (let i = 0; i < n.count; i++) n.setX(i, -n.getX(i));
  return g;
}

/** Super-ellipsoid (chunky rounded box/pill). e1: vertical squareness, e2: horizontal squareness (<1 boxier). */
export function superEllipsoid(rx, ry, rz, e1 = 1, e2 = 1, ws = 18, hs = 12, deform = null) {
  const g = finalize(new THREE.SphereGeometry(1, ws, hs));
  const p = g.attributes.position; const v = new V3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const ce = Math.hypot(v.x, v.z);
    const cw = ce > 1e-9 ? v.x / ce : 1, sw = ce > 1e-9 ? v.z / ce : 0;
    v.set(signedPow(ce, e1) * signedPow(cw, e2) * rx, signedPow(v.y, e1) * ry, signedPow(ce, e1) * signedPow(sw, e2) * rz);
    if (deform) deform(v);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

/** Lathe around +Y from [r, y] profile, optional per-vertex deform(v). */
export function lathe(profile, seg = 24, deform = null) {
  const pts = profile.map(([r, y]) => new THREE.Vector2(Math.max(r, 0), y));
  const g = finalize(new THREE.LatheGeometry(pts, seg));
  {
    const p = g.attributes.position, n = g.attributes.normal; let acc = 0;
    for (let i = 0; i < p.count; i++) acc += n.getX(i) * p.getX(i) + n.getZ(i) * p.getZ(i);
    if (acc < 0) flipWinding(g);
  }
  if (deform) {
    const p = g.attributes.position; const v = new V3();
    for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); deform(v); p.setXYZ(i, v.x, v.y, v.z); }
    g.computeVertexNormals();
  }
  return g;
}

/** Smooth a sparse [r,y] profile with a Catmull-Rom so lathes have no visible kinks. */
export function smoothProfile(ctrl, n = 20) {
  const c = new THREE.SplineCurve(ctrl.map(([r, y]) => new THREE.Vector2(r, y)));
  return c.getSpacedPoints(n).map((p) => [p.x, p.y]);
}

/** Orient a geometry built along -Y (hanging) so it points along `dir`, then place at `at`. */
export function alongAxis(geo, at, dir) {
  const q = new THREE.Quaternion().setFromUnitVectors(new V3(0, -1, 0), dir.clone().normalize());
  geo.applyQuaternion(q); geo.translate(at.x, at.y, at.z);
  return geo;
}

/**
 * Sweep a variable-radius, optionally flattened tube along a Catmull-Rom curve with rounded end caps.
 * Returns { geo, t, cs, sn, sample(t), curve } — t = per-vertex curve param, cs/sn = cos/sin of the ring angle.
 * opts.section(c, s, t) → [c', s'] reshapes the unit cross-section (e.g. a keel).
 */
export function sweep(points, opts = {}) {
  const seg = opts.seg ?? 16, radial = opts.radial ?? 10;
  const radius = opts.radius ?? (() => 0.03);
  const flatFn = typeof opts.flat === 'function' ? opts.flat : (() => opts.flat ?? 1);
  const capSteps = opts.capSteps ?? 3;
  const section = opts.section || null;
  const curve = new THREE.CatmullRomCurve3(points.map((p) => (p.isVector3 ? p.clone() : new V3(...p))), false, opts.curveType || 'centripetal');
  const frames = curve.computeFrenetFrames(seg, false);
  const pos = [], tt = [], cs = [], sn = [], idx = [];
  const P = new V3(), o = new V3(), b = new V3(), T = new V3(), tmp = new V3();
  // opts.transport: carry the cross-section frame along the curve (no flips where the outward hint turns parallel
  // to the tangent, e.g. curled tentacle tips), gently biased back toward the outward hint where it is well defined.
  let oFrames = null;
  if (opts.transport && opts.outward) {
    oFrames = []; const prev = new V3(), hint = new V3(), Pt = new V3();
    for (let i = 0; i <= seg; i++) {
      const t = i / seg; curve.getPointAt(t, Pt); const Ti = frames.tangents[i];
      opts.outward(Pt, hint, t); hint.addScaledVector(Ti, -hint.dot(Ti));
      const hl = hint.length();
      let oi;
      if (i === 0 || hl < 1e-6) oi = hl > 1e-6 ? hint.clone().normalize() : frames.normals[i].clone();
      else {
        oi = prev.clone().addScaledVector(Ti, -prev.dot(Ti)).normalize();
        const w = 0.22 * hl * hl;                               // hint weight fades where it becomes unreliable
        oi.lerp(hint.multiplyScalar(1 / hl), w).normalize();
      }
      prev.copy(oi); oFrames.push(oi);
    }
  }
  const frameAt = (i) => {
    const t = i / seg;
    curve.getPointAt(t, P); T.copy(frames.tangents[i]);
    if (oFrames) o.copy(oFrames[i]);
    else if (opts.outward) opts.outward(P, o, t); else o.copy(frames.normals[i]);
    o.addScaledVector(T, -o.dot(T));
    if (o.lengthSq() < 1e-8) o.copy(frames.normals[i]);
    o.normalize();
    b.crossVectors(T, o).normalize();
    return t;
  };
  const twistFn = opts.twist || null;
  const ring = (center, r, t) => {
    const flat = flatFn(t);
    const tw = twistFn ? twistFn(t) : 0, ct = Math.cos(tw), st = Math.sin(tw);
    for (let k = 0; k < radial; k++) {
      const th = (k / radial) * Math.PI * 2; let c = Math.cos(th), s = Math.sin(th);
      if (section) [c, s] = section(c, s, t);
      const xo = c * r * flat, xb = s * r;
      tmp.copy(center).addScaledVector(o, xo * ct - xb * st).addScaledVector(b, xo * st + xb * ct);
      pos.push(tmp.x, tmp.y, tmp.z); tt.push(t); cs.push(Math.cos(th)); sn.push(Math.sin(th));
    }
  };
  const hasStart = opts.capStart !== false, hasEnd = opts.capEnd !== false;
  let rings = 0;
  frameAt(0);
  const r0 = radius(0);
  if (hasStart) {
    tmp.copy(P).addScaledVector(T, -r0 * 0.9); pos.push(tmp.x, tmp.y, tmp.z); tt.push(0); cs.push(1); sn.push(0);
    for (let j = 1; j < capSteps; j++) { const a = (j / capSteps) * Math.PI * 0.5; ring(P.clone().addScaledVector(T, -r0 * 0.9 * Math.cos(a)), r0 * Math.sin(a), 0); rings++; }
  }
  for (let i = 0; i <= seg; i++) { const t = frameAt(i); ring(P, radius(t), t); rings++; }
  const r1 = radius(1);
  if (hasEnd) {
    for (let j = 1; j < capSteps; j++) { const a = (j / capSteps) * Math.PI * 0.5; ring(P.clone().addScaledVector(T, r1 * 1.05 * Math.sin(a)), r1 * Math.cos(a), 1); rings++; }
    tmp.copy(P).addScaledVector(T, r1 * 1.05); pos.push(tmp.x, tmp.y, tmp.z); tt.push(1); cs.push(1); sn.push(0);
  }
  const ringBase = (r) => (hasStart ? 1 : 0) + r * radial;
  for (let r = 0; r < rings - 1; r++) {
    const a0 = ringBase(r), a1 = ringBase(r + 1);
    for (let k = 0; k < radial; k++) { const k1 = (k + 1) % radial; idx.push(a0 + k, a1 + k1, a1 + k, a0 + k, a0 + k1, a1 + k1); }
  }
  if (hasStart) for (let k = 0; k < radial; k++) idx.push(0, 1 + ((k + 1) % radial), 1 + k);
  if (hasEnd) { const tip = pos.length / 3 - 1, last = ringBase(rings - 1); for (let k = 0; k < radial; k++) idx.push(last + k, last + ((k + 1) % radial), tip); }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const sample = (t) => { const i = clamp(Math.round(t * seg), 0, seg); frameAt(i); return { P: P.clone(), T: T.clone(), o: o.clone(), b: b.clone(), r: radius(t) }; };
  return { geo, t: new Float32Array(tt), cs: new Float32Array(cs), sn: new Float32Array(sn), sample, curve };
}

/** Grid over (u,v) in [0,1]^2 → fn(u, v, outPos); indexed, merged, smooth normals. */
function surfaceGrid(nu, nv, fn) {
  const pos = [], idx = []; const p = new V3();
  for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) { fn(i / nu, j / nv, p); pos.push(p.x, p.y, p.z); }
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) { const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 2, d = a + nu + 1; idx.push(a, b, c, a, c, d); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return finalize(g);
}

/**
 * Structured grid with explicit rows: rows[j] = array of V3 (all rows the same length nu).
 * wrapU closes the ring (seam normals averaged, seam column duplicated so uv stays continuous).
 * uv(i, j) → [u, v] (defaults to i/nu, j/(rows-1)). outward: V3 hint point (normals face away from it) or fn.
 * skip(i, j) → true drops quad (i,j). poles: { start: V3?, end: V3? } fans the first/last row to a point.
 */
function gridGeo(rows, opt = {}) {
  const nv = rows.length - 1, nu = rows[0].length;
  const wrap = opt.wrapU !== false;
  const qu = wrap ? nu : nu - 1;
  const uvFn = opt.uv || ((i, j) => [i / (wrap ? nu : nu - 1), j / nv]);
  const skip = opt.skip || null;
  // topology on the unduplicated grid (for normals)
  const P = []; for (const r of rows) for (const p of r) P.push(p);
  const quads = [];
  for (let j = 0; j < nv; j++) for (let i = 0; i < qu; i++) { if (skip && skip(i, j)) continue; quads.push([i, j]); }
  const vid = (i, j) => j * nu + (i % nu);
  const N = P.map(() => new V3());
  const e1 = new V3(), e2 = new V3(), fn = new V3();
  const addTri = (a, b, c) => { e1.subVectors(P[b], P[a]); e2.subVectors(P[c], P[a]); fn.crossVectors(e1, e2); N[a].add(fn); N[b].add(fn); N[c].add(fn); };
  for (const [i, j] of quads) { const a = vid(i, j), b = vid(i + 1, j), c = vid(i + 1, j + 1), d = vid(i, j + 1); addTri(a, b, c); addTri(a, c, d); }
  const poleS = opt.poles?.start, poleE = opt.poles?.end;
  if (poleS) { const ps = P.length; P.push(poleS); N.push(new V3()); for (let i = 0; i < qu; i++) addTri(ps, vid(i + 1, 0), vid(i, 0)); }
  if (poleE) { const pe = P.length; P.push(poleE); N.push(new V3()); for (let i = 0; i < qu; i++) addTri(vid(i, nv), vid(i + 1, nv), pe); }
  // orientation: flip if normals point toward the hint
  let flip = !!opt.flip;
  if (opt.outward) {
    let acc = 0; const c = new V3();
    for (let k = 0; k < P.length; k++) { if (typeof opt.outward === 'function') opt.outward(P[k], c); else c.copy(opt.outward); acc += N[k].dot(e1.subVectors(P[k], c)); }
    flip = acc < 0;
  }
  for (const n of N) { if (flip) n.negate(); n.normalize(); }
  // output (duplicate the seam column when wrapping)
  const oc = wrap ? nu + 1 : nu;
  const pos = [], nrm = [], uv = [], idx = [];
  for (let j = 0; j <= nv; j++) for (let i = 0; i < oc; i++) { const k = vid(i, j); pos.push(P[k].x, P[k].y, P[k].z); nrm.push(N[k].x, N[k].y, N[k].z); uv.push(...uvFn(i, j)); }
  const o = (i, j) => j * oc + i;
  const tri = (a, b, c) => { if (flip) idx.push(a, c, b); else idx.push(a, b, c); };
  for (const [i, j] of quads) { const a = o(i, j), b = o(i + 1, j), c = o(i + 1, j + 1), d = o(i, j + 1); tri(a, b, c); tri(a, c, d); }
  const base = pos.length / 3;
  let extra = 0;
  if (poleS) { const k = P.length - (poleE ? 2 : 1); pos.push(P[k].x, P[k].y, P[k].z); nrm.push(N[k].x, N[k].y, N[k].z); uv.push(...(opt.poleUv?.start || [0.5, 0])); for (let i = 0; i < qu; i++) tri(base, o(i + 1, 0), o(i, 0)); extra++; }
  if (poleE) { const k = P.length - 1; pos.push(P[k].x, P[k].y, P[k].z); nrm.push(N[k].x, N[k].y, N[k].z); uv.push(...(opt.poleUv?.end || [0.5, 1])); for (let i = 0; i < qu; i++) tri(o(i, nv), o(i + 1, nv), base + extra); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

/** Samples on [lo, hi] distributed with density rho(x) (n+1 values, ends included). */
function densitySamples(n, lo, hi, rho, steps = 3000) {
  const cum = new Float64Array(steps + 1); const h = (hi - lo) / steps;
  for (let i = 0; i < steps; i++) cum[i + 1] = cum[i] + rho(lo + (i + 0.5) * h) * h;
  const out = []; let j = 0; const tot = cum[steps];
  for (let k = 0; k <= n; k++) {
    const target = (k / n) * tot;
    while (j < steps - 1 && cum[j + 1] < target) j++;
    const f = (target - cum[j]) / Math.max(1e-12, cum[j + 1] - cum[j]);
    out.push(lo + (j + clamp(f, 0, 1)) * h);
  }
  return out;
}

/** Elliptical dome patch on a polar grid: fn(u, v in [-1,1], r, outPos). Keeps uv = (u, v). */
function polarPatch(rings, segs, fn) {
  const pos = [], uv = [], idx = []; const p = new V3();
  fn(0, 0, 0, p); pos.push(p.x, p.y, p.z); uv.push(0, 0);
  for (let r = 1; r <= rings; r++) {
    const rr = r / rings;
    for (let s = 0; s < segs; s++) { const th = (s / segs) * Math.PI * 2; const u = Math.cos(th) * rr, v = Math.sin(th) * rr; fn(u, v, rr, p); pos.push(p.x, p.y, p.z); uv.push(u, v); }
  }
  for (let s = 0; s < segs; s++) idx.push(0, 1 + s, 1 + ((s + 1) % segs));
  for (let r = 1; r < rings; r++) { const a0 = 1 + (r - 1) * segs, a1 = 1 + r * segs; for (let s = 0; s < segs; s++) { const s1 = (s + 1) % segs; idx.push(a0 + s, a1 + s, a1 + s1, a0 + s, a1 + s1, a0 + s1); } }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}
function torus(R, r, rs, ts, arc = Math.PI * 2) { return finalize(new THREE.TorusGeometry(R, r, rs, ts, arc)); }
/** Superellipse ring point: theta 0 = +Z (front), pi/2 = +X. */
function seRing(th, a, b, n, out, cx = 0, cz = 0) {
  const s = Math.sin(th), c = Math.cos(th);
  return out.set(cx + a * signedPow(s, 2 / n), 0, cz + b * signedPow(c, 2 / n));
}
/** Catmull-Rom interpolation of a keyed table: keys = [x0..], vals = [v0..] (non-uniform keys, clamped). */
function interpTable(keys, vals, x) {
  const n = keys.length;
  if (x <= keys[0]) return vals[0];
  if (x >= keys[n - 1]) return vals[n - 1];
  let i = 0; while (i < n - 2 && x > keys[i + 1]) i++;
  const t = (x - keys[i]) / (keys[i + 1] - keys[i]);
  const p0 = vals[Math.max(0, i - 1)], p1 = vals[i], p2 = vals[i + 1], p3 = vals[Math.min(n - 1, i + 2)];
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

// ------------------------------------------------------------------------------------------------
// Builder: concatenates parts with skin weights + per-vertex extras into one skinned geometry.
// ------------------------------------------------------------------------------------------------
const _c = new THREE.Color();
class Builder {
  constructor() { this.pos = []; this.nrm = []; this.uv = []; this.col = []; this.si = []; this.sw = []; this.ex = []; this.v3 = []; this.idx = []; this.fc = []; this.hasFc = false; }
  /** o.bone | o.weights(p,i) -> [[name,w],..] ; o.color: hex|Color|fn(p,i)->Color ; o.ex: number|fn ; o.uv: bool|fn(i)->[u,v] ; o.v3: fn(p,i)->[x,y,z] | [x,y,z] */
  add(geo, o = {}) {
    const P = geo.attributes.position, N = geo.attributes.normal, UV = geo.attributes.uv;
    const base = this.pos.length / 3; const p = new V3();
    const fixedCol = typeof o.color === 'function' ? null : _c.set(o.color ?? 0xffffff).clone();
    const fixedV3 = Array.isArray(o.v3) ? o.v3 : null;
    const boneIdx = BONE_INDEX[o.bone || 'hips'];
    const selW = [0, 0, 0, 0], selB = [null, null, null, null];
    for (let i = 0; i < P.count; i++) {
      p.fromBufferAttribute(P, i);
      this.pos.push(p.x, p.y, p.z);
      this.nrm.push(N.getX(i), N.getY(i), N.getZ(i));
      if (typeof o.uv === 'function') this.uv.push(...o.uv(i, p)); else if (o.uv && UV) this.uv.push(UV.getX(i), UV.getY(i)); else this.uv.push(0, 0);
      const c = fixedCol || o.color(p, i);
      this.col.push(c.r, c.g, c.b);
      this.ex.push(typeof o.ex === 'function' ? o.ex(p, i) : (o.ex ?? 0));
      if (fixedV3) this.v3.push(fixedV3[0], fixedV3[1], fixedV3[2]); else if (o.v3) this.v3.push(...o.v3(p, i)); else this.v3.push(0, 0, 0);
      if (o.face) { this.fc.push(...o.face(p, i)); this.hasFc = true; } else this.fc.push(0, 0, 0, 1); // aFace (skin: lids, mouth, AO)
      if (!o.weights) { this.si.push(boneIdx, 0, 0, 0); this.sw.push(1, 0, 0, 0); continue; }
      // top-4 influences without per-vertex filter/sort allocations
      const w = o.weights(p, i);
      let n = 0;
      for (let e = 0; e < w.length; e++) {
        const we = w[e][1]; if (!(we > 1e-4)) continue;
        let k = n < 4 ? n++ : 4;
        if (k === 4) { if (we <= selW[3]) continue; k = 3; }
        while (k > 0 && selW[k - 1] < we) { selW[k] = selW[k - 1]; selB[k] = selB[k - 1]; k--; }
        selW[k] = we; selB[k] = w[e][0];
      }
      let sum = 0; for (let k = 0; k < n; k++) sum += selW[k];
      if (n === 0 || sum <= 0) { this.si.push(boneIdx, 0, 0, 0); this.sw.push(1, 0, 0, 0); continue; }
      for (let k = 0; k < 4; k++) { if (k < n) { this.si.push(BONE_INDEX[selB[k]]); this.sw.push(selW[k] / sum); } else { this.si.push(0); this.sw.push(0); } }
    }
    if (geo.index) { const ix = geo.index.array; for (let i = 0; i < ix.length; i++) this.idx.push(ix[i] + base); }
    else for (let i = 0; i < P.count; i++) this.idx.push(i + base);
    return this;
  }
  build(extraName = 'aEx', v3Name = null) {
    const g = new THREE.BufferGeometry();
    if (v3Name) g.setAttribute(v3Name, new THREE.Float32BufferAttribute(this.v3, 3));
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(this.si, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(this.sw, 4));
    g.setAttribute(extraName, new THREE.Float32BufferAttribute(this.ex, 1));
    if (this.hasFc) g.setAttribute('aFace', new THREE.Float32BufferAttribute(this.fc, 4));
    g.setIndex(this.pos.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.boundingSphere = new THREE.Sphere(new V3(0, 0.75, 0), 1.3);
    return g;
  }
}

/** Legacy slot names (colour sources) kept for compatibility. */
export const SLOT = { plain: CS.white, team: CS.team, shirt: CS.shirt, shorts: CS.shorts, shoe: CS.shoe, sock: CS.sock, sole: CS.sole, strap: CS.strap };

// ------------------------------------------------------------------------------------------------
// Kid: skin (head, ears, neck, arms, hands, legs)
// ------------------------------------------------------------------------------------------------
const R = REST_BODY;


/** Canonical LEFT hand parts (wrist at the origin). Returns [{geo, weights(localP)->[[bone,w]], ex, isSweep}] */
function handParts(s, sx, lv = 3) {
  const parts = [];
  // detail ladder: [palm ws, hs, finger seg, radial, thumb seg, radial]
  const HD = [[6, 4, 3, 3, 3, 3], [8, 6, 5, 4, 5, 4], [10, 8, 6, 5, 7, 5], [16, 12, 10, 8, 11, 8], [20, 16, 12, 9, 13, 10]][clamp(lv | 0, 0, 4)];
  const H = HAND.hole;
  const outwardFromGrip = (P, o) => { o.set(P.x - H.x * sx, P.y - H.y, 0); if (o.lengthSq() < 1e-10) o.set(sx, 0, 0); o.normalize(); };
  // ---- palm block
  const palm = superEllipsoid(0.0136, 0.0298, 0.0268, 0.72, 0.78, HD[0], HD[1], (q) => {
    const yr = q.y;
    const tw = sstep(0.0, 0.03, yr);
    q.z *= 1 - 0.22 * tw; q.x *= 1 - 0.12 * tw; q.z *= 1 + 0.06 * sstep(0, -0.025, yr);
    if (q.x < 0) {
      q.x -= 0.0036 * gauss(q.z - 0.0145, 0.011) * gauss(yr - 0.004, 0.016);   // thenar pad
      q.x -= 0.0022 * gauss(q.z + 0.016, 0.01) * gauss(yr + 0.002, 0.016);     // hypothenar pad
      q.x += 0.0026 * gauss(q.z, 0.011) * gauss(yr + 0.006, 0.011);            // cupped centre
    } else {
      let kb = 0; for (const f of FINGERS) kb += gauss(q.z - f[1][2], 0.0055);
      q.x += 0.0024 * kb * gauss(yr + 0.0235, 0.0068);                           // knuckles
      q.x += 0.001 * gauss(q.z, 0.02) * gauss(yr - 0.01, 0.015);                  // back-of-hand dome
    }
  });
  palm.translate(0.0022, -0.0302, 0.0015);
  if (sx < 0) mirrorX(palm);
  parts.push({ geo: palm, weights: () => [['hand' + s, 1]], ex: 0 });
  // ---- fingers
  for (const [fn, mcp, r, lens] of FINGERS) {
    const ch = fingerChain(mcp, r, lens).map((p) => new V3(p.x * sx, p.y, p.z));
    const base = ch[0].clone().add(new V3(0.0015 * sx, 0.012, 0));
    const pts = [base, ch[0], ch[1], ch[2], ch[3]];
    const seglen = [0.012, lens[0], lens[1], lens[2]];
    const tot = seglen.reduce((a, b) => a + b, 0);
    const tM = seglen[0] / tot, tP = (seglen[0] + lens[0]) / tot, tD = (seglen[0] + lens[0] + lens[1]) / tot;
    const sw = sweep(pts, {
      seg: HD[2], radial: HD[3], capSteps: lv >= 3 ? 3 : 2, capStart: false, curveType: 'centripetal',
      radius: (t) => r * (lerp(1.04, 0.86, sstep(tM, 1, t)) + 0.07 * gauss(t - tP, 0.05) + 0.04 * gauss(t - tD, 0.04)),
      flat: 0.9, outward: outwardFromGrip,
    });
    const tA = sw.t;
    parts.push({
      geo: sw.geo, ex: 0,
      weights: (p, i) => { const t = tA[i]; const w2 = sstep(tP - 0.05, tP + 0.05, t); const w1 = (1 - w2) * sstep(tM - 0.08, tM + 0.03, t); return [[fb(s, fn, 2), w2], [fb(s, fn, 1), w1], ['hand' + s, 1 - w1 - w2]]; },
    });
    // nail on the distal phalanx (dorsal side)
    const dirT = ch[3].clone().sub(ch[2]).normalize();
    const o = new V3(); outwardFromGrip(ch[2].clone().lerp(ch[3], 0.6), o);
    o.addScaledVector(dirT, -o.dot(dirT)).normalize();
    const zb = new V3().crossVectors(dirT, o).normalize();
    const nail = superEllipsoid(r * 0.6, lens[2] * 0.4, 0.0011, 0.5, 0.7, lv >= 3 ? 8 : 5, 3, (q) => { q.z -= 180 * (q.x * q.x); });
    // local: x across (zb), y along (dirT), z outward (o)
    const m = new THREE.Matrix4().makeBasis(zb, dirT, o);
    nail.applyMatrix4(m);
    nail.translate(...ch[2].clone().lerp(ch[3], 0.6).addScaledVector(o, r * 0.86).toArray());
    parts.push({ geo: nail, ex: 1, weights: () => [[fb(s, fn, 2), 1]] });
  }
  // ---- thumb
  {
    const tp = THUMB.map((p) => new V3(p[0] * sx, p[1], p[2]));
    const base = tp[0].clone().add(new V3(0.004 * sx, 0.006, -0.004));
    const pts = [base, ...tp];
    const L = [base.distanceTo(tp[0]), tp[0].distanceTo(tp[1]), tp[1].distanceTo(tp[2]), tp[2].distanceTo(tp[3])];
    const tot = L.reduce((a, b) => a + b, 0);
    const tC = L[0] / tot, tMp = (L[0] + L[1]) / tot, tI = (L[0] + L[1] + L[2]) / tot;
    const sw = sweep(pts, {
      seg: HD[4], radial: HD[5], capSteps: lv >= 3 ? 3 : 2, capStart: false,
      radius: (t) => (t < tMp ? lerp(0.0122, THUMB_R[0], sstep(0, tC, t)) * lerp(1, THUMB_R[1] / THUMB_R[0], sstep(tC, tMp, t)) : lerp(THUMB_R[1], THUMB_R[2] * 0.92, sstep(tMp, 1, t))) * (1 + 0.06 * gauss(t - tI, 0.05)),
      flat: 0.88, outward: outwardFromGrip,
    });
    const tA = sw.t;
    parts.push({ geo: sw.geo, ex: 0, weights: (p, i) => { const t = tA[i]; const w2 = sstep(tMp - 0.05, tMp + 0.05, t); const w1 = (1 - w2) * sstep(0, tC + 0.05, t); return [[fb(s, 'thumb', 2), w2], [fb(s, 'thumb', 1), w1], ['hand' + s, 1 - w1 - w2]]; } });
    const dirT = tp[3].clone().sub(tp[2]).normalize();
    const o = new V3(); outwardFromGrip(tp[2].clone().lerp(tp[3], 0.6), o); o.addScaledVector(dirT, -o.dot(dirT)).normalize();
    const zb = new V3().crossVectors(dirT, o).normalize();
    const nail = superEllipsoid(THUMB_R[2] * 0.64, 0.0062, 0.0011, 0.5, 0.7, 6, 3, (q) => { q.z -= 160 * (q.x * q.x); });
    nail.applyMatrix4(new THREE.Matrix4().makeBasis(zb, dirT, o));
    nail.translate(...tp[2].clone().lerp(tp[3], 0.62).addScaledVector(o, THUMB_R[2] * 0.86).toArray());
    parts.push({ geo: nail, ex: 1, weights: () => [[fb(s, 'thumb', 2), 1]] });
  }
  return parts;
}

function buildSkin(lod = 'hero') {
  const B = new Builder();
  // ---- head, face, mouth cavity, teeth, tongue, ears, neck (character-face.js)
  addHeadSkin(B, lod);
  // ---- arms + legs (character-outfit.js) + hands (grip contract, below)
  addBodyLimbs(B, bodyLevel(lod));
  for (const [s, sx] of [['L', 1], ['R', -1]]) {
    const wr = R['hand' + s];
    for (const part of handParts(s, sx, bodyLevel(lod))) {
      part.geo.translate(wr.x, wr.y, wr.z);
      B.add(part.geo, { v3: [0, 0, 0], ex: part.ex, weights: part.weights });
    }
  }
  return B.build('aEx', 'aHead');
}

// ------------------------------------------------------------------------------------------------
// Eyes: socketed eyeball caps in eye space (character-face.js); the eye material turns them for the gaze
// ------------------------------------------------------------------------------------------------
function buildEyes(lod = 'hero') {
  const B = new Builder();
  addEyeballs(B, lod);
  return B.build('aEx', 'aEyeS');
}

// ------------------------------------------------------------------------------------------------
// Kid: cloth — built by character-outfit.js (tee, shorts, socks, sneakers, tank + harness), one skinned mesh
// ------------------------------------------------------------------------------------------------
export const TANK = { center: new V3(0, 0.848, -0.176), tilt: -0.1, r: 0.066, h: 0.19, bone: 'tank' };
// body probes for accessories (the garments themselves live in character-outfit.js)
const ARM_RADIUS = (t) => armRadiusAt(t);
const ARM_FLAT = (t) => armFlatAt(t);
const teePoint = (th, y, off, out) => teeSurfacePoint(th, y, off, out);

/** Right-handed placement basis for a small part: X, Y given (Y is orthogonalised), Z = X × Y. */
function placeBasis(geo, X, Y, at) {
  const x = X.clone().normalize(); const y = Y.clone().addScaledVector(x, -Y.dot(x)).normalize(); const z = new V3().crossVectors(x, y);
  geo.applyMatrix4(new THREE.Matrix4().makeBasis(x, y, z).setPosition(at));
  return geo;
}
function revolve(profile, seg) {
  const rows = profile.map(([r, y]) => { const row = []; for (let i = 0; i < seg; i++) { const th = (i / seg) * TAU; row.push(new V3(r * Math.sin(th), y, r * Math.cos(th))); } return row; });
  const y0 = Math.min(...profile.map((p) => p[1])), y1 = Math.max(...profile.map((p) => p[1]));
  return gridGeo(rows, { wrapU: true, outward: (p, out) => out.set(0, p.y, 0), uv: (i, j) => [i / seg, (profile[j][1] - y0) / Math.max(1e-6, y1 - y0)] });
}

function buildCloth(lod = 'hero') {
  const B = new Builder();
  addOutfit(B, bodyLevel(lod));
  return B.build('aEx', 'aCloth');
}

// ------------------------------------------------------------------------------------------------
// Hair styles (team-colour glossy tentacles).
// Control points: S(az, el, extra) hugs the scalp; IN(az, el) is buried inside the cap (hidden root);
// O(az, el, off) is offset from the bare head surface; [x, y, z] are head-relative free points.
// ------------------------------------------------------------------------------------------------
const S = (az, el, extra = 0) => ['s', az, el, extra];
const IN = (az, el) => ['in', az, el];
const O = (az, el, off) => ['o', az, el, off];
const mirror = (pts) => pts.map((p) => (p[0] === 's' || p[0] === 'in' || p[0] === 'o' ? [p[0], -p[1], ...p.slice(2)] : [-p[0], p[1], p[2]]));

/** Bun coil: a spherical helix winding up and over a ball of radius Rb centred at C (head-relative), around `axis`. */
function knotCoil(C, Rb, p0, axis = [0, 1, 0]) {
  const q = new THREE.Quaternion().setFromUnitVectors(new V3(0, 1, 0), new V3(...axis).normalize());
  const P = (x, y, z) => { const v = new V3(x, y, z).applyQuaternion(q); return [C[0] + v.x, C[1] + v.y, C[2] + v.z]; };
  const pts = [P(0.022 * Math.sin(p0), -0.064, 0.022 * Math.cos(p0))]; // root, buried in the scalp under the bun
  for (let k = 0; k <= 10; k++) {
    const u = k / 10, th = lerp(2.3, 0.42, u), ph = p0 + u * TAU * 1.55;
    pts.push(P(Rb * Math.sin(th) * Math.sin(ph), Rb * Math.cos(th), Rb * Math.sin(th) * Math.cos(ph)));
  }
  return { pts, r0: Rb * 0.75, r1: Rb * 0.6, taper: 1.5, flat: 1.25, K: 3.0, G: 0.12, suck: false, curl: 0, twist: 0, noClub: true };
}

// sculpted fringe locks shared by the Pony style and its under-hat variant (see strandSpec → locks)
const PONY_LOCKS = [{ d: 0.03, h: -0.003, r: 0.66, len: 0.7, curl: 1.0 }, { d: -0.033, h: 0.006, r: 0.7, len: 0.88, curl: 0.4 }];
const STYLES = [
  { // 0 — "Tide": long swept-back tentacles + face-framing locks + a swept bang
    name: 'Tide',
    strands: (() => {
      const backL = { pts: [IN(2.55, 0.9), S(2.65, 0.45), S(2.78, -0.1), [0.05, -0.17, -0.212], [0.06, -0.218, -0.222], [0.074, -0.24, -0.238]], r0: 0.058, r1: 0.018, flat: 0.5, K: 1, G: 1, suck: true, curl: 0.9 };
      const outL = { pts: [IN(2.0, 0.8), S(2.08, 0.35), S(2.18, -0.15), [0.158, -0.13, -0.11], [0.185, -0.175, -0.112], [0.2, -0.192, -0.128]], r0: 0.052, r1: 0.016, flat: 0.5, K: 1.2, G: 0.9, suck: true, curl: 1.0 };
      const lockL = { pts: [IN(1.15, 0.85), S(1.25, 0.42), S(1.34, 0.08), [0.18, -0.07, 0.03], [0.176, -0.118, 0.055], [0.165, -0.14, 0.075]], r0: 0.042, r1: 0.015, flat: 0.5, K: 1.5, G: 0.8, suck: false, curl: 0.7 };
      return [
        backL, { ...backL, pts: mirror(backL.pts).map((p, i) => (i === 5 ? [-0.07, -0.232, -0.236] : p)) },
        outL, { ...outL, pts: mirror(outL.pts) },
        lockL, { ...lockL, pts: mirror(lockL.pts) },
        { pts: [IN(0.95, 1.12), S(0.45, 0.94, 0.002), S(-0.1, 0.77, 0.003), S(-0.6, 0.63, 0.004), S(-1.0, 0.47, 0.004), [-0.192, 0.05, 0.068]], r0: 0.048, r1: 0.017, flat: 0.4, K: 2.4, G: 0.4, suck: false, curl: 0.5,
          rMain: 0.78, locks: [{ d: -0.032, h: -0.003, r: 0.66, len: 0.7, curl: 1.0 }, { d: 0.034, h: 0.006, r: 0.7, len: 0.88, curl: 0.4 }] },
      ];
    })(),
    gear: 'wristbands',
  },
  { // 1 — "Spike": short upswept spikes + a front quiff
    name: 'Spike',
    strands: (() => {
      const sideL = { pts: [IN(0.85, 0.95), [0.095, 0.205, 0.0], [0.155, 0.215, -0.07], [0.195, 0.185, -0.13], [0.215, 0.14, -0.16]], r0: 0.052, r1: 0.017, flat: 0.52, K: 2.2, G: 0.3, suck: true, curl: 0.8 };
      const backL = { pts: [IN(2.25, 0.75), S(2.38, 0.42), [0.14, 0.03, -0.205], [0.155, -0.035, -0.235], [0.175, -0.06, -0.265]], r0: 0.05, r1: 0.017, flat: 0.52, K: 1.8, G: 0.6, suck: true, curl: 1.0 };
      return [
        { pts: [IN(0.15, 1.05), [0.0, 0.212, -0.02], [0.0, 0.245, -0.1], [0.0, 0.225, -0.18], [0.0, 0.18, -0.222]], r0: 0.056, r1: 0.018, flat: 0.52, K: 2.2, G: 0.3, suck: true, curl: 1.0 },
        sideL, { ...sideL, pts: mirror(sideL.pts) },
        backL, { ...backL, pts: mirror(backL.pts) },
        { pts: [IN(3.14, 0.55), S(3.14, 0.05), [0.0, -0.11, -0.205], [0.0, -0.155, -0.215], [0.0, -0.175, -0.245]], r0: 0.05, r1: 0.018, flat: 0.52, K: 1.6, G: 0.7, suck: true, curl: 0.9 },
        { pts: [IN(0.3, 1.0), [0.02, 0.2, 0.12], [-0.04, 0.218, 0.172], [-0.1, 0.19, 0.198], [-0.135, 0.152, 0.2]], r0: 0.048, r1: 0.017, flat: 0.48, K: 2.8, G: 0.2, suck: false, curl: 0.8,
          rMain: 0.82, locks: [{ d: -0.03, h: -0.006, r: 0.68, len: 0.7, curl: 1.0 }, { d: 0.03, h: -0.002, r: 0.66, len: 0.8, curl: 0.7 }] },
      ];
    })(),
    // under a hat the spikes are squashed flat: short flicks kick out below the rim at the back instead
    underHat: {
      strands: (() => {
        const flick = { pts: [IN(2.3, 0.62), S(2.4, 0.16), [0.134, -0.046, -0.2], [0.148, -0.09, -0.228], [0.16, -0.112, -0.25]], r0: 0.046, r1: 0.017, flat: 0.52, K: 1.8, G: 0.6, suck: true, curl: 0.7 };
        return [flick, { ...flick, pts: mirror(flick.pts) },
          { pts: [IN(3.14, 0.55), S(3.14, 0.05), [0.0, -0.11, -0.205], [0.0, -0.155, -0.215], [0.0, -0.175, -0.245]], r0: 0.05, r1: 0.018, flat: 0.52, K: 1.6, G: 0.7, suck: true, curl: 0.9 }];
      })(),
    },
    gear: 'headphones',
  },
  { // 2 — "Twin": two long tied tails + split bangs
    name: 'Twin',
    strands: (() => {
      const tailL = { pts: [IN(1.95, 0.55), S(2.0, 0.35), [0.2, 0.04, -0.105], [0.235, -0.07, -0.112], [0.242, -0.2, -0.096], [0.228, -0.305, -0.07], [0.245, -0.345, -0.035]], r0: 0.056, r1: 0.024, flat: 0.55, K: 0.85, G: 1.1, suck: true, curl: 1.1 };
      const bangL = { pts: [IN(0.55, 1.15), S(0.38, 0.9, 0.002), S(0.58, 0.72, 0.003), S(0.9, 0.56, 0.004), [0.184, 0.06, 0.078]], r0: 0.045, r1: 0.017, flat: 0.4, K: 2.6, G: 0.3, suck: false, curl: 0.6,
          rMain: 0.8, locks: [{ d: 0.03, h: -0.003, r: 0.66, len: 0.66, curl: 0.95 }, { d: -0.03, h: 0.005, r: 0.68, len: 0.9, curl: 0.4 }] };
      return [
        tailL, { ...tailL, pts: mirror(tailL.pts) },
        { pts: [IN(3.14, 0.9), S(3.14, 0.3), S(3.14, -0.25), [0.0, -0.14, -0.205], [0.0, -0.18, -0.232]], r0: 0.05, r1: 0.02, flat: 0.52, K: 1.4, G: 0.8, suck: true, curl: 0.9 },
        bangL, { ...bangL, pts: mirror(bangL.pts) },
      ];
    })(),
    ties: [[0.2, 0.04, -0.105, 1], [-0.2, 0.04, -0.105, -1]],
    // under a hat the tails are tied lower, just below the rim, so they hang from under it
    underHat: {
      strands: (() => {
        const tailL = { pts: [IN(1.95, 0.42), S(2.0, 0.08), [0.19, -0.03, -0.118], [0.226, -0.13, -0.116], [0.234, -0.235, -0.097], [0.222, -0.318, -0.07], [0.238, -0.35, -0.038]], r0: 0.054, r1: 0.023, flat: 0.55, K: 0.85, G: 1.1, suck: true, curl: 1.1 };
        const bangL = { pts: [IN(0.55, 1.15), S(0.38, 0.9, 0.002), S(0.58, 0.72, 0.003), S(0.9, 0.56, 0.004), [0.184, 0.06, 0.078]], r0: 0.045, r1: 0.017, flat: 0.4, K: 2.6, G: 0.3, suck: false, curl: 0.6,
          rMain: 0.8, locks: [{ d: 0.03, h: -0.003, r: 0.66, len: 0.66, curl: 0.95 }, { d: -0.03, h: 0.005, r: 0.68, len: 0.9, curl: 0.4 }] };
        return [tailL, { ...tailL, pts: mirror(tailL.pts) },
          { pts: [IN(3.14, 0.9), S(3.14, 0.3), S(3.14, -0.25), [0.0, -0.14, -0.205], [0.0, -0.18, -0.232]], r0: 0.05, r1: 0.02, flat: 0.52, K: 1.4, G: 0.8, suck: true, curl: 0.9 },
          bangL, { ...bangL, pts: mirror(bangL.pts) }];
      })(),
      ties: [[0.19, -0.03, -0.118, 1], [-0.19, -0.03, -0.118, -1]],
    },
    gear: 'twin',
  },
  { // 3 — "Bob": rounded bob that curls in at the jaw + side-swept bang
    name: 'Bob',
    strands: (() => {
      const mk = (az, len, r0, suck) => ({ pts: [IN(az, 0.95), S(az * 1.03, 0.45), S(az * 1.05, 0.0), O(az * 1.06, -0.32 * len, 0.05), O(az * 1.02, -0.52 * len, 0.028)], r0, r1: 0.024, flat: 0.52, K: 1.4, G: 0.85, suck, curl: -0.9 });
      const a = mk(1.3, 1.0, 0.05, false), b = mk(2.0, 1.05, 0.054, true), c = mk(2.7, 1.1, 0.056, true);
      return [a, { ...a, pts: mirror(a.pts) }, b, { ...b, pts: mirror(b.pts) }, c, { ...c, pts: mirror(c.pts) },
        { pts: [IN(-0.75, 1.15), S(-0.2, 0.9, 0.002), S(0.3, 0.75, 0.003), S(0.78, 0.6, 0.004), S(1.1, 0.44, 0.004), [0.196, 0.005, 0.058]], r0: 0.047, r1: 0.02, flat: 0.4, K: 2.4, G: 0.4, suck: false, curl: 0.5,
          rMain: 0.78, locks: [{ d: 0.032, h: -0.003, r: 0.66, len: 0.68, curl: 1.0 }, { d: -0.034, h: 0.006, r: 0.7, len: 0.86, curl: 0.4 }] }];
    })(),
    gear: 'bob',
  },
  { // 4 — "Pony": high fountain ponytail — a thick three-tentacle bundle gathered at the back of the crown, swept fringe
    name: 'Pony',
    strands: (() => {
      const tail = { pts: [[0, 0.12, -0.085], [0, 0.172, -0.13], [0, 0.235, -0.175], [0, 0.262, -0.235], [0, 0.235, -0.3], [0, 0.165, -0.345], [0, 0.07, -0.36], [0, -0.03, -0.345], [0, -0.11, -0.31]], r0: 0.066, r1: 0.03, taper: 1.7, flat: 1.25, K: 0.95, G: 1.05, suck: true, curl: 0.85 };
      const flank = { pts: [[0.012, 0.12, -0.085], [0.02, 0.17, -0.13], [0.04, 0.226, -0.172], [0.054, 0.246, -0.23], [0.062, 0.212, -0.29], [0.068, 0.138, -0.326], [0.074, 0.05, -0.332], [0.084, -0.03, -0.31]], r0: 0.048, r1: 0.022, taper: 1.4, flat: 1.1, K: 1.05, G: 1.0, suck: true, curl: 1.0 };
      const lock = { pts: [IN(1.06, 0.82), S(1.17, 0.42), S(1.25, 0.08), [0.183, -0.072, 0.05], [0.177, -0.122, 0.064]], r0: 0.036, r1: 0.014, flat: 0.5, K: 1.8, G: 0.7, suck: false, curl: 0.6 };
      return [
        tail, flank, { ...flank, pts: mirror(flank.pts) }, lock, { ...lock, pts: mirror(lock.pts) },
        { pts: [IN(-0.9, 1.12), S(-0.5, 0.95, 0.002), S(-0.05, 0.8, 0.003), S(0.42, 0.66, 0.004), S(0.8, 0.52, 0.004), [0.18, 0.058, 0.096]], r0: 0.046, r1: 0.018, flat: 0.4, K: 2.4, G: 0.4, suck: false, curl: 0.55, rMain: 0.8, locks: PONY_LOCKS },
      ];
    })(),
    cap: { pole: [0, 0.8, -0.6] },
    tie: { at: [0, 0.172, -0.13] },
    // under a hat: a low ponytail tied at the nape, below the rim
    underHat: {
      strands: [
        { pts: [IN(3.14, 0.3), S(3.14, -0.06), [0, -0.05, -0.2], [0, -0.1, -0.236], [0, -0.148, -0.254], [0, -0.172, -0.262]], r0: 0.06, r1: 0.028, taper: 1.6, flat: 1.2, K: 1.0, G: 1.0, suck: true, curl: 0.8 },
        { pts: [IN(1.06, 0.82), S(1.17, 0.42), S(1.25, 0.08), [0.183, -0.072, 0.05], [0.177, -0.122, 0.064]], r0: 0.036, r1: 0.014, flat: 0.5, K: 1.8, G: 0.7, suck: false, curl: 0.6 },
        { pts: mirror([IN(1.06, 0.82), S(1.17, 0.42), S(1.25, 0.08), [0.183, -0.072, 0.05], [0.177, -0.122, 0.064]]), r0: 0.036, r1: 0.014, flat: 0.5, K: 1.8, G: 0.7, suck: false, curl: 0.6 },
        { pts: [IN(-0.9, 1.12), S(-0.5, 0.95, 0.002), S(-0.05, 0.8, 0.003), S(0.42, 0.66, 0.004), S(0.8, 0.52, 0.004), [0.18, 0.058, 0.096]], r0: 0.046, r1: 0.018, flat: 0.4, K: 2.4, G: 0.4, suck: false, curl: 0.55, rMain: 0.8, locks: PONY_LOCKS },
      ],
      tie: { at: [0, -0.05, -0.2] },
    },
    gear: 'pony',
  },
  { // 5 — "Crest": a tall mohawk of overlapping tentacle flames along the midline, clean sides
    name: 'Crest',
    strands: (() => {
      const fin = (root, pts, r0, K = 2.4, curl = 0.9) => ({ pts: [root, ...pts], r0, r1: 0.019, taper: 1.15, flat: 1.25, K, G: 0.32, suck: false, curl, out: 'x', twist: 0 });
      return [
        fin(IN(0, 1.0), [[0, 0.212, 0.084], [0, 0.262, 0.046], [0, 0.285, -0.014], [0, 0.272, -0.07]], 0.056),
        fin(IN(0, 1.4), [[0, 0.226, 0.014], [0, 0.262, -0.036], [0, 0.265, -0.096], [0, 0.24, -0.14]], 0.058),
        fin(IN(3.14, 1.18), [[0, 0.206, -0.07], [0, 0.236, -0.12], [0, 0.226, -0.175], [0, 0.19, -0.21]], 0.056),
        fin(IN(3.14, 0.85), [[0, 0.16, -0.126], [0, 0.18, -0.18], [0, 0.156, -0.23], [0, 0.11, -0.256]], 0.052, 2.0),
        fin(IN(3.14, 0.5), [[0, 0.1, -0.172], [0, 0.104, -0.226], [0, 0.062, -0.256], [0, 0.0, -0.262]], 0.047, 1.6, 0.8),
      ];
    })(),
    // under a hat the crest is pressed flat: only its tail shows, kicking out below the rim at the nape
    underHat: {
      strands: [
        { pts: [IN(3.14, 0.4), S(3.14, -0.08), [0, -0.1, -0.205], [0, -0.13, -0.236], [0, -0.14, -0.262]], r0: 0.05, r1: 0.019, taper: 1.15, flat: 1.25, K: 1.6, G: 0.6, suck: false, curl: 0.9, out: 'x', twist: 0 },
      ],
    },
    gear: 'crest',
  },
  { // 6 — "Knot": coiled top-knot bun with two sprouting tentacle ends, long face-framing side tentacles
    name: 'Knot',
    strands: (() => {
      const C = [0, 0.214, -0.036], Rb = 0.04;
      const sprout = { pts: [[0.004, 0.238, -0.036], [0.012, 0.276, -0.04], [0.034, 0.306, -0.068], [0.068, 0.302, -0.108], [0.09, 0.272, -0.134]], r0: 0.036, r1: 0.017, flat: 0.7, K: 2.0, G: 0.45, suck: true, curl: 0.9 };
      const side = { pts: [IN(1.02, 0.86), S(1.16, 0.44), S(1.26, 0.08), [0.186, -0.075, 0.046], [0.182, -0.132, 0.058], [0.172, -0.16, 0.072]], r0: 0.042, r1: 0.017, flat: 0.52, K: 1.5, G: 0.8, suck: true, curl: 0.75 };
      return [
        knotCoil(C, Rb, 0.3), knotCoil(C, Rb, 0.3 + Math.PI),
        sprout, { ...sprout, pts: mirror(sprout.pts).map((p, i) => (i === 4 ? [-0.094, 0.262, -0.128] : p)) },
        side, { ...side, pts: mirror(side.pts) },
        { pts: [IN(3.14, 0.45), S(3.14, 0.02), [0, -0.118, -0.196], [0, -0.156, -0.212]], r0: 0.04, r1: 0.017, flat: 0.55, K: 1.6, G: 0.7, suck: true, curl: 0.8 },
      ];
    })(),
    knot: { at: [0, 0.214, -0.036], r: 0.04 },
    // under a hat: a low bun on the nape (axis pointing back and down), face-framing tentacles kept
    underHat: {
      strands: (() => {
        const C = [0, -0.075, -0.212], ax = [0, -0.34, -0.94];
        const side = { pts: [IN(1.02, 0.86), S(1.16, 0.44), S(1.26, 0.08), [0.186, -0.075, 0.046], [0.182, -0.132, 0.058], [0.172, -0.16, 0.072]], r0: 0.042, r1: 0.017, flat: 0.52, K: 1.5, G: 0.8, suck: true, curl: 0.75 };
        return [knotCoil(C, 0.034, 0.3, ax), knotCoil(C, 0.034, 0.3 + Math.PI, ax), side, { ...side, pts: mirror(side.pts) }];
      })(),
      knot: { at: [0, -0.075, -0.212], r: 0.034, axis: [0, -0.34, -0.94] },
    },
    gear: 'knot',
  },
  { // 7 — "Swoop": asymmetric side part — a heavy swoop across the brow and down the right side, short tucked left
    name: 'Swoop',
    strands: (() => [
      { pts: [IN(0.78, 1.08), S(0.42, 0.95, 0.004), S(-0.02, 0.8, 0.006), S(-0.46, 0.66, 0.006), S(-0.86, 0.5, 0.004), O(-1.1, 0.14, 0.048), O(-1.14, -0.2, 0.05), [-0.168, -0.2, 0.068]], r0: 0.058, r1: 0.022, flat: 0.44, K: 1.5, G: 0.7, suck: false, curl: 0.7,
        rMain: 0.8, locks: [{ d: -0.032, h: -0.003, r: 0.64, len: 0.5, curl: 1.0 }, { d: 0.034, h: 0.006, r: 0.7, len: 0.78, curl: 0.5 }] },
      { pts: [IN(0.95, 1.3), S(0.35, 1.2), S(-0.35, 1.0), S(-0.95, 0.72), S(-1.25, 0.36), O(-1.34, 0.0, 0.052), [-0.18, -0.17, 0.012], [-0.17, -0.225, 0.02]], r0: 0.056, r1: 0.022, flat: 0.5, K: 1.2, G: 0.9, suck: true, curl: 0.8 },
      { pts: [IN(1.5, 1.35), S(-1.8, 1.2), S(-2.05, 0.7), S(-2.12, 0.2), [-0.15, -0.1, -0.13], [-0.148, -0.19, -0.14]], r0: 0.052, r1: 0.02, flat: 0.52, K: 1.2, G: 0.9, suck: true, curl: 0.8 },
      { pts: [IN(-2.5, 0.95), S(-2.66, 0.44), S(-2.8, -0.06), [-0.062, -0.16, -0.2], [-0.07, -0.236, -0.214]], r0: 0.05, r1: 0.019, flat: 0.52, K: 1.3, G: 0.9, suck: true, curl: 0.85 },
      { pts: [IN(1.35, 0.95), S(1.62, 0.52), S(1.9, 0.2), [0.172, -0.02, -0.108], [0.15, -0.055, -0.14]], r0: 0.04, r1: 0.016, flat: 0.52, K: 2.0, G: 0.5, suck: true, curl: 1.0 },
      { pts: [IN(2.62, 0.85), S(2.76, 0.4), S(2.86, -0.02), [0.05, -0.1, -0.2]], r0: 0.044, r1: 0.017, flat: 0.52, K: 1.8, G: 0.6, suck: true, curl: 1.0 },
    ])(),
    cap: { pole: [0.52, 0.8, 0.3] },
    gear: 'swoop',
  },
];
export const HAIR_STYLE_NAMES = STYLES.map((s) => s.name);

function strandPoint(cp, r0, flat, out) {
  if (cp[0] === 's') { const [, az, el, extra = 0] = cp; return headSurf(az, el, capOffset(az, el) + r0 * flat * 0.42 + extra, out); }
  if (cp[0] === 'in') { const [, az, el] = cp; return headSurf(az, el, capOffset(az, el) - 0.012, out); }
  if (cp[0] === 'o') { const [, az, el, off] = cp; return headSurf(az, el, off, out); }
  return out.set(cp[0], cp[1], cp[2]).add(HEAD_C);
}

// gear encoding for the hair material: aTint = -2 - class (0 plastic, 1 metal, 2 fabric, 3 rubber);
// colour: literal rgb, or code (r = -1 team, -2 shirt, -3 strap, -4 shorts) × g
const GEAR = { plastic: -2, metal: -3, fabric: -4, rubber: -5 };
const gcol = (code, k = 1) => new THREE.Color(code, k, 0);

/** Style accessories, built into the hair mesh (per style, skinned to the full skeleton). */
function addGear(B, style, strandInfo, hatCtx = null, D = null) {
  const lo = !!D && D.lod === 'far';   // far tier: the accessories keep their shape at a fraction of the facets
  const kind = style.gear;
  const hidden = (p) => !!hatCtx && hatCtx.hidden(p); // accessories a hat covers are not built
  const hb = (si, k) => `hair${strandInfo[si].bi}_${k}`; // bone of a style strand (indices shift when a hat drops some)
  if (kind === 'wristbands') {
    for (const [s] of [['L'], ['R']]) {
      const el = R['fArm' + s], wr = R['hand' + s];
      const fd = wr.clone().sub(el).normalize();
      const side = new V3(1, 0, 0).addScaledVector(fd, -fd.x).normalize(), fw = new V3().crossVectors(fd, side).normalize();
      const nT = lo ? 10 : 20, c0 = wr.clone().addScaledVector(fd, -0.026);
      // follows the forearm's flattened wrist section (lateral axis is 0.84 × the radius)
      const ra = ARM_RADIUS(0.893) + 0.0004;
      const prof = [[-0.0105, 0.0006], [-0.0098, 0.0027], [-0.0082, 0.0036], [0.0082, 0.0036], [0.0098, 0.0027], [0.0105, 0.0006]];
      const rows = prof.map(([a, dr]) => { const row = []; for (let i = 0; i < nT; i++) { const th = (i / nT) * TAU; row.push(c0.clone().addScaledVector(fd, a).addScaledVector(side, (ra * ARM_FLAT(0.893) + dr) * Math.cos(th)).addScaledVector(fw, (ra + dr) * Math.sin(th))); } return row; });
      const g = gridGeo(rows, { wrapU: true, outward: (p, out) => { const k = p.clone().sub(c0).dot(fd); out.copy(c0).addScaledVector(fd, k); } });
      B.add(g, { ex: GEAR.fabric, color: (p) => { const k = p.clone().sub(c0).dot(fd); return Math.abs(k) < 0.0022 ? _c.setRGB(0.96, 0.96, 0.95) : gcol(-1, 1); }, bone: 'fArm' + s });
    }
  } else if (kind === 'headphones') {
    const tp = new V3();
    const cups = [];
    for (const sx of [1, -1]) {
      const c = teePoint(0.62 * sx, 0.964, 0.012, tp).clone();
      const n = new V3(c.x * 1.4, 0.55, c.z + 0.02).normalize();
      cups.push({ sx, c, n });
      const prof = [[0, -0.001], [0.021, -0.001], [0.0255, 0.0035], [0.026, 0.008], [0.0245, 0.0095], [0.0265, 0.011], [0.0268, 0.018], [0.0235, 0.0235], [0.012, 0.0262], [0, 0.0265]];
      const cg = lathe(prof, 12);
      const P = cg.attributes.position;
      alongAxis(cg, c, n.clone().negate());
      B.add(cg, {
        ex: (p, i) => (i < P.count && cgY(cg, i, c, n) < 0.0098 ? GEAR.fabric : GEAR.plastic),
        color: (p, i) => { const h = cgY(cg, i, c, n); const r = radial(cg, i, c, n); return h < 0.0098 ? _c.setRGB(0.1, 0.1, 0.12) : (h > 0.021 && r < 0.017 ? gcol(-1, 1) : gcol(-3, 1.15)); },
        weights: () => [['chest', 1]],
      });
    }
    // headband resting behind the neck
    const [L, Rr] = cups;
    const top = (cp) => cp.c.clone().addScaledVector(cp.n, 0.02);
    const pts = [top(L), new V3(0.064, 1.0, -0.012), new V3(0.045, 1.012, -0.05), new V3(0, 1.016, -0.064), new V3(-0.045, 1.012, -0.05), new V3(-0.064, 1.0, -0.012), top(Rr)];
    const sw = sweep(pts, { seg: 16, radial: 6, capSteps: 2, radius: () => 0.0062, flat: 0.45, outward: (P, o) => o.set(P.x, 0, P.z + 0.006).normalize() });
    B.add(sw.geo, { ex: GEAR.plastic, color: gcol(-3, 1.15), weights: (p) => { const w = sstep(-0.01, -0.05, p.z) * 0.6; return [['chest', 1 - w], ['neck', w]]; } });
    // kneepad on the right knee
    const kn = R.shinR;
    const pad = superEllipsoid(0.034, 0.043, 0.0105, 0.42, 0.5, 10, 8, (q) => { q.z -= 16 * q.x * q.x; });
    pad.translate(kn.x, kn.y + 0.006, kn.z + 0.052);
    B.add(pad, { ex: GEAR.plastic, color: gcol(-1, 1), weights: () => [['shinR', 0.65], ['thighR', 0.35]] });
    const padIn = superEllipsoid(0.02, 0.026, 0.004, 0.5, 0.5, 8, 5, (q) => { q.z -= 16 * q.x * q.x; });
    padIn.translate(kn.x, kn.y + 0.006, kn.z + 0.0628);
    B.add(padIn, { ex: GEAR.rubber, color: _c.setRGB(0.12, 0.12, 0.14), weights: () => [['shinR', 0.65], ['thighR', 0.35]] });
    for (const dy of [0.034, -0.028]) {
      const axisC = kn.clone().add(new V3(0, dy, 0));
      const r0 = 0.0435 - (dy < 0 ? 0.004 : 0);
      const prof = [[-0.0055, r0], [-0.0045, r0 + 0.0028], [0.0045, r0 + 0.0028], [0.0055, r0]];
      const rows = prof.map(([a, r]) => Array.from({ length: 14 }, (_, i) => { const th = (i / 14) * TAU; return axisC.clone().add(new V3(r * Math.sin(th), a, r * 0.96 * Math.cos(th) + 0.004)); }));
      const g = gridGeo(rows, { wrapU: true, outward: (p, out) => out.set(axisC.x, p.y, axisC.z + 0.004) });
      B.add(g, { ex: GEAR.fabric, color: _c.setRGB(0.13, 0.13, 0.15), weights: () => [[dy > 0 ? 'thighR' : 'shinR', 0.75], [dy > 0 ? 'shinR' : 'thighR', 0.25]] });
    }
  } else if (kind === 'twin') {
    // bobble ties at the tail roots
    for (const tie of style.ties || []) {
      const [x, y, z, sx] = tie;
      const si = sx > 0 ? 0 : 1;
      const info = strandInfo[si], at = new V3(x, y, z).add(HEAD_C);
      if (!info || hidden(at)) continue;
      // elastic band fitted to the flattened tail section where it is tied (so it grips, never floats or sinks)
      const t = closestT(info.sw.curve, at), smp = info.sw.sample(t), sec = info.section(t);
      const Rb = sec.r * 0.97 + 0.0065, Ro = sec.r * sec.flat * 1.12 + 0.0065, tube = 0.0075;
      const g = torus(Rb, tube, lo ? 5 : 10, lo ? 14 : 36); g.rotateX(Math.PI / 2); g.scale(Ro / Rb, 1, 1); g.rotateY(sec.tw); g.computeVertexNormals();
      placeBasis(g, smp.o, smp.T, smp.P);
      B.add(g, { ex: GEAR.fabric, color: gcol(-2, 1.0), bone: hb(si, 0) });
      const bead = superEllipsoid(0.0135, 0.0135, 0.0135, 1, 1, lo ? 8 : 14, lo ? 6 : 10);
      const ot = smp.o.clone().multiplyScalar(Math.cos(sec.tw)).addScaledVector(smp.b, Math.sin(sec.tw));
      const bp = smp.P.clone().addScaledVector(ot, Ro + 0.011);
      bead.translate(bp.x, bp.y, bp.z);
      B.add(bead, { ex: GEAR.plastic, color: gcol(-1, 1.18), bone: hb(si, 0) });
    }
    // star clip on the left bang
    const info = strandInfo[3];
    const smp = info && info.sample(0.45);
    if (smp && !hidden(smp.P)) {
      const sh = new THREE.Shape();
      for (let k = 0; k < 10; k++) { const a = Math.PI / 2 + (k / 10) * TAU; const r = k % 2 ? 0.0068 : 0.0155; const px = Math.cos(a) * r, py = Math.sin(a) * r; if (k === 0) sh.moveTo(px, py); else sh.lineTo(px, py); }
      const st = finalize(new THREE.ExtrudeGeometry(sh, { depth: 0.0026, bevelEnabled: true, bevelThickness: 0.0012, bevelSize: 0.0012, bevelSegments: 2 }));
      const up = new V3(0, 1, 0);
      placeBasis(st, new V3().crossVectors(up, smp.o).normalize(), up, smp.P.clone().addScaledVector(smp.o, smp.r * 0.52));
      B.add(st, { ex: GEAR.plastic, color: _c.setRGB(0.98, 0.94, 0.62), bone: hb(3, 1) });
    }
  } else if (kind === 'bob') {
    // twin-bar barrette on the side-swept bang
    const info = strandInfo[6];
    if (info) {
      for (const [t, k] of [[0.62, 0], [0.7, 1]]) {
        const smp = info.sample(t);
        if (!smp || hidden(smp.P) || (hatCtx && hatCtx.nearRim(smp.P, 0.12))) continue;
        const bar = superEllipsoid(0.0035, 0.017, 0.0022, 0.5, 0.6, 6, 8);
        const across = new V3().crossVectors(smp.T, smp.o).normalize();
        placeBasis(bar, smp.T, across, smp.P.clone().addScaledVector(smp.o, smp.r * 0.44));
        B.add(bar, { ex: GEAR.metal, color: k ? _c.setRGB(0.96, 0.8, 0.46) : gcol(-1, 1), bone: hb(6, 1) });
      }
    }
    // carabiner + squid charm on the left hip, under the tee hem
    const c0 = new V3(0.118, 0.683, 0.012);
    const ring = torus(0.0105, 0.0019, 5, 16); ring.scale(1, 1.45, 1); ring.rotateY(Math.PI / 2 - 0.25); ring.translate(c0.x, c0.y, c0.z);
    B.add(ring, { ex: GEAR.metal, color: gcol(-1, 1), bone: 'hips' });
    const gate = superEllipsoid(0.0016, 0.009, 0.0016, 0.8, 0.8, 4, 4); gate.translate(c0.x + 0.0012, c0.y, c0.z + 0.0085);
    B.add(gate, { ex: GEAR.metal, color: _c.setRGB(0.8, 0.82, 0.86), bone: 'hips' });
    const charm = superEllipsoid(0.0078, 0.011, 0.0055, 0.9, 0.9, 10, 8, (q) => { if (q.y > 0) { q.x *= 1 - 0.55 * (q.y / 0.011); q.z *= 1 - 0.3 * (q.y / 0.011); } });
    charm.translate(c0.x + 0.001, c0.y - 0.031, c0.z + 0.001);
    B.add(charm, { ex: GEAR.plastic, color: gcol(-1, 1.12), bone: 'hips' });
    for (const sx of [1, -1]) { const e = superEllipsoid(0.0016, 0.0019, 0.001, 1, 1, 6, 4); e.translate(c0.x + 0.0072, c0.y - 0.032, c0.z + 0.001 + 0.0032 * sx); B.add(e, { ex: GEAR.plastic, color: _c.setRGB(0.02, 0.02, 0.03), bone: 'hips' }); }
  } else if (kind === 'pony') {
    // chunky ruffled scrunchie gathering the tail (rides on the tail's root bone so the tail never slides out of it)
    const info = strandInfo[0];
    const at = style.tie && new V3(...style.tie.at).add(HEAD_C);
    if (info && at && !hidden(at)) {
      const t = closestT(info.sw.curve, at);
      const smp = info.sw.sample(t);
      const R0 = smp.r * 0.98 + 0.004;
      const g = ruffledRing(R0, 0.0135, 13, 0.0032, 10, 44);
      placeBasis(g, smp.o, smp.T, smp.P);
      B.add(g, { ex: GEAR.fabric, color: gcol(-2, 1.0), bone: hb(0, 0) });
      // a small team-ink bead knotted on the scrunchie
      const bead = superEllipsoid(0.0118, 0.0118, 0.0118, 1, 1, 12, 8);
      const bp = smp.P.clone().addScaledVector(smp.o, R0 + 0.012).addScaledVector(smp.b, 0.006);
      bead.translate(bp.x, bp.y, bp.z);
      B.add(bead, { ex: GEAR.plastic, color: gcol(-1, 1.18), bone: hb(0, 0) });
    }
  } else if (kind === 'crest') {
    // two small hoops through the rim of the left ear (punk detail to go with the mohawk)
    const root = headSurf(EAR.az, EAR.el, -0.0085, new V3());
    const A = new V3(0.63, 0.43, -0.65).normalize();
    const F = new V3(0.46, 0.1, 0.88); F.addScaledVector(A, -F.dot(A)).normalize();
    const W = new V3().crossVectors(A, F).normalize();
    const up = W.y > 0 ? 1 : -1;
    for (const u of [0.42, 0.58]) {
      const w = 0.0268 * Math.pow(1 - u, 0.8) * sstep(-0.4, 0.28, u) + 0.0011;
      const e = root.clone().addScaledVector(A, u * 0.106).addScaledVector(F, -0.011 * u * u).addScaledVector(W, up * w);
      const ring = torus(0.0056, 0.0011, 5, 16);
      placeBasis(ring, W, F, e);
      B.add(ring, { ex: GEAR.metal, color: _c.setRGB(0.86, 0.87, 0.9), bone: 'earL' });
    }
  } else if (kind === 'knot') {
    // wrapped band at the base of the bun + a lacquered hairpin through it (both ride on the first coil's root)
    const K0 = new V3(...style.knot.at).add(HEAD_C), Rb = style.knot.r;
    if (!strandInfo[0] || hidden(K0)) return;
    const kb = hb(0, 0), ax = new V3(...(style.knot.axis || [0, 1, 0])).normalize();
    const kq = new THREE.Quaternion().setFromUnitVectors(new V3(0, 1, 0), ax);
    const kp = (x, y, z) => new V3(x, y, z).applyQuaternion(kq).add(K0);
    const band = torus(Rb * 1.08, 0.0082, 8, 28); band.rotateX(Math.PI / 2); band.scale(1, 1.3, 1);
    band.translate(0, -Rb * 0.62, 0); band.applyQuaternion(kq); band.translate(K0.x, K0.y, K0.z);
    B.add(band, { ex: GEAR.fabric, color: gcol(-3, 1.25), bone: kb });
    const a = kp(-0.088, 0.002, 0.014), b = kp(0.09, 0.024, -0.014);
    const pin = sweep([a, a.clone().lerp(b, 0.5).add(kp(0, 0.004, 0).sub(K0)), b], { seg: 6, radial: 6, capSteps: 2, radius: (t) => lerp(0.0036, 0.0027, t) });
    B.add(pin.geo, { ex: GEAR.plastic, color: _c.setRGB(0.06, 0.06, 0.08), bone: kb });
    const ball = superEllipsoid(0.011, 0.011, 0.011, 1, 1, 12, 8); const bc = b.clone().addScaledVector(b.clone().sub(a).normalize(), 0.007);
    ball.translate(bc.x, bc.y, bc.z);
    B.add(ball, { ex: GEAR.plastic, color: gcol(-1, 1.15), bone: kb });
  } else if (kind === 'swoop') {
    // two crossed enamel bobby pins holding the short side back (on the scalp above the left ear)
    for (const [a0, tilt] of [[0.0, 0.55], [0.018, -0.5]]) {
      const n = new V3(); const c = headSurf(1.2 + a0, 0.5, capOffset(1.2 + a0, 0.5) + 0.0045, new V3(), n);
      if (hidden(c)) continue;
      const along = new V3(0, 1, 0).addScaledVector(n, -n.y).normalize();
      const side = new V3().crossVectors(n, along).normalize();
      along.multiplyScalar(Math.cos(tilt)).addScaledVector(side, Math.sin(tilt)).normalize();
      const pinG = superEllipsoid(0.0034, 0.024, 0.0022, 0.45, 0.6, 6, 10, (q) => { q.z -= 3.2 * q.y * q.y; });
      placeBasis(pinG, new V3().crossVectors(along, n), along, c);
      B.add(pinG, { ex: GEAR.plastic, color: gcol(-1, 1.12), bone: 'head' });
    }
  }
}
/** Parameter of the curve point closest to `p` (coarse scan + refine). */
function closestT(curve, p) {
  let best = 0, bd = 1e9; const q = new V3();
  for (let k = 0; k <= 200; k++) { curve.getPointAt(k / 200, q); const d = q.distanceToSquared(p); if (d < bd) { bd = d; best = k / 200; } }
  return best;
}
/** Ruffled ring (scrunchie) around +Y: ring radius R, tube radius r with `n` puffs of amplitude `amp`. */
function ruffledRing(R, r, n, amp, rs, ts) {
  const g = new THREE.TorusGeometry(R, r, rs, ts);
  const P = g.attributes.position; const v = new V3(), c = new V3();
  for (let i = 0; i < P.count; i++) {
    v.fromBufferAttribute(P, i);
    const th = Math.atan2(v.y, v.x);
    c.set(Math.cos(th) * R, Math.sin(th) * R, 0);
    const d = v.clone().sub(c); const cp = d.dot(c) / (R * r); // cos(psi): +1 on the outer rim
    const puff = 1 + (amp / r) * Math.cos(th * n) * (0.55 + 0.45 * cp);
    d.multiplyScalar(puff); d.z *= 1.15;
    v.copy(c).add(d); P.setXYZ(i, v.x, v.y, v.z);
  }
  g.rotateX(-Math.PI / 2);
  return finalize(g);
}
// helpers for the headphone cup lathe (height along the cup axis / radius from it)
function cgY(g, i, c, n) { const P = g.attributes.position; return (P.getX(i) - c.x) * n.x + (P.getY(i) - c.y) * n.y + (P.getZ(i) - c.z) * n.z; }
function radial(g, i, c, n) { const P = g.attributes.position; const v = new V3(P.getX(i) - c.x, P.getY(i) - c.y, P.getZ(i) - c.z); const h = v.dot(n); return v.addScaledVector(n, -h).length(); }

/** Hairline-aligned scalp cap with a thick rolled lip. */
function buildCap(pole = null, hat = null, D = null) {
  const nA = D ? D.cap[0] : 48, K = D ? D.cap[1] : 10;
  const rowsSpec = [[-0.012, 'in'], [-0.006, 'lip0'], [0.0, 'lip1'], [0.016, 'lip2'], [0.042, 'full']];
  const azs = []; for (let i = 0; i < nA; i++) azs.push(-Math.PI + (i / nA) * TAU);
  const rows = [], meta = [];
  const pushRow = (fn) => { const r = [], m = []; for (const az of azs) { const [p, el, g] = fn(az); r.push(p); m.push([az, el, g]); } rows.push(r); meta.push(m); };
  const scal = (az) => 0.5 + 0.5 * Math.cos(az * 11 + 0.4);
  // sculpted bundle grooves (the same field the shader bumps, about the style's groove pole), modelled where the grid
  // resolves them: rounded tentacle bundles break the crown's silhouette instead of a painted-on smooth shell
  const qp = new THREE.Quaternion().setFromUnitVectors(new V3(...(pole || [0, 1, 0])).normalize(), new V3(0, 1, 0));
  const gd = 0.0019 * sstep(50, 90, nA), dd = new V3();
  const groove = (az, el) => {
    if (gd <= 0) return 0;
    dirAE(az, el, dd).applyQuaternion(qp);
    const a = Math.atan2(dd.x, dd.z), e = Math.asin(clamp(dd.y, -1, 1));
    return gd * Math.pow(1 - Math.abs(Math.sin(a * 9 + 0.35 * Math.sin(e * 5))), 4) * sstep(1.45, 0.9, e) * sstep(hairline(az) + 0.03, hairline(az) + 0.14, el);
  };
  for (const [del, kind] of rowsSpec) {
    pushRow((az) => {
      const k = scal(az);
      const h = hairline(az) + 0.016 * (1 - k) * (kind === 'full' ? 0.4 : 1), el = h + del, T = capOffset(az, el);
      const lip = 0.72 + 0.28 * k;
      const off = kind === 'in' ? -0.0048 : kind === 'lip0' ? -0.0006 : kind === 'lip1' ? T * 0.5 * lip : kind === 'lip2' ? T * 0.88 * lip : T * (0.9 + 0.1 * k) - groove(az, el);
      return [headSurf(az, el, off, new V3()), el, 0];
    });
  }
  for (let k = 1; k <= K; k++) {
    pushRow((az) => {
      const h = hairline(az), e0 = h + 0.042;
      const el = lerp(e0, 1.5, Math.pow(k / K, 1.15));
      return [headSurf(az, el, capOffset(az, el) - groove(az, el), new V3()), el, clamp((el - h) / 0.25, 0, 1)];
    });
  }
  const top = headSurf(0, Math.PI / 2, capOffset(0, Math.PI / 2), new V3());
  // under a dome hat the cap is never seen: drop every quad well inside the rim (and the pole fan)
  const under = hat && hat.rim ? (i, j) => { for (const [di, dj] of [[0, 0], [1, 0], [0, 1], [1, 1]]) { const m = meta[Math.min(rows.length - 1, j + dj)][(i + di) % nA]; if (m[1] < hat.rim(m[0]) + 0.09) return false; } return true; } : null;
  const g = gridGeo(rows, { wrapU: true, poles: under ? {} : { end: top }, skip: under, outward: HEAD_C, uv: (i, j) => [meta[j][i % nA][0], meta[j][i % nA][1]], poleUv: { end: [0, Math.PI / 2] } });
  // uv = stereographic coordinates of the head direction about the style's groove pole (the crown by default; the
  // ponytail tie or the side part for styles that gather their hair elsewhere). The shader rebuilds (az, el) about that
  // pole per fragment, so the bundle grooves radiate from it with no interpolation seam.
  {
    const q = new THREE.Quaternion().setFromUnitVectors(new V3(...(pole || [0, 1, 0])).normalize(), new V3(0, 1, 0));
    const UV = g.attributes.uv, d = new V3();
    for (let i = 0; i < UV.count; i++) {
      dirAE(UV.getX(i), UV.getY(i), d).applyQuaternion(q);
      UV.setXY(i, d.x / (1 + d.y), d.z / (1 + d.y));
    }
  }
  const col = new Float32Array(g.attributes.position.count * 3);
  const nc = nA + 1;
  for (let j = 0; j < rows.length; j++) for (let i = 0; i < nc; i++) { const k = j * nc + i; col[k * 3] = 0; col[k * 3 + 1] = meta[j][i % nA][2]; col[k * 3 + 2] = 2.0; }
  if (!under) { const last = g.attributes.position.count - 1; col[last * 3 + 1] = 1; col[last * 3 + 2] = 2.0; }
  return { geo: g, col };
}

// ------------------------------------------------------------------------------------------------
// Headgear (style.hat). Dome hats built into the hair mesh (same skinning / material as the style's gear):
//  • rim(az): the hat's edge as a head elevation per azimuth (clears the brows at the front and the ears at the sides);
//  • every tentacle is re-rooted where it leaves the rim: the covered part is not built, the bone chain starts at the
//    exit so the springs swing only what shows, and strands that would leave through the crown (spikes, crests, high
//    buns — anything that exits more than exitMax off the scalp) are dropped; styles with a hat-compatible variant
//    (`underHat`: low ponytail, low bun, low twin tails) switch to it;
//  • the inner surface sits on the scalp cap and flares over the hair emerging at the rim (a blurred height field of
//    the kept strands near their exits), so nothing pokes through at rest or when the strands swing outward.
// ------------------------------------------------------------------------------------------------
const rimTable = (tab) => { const k = tab.map((e) => e[0]), v = tab.map((e) => e[1]); return (az) => interpTable(k, v, Math.abs(az)); };
export const HAT_KINDS = [
  { name: 'none' },
  { // snapback: structured six-panel crown (taller at the front), curved bill, strap + snaps at the back
    name: 'cap', cls: 4, col: [-3, 1.22], thick: 0.0058, exitMax: 0.05, flare: 0.006, rows: [0, 0.025, 0.07, 0.14, 0.22, 0.32], crown: 8,
    rim: rimTable([[0, 0.63], [0.6, 0.6], [1.2, 0.42], [1.6, 0.29], [2.3, 0.12], [Math.PI, 0.03]]),
    lift: (az, el) => 0.019 * Math.max(0, Math.cos(az)) ** 1.5 * sstep(0.62, 1.05, el) * (1 - 0.35 * sstep(1.25, 1.57, el)) + 0.012 * sstep(0.75, 1.45, el),
    shape: () => 0,
  },
  { // beanie: knit dome with a folded cuff (team stripe) and a pom-pom
    name: 'beanie', cls: 5, col: [-2, 1.0], thick: 0.0085, exitMax: 0.052, flare: 0.009, rows: [0, 0.012, 0.09, 0.17, 0.186, 0.196, 0.206, 0.22, 0.27, 0.32], crown: 7,
    rim: rimTable([[0, 0.67], [0.6, 0.62], [1.2, 0.43], [1.6, 0.28], [2.3, 0.05], [Math.PI, -0.05]]),
    lift: (az, el) => 0.006 + 0.013 * Math.max(0, -Math.cos(az)) * sstep(0.3, 1.1, el) * (1 - 0.5 * sstep(1.2, 1.57, el)),
    shape: (az, e) => 0.0068 * sstep(-0.01, 0.012, e) * (1 - sstep(0.188, 0.206, e)) + 0.0012 * gauss(e - 0.197, 0.008),
  },
  { // bucket hat: soft crown with a team band, stitched brim all the way round (sloping down)
    name: 'bucket', cls: 6, col: [-4, 1.06], thick: 0.0062, exitMax: 0.05, flare: 0.008, rows: [0, 0.03, 0.08, 0.14, 0.22, 0.32], crown: 7, brim: { slope: 0.62, h: 0.034 },
    rim: rimTable([[0, 0.63], [0.6, 0.59], [1.2, 0.43], [1.6, 0.31], [2.3, 0.12], [Math.PI, 0.04]]),
    lift: (az, el) => 0.016 * sstep(0.45, 1.0, el) * (1 - 0.55 * sstep(1.15, 1.57, el)) + 0.004,
    shape: () => 0,
  },
];

/** Classify every strand against a dome hat and build the clearance field the hat's inner surface follows. */
function analyseHat(hat, specs) {
  const N = 180; const tmp = new V3(), d = new V3(), sk = new V3();
  const cut = []; const hs = [];
  for (const sp of specs) {
    const S = []; let last = -1;
    for (let k = 0; k <= N; k++) {
      const t = k / N; sp.curve.getPointAt(t, tmp);
      d.subVectors(tmp, HEAD_C); const r = d.length(); d.divideScalar(r);
      const el = Math.asin(clamp(d.y, -1, 1)), az = Math.atan2(d.x, d.z);
      const off = r - headShape(d.x, d.y, d.z, sk).length();
      if (el > hat.rim(az)) last = k;
      S.push({ az, el, top: off + sp.top(t), off, w: sp.radius(t) });
    }
    if (last < 0) { cut[sp.si] = { keep: true, tExit: 0 }; continue; }
    const kx = Math.min(N, last + 1), tExit = kx / N;
    if (tExit > 0.88 || S[kx].off > hat.exitMax) { cut[sp.si] = { keep: false, tExit }; continue; }
    cut[sp.si] = { keep: true, tExit };
    // the hidden stub (built from tExit - 0.045) and the first free stretch below the rim must clear the hat
    for (let k = Math.max(0, kx - Math.ceil(0.075 * N)); k <= Math.min(N, kx + Math.ceil(0.035 * N)); k++) hs.push(S[k]);
  }
  // clearance field (radial height above the skin) on an (az, el) grid: splat, dilate, blur
  const nA = 72, nE = 40, e0 = -0.4, e1 = 1.6;
  let F = new Float32Array(nA * nE);
  const ang = (a1, e1_, a2, e2) => { const da = Math.atan2(Math.sin(a1 - a2), Math.cos(a1 - a2)) * Math.cos((e1_ + e2) / 2); return Math.hypot(da, e1_ - e2); };
  for (const sm of hs) {
    const rho = sm.w / 0.17 + 0.05;
    for (let j = 0; j < nE; j++) {
      const el = e0 + (j / (nE - 1)) * (e1 - e0); if (Math.abs(el - sm.el) > rho) continue;
      for (let i = 0; i < nA; i++) {
        const az = -Math.PI + (i / nA) * TAU;
        if (ang(az, el, sm.az, sm.el) < rho) F[j * nA + i] = Math.max(F[j * nA + i], sm.top);
      }
    }
  }
  const pass = (fn) => { const G = new Float32Array(nA * nE); for (let j = 0; j < nE; j++) for (let i = 0; i < nA; i++) { let acc = fn === 'max' ? 0 : 0, n = 0; for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const jj = clamp(j + dj, 0, nE - 1), ii = (i + di + nA) % nA; const v = F[jj * nA + ii]; if (fn === 'max') acc = Math.max(acc, v); else { acc += v; n++; } } G[j * nA + i] = fn === 'max' ? acc : acc / n; } F = G; };
  pass('max'); pass('max'); pass('avg'); pass('avg');
  const H = (az, el) => {
    const fi = ((az + Math.PI) / TAU) * nA, fj = clamp(((el - e0) / (e1 - e0)) * (nE - 1), 0, nE - 1.001);
    const i0 = Math.floor(fi), j0 = Math.floor(fj), a = fi - i0, b = fj - j0;
    const at = (i, j) => F[j * nA + (((i % nA) + nA) % nA)];
    return lerp(lerp(at(i0, j0), at(i0 + 1, j0), a), lerp(at(i0, j0 + 1), at(i0 + 1, j0 + 1), a), b);
  };
  // inner surface: sits on the scalp cap; near the rim it may flare (≤ hat.flare) over the hair that emerges there —
  // the rest of that hair is tucked flat under the rim instead (see tuck), so the crown stays a clean shape
  const base = (az, el) => capOffset(az, el) + 0.0045 + hat.lift(az, el);
  const offIn = (az, el) => { const b = base(az, el); const rz = 1 - sstep(0.05, 0.2, el - hat.rim(az)); return b + rz * clamp(H(az, el) + 0.0028 - b, 0, hat.flare); };
  // max radial offset allowed for hair geometry at (az, el): under the hat, just inside its inner surface; below the
  // rim it opens up quickly so the tentacles fan out from under the edge
  const dB = new V3();
  const tuck = (az, el) => {
    const rim = hat.rim(az);
    if (el >= rim) return offIn(az, el) - 0.0015;
    const k = (rim - el) / 0.075;
    let lim = k >= 1 ? Infinity : offIn(az, rim) - 0.0015 + 0.05 * k * k;
    // a brim sloping down all round (bucket): hair emerging below the rim stays under the brim's cone
    // (below the underside of the brim's cone: a radial step out also climbs by sin(el), and the brim is 4.8 mm thick)
    if (hat.brim) {
      const R = headShape(...dirAE(az, el, dB).toArray(), sk).length(), De = rim - el, ts = Math.tan(hat.brim.slope);
      if (R * De < hat.brim.h) {
        const ce = Math.cos(el), se = Math.sin(el);
        const room = (R * De * (ce - se * ts) - 0.0048 / Math.cos(hat.brim.slope) - 0.0015) / (se + ce * ts);
        lim = Math.min(lim, offIn(az, rim) + hat.thick * 0.7 + Math.max(-0.004, room));
      }
    }
    return lim;
  };
  const hidden = (p) => {
    d.subVectors(p, HEAD_C); const r = d.length(); d.divideScalar(r);
    const el = Math.asin(clamp(d.y, -1, 1)), az = Math.atan2(d.x, d.z);
    if (el < hat.rim(az) - 0.015) return false;
    return r - headShape(d.x, d.y, d.z, sk).length() < offIn(az, el) + hat.thick + 0.004;
  };
  // under or just below the rim (where a brim / cuff overhangs): small parts (cups, clips) are not placed there
  const nearRim = (p, m = 0.07) => { d.subVectors(p, HEAD_C).normalize(); return Math.asin(clamp(d.y, -1, 1)) > hat.rim(Math.atan2(d.x, d.z)) - m; };
  return { cut, H, offIn, tuck, hidden, nearRim, hat };
}

/** Build the hat mesh (dome + its trims) into the hair builder. */
function buildHat(B, hat, ctx, D = null) {
  const nA = D ? (D.lod === 'far' ? 28 : Math.max(48, D.cap[0])) : 48, T = hat.thick, offIn = ctx.offIn;
  const azs = []; for (let i = 0; i < nA; i++) azs.push(-Math.PI + (i / nA) * TAU);
  const at = (az, el, off, out = new V3(), nOut = undefined) => headSurf(az, el, off, out, nOut);
  const outer = (az, e) => { const el = hat.rim(az) + e; return offIn(az, el) + T + hat.shape(az, e); };
  // rows: hidden inner tuck → rounded lip → outer surface (dense near the rim for cuffs/bands) → crown → pole
  const rowE = [], rowOff = [], rowV = [];
  const addRow = (eFn, offFn, v) => { rowE.push(eFn); rowOff.push(offFn); rowV.push(v); };
  addRow(() => 0.07, (az, e) => offIn(az, hat.rim(az) + e), -0.08);
  addRow(() => 0.0, (az, e) => offIn(az, hat.rim(az) + e), -0.03);
  addRow(() => -0.0055, (az, e) => offIn(az, hat.rim(az)) + T * 0.5 + hat.shape(az, 0) * 0.5, -0.015);
  const far = !!D && D.lod === 'far', crownN = far ? 3 : hat.crown;
  for (const [i, e] of hat.rows.entries()) if (!far || i % 2 === 0 || i === hat.rows.length - 1) addRow(() => e, (az, ee) => outer(az, ee), e);
  const top = (az) => 1.5 - hat.rim(az) - 0.32;
  for (let k = 1; k <= crownN; k++) { const f = k / crownN; addRow((az) => 0.32 + top(az) * Math.pow(f, 0.92), (az, ee) => outer(az, ee), 0.32 + f); }
  const rows = rowE.map((eFn, j) => azs.map((az) => { const e = eFn(az); return at(az, hat.rim(az) + e, rowOff[j](az, e)); }));
  const pole = at(0, Math.PI / 2, offIn(0, Math.PI / 2) + T);
  const dome = gridGeo(rows, { wrapU: true, poles: { end: pole }, outward: HEAD_C, uv: (i, j) => [i / nA, rowV[j]], poleUv: { end: [0.5, 1.4] } });
  const tint = -2 - hat.cls;
  B.add(dome, { ex: tint, uv: true, color: gcol(hat.col[0], hat.col[1]), bone: 'head' });
  const n = new V3(), p = new V3();
  if (hat.name === 'cap') {
    // bill: a curved half-ellipse plate hanging off the front rim (top in the crown colour, team underside)
    const nu = D && D.lod === 'hero' ? 40 : D && D.lod === 'far' ? 10 : 18, L0 = 0.084, TH = 0.0052;
    const base = (u, out) => { const az = u * 0.98; const el = hat.rim(az); return at(az, el, offIn(az, el) + T * 0.6, out); };
    const dirAt = (u) => { const az = u * 0.98; return new V3(Math.sin(az) * 1.0, -0.24, Math.cos(az)).normalize(); };
    const topPt = (u, sN) => {
      const L = L0 * Math.sqrt(Math.max(0, 1 - u * u)) + 0.004;
      const q = base(u, new V3()).addScaledVector(dirAt(u), sN * L);
      q.y -= 0.02 * u * u * sN + 0.004 * sN * sN;   // curved bill: sides droop
      return q;
    };
    const loop = []; // cross-section: top from base → edge, round the front edge, bottom back to base
    const sTop = [0, 0.2, 0.45, 0.7, 0.88, 0.96, 1.0];
    for (const sN of sTop) loop.push([sN, 0]);
    loop.push([1.014, 0.18], [1.021, 0.5], [1.014, 0.82]);   // rolled, piped front edge
    for (const sN of [...sTop].reverse()) loop.push([sN, 1]);
    const rowsB = [];
    for (let k = 0; k <= nu; k++) {
      const u = -1 + (2 * k) / nu;
      rowsB.push(loop.map(([sN, side]) => { const q = topPt(u, Math.min(1, sN)); if (side > 0) { q.y -= TH * side; if (side < 1) q.addScaledVector(dirAt(u), 0.0026 * Math.sin(Math.PI * side) + (sN - 1) * 0.08); } return q; }));
    }
    const bill = gridGeo(rowsB, { wrapU: true, outward: (q, out) => { out.set(0, q.y + 0.5, 0); }, uv: (i, j) => [j / nu, 2 + (i < loop.length ? loop[i][0] + (loop[i][1] > 0.75 ? 1.2 : 0) : 0)] });
    B.add(bill, { ex: tint, uv: true, color: (q, i) => { const uvA = bill.attributes.uv; return uvA.getY(i) > 3.1 ? gcol(-1, 0.86) : gcol(hat.col[0], hat.col[1]); }, bone: 'head' });
    // top button
    const btn = superEllipsoid(0.0105, 0.0052, 0.0105, 0.7, 1, far ? 6 : 12, far ? 3 : 6);
    at(0, Math.PI / 2, offIn(0, Math.PI / 2) + T + 0.001, p); btn.translate(p.x, p.y, p.z);
    B.add(btn, { ex: tint, color: gcol(-1, 1.0), bone: 'head' });
    // back strap + snaps
    {
      const e = 0.04, az = Math.PI; const c = at(az, hat.rim(az) + e, outer(az, e) + 0.0012, new V3(), n);
      const strap = superEllipsoid(0.034, 0.0072, 0.0022, 0.35, 0.4, 12, 6, (q) => { q.z -= 3.5 * q.x * q.x; });
      placeBasis(strap, new V3(-1, 0, 0), new V3(0, 1, 0), c);
      B.add(strap, { ex: GEAR.plastic, color: _c.setRGB(0.08, 0.08, 0.1), bone: 'head' });
      for (const x of far ? [] : [-0.018, -0.006, 0.006, 0.018]) {
        const snap = superEllipsoid(0.0026, 0.0026, 0.0014, 1, 1, 8, 4);
        placeBasis(snap, new V3(-1, 0, 0), new V3(0, 1, 0), c.clone().add(new V3(x, 0, -0.0026)));
        B.add(snap, { ex: GEAR.plastic, color: _c.setRGB(0.16, 0.16, 0.19), bone: 'head' });
      }
    }
  } else if (hat.name === 'beanie') {
    // pom-pom: a fluffy ball of yarn on top (team colour)
    const pom = superEllipsoid(0.03, 0.027, 0.03, 1, 1, 14, 10, (q) => { const k = 1 + 0.09 * Math.sin(q.x * 420) * Math.sin(q.y * 390 + 1.3) * Math.sin(q.z * 410 + 2.1); q.multiplyScalar(k); });
    at(0, 1.5, offIn(0, 1.5) + T + 0.018, p); pom.translate(p.x, p.y, p.z - 0.004);
    B.add(pom, { ex: GEAR.fabric, color: gcol(-1, 1.08), bone: 'head' });
  } else if (hat.name === 'bucket') {
    // brim: a stitched ring sloping down and out from the rim, top + rolled edge + underside (wraps round)
    const rowsR = [], vR = [];
    const prof = [[0.0, 0, -0.002], [0.35, 0, 0], [0.75, 0, 0], [0.93, 0, 0], [0.975, 0.06, 0], [1.0, 0.25, 0], [1.012, 0.5, 0], [1.0, 0.75, 0], [0.975, 0.94, 0], [0.93, 1, 0], [0.6, 1, 0], [0.0, 1, -0.002]];
    for (const [sN, side, inset] of far ? prof.filter((_, i) => i % 3 === 0 || i === prof.length - 1) : prof) {
      rowsR.push(azs.map((az) => {
        const el = hat.rim(az); const q = at(az, el, offIn(az, el) + T * 0.7 + inset, new V3(), n);
        const L = 0.05 + 0.006 * Math.max(0, Math.cos(az));
        const dir = new V3(n.x, 0, n.z).normalize().multiplyScalar(Math.cos(0.62)).add(new V3(0, -Math.sin(0.62), 0));
        q.addScaledVector(dir, Math.min(1, sN) * L);
        const up = new V3(0, 1, 0).addScaledVector(dir, -dir.y).normalize();
        if (side > 0) { q.addScaledVector(up, -0.0048 * side); if (side < 1) q.addScaledVector(dir, 0.0022 * Math.sin(Math.PI * side)); }
        return q;
      }));
      vR.push(2 + sN + (side > 0.75 ? 1.2 : 0));
    }
    const brim = gridGeo(rowsR, { wrapU: true, outward: (q, out) => out.set(HEAD_C.x, q.y + 0.3, HEAD_C.z), uv: (i, j) => [i / nA, vR[j]] });
    B.add(brim, { ex: tint, uv: true, color: gcol(hat.col[0], hat.col[1]), bone: 'head' });
  }
}

/** Everything needed to build one strand (built once per style variant; `si` = the style's strand index). */
function strandSpec(sd, si, capCenter) {
  const raw = sd.pts.map((cp) => strandPoint(cp, sd.r0, sd.flat, new V3()));
  const outDir = (b) => b.clone().sub(capCenter);
  // curled tip: the end rolls away from the head (toward it for curl < 0) in a tightening spiral
  const pts = curlTip(raw, sd.curl || 0, outDir);
  const profile = (t) => {
    let r = lerp(sd.r0, sd.r1 * 0.92, Math.pow(sstep(0.0, 0.88, t), sd.taper ?? 0.78)); // firm taper (taper > 1 stays full longer)
    if (!sd.noClub) r *= 1 + 0.2 * Math.exp(-(((t - 0.8) / 0.07) ** 2));               // tentacle club before the tip
    return r * lerp(1, 0.5, sstep(0.9, 1, t));                                           // tapering, rounded tip
  };
  const rk = sd.rMain ?? 1;
  const radius = (t) => rk * profile(t);
  // lens-shaped ribbon: thin crisp edges, a soft ridge along the top, flatter sucker side underneath.
  // Fin strands (out: 'x') are flattened sideways instead (a mohawk blade) with a symmetric lens section.
  const fin = sd.out === 'x';
  const section = fin
    ? (c, s) => [c * (1 - 0.3 * s * s), s]
    : (c, s) => {
      let cc = c * (1 - 0.34 * s * s);
      if (c > 0) cc += 0.2 * c * Math.pow(1 - s * s, 2); else cc *= 0.82;
      return [cc, s];
    };
  const tw = sd.twist ?? (si % 2 ? 1 : -1) * (0.22 + 0.12 * ((si * 37) % 5) / 4) * (sd.K > 2 ? 0.5 : 1);
  const twist = (t) => tw * sstep(0.12, 0.62, t) * (1 - 0.7 * sstep(0.7, 0.95, t));
  const flat = (t) => lerp(sd.flat * 0.62, Math.min(0.78, sd.flat + 0.24), sstep(0.5, 0.92, t));
  const outward = fin ? (P, o) => o.set(1, 0, 0) : (P, o) => o.copy(P).sub(capCenter).normalize();
  const surf = new TentacleSurface(pts, { radius, flat, twist, section, outward, transport: !fin });
  const curve = surf.curve;
  // half-thickness toward the scalp normal (how far the strand's top stands off its centreline)
  const top = (t) => (fin ? 1 : 1.2 * flat(t)) * radius(t);
  // sculpted locks (bangs): extra tentacle locks fanned + layered round this spine; they ride its bones
  const locks = (sd.locks || []).map((L, li) => {
    const lp = lockSpines(surf, [L], outDir)[0];
    const ltw = L.tw ?? (li % 2 ? 0.3 : -0.3);
    const ls = new TentacleSurface(lp, { radius: (t) => (L.r ?? 0.8) * profile(t), flat: (t) => Math.min(0.9, flat(t) * (L.flat ?? 1.3)), twist: (t) => ltw * sstep(0.1, 0.8, t), section, outward, transport: !fin });
    // lock param → main spine param (drives the shared bone weights): nearest main sample, kept monotonic
    const map = new Float32Array(65); let j0 = 0; const q = new V3();
    for (let k = 0; k <= 64; k++) {
      ls.curve.getPointAt(k / 64, q);
      let best = j0, bd = 1e9;
      for (let j = j0; j <= surf.N; j++) { const d = surf.P[j].distanceToSquared(q); if (d < bd) { bd = d; best = j; } }
      map[k] = best / surf.N; j0 = best;
    }
    const tMain = (t) => { const f = clamp(t, 0, 1) * 64, i = Math.min(63, Math.floor(f)); return lerp(map[i], map[i + 1], f - i); };
    return { L, surf: ls, tMain };
  });
  return { sd, si, pts, radius, section, twist, flat, outward, fin, curve, top, surf, locks };
}

/** { P, T, o, b, r } of a tentacle surface at t (gear placement). */
function surfSample(S, t) {
  const P = new V3(), T = new V3(), o = new V3(), b = new V3();
  S.frame(t, P, T, o, b);
  return { P, T, o, b, r: S.section(t).r };
}

/**
 * Contact-occlusion field of one hair build (baked into the hair vertices: crevices between overlapping locks, the
 * undersides of strands resting on the scalp, the scalp cap round every tentacle root). Occluders: the scalp and every
 * strand / lock spine (elliptic sections). Also answers "is this point buried?" for suction-cup placement.
 */
function hairOccluders(specs) {
  const sets = [];
  for (const sp of specs) {
    sp.occId = sets.length; sets.push(spineSamples(sp.surf));
    for (const lk of sp.locks) { lk.occId = sets.length; sets.push(spineSamples(lk.surf)); }
  }
  const d = new V3(), sk = new V3(), v = new V3(), T = new V3(), Bv = new V3();
  // radial height of p above the scalp cap (the bare skin below the hairline); d = radial direction
  const aboveCap = (p) => {
    d.subVectors(p, HEAD_C); const r = d.length(); d.divideScalar(r);
    const el = Math.asin(clamp(d.y, -1, 1)), az = Math.atan2(d.x, d.z);
    const skin = headShape(d.x, d.y, d.z, sk).length();
    return r - skin - capOffset(az, el) * sstep(hairline(az) - 0.08, hairline(az), el);
  };
  // distance from p to the surface of the strand around spine sample s (Infinity when s is not the nearest slice)
  const surfDist = (p, s) => {
    v.subVectors(p, s.p);
    if (v.lengthSq() > 0.0064) return Infinity;
    T.copy(s.T);
    const vT = v.dot(T); if (Math.abs(vT) > 0.0055) return Infinity;
    Bv.crossVectors(T, s.O);
    const vO = v.dot(s.O), vB = v.dot(Bv);
    const e = Math.hypot(vO / Math.max(s.h, 1e-4), vB / Math.max(s.r, 1e-4));
    return Math.hypot(vO, vB) * (1 - 1 / Math.max(e, 1e-6));
  };
  const nn = new V3(), to = new V3();
  return {
    /** baked occlusion 0..1 at p with normal n; self = occluder id of the surface p belongs to */
    ao(p, n, self = -1) {
      let ao = 1;
      const a = aboveCap(p);
      const facing = -n.dot(d);
      ao = Math.min(ao, lerp(1, lerp(0.34, 1, sstep(0.0, 0.03, a)), sstep(-0.35, 0.45, facing)));
      if (self >= 0) ao = Math.min(ao, lerp(1, lerp(0.5, 1, sstep(0.0, 0.008, a)), sstep(-0.7, -0.1, facing))); // root tucked into the cap: tight crease
      for (let k = 0; k < sets.length; k++) {
        if (k === self) continue;
        for (const s of sets[k]) {
          const ds = surfDist(p, s); if (ds === Infinity) continue;
          to.subVectors(s.p, p).normalize();
          const f = sstep(-0.3, 0.5, nn.copy(n).dot(to));
          ao = Math.min(ao, 1 - 0.6 * (1 - sstep(0.0, 0.03, Math.max(0, ds))) * f);
        }
      }
      return clamp(ao, 0.25, 1);
    },
    /** true when a cup of radius R centred at p would sink into the scalp or another strand */
    buried(p, R, self = -1) {
      if (aboveCap(p) < R * 0.5) return true;
      for (let k = 0; k < sets.length; k++) {
        if (k === self) continue;
        for (const s of sets[k]) { const ds = surfDist(p, s); if (ds < R * 1.2) return true; }
      }
      return false;
    },
  };
}

/** Pull any vertex standing proud of a hat's inner surface radially under it (see analyseHat → tuck). */
function tuckUnderHat(geo, hatCtx) {
  const P = geo.attributes.position; const v = new V3(), d = new V3(), sk = new V3(); let moved = false;
  for (let i = 0; i < P.count; i++) {
    v.fromBufferAttribute(P, i); d.subVectors(v, HEAD_C); const r = d.length(); d.divideScalar(r);
    const lim = hatCtx.tuck(Math.atan2(d.x, d.z), Math.asin(clamp(d.y, -1, 1))); if (!Number.isFinite(lim)) continue;
    const skin = headShape(d.x, d.y, d.z, sk).length();
    if (r - skin > lim) { v.copy(d).multiplyScalar(skin + Math.max(0.0005, lim)).add(HEAD_C); P.setXYZ(i, v.x, v.y, v.z); moved = true; }
  }
  if (moved) geo.computeVertexNormals();
}

/**
 * Add a tentacle tube to the hair builder. Hair vertex contract (makeHairMaterial): colour = (spine t, suckers, sinA),
 * uv = (metres along the spine, cosA), aHair = (half-thickness through the section in metres, 0 = skin | 1 + ring = cup,
 * baked contact occlusion). suckers: 0 none · 0.5 modelled cups (the shader only deepens the underside) · 1 printed.
 */
function addTube(B, tube, o) {
  const N = tube.geo.attributes.normal, P = tube.geo.attributes.position;
  const n = new V3(), p = new V3();
  const ao = new Float32Array(P.count);
  for (let i = 0; i < P.count; i++) ao[i] = o.occ ? o.occ.ao(p.fromBufferAttribute(P, i), n.fromBufferAttribute(N, i), o.self) : 1;
  const tA = tube.t, cA = tube.cs, sA = tube.sn, hA = tube.thick;
  B.add(tube.geo, {
    ex: o.tint ?? 0,
    color: (q, i) => _c.setRGB(o.tm(tA[i]), o.suck, sA[i] * 0.5 + 0.5),
    uv: (i) => [o.tm(tA[i]) * o.len, cA[i]],
    v3: (q, i) => [hA[i], 0, ao[i]],
    weights: (q, i) => o.weights(o.tm(tA[i])),
  });
}

/**
 * Build one strand (tube + modelled suckers + its sculpted locks) into the hair mesh and set its bone chain. tExit > 0
 * re-roots it under a hat: the part before tExit is hidden under the hat (only a short stub is built), the bones start
 * where it leaves the rim, and every profile keeps the untrimmed strand's parametrisation so it looks the same.
 */
function buildStrand(B, sp, si, tExit, rest, meta, hatCtx = null, D = hairDetail(), occ = null) {
  const { sd, surf: S } = sp;
  const t0 = tExit > 0 ? Math.max(0, tExit - 0.045) : 0;
  const len = S.len;
  // bone chain on the free part [tExit, 1]
  const bt = [0, 0.34, 0.67];
  for (let k = 0; k < HAIR_SEGS; k++) rest[`hair${si}_${k}`] = S.curve.getPointAt(lerp(tExit, 1, bt[k]));
  rest[`hairTip${si}`] = S.curve.getPointAt(lerp(tExit, 1, 0.86));
  // skin weights along the spine: C1 hats centred on the segment middles (neighbours always sum to 1, so a bend
  // spreads over a whole segment instead of creasing at a joint); the club tip rides hairTip{si}; the stub hidden
  // under a hat is pinned to the head (only what leaves the rim swings)
  const weights = (tm) => {
    const u = tExit > 0 ? clamp((tm - tExit) / (1 - tExit), 0, 1) : clamp(tm, 0, 1);
    const x = u * HAIR_SEGS - 0.5; const w = [];
    for (let k = 0; k < HAIR_SEGS; k++) w.push([`hair${si}_${k}`, 1 - sstep(0, 1, Math.abs(x - k))]);
    if (x < 0) w[0][1] = 1;
    if (x > HAIR_SEGS - 1) w[HAIR_SEGS - 1][1] = 1;
    const wt = sstep(0.84, 0.95, u);
    if (wt > 0) { for (const e of w) e[1] *= 1 - wt; w.push([`hairTip${si}`, wt]); }
    if (tExit > 0) { const kh = 1 - sstep(tExit - 0.016, tExit, tm); if (kh > 0) { for (const e of w) e[1] *= 1 - kh; w.push(['head', kh]); } }
    return w;
  };
  const suck = sd.suck ? (D.cups ? 0.5 : 1) : 0;
  // ---- tube
  const tube = tentacleTube(S, { rings: Math.max(8, Math.round(D.ringsPerM * len * (1 - t0))), radial: D.radial, tipSteps: D.tipSteps, t0 });
  if (hatCtx) tuckUnderHat(tube.geo, hatCtx);
  addTube(B, tube, { tm: (t) => t, len, suck, weights, occ, self: sp.occId });
  // ---- modelled suction cups: two staggered rows along the underside edges, shrinking toward the tip
  if (sd.suck && D.cups && !sp.fin) {
    const from = Math.max(sd.cupFrom ?? 0.3, tExit + 0.07);
    const cups = suctionCups(S, {
      rows: [{ th: Math.PI - 0.78, phase: 0 }, { th: Math.PI + 0.78, phase: 0.5 }], from, to: 0.95,
      size: (t) => Math.max(0.0018, 0.2 * sp.radius(t)), gap: D.cups.gap, radial: D.cups.radial, prof: D.cups.prof,
      skip: (C, t, R) => (hatCtx && (hatCtx.hidden(C) || hatCtx.nearRim(C))) || (occ && occ.buried(C, R, sp.occId)),
    });
    if (cups.list.length) {
      const cP = cups.geo.attributes.position, cN = cups.geo.attributes.normal; const p = new V3(), n = new V3();
      const ao = new Float32Array(cP.count);
      for (let i = 0; i < cP.count; i++) ao[i] = occ ? occ.ao(p.fromBufferAttribute(cP, i), n.fromBufferAttribute(cN, i), sp.occId) : 1;
      B.add(cups.geo, {
        ex: 0,
        color: (q, i) => _c.setRGB(cups.t[i], suck, 0.5),
        uv: (i) => [cups.t[i] * len, -1],
        v3: (q, i) => [0.35 * sp.radius(cups.t[i]) * sp.flat(cups.t[i]), 1 + cups.ring[i], ao[i]],
        weights: (q, i) => weights(cups.t[i]),
      });
    }
  }
  // ---- sculpted locks (bangs): own tube, same bones as this strand (far tier: the main lock alone)
  for (const lk of D.locks === false ? [] : sp.locks) {
    const LS = lk.surf;
    const lt = tentacleTube(LS, { rings: Math.max(8, Math.round(D.ringsPerM * LS.len)), radial: D.radial, tipSteps: D.tipSteps });
    if (hatCtx) tuckUnderHat(lt.geo, hatCtx);
    addTube(B, lt, { tm: (t) => lk.tMain(t), len: LS.len, suck: 0, weights, occ, self: lk.occId, tint: lk.L.tint ?? 0 });
  }
  const dir = sp.pts[sp.pts.length - 1].clone().sub(tExit > 0 ? rest[`hair${si}_0`] : sp.pts[0]);
  meta.push({ dir: dir.clone().normalize(), len: dir.length(), K: sd.K, G: sd.G });
  // sample(t) in the strand parametrisation (gear placement); null where the strand is hidden by a hat
  const sample = (t) => (t < tExit + 0.02 ? null : surfSample(S, t));
  return { sw: { curve: S.curve, sample: (t) => surfSample(S, t) }, sd, bi: si, t0, tExit, sample, section: (t) => S.section(t) };
}

// Brow shapes (style.brows). t = 0 inner end (near the nose) → 1 outer end. el(t) is the stroke's elevation on the head,
// r(t) its radius. 0 is the original stroke (unchanged); the others are painted-ink variants for the locker.
export const BROW_KINDS = [
  { name: 'classic', el: (t) => BROW.el + 0.045 * Math.sin(Math.PI * (t * 0.8 + 0.12)) - 0.014 * t, r: (t) => 0.0092 * (0.5 + 0.5 * Math.sin(Math.PI * (0.22 + 0.72 * t))) * lerp(1.15, 0.7, t), az1: BROW.az1 },
  // bold: thick, low and level with a slight downward slant toward the nose (determined)
  { name: 'bold', el: (t) => BROW.el - 0.004 + 0.022 * Math.sin(Math.PI * (t * 0.7 + 0.2)) + 0.01 * t, r: (t) => 0.0128 * (0.62 + 0.38 * Math.sin(Math.PI * (0.18 + 0.7 * t))) * lerp(1.12, 0.82, t), az1: BROW.az1 + 0.02 },
  // arched: high, thin, elegant arch that tapers to a fine tail
  { name: 'arched', el: (t) => BROW.el + 0.012 + 0.07 * Math.sin(Math.PI * (t * 0.86 + 0.08)) - 0.02 * t, r: (t) => 0.0078 * (0.55 + 0.45 * Math.sin(Math.PI * (0.2 + 0.75 * t))) * lerp(1.1, 0.55, t), az1: BROW.az1 + 0.03 },
  // straight: short, blunt, perfectly level bars
  { name: 'straight', el: (t) => BROW.el + 0.022 + 0.004 * Math.sin(Math.PI * t), r: (t) => 0.0104 * (0.82 + 0.18 * Math.sin(Math.PI * (0.1 + 0.8 * t))), az1: BROW.az1 - 0.05 },
];

function buildHair(styleIdx, hatIdx = 0, browIdx = 0, lod = 'hero') {
  const style = STYLES[styleIdx % STYLES.length];
  const hat = HAT_KINDS[hatIdx] || HAT_KINDS[0];
  const D = hairDetail(lod);
  const B = new Builder();
  const rest = {}; const meta = [];
  // ---- strands: specs first, so a hat can analyse (and re-root / drop) them before anything is built
  const capCenter = HEAD_C.clone().add(new V3(0, -0.02, -0.005));
  const vs = hat.rim && style.underHat ? { ...style, ...style.underHat } : style; // hat-compatible variant (low tail / bun)
  // under a hat the bang locks hang straighter (a curled tip would roll up into the brim / cuff)
  const hatLocks = (sd) => (hat.rim && sd.locks ? { ...sd, curl: (sd.curl || 0) * 0.35, locks: sd.locks.map((L) => ({ ...L, curl: (L.curl ?? 0.6) * 0.3 })) } : sd);
  const specs = vs.strands.map((sd, si) => strandSpec(hatLocks(sd), si, capCenter));
  // sculpted locks join the hat analysis too (clearance field + drop test), riding their strand's keep/drop
  const lockSpecs = [];
  for (const sp of specs) sp.locks.forEach((lk, j) => { lk.hatSi = 1000 + sp.si * 8 + j; const q = (t) => lk.surf.section(t); lockSpecs.push({ si: lk.hatSi, curve: lk.surf.curve, top: (t) => 1.2 * q(t).flat * q(t).r, radius: (t) => q(t).r }); });
  const hatCtx = hat.rim ? analyseHat(hat, specs.concat(lockSpecs)) : null;
  if (hatCtx) for (const sp of specs) sp.locks = sp.locks.filter((lk) => hatCtx.cut[lk.hatSi].keep);
  const occ = hairOccluders(specs.filter((sp) => !hatCtx || hatCtx.cut[sp.si].keep));
  // ---- scalp cap (baked contact occlusion round every tentacle root)
  {
    const { geo, col } = buildCap(style.cap?.pole, hat, D);
    const P = geo.attributes.position, N = geo.attributes.normal; const p = new V3(), n = new V3();
    B.add(geo, { bone: 'head', ex: -0.08, uv: true, color: (q, i) => _c.setRGB(col[i * 3], col[i * 3 + 1], col[i * 3 + 2]), v3: (q, i) => [0.012, 0, occ.ao(p.fromBufferAttribute(P, i), n.fromBufferAttribute(N, i))] });
  }
  // ---- brows: tapered ink strokes on the brow bones (shape per style.brows)
  const bk = BROW_KINDS[browIdx] || BROW_KINDS[0];
  for (const [s, sx] of [['L', 1], ['R', -1]]) {
    const pts = []; const q = new V3();
    for (let i = 0; i <= 6; i++) { const t = i / 6; pts.push(headSurf(sx * lerp(BROW.az0, bk.az1, t), bk.el(t), 0.0035, q).clone()); }
    const st = sweep(pts, { seg: D.brow[0], radial: D.brow[1], capSteps: 3, radius: bk.r, flat: 0.5, outward: (P, o) => o.copy(P).sub(HEAD_C).normalize() });
    B.add(st.geo, { bone: 'brow' + s, ex: -0.62, color: _c.setRGB(0, 0, 0), v3: [0.004, 0, 1] });
  }
  const strandInfo = []; let bi = 0; // strandInfo is indexed by the style's strand index (null = dropped under the hat)
  for (const sp of specs) {
    const cut = hatCtx ? hatCtx.cut[sp.si] : { keep: true, tExit: 0 };
    if (!cut.keep) { strandInfo.push(null); continue; }
    const si = bi++;
    const info = buildStrand(B, sp, si, cut.tExit, rest, meta, hatCtx, D, occ);
    strandInfo.push(info);
  }
  for (let si = bi; si < HAIR_MAX; si++) { for (let k = 0; k < HAIR_SEGS; k++) rest[`hair${si}_${k}`] = HEAD_C.clone(); rest[`hairTip${si}`] = HEAD_C.clone(); }
  addGear(B, vs, strandInfo, hatCtx, D);
  if (hatCtx) buildHat(B, hat, hatCtx, D);
  return { geo: B.build('aTint', 'aHair'), rest, meta, name: style.name, hat: hat.name, lod: D.lod, dropped: strandInfo.filter((x) => !x).length };
}

// ------------------------------------------------------------------------------------------------
// Tank glass + ink fill (tank-local: capsule axis = +Y)
// ------------------------------------------------------------------------------------------------
function buildTankParts(lod = 'hero') {
  const T = TANK; const chest = REST_BODY.chest;
  const { glass, fill } = tankGlass(bodyLevel(lod));
  return {
    glass, fill, offset: T.center.clone().sub(chest), center: T.center.clone(), offsetTank: T.center.clone().sub(REST_BODY.tank),
    tilt: T.tilt, fillBottom: -0.09, fillHeight: 0.18,
  };
}

// ------------------------------------------------------------------------------------------------
// Squid form: one continuous mantle with blended arrowhead fins, raised visor band, big eyes, ten tentacles
// ------------------------------------------------------------------------------------------------
const SQ_PROF = [[0, -0.034], [0.07, -0.03], [0.108, -0.009], [0.126, 0.03], [0.131, 0.08], [0.127, 0.13], [0.114, 0.175], [0.099, 0.214], [0.081, 0.254], [0.059, 0.298], [0.035, 0.34], [0.015, 0.366], [0, 0.375]];
const SQ_ZS = 0.86;
const sqR = (y) => interpTable(SQ_PROF.map((p) => p[1]), SQ_PROF.map((p) => p[0]), y);
function sqFin(y) { return 0.108 * sstep(0.158, 0.222, y) * Math.pow(1 - sstep(0.222, 0.374, y), 1.05); }
function sqPoint(th, y, off, out) {
  const r = Math.max(0, sqR(y)) + off;
  const s = Math.sin(th), c = Math.cos(th);
  const f = sqFin(y) * Math.pow(Math.abs(s), 7);
  out.set(s * r + Math.sign(s) * f, y, c * r * SQ_ZS * (1 - 0.8 * Math.min(1, f / 0.05) * Math.pow(Math.abs(s), 4)));
  out.y -= 0.02 * f * 3 * Math.pow(Math.abs(s), 7);   // wing tips sweep slightly down
  return out;
}
function sqSurfN(th, y, off, out) {
  const p0 = sqPoint(th, y, 0, new V3()), p1 = sqPoint(th + 0.002, y, 0, new V3()), p2 = sqPoint(th, y + 0.002, 0, new V3());
  const n = p1.sub(p0).cross(p2.sub(p0)).normalize();
  return out.copy(p0).addScaledVector(n, off);
}

const _squid = new Map();
/**
 * Squid-form meshes for a LOD tier (cached per tier × quality). Contract (makeSquidMaterial): colour = (tint, wiggle
 * weight, phase); aEx = part (0 mantle · 1 arm with printed suckers · 2 modelled sucker · 3 arm whose suckers are
 * modelled); uv = (t along the arm, cos of the section angle); aSq = (half-thickness in metres, 1 + cup ring | 0, baked
 * contact occlusion). The eye patches keep the eye material's polar uv (aEx = side).
 */
function buildSquid(lod = 'hero') {
  const D = hairDetail(lod), SD = D.squid, key = lod + '|' + D.k;
  if (_squid.has(key)) return _squid.get(key);
  const body = new Builder(), dark = new Builder(), eyes = new Builder();
  // ---- mantle + fins (dense through the fin root, the eye band and the collar)
  {
    const nT = 4 * Math.round(SD.around / 4); // a vertex on each fin tip (th = ±π/2)
    const ys = densitySamples(SD.rows, -0.034, 0.375, (y) => 1 + 1.4 * gauss(y - 0.2, 0.05) + 0.8 * gauss(y + 0.02, 0.03) + 0.9 * gauss(y - 0.36, 0.02) + 0.5 * gauss(y - 0.09, 0.05));
    const rows = ys.slice(1, -1).map((y) => Array.from({ length: nT }, (_, i) => sqPoint((i / nT) * TAU, y, 0, new V3())));
    const g = gridGeo(rows, { wrapU: true, poles: { start: new V3(0, -0.034, 0), end: new V3(0, 0.375, 0) }, outward: (p, out) => out.set(0, p.y, 0) });
    body.add(g, {
      ex: 0,
      color: (p) => {
        const fin = sqFin(p.y) > 0.01 ? sstep(0.12, 0.2, Math.abs(p.x)) : 0;
        const face = sstep(0.02, 0.11, p.z) * sstep(0.2, 0.02, p.y) * 0.55;
        const top = sstep(0.22, 0.37, p.y) * 0.25;
        const belly = sstep(0.02, -0.03, p.y) * -0.35;
        return _c.setRGB(Math.max(fin * 0.5 + face + top, 0) + belly, fin * 0.25, 0.1);
      },
      // thickness: the body is a full ellipsoid (≈ its radius); out on a fin, the fin's own half-thickness
      v3: (p) => { const r = Math.max(0.004, sqR(p.y)); const onFin = sstep(r * 0.98, r * 1.1, Math.abs(p.x)); return [lerp(r * SQ_ZS, Math.max(0.0012, Math.abs(p.z)), onFin), 0, lerp(0.5, 1, sstep(-0.03, 0.045, p.y))]; },
    });
  }
  // ---- tentacles (8 arms + 2 longer feelers at the back): flattened, tapering, suckers on the inner face, curled tips
  const N = 10;
  for (let k = 0; k < N; k++) {
    const a = (k / N) * TAU + 0.31;
    const feeler = k === 4 || k === 6;
    const len = lerp(0.15, 0.108, Math.max(0, Math.cos(a))) * (k % 2 ? 0.92 : 1.0) * (feeler ? 1.3 : 1);
    const dx = Math.sin(a), dz = Math.cos(a) * SQ_ZS;
    const curl = 0.028 * (k % 2 ? 1 : 0.7);
    const raw = [[dx * 0.055, 0.012, dz * 0.055], [dx * 0.09, -0.04, dz * 0.09], [dx * 0.118, -0.035 - len * 0.55, dz * 0.118], [dx * 0.15, -0.035 - len * 0.86, dz * 0.15], [dx * (0.178 + curl * 0.6), -0.032 - len * 0.98, dz * (0.178 + curl * 0.6)]].map((q) => new V3(...q));
    const out = new V3(dx, 0.35, dz).normalize();
    const pts = curlTip(raw, (feeler ? 0.9 : 0.75) + 0.1 * (k % 3), () => out, 0.5);
    const radius = (t) => lerp(0.0255, 0.0062, Math.pow(t, 0.78)) * (1 + 0.08 * gauss(t - 0.2, 0.1) + (feeler ? 0.22 * gauss(t - 0.8, 0.07) : 0)) * lerp(1, 0.6, sstep(0.9, 1, t));
    const S = new TentacleSurface(pts, {
      radius, flat: () => 0.78, transport: true,
      section: (c, s) => { let cc = c * (1 - 0.25 * s * s); if (c < 0) cc *= 0.8; return [cc, s]; },
      outward: (P, o) => o.set(P.x, 0.25, P.z).normalize(),
      twist: (t) => (k % 2 ? 0.25 : -0.25) * sstep(0.3, 0.9, t),
    });
    const tube = tentacleTube(S, { rings: Math.max(8, Math.round(SD.arm[0] * S.len / 0.2)), radial: SD.arm[1], tipSteps: D.tipSteps, tipLen: 1.1 });
    const tint = (t) => 0.12 + 0.3 * t - 0.25 * (1 - t) * 0.5;
    const tA = tube.t, cA = tube.cs, hA = tube.thick;
    body.add(tube.geo, { ex: SD.cups ? 3 : 1, uv: (i) => [tA[i], cA[i]], color: (p, i) => _c.setRGB(tint(tA[i]), tA[i], k / N), v3: (p, i) => [hA[i], 0, lerp(0.55, 1, sstep(0.0, 0.25, tA[i]))] });
    if (SD.cups) {
      const cups = suctionCups(S, { rows: [{ th: Math.PI - 0.62, phase: 0 }, { th: Math.PI + 0.62, phase: 0.5 }], from: 0.2, to: 0.93, size: (t) => Math.max(0.0014, 0.26 * radius(t)), gap: SD.cups.gap, radial: SD.cups.radial, prof: SD.cups.prof });
      const ct = cups.t, cr = cups.ring;
      body.add(cups.geo, { ex: 2, uv: (i) => [ct[i], -1], color: (p, i) => _c.setRGB(tint(ct[i]) + 0.1, ct[i], k / N), v3: (p, i) => [0.3 * radius(ct[i]) * 0.78, 1 + cr[i], 1] });
    }
  }
  // ---- raised visor band with rolled edges + eye sockets
  {
    const nu = Math.max(40, Math.round(SD.around * 0.55)), nv = Math.max(10, Math.round(SD.rows * 0.22));
    const rows = [];
    for (let j = 0; j <= nv; j++) {
      const v = j / nv;
      rows.push(Array.from({ length: nu + 1 }, (_, i) => {
        const u = i / nu; const ang = lerp(-2.05, 2.05, u);
        const c = 0.09 + 0.02 * (Math.abs(ang) / 2.05) ** 2;
        const hh = 0.045 * Math.pow(Math.max(0, 1 - (Math.abs(ang) / 2.05) ** 2), 0.6);
        const y = c + (v * 2 - 1) * (hh + 0.004);
        const e = Math.abs(v * 2 - 1);
        const lift = 0.0078 * Math.sqrt(Math.max(0, 1 - Math.pow(e, 6))) - 0.003 * sstep(0.9, 1, e);
        const endK = sstep(2.05, 1.35, Math.abs(ang));
        return sqSurfN(ang, y, -0.002 + lift * endK, new V3());
      }));
    }
    const g = gridGeo(rows, { wrapU: false, outward: (p, out) => out.set(0, p.y, 0) });
    dark.add(g, { color: new THREE.Color(0.018, 0.02, 0.03) });
  }
  for (const sx of [1, -1]) {
    const g = polarPatch(lod === 'far' ? 4 : 9, lod === 'far' ? 16 : 36, (u, v, r, out) => sqSurfN(sx * 0.5 + u * 0.31, 0.092 + v * 0.037, 0.0092 + 0.0042 * (1 - r * r), out));
    eyes.add(g, { uv: true, ex: sx });
  }
  const res = { body: body.build('aEx', 'aSq'), dark: dark.build('aEx'), eyes: eyes.build('aEx') };
  _squid.set(key, res);
  return res;
}

// ------------------------------------------------------------------------------------------------
// Caches
// ------------------------------------------------------------------------------------------------
const _shared = new Map();
const _hair = new Map();
/** Shared kid meshes for a LOD tier ('hero' default · 'game' · 'far'); the body/outfit detail also follows the quality. */
export function getKidShared(lod = 'hero') {
  const key = lod + '|' + bodyLevel(lod);
  let sh = _shared.get(key);
  if (!sh) {
    sh = { skin: buildSkin(lod), cloth: buildCloth(lod), eyes: buildEyes(lod), tank: buildTankParts(lod), squid: buildSquid(lod) };
    bakeBodyAO(sh.skin, sh.cloth, bodyLevel(lod));
    _shared.set(key, sh);
  }
  return sh;
}
/**
 * Hair-mesh key of a style: accepts a style object ({ hair, hat, brows, … }) or a bare hair index (legacy callers).
 * The hair mesh carries the tentacles, scalp cap, brows, style accessories and headgear, so all three select it.
 */
const wrapN = (v, n) => ((Math.round(+v || 0) % n) + n) % n;
function hairKey(st) {
  if (st && typeof st === 'object') return { hair: wrapN(st.hair, STYLES.length), hat: wrapN(st.hat, HAT_KINDS.length), brows: wrapN(st.brows, BROW_KINDS.length) };
  return { hair: wrapN(st, STYLES.length), hat: 0, brows: 0 };
}
const keyStr = (k) => `${k.hair}.${k.hat}.${k.brows}`;
/** Hair mesh of a style at a LOD tier ('hero' | 'game' | 'far'; resolution also follows the settings quality). */
export function getHairStyle(st, lod = 'hero') {
  const k = hairKey(st), ks = `${keyStr(k)}.${lod}.${hairQuality()}`;
  if (!_hair.has(ks)) _hair.set(ks, buildHair(k.hair, k.hat, k.brows, lod));
  return _hair.get(ks);
}
export function getRestPositions(st) {
  const h = getHairStyle(st); const out = {};
  for (const n of BONE_NAMES) out[n] = (REST_BODY[n] || h.rest[n] || HEAD_C).clone();
  return out;
}
const _inv = new Map();
export function getBoneInverses(st) {
  const ks = keyStr(hairKey(st));
  if (!_inv.has(ks)) { const rest = getRestPositions(st); _inv.set(ks, BONE_NAMES.map((n) => new THREE.Matrix4().makeTranslation(-rest[n].x, -rest[n].y, -rest[n].z))); }
  return _inv.get(ks);
}
/** Cloth (garment) mesh for a style — every outfit currently shares the tee cut (patterns/colours are shader-side). */
export function getClothGeo(st, lod = 'hero') { return getKidShared(lod).cloth; }
/** Triangle count of the visible meshes under an object (for budgets / the lab). */
export function countTriangles(obj) {
  let n = 0;
  obj.traverseVisible((o) => { if (o.isMesh && o.geometry) { const g = o.geometry; n += (g.index ? g.index.count : g.attributes.position.count) / 3; } });
  return n;
}
export const REST = REST_BODY;
export { sstep, clamp, lerp, finalize, torus, mirrorX, gridGeo, revolve, placeBasis, densitySamples };
