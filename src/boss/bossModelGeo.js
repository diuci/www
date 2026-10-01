// INKWAVE — HULLBREAKER geometry + rig.
//
// The whole boss is ONE skeleton and a handful of SkinnedMeshes (one per material): every rigid part (container
// panels, claw segments, leg segments, hatches, junk) is rigidly skinned to its bone (weight 1), soft parts (eye
// stalks, belly, kelp, antennae, chains) blend two bones. So ~100 moving parts cost ~6 draw calls.
//
// Bind pose = model space (feet at y = 0, facing +Z, +X = the boss's LEFT = crusher side). Every bone's rest
// rotation is identity (world-aligned frames), so parts are authored straight in model space and the animator
// works with "rest direction → current direction" frame maps (see bossAnim.js).
//
// Vertex contract (all buckets): position/normal/uv, skinIndex/skinWeight, aM = vec4(class, param, ao, extra).
// Material classes per bucket are listed in bossMats.js.
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

const PI = Math.PI, TAU = PI * 2;
export const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
export const UP = Object.freeze(V3(0, 1, 0));
export function mulberry(a) {
  return function () { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export const QUALITY_K = { low: 0.5, medium: 0.72, high: 1.0, ultra: 1.3 };

// ------------------------------------------------------------------------------------------------ small math
const _q = new THREE.Quaternion(), _m4 = new THREE.Matrix4(), _m4b = new THREE.Matrix4();
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3();
/** matrix whose Z axis = fwd, Y ≈ up (orthogonalised), X = Y × Z, origin o */
export function frameM(o, fwd, up = UP, out = new THREE.Matrix4()) {
  const z = _a.copy(fwd).normalize();
  const x = _b.crossVectors(up, z); if (x.lengthSq() < 1e-8) x.set(1, 0, 0); x.normalize();
  const y = _c.crossVectors(z, x).normalize();
  out.makeBasis(x, y, z); out.setPosition(o);
  return out;
}
/** rotation q with q·a0 = a1 and q·(s0 ⟂ a0) = (s1 ⟂ a1) — maps a rest frame (dir, side) onto a posed one */
const _e1 = new THREE.Vector3(), _e2 = new THREE.Vector3(), _e3 = new THREE.Vector3(), _f1 = new THREE.Vector3(), _f2 = new THREE.Vector3(), _f3 = new THREE.Vector3();
const _R0 = new THREE.Matrix4(), _R1 = new THREE.Matrix4();
export function frameQuat(a0, s0, a1, s1, out) {
  _e1.copy(a0).normalize(); _e2.copy(s0).addScaledVector(_e1, -s0.dot(_e1)); if (_e2.lengthSq() < 1e-10) _e2.set(0, 1, 0).addScaledVector(_e1, -_e1.y); _e2.normalize(); _e3.crossVectors(_e1, _e2);
  _f1.copy(a1).normalize(); _f2.copy(s1).addScaledVector(_f1, -s1.dot(_f1)); if (_f2.lengthSq() < 1e-10) _f2.set(0, 1, 0).addScaledVector(_f1, -_f1.y); _f2.normalize(); _f3.crossVectors(_f1, _f2);
  _R0.makeBasis(_e1, _e2, _e3); _R1.makeBasis(_f1, _f2, _f3);
  _R0.transpose(); _R1.multiply(_R0);
  return out.setFromRotationMatrix(_R1);
}
/** two-bone IK: joint K from root H toward target A with segment lengths l1, l2 bending toward `pole`. Returns reach 0…1+ */
export function ik2(H, A, l1, l2, pole, outK, outA) {
  _d.subVectors(A, H); let dist = _d.length();
  const reach = dist / (l1 + l2);
  const mx = (l1 + l2) * 0.9995, mn = Math.abs(l1 - l2) + 1e-3;
  if (dist < 1e-6) { _d.set(0, -1, 0); dist = mn; }
  _d.divideScalar(dist); const dc = Math.min(mx, Math.max(mn, dist));
  if (outA) outA.copy(H).addScaledVector(_d, dc);
  const a = (l1 * l1 - l2 * l2 + dc * dc) / (2 * dc), h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  _c.copy(pole).addScaledVector(_d, -pole.dot(_d)); if (_c.lengthSq() < 1e-8) _c.set(0, 1, 0).addScaledVector(_d, -_d.y); _c.normalize();
  outK.copy(H).addScaledVector(_d, a).addScaledVector(_c, h);
  return reach;
}

// ------------------------------------------------------------------------------------------------ bucket
export const SK = { a: 0, b: 0, w: 1 };           // skin scratch for function skins: bone a (weight w) + bone b (1 − w)
export const MA = [0, 0, 1, 0];                   // aM scratch for function materials
const _p = new THREE.Vector3(), _n = new THREE.Vector3(), _nm = new THREE.Matrix3();
export class Bucket {
  constructor(name) { this.name = name; this.P = []; this.N = []; this.UV = []; this.SI = []; this.SW = []; this.M = []; this.I = []; this.nv = 0; }
  /** g: BufferGeometry (model-ready or local); M: Matrix4 | null; skin: bone index | fn(p, i, t); mat: [cls, param, ao, extra] | fn(p, n, i, t, u, v) → MA */
  add(g, M, skin, mat) {
    const pa = g.attributes.position, na = g.attributes.normal, ua = g.attributes.uv, tt = g.userData.t;
    if (!na) { g.computeVertexNormals(); }
    const nA = g.attributes.normal;
    if (M) _nm.getNormalMatrix(M);
    const base = this.nv;
    for (let i = 0; i < pa.count; i++) {
      _p.fromBufferAttribute(pa, i); if (M) _p.applyMatrix4(M);
      _n.fromBufferAttribute(nA, i); if (M) _n.applyMatrix3(_nm); _n.normalize();
      this.P.push(_p.x, _p.y, _p.z); this.N.push(_n.x, _n.y, _n.z);
      const u = ua ? ua.getX(i) : 0, v = ua ? ua.getY(i) : 0;
      this.UV.push(u, v);
      const t = tt ? tt[i] : 0;
      if (typeof skin === 'number') { this.SI.push(skin, 0, 0, 0); this.SW.push(1, 0, 0, 0); }
      else { SK.a = 0; SK.b = 0; SK.w = 1; skin(_p, i, t); this.SI.push(SK.a, SK.b, 0, 0); this.SW.push(SK.w, 1 - SK.w, 0, 0); }
      if (typeof mat === 'function') { MA[0] = 0; MA[1] = 0; MA[2] = 1; MA[3] = 0; mat(_p, _n, i, t, u, v); this.M.push(MA[0], MA[1], MA[2], MA[3]); }
      else this.M.push(mat[0], mat[1] ?? 0, mat[2] ?? 1, mat[3] ?? 0);
    }
    const flip = M && M.determinant() < 0;
    const push = (a, b, c) => { if (flip) this.I.push(base + a, base + c, base + b); else this.I.push(base + a, base + b, base + c); };
    if (g.index) { const ix = g.index.array; for (let i = 0; i < ix.length; i += 3) push(ix[i], ix[i + 1], ix[i + 2]); }
    else for (let i = 0; i < pa.count; i += 3) push(i, i + 1, i + 2);
    this.nv += pa.count;
    g.dispose();
    return this;
  }
  get tris() { return this.I.length / 3; }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.P, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.N, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.UV, 2));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(this.SI, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(this.SW, 4));
    g.setAttribute('aM', new THREE.Float32BufferAttribute(this.M, 4));
    g.setIndex(this.nv > 65535 ? new THREE.Uint32BufferAttribute(this.I, 1) : new THREE.Uint16BufferAttribute(this.I, 1));
    g.computeBoundingSphere();
    return g;
  }
}

// ------------------------------------------------------------------------------------------------ primitives
function seamFix(g, radial, rings) {
  const n = g.attributes.normal;
  for (let i = 0; i < rings; i++) {
    const a = i * (radial + 1), b = a + radial;
    _a.fromBufferAttribute(n, a).add(_b.fromBufferAttribute(n, b)).normalize();
    n.setXYZ(a, _a.x, _a.y, _a.z); n.setXYZ(b, _a.x, _a.y, _a.z);
  }
}
/**
 * Tube along a path with a superelliptic cross-section.
 * sec(t) → { n, b, e = 2, on = 0, ob = 0 } radii along the frame normal (≈ up hint) and binormal (side), exponent;
 * rmod(t, ang) → radius multiplier (bumps, serration). Returns indexed geometry with uv = (around, metres) + userData.t.
 */
export function loft(pts, o = {}) {
  const segs = o.segs ?? 12, radial = o.radial ?? 12;
  const curve = pts.length > 2 ? new THREE.CatmullRomCurve3(pts, false, 'centripetal') : new THREE.LineCurve3(pts[0], pts[1]);
  const len = curve.getLength();
  const P = [], T = [], N = [], B = [];
  for (let i = 0; i <= segs; i++) { const t = i / segs; P.push(curve.getPointAt(t)); T.push(curve.getTangentAt(t).normalize()); }
  const n = (o.up || UP).clone(); n.addScaledVector(T[0], -n.dot(T[0])); if (n.lengthSq() < 1e-6) n.set(1, 0, 0).addScaledVector(T[0], -T[0].x); n.normalize();
  for (let i = 0; i <= segs; i++) {
    if (i > 0) { _q.setFromUnitVectors(T[i - 1], T[i]); n.applyQuaternion(_q); n.addScaledVector(T[i], -n.dot(T[i])).normalize(); }
    N.push(n.clone()); B.push(T[i].clone().cross(n));
  }
  const pos = [], uv = [], tt = [], idx = [];
  const sec = o.sec || (() => ({ n: 0.1, b: 0.1 }));
  for (let i = 0; i <= segs; i++) {
    const t = i / segs, s = sec(t), e = s.e ?? 2;
    for (let j = 0; j <= radial; j++) {
      const ang = (j / radial) * TAU, c = Math.cos(ang), sn = Math.sin(ang);
      let x = Math.sign(c) * Math.pow(Math.abs(c), 2 / e), y = Math.sign(sn) * Math.pow(Math.abs(sn), 2 / e);
      const k = o.rmod ? o.rmod(t, ang) : 1;
      x = x * s.n * k + (s.on || 0); y = y * s.b * k + (s.ob || 0);
      const p = P[i];
      pos.push(p.x + N[i].x * x + B[i].x * y, p.y + N[i].y * x + B[i].y * y, p.z + N[i].z * x + B[i].z * y);
      uv.push(j / radial, t * len); tt.push(t);
    }
  }
  for (let i = 0; i < segs; i++) for (let j = 0; j < radial; j++) {
    const a = i * (radial + 1) + j, b = a + 1, c = a + radial + 1, d = c + 1;
    idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  const addCap = (ring, t, dir) => {
    const c0 = pos.length / 3; const p = P[ring]; const s = sec(t);
    pos.push(p.x + N[ring].x * (s.on || 0) + B[ring].x * (s.ob || 0), p.y + N[ring].y * (s.on || 0) + B[ring].y * (s.ob || 0), p.z + N[ring].z * (s.on || 0) + B[ring].z * (s.ob || 0));
    uv.push(0.5, t * len); tt.push(t);
    for (let j = 0; j < radial; j++) { const a = ring * (radial + 1) + j; if (dir > 0) idx.push(a, c0, a + 1); else idx.push(a, a + 1, c0); }
  };
  if (o.cap0) addCap(0, 0, -1);
  if (o.cap1) addCap(segs, 1, 1);
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  seamFix(g, radial, segs + 1);
  g.userData.t = tt; g.userData.len = len;
  return g;
}

/** cube-sphere superellipsoid: r = [rx, ry, rz], e (1 = ellipsoid, < 1 boxier), n grid per face, disp(dir, p) edits p */
const FACES = [[0, 1, 2, 1], [0, 1, 2, -1], [1, 2, 0, 1], [1, 2, 0, -1], [2, 0, 1, 1], [2, 0, 1, -1]];
export function blob(o = {}) {
  const n = Math.max(2, o.n ?? 8), r = o.r || [1, 1, 1], e = o.e ?? 1;
  const pos = [], idx = [];
  const d = new THREE.Vector3(), p = new THREE.Vector3(), c = [0, 0, 0];
  for (const [ua, va, wa, s] of FACES) {
    const b0 = pos.length / 3;
    for (let i = 0; i <= n; i++) for (let j = 0; j <= n; j++) {
      c[ua] = (i / n) * 2 - 1; c[va] = (j / n) * 2 - 1; c[wa] = s;
      // equal-angle cube mapping for even spacing
      c[ua] = Math.tan(c[ua] * PI / 4); c[va] = Math.tan(c[va] * PI / 4);
      d.set(c[0], c[1], c[2]).normalize();
      p.set(r[0] * Math.sign(d.x) * Math.pow(Math.abs(d.x), e), r[1] * Math.sign(d.y) * Math.pow(Math.abs(d.y), e), r[2] * Math.sign(d.z) * Math.pow(Math.abs(d.z), e));
      if (o.disp) o.disp(d, p);
      pos.push(p.x, p.y, p.z);
    }
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const a = b0 + i * (n + 1) + j, b = a + 1, cc = a + n + 1, dd = cc + 1;
      if (s > 0) idx.push(a, cc, b, b, cc, dd); else idx.push(a, b, cc, b, dd, cc);
    }
  }
  let g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
  g = mergeVertices(g, 1e-5);
  g.computeVertexNormals();
  // uv: longitude / latitude-ish (patterns mostly use bind-space position)
  const pa = g.attributes.position, uv = new Float32Array(pa.count * 2);
  for (let i = 0; i < pa.count; i++) { const x = pa.getX(i) / r[0], y = pa.getY(i) / r[1], z = pa.getZ(i) / r[2]; uv[i * 2] = Math.atan2(x, z) / TAU + 0.5; uv[i * 2 + 1] = y * 0.5 + 0.5; }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

/**
 * Corrugated sheet in panel space: u ∈ [0, w] along X', v ∈ [0, h] along Y', outward +Z'. Trapezoid profile of
 * period P, recess `depth`. keep(u, v) filters quads (holes / flaps), dent(u, v) → inward push (m).
 * Each profile facet is its own strip (crisp folds), uv = (u, v) in metres.
 */
export function corrPanel({ w, h, P = 0.28, depth = 0.05, nY = 8, phase = 0, keep = null, dent = null, flat = false }) {
  const cols = [];
  const K = [0, 0.36, 0.5, 0.86, 1.0], Z = [0, 0, -1, -1, 0];
  const zOf = (u) => { if (flat) return 0; let f = ((u / P + phase) % 1 + 1) % 1; for (let k = 0; k < 4; k++) if (f <= K[k + 1]) { const s = (f - K[k]) / (K[k + 1] - K[k]); return (Z[k] + (Z[k + 1] - Z[k]) * s) * depth; } return 0; };
  // column breakpoints
  cols.push(0);
  if (!flat) {
    const p0 = Math.floor(-phase) - 1;
    for (let k = p0; (k - 1) * P < w + P; k++) for (let j = 0; j < 4; j++) { const u = (k + K[j] - phase) * P; if (u > 1e-4 && u < w - 1e-4) cols.push(u); }
  } else { const nx = Math.max(1, Math.round(w / 0.4)); for (let i = 1; i < nx; i++) cols.push((i / nx) * w); }
  cols.push(w); cols.sort((a, b) => a - b);
  const pos = [], uv = [], idx = [];
  for (let c = 0; c < cols.length - 1; c++) {
    const u0 = cols[c], u1 = cols[c + 1]; if (u1 - u0 < 1e-4) continue;
    const b0 = pos.length / 3;
    for (let r = 0; r <= nY; r++) {
      const v = (r / nY) * h;
      for (const u of [u0, u1]) { const z = zOf(u) - (dent ? dent(u, v) : 0); pos.push(u, v, z); uv.push(u, v); }
    }
    for (let r = 0; r < nY; r++) {
      const uc = (u0 + u1) / 2, vc = ((r + 0.5) / nY) * h;
      if (keep && !keep(uc, vc)) continue;
      const a = b0 + r * 2, b = a + 1, cc = a + 2, d = a + 3;
      idx.push(a, b, cc, b, d, cc);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

/** thin quad-strip ribbon along a path (kelp, straps, flags): width(t), ruffle(t, side) → normal offset */
export function ribbon(pts, { segs = 8, width = () => 0.1, ruffle = null, up = UP, across = 2 } = {}) {
  const curve = pts.length > 2 ? new THREE.CatmullRomCurve3(pts) : new THREE.LineCurve3(pts[0], pts[1]);
  const len = curve.getLength();
  const pos = [], uv = [], tt = [], idx = [];
  const side = new THREE.Vector3(), nrm = new THREE.Vector3();
  for (let i = 0; i <= segs; i++) {
    const t = i / segs, p = curve.getPointAt(t), T = curve.getTangentAt(t).normalize();
    side.crossVectors(T, up); if (side.lengthSq() < 1e-6) side.set(1, 0, 0); side.normalize();
    nrm.crossVectors(side, T).normalize();
    const w = width(t);
    for (let j = 0; j <= across; j++) {
      const s = j / across - 0.5;
      const off = ruffle ? ruffle(t, s) : 0;
      pos.push(p.x + side.x * s * w + nrm.x * off, p.y + side.y * s * w + nrm.y * off, p.z + side.z * s * w + nrm.z * off);
      uv.push(j / across, t * len); tt.push(t);
    }
  }
  for (let i = 0; i < segs; i++) for (let j = 0; j < across; j++) { const a = i * (across + 1) + j, b = a + 1, c = a + across + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals(); g.userData.t = tt;
  return g;
}

export function box(w, h, d, r = 0, seg = 1) {
  if (r <= 0) { const g = new THREE.BoxGeometry(w, h, d); return g; }
  // cheap bevelled box: superellipsoid blob with a boxy exponent
  return blob({ r: [w / 2, h / 2, d / 2], e: Math.max(0.12, r), n: Math.max(2, seg) });
}
const M = () => new THREE.Matrix4();
const TRS = (x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) => M().compose(V3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')), V3(sx, sy, sz));

// ------------------------------------------------------------------------------------------------ layout (metres)
// ISO 20 ft container 6.058 × 2.438 × 2.591, carried nose-down on the crab's back.
export const CONT = { pos: V3(0, 3.0, -1.3), pitch: 0.12, hl: 3.03, hw: 1.22, hh: 1.3 };
export const MC = TRS(CONT.pos.x, CONT.pos.y, CONT.pos.z, CONT.pitch, 0, 0);   // container local → model
export const cont = (x, y, z) => V3(x, y, z).applyMatrix4(MC);

// legs: [hip (on body), coxa end, rest foot, l1, l2]; mirrored for the right side (index 3..5)
const _hipM = V3(0.92, -0.55, 0.9).applyMatrix4(MC), _hipR = V3(0.92, -0.5, -1.4).applyMatrix4(MC);
const LEG_L = [
  { hip: V3(0.92, 1.75, 1.7), cox: V3(1.26, 1.75, 1.88), foot: V3(3.05, 0, 3.55), l1: 1.8, l2: 1.85 },
  { hip: _hipM, cox: V3(1.48, _hipM.y, _hipM.z), foot: V3(4.0, 0, 0.3), l1: 2.1, l2: 2.1 },
  { hip: _hipR, cox: V3(1.48, _hipR.y, _hipR.z), foot: V3(3.8, 0, -3.45), l1: 2.15, l2: 2.2 },
];
export const DACTYL = 0.74;
export const LEGS = [];
for (const s of [1, -1]) for (const L of LEG_L) {
  const m = (v) => V3(v.x * s, v.y, v.z);
  LEGS.push({ side: s, hip: m(L.hip), cox: m(L.cox), foot: m(L.foot), l1: L.l1, l2: L.l2, ld: DACTYL });
}
/** ankle point for a foot: the dactyl stands steep, tip slightly outboard */
export function ankleFor(foot, outDir, ld, out) { return out.copy(foot).addScaledVector(outDir, -ld * 0.3).addScaledVector(UP, ld * 0.954); }
export function legPole(outDir, out) { return out.copy(UP).multiplyScalar(1).addScaledVector(outDir, 0.35); }
// rest knees / ankles solved with the same IK the animator uses
for (const L of LEGS) {
  L.out = V3(L.foot.x - L.cox.x, 0, L.foot.z - L.cox.z).normalize();
  L.ankle = ankleFor(L.foot, L.out, L.ld, V3());
  L.knee = V3(); ik2(L.cox, L.ankle, L.l1, L.l2, legPole(L.out, V3()), L.knee);
  L.side0 = V3().crossVectors(UP, L.out).normalize();
}

// arms: shoulder S, elbow E, wrist W, claw forward D, claw up U (rest), upper/fore lengths derived
export const ARMS = [
  { name: 'L', crusher: true, S: V3(0.84, 1.81, 2.62), E: V3(1.9, 1.25, 3.3), W: V3(2.02, 1.05, 4.3), D: V3(0.06, -0.2, 1).normalize(), U: V3(-0.04, 1, 0.2).normalize(), pole: V3(1, -0.6, 0.1).normalize() },
  { name: 'R', crusher: false, S: V3(-0.84, 1.85, 2.62), E: V3(-1.75, 1.7, 3.35), W: V3(-1.8, 1.6, 4.3), D: V3(-0.03, -0.06, 1).normalize(), U: V3(0.02, 1, 0.06).normalize(), pole: V3(-1, -0.5, 0.1).normalize() },
];
for (const A of ARMS) { A.lu = A.S.distanceTo(A.E); A.lf = A.E.distanceTo(A.W); A.side0 = V3().crossVectors(A.W.clone().sub(A.S), A.pole).normalize(); }

export const HEAD = {
  pivot: V3(0, 2.25, 1.55), cara: V3(0, 2.3, 2.3),
  stalk: [V3(0.38, 2.82, 2.9), V3(0.52, 3.24, 3.02), V3(0.64, 3.64, 3.1)], eyeR: 0.28,
  ant: [V3(0.17, 2.61, 3.17), V3(0.42, 3.05, 3.85), V3(0.92, 3.41, 4.6), V3(1.5, 3.35, 5.35), V3(2.0, 3.0, 6.0)],
  siphon: V3(0, 1.98, 3.0), nozzle: V3(0, 2.0, 3.36), nozzleTip: V3(0, 2.0, 4.2), mouth: V3(0, 1.66, 3.14),
};
export const BODY = { pivot: V3(0, 2.1, 0.7), belly: [V3(0, 1.37, 2.12), V3(0, 1.55, 1.35)] };

// ------------------------------------------------------------------------------------------------ rig
export function buildRig() {
  const bones = [], by = {}, rest = {};
  const add = (name, pos, parent) => {
    const b = new THREE.Bone(); b.name = name;
    const pp = parent ? rest[parent] : V3();
    b.position.copy(pos).sub(pp);
    (parent ? by[parent] : null)?.add(b);
    by[name] = b; rest[name] = pos.clone(); b.userData.i = bones.length; bones.push(b);
    return b;
  };
  add('base', V3(0, 0, 0), null);
  add('body', BODY.pivot, 'base');
  add('shell', CONT.pos, 'body');
  add('abdomen', cont(0, -0.15, -0.6), 'shell');
  add('hatchA', cont(0.97, CONT.hh, 0.3), 'shell');     // barrel hatch, hinged on its outer (+x) edge
  add('hatchB', cont(-0.97, CONT.hh, 0.3), 'shell');
  add('hatchC', cont(0, CONT.hh, -2.47), 'shell');      // brood hatch, hinged on its rear edge
  add('doorR', cont(-CONT.hw, 0, CONT.hl), 'shell');    // swinging door leaf (vertical hinge)
  add('tearL', cont(CONT.hw, -0.05, -0.22), 'shell');   // phase-3 wall flaps (hinged at the bottom edge)
  add('tearR', cont(-CONT.hw, -0.05, -0.22), 'shell');
  add('head', HEAD.pivot, 'body');
  add('belly0', BODY.belly[0], 'body'); add('belly1', BODY.belly[1], 'body');
  for (const s of ['L', 'R']) {
    const k = s === 'L' ? 1 : -1, st = HEAD.stalk.map((p) => V3(p.x * k, p.y, p.z));
    add('stalk' + s + '0', st[0], 'head'); add('stalk' + s + '1', st[1], 'stalk' + s + '0'); add('eye' + s, st[2], 'stalk' + s + '1');
    const an = HEAD.ant.map((p) => V3(p.x * k, p.y, p.z));
    add('ant' + s + '0', an[0], 'head'); for (let i = 1; i < 4; i++) add('ant' + s + i, an[i], 'ant' + s + (i - 1));
    add('mand' + s, V3(0.16 * k, 1.77, 3.05), 'head');
  }
  add('siphon', HEAD.siphon, 'head'); add('nozzle', HEAD.nozzle, 'siphon');
  for (const A of ARMS) {
    const D = A.W.clone().addScaledVector(A.D, 0).add(A.D.clone().multiplyScalar(A.crusher ? 1.0 : 0.78)).addScaledVector(A.U, A.crusher ? 0.3 : 0.16);
    A.hinge = D;
    add('arm' + A.name + '0', A.S, 'body'); add('arm' + A.name + '1', A.E, 'arm' + A.name + '0'); add('claw' + A.name, A.W, 'arm' + A.name + '1'); add('dact' + A.name, D, 'claw' + A.name);
  }
  LEGS.forEach((L, i) => { add('leg' + i + 'c', L.hip, 'body'); add('leg' + i + 'm', L.cox, 'leg' + i + 'c'); add('leg' + i + 't', L.knee, 'leg' + i + 'm'); add('leg' + i + 'd', L.ankle, 'leg' + i + 't'); });
  // dangling junk (verlet-driven chains): anchor points + link points in container space
  const CH = [];
  const chain = (name, parent, pts, opt = {}) => { const P = pts.map((p) => cont(p[0], p[1], p[2])); const names = []; for (let i = 0; i < P.length - 1; i++) { add(name + i, P[i], i ? name + (i - 1) : parent); names.push(name + i); } CH.push({ name, parent, pts: P, bones: names, ...opt }); };
  chain('tyre', 'shell', [[-1.3, 1.3, 2.05], [-1.36, 0.62, 2.05], [-1.42, -0.1, 2.05]], { mass: 1, plane: [-1, 0, 0, CONT.hw + 0.2], stiff: 0, damp: 0.965 });
  chain('buoy', 'shell', [[1.2, 1.3, -3.0], [1.34, 0.9, -3.12], [1.4, 0.45, -3.18], [1.42, 0.05, -3.2]], { plane: [0, 0, -1, CONT.hl + 0.3], stiff: 0, damp: 0.985 });
  chain('anch', 'shell', [[-0.35, 1.28, -3.06], [-0.35, 0.8, -3.12], [-0.35, 0.32, -3.14], [-0.35, -0.16, -3.14], [-0.35, -0.9, -3.14]], { plane: [0, 0, -1, CONT.hl + 0.12], stiff: 0, damp: 0.97 });
  chain('chnL', 'shell', [[CONT.hw + 0.04, 1.3, 1.2], [CONT.hw + 0.08, 0.95, 1.18], [CONT.hw + 0.1, 0.6, 1.16], [CONT.hw + 0.1, 0.25, 1.16], [CONT.hw + 0.1, -0.1, 1.16]], { plane: [1, 0, 0, CONT.hw + 0.06], stiff: 0, damp: 0.985 });
  chain('chnR', 'shell', [[-CONT.hw - 0.04, 1.3, -0.95], [-CONT.hw - 0.08, 0.9, -0.93], [-CONT.hw - 0.1, 0.5, -0.92], [-CONT.hw - 0.1, 0.1, -0.92]], { plane: [-1, 0, 0, CONT.hw + 0.06], stiff: 0, damp: 0.985 });
  const KELP = [[1.23, -1.28, 2.45, 1.25], [1.23, -1.28, -0.2, 1.0], [-1.23, -1.28, 0.55, 1.45], [-1.23, -1.28, -2.3, 1.1], [0.55, -1.3, 3.0, 1.2], [-0.9, 1.28, 3.02, 1.35]];
  KELP.forEach((k, i) => { const [x, y, z, l] = k; const sx = Math.sign(x) * 0.07; chain('kelp' + i, 'shell', [[x, y, z], [x + sx, y - l * 0.36, z - 0.03], [x + sx * 1.6, y - l * 0.7, z - 0.08], [x + sx * 2, y - l, z - 0.1]], { plane: Math.abs(x) > 1 ? [Math.sign(x), 0, 0, CONT.hw + 0.02] : [0, 0, 1, CONT.hl + 0.02], stiff: 0.05, damp: 0.93, kelp: true, len: l }); });
  chain('flag', 'shell', [[-1.0, 2.74, -2.72], [-1.0, 2.74, -3.0], [-1.0, 2.74, -3.26], [-1.0, 2.74, -3.52]], { stiff: 0.04, damp: 0.95, flag: true, grav: 0.25 });
  // antennae are also verlet whips (anchored on the head)
  for (const s of ['L', 'R']) { const k = s === 'L' ? 1 : -1; CH.push({ name: 'ant' + s, parent: 'head', pts: HEAD.ant.map((p) => V3(p.x * k, p.y, p.z)), bones: [0, 1, 2, 3].map((i) => 'ant' + s + i), stiff: 0.55, damp: 0.9, grav: 0.1, ant: true }); }
  return { bones, by, rest, chains: CH };
}

// ------------------------------------------------------------------------------------------------ parts
/**
 * Builds every part into the material buckets. Returns { buckets, sockets, crackSites, tris }.
 * Buckets: steel (container + hard junk), cara (chitin), flesh (soft body), eye, junk (rubber/rope/plastic/kelp/flag).
 */
export function buildParts(rig, quality = 'high') {
  const q = QUALITY_K[quality] ?? 1;
  const S = (n, min = 3) => Math.max(min, Math.round(n * q));
  const B = { steel: new Bucket('steel'), cara: new Bucket('cara'), flesh: new Bucket('flesh'), eye: new Bucket('eye'), junk: new Bucket('junk') };
  const bi = (n) => rig.by[n].userData.i;
  const rnd = mulberry(1337);
  const CM = MC;                      // container frame
  const CMx = (m) => CM.clone().multiply(m);

  // ============================================================ CONTAINER (bone: shell)
  const shell = bi('shell');
  const { hl, hw, hh } = CONT;
  const WALL_H = 2.36, WALL_L = 5.86;
  // dents (panel space u,v per wall) — seeded, plus a big crumple on the front-left top corner (wall bonks)
  const dentsFor = (seed, extra = []) => { const r = mulberry(seed); const D = extra.slice(); for (let i = 0; i < 5; i++) D.push([r() * WALL_L, 0.3 + r() * (WALL_H - 0.6), 0.25 + r() * 0.35, 0.03 + r() * 0.06]); return D; };
  const dentFn = (D) => (u, v) => { let s = 0; for (const [du, dv, rr, dd] of D) { const x = (u - du) / rr, y = (v - dv) / rr; s += dd * Math.exp(-(x * x + y * y) * 1.6); } return s; };
  // holes: leg pass-throughs + phase-3 tear flaps (irregular)
  const legHoles = (side) => {
    // wall-local u for each leg hole (left wall u runs toward −z, right wall toward +z)
    const res = [];
    for (const k of [1, 2]) { const L = LEGS[side > 0 ? k : 3 + k]; const lc = L.hip.clone().lerp(L.cox, 0.55); const cl = lc.clone().applyMatrix4(CM.clone().invert()); res.push({ u: side > 0 ? 2.93 - cl.z : cl.z + 2.93, v: cl.y + 1.18, r: 0.46 }); }
    return res;
  };
  const tearC = { v0: -0.05 + 1.18, z0: -0.75, z1: 0.32, v1: 1.05 + 1.18 };
  const tearInside = (side, u, v) => {
    const z = side > 0 ? 2.93 - u : u - 2.93;
    const cz = (tearC.z0 + tearC.z1) / 2, hz = (tearC.z1 - tearC.z0) / 2, cv = (tearC.v0 + tearC.v1) / 2, hv = (tearC.v1 - tearC.v0) / 2;
    const dx = (z - cz) / hz, dy = (v - cv) / hv, a = Math.atan2(dy, dx);
    const rr = Math.pow(Math.pow(Math.abs(dx), 4) + Math.pow(Math.abs(dy), 4), 0.25);
    const j = 1 + 0.1 * Math.sin(a * 7 + side) + 0.06 * Math.sin(a * 13 + 2) + 0.05 * Math.sin(a * 23);
    return rr < j && dy > -0.99; // flat bottom edge = hinge line
  };
  const holeHit = (H, u, v) => { for (const h of H) { const dx = u - h.u, dy = v - h.v, a = Math.atan2(dy, dx); if (Math.hypot(dx, dy) < h.r * (1 + 0.14 * Math.sin(a * 6 + h.u * 3) + 0.08 * Math.sin(a * 11))) return true; } return false; };
  const nYw = S(12, 5);
  const sideWall = (side) => {
    const H = legHoles(side);
    const dents = dentsFor(side > 0 ? 11 : 23, side > 0 ? [[0.25, 2.0, 0.6, 0.13], [0.9, 2.2, 0.35, 0.07]] : [[5.5, 0.4, 0.5, 0.08]]);
    const dent = dentFn(dents);
    // wall frame: Z' = ±x, Y' = y, X' = Y' × Z'
    const m = side > 0 ? M().makeBasis(V3(0, 0, -1), V3(0, 1, 0), V3(1, 0, 0)).setPosition(hw, -1.18, 2.93) : M().makeBasis(V3(0, 0, 1), V3(0, 1, 0), V3(-1, 0, 0)).setPosition(-hw, -1.18, -2.93);
    const panelId = side > 0 ? 1 : 2;
    const g = corrPanel({ w: WALL_L, h: WALL_H, P: 0.28, depth: 0.05, nY: nYw, keep: (u, v) => !holeHit(H, u, v) && !tearInside(side, u, v), dent });
    B.steel.add(g, CMx(m), shell, [0, panelId, 1, 0]);
    // tear flap = the exact complement, on its own hinge bone
    const f = corrPanel({ w: WALL_L, h: WALL_H, P: 0.28, depth: 0.05, nY: nYw, keep: (u, v) => tearInside(side, u, v) && !holeHit(H, u, v), dent });
    B.steel.add(f, CMx(m), bi(side > 0 ? 'tearL' : 'tearR'), [0, panelId, 1, 1]);
    // torn petals around the leg holes (bent outward)
    for (const h of H) {
      const np = S(7, 5);
      for (let i = 0; i < np; i++) {
        const a0 = (i / np) * TAU + rnd() * 0.3, a1 = a0 + TAU / np * (0.55 + rnd() * 0.3), am = (a0 + a1) / 2;
        const r0 = h.r * 0.96, len = 0.14 + rnd() * 0.16, bend = 0.5 + rnd() * 0.6;
        const p0 = V3(h.u + Math.cos(a0) * r0, h.v + Math.sin(a0) * r0, 0), p1 = V3(h.u + Math.cos(a1) * r0, h.v + Math.sin(a1) * r0, 0);
        const tip = V3(h.u + Math.cos(am) * (r0 - len * Math.cos(bend)), h.v + Math.sin(am) * (r0 - len * Math.cos(bend)), len * Math.sin(bend));
        const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.Float32BufferAttribute([p0.x, p0.y, p0.z, p1.x, p1.y, p1.z, tip.x, tip.y, tip.z], 3));
        pg.setAttribute('uv', new THREE.Float32BufferAttribute([p0.x, p0.y, p1.x, p1.y, tip.x, tip.y], 2)); pg.computeVertexNormals();
        B.steel.add(pg, CMx(m), shell, [0, panelId, 0.8, 2]);
      }
    }
  };
  sideWall(1); sideWall(-1);
  // rear end wall (z = −hl, outward −z; X' = −x)
  {
    const m = M().makeBasis(V3(-1, 0, 0), V3(0, 1, 0), V3(0, 0, -1)).setPosition(1.1, -1.18, -hl + 0.02);
    B.steel.add(corrPanel({ w: 2.2, h: WALL_H, P: 0.27, depth: 0.045, nY: nYw, dent: dentFn([[0.5, 0.6, 0.4, 0.05], [1.7, 1.9, 0.3, 0.04]]) }), CMx(m), shell, [0, 3, 1, 0]);
  }
  // roof (outward +y; X' = x, Y' = −z), shallow ribs across, hatch openings cut
  const roofHoles = [[0.15, 0.95, -0.12, 0.72], [-0.95, -0.15, -0.12, 0.72], [-0.52, 0.52, -2.45, -1.62]];
  {
    const m = M().makeBasis(V3(1, 0, 0), V3(0, 0, -1), V3(0, 1, 0)).setPosition(-1.1, hh - 0.02, 2.93);
    const keep = (u, v) => { const x = u - 1.1, z = 2.93 - v; for (const [x0, x1, z0, z1] of roofHoles) if (x > x0 && x < x1 && z > z0 && z < z1) return false; return true; };
    const rm = CMx(m);
    B.steel.add(corrPanel({ w: 2.2, h: WALL_L, P: 0.46, depth: 0.022, nY: S(28, 12), keep, dent: dentFn([[0.4, 0.5, 0.5, 0.06], [1.6, 4.6, 0.4, 0.04]]) }), rm, shell, [0, 4, 1, 0]);
  }
  // floor: plank deck inside, steel belly plate + cross members outside
  {
    const deck = corrPanel({ w: 2.2, h: WALL_L, flat: true, nY: 8 });
    B.steel.add(deck, CMx(M().makeBasis(V3(1, 0, 0), V3(0, 0, -1), V3(0, 1, 0)).setPosition(-1.1, -hh + 0.16, 2.93)), shell, [6, 0, 0.55, 0]);
    const under = corrPanel({ w: 2.3, h: 6.0, flat: true, nY: 6 });
    B.steel.add(under, CMx(M().makeBasis(V3(1, 0, 0), V3(0, 0, 1), V3(0, -1, 0)).setPosition(-1.15, -hh + 0.02, -3.0)), shell, [1, 0, 0.5, 0]);
    for (let z = -2.7; z <= 2.8; z += 0.62) B.steel.add(box(2.3, 0.1, 0.08), CMx(TRS(0, -hh + 0.0, z)), shell, [1, 0, 0.6, 0]);
  }
  // frame: rails, corner posts, headers, castings (bevelled boxes)
  {
    const fr = (w, h, d, x, y, z, cls = 1, e = 0.22) => B.steel.add(box(w, h, d, e, 3), CMx(TRS(x, y, z)), shell, [cls, 0, 1, 0]);
    for (const s of [1, -1]) {
      fr(0.12, 0.17, 2 * hl, s * (hw - 0.05), -hh + 0.085, 0);      // bottom side rail
      fr(0.1, 0.12, 2 * hl, s * (hw - 0.04), hh - 0.06, 0);          // top side rail
      for (const e of [1, -1]) {
        fr(0.18, 2 * hh - 0.1, 0.15, s * (hw - 0.09), 0, e * (hl - 0.075));   // corner posts
        B.steel.add(box(0.2, 0.13, 0.19, 0.18, 3), CMx(TRS(s * (hw - 0.1), e > 0 ? hh - 0.065 : hh - 0.065, e * (hl - 0.095))), shell, [2, 1, 1, 0]);   // castings
        B.steel.add(box(0.2, 0.13, 0.19, 0.18, 3), CMx(TRS(s * (hw - 0.1), -hh + 0.065, e * (hl - 0.095))), shell, [2, 1, 1, 0]);
      }
    }
    fr(2 * hw, 0.2, 0.15, 0, hh - 0.1, hl - 0.075);   // door header
    fr(2 * hw, 0.18, 0.16, 0, -hh + 0.09, hl - 0.08); // door sill
    fr(2 * hw, 0.14, 0.12, 0, hh - 0.07, -hl + 0.06); // rear top rail
    fr(2 * hw, 0.16, 0.12, 0, -hh + 0.08, -hl + 0.06);
    // hatch coamings (raised rims) + lids
    for (const [x0, x1, z0, z1] of roofHoles) {
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, w = x1 - x0, d = z1 - z0;
      fr(w + 0.1, 0.08, 0.05, cx, hh + 0.02, z0 - 0.02, 1, 0.3); fr(w + 0.1, 0.08, 0.05, cx, hh + 0.02, z1 + 0.02, 1, 0.3);
      fr(0.05, 0.08, d, x0 - 0.02, hh + 0.02, cz, 1, 0.3); fr(0.05, 0.08, d, x1 + 0.02, hh + 0.02, cz, 1, 0.3);
    }
    // lids: barrel hatches hinge on the outer edge, brood hatch on the rear edge
    const lid = (bone, cx, cz, w, d, hingeX) => {
      B.steel.add(box(w + 0.06, 0.05, d + 0.06, 0.25, 3), CMx(TRS(cx, hh + 0.075, cz)), bi(bone), [0, 9, 1, 0]);
      B.steel.add(box(w * 0.7, 0.03, 0.05, 0.3, 2), CMx(TRS(cx, hh + 0.11, cz - d * 0.25)), bi(bone), [1, 0, 1, 0]);   // stiffener
      B.steel.add(box(w * 0.7, 0.03, 0.05, 0.3, 2), CMx(TRS(cx, hh + 0.11, cz + d * 0.25)), bi(bone), [1, 0, 1, 0]);
      const hd = new THREE.TorusGeometry(0.09, 0.018, 6, 10, PI); B.steel.add(hd, CMx(TRS(cx + (hingeX ? -Math.sign(cx) * w * 0.3 : 0), hh + 0.1, cz + (hingeX ? 0 : d * 0.32), 0, hingeX ? PI / 2 : 0, 0)), bi(bone), [2, 0, 1, 0]);
    };
    lid('hatchA', 0.55, 0.3, 0.8, 0.84, true); lid('hatchB', -0.55, 0.3, 0.8, 0.84, true); lid('hatchC', 0, -2.035, 1.04, 0.83, false);
    // barrels waiting under the barrel hatches (ink-filled, lids visible)
    for (const [bx, bz] of [[0.36, 0.1], [0.74, 0.5], [-0.4, 0.5], [-0.72, 0.08]]) {
      B.steel.add(new THREE.CylinderGeometry(0.2, 0.2, 0.5, S(12, 8)), CMx(TRS(bx, hh - 0.32, bz)), shell, [7, 0, 0.7, 0]);
    }
  }
  // door leaves: left folded back flat against the left wall, right one hangs half open on its own hinge bone
  {
    const leaf = (m, bone, id) => {
      B.steel.add(corrPanel({ w: 1.19, h: 2.36, P: 0.25, depth: 0.035, nY: S(6, 3), dent: dentFn([[0.4, 1.4, 0.3, 0.05]]) }), m, bone, [0, id, 1, 0]);
      // lock bars + cams + handles
      for (const u of [0.3, 0.86]) {
        B.steel.add(new THREE.CylinderGeometry(0.022, 0.022, 2.42, 6), m.clone().multiply(TRS(u, 1.18, 0.06)), bone, [2, 0, 1, 0]);
        for (const v of [0.1, 2.26]) B.steel.add(box(0.07, 0.09, 0.06, 0.3, 2), m.clone().multiply(TRS(u, v, 0.05)), bone, [2, 0, 1, 0]);
        B.steel.add(box(0.05, 0.3, 0.04, 0.3, 2), m.clone().multiply(TRS(u + 0.06, 1.0, 0.1, 0, 0, 0.9)), bone, [2, 0, 1, 0]);
      }
      for (const v of [0.35, 1.2, 2.0]) B.steel.add(box(0.1, 0.12, 0.05, 0.3, 2), m.clone().multiply(TRS(0.03, v, 0.03)), bone, [1, 0, 1, 0]);
    };
    // left: folded 270° to lie on the left wall, stencilled face out
    leaf(CMx(M().makeBasis(V3(0, 0, -1), V3(0, 1, 0), V3(1, 0, 0)).setPosition(hw + 0.1, -1.18, hl - 0.06)), shell, 5);
    // right: open ~115° (leaf runs forward/outward from the hinge)
    const ang = -2.0, dirX = V3(Math.cos(ang), 0, -Math.sin(ang));
    const zAx = V3().crossVectors(dirX, V3(0, 1, 0));
    leaf(CMx(M().makeBasis(dirX, V3(0, 1, 0), zAx).setPosition(-hw + 0.02, -1.18, hl + 0.03)), bi('doorR'), 6);
  }
  // ratchet straps over the roof and down both walls, with a buckle
  {
    for (const z of [1.72, -1.0]) {
      const pts = [[hw + 0.035, -1.05], [hw + 0.035, hh - 0.05], [hw - 0.1, hh + 0.03], [-hw + 0.1, hh + 0.03], [-hw - 0.035, hh - 0.05], [-hw - 0.035, -1.05]].map(([x, y]) => V3(x, y, z).applyMatrix4(CM));
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], b = pts[i + 1], len = a.distanceTo(b);
        const mid = a.clone().add(b).multiplyScalar(0.5), dir = b.clone().sub(a).normalize();
        const out = V3(0, 0, 1).applyMatrix4(M().extractRotation(CM));
        const fm = frameM(mid, dir, out);
        B.junk.add(new THREE.BoxGeometry(0.012, 0.11, len + 0.02), fm, shell, [3, 0, 1, 0]);
      }
      B.steel.add(box(0.1, 0.22, 0.16, 0.3, 2), CMx(TRS(hw + 0.07, 0.25, z)), shell, [2, 0, 1, 0]);
      B.steel.add(box(0.04, 0.26, 0.05, 0.3, 2), CMx(TRS(hw + 0.13, 0.35, z, 0, 0, 0.25)), shell, [2, 0, 1, 0]);
    }
  }
  // mast with nav lamp on the rear-right roof corner (the flag is a verlet chain)
  {
    const mb = V3(-1.0, hh, -2.72);
    B.steel.add(new THREE.CylinderGeometry(0.035, 0.05, 1.5, S(8, 6)), CMx(TRS(mb.x, mb.y + 0.75, mb.z)), shell, [2, 0, 1, 0]);
    B.steel.add(box(0.26, 0.05, 0.26, 0.3, 2), CMx(TRS(mb.x, mb.y + 0.03, mb.z)), shell, [1, 0, 1, 0]);
    B.steel.add(new THREE.CylinderGeometry(0.075, 0.08, 0.1, S(10, 6)), CMx(TRS(mb.x, mb.y + 1.53, mb.z)), shell, [1, 0, 1, 0]);
    B.junk.add(new THREE.SphereGeometry(0.075, S(10, 6), S(6, 4), 0, TAU, 0, PI / 2), CMx(TRS(mb.x, mb.y + 1.58, mb.z)), shell, [6, 0, 1, 0]);
    // guy wires
    for (const [dx, dz] of [[0.5, 0.2], [0.1, -0.3]]) { const a = cont(mb.x, mb.y + 1.2, mb.z), b = cont(mb.x + dx, hh + 0.02, mb.z + dz); B.junk.add(loft([a, b], { segs: 1, radial: 4, sec: () => ({ n: 0.008, b: 0.008 }) }), null, shell, [1, 0, 1, 0]); }
  }
  // crate lashed on the front-left roof + a coil of rope by the brood hatch
  {
    const cm = CMx(TRS(0.62, hh + 0.28, 1.85, 0, 0.18, 0));
    B.steel.add(box(0.62, 0.5, 0.52, 0.12, 3), cm, shell, [6, 1, 1, 0]);
    for (const y of [-0.2, 0.2]) B.steel.add(box(0.66, 0.06, 0.56, 0.2, 2), cm.clone().multiply(TRS(0, y, 0)), shell, [6, 2, 1, 0]);
    for (let i = 0; i < 3; i++) B.junk.add(new THREE.TorusGeometry(0.22 - i * 0.01, 0.035, S(6, 4), S(18, 10)), CMx(TRS(0.35, hh + 0.04 + i * 0.06, -1.25, PI / 2, 0, 0)), shell, [1, 0, 1, 0]);
    // lashing over the crate
    const la = [V3(0.28, hh + 0.02, 1.95), V3(0.36, hh + 0.56, 1.95), V3(0.88, hh + 0.56, 1.8), V3(0.98, hh + 0.02, 1.76)].map((p) => p.applyMatrix4(CM));
    B.junk.add(loft(la, { segs: 10, radial: 5, sec: () => ({ n: 0.018, b: 0.018 }) }), null, shell, [1, 0, 1, 0]);
  }
  // static chain draped across the roof front (ends continue as verlet chains chnL / chnR)
  const linkGeo = () => { const g = new THREE.TorusGeometry(0.06, 0.017, S(5, 4), S(10, 6)); g.scale(1, 1.55, 1); return g; };
  const linkM = (p, dir, i) => frameM(p, dir, UP).multiply(TRS(0, 0, 0, 0, 0, i % 2 ? PI / 2 : 0)).multiply(TRS(0, 0, 0, PI / 2, 0, 0));
  {
    const pts = [V3(hw + 0.02, hh - 0.02, 1.2), V3(0.5, hh + 0.05, 0.9), V3(-0.4, hh + 0.05, -0.4), V3(-hw - 0.02, hh - 0.02, -0.95)].map((p) => p.applyMatrix4(CM));
    const cur = new THREE.CatmullRomCurve3(pts); const L = cur.getLength(); const n = Math.floor(L / 0.15);
    for (let i = 0; i < n; i++) { const t = (i + 0.5) / n, p = cur.getPointAt(t), d = cur.getTangentAt(t); B.steel.add(linkGeo(), linkM(p, d, i), shell, [2, 2, 1, 0]); }
  }
  // interior darkness box around the abdomen (so the door never shows sky through the back)
  // (walls are double-sided in the material; back faces shade as dark interior)

  // ------------------------------------------------------------ barnacles (container rails + crab)
  const barnacleGeo = (r, h, seg) => {
    const pts = [V3(r * 1.02, -0.01), V3(r, 0), V3(r * 0.9, h * 0.45), V3(r * 0.62, h), V3(r * 0.5, h * 0.98), V3(r * 0.42, h * 0.55), V3(0.001, h * 0.55)];
    const g = new THREE.LatheGeometry(pts.map((p) => new THREE.Vector2(p.x, p.y)), seg); return g;
  };
  const scatterBarn = (bucket, bone, center, normal, count, spread, sizeK = 1, cls = 5) => {
    const t1 = V3().crossVectors(normal, Math.abs(normal.y) < 0.9 ? UP : V3(1, 0, 0)).normalize(), t2 = V3().crossVectors(normal, t1);
    for (let i = 0; i < count; i++) {
      const a = rnd() * TAU, rr = Math.sqrt(rnd()) * spread;
      const p = center.clone().addScaledVector(t1, Math.cos(a) * rr).addScaledVector(t2, Math.sin(a) * rr * 0.6);
      const r = (0.045 + rnd() * 0.07) * sizeK;
      const m = frameM(p, normal, t1); m.multiply(TRS(0, 0, 0, PI / 2, 0, 0)).multiply(TRS(0, 0, 0, 0, rnd() * TAU, 0));
      bucket.add(barnacleGeo(r, r * (0.7 + rnd() * 0.6), S(7, 5)), m, bone, [cls, rnd(), 0.9, 0]);
    }
  };
  {
    const nrm = (x, y, z) => V3(x, y, z).applyMatrix4(M().extractRotation(CM)).normalize();
    const nb = S(10, 4);
    scatterBarn(B.steel, shell, cont(hw + 0.02, -1.05, 1.9), nrm(1, 0, 0), nb, 0.45);
    scatterBarn(B.steel, shell, cont(hw + 0.02, -0.95, -2.2), nrm(1, 0, 0), nb, 0.5);
    scatterBarn(B.steel, shell, cont(-hw - 0.02, -1.0, 0.1), nrm(-1, 0, 0), nb, 0.55);
    scatterBarn(B.steel, shell, cont(-hw - 0.02, -0.7, -2.6), nrm(-1, 0.2, 0), nb, 0.4);
    scatterBarn(B.steel, shell, cont(0.3, -0.95, -hl - 0.02), nrm(0, 0, -1), nb, 0.6);
    scatterBarn(B.steel, shell, cont(0.2, -hh - 0.02, 1.5), nrm(0, -1, 0), nb, 0.7);
    scatterBarn(B.steel, shell, cont(-0.8, hh + 0.02, -0.1), nrm(0, 1, 0), S(6, 3), 0.3);
  }

  // ============================================================ HANGING JUNK (verlet chain bones)
  {
    // tyre fender on the right wall, hung by a rope pair from the top rail
    const t0 = rig.rest.tyre0, t1 = rig.rest.tyre1, tc = cont(-1.42, -0.12, 2.05);
    const tm = frameM(tc, V3(-1, 0, 0).applyMatrix4(M().extractRotation(CM)), UP);
    B.junk.add(new THREE.TorusGeometry(0.34, 0.15, S(10, 6), S(24, 12)), tm, bi('tyre1'), [0, 0, 1, 0]);
    B.junk.add(loft([t0, t1, tc.clone().add(V3(0, 0.44, 0))], { segs: 6, radial: 5, sec: () => ({ n: 0.022, b: 0.022 }) }), null, (p, i, t) => { SK.a = bi('tyre0'); SK.b = bi('tyre1'); SK.w = 1 - Math.min(1, Math.max(0, t * 2 - 0.5)); }, [1, 0, 1, 0]);
    // buoy on a short chain from the rear-left corner
    const bp = rig.rest; const bc = cont(1.42, -0.18, -3.2);
    B.junk.add(blob({ r: [0.3, 0.36, 0.3], e: 0.95, n: S(8, 4) }), TRS(bc.x, bc.y, bc.z), bi('buoy2'), [2, 0, 1, 0]);
    B.steel.add(new THREE.TorusGeometry(0.07, 0.02, 5, 10), TRS(bc.x, bc.y + 0.4, bc.z, 0, 0.3, 0), bi('buoy2'), [2, 0, 1, 0]);
    const bch = rig.chains.find((c) => c.name === 'buoy').pts; for (let k = 0; k < 3; k++) { const a = bch[k], b = bch[k + 1]; const n = Math.max(2, Math.round(a.distanceTo(b) / 0.14)); for (let i = 0; i < n; i++) { const p = a.clone().lerp(b, (i + 0.5) / n); const m = linkM(p, b.clone().sub(a), i); B.steel.add(linkGeo(), m, bi('buoy' + k), [2, 2, 1, 0]); } }
    // anchor on a chain from the rear top rail
    const ach = rig.chains.find((c) => c.name === 'anch').pts; for (let k = 0; k < 3; k++) { const a = ach[k], b = ach[k + 1]; const n = Math.max(2, Math.round(a.distanceTo(b) / 0.14)); for (let i = 0; i < n; i++) { const p = a.clone().lerp(b, (i + 0.5) / n); const m = linkM(p, b.clone().sub(a), i); B.steel.add(linkGeo(), m, bi('anch' + k), [2, 2, 1, 0]); } }
    {
      const ab = bi('anch3'), ap = bp.anch3.clone(); // anchor hangs from its ring at the chain end
      const m = frameM(ap, V3(0, 0, -1).applyMatrix4(M().extractRotation(CM)), UP);
      const A = (g, mm) => B.steel.add(g, m.clone().multiply(mm), ab, [8, 0, 1, 0]);
      A(new THREE.TorusGeometry(0.08, 0.022, 6, 12), TRS(0, -0.07, 0, 0, PI / 2, 0));
      A(new THREE.CylinderGeometry(0.045, 0.055, 0.95, S(8, 6)), TRS(0, -0.6, 0));                     // shank
      A(new THREE.CylinderGeometry(0.03, 0.03, 0.8, 6), TRS(0, -0.26, 0, 0, 0, PI / 2));                // stock
      for (const s of [1, -1]) { A(new THREE.SphereGeometry(0.045, 6, 4), TRS(s * 0.41, -0.26, 0)); }
      const arm = loft([V3(0, -1.05, 0), V3(0.22, -1.0, 0), V3(0.4, -0.84, 0), V3(0.48, -0.66, 0)], { segs: 8, radial: 6, sec: (t) => ({ n: 0.045, b: 0.05 - t * 0.012 }) });
      A(arm, M()); const arm2 = arm.clone(); A(arm2, TRS(0, 0, 0, 0, PI, 0));
      for (const s of [1, -1]) A(blob({ r: [0.1, 0.16, 0.03], e: 0.7, n: 3 }), TRS(s * 0.45, -0.72, 0, 0, 0, -s * 0.6));
      A(new THREE.ConeGeometry(0.06, 0.12, 6), TRS(0, -1.11, 0, PI));
    }
    // side chain ends
    for (const nm of ['chnL', 'chnR']) { const ch = rig.chains.find((c) => c.name === nm); for (let k = 0; k < ch.bones.length; k++) { const a = ch.pts[k], b = ch.pts[k + 1]; const n = Math.max(2, Math.round(a.distanceTo(b) / 0.14)); for (let i = 0; i < n; i++) { const p = a.clone().lerp(b, (i + 0.5) / n); const m = linkM(p, b.clone().sub(a), i); B.steel.add(linkGeo(), m, bi(ch.bones[k]), [2, 2, 1, 0]); } } }
    // life ring lashed on the rear wall
    const lr = cont(0.6, 0.15, -hl - 0.1); const lm = frameM(lr, V3(0, 0, -1).applyMatrix4(M().extractRotation(CM)), UP);
    B.junk.add(new THREE.TorusGeometry(0.34, 0.085, S(10, 6), S(28, 14)), lm, shell, [2, 1, 1, 0]);
    // kelp strands (ribbons skinned along their chain)
    for (const ch of rig.chains.filter((c) => c.kelp)) {
      const w0 = 0.24 + rnd() * 0.1, ph = rnd() * 6;
      const g = ribbon(ch.pts, { segs: S(10, 5), across: 2, width: (t) => w0 * (0.55 + 0.6 * Math.sin(Math.min(1, t * 1.3) * PI * 0.9)) * (1 - t * 0.4), ruffle: (t, s) => Math.abs(s) > 0.4 ? Math.sin(t * 28 + ph) * 0.025 : 0, up: V3(0, 0, 1).applyMatrix4(M().extractRotation(CM)) });
      const nb = ch.bones.length;
      B.junk.add(g, null, (p, i, t) => { const f = t * nb; const k = Math.min(nb - 1, Math.floor(f)), fr = f - k; SK.a = bi(ch.bones[k]); SK.b = bi(ch.bones[Math.min(nb - 1, k + 1)]); SK.w = fr < 0.5 ? 1 : 1 - (fr - 0.5); }, (p, n, i, t) => { MA[0] = 4; MA[1] = t; MA[2] = 1; MA[3] = ph; });
    }
    // torn pennant flag
    {
      const ch = rig.chains.find((c) => c.flag); const P = ch.pts;
      const pos = [], uv = [], tt = [], idx = [];
      const n = S(10, 4), rows = 3;
      for (let i = 0; i <= n; i++) {
        const t = i / n; const p = new THREE.CatmullRomCurve3(P).getPointAt(t);
        const hgt = 0.46 * (1 - t * 0.55) * (t > 0.8 ? 1 - (t - 0.8) * 1.2 : 1);
        for (let j = 0; j <= rows; j++) { const s = j / rows; pos.push(p.x, p.y - s * hgt, p.z); uv.push(t, s); tt.push(t); }
      }
      for (let i = 0; i < n; i++) for (let j = 0; j < rows; j++) { const a = i * (rows + 1) + j, b = a + 1, c = a + rows + 1, d = c + 1; if (i > n * 0.75 && j === rows - 1 && (i % 2)) continue; idx.push(a, c, b, b, c, d); }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals(); g.userData.t = tt;
      const nb = ch.bones.length;
      B.junk.add(g, null, (p, i, t) => { const f = t * nb; const k = Math.min(nb - 1, Math.floor(f)), fr = f - k; SK.a = bi(ch.bones[k]); SK.b = bi(ch.bones[Math.min(nb - 1, k + 1)]); SK.w = 1 - fr * 0.5; }, (p, nn, i, t, u, v) => { MA[0] = 5; MA[1] = u; MA[2] = 1; MA[3] = v; });
    }
  }

  // ============================================================ CRAB
  const body = bi('body'), head = bi('head');
  // abdomen: the big soft sac filling the container (seen through the door, leg holes, tears)
  {
    const ab = bi('abdomen');
    const g = blob({ r: [1.06, 1.12, 2.86], e: 0.9, n: S(14, 6), disp: (d, p) => { p.multiplyScalar(1 + 0.05 * Math.sin(p.z * 5.5)); } });
    B.flesh.add(g, CMx(TRS(0, -0.08, 0.05)), ab, (p, n) => { MA[0] = 2; MA[1] = 0; MA[2] = 0.7; MA[3] = 0; });
  }
  // cephalothorax shield
  {
    const c = HEAD.cara;
    const g = blob({ r: [1.06, 0.56, 1.0], e: 0.72, n: S(16, 7), disp: (d, p) => {
      if (p.y < 0) p.y *= 0.62;
      p.y += 0.1 * (1 - Math.min(1, Math.abs(p.x))) * Math.max(0, d.y);    // crown
      p.y -= 0.06 * Math.exp(-Math.pow((Math.abs(p.x) - 0.42) * 7, 2)) * Math.max(0, d.y) * (p.z < 0.3 ? 1 : 0.3);   // branchial grooves
      p.z += Math.max(0, d.z) * 0.12 * Math.max(0, d.y + 0.2);              // brow overhang
      const k = Math.sin(p.x * 11 + p.z * 3) * Math.sin(p.z * 9 - p.x * 2) * Math.max(0, d.y);
      p.addScaledVector(d, 0.018 * k);
    } });
    B.cara.add(g, TRS(c.x, c.y, c.z), head, (p, n) => { MA[0] = 0; MA[1] = Math.max(0, Math.min(0.88, 0.48 - n.y * 0.5)); MA[2] = 1; MA[3] = 0; });
    // rostrum + brow ridge spines + lateral spines
    B.cara.add(new THREE.ConeGeometry(0.1, 0.42, S(8, 5)), frameM(V3(0, 2.73, 3.25), V3(0, 0.25, 1), UP).multiply(TRS(0, 0, 0.1, PI / 2, 0, 0)), head, [1, 0.2, 1, 0]);
    for (const s of [1, -1]) {
      for (let i = 0; i < 5; i++) {
        const a = 0.5 + i * 0.26; const p = V3(s * Math.sin(a) * 1.02, c.y + 0.02 - i * 0.02, c.z + Math.cos(a) * 0.96);
        const dir = V3(s * Math.sin(a), 0.18, Math.cos(a) * 0.9 + 0.2).normalize();
        B.cara.add(new THREE.ConeGeometry(0.085 - i * 0.008, 0.36 - i * 0.04, 6), frameM(p, dir, UP).multiply(TRS(0, 0, 0.1, PI / 2, 0, 0)), head, [1, 0.3, 1, 0]);
      }
      // frontal teeth along the brow between the eye stalks
      for (let i = 0; i < 3; i++) { const x = s * (0.12 + i * 0.16); B.cara.add(new THREE.ConeGeometry(0.05, 0.2, 5), frameM(V3(x, c.y + 0.1 - i * 0.02, c.z + 0.97 - i * 0.03), V3(x * 0.4, -0.15, 1), UP).multiply(TRS(0, 0, 0.06, PI / 2, 0, 0)), head, [1, 0.25, 1, 0]); }
      // brow ridges over the stalk sockets
      B.cara.add(blob({ r: [0.2, 0.09, 0.16], e: 0.8, n: 4 }), TRS(s * 0.36, 2.77, 3.0, 0.3, 0, s * 0.2), head, [0, 0.1, 1, 0]);
    }
    // mouthparts: layered maxilliped plates under the nozzle (mandible bones flap them in the roar)
    for (const s of [1, -1]) {
      const mb = bi('mand' + (s > 0 ? 'L' : 'R'));
      for (let i = 0; i < 3; i++) B.cara.add(blob({ r: [0.14, 0.24 - i * 0.03, 0.06], e: 0.75, n: 4 }), TRS(s * (0.12 + i * 0.1), 1.67 - i * 0.03, 3.05 - i * 0.12, -0.2, s * 0.3, s * 0.15), mb, [0, 0.6, 0.85, 0]);
      // little bristle fringe
      for (let i = 0; i < 5; i++) B.cara.add(new THREE.ConeGeometry(0.012, 0.12, 3), TRS(s * (0.05 + i * 0.05), 1.43, 3.06, PI, 0, s * 0.2), mb, [1, 0.9, 1, 0]);
    }
  }
  // siphon + brass ink-cannon nozzle
  {
    const sb = bi('siphon'), nb = bi('nozzle');
    B.flesh.add(loft([V3(0, 1.95, 2.72), V3(0, 1.98, 3.02), HEAD.nozzle.clone().add(V3(0, 0, 0.06))], { segs: 6, radial: S(12, 8), sec: (t) => ({ n: 0.3 - t * 0.04, b: 0.33 - t * 0.05 }), rmod: (t, a) => 1 + 0.06 * Math.sin(t * 20) }), null, (p, i, t) => { SK.a = sb; SK.b = nb; SK.w = 1 - Math.max(0, t - 0.6) * 2.5; }, [3, 0, 0.9, 0]);
    const prof = [[0.0, 0.2], [0.19, 0.2], [0.2, 0.26], [0.16, 0.3], [0.15, 0.42], [0.13, 0.46], [0.14, 0.5], [0.135, 0.54], [0.1, 0.56], [0.09, 0.62], [0.12, 0.7], [0.13, 0.72], [0.09, 0.74], [0.07, 0.6], [0.05, 0.3]];
    const lg = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r * 1.45, (y - 0.2) * 1.5)), S(18, 10));
    const m = frameM(HEAD.nozzle, V3(0, 0, 1), UP).multiply(TRS(0, 0, 0, PI / 2, 0, 0));
    B.steel.add(lg, m, nb, (p, n) => { const lp = p.clone().sub(HEAD.nozzle); const r = Math.hypot(lp.x, lp.y); MA[0] = 3; MA[1] = lp.z > 0.66 && r < 0.125 ? 1 : 0; MA[2] = 1; MA[3] = 0; });
    B.steel.add(new THREE.TorusGeometry(0.27, 0.03, 5, S(16, 10)), frameM(HEAD.nozzle.clone().add(V3(0, 0, 0.03)), V3(0, 0, 1), UP), nb, [2, 0, 1, 0]);   // hose clamp
    B.steel.add(new THREE.TorusGeometry(0.2, 0.022, 5, S(16, 10)), frameM(HEAD.nozzle.clone().add(V3(0, 0, 0.62)), V3(0, 0, 1), UP), nb, [3, 0, 1, 0]);
  }
  // eye stalks + eyes
  for (const s of ['L', 'R']) {
    const k = s === 'L' ? 1 : -1, st = HEAD.stalk.map((p) => V3(p.x * k, p.y, p.z));
    const b0 = bi('stalk' + s + '0'), b1 = bi('stalk' + s + '1'), be = bi('eye' + s);
    const eyeC = st[2];
    const tube = loft([st[0].clone().add(V3(0, -0.08, -0.04)), st[1], eyeC.clone().add(V3(0, -0.12, 0))], { segs: S(10, 6), radial: S(10, 6), sec: (t) => ({ n: 0.12 - t * 0.035, b: 0.12 - t * 0.035 }), rmod: (t) => 1 + 0.1 * Math.pow(Math.max(0, Math.sin(t * 22)), 4) });
    B.cara.add(tube, null, (p, i, t) => { if (t < 0.5) { SK.a = b0; SK.b = b1; SK.w = 1 - Math.max(0, (t - 0.3) / 0.2) * 0.5; } else { SK.a = b1; SK.b = be; SK.w = 1 - Math.max(0, (t - 0.8) / 0.2) * 0.8; } }, (p, n, i, t) => { MA[0] = 0; MA[1] = 0.35 + t * 0.2; MA[2] = 1; MA[3] = 0; });
    // collar cup + eye bulb (eye bulb: aM.yzw = local unit direction → patterns)
    B.cara.add(new THREE.TorusGeometry(0.2, 0.06, 6, S(14, 8)), TRS(eyeC.x, eyeC.y - 0.1, eyeC.z, PI / 2 - 0.15, 0, 0), be, [0, 0.4, 1, 0]);
    const eg = new THREE.SphereGeometry(HEAD.eyeR, S(20, 12), S(14, 8)); eg.scale(1, 1.18, 1.05);
    B.eye.add(eg, TRS(eyeC.x, eyeC.y + 0.1, eyeC.z), be, (p, n) => { const d = p.clone().sub(eyeC).sub(V3(0, 0.1, 0)).normalize(); MA[0] = k; MA[1] = d.x; MA[2] = d.y; MA[3] = d.z; });
    // antenna whips + short antennules
    const an = HEAD.ant.map((p) => V3(p.x * k, p.y, p.z));
    const ab = [0, 1, 2, 3].map((i) => bi('ant' + s + i));
    B.cara.add(loft(an, { segs: S(20, 10), radial: 5, sec: (t) => ({ n: 0.045 * (1 - t) + 0.008, b: 0.045 * (1 - t) + 0.008 }) }), null, (p, i, t) => { const f = t * 4; const kk = Math.min(3, Math.floor(f)), fr = f - kk; SK.a = ab[kk]; SK.b = ab[Math.min(3, kk + 1)]; SK.w = 1 - fr * 0.6; }, (p, n, i, t, u, v) => { MA[0] = 0; MA[1] = 0.55; MA[2] = 1; MA[3] = 2 + v; });
    B.cara.add(loft([V3(0.08 * k, 2.55, 3.22), V3(0.2 * k, 2.85, 3.6), V3(0.35 * k, 3.0, 3.75)], { segs: 6, radial: 5, sec: (t) => ({ n: 0.035 * (1 - t) + 0.01, b: 0.035 * (1 - t) + 0.01 }) }), null, head, [0, 0.6, 1, 0]);
  }
  // soft segmented belly poking out under the head
  {
    const segs = [[V3(0, 1.33, 2.4), [0.62, 0.34, 0.36]], [V3(0, 1.37, 2.02), [0.7, 0.38, 0.38]], [V3(0, 1.47, 1.62), [0.76, 0.42, 0.4]], [V3(0, 1.61, 1.22), [0.8, 0.46, 0.42]]];
    segs.forEach(([c, r], i) => {
      const bn = bi(i < 2 ? 'belly0' : 'belly1');
      B.flesh.add(blob({ r, e: 0.9, n: S(8, 4), disp: (d, p) => { if (d.y > 0.3) p.y *= 0.8; } }), TRS(c.x, c.y, c.z, -0.25), bn, (p, n) => { MA[0] = 1; MA[1] = i; MA[2] = 0.85; MA[3] = 0; });
    });
    // the thorax skirt connecting belly → carapace → door
    B.flesh.add(blob({ r: [1.0, 0.55, 0.9], e: 0.9, n: S(8, 4) }), TRS(0, 1.85, 1.7), body, [0, 0, 0.6, 0]);
  }

  // ------------------------------------------------------------ CLAWS
  const spineRow = (bucket, bone, a, b, up, n, h0, h1, cls = 1, param = 0.3) => {
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n; const p = a.clone().lerp(b, t);
      const dir = up.clone().normalize().add(b.clone().sub(a).normalize().multiplyScalar(0.45)).normalize();
      const h = h0 + (h1 - h0) * t;
      bucket.add(new THREE.ConeGeometry(h * 0.3, h, 6), frameM(p.clone().addScaledVector(up, 0.02), dir, UP).multiply(TRS(0, 0, h * 0.4, PI / 2, 0, 0)), bone, [cls, param, 1, 0]);
    }
  };
  for (const A of ARMS) {
    const s = A.name, k = A.crusher ? 1 : 0.7;
    const b0 = bi('arm' + s + '0'), b1 = bi('arm' + s + '1'), bc = bi('claw' + s), bd = bi('dact' + s);
    const glow = A.crusher ? 1 : 0;
    // shoulder membrane + coxa ring
    B.flesh.add(blob({ r: [0.3 * k + 0.05, 0.3 * k + 0.05, 0.3 * k + 0.05], n: 5 }), TRS(A.S.x, A.S.y, A.S.z), b0, [0, 0, 0.8, 0]);
    // merus (upper arm): boxy-round, spined on top
    const up0 = V3().crossVectors(A.side0, A.E.clone().sub(A.S)).normalize(); if (up0.y < 0) up0.negate();
    B.cara.add(loft([A.S, A.S.clone().lerp(A.E, 0.5).addScaledVector(up0, 0.08), A.E], { segs: S(8, 5), radial: S(12, 8), up: up0, sec: (t) => ({ n: (0.3 + 0.06 * Math.sin(t * PI)) * k, b: (0.25 + 0.04 * Math.sin(t * PI)) * k, e: 2.6 }) }), null, b0, (p, n, i, t) => { MA[0] = 0; MA[1] = 0.25 - n.y * 0.25; MA[2] = 1; MA[3] = glow * 0.3; });
    spineRow(B.cara, b0, A.S.clone().lerp(A.E, 0.15).addScaledVector(up0, 0.26 * k), A.E.clone().addScaledVector(up0, 0.22 * k), up0, 3, 0.2 * k, 0.26 * k);
    // elbow membrane
    B.flesh.add(blob({ r: [0.26 * k, 0.26 * k, 0.26 * k], n: 4 }), TRS(A.E.x, A.E.y, A.E.z), b1, [0, 0, 0.8, 0]);
    // carpus (forearm): knobby, widening to the wrist
    const up1 = V3().crossVectors(A.side0, A.W.clone().sub(A.E)).normalize(); if (up1.y < 0) up1.negate();
    B.cara.add(loft([A.E, A.W.clone().addScaledVector(A.D, 0.12)], { segs: S(6, 4), radial: S(12, 8), up: up1, sec: (t) => ({ n: (0.27 + 0.12 * t) * k, b: (0.24 + 0.08 * t) * k, e: 2.4 }), rmod: (t, a) => 1 + 0.07 * Math.pow(Math.max(0, Math.sin(a * 3 + t * 9)), 6) }), null, b1, (p, n) => { MA[0] = 0; MA[1] = 0.25 - n.y * 0.25; MA[2] = 1; MA[3] = glow * 0.5; });
    spineRow(B.cara, b1, A.E.clone().addScaledVector(up1, 0.3 * k), A.W.clone().addScaledVector(up1, 0.36 * k), up1, 2, 0.16 * k, 0.2 * k);
    // claw (propodus) in its own frame: +Z along the claw, +Y up
    const CF = frameM(A.W, A.D, A.U);
    const C = (g, m, bone, mat) => B.cara.add(g, CF.clone().multiply(m), bone, mat);
    if (A.crusher) {
      // bulbous palm with tubercles and a keel ridge
      C(blob({ r: [0.46, 0.58, 0.74], e: 0.82, n: S(14, 7), disp: (d, p) => {
        p.z += 0.62; if (d.z < -0.2) p.z = 0.62 + (p.z - 0.62) * 0.8;
        const tub = Math.pow(Math.max(0, Math.sin(p.x * 17) * Math.sin(p.y * 15 + p.z * 5) * Math.sin(p.z * 13)), 3);
        p.addScaledVector(d, 0.05 * tub * (d.x > 0 ? 1 : 0.4));
        if (d.y > 0.55) p.y += 0.05 * Math.max(0, 1 - Math.abs(d.x) * 4);   // keel
      } }), M(), bc, (p, n) => { MA[0] = 0; MA[1] = Math.max(0, Math.min(1, 0.45 - n.y * 0.45)); MA[2] = 1; MA[3] = 1; });
      // fixed finger (pollex): lower front, curving up
      const pol = [V3(0, -0.24, 1.0), V3(0, -0.22, 1.45), V3(0, -0.1, 1.86), V3(0, 0.05, 2.08)];
      C(loft(pol, { segs: S(10, 6), radial: S(12, 8), sec: (t) => ({ n: 0.26 * (1 - t * 0.78), b: 0.2 * (1 - t * 0.7), e: 2.3 }) }), M(), bc, (p, n, i, t) => { MA[0] = 0; MA[1] = 0.6 + t * 0.4; MA[2] = 1; MA[3] = 1; });
      // dactyl (movable finger): hinge top-front, hooking down
      const hl0 = A.hinge.clone().applyMatrix4(CF.clone().invert());
      const dac = [hl0.clone().add(V3(0, 0.02, -0.04)), hl0.clone().add(V3(0, 0.08, 0.45)), hl0.clone().add(V3(0, -0.04, 0.88)), hl0.clone().add(V3(0, -0.24, 1.12))];
      C(loft(dac, { segs: S(10, 6), radial: S(12, 8), sec: (t) => ({ n: 0.24 * (1 - t * 0.78), b: 0.19 * (1 - t * 0.68), e: 2.3 }) }), M(), bd, (p, n, i, t) => { MA[0] = 0; MA[1] = 0.55 + t * 0.45; MA[2] = 1; MA[3] = 1; });
      C(blob({ r: [0.2, 0.2, 0.2], n: 4 }), TRS(hl0.x, hl0.y, hl0.z), bd, [0, 0.3, 1, 1]);
      // crushing molars + serrated saw edge (the "serrated edge" of the crusher)
      for (let i = 0; i < 6; i++) {
        const t = 0.12 + i * 0.14;
        const pp = new THREE.CatmullRomCurve3(pol).getPointAt(t); const sz = 0.1 * (1 - t * 0.5);
        C(blob({ r: [sz * 0.9, sz * 0.7, sz * 1.1], e: 0.9, n: 3 }), TRS(pp.x, pp.y + 0.17 * (1 - t * 0.7), pp.z), bc, [2, 0, 1, 0]);
        const dp = new THREE.CatmullRomCurve3(dac).getPointAt(t);
        C(new THREE.ConeGeometry(sz * 0.8, sz * 2.1, 4), TRS(dp.x, dp.y - 0.15 * (1 - t * 0.7), dp.z, PI, 0, 0.1), bd, [2, 0, 1, 0]);
      }
      for (let i = 0; i < 7; i++) C(new THREE.ConeGeometry(0.07, 0.2, 4), TRS(0, 0.58 + Math.sin(i / 6 * PI) * 0.06, 0.1 + i * 0.16, -0.5), bc, [1, 0.3, 1, 1]);   // saw ridge
      // barnacles glued to the crusher (character)
      { const sd = V3().crossVectors(A.U, A.D).normalize(); scatterBarn(B.cara, bc, A.W.clone().addScaledVector(A.D, 0.6).addScaledVector(sd, 0.47).addScaledVector(A.U, -0.12), sd.clone().addScaledVector(A.U, -0.3).normalize(), S(6, 2), 0.22, 0.9, 3); }
    } else {
      C(blob({ r: [0.28, 0.36, 0.56], e: 0.84, n: S(12, 6), disp: (d, p) => { p.z += 0.45; if (d.y > 0.6) p.y += 0.04 * Math.max(0, 1 - Math.abs(d.x) * 5); } }), M(), bc, (p, n) => { MA[0] = 0; MA[1] = Math.max(0, Math.min(1, 0.45 - n.y * 0.45)); MA[2] = 1; MA[3] = 0; });
      const pol = [V3(0, -0.14, 0.78), V3(0, -0.13, 1.15), V3(0, -0.06, 1.5), V3(0, 0.04, 1.66)];
      C(loft(pol, { segs: S(10, 6), radial: S(10, 6), sec: (t) => ({ n: 0.15 * (1 - t * 0.85), b: 0.12 * (1 - t * 0.8), e: 2.2 }) }), M(), bc, (p, n, i, t) => { MA[0] = 0; MA[1] = 0.6 + t * 0.4; MA[2] = 1; MA[3] = 0; });
      const hl0 = A.hinge.clone().applyMatrix4(CF.clone().invert());
      const dac = [hl0.clone().add(V3(0, 0, -0.04)), hl0.clone().add(V3(0, 0.05, 0.36)), hl0.clone().add(V3(0, -0.02, 0.72)), hl0.clone().add(V3(0, -0.14, 0.9))];
      C(loft(dac, { segs: S(10, 6), radial: S(10, 6), sec: (t) => ({ n: 0.14 * (1 - t * 0.85), b: 0.11 * (1 - t * 0.8), e: 2.2 }) }), M(), bd, (p, n, i, t) => { MA[0] = 0; MA[1] = 0.55 + t * 0.45; MA[2] = 1; MA[3] = 0; });
      C(blob({ r: [0.12, 0.12, 0.12], n: 3 }), TRS(hl0.x, hl0.y, hl0.z), bd, [0, 0.3, 1, 0]);
      for (let i = 0; i < 7; i++) {
        const t = 0.1 + i * 0.12;
        const pp = new THREE.CatmullRomCurve3(pol).getPointAt(t), dp = new THREE.CatmullRomCurve3(dac).getPointAt(t);
        C(new THREE.ConeGeometry(0.03, 0.1, 4), TRS(pp.x, pp.y + 0.1 * (1 - t * 0.8), pp.z, 0, 0, 0), bc, [2, 0, 1, 0]);
        C(new THREE.ConeGeometry(0.03, 0.1, 4), TRS(dp.x, dp.y - 0.1 * (1 - t * 0.8), dp.z, PI, 0, 0), bd, [2, 0, 1, 0]);
      }
      for (let i = 0; i < 4; i++) C(new THREE.ConeGeometry(0.04, 0.13, 4), TRS(0, 0.36, 0.1 + i * 0.2, -0.5), bc, [1, 0.3, 1, 0]);
    }
  }

  // ------------------------------------------------------------ LEGS (striped, spined, spiky dactyl tips)
  LEGS.forEach((L, li) => {
    const bc = bi('leg' + li + 'c'), bm = bi('leg' + li + 'm'), bt = bi('leg' + li + 't'), bd = bi('leg' + li + 'd');
    const up = V3().crossVectors(L.side0, L.knee.clone().sub(L.cox)).normalize(); if (up.y < 0) up.negate();
    // coxa: stubby, and a flesh grommet where the leg exits the container wall
    B.cara.add(loft([L.hip, L.cox], { segs: 3, radial: S(10, 6), sec: () => ({ n: 0.24, b: 0.22, e: 2.4 }) }), null, bc, [0, 0.4, 0.9, 0]);
    if (li % 3) { const gp = L.hip.clone().lerp(L.cox, 0.55); B.flesh.add(new THREE.TorusGeometry(0.28, 0.1, 6, S(14, 8)), frameM(gp, L.cox.clone().sub(L.hip), UP), bc, [0, 0, 0.7, 0]); }
    B.flesh.add(blob({ r: [0.17, 0.17, 0.17], n: 4 }), TRS(L.cox.x, L.cox.y, L.cox.z), bm, [0, 1, 0.4, 0]);
    // merus: long, boxy-round, spined along the top
    const km = L.cox.clone().lerp(L.knee, 0.5).addScaledVector(up, 0.06);
    B.cara.add(loft([L.cox, km, L.knee], { segs: S(10, 6), radial: S(12, 8), up, rmod: (t, a) => 1 + 0.12 * Math.pow(Math.max(0, Math.cos(a)), 10) - 0.05 * Math.pow(Math.max(0, -Math.cos(a)), 6), sec: (t) => ({ n: 0.26 + 0.05 * Math.sin(t * PI) + 0.05 * Math.pow(t, 6) - 0.04 * t, b: 0.17 + 0.025 * Math.sin(t * PI) + 0.03 * Math.pow(t, 6) - 0.03 * t, e: 2.9 }) }), null, bm, (p, n, i, t, u, v) => { MA[0] = 0; MA[1] = 0.3 - n.y * 0.2; MA[2] = 1; MA[3] = 10 + t; });
    spineRow(B.cara, bm, L.cox.clone().lerp(L.knee, 0.2).addScaledVector(up, 0.24), L.knee.clone().addScaledVector(up, 0.2), up, 4, 0.16, 0.26);
    B.flesh.add(blob({ r: [0.14, 0.14, 0.14], n: 4 }), TRS(L.knee.x, L.knee.y, L.knee.z), bt, [0, 1, 0.4, 0]);
    B.cara.add(new THREE.ConeGeometry(0.07, 0.3, 6), frameM(L.knee.clone().addScaledVector(up, 0.16), up.clone().addScaledVector(L.out, 0.6), UP).multiply(TRS(0, 0, 0.1, PI / 2, 0, 0)), bm, [1, 0.3, 1, 0]);
    // tibia (carpus + propodus)
    const up2 = V3().crossVectors(L.side0, L.ankle.clone().sub(L.knee)).normalize(); if (up2.y < 0) up2.negate();
    B.cara.add(loft([L.knee, L.knee.clone().lerp(L.ankle, 0.5).addScaledVector(L.out, 0.05), L.ankle], { segs: S(10, 6), radial: S(10, 6), up: up2, sec: (t) => ({ n: 0.22 - t * 0.075 + 0.035 * Math.exp(-Math.pow((t - 0.42) * 9, 2)) + 0.03 * Math.exp(-Math.pow(t * 10, 2)), b: 0.16 - t * 0.055, e: 2.7 }) }), null, bt, (p, n, i, t) => { MA[0] = 0; MA[1] = 0.3 - n.y * 0.2; MA[2] = 1; MA[3] = 11 + t; });
    spineRow(B.cara, bt, L.knee.clone().lerp(L.ankle, 0.25).addScaledVector(L.out, 0.12), L.knee.clone().lerp(L.ankle, 0.8).addScaledVector(L.out, 0.1), L.out.clone().add(V3(0, 0.3, 0)), 2, 0.12, 0.1);
    // dactyl: curved black-tipped spike + side spinelets
    const ft = L.foot, an = L.ankle;
    const dm = an.clone().lerp(ft, 0.5).addScaledVector(L.out, 0.08);
    B.cara.add(loft([an, dm, ft], { segs: S(8, 5), radial: S(8, 6), up: L.out, sec: (t) => ({ n: 0.14 * Math.pow(1 - t, 0.8) + 0.006, b: 0.12 * Math.pow(1 - t, 0.8) + 0.006 }), cap0: true }), null, bd, (p, n, i, t) => { MA[0] = 1; MA[1] = t; MA[2] = 1; MA[3] = 12 + t; });
    for (let i = 0; i < 3; i++) { const t = 0.2 + i * 0.22, p = an.clone().lerp(ft, t); B.cara.add(new THREE.ConeGeometry(0.025, 0.12, 4), frameM(p.clone().addScaledVector(L.out, 0.06), L.out.clone().add(V3(0, -0.8, 0)), UP).multiply(TRS(0, 0, 0.05, PI / 2, 0, 0)), bd, [1, 0.6, 1, 0]); }
    B.flesh.add(blob({ r: [0.1, 0.1, 0.1], n: 3 }), TRS(an.x, an.y, an.z), bd, [0, 1, 0.4, 0]);
    // a barnacle or two on the outer legs
    if (li % 3 === 1) scatterBarn(B.cara, bm, L.cox.clone().lerp(L.knee, 0.4).addScaledVector(up, 0.12), up, 3, 0.15, 0.8, 3);
  });

  // ------------------------------------------------------------ sockets (bone + model-space rest point)
  const sockets = {
    clawL: ['clawL', ARMS[0].W.clone().addScaledVector(ARMS[0].D, 1.05)], clawR: ['clawR', ARMS[1].W.clone().addScaledVector(ARMS[1].D, 0.9)],
    cannon: ['nozzle', HEAD.nozzleTip.clone()], mouth: ['head', HEAD.mouth.clone()],
    eyeL: ['eyeL', V3(HEAD.stalk[2].x, HEAD.stalk[2].y + 0.1, HEAD.stalk[2].z)], eyeR: ['eyeR', V3(-HEAD.stalk[2].x, HEAD.stalk[2].y + 0.1, HEAD.stalk[2].z)],
    belly: ['belly0', V3(0, 1.25, 2.25)], shellTop: ['shell', cont(0, hh + 0.2, 0.3)], hatch: ['hatchC', cont(0, hh + 0.2, -2.05)],
    body: ['body', V3(0, 2.15, 1.6)], shellMid: ['shell', cont(0, 0, 0.9)], shellRear: ['shell', cont(0, 0.1, -1.7)],
    crackL: ['abdomen', cont(hw - 0.1, 0.5, -0.22)], crackR: ['abdomen', cont(-hw + 0.1, 0.5, -0.22)],
  };
  LEGS.forEach((L, i) => { sockets['foot' + (i < 3 ? 'L' : 'R') + (i % 3)] = ['leg' + i + 'd', L.foot.clone()]; });
  // steam vents (phase 3) — container space
  const vents = [['tearL', cont(hw + 0.1, 0.55, -0.2)], ['tearR', cont(-hw - 0.1, 0.55, -0.2)], ['hatchA', cont(0.55, hh + 0.1, 0.3)], ['hatchB', cont(-0.55, hh + 0.1, 0.3)], ['hatchC', cont(0, hh + 0.1, -2.05)]];

  let tris = 0; for (const k in B) tris += B[k].tris;
  return { buckets: B, sockets, vents, tris };
}

// ------------------------------------------------------------------------------------------------ crablet
/** Crablet minion (~0.6 m): container-lid shell, two claws, six legs, glowing eyes. One skinned mesh. */
export function buildCrablet(quality = 'high') {
  const q = QUALITY_K[quality] ?? 1, S = (n, m = 3) => Math.max(m, Math.round(n * q));
  const bones = [], by = {}, rest = {};
  const add = (name, pos, parent) => { const b = new THREE.Bone(); b.name = name; b.position.copy(pos).sub(parent ? rest[parent] : V3()); if (parent) by[parent].add(b); by[name] = b; rest[name] = pos.clone(); b.userData.i = bones.length; bones.push(b); };
  add('base', V3(), null); add('body', V3(0, 0.26, 0), 'base'); add('lid', V3(0, 0.4, -0.05), 'body');
  add('eyeL', V3(0.07, 0.36, 0.14), 'body'); add('eyeR', V3(-0.07, 0.36, 0.14), 'body');
  add('clawL', V3(0.12, 0.22, 0.16), 'body'); add('clawR', V3(-0.12, 0.22, 0.16), 'body');
  const LG = [];
  for (const s of [1, -1]) for (let i = 0; i < 3; i++) { const z = 0.08 - i * 0.1; const n = 'leg' + (s > 0 ? 'L' : 'R') + i; add(n, V3(s * 0.12, 0.24, z), 'body'); LG.push({ name: n, side: s, hip: V3(s * 0.12, 0.24, z), foot: V3(s * 0.3, 0, z * 1.4 + 0.01) }); }
  const bk = new Bucket('crablet'), bi = (n) => by[n].userData.i;
  // body
  bk.add(blob({ r: [0.14, 0.09, 0.13], e: 0.85, n: S(6, 3) }), TRS(0, 0.26, 0.02), bi('body'), [1, 0.3, 1, 0]);
  bk.add(blob({ r: [0.1, 0.07, 0.09], e: 0.9, n: S(4, 3) }), TRS(0, 0.2, 0.06), bi('body'), [2, 0, 0.9, 0]);
  // lid shell: a bent corrugated container-door fragment with a hinge block + stencil (class 0)
  const lid = corrPanel({ w: 0.46, h: 0.4, P: 0.08, depth: 0.018, nY: S(4, 2) });
  lid.translate(-0.23, -0.2, 0); const lp = lid.attributes.position; for (let i = 0; i < lp.count; i++) { const x = lp.getX(i), y = lp.getY(i); lp.setZ(i, lp.getZ(i) - (x * x + y * y) * 0.9); } lid.computeVertexNormals();
  bk.add(lid, TRS(0, 0.4, -0.05, -PI / 2 + 0.25, 0, 0), bi('lid'), [0, 0, 1, 0]);
  bk.add(box(0.06, 0.05, 0.08, 0.3, 2), TRS(0.17, 0.43, -0.2), bi('lid'), [3, 0, 1, 0]);
  // eyes on stalks (class 4 = glow eye)
  for (const s of [1, -1]) {
    const e = s > 0 ? 'eyeL' : 'eyeR';
    bk.add(loft([V3(s * 0.05, 0.3, 0.12), V3(s * 0.075, 0.4, 0.15)], { segs: 2, radial: 5, sec: () => ({ n: 0.018, b: 0.018 }) }), null, bi(e), [1, 0.4, 1, 0]);
    bk.add(new THREE.SphereGeometry(0.042, S(10, 6), S(8, 5)), TRS(s * 0.078, 0.42, 0.155), bi(e), [4, s, 1, 0]);
    // claws (the left one is a little crusher too)
    const c = s > 0 ? 'clawL' : 'clawR', k = s > 0 ? 1.25 : 0.9;
    bk.add(loft([V3(s * 0.1, 0.22, 0.13), V3(s * 0.16, 0.2, 0.22)], { segs: 2, radial: 6, sec: () => ({ n: 0.03 * k, b: 0.03 * k }) }), null, bi(c), [1, 0.3, 1, 0]);
    bk.add(blob({ r: [0.05 * k, 0.045 * k, 0.07 * k], e: 0.85, n: 3 }), TRS(s * 0.17, 0.2, 0.28), bi(c), [1, 0.4, 1, 0]);
    bk.add(new THREE.ConeGeometry(0.025 * k, 0.1 * k, 5), TRS(s * 0.17, 0.215, 0.36, PI / 2, 0, 0), bi(c), [1, 0.8, 1, 0]);
    bk.add(new THREE.ConeGeometry(0.02 * k, 0.09 * k, 5), TRS(s * 0.17, 0.185, 0.355, PI / 2, 0, 0), bi(c), [1, 0.8, 1, 0]);
  }
  for (const L of LG) {
    const knee = L.hip.clone().lerp(L.foot, 0.45).add(V3(0, 0.12, 0));
    bk.add(loft([L.hip, knee, L.foot], { segs: 6, radial: 5, sec: (t) => ({ n: 0.022 * (1 - t) + 0.004, b: 0.02 * (1 - t) + 0.004 }) }), null, bi(L.name), (p, n, i, t) => { MA[0] = 1; MA[1] = 0.3 + t * 0.7; MA[2] = 1; MA[3] = 12 + t; });
  }
  return { bones, by, rest, legs: LG, geo: bk.geometry(), tris: bk.tris };
}
