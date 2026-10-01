// INKWAVE — squidkid BODY + OUTFIT: anatomical limbs, layered garments with real thickness, hero sneakers, the ink
// tank + harness and a contact-AO bake. Everything is authored in kid space at the rest pose (feet at y=0, facing +Z,
// character's right = -X) and skinned against the rig in character-geo.js.
//
// Detail ladder: every builder takes a level 0…4 (`bodyLevel(lod, quality)`): 0 far · 1 game@low/med · 2 game@high/ultra
// (and hero@low) · 3 hero@med/high · 4 hero@ultra. Resolution AND sculpted detail (folds, rib geometry, eyelets, tread
// lugs) scale with it; shading detail lives in the cloth material (character-mats.js makeClothMaterial) and fades with
// pixel footprint on its own.
//
// Import cycle note: character-geo.js imports this module and this module imports character-geo.js. Nothing at the top
// level here may touch a `K.*` binding (only use them inside functions) so either import order evaluates cleanly.
import * as THREE from 'three';
import { CS, MC, PART } from './character-mats.js';
import * as K from './character-geo.js';
import { G } from '../core/ctx.js';

const V3 = THREE.Vector3;
const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const gauss = (x, s) => Math.exp(-((x / s) ** 2));
const spow = (v, e) => Math.sign(v) * Math.pow(Math.abs(v), e);
const pos = (v) => (v > 0 ? v : 0);
const cl = (part, cls, param = 0) => [part, cls, param];
/** Catmull-Rom through a keyed table (non-uniform keys, clamped ends). */
function table(keys, vals, x) {
  const n = keys.length;
  if (x <= keys[0]) return vals[0];
  if (x >= keys[n - 1]) return vals[n - 1];
  let i = 0; while (i < n - 2 && x > keys[i + 1]) i++;
  const t = (x - keys[i]) / (keys[i + 1] - keys[i]);
  const p0 = vals[Math.max(0, i - 1)], p1 = vals[i], p2 = vals[i + 1], p3 = vals[Math.min(n - 1, i + 2)];
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}
const tab = (pairs) => { const k = pairs.map((p) => p[0]), v = pairs.map((p) => p[1]); return (x) => table(k, v, x); };
/** Cheap deterministic value noise on a line (fold phase jitter), period-free. */
function n1(x, seed = 0) { const i = Math.floor(x), f = x - i; const h = (k) => { const s = Math.sin((k + seed * 17.13) * 127.1) * 43758.5453; return s - Math.floor(s); }; const u = f * f * (3 - 2 * f); return lerp(h(i), h(i + 1), u) * 2 - 1; }

// ------------------------------------------------------------------------------------------------
// Detail ladder
// ------------------------------------------------------------------------------------------------
export const BODY_LEVEL_NAMES = ['far', 'low', 'game', 'hero', 'ultra'];
const QI = { low: 0, medium: 1, high: 2, ultra: 3 };
/** Body/outfit detail level for a LOD tier ('far' | 'game' | 'hero') at a quality preset ('low' … 'ultra'). */
export function bodyLevel(lod = 'hero', quality = G.settings?.quality || 'high') {
  if (typeof lod === 'number') return clamp(Math.round(lod), 0, 4);
  const q = QI[quality] ?? 2;
  if (lod === 'far') return 0;
  if (lod === 'game') return q >= 2 ? 2 : 1;
  return q >= 3 ? 4 : q >= 1 ? 3 : 2; // hero
}
// per-level resolution: [around, along] (rows are density-distributed toward joints / edges)
const RES = [
  { arm: [7, 10], leg: [7, 10], tee: [20, 10], sleeve: [8, 4], collar: [16, 3], shorts: [20, 7], sLeg: [10, 4], sock: [8, 4], web: [10, 1], shoe: 0, tank: 0, fold: 0.4, micro: 0 },
  { arm: [10, 16], leg: [10, 16], tee: [32, 16], sleeve: [12, 7], collar: [24, 5], shorts: [32, 10], sLeg: [14, 6], sock: [12, 6], web: [16, 1], shoe: 1, tank: 1, fold: 0.55, micro: 0 },
  { arm: [10, 18], leg: [10, 18], tee: [40, 22], sleeve: [16, 9], collar: [28, 4], shorts: [40, 12], sLeg: [18, 8], sock: [12, 7], web: [22, 1], shoe: 1, tank: 1, fold: 0.7, micro: 0 },
  { arm: [20, 34], leg: [20, 34], tee: [68, 38], sleeve: [28, 15], collar: [56, 7], shorts: [64, 20], sLeg: [40, 13], sock: [24, 13], web: [56, 2], shoe: 2, tank: 2, fold: 1, micro: 1 },
  { arm: [24, 42], leg: [24, 42], tee: [80, 46], sleeve: [32, 18], collar: [72, 8], shorts: [72, 22], sLeg: [44, 15], sock: [28, 15], web: [64, 2], shoe: 2, tank: 2, fold: 1, micro: 2 },
];
// per-level shoe resolution: around, upper rows, midsole rows, collar [around, psi], tongue [u, v], patch scale
const SHOE_RES = [
  { nP: 14, nT: 3, nH: 2, collar: [10, 3], tongue: [2, 3], pk: 0.35 },
  { nP: 24, nT: 6, nH: 3, collar: [16, 4], tongue: [3, 5], pk: 0.5 },
  { nP: 30, nT: 8, nH: 4, collar: [16, 3], tongue: [3, 5], pk: 0.55 },
  { nP: 52, nT: 13, nH: 8, collar: [32, 6], tongue: [6, 10], pk: 0.85 },
  { nP: 58, nT: 14, nH: 9, collar: [36, 7], tongue: [7, 12], pk: 0.95 },
];
export const bodyRes = (level) => RES[clamp(level | 0, 0, 4)];

// ------------------------------------------------------------------------------------------------
// Limb frames: arc-length parametrised centreline with a stable (lateral, forward) section frame
// ------------------------------------------------------------------------------------------------
function limbPath(pts, latHint) {
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  const N = 600; const P = [], S = [0];
  for (let i = 0; i <= N; i++) P.push(curve.getPoint(i / N));
  for (let i = 1; i <= N; i++) S.push(S[i - 1] + P[i].distanceTo(P[i - 1]));
  const len = S[N];
  const Z = new V3(0, 0, 1);
  /** frame at arc length s: { C, d (along), l (lateral), f (forward) } */
  const at = (s, out = {}) => {
    const x = clamp(s, 0, len);
    let lo = 0, hi = N; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (S[m] <= x) lo = m; else hi = m; }
    const f = (x - S[lo]) / Math.max(1e-9, S[hi] - S[lo]);
    const C = (out.C || new V3()).copy(P[lo]).lerp(P[hi], f);
    const d = (out.d || new V3()).subVectors(P[Math.min(N, hi + 1)], P[Math.max(0, lo - 1)]).normalize();
    // extrapolate past the ends along the end tangent
    if (s < 0) C.addScaledVector(d, s); else if (s > len) C.addScaledVector(d, s - len);
    const l = (out.l || new V3()).copy(latHint).addScaledVector(d, -latHint.dot(d)).normalize();
    const fw = (out.f || new V3()).copy(Z).addScaledVector(d, -Z.dot(d)).addScaledVector(l, -Z.dot(l)).normalize();
    out.C = C; out.d = d; out.l = l; out.f = fw;
    return out;
  };
  return { at, len };
}

/**
 * Loft a limb: rows at arc lengths `ss`, nTh points around (theta 0 = lateral, pi/2 = forward), section radius
 * sec(theta, s) → [rLat, rFwd] (signed cos/sin already applied by the caller's shape). Returns { geo, S, TH } with the
 * per-vertex arc length / angle so weights and AO can use limb coordinates.
 */
function loftLimb(path, ss, nTh, sec, opt = {}) {
  const rows = []; const fr = {};
  for (const s of ss) {
    path.at(s, fr); const row = [];
    for (let i = 0; i < nTh; i++) {
      const th = (i / nTh) * TAU; const [a, b] = sec(th, s);
      row.push(fr.C.clone().addScaledVector(fr.l, a).addScaledVector(fr.f, b));
    }
    rows.push(row);
  }
  const poles = {};
  if (opt.capStart) { path.at(ss[0], fr); const r = sec(0, ss[0])[0]; poles.start = fr.C.clone().addScaledVector(fr.d, -r * opt.capStart); }
  if (opt.capEnd) { path.at(ss[ss.length - 1], fr); const r = sec(0, ss[ss.length - 1])[0]; poles.end = fr.C.clone().addScaledVector(fr.d, r * opt.capEnd); }
  const geo = K.gridGeo(rows, {
    wrapU: true, poles,
    outward: (p, out) => { let best = 0, bd = 1e9; for (let j = 0; j < ss.length; j += Math.max(1, (ss.length / 24) | 0)) { path.at(ss[j], fr); const dd = fr.C.distanceToSquared(p); if (dd < bd) { bd = dd; best = ss[j]; } } path.at(best, fr); out.copy(fr.C); },
    uv: (i, j) => [i / nTh, ss[j]],
    poleUv: { start: [0, ss[0]], end: [0, ss[ss.length - 1]] },
  });
  return geo;
}

// ------------------------------------------------------------------------------------------------
// ARMS — slim stylised kid arm: deltoid (under the sleeve), biceps / triceps, a real elbow (olecranon point,
// epicondyles, crease hollow), brachioradialis swell, tapering flattened forearm, wrist with the ulnar head.
// theta: 0 lateral · pi/2 forward (thumb side at rest) · pi medial (toward the torso) · 3pi/2 back (elbow point)
// ------------------------------------------------------------------------------------------------
const ARM_R = tab([[0.0, 0.0372], [0.04, 0.0368], [0.08, 0.0352], [0.12, 0.0334], [0.16, 0.0314], [0.19, 0.0296], [0.212, 0.0284], [0.235, 0.0294], [0.265, 0.0302], [0.3, 0.0288], [0.34, 0.0262], [0.375, 0.0240], [0.4, 0.0229], [0.43, 0.0228]]);
const ARM_LAT = tab([[0.0, 1.0], [0.18, 0.98], [0.212, 1.05], [0.25, 0.98], [0.3, 0.9], [0.36, 0.8], [0.4, 0.74], [0.43, 0.73]]);
const ARM_FWD = tab([[0.0, 1.0], [0.12, 1.04], [0.19, 1.0], [0.212, 0.95], [0.26, 1.04], [0.34, 1.03], [0.4, 1.04], [0.43, 1.04]]);
export function armSpec(s) {
  const R = K.REST;
  const sx = s === 'L' ? 1 : -1;
  const sh = R['uArm' + s], el = R['fArm' + s], wr = R['hand' + s];
  const fd = wr.clone().sub(el).normalize();
  const path = limbPath([sh.clone(), sh.clone().lerp(el, 0.5), el.clone(), el.clone().lerp(wr, 0.5), wr.clone(), wr.clone().addScaledVector(fd, 0.03)], new V3(sx, 0, 0));
  const sE = sh.distanceTo(el), sW = sE + el.distanceTo(wr);
  const sec = (th, s2) => {
    const c = Math.cos(th), n = Math.sin(th);
    const lat = pos(c), med = pos(-c), front = pos(n), back = pos(-n);
    let k = 1;
    k += 0.05 * gauss(s2 - 0.035, 0.04) * lat * lat;                                            // deltoid
    k += 0.07 * gauss(s2 - 0.135, 0.045) * front * front * (1 - 0.4 * med);                        // biceps
    k += 0.05 * gauss(s2 - 0.115, 0.05) * back * back + 0.03 * gauss(s2 - 0.09, 0.04) * pos(-n * 0.7 + c * 0.7) ** 2; // triceps
    k += 0.17 * gauss(s2 - sE - 0.003, 0.017) * back ** 4;                                        // olecranon
    k += 0.075 * gauss(s2 - sE + 0.004, 0.016) * med ** 3 + 0.04 * gauss(s2 - sE + 0.002, 0.016) * lat ** 3; // epicondyles
    k -= 0.06 * gauss(s2 - sE - 0.002, 0.02) * front * front;                                      // crease hollow
    k += 0.085 * gauss(s2 - sE - 0.045, 0.034) * pos(0.75 * c + 0.66 * n) ** 2;                    // brachioradialis
    k += 0.05 * gauss(s2 - sE - 0.06, 0.05) * pos(-0.8 * c - 0.2 * n) ** 2;                        // flexors
    k -= 0.025 * sstep(sE + 0.1, sE + 0.17, s2) * sstep(sW + 0.01, sW - 0.02, s2) * back * back;  // flat ulna line
    k += 0.07 * gauss(s2 - sW + 0.012, 0.009) * pos(-0.55 * n - 0.84 * c) ** 3;                    // ulnar head
    k += 0.03 * gauss(s2 - sW + 0.008, 0.01) * front ** 3;                                          // radial styloid
    const r = ARM_R(s2) * k;
    return [c * r * ARM_LAT(s2), n * r * ARM_FWD(s2)];
  };
  return { sx, sh, el, wr, path, sE, sW, sec };
}

function addArms(B, lv) {
  const [nTh, nS] = RES[lv].arm;
  for (const s of ['L', 'R']) {
    const A = armSpec(s);
    const s0 = 0.03, s1 = A.sW + 0.022;
    const ss = K.densitySamples(nS, s0, s1, (x) => 1 + 1.6 * gauss(x - A.sE, 0.03) + 1.2 * gauss(x - A.sW, 0.02) + 0.6 * gauss(x - 0.105, 0.02));
    const geo = loftLimb(A.path, ss, nTh, A.sec, { capStart: 0.7 });
    const uvA = geo.attributes.uv;
    B.add(geo, {
      v3: [0, 0, 0],
      color: (p, i) => _white,
      weights: (p, i) => {
        const s2 = uvA.getY(i), th = uvA.getX(i) * TAU;
        const back = pos(-Math.sin(th));
        // elbow: tight at the crease, wide behind so the olecranon keeps its point when the arm bends
        const wb = lerp(0.014, 0.022, back), wf = lerp(0.014, 0.03, back);
        const wF = sstep(A.sE - wb, A.sE + wf, s2);
        const wH = sstep(A.sW - 0.011, A.sW + 0.013, s2);
        return [['uArm' + s, 1 - wF], ['fArm' + s, wF * (1 - wH)], ['hand' + s, wF * wH]];
      },
    });
  }
}
const _white = new THREE.Color(1, 1, 1);

// ------------------------------------------------------------------------------------------------
// LEGS — thigh (quads, vastus medialis teardrop), knee (patella, tendon hollows, popliteal crease, hamstring
// tendons), calf (two gastrocnemius heads, medial lower), shin (flat tibia), ankle waist.
// theta: 0 lateral · pi/2 forward · pi medial · 3pi/2 back
// ------------------------------------------------------------------------------------------------
const LEG_R = tab([[0.0, 0.05], [0.05, 0.0515], [0.11, 0.0495], [0.16, 0.0468], [0.2, 0.0438], [0.235, 0.0408], [0.26, 0.0386], [0.278, 0.0372], [0.3, 0.0374], [0.33, 0.0386], [0.36, 0.0372], [0.4, 0.0334], [0.44, 0.0302], [0.48, 0.0284], [0.52, 0.0272], [0.57, 0.027]]);
export function legSpec2(s) {
  const R = K.REST;
  const sx = s === 'L' ? 1 : -1;
  const hp = R['thigh' + s], kn = R['shin' + s], an = R['foot' + s];
  const dn = an.clone().sub(kn).normalize();
  const path = limbPath([hp.clone(), hp.clone().lerp(kn, 0.5), kn.clone(), kn.clone().lerp(an, 0.5), an.clone(), an.clone().addScaledVector(dn, 0.04)], new V3(sx, 0, 0));
  const sK = hp.distanceTo(kn), sA = sK + kn.distanceTo(an);
  const sec = (th, s2) => {
    const c = Math.cos(th), n = Math.sin(th);
    const lat = pos(c), med = pos(-c), front = pos(n), back = pos(-n);
    let k = 1;
    k += 0.045 * gauss(s2 - 0.15, 0.07) * front * front;                                             // quads
    k += 0.03 * gauss(s2 - 0.12, 0.07) * lat * lat;                                                  // vastus lateralis
    k += 0.075 * gauss(s2 - sK + 0.034, 0.022) * pos(0.62 * n - 0.78 * c) ** 2;                      // vastus medialis teardrop
    k += 0.12 * gauss(s2 - sK + 0.002, 0.017) * front ** 4;                                          // patella
    k -= 0.05 * gauss(s2 - sK - 0.022, 0.012) * (pos(0.7 * n + 0.71 * c) ** 4 + pos(0.7 * n - 0.71 * c) ** 4); // tendon hollows
    k -= 0.055 * gauss(s2 - sK + 0.004, 0.022) * (1 - Math.abs(n)) ** 2;                             // knee waist (sides)
    k -= 0.06 * gauss(s2 - sK - 0.004, 0.02) * back ** 3;                                             // popliteal hollow
    k += 0.05 * gauss(s2 - sK + 0.012, 0.024) * (pos(-0.8 * n + 0.6 * c) ** 6 + pos(-0.8 * n - 0.6 * c) ** 6); // hamstring tendons
    k += 0.24 * gauss(s2 - sK - 0.058, 0.045) * back ** 1.6;                                         // gastrocnemius
    k += 0.09 * gauss(s2 - sK - 0.07, 0.04) * med * med + 0.05 * gauss(s2 - sK - 0.05, 0.035) * lat * lat; // medial / lateral heads
    k -= 0.06 * sstep(sK + 0.03, sK + 0.07, s2) * sstep(sA - 0.04, sA - 0.1, s2) * front * front;      // flat shin
    k += 0.02 * sstep(sK + 0.03, sK + 0.07, s2) * sstep(sA - 0.04, sA - 0.1, s2) * gauss(th - 1.95, 0.25); // tibia crest (medial-front)
    k -= 0.035 * sstep(sA - 0.1, sA - 0.02, s2) * (1 - Math.abs(n));                                   // ankle waist
    const r = LEG_R(s2) * k;
    return [c * r, n * r * 0.97];
  };
  return { sx, hp, kn, an, path, sK, sA, sec };
}
/** Hip → thigh weight shared by the leg skin and the shorts legs (so the loose shorts never lag the thigh). */
export const thighW = (s2) => sstep(-0.005, 0.075, s2);

function addLegs(B, lv) {
  const [nTh, nS] = RES[lv].leg;
  for (const s of ['L', 'R']) {
    const Lg = legSpec2(s);
    const s0 = 0.03, s1 = Lg.sA + 0.03;
    const ss = K.densitySamples(nS, s0, s1, (x) => 1 + 1.8 * gauss(x - Lg.sK, 0.04) + 0.5 * gauss(x - Lg.sK - 0.06, 0.04) + 0.3 * gauss(x - 0.17, 0.03));
    const geo = loftLimb(Lg.path, ss, nTh, Lg.sec, { capStart: 0.6, capEnd: 0.6 });
    const uvA = geo.attributes.uv;
    B.add(geo, {
      v3: [0, 0, 0], color: () => _white,
      weights: (p, i) => {
        const s2 = uvA.getY(i), th = uvA.getX(i) * TAU;
        const front = pos(Math.sin(th));
        const wt = thighW(s2);
        // knee: wide over the patella (it glides), tight at the popliteal crease
        const wS = sstep(Lg.sK - lerp(0.016, 0.026, front), Lg.sK + lerp(0.016, 0.03, front), s2);
        const wA = sstep(Lg.sA - 0.02, Lg.sA + 0.012, s2);
        return [['hips', 1 - wt], ['thigh' + s, wt * (1 - wS)], ['shin' + s, wt * wS * (1 - wA)], ['foot' + s, wt * wS * wA]];
      },
    });
  }
}

/** Arms + legs of the skin mesh (the hands stay in character-geo.js handParts: grip contract). */
export function addBodyLimbs(B, level = 3) {
  const lv = clamp(level | 0, 0, 4);
  addArms(B, lv);
  addLegs(B, lv);
}

// ------------------------------------------------------------------------------------------------
// TEE — boxy kid tee. The torso shell is a stack of horizontal rings: a superellipse torso smoothly unioned with the
// two shoulder lobes (circles around the upper-arm axis), so the shoulder line runs collar → rounded shoulder → sleeve
// without the old balloon domes. Sleeves are separate tubes that live inside the lobes above the (drop-shoulder) seam
// and emerge below it. Folds are sculpted as a displacement field D(p) along the ring normal: hem drape, waist bunching,
// armpit drag folds, strap / plate compression, micro wrinkles.
// ------------------------------------------------------------------------------------------------
export const TEE_HEM = 0.694, TEE_TOP = 1.001;
const TT = {
  y: [0.694, 0.72, 0.76, 0.80, 0.84, 0.87, 0.9, 0.93, 0.952, 0.968, 0.98, 0.99, 0.997, 1.001],
  a: [0.1195, 0.116, 0.1095, 0.108, 0.11, 0.1135, 0.1175, 0.1205, 0.123, 0.12, 0.108, 0.087, 0.065, 0.0535],
  b: [0.0875, 0.0855, 0.0815, 0.0825, 0.0855, 0.0875, 0.0855, 0.0815, 0.0745, 0.0665, 0.0595, 0.0525, 0.0465, 0.0432],
  n: [2.3, 2.3, 2.35, 2.4, 2.5, 2.6, 2.7, 2.8, 2.8, 2.6, 2.4, 2.2, 2.05, 2.0],
  zc: [-0.012, -0.012, -0.012, -0.012, -0.011, -0.011, -0.011, -0.012, -0.012, -0.012, -0.011, -0.01, -0.009, -0.008],
};
const ttA = (y) => table(TT.y, TT.a, y), ttB = (y) => table(TT.y, TT.b, y), ttN = (y) => table(TT.y, TT.n, y), ttZ = (y) => table(TT.y, TT.zc, y);
const LOBE_R = tab([[0.868, 0], [0.88, 0.023], [0.893, 0.0412], [0.91, 0.0487], [0.932, 0.0494], [0.95, 0.0458], [0.963, 0.0378], [0.974, 0.0266], [0.983, 0.0132], [0.989, 0]]);
/** Upper-arm axis at height y (rest pose), bent inward above the joint so the lobe caps round toward the neck. */
function lobeCenter(y, sx, out) {
  const d = 0.946 - y;
  // the lobe grows out of the torso side (never a separate blob), then follows the arm axis
  const inK = 0.045 * (1 - sstep(0.866, 0.912, y));
  return out.set(sx * (0.146 + 0.1143 * d - 0.25 * pos(-d) - inK), 0, -0.014 - 0.038 * d);
}
const SMIN_K = 0.028;
function smin(a, b, k) { const h = clamp(0.5 + 0.5 * (b - a) / k, 0, 1); return lerp(b, a, h) - k * h * (1 - h); }
const _lc = new V3();
/** Section parameters at height y (torso superellipse + the two lobe circles). */
function secParams(y) {
  const S = { a: ttA(y), b: ttB(y), n: ttN(y), zc: ttZ(y), lr: LOBE_R(y), lx: 0, lz: 0 };
  if (S.lr > 1e-4) { lobeCenter(y, 1, _lc); S.lx = _lc.x; S.lz = _lc.z; }
  return S;
}
function sdSec(x, z, S) {
  const dz0 = z - S.zc, r = Math.hypot(x, dz0);
  let d;
  // radial distance to the superellipse (exact along the ray from its centre; good enough to blend)
  if (r < 1e-9) d = -Math.min(S.a, S.b);
  else { const ux = Math.abs(x) / r, uz = Math.abs(dz0) / r; d = r - 1 / Math.pow(Math.pow(ux / S.a, S.n) + Math.pow(uz / S.b, S.n), 1 / S.n); }
  if (S.lr > 1e-4) {
    d = smin(d, Math.hypot(x - S.lx, z - S.lz) - S.lr, SMIN_K);
    d = smin(d, Math.hypot(x + S.lx, z - S.lz) - S.lr, SMIN_K);
  }
  return d;
}
/** Signed distance (approx.) of (x, z) to the tee body section at height y (torso ∪ lobes). */
function teeSD(x, z, y) { return sdSec(x, z, secParams(y)); }
/** Outermost boundary crossing along the ray (dx, dz) from the section centre (hidden concavities are bridged). */
function rayHitS(dx, dz, S) {
  let hi = 0.235, lo = hi;
  while (lo > 0.02 && sdSec(dx * lo, S.zc + dz * lo, S) > 0) { hi = lo; lo -= 0.007; }
  for (let it = 0; it < 14; it++) { const mid = (lo + hi) / 2; if (sdSec(dx * mid, S.zc + dz * mid, S) < 0) lo = mid; else hi = mid; }
  return (lo + hi) / 2;
}
function rayHit(dx, dz, zc, y) { return rayHitS(dx, dz, secParams(y)); }
/** Section ring at height y: m points uniformly spaced by arc length per quarter (front centre, +X side, back, -X). */
function teeRing(y, m, N = 168) {
  const S = secParams(y), zc = S.zc, P = [];
  for (let i = 0; i < N; i++) {
    const al = (i / N) * TAU, dx = Math.sin(al), dz = Math.cos(al);
    const rr = rayHitS(dx, dz, S); P.push([dx * rr, zc + dz * rr]);
  }
  // quarter anchors: front centre (i=0), lateral-most on +X, back centre (N/2), lateral-most on -X
  let iL = 0, iR = 0; for (let i = 0; i < N; i++) { if (P[i][0] > P[iL][0]) iL = i; if (P[i][0] < P[iR][0]) iR = i; }
  const anchors = [0, iL, N / 2, iR, N];
  const out = [];
  const q = m / 4;
  for (let k = 0; k < 4; k++) {
    const i0 = anchors[k], i1 = anchors[k + 1];
    const L = [0]; for (let i = i0 + 1; i <= i1; i++) { const a = P[(i - 1) % N], b = P[i % N]; L.push(L[L.length - 1] + Math.hypot(b[0] - a[0], b[1] - a[1])); }
    const tot = L[L.length - 1];
    let j = 0;
    for (let s = 0; s < q; s++) {
      const target = (s / q) * tot;
      while (j < L.length - 2 && L[j + 1] < target) j++;
      const f = (target - L[j]) / Math.max(1e-9, L[j + 1] - L[j]);
      const a = P[(i0 + j) % N], b = P[(i0 + j + 1) % N];
      out.push([lerp(a[0], b[0], f), lerp(a[1], b[1], f)]);
    }
  }
  return out;
}
/** Tee surface normal (3D: the shoulder top faces up) from the section SDF gradient. */
function teeNormal(x, z, y, out) {
  const h = 2e-4;
  const gx = teeSD(x + h, z, y) - teeSD(x - h, z, y), gz = teeSD(x, z + h, y) - teeSD(x, z - h, y);
  const gy = teeSD(x, z, y + h) - teeSD(x, z, y - h);
  const l = Math.hypot(gx, gy, gz) || 1; return out.set(gx / l, gy / l, gz / l);
}
/** Point on the (undisplaced) tee at ray angle al (0 = front, +pi/2 = +X) and height y. */
function teeBase(al, y, out) {
  const zc = ttZ(y), dx = Math.sin(al), dz = Math.cos(al);
  const r = rayHit(dx, dz, zc, y); return out.set(dx * r, y, zc + dz * r);
}
const NECK_DIP = 0.015;
const neckDip = (y, frontK) => NECK_DIP * frontK * sstep(TEE_TOP - 0.034, TEE_TOP, y);

// ---- harness strap paths on the tee (shared by the tee's compression field and the harness itself) -----------------
// (ray angle, y) waypoints: back plate top → over the shoulder → down the front → under the arm at the waist → plate
const STRAP_AY = [[1.05, 0.988], [0.66, 0.975], [0.5, 0.935], [0.52, 0.87], [0.58, 0.8], [0.9, 0.75], [1.55, 0.744], [2.1, 0.748]];
const STRAP = { w: 0.0112, t: 0.0021, groove: 0.0016 };
let _strapCache = null;
function strapPaths() {
  if (_strapCache) return _strapCache;
  const out = [];
  for (const sx of [1, -1]) {
    const pts = [new V3(0.05 * sx, 0.934, -0.127), new V3(0.056 * sx, 0.96, -0.113), new V3(0.062 * sx, 0.978, -0.088)];
    for (const [al, y] of STRAP_AY) pts.push(teeBase(al * sx, y, new V3()));
    pts.push(new V3(0.062 * sx, 0.75, -0.126));
    const curve = projectedCurve(new THREE.CatmullRomCurve3(pts, false, 'centripetal'), 160);
    const poly = curve.getSpacedPoints(120);
    out.push({ sx, curve, poly });
  }
  // chest (sternum) strap across the front
  {
    const pts = []; for (let a = -0.56; a <= 0.561; a += 0.04) pts.push(teeBase(a, 0.886, new V3()));
    const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    out.push({ sx: 0, curve, poly: curve.getSpacedPoints(40), chest: true });
  }
  return (_strapCache = out);
}
/** Re-sample a curve and snap the samples that lie near the tee onto its surface (chords never cut inside). */
function projectOnTee(p, out = p) {
  const q = out.copy(p), n = new V3();
  for (let it = 0; it < 3; it++) {
    const h = 2e-4, sd = teeSD(q.x, q.z, q.y);
    const gx = (teeSD(q.x + h, q.z, q.y) - teeSD(q.x - h, q.z, q.y)) / (2 * h), gz = (teeSD(q.x, q.z + h, q.y) - teeSD(q.x, q.z - h, q.y)) / (2 * h), gy = (teeSD(q.x, q.z, q.y + h) - teeSD(q.x, q.z, q.y - h)) / (2 * h);
    const g2 = gx * gx + gy * gy + gz * gz; if (g2 < 1e-9) break;
    n.set(gx, gy, gz); q.addScaledVector(n, -sd / g2);
  }
  return q;
}
function projectedCurve(curve, n) {
  const pts = curve.getSpacedPoints(n).map((p) => {
    const sd = teeSD(p.x, p.z, p.y);
    if (sd > 0.012) return p;                                   // in the air: keep
    const q = projectOnTee(p, new V3());
    return sd < 0 ? q : p.lerp(q, sstep(0.012, 0.004, sd));
  });
  return new THREE.CatmullRomCurve3(pts, false, 'centripetal');
}
function distToPoly(p, poly) {
  let best = 1e9;
  for (let i = 0; i < poly.length - 1; i++) {
    const a = poly[i], b = poly[i + 1];
    const bx = b.x - a.x, by = b.y - a.y, bz = b.z - a.z, px = p.x - a.x, py = p.y - a.y, pz = p.z - a.z;
    const t = clamp((px * bx + py * by + pz * bz) / Math.max(1e-12, bx * bx + by * by + bz * bz), 0, 1);
    const dx = px - bx * t, dy = py - by * t, dz = pz - bz * t, d = dx * dx + dy * dy + dz * dz;
    if (d < best) best = d;
  }
  return Math.sqrt(best);
}
// the tank back plate footprint on the tee (tank-local rect ±0.074 × ±0.1, tilted like the tank)
function plateMask(p) {
  const c = K.TANK.center, t = K.TANK.tilt;
  const dy = p.y - c.y, dz = p.z - c.z;
  const ly = dy * Math.cos(t) + dz * Math.sin(t);
  const u = Math.abs(p.x) / 0.078, v = Math.abs(ly) / 0.104;
  const e = Math.pow(Math.pow(u, 4) + Math.pow(v, 4), 0.25);
  return (1 - sstep(0.86, 1.02, e)) * sstep(-0.04, -0.07, p.z);
}

/** A soft fold ridge from A to B in a 2D (x, y) chart: tapered ends, shallow valleys either side. */
function ridge(x, y, x0, y0, x1, y1, w, amp) {
  const bx = x1 - x0, by = y1 - y0, L2 = bx * bx + by * by;
  const t = ((x - x0) * bx + (y - y0) * by) / L2;
  if (t < -0.15 || t > 1.15) return 0;
  const tc = clamp(t, 0, 1);
  const d = Math.hypot(x - (x0 + bx * tc), y - (y0 + by * tc));
  if (d > w * 3.5) return 0;
  const taper = Math.pow(Math.sin(Math.PI * clamp(t, 0, 1)), 0.6) * sstep(-0.15, 0.05, t) * sstep(1.15, 0.95, t);
  return amp * taper * (Math.exp(-((d / w) ** 2)) - 0.42 * Math.exp(-((d / (2.3 * w)) ** 2)));
}
// fold charts (left side; mirrored): [x0, y0, x1, y1, width, amplitude]
const FOLDS_FRONT = [
  [0.112, 0.888, 0.05, 0.798, 0.0105, 0.0036], [0.115, 0.872, 0.072, 0.766, 0.0098, 0.0032], [0.103, 0.908, 0.05, 0.852, 0.009, 0.0022],
  [0.044, 0.79, 0.052, 0.704, 0.013, 0.0026], [0.088, 0.766, 0.103, 0.7, 0.012, 0.0028], [0.012, 0.758, 0.01, 0.702, 0.011, 0.0014],
];
const FOLDS_BACK = [
  [0.112, 0.886, 0.088, 0.786, 0.0105, 0.0032], [0.114, 0.868, 0.101, 0.766, 0.0098, 0.0028],
  [0.048, 0.742, 0.058, 0.698, 0.012, 0.0026], [0.092, 0.752, 0.105, 0.698, 0.012, 0.0028], [0.0, 0.745, 0.004, 0.7, 0.012, 0.0018],
];
/** Fold / compression displacement (metres, + = outward) at a tee surface point p (base position). */
function teeFold(p, lvF, micro) {
  const y = p.y, ax = Math.abs(p.x), zc = ttZ(y);
  const zr = p.z - zc, front = sstep(-0.025, 0.035, zr), back = sstep(0.025, -0.035, zr);
  const al = Math.atan2(p.x, p.z - zc);                   // around, 0 = front
  const sd = p.x >= 0 ? 1 : -1;
  let D = 0;
  // hem: drape waves + a slight flare, irregular phase so it never reads as a sine
  const hemK = 1 - sstep(TEE_HEM, TEE_HEM + 0.075, y);
  const ph = al * 7 + 0.9 * n1(al * 2.2, 3) + 0.4 * Math.sin(al * 3 + 1.1);
  D += hemK * (0.0034 * Math.sin(ph) * (0.55 + 0.45 * n1(al * 3.1, 5)) + 0.0018);
  // waist bunching on the sides (fabric slack above the shorts' waistband), slightly diagonal
  const side = Math.pow(Math.abs(Math.sin(al)), 2.2);
  D += 0.0026 * Math.sin((y - 0.71 + 0.02 * zr) / 0.021 * TAU + 0.8 * n1(al * 4, 7)) * side * gauss(y - 0.762, 0.03) * (0.7 + 0.3 * n1(y * 60, sd + 8));
  D += 0.0012 * gauss(y - 0.735, 0.022) * (1 - side) * (0.5 + 0.5 * n1(al * 5, 9));             // blousing front/back
  // drag + drape folds (mirrored charts, per hemisphere; the right side gets its own phase so it isn't a mirror copy)
  const xx = ax + (sd < 0 ? 0.004 : 0), yy = y + (sd < 0 ? -0.006 : 0);
  if (front > 0) for (const f of FOLDS_FRONT) D += front * ridge(xx, yy, ...f);
  if (back > 0) for (const f of FOLDS_BACK) D += back * ridge(xx, yy, ...f);
  // shoulder: soft gathers running from the collar toward the shoulder point
  D += 0.0011 * Math.sin((ax - 0.07) / 0.024 * TAU + 0.5) * sstep(0.952, 0.985, y) * sstep(0.13, 0.085, ax) * (front + 0.6 * back);
  // micro wrinkles (hero): low-frequency crinkle so it stays smooth at the mesh resolution
  if (micro > 0) D += 0.00022 * micro * n1(y * 70 + 2 * Math.sin(al * 3), 1) * n1(al * 11 + y * 20, 2);
  D *= lvF;
  // back plate pressing the tee flat (+ a rim of bunched cloth around it)
  const pm = plateMask(p);
  D = lerp(D, -0.0024, pm);
  // straps: the webbing irons the cloth flat into a groove; the cloth bulges either side of it
  for (const sp of strapPaths()) {
    const d = distToPoly(p, sp.poly);
    if (d > 0.03) continue;
    const w = sp.chest ? 0.0074 : STRAP.w;
    const inK = 1 - sstep(w * 0.8, w * 1.15, d);
    D = lerp(D, -STRAP.groove * (sp.chest ? 0.6 : 1), inK);
    D += 0.0012 * lvF * gauss(d - w * 1.38, 0.0045) * (1 - inK);
  }
  return D;
}

function addTee(B, lv) {
  const R = RES[lv];
  const [nTh, nRows] = R.tee;
  const lvF = R.fold, micro = R.micro;
  // rows: spaced by the mean movement of the whole ring (so the lobe underside doesn't hog rows), denser at the hem
  // and over the shoulder
  const prof = []; let prev = null;
  const arc = [];
  for (let i = 0; i <= 90; i++) {
    const y = lerp(TEE_HEM, TEE_TOP, i / 90); const r = teeRing(y, 24, 72);
    let m = 0; if (prev) { for (let k = 0; k < 24; k++) m += Math.hypot(r[k][0] - prev[k][0], r[k][1] - prev[k][1], y - prof[i - 1]); m /= 24; }
    arc.push((arc.length ? arc[arc.length - 1] : 0) + m); prof.push(y); prev = r;
  }
  const yAtArc = (a) => { let i = 0; while (i < arc.length - 2 && arc[i + 1] < a) i++; const f = (a - arc[i]) / Math.max(1e-9, arc[i + 1] - arc[i]); return lerp(prof[i], prof[Math.min(i + 1, prof.length - 1)], f); };
  const totA = arc[arc.length - 1];
  const as = K.densitySamples(nRows, 0, totA, (a) => { const y = yAtArc(a); return 1 + 1.2 * gauss(y - TEE_HEM, 0.02) + 0.7 * gauss(y - 0.975, 0.02); });
  const ys = as.map(yAtArc);
  const nrm = new V3();
  const rows = [], rowY = [];
  const ringCache = new Map();
  const ringAt = (y, off) => {
    let ring = ringCache.get(y); if (!ring) { ring = teeRing(y, nTh); ringCache.set(y, ring); }
    return ring.map(([x, z], i) => {
      teeNormal(x, z, y, nrm);
      const p = new V3(x, y, z);
      const D = teeFold(p, lvF, micro);
      p.addScaledVector(nrm, D + off);
      const fk = Math.max(0, Math.cos((i / nTh) * TAU));
      p.y -= neckDip(y, fk * fk);
      return p;
    });
  };
  // rolled hem: inside lip → round the fold → outside (rows bottom-up, v = pre-dip height)
  const hemRows = [[TEE_HEM + 0.013, -0.0046], [TEE_HEM + 0.004, -0.0048], [TEE_HEM - 0.0006, -0.0042], [TEE_HEM - 0.0021, -0.0024], [TEE_HEM - 0.0012, -0.0005]];
  for (const [y, off] of hemRows) {
    const r = ringAt(TEE_HEM, off); for (const p of r) p.y += y - TEE_HEM; rows.push(r); rowY.push(y);
  }
  for (const y of ys) { rows.push(ringAt(y, 0)); rowY.push(y); }
  const g = K.gridGeo(rows, { wrapU: true, outward: (p, out) => out.set(0, p.y, ttZ(p.y)), uv: (i, j) => [i / nTh, rowY[j]] });
  B.add(g, {
    ex: CS.shirt, uv: true, v3: cl(PART.tee, MC.jersey, TEE_HEM),
    weights: (p) => teeWeights(p),
  });
  addTeeCollar(B, lv, ringAt);
  for (const s of ['L', 'R']) addSleeve(B, lv, s);
}

/** Weight field of the tee body (also used by the sleeve tops so they stay hidden inside the lobes). */
function teeWeights(p) {
  const y = p.y, ax = Math.abs(p.x), sd = p.x > 0 ? 'L' : 'R';
  const a = sstep(0.715, 0.8, y), b = sstep(0.8, 0.9, y);
  let w = [['hips', 1 - a], ['spine', a * (1 - b)], ['chest', b]];
  const wu = sstep(0.098, 0.158, ax) * sstep(0.866, 0.9, y);                 // lobe → upper arm (the cap rides the arm)
  const wc = 0.55 * sstep(0.055, 0.11, ax) * sstep(0.9, 0.955, y) * (1 - wu); // shoulder slope → clavicle
  if (wu + wc > 0) { for (const e of w) e[1] *= 1 - wu - wc; w.push(['uArm' + sd, wu], ['clav' + sd, wc]); }
  const f = 0.55 * sstep(0.76, 0.702, y) * sstep(0.02, 0.07, Math.abs(p.z));
  if (f > 0) { for (const e of w) e[1] *= 1 - f; w.push([p.z > 0 ? 'hemF' : 'hemB', f]); }
  return w;
}

// ---- rib crew collar: a double-layer band standing on the neckline, leaning in toward the neck ---------------------
function addTeeCollar(B, lv, ringAt) {
  const [nC, nPsi0] = RES[lv].collar; const nPsi = nPsi0 + 4;
  const top = ringAt(TEE_TOP, 0);
  const m = top.length;
  // resample the neckline to nC points
  const pts = [];
  for (let i = 0; i < nC; i++) { const f = (i / nC) * m, i0 = Math.floor(f) % m, i1 = (i0 + 1) % m; pts.push(top[i0].clone().lerp(top[i1], f - Math.floor(f))); }
  const zc = ttZ(TEE_TOP);
  // profile in (out, up): inner face up → rolled top edge → outer face down, tucked into the neckline seam
  const H = 0.0125, T = 0.0034, lean = 0.42;
  const poly = [[-T * 0.5, -0.0045], [-T * 0.5, H * 0.35], [-T * 0.5, H - T * 0.5]];
  for (let k = 1; k < 6; k++) { const a = Math.PI - (k / 6) * Math.PI; poly.push([T * 0.5 * Math.cos(a), H - T * 0.5 + T * 0.5 * Math.sin(a)]); }
  poly.push([T * 0.5, H - T * 0.5], [T * 0.52, H * 0.45], [T * 0.62, 0.0008], [T * 0.2, -0.004]);
  const pl = [0]; for (let k = 1; k < poly.length; k++) pl.push(pl[k - 1] + Math.hypot(poly[k][0] - poly[k - 1][0], poly[k][1] - poly[k - 1][1]));
  const profile = [];
  for (let j = 0; j <= nPsi; j++) {
    const t = (j / nPsi) * pl[pl.length - 1]; let k = 0; while (k < pl.length - 2 && pl[k + 1] < t) k++;
    const f = (t - pl[k]) / Math.max(1e-9, pl[k + 1] - pl[k]);
    profile.push([lerp(poly[k][0], poly[k + 1][0], f), lerp(poly[k][1], poly[k + 1][1], f)]);
  }
  const rows = [];
  for (let j = 0; j <= nPsi; j++) {
    const [u, v] = profile[j];
    const row = [];
    for (let i = 0; i < nC; i++) {
      const p = pts[i];
      const out = new V3(p.x, 0, p.z - zc).normalize();
      const up = new V3(0, 1, 0).multiplyScalar(Math.cos(lean)).addScaledVector(out, -Math.sin(lean));
      row.push(p.clone().addScaledVector(out, u).addScaledVector(up, v));
    }
    rows.push(row);
  }
  const cg = K.gridGeo(rows, { wrapU: true, outward: (p, o) => o.set(0, p.y - 0.006, zc), uv: (i, j) => [i / nC, j / nPsi] });
  B.add(cg, { ex: CS.trim, uv: true, v3: cl(PART.collar, MC.rib), weights: (p) => [['chest', 0.86], ['neck', 0.14]] });
}

// ---- sleeves ------------------------------------------------------------------------------------------------------
const SLEEVE = { s0: -0.03, L: 0.098 };
function addSleeve(B, lv, s) {
  const [nTh, nS] = RES[lv].sleeve;
  const R = K.REST;
  const sx = s === 'L' ? 1 : -1;
  const sh = R['uArm' + s], el = R['fArm' + s];
  const d = el.clone().sub(sh).normalize();
  const lat = new V3(sx, 0, 0).addScaledVector(d, -d.x * sx).normalize();
  const fwd = new V3(0, 0, 1).addScaledVector(d, -d.z).addScaledVector(lat, -lat.z).normalize();
  const L = SLEEVE.L;
  // nominal sleeve radius (around the arm, + a flatter inner side toward the torso)
  const rS = (x) => lerp(0.0478, 0.0468, sstep(0.0, L, x)) + 0.0012 * sstep(L - 0.02, L, x);
  const lvF = RES[lv].fold, micro = RES[lv].micro;
  const fold = (phi, x) => {
    const c = Math.cos(phi), sn = Math.sin(phi);
    const inner = pos(-c);
    let D = 0;
    D += 0.0022 * gauss(x - 0.06, 0.03) * Math.pow(inner, 3) * Math.sin(x / 0.02 * TAU + 1.3);           // armpit bunching
    D += 0.0015 * gauss(x - 0.045, 0.035) * (Math.exp(-(((phi - 2.25) / 0.2) ** 2)) + Math.exp(-(((phi - 4.05) / 0.2) ** 2))); // diagonal drag ridges
    D += 0.0011 * sstep(L - 0.04, L, x) * Math.sin(phi * 5 + 0.8 * n1(phi * 2, 11));                   // hem ripple
    D -= 0.0035 * Math.pow(inner, 4) * sstep(0.0, 0.04, x);                                             // inner side flattened
    if (micro > 0) D += 0.0003 * micro * n1(x * 160 + Math.sin(phi * 3) * 2, 13) * n1(phi * 9, 17);
    return D * lvF;
  };
  const ringPt = (x, phi, off) => {
    const c = sh.clone().addScaledVector(d, x);
    const r0 = rS(x) + off, r = r0 + fold(phi, x);
    const base = c.clone().addScaledVector(lat, r0 * Math.cos(phi)).addScaledVector(fwd, r0 * 0.97 * Math.sin(phi));
    const p = c.addScaledVector(lat, r * Math.cos(phi)).addScaledVector(fwd, r * 0.97 * Math.sin(phi));
    // above the seam the sleeve hides just inside the shoulder lobe (folds included): wherever its base lies inside
    // the lobe, the final point is kept below the lobe's displaced surface
    const lr = LOBE_R(p.y);
    if (lr > 0) {
      lobeCenter(p.y, sx, _lc);
      const inside = Math.hypot(base.x - _lc.x, base.z - _lc.z) < lr + 0.0006 || x < 0.04;
      const dx = p.x - _lc.x, dz = p.z - _lc.z, rr = Math.hypot(dx, dz);
      const lim = lr + Math.min(0, teeFold(p, lvF, micro)) - 0.0016;
      if (inside && rr > lim) { const k = Math.max(0, lim) / rr; p.x = _lc.x + dx * k; p.z = _lc.z + dz * k; }
    }
    return p;
  };
  const xs = K.densitySamples(nS, SLEEVE.s0, L, (x) => 1 + 1.2 * gauss(x - 0.035, 0.02) + 1.4 * gauss(x - L, 0.015));
  const rows = [], sv = [];
  for (const x of xs) { rows.push(Array.from({ length: nTh }, (_, i) => ringPt(x, (i / nTh) * TAU, 0))); sv.push(x); }
  // rolled hem + inner lip
  for (const [dx, off] of [[0.0012, -0.0006], [0.0021, -0.0024], [0.0012, -0.0043], [-0.004, -0.0049], [-0.013, -0.0046]]) {
    rows.push(Array.from({ length: nTh }, (_, i) => ringPt(L + dx, (i / nTh) * TAU, off))); sv.push(L + Math.abs(dx) * 0.5 + (dx < 0 ? 0.002 : 0));
  }
  // set-in seam: a slim raised seam allowance along the line where the sleeve leaves the shoulder lobe (hero)
  if (lv >= 3) {
    const nS2 = nTh, loop = [], xsSeam = [];
    const outside = (x, phi) => { const q = ringPt(x, phi, 0); return teeSD(q.x, q.z, q.y) - teeFold(q, lvF, micro) > 0.0002; };
    for (let i = 0; i < nS2; i++) {
      const phi = (i / nS2) * TAU;
      let lo = -0.02, hi = 0.075;
      if (outside(lo, phi)) hi = lo; else {
        let x = lo; while (x < hi && !outside(x, phi)) x += 0.004;
        hi = Math.min(x, 0.075); lo = Math.max(-0.02, x - 0.004);
        for (let it = 0; it < 12; it++) { const m = (lo + hi) / 2; if (outside(m, phi)) hi = m; else lo = m; }
      }
      xsSeam.push(hi); loop.push(ringPt(hi + 0.0008, phi, 0.0004));
    }
    const nR = 5, prow = [];
    for (let k = 0; k <= nR; k++) {
      const a = (k / nR) * Math.PI;
      prow.push(loop.map((q, i) => {
        const phi = (i / nS2) * TAU; const c = sh.clone().addScaledVector(d, xsSeam[i]);
        const out = q.clone().sub(c); out.addScaledVector(d, -out.dot(d)).normalize();
        return q.clone().addScaledVector(d, -0.0012 * Math.cos(a)).addScaledVector(out, 0.0011 * Math.sin(a) - 0.0004);
      }));
    }
    const sg = K.gridGeo(prow, { wrapU: true, outward: (p2, o) => { const k = p2.clone().sub(sh).dot(d); o.copy(sh).addScaledVector(d, k); }, uv: (i, j) => [i / nS2, 0.0] });
    B.add(sg, { ex: CS.shirt, uv: true, v3: cl(PART.hem, MC.jersey), weights: (p2) => { const x = p2.clone().sub(sh).dot(d); const k = sstep(0.02, 0.065, x); const w = teeWeights(p2); for (const e of w) e[1] *= 1 - k; w.push(['uArm' + s, k]); return w; } });
  }
  const g = K.gridGeo(rows, {
    wrapU: true, poles: { start: sh.clone().addScaledVector(d, SLEEVE.s0 - 0.004) },
    outward: (p, out) => { const k = p.clone().sub(sh).dot(d); out.copy(sh).addScaledVector(d, k); },
    uv: (i, j) => [i / nTh, sv[j] - SLEEVE.s0], poleUv: { start: [0, 0] },
  });
  const uvA = g.attributes.uv;
  B.add(g, {
    ex: CS.shirt, uv: true, v3: cl(PART.sleeve, MC.jersey, L - SLEEVE.s0),
    weights: (p, i) => {
      const x = uvA.getY(i) + SLEEVE.s0;
      const k = sstep(0.02, 0.065, x);                    // lobe weights at the top → rigid upper arm below the seam
      const w = teeWeights(p);
      for (const e of w) e[1] *= 1 - k;
      w.push(['uArm' + s, k]);
      return w;
    },
  });
}

// ------------------------------------------------------------------------------------------------
// HARNESS — webbing straps that sit IN the tee's compression grooves, ladder-lock adjusters with loose tails, sternum
// strap with a side-release buckle. Straps follow the tee's weights (no lag when the spine bends) and hand over to the
// tank bone behind the shoulders.
// ------------------------------------------------------------------------------------------------
/** Surface frame on the tee at base point P: { n (outward normal), D (fold displacement at P) }. */
function teeFrameAt(P, lvF, micro) {
  const n = teeNormal(P.x, P.z, P.y, new V3());
  return { n, D: teeFold(P, lvF, micro) };
}
/** Flat webbing band along a curve: width 2w, thickness t, sitting on the tee (offset along its normal). */
function webbing(curve, w, t, nSeg, nAcross, lvF, micro, opt = {}) {
  const len = curve.getLength();
  const prof = []; // rounded-rectangle section (a = across -1..1, b = through -1..1)
  const nA = Math.max(1, nAcross);
  const roll = nAcross >= 3 ? [[1.06, 0.55], [1.08, 0], [1.06, -0.55]] : [[1.07, 0]];
  for (let k = 0; k <= nA; k++) prof.push([-1 + (2 * k) / nA, 1]);           // top face
  prof.push(...roll);                                                          // edge roll
  for (let k = nA; k >= 0; k--) prof.push([-1 + (2 * k) / nA, -1]);          // bottom face
  prof.push(...roll.map(([a, b]) => [-a, -b]).reverse());
  const rows = [], meta = [];
  const T = new V3(), b = new V3();
  for (let j = 0; j <= nSeg; j++) {
    const u = j / nSeg;
    const P = curve.getPointAt(u); curve.getTangentAt(u, T);
    const fr = opt.frame ? opt.frame(P, u) : teeFrameAt(P, lvF, micro);
    const n = fr.n.clone().addScaledVector(T, -fr.n.dot(T)).normalize();
    b.crossVectors(T, n).normalize();
    // on the tee: sit in the groove; in the air (bridging to the tank frame): stay on the path
    const air = opt.frame ? 0 : sstep(0.003, 0.009, teeSD(P.x, P.z, P.y));
    const C = P.clone().addScaledVector(n, (fr.D + t * 0.5 + 0.0003) * (1 - air) + (opt.lift ? opt.lift(u) : 0));
    const row = [];
    for (const [a, c] of prof) row.push(C.clone().addScaledVector(b, a * w).addScaledVector(n, c * t * 0.5));
    rows.push(row); meta.push(u * len);
  }
  const g = K.gridGeo(rows, {
    wrapU: true, outward: (p, out) => { out.copy(p); }, flip: false,
    uv: (i, j) => [meta[j], clamp(prof[i % prof.length][0], -1, 1)],
  });
  // orientation: normals must point away from the band centre line
  const P0 = curve.getPointAt(0.5), N = g.attributes.normal, Pp = g.attributes.position; let acc = 0;
  for (let i = 0; i < Pp.count; i += 7) { const dx = Pp.getX(i) - P0.x, dy = Pp.getY(i) - P0.y, dz = Pp.getZ(i) - P0.z; if (dx * dx + dy * dy + dz * dz < 0.0009) acc += N.getX(i) * dx + N.getY(i) * dy + N.getZ(i) * dz; }
  if (acc < 0) { const ix = g.index.array; for (let q = 0; q < ix.length; q += 3) { const tt = ix[q + 1]; ix[q + 1] = ix[q + 2]; ix[q + 2] = tt; } for (let i = 0; i < N.count; i++) N.setXYZ(i, -N.getX(i), -N.getY(i), -N.getZ(i)); }
  return { geo: g, len };
}
/** Tee weights for hardware riding on the tee (no hem flap). */
function onTeeWeights(p) { return teeWeights(p).filter((e) => e[0] !== 'hemF' && e[0] !== 'hemB'); }

function addHarness(B, lv) {
  const R = RES[lv];
  const lvF = R.fold, micro = R.micro;
  const hi = R.tank >= 2;
  const [seg, across] = R.web;
  for (const sp of strapPaths()) {
    if (sp.chest) continue;
    const { sx, curve } = sp;
    const { geo, len } = webbing(curve, STRAP.w, STRAP.t, seg, across, lvF, micro);
    B.add(geo, {
      ex: CS.strap, uv: true, v3: cl(PART.strap, MC.webbing),
      weights: (p) => { const w = sstep(-0.085, -0.118, p.z); const tw = onTeeWeights(p); for (const e of tw) e[1] *= 1 - w; tw.push(['tank', w]); return tw; },
    });
    // ladder-lock adjuster on the front run at chest height + the loose tail hanging below it
    if (lv < 1) continue;
    let best = null;
    for (let k = 0; k <= 300; k++) { const t = k / 300; const P = curve.getPointAt(t); if (P.z > 0.03 && (!best || Math.abs(P.y - 0.842) < Math.abs(best.P.y - 0.842))) best = { t, P }; }
    const Tg = curve.getTangentAt(best.t).normalize();
    const fr = teeFrameAt(best.P, lvF, micro);
    const o = fr.n.clone().addScaledVector(Tg, -fr.n.dot(Tg)).normalize();
    const bd = new V3().crossVectors(Tg, o).normalize();
    const base = best.P.clone().addScaledVector(o, fr.D + STRAP.t + 0.0003);
    const w8 = () => onTeeWeights(best.P);
    // frame: two side rails + three bars (ladder), bevelled dark plastic
    const lock = new THREE.Group();
    const partsL = [];
    if (hi) {
      for (const sgn of [1, -1]) { const rail = K.superEllipsoid(0.0021, 0.0112, 0.0026, 0.55, 0.6, 6, 8); partsL.push([rail, new V3(sgn * 0.0145, 0, 0.0018)]); }
      for (const yy of [-0.0085, 0.0, 0.0085]) { const bar = K.superEllipsoid(0.0142, 0.0016, 0.0019, 0.55, 0.6, 10, 4); partsL.push([bar, new V3(0, yy, yy === 0 ? 0.0034 : 0.0016)]); }
    } else partsL.push([K.superEllipsoid(0.0165, 0.0112, 0.0026, 0.4, 0.45, 8, 4), new V3(0, 0, 0.0018)]);
    for (const [g2, off] of partsL) { g2.translate(off.x, off.y, off.z); K.placeBasis(g2, bd, Tg, base); B.add(g2, { ex: CS.darkPlastic, v3: cl(PART.none, MC.plastic), weights: w8 }); }
    // loose tail: out of the lock, hanging with a slight curl, end heat-sealed
    const t0 = base.clone().addScaledVector(o, 0.0038).addScaledVector(Tg, 0.0105);
    const tailC = new THREE.CatmullRomCurve3([t0, t0.clone().addScaledVector(Tg, 0.016).addScaledVector(o, 0.0021), t0.clone().addScaledVector(Tg, 0.034).addScaledVector(o, 0.0034), t0.clone().addScaledVector(Tg, 0.046).addScaledVector(o, 0.0028)]);
    const tail = webbing(tailC, STRAP.w * 0.96, STRAP.t, Math.max(3, Math.round(seg / 8)), across, lvF, micro, { frame: () => ({ n: o, D: 0 }) });
    B.add(tail.geo, { ex: CS.strap, uv: true, v3: cl(PART.strap, MC.webbing, 1), weights: w8 });
  }
  // ---- sternum strap + side-release buckle
  if (lv >= 1) {
    const sp = strapPaths().find((q) => q.chest);
    const { geo } = webbing(sp.curve, 0.0072, 0.0018, Math.max(8, Math.round(seg * 0.45)), across, lvF, micro, { lift: (u) => 0.0022 * Math.sin(Math.PI * u) });
    B.add(geo, { ex: CS.strap, uv: true, v3: cl(PART.strap, MC.webbing), weights: (p) => onTeeWeights(p) });
    const c = teeBase(0, 0.886, new V3()); const fr = teeFrameAt(c, lvF, micro);
    const n = fr.n.clone(); const X = new V3(1, 0, 0).addScaledVector(n, -n.x).normalize(); const Y = new V3().crossVectors(n, X).normalize();
    const at = c.clone().addScaledVector(n, fr.D + 0.0072);
    const w8 = () => onTeeWeights(c);
    const put = (g2, x, y, z, ex, mc = MC.plastic) => { g2.translate(x, y, z); K.placeBasis(g2, X, Y, at); B.add(g2, { ex, v3: cl(PART.none, mc), weights: w8 }); };
    // female housing (left half) with its open mouth, male tongue (right half) with two prongs and a thumb grip
    put(K.superEllipsoid(0.0118, 0.0112, 0.0044, 0.3, 0.34, hi ? 14 : 8, hi ? 8 : 4), 0.0072, 0, 0, CS.darkPlastic);                 // female housing
    put(K.superEllipsoid(0.0082, 0.0098, 0.0038, 0.35, 0.4, hi ? 12 : 6, hi ? 6 : 4), -0.0112, 0, -0.0004, CS.darkPlastic);          // male tongue
    put(K.superEllipsoid(0.0058, 0.0058, 0.0011, 1, 1, hi ? 12 : 8, 3), 0.0072, 0, 0.0043, CS.team);                            // badge
    if (hi) {
      for (const sgn of [1, -1]) put(K.superEllipsoid(0.0034, 0.0021, 0.0024, 0.5, 0.5, 6, 4), -0.0012, sgn * 0.0068, 0.0004, CS.darkPlastic); // prongs
      for (let k = -2; k <= 2; k++) put(K.superEllipsoid(0.0007, 0.0062, 0.0006, 0.7, 0.7, 4, 4), -0.0118 + k * 0.0018, 0, 0.0036, CS.darkPlastic); // grip ribs
    }
  }
}

// ------------------------------------------------------------------------------------------------
// SHORTS — twill shorts built like a real pair: one pelvis shell whose horizontal sections are the pelvis smoothly
// unioned with two leg lobes (so the front panel flows into the legs, no ledge), closing into a crotch point where it
// splits into the two A-line legs. Fly placket, slant-pocket openings, patch back pockets, yoke and side seams are
// sculpted; crotch whiskers + seat drag folds + hem ripple; a turned-up team cuff with real thickness; gathered
// elastic waistband under the tee; drawcords with aglets.
// ------------------------------------------------------------------------------------------------
const SHX = { yc: 0.573, hipY: 0.622, yHem: 0.466, top: 0.782, k: 0.02 };
const SH_A = tab([[0.573, 0.03], [0.582, 0.074], [0.595, 0.104], [0.613, 0.1185], [0.635, 0.1245], [0.66, 0.1235], [0.685, 0.118], [0.705, 0.1125], [0.725, 0.1075], [0.75, 0.1035], [0.782, 0.1005]]);
const SH_B = tab([[0.58, 0.044], [0.595, 0.068], [0.613, 0.0795], [0.635, 0.0848], [0.66, 0.0845], [0.685, 0.0818], [0.705, 0.0785], [0.725, 0.0765], [0.75, 0.0745], [0.782, 0.0725]]);
const SH_Z = tab([[0.573, -0.004], [0.595, -0.005], [0.613, -0.006], [0.635, -0.007], [0.66, -0.008], [0.685, -0.01], [0.705, -0.011], [0.782, -0.011]]);
const shB = (y) => (y < 0.58 ? 0.044 * Math.sqrt(clamp((y - SHX.yc) / (0.58 - SHX.yc), 0, 1)) : SH_B(y));
/** Leg lobe / leg tube: centre on the (rest) thigh axis, flaring outward toward the hem; radius grows (A-line). */
function shLegC(y, sx, out) { const t = (SHX.hipY - y) / 0.275; return out.set(sx * (0.078 + 0.003 * t + 0.0085 * sstep(0.6, SHX.yHem, y)), y, 0.012 * t - 0.004); }
const shLegR = (y) => (y > 0.6 ? lerp(0.0605, 0.0, sstep(0.605, 0.69, y)) : lerp(0.0605, 0.0728, sstep(0.6, SHX.yHem, y)));
function shSec(y) {
  const S = { a: SH_A(y), b: shB(y), n: 2.3, zc: SH_Z(y), lr: shLegR(y), lx: 0, lz: 0 };
  shLegC(y, 1, _lc); S.lx = _lc.x; S.lz = _lc.z;
  return S;
}
function shSD(x, z, S) {
  const dz0 = z - S.zc, r = Math.hypot(x, dz0);
  let d;
  if (S.b < 1e-5) d = Math.hypot(Math.max(0, Math.abs(x) - S.a), dz0);
  else if (r < 1e-9) d = -Math.min(S.a, S.b);
  else { const ux = Math.abs(x) / r, uz = Math.abs(dz0) / r; d = r - 1 / Math.pow(Math.pow(ux / S.a, S.n) + Math.pow(uz / S.b, S.n), 1 / S.n); }
  if (S.lr > 1e-4) {
    d = smin(d, Math.hypot(x - S.lx, z - S.lz) - S.lr, SHX.k);
    d = smin(d, Math.hypot(x + S.lx, z - S.lz) - S.lr, SHX.k);
  }
  return d;
}
function shRing(y, m, N = 168) {
  const S = shSec(y), P = [];
  for (let i = 0; i < N; i++) {
    const al = (i / N) * TAU, dx = Math.sin(al), dz = Math.cos(al);
    let hi = 0.2, lo = hi;
    while (lo > 0.0 && shSD(dx * lo, S.zc + dz * lo, S) > 0) { hi = lo; lo -= 0.006; }
    lo = Math.max(0, lo);
    for (let it = 0; it < 14; it++) { const mid = (lo + hi) / 2; if (shSD(dx * mid, S.zc + dz * mid, S) < 0) lo = mid; else hi = mid; }
    const rr = (lo + hi) / 2; P.push([dx * rr, S.zc + dz * rr]);
  }
  return resampleQuarters(P, m);
}
/** Resample a closed polyline (from the front centre, +X next) uniformly by arc length within each quarter. */
function resampleQuarters(P, m) {
  const N = P.length;
  let iL = 0, iR = 0; for (let i = 0; i < N; i++) { if (P[i][0] > P[iL][0]) iL = i; if (P[i][0] < P[iR][0]) iR = i; }
  const anchors = [0, iL, N / 2, iR, N];
  const out = [], q = m / 4;
  for (let k = 0; k < 4; k++) {
    const i0 = anchors[k], i1 = anchors[k + 1];
    const L = [0]; for (let i = i0 + 1; i <= i1; i++) { const a = P[(i - 1) % N], b = P[i % N]; L.push(L[L.length - 1] + Math.hypot(b[0] - a[0], b[1] - a[1])); }
    const tot = L[L.length - 1]; let j = 0;
    for (let s = 0; s < q; s++) {
      const target = (s / q) * tot;
      while (j < L.length - 2 && L[j + 1] < target) j++;
      const f = (target - L[j]) / Math.max(1e-9, L[j + 1] - L[j]);
      const a = P[(i0 + j) % N], b = P[(i0 + j + 1) % N];
      out.push([lerp(a[0], b[0], f), lerp(a[1], b[1], f)]);
    }
  }
  return out;
}
function shNormal(x, z, y, out) {
  const h = 2e-4;
  const S0 = shSec(y), S1 = shSec(y + h), S2 = shSec(y - h);
  const gx = shSD(x + h, z, S0) - shSD(x - h, z, S0), gz = shSD(x, z + h, S0) - shSD(x, z - h, S0), gy = shSD(x, z, S1) - shSD(x, z, S2);
  const l = Math.hypot(gx, gy, gz) || 1; return out.set(gx / l, gy / l, gz / l);
}
/** Pelvis displacement at base point p (fly, pockets, whiskers, back pockets, yoke, side seams). */
function shortsFold(p, lvF) {
  const y = p.y, ax = Math.abs(p.x), zc = SH_Z(y);
  const th = Math.atan2(p.x, p.z - zc), c = Math.cos(th), front = pos(c), back = pos(-c);
  let D = 0;
  if (p.z > zc) {
    // fly placket (left-over-right) + the J-stitched dip beside it
    const fx = p.x - 0.009;
    D += 0.001 * sstep(0.0062, 0.0046, Math.abs(fx)) * sstep(0.626, 0.645, y) * sstep(0.752, 0.742, y);
    D -= 0.0013 * gauss(p.x + 0.0005, 0.0026) * sstep(0.636, 0.66, y);
    // slant pocket openings: groove + a raised lip on the front-panel side
    for (const sx of [1, -1]) {
      const x0 = sx * 0.064, y0 = 0.754, x1 = sx * 0.116, y1 = 0.668;
      const bx = x1 - x0, by = y1 - y0, L2 = bx * bx + by * by;
      const t = clamp(((p.x - x0) * bx + (y - y0) * by) / L2, 0, 1);
      const dx = p.x - (x0 + bx * t), dy = y - (y0 + by * t);
      const sgn = Math.sign(dx * by - dy * bx) * sx;
      const d = Math.hypot(dx, dy);
      D -= 0.0019 * Math.exp(-((d / 0.0024) ** 2)) * sstep(0.0, 0.05, t);
      D += 0.0011 * Math.exp(-(((d - 0.0042) / 0.003) ** 2)) * (sgn > 0 ? 1 : 0.3) * sstep(0.0, 0.08, t);
    }
    // crotch whiskers radiating from the fly bottom toward the thigh tops
    for (const [x1, y1, amp] of [[0.062, 0.598, 0.0022], [0.088, 0.618, 0.0018], [0.042, 0.588, 0.0014]]) D += ridge(ax, y, 0.012, 0.636, x1, y1, 0.0075, amp) * front;
  } else {
    // back patch pockets: raised panel with a folded top edge
    for (const sx of [1, -1]) {
      const qx = p.x - sx * 0.058, qy = y - 0.668;
      const e = Math.pow(Math.pow(Math.abs(qx) / 0.036, 6) + Math.pow(Math.abs(qy) / 0.041, 6), 1 / 6);
      D += 0.0012 * (1 - sstep(0.94, 1.02, e)) + 0.0006 * gauss(qy - 0.037, 0.0025) * (1 - sstep(0.9, 1.0, Math.abs(qx) / 0.036));
    }
    D += 0.0008 * gauss(p.x, 0.003) * sstep(0.59, 0.62, y);                     // centre-back seam
    D += 0.0012 * gauss(y - 0.735 + 0.012 * sstep(0.0, 0.06, ax), 0.006) * sstep(0.01, 0.04, ax); // back yoke seam
    // seat drag folds from the crotch toward the hips
    for (const [x1, y1, amp] of [[0.1, 0.63, 0.002], [0.07, 0.61, 0.0016]]) D += ridge(ax, y, 0.02, 0.585, x1, y1, 0.008, amp) * back;
  }
  D += 0.0006 * Math.exp(-(((Math.abs(th) - Math.PI / 2) / 0.03) ** 2)) * sstep(0.6, 0.63, y);   // side seams
  return D * lvF;
}
/** Leg tube displacement: psi 0 = inseam, pi/2 = front (+X leg; back for the -X leg), pi = outer seam. */
function shortsLegFold(psi, y, sx, lvF) {
  const s = SHX.hipY - y, L = SHX.hipY - SHX.yHem;
  const fr = sx > 0 ? psi : TAU - psi;                  // mirror so 'front' means +Z on both legs
  let D = 0;
  D += 0.0026 * gauss(s - 0.06, 0.028) * Math.exp(-(((fr - 0.75) / 0.3) ** 2));   // crotch drag (front-inner)
  D += 0.0022 * gauss(s - 0.065, 0.03) * Math.exp(-(((fr - 5.4) / 0.32) ** 2));   // seat drag (back-inner)
  D += 0.0018 * sstep(L - 0.06, L, s) * Math.sin(psi * 5 + 1.7 + 0.9 * n1(psi * 1.6, 21 + sx)); // hem ripple
  D += 0.0012 * gauss(s - 0.1, 0.04) * Math.sin(fr * 3.0 + 0.4);
  D -= 0.002 * Math.pow(pos(Math.cos(psi)), 3) * sstep(0.075, 0.05, s);            // inseam tuck
  return D * lvF;
}

function addShorts(B, lv) {
  const R = RES[lv];
  let [nTh, nRows] = R.shorts; nTh = Math.round(nTh / 8) * 8;
  const lvF = R.fold;
  const nrm = new V3();
  // ---- pelvis shell: rows from the waist down to the crotch closure
  const ys = K.densitySamples(nRows, SHX.yc, SHX.top - 0.004, (y) => 1 + 2.2 * gauss(y - SHX.yc, 0.012) + 0.8 * gauss(y - 0.6, 0.02) + 0.4 * gauss(y - 0.7, 0.04)).reverse();
  const rows = [], rowY = [];
  for (const y of ys) {
    const ring = shRing(y, nTh);
    rows.push(ring.map(([x, z]) => { shNormal(x, z, y, nrm); const p = new V3(x, y, z); return p.addScaledVector(nrm, shortsFold(p, lvF)); }));
    rowY.push(y);
  }
  // crotch closure: front + back centre points of the last ring meet
  { const last = rows[rows.length - 1]; const c = last[0].clone().lerp(last[nTh / 2], 0.5); last[0].copy(c); last[nTh / 2].copy(c); }
  const pelvisW = (p) => {
    const a = sstep(0.7, 0.77, p.y);
    const wt = thighW(SHX.hipY - p.y) * sstep(0.012, 0.045, Math.abs(p.x)) * sstep(0.66, 0.62, p.y);
    return [['hips', (1 - a) * (1 - wt)], ['spine', a * (1 - wt)], [p.x > 0 ? 'thighL' : 'thighR', wt]];
  };
  const pg = K.gridGeo(rows, { wrapU: true, outward: (p, out) => out.set(0, p.y, SH_Z(p.y)), uv: (i, j) => [i / nTh, rowY[j]] });
  // ---- legs: the two halves of the crotch ring, relaxing into A-line tubes
  const half = nTh / 2;
  const legs = [];
  for (const sx of [1, -1]) {
    const s = sx > 0 ? 'L' : 'R';
    const top = rows[rows.length - 1];
    const tear = []; for (let k = 0; k < half; k++) tear.push(top[sx > 0 ? k : half + k].clone());
    const L = SHX.hipY - SHX.yHem;
    const yEnd = SHX.yHem + 0.019;
    const nL = R.sLeg[1];
    const lys = K.densitySamples(nL, yEnd, SHX.yc, (y) => 1 + 1.4 * gauss(y - SHX.yc, 0.02) + 1.0 * gauss(y - SHX.yHem, 0.03)).reverse();
    const circ = (y, off) => {
      const C = shLegC(y, sx, new V3()), r = shLegR(y);
      return Array.from({ length: half }, (_, k) => {
        const psi = (k / half) * TAU;
        const rr = r + shortsLegFold(psi, y, sx, lvF) + off;
        return sx > 0 ? new V3(C.x - rr * Math.cos(psi), y, C.z + rr * Math.sin(psi)) : new V3(C.x + rr * Math.cos(psi), y, C.z - rr * Math.sin(psi));
      });
    };
    const lrows = [], lv2 = [];
    for (const y of lys) {
      const bl = Math.pow(sstep(SHX.yc, SHX.yc - 0.07, y), 0.8);
      const c = circ(y, 0);
      const C0 = shLegC(SHX.yc, sx, new V3()), C1 = shLegC(y, sx, new V3());
      lrows.push(tear.map((t, k) => t.clone().add(C1).sub(C0).setY(y).lerp(c[k], bl)));
      lv2.push(SHX.hipY - y);
    }
    lrows[0] = tear.map((t) => t.clone());
    const axisOut = (p, out) => { shLegC(p.y, sx, out); };
    const lg = K.gridGeo(lrows, { wrapU: true, outward: axisOut, uv: (i, j) => [i / half, lv2[j]] });
    legs.push({ s, sx, geo: lg, circ, axisOut });
  }
  // weld normals across the pelvis / leg boundary (pelvis last row ↔ leg first rows)
  {
    const PN = pg.attributes.normal, rowsN = rows.length, oc = nTh + 1, base = (rowsN - 1) * oc;
    for (const lg of legs) {
      const LN = lg.geo.attributes.normal;
      for (let k = 0; k <= half; k++) {
        const pi = base + (lg.sx > 0 ? k : half + k) % (nTh + 1);
        const x = PN.getX(pi) + LN.getX(k), y = PN.getY(pi) + LN.getY(k), z = PN.getZ(pi) + LN.getZ(k), l = Math.hypot(x, y, z) || 1;
        PN.setXYZ(pi, x / l, y / l, z / l); LN.setXYZ(k, x / l, y / l, z / l);
      }
    }
    // the seam column of the pelvis ring (index nTh duplicates 0)
    PN.setXYZ(base + nTh, PN.getX(base), PN.getY(base), PN.getZ(base));
  }
  B.add(pg, { ex: CS.shorts, uv: true, v3: cl(PART.shorts, MC.twill), weights: pelvisW });
  for (const lg of legs) {
    // matches the pelvis weights along the shared crotch ring (no seam opening when the legs spread), then pure leg
    const legW = (p) => { const w = thighW(SHX.hipY - p.y) * lerp(sstep(0.012, 0.045, Math.abs(p.x)), 1, sstep(SHX.yc, SHX.yc - 0.03, p.y)); return [['hips', 1 - w], ['thigh' + lg.s, w]]; };
    B.add(lg.geo, { ex: CS.shorts, uv: true, v3: cl(PART.shortLeg, MC.twill, SHX.hipY - SHX.yHem), weights: legW });
    // turned-up cuff: outer face (team), rolled bottom, tucked inside lip; proud of the leg by its own thickness
    const prof = lv >= 4 ? [[-0.0205, -0.0002], [-0.0196, 0.0026], [-0.017, 0.0036], [-0.004, 0.0038], [0.0045, 0.0034], [0.0061, 0.0016], [0.0064, -0.0006], [0.0052, -0.0024], [0.0028, -0.0032], [-0.004, -0.0034], [-0.014, -0.003]]
      : lv >= 3 ? [[-0.0205, -0.0002], [-0.0192, 0.0031], [-0.004, 0.0038], [0.0048, 0.0032], [0.0064, -0.0004], [0.004, -0.0029], [-0.004, -0.0034], [-0.014, -0.003]]
      : [[-0.0205, -0.0002], [-0.018, 0.0036], [0.005, 0.0034], [0.0064, -0.0006], [0.002, -0.0032], [-0.012, -0.003]];
    const crow = prof.map(([dx, dr]) => lg.circ(SHX.yHem - dx, dr));
    const cg = K.gridGeo(crow, { wrapU: true, outward: lg.axisOut, uv: (i, j) => [i / half, j / (prof.length - 1)] });
    B.add(cg, { ex: CS.team, uv: true, v3: cl(PART.cuff, MC.twill), weights: legW });
  }
  // ---- gathered elastic waistband (mostly under the tee; shows when the hem flaps) — hero only
  if (lv >= 3) {
    const nW = Math.max(24, nTh), wr = [];
    const ring0 = shRing(SHX.top - 0.004, nW);
    for (const [y, off] of [[0.742, -0.0004], [0.745, 0.0014], [0.766, 0.0019], [0.784, 0.0016], [0.787, 0.0002], [0.785, -0.0022], [0.776, -0.0026]]) {
      wr.push(ring0.map(([x, z], i) => { const th = (i / nW) * TAU; const rr = Math.hypot(x, z + 0.011); const k = (rr + off + 0.0005 * Math.sin(th * 44) * (off > 0 ? 1 : 0)) / rr; return new V3(x * k, y, -0.011 + (z + 0.011) * k); }));
    }
    const wg = K.gridGeo(wr, { wrapU: true, outward: (p, out) => out.set(0, p.y, -0.011), uv: (i, j) => [i / nW, j / 6] });
    B.add(wg, { ex: CS.shorts, uv: true, v3: cl(PART.cuff, MC.rib, 0), weights: () => [['spine', 0.6], ['hips', 0.4]] });
  }
  // ---- drawcords peeking out under the tee hem: braided cord + metal aglets
  if (lv >= 1) for (const sx of [1, -1]) {
    const x = 0.011 * sx;
    const pts = [new V3(x, 0.712, 0.0712), new V3(x, 0.7, 0.0748), new V3(x + 0.0018 * sx, 0.684, 0.0848), new V3(x + 0.0036 * sx, 0.668, 0.0932)];
    const sw = K.sweep(pts, { seg: lv >= 3 ? 12 : 7, radial: lv >= 3 ? 8 : 5, capSteps: 2, radius: () => 0.0021, outward: (P, o) => o.set(0, 0, 1) });
    const len = sw.curve.getLength(); const tA = sw.t, cA = sw.cs;
    B.add(sw.geo, { ex: CS.lace, uv: (i) => [tA[i] * len, cA[i]], v3: cl(PART.cord, MC.lace), bone: 'hips' });
    const tipP = sw.curve.getPointAt(1), tipT = sw.curve.getTangentAt(1);
    const ag = K.lathe([[0, -0.0052], [0.0022, -0.0052], [0.0027, -0.0044], [0.0027, 0.0038], [0.0024, 0.0048], [0, 0.005]], lv >= 3 ? 12 : 8);
    K.alongAxis(ag, tipP.clone().addScaledVector(tipT, 0.004), tipT.clone().negate());
    B.add(ag, { ex: CS.metal, v3: cl(PART.none, MC.metal), bone: 'hips' });
  }
}

// ------------------------------------------------------------------------------------------------
// SOCKS — the leg surface offset by the knit's thickness (so they can never clip the skin: same section, same weights),
// with a slouch of soft rings above the ankle and a rolled double-layer cuff at the top.
// ------------------------------------------------------------------------------------------------
const SOCK = { top: 0.2065, off: 0.0024 };
function addSocks(B, lv) {
  const [nTh, nS] = RES[lv].sock;
  const lvF = RES[lv].fold;
  for (const s of ['L', 'R']) {
    const Lg = legSpec2(s);
    const fr = {};
    // arc length where the leg path crosses the sock top
    let sTop = Lg.sK; for (let q = Lg.sK; q < Lg.sA; q += 0.0005) { Lg.path.at(q, fr); if (fr.C.y < SOCK.top) { sTop = q; break; } }
    const sBot = Lg.sA + 0.028;
    const sockR = (th, s2, extra) => {
      const [a, b] = Lg.sec(th, s2); const r = Math.hypot(a, b) || 1e-6;
      const slouch = 0.0012 * Math.sin((s2 - sTop) / 0.0125 * TAU + 1.6 * n1(th * 1.3, 31 + (s === 'L' ? 1 : 2))) * gauss(s2 - Lg.sA + 0.06, 0.03);
      const cuffK = 0.0006 * sstep(sTop + 0.02, sTop + 0.012, s2);                                   // cuff band sits a touch proud
      const k = (r + SOCK.off + (slouch + cuffK) * lvF + extra) / r;
      return [a * k, b * k];
    };
    const ss = K.densitySamples(nS, sTop, sBot, (x) => 1 + 1.2 * gauss(x - sTop, 0.012) + 0.6 * gauss(x - Lg.sA + 0.06, 0.03));
    const rows = [], sv = [];
    const ringAt = (s2, extra, dy = 0) => { Lg.path.at(s2, fr); const row = []; for (let i = 0; i < nTh; i++) { const th = (i / nTh) * TAU; const [a, b] = sockR(th, s2, extra); row.push(fr.C.clone().addScaledVector(fr.l, a).addScaledVector(fr.f, b).addScaledVector(fr.d, -dy)); } return row; };
    // rolled top edge: inner lip → over the top → outside
    for (const [dy, extra] of [[-0.009, -0.0036], [-0.0015, -0.0034], [0.0006, -0.0022], [0.0011, -0.0006]]) { rows.push(ringAt(sTop, extra, dy)); sv.push(-Math.abs(dy) * 0.3); }
    for (const x of ss) { rows.push(ringAt(x, 0)); sv.push(x - sTop); }
    const g = K.gridGeo(rows, { wrapU: true, outward: (p, out) => { let best = sTop, bd = 1e9; for (let q = sTop; q <= sBot; q += 0.01) { Lg.path.at(q, fr); const d = fr.C.distanceToSquared(p); if (d < bd) { bd = d; best = q; } } Lg.path.at(best, fr); out.copy(fr.C); }, uv: (i, j) => [i / nTh, sv[j]] });
    const uvA = g.attributes.uv;
    B.add(g, {
      ex: CS.sock, uv: true, v3: cl(PART.sock, MC.rib),
      weights: (p, i) => { const s2 = uvA.getY(i) + sTop; const wA = sstep(Lg.sA - 0.02, Lg.sA + 0.012, s2); return [['shin' + s, 1 - wA], ['foot' + s, wA]]; },
    });
  }
}

// ------------------------------------------------------------------------------------------------
// SNEAKERS — cupsole court sneaker built like the real thing, as the LEFT shoe in foot space (origin under the ankle,
// +x lateral, +z forward), mirrored for the right:
//   outsole (lugged wall, toe spring, heel bevel) · midsole (stitch channel, flex grooves, heel window, toe bumper) ·
//   upper loft (vamp flex creases, throat recess) · overlays with real edge thickness (mudguard, heel counter, eyestays,
//   side wave panel) · padded tongue with a woven tab · metal eyelets · criss-cross flat laces with a bow and aglets ·
//   padded collar + lining · heel pull loop. Rubber wear / stitching / textures are in the cloth shader.
// ------------------------------------------------------------------------------------------------
const SK = { L: 0.125, cz: 0.05 };
const skSpring = (zl) => 0.018 * sstep(0.05, 0.125, zl) ** 2 + 0.004 * sstep(-0.09, -0.125, zl) ** 2;
/** Footprint outline point at phi (0 toe, pi/2 lateral, pi heel, 3pi/2 medial), grown by `inset`. */
function skOutline(phi, inset, out) {
  const c = Math.cos(phi), sn = Math.sin(phi);
  const zN = spow(c, 2 / 2.25);
  const zl = SK.L * zN;
  let w = lerp(0.0445, 0.0535, sstep(-0.1, 0.06, zl)) - 0.004 * sstep(0.09, 0.125, zl);
  if (sn < 0) w -= 0.0072 * gauss(zl + 0.004, 0.034);                          // medial arch
  return out.set((w + inset) * spow(sn, 2 / 2.7), 0, SK.cz + (SK.L + inset * 0.9) * zN);
}
/** Midsole top height above the ground line (heel-to-toe drop, bumper climbing up the toe). */
const skMid = (zl) => 0.027 + 0.008 * sstep(0.01, -0.07, zl) + 0.0085 * sstep(0.098, 0.124, zl);
/** Collar ring (ankle opening) point at phi. */
function skCollar(phi, out) {
  const c = Math.cos(phi), sn = Math.sin(phi), back = pos(-c), front = pos(c);
  return out.set(0.0405 * sn, 0.093 + 0.016 * back * back + 0.005 * front * front - 0.003 * sn * sn, -0.004 + 0.051 * c);
}
/** Upper loft: phi around, t 0 (sole line) → 1 (collar). */
function skUpper(phi, t, out) {
  const b = skOutline(phi, -0.0042, new V3()); const zl = b.z - SK.cz;
  b.y = skMid(zl) - 0.0022 + skSpring(zl);
  const c = skCollar(phi, new V3());
  const cf = pos(Math.cos(phi)), cb = pos(-Math.cos(phi)), sn = Math.sin(phi);
  let k = lerp(0.35, 0.1, cf * cf); k = lerp(k, 0.14, cb * cb);
  const m = b.clone().lerp(c, k);
  m.x += Math.sign(b.x) * 0.0062 * sn * sn;
  m.y = 0.066 + 0.005 * sn * sn + 0.028 * cb * cb + skSpring(zl) * 0.6 + 0.004 * cf;
  m.z += 0.004 * cb;
  const u = 1 - t;
  return out.set(u * u * b.x + 2 * u * t * m.x + t * t * c.x, u * u * b.y + 2 * u * t * m.y + t * t * c.y, u * u * b.z + 2 * u * t * m.z + t * t * c.z);
}
function skUpperN(phi, t, out) {
  const p = skUpper(phi, t, new V3()), a = skUpper(phi + 0.003, t, new V3()), b = skUpper(phi, Math.min(1, t + 0.003), new V3());
  if (t + 0.003 > 1) b.subVectors(p, skUpper(phi, t - 0.003, new V3())).add(p);
  out.crossVectors(a.sub(p), b.sub(p)).normalize();
  const ctr = new V3(0, 0.045, SK.cz); if (out.dot(p.sub(ctr)) < 0) out.negate();
  return out;
}
// throat: the lace opening along the top of the vamp (phi ≈ 0), eyestays either side
const SK_THROAT = { t0: 0.6, t1: 1.0 };
const throatHalf = (t) => lerp(0.1, 0.26, sstep(SK_THROAT.t0, SK_THROAT.t1, t));  // half-width in phi
/** Upper displacement: throat recess, vamp flex creases, heel counter pad, toe box. */
function skUpperD(phi, t, lvF) {
  const a = Math.atan2(Math.sin(phi), Math.cos(phi)), aa = Math.abs(a);
  let D = 0;
  const inThroat = sstep(SK_THROAT.t0 - 0.03, SK_THROAT.t0 + 0.04, t) * (1 - sstep(throatHalf(t) - 0.03, throatHalf(t) + 0.02, aa));
  D -= 0.0022 * inThroat;
  D += 0.0007 * lvF * Math.sin(t * 58 + a * 3) * sstep(0.25, 0.4, t) * sstep(0.62, 0.5, t) * sstep(0.9, 0.3, aa); // vamp flex creases
  D += 0.001 * gauss(aa - Math.PI, 0.5) * sstep(0.2, 0.5, t) * sstep(1.0, 0.8, t);                                // heel counter pad
  return D;
}

let _shoeCache = new Map();
function shoeParts(lv) {
  if (_shoeCache.has(lv)) return _shoeCache.get(lv);
  const q = RES[lv].shoe, lvF = RES[lv].fold, SR = SHOE_RES[lv];
  const nP = SR.nP;
  const pr = (n) => Math.max(1, Math.round(n * SR.pk));
  const phis = []; for (let i = 0; i < nP; i++) phis.push((i / nP) * TAU);
  const parts = []; // { geo, ex, v3, uv }
  const tmp = new V3(), nn = new V3();
  // ---- outsole: bottom plate + lugged rubber wall
  {
    const rows = [];
    for (const k of [0.4, 0.78, 0.95]) rows.push(phis.map((ph) => { const o = skOutline(ph, -0.0024, new V3()); const p = new V3(o.x * k, 0, SK.cz + (o.z - SK.cz) * k); p.y = skSpring(p.z - SK.cz); return p; }));
    const g = K.gridGeo(rows, { wrapU: true, poles: { start: new V3(0, skSpring(0), SK.cz) }, outward: (p, out) => out.set(p.x, p.y + 1, p.z), uv: (i, j) => { const p = rows[j][i % nP]; return [p.x, p.z - SK.cz]; }, poleUv: { start: [0, 0] } });
    parts.push({ geo: g, ex: CS.outsole, v3: cl(PART.outsole, MC.rubber, 0), uv: true });
    const lug = (ph) => { const z = skOutline(ph, 0, tmp).z; const per = 0.0094; const f = (Math.abs(z * 1000 + Math.sin(ph) * 3) / (per * 1000)) % 1; return q >= 1 ? 0.0011 * sstep(0.3, 0.45, f) * sstep(0.95, 0.8, f) : 0; };
    const wr = [];
    for (const [y, inset, lugK] of (q >= 2 ? [[0.0, -0.0024, 0.4], [0.0016, -0.0004, 1], [0.0048, 0.0006, 1], [0.0062, 0.0004, 0.6], [0.0072, -0.0006, 0]] : [[0.0, -0.0024, 0], [0.0032, 0.0004, 0], [0.0072, -0.0006, 0]])) wr.push(phis.map((ph) => { const p = skOutline(ph, inset + lug(ph) * lugK, new V3()); p.y = y + skSpring(p.z - SK.cz); return p; }));
    const wg = K.gridGeo(wr, { wrapU: true, outward: (p, out) => out.set(0, p.y, SK.cz), uv: (i, j) => { const p = wr[j][i % nP]; return [p.x, p.z - SK.cz]; } });
    parts.push({ geo: wg, ex: CS.outsole, v3: cl(PART.outsole, MC.rubber, 1), uv: true });
  }
  // ---- midsole / cupsole wall: bulged foam, stitch channel, forefoot flex grooves, heel window (shader), toe bumper
  {
    const nH = SR.nH;
    const rows = [];
    for (let j = 0; j <= nH; j++) {
      const f = j / nH;
      rows.push(phis.map((ph) => {
        const zl0 = skOutline(ph, 0, tmp).z - SK.cz;
        const top = skMid(zl0);
        const y = lerp(0.0068, top, f);
        const bulge = 0.0024 * Math.sin(Math.PI * clamp(f * 1.05, 0, 1)) - 0.0018 * sstep(0.85, 1.0, f);
        const channel = -0.0009 * gauss(f - 0.64, 0.05) * (q >= 1 ? 1 : 0);
        const side = Math.abs(Math.sin(ph));
        const flex = q >= 2 ? -0.0008 * Math.pow(pos(Math.cos((zl0 - 0.06) / 0.0105 * Math.PI * 2)), 8) * sstep(0.02, 0.05, zl0) * sstep(0.12, 0.1, zl0) * side * sstep(0.15, 0.3, f) * sstep(0.62, 0.5, f) : 0;
        const p = skOutline(ph, 0.0006 + bulge + channel + flex, new V3());
        p.y = y + skSpring(p.z - SK.cz);
        return p;
      }));
    }
    const g = K.gridGeo(rows, { wrapU: true, outward: (p, out) => out.set(0, p.y, SK.cz), uv: (i, j) => [i / nP, j / nH] });
    parts.push({ geo: g, ex: CS.sole, v3: cl(PART.midsole, MC.foam), uv: true });
  }
  // ---- upper
  const nT = SR.nT;
  {
    const ts = K.densitySamples(nT, 0, 1, (t) => 1 + 0.8 * gauss(t, 0.1) + 1.2 * gauss(t - 1, 0.08) + 0.5 * gauss(t - 0.6, 0.1));
    const rows = ts.map((t) => phis.map((ph) => { const p = skUpper(ph, t, new V3()); skUpperN(ph, t, nn); return p.addScaledVector(nn, skUpperD(ph, t, lvF)); }));
    const tv = ts.slice();
    // lining folding inside the collar
    for (const [dy, k] of [[-0.0024, 0.9], [-0.018, 0.84]]) { rows.push(phis.map((ph) => { const c = skCollar(ph, new V3()); return new V3(c.x * k, c.y + dy, -0.004 + (c.z + 0.004) * k); })); tv.push(1 + (1 - k)); }
    const g = K.gridGeo(rows, { wrapU: true, outward: (p, out) => out.set(0, 0.03, SK.cz - 0.03), uv: (i, j) => [i / nP, tv[j]] });
    parts.push({ geo: g, ex: (p, i, uvA) => (uvA.getY(i) > 1.001 ? CS.teamDark : CS.shoe), v3: cl(PART.upper, MC.leather, 1), uv: true });
  }
  // ---- overlays with thickness: patch over (phi, t) given per-row phi range or per-column t range
  const patch = (nu, nv, map, h, ex, v3, opt = {}) => {
    const rows = [];
    for (let j = 0; j <= nv; j++) rows.push(Array.from({ length: nu + 1 }, (_, i) => { const [ph, t] = map(i / nu, j / nv); const p = skUpper(ph, t, new V3()); skUpperN(ph, t, nn); return p.addScaledVector(nn, skUpperD(ph, t, lvF) + h); }));
    const g = K.gridGeo(rows, { wrapU: false, outward: (p, out) => out.set(0, 0.03, SK.cz - 0.01), uv: (i, j) => [i / nu, j / nv] });
    parts.push({ geo: g, ex, v3, uv: true });
    // edge wall (the overlay's cut edge) around the boundary, from +h down into the base (hero)
    if (q < 2) return;
    const loop = [];
    for (let i = 0; i <= nu; i++) loop.push([i / nu, 0]);
    for (let j = 1; j <= nv; j++) loop.push([1, j / nv]);
    for (let i = nu - 1; i >= 0; i--) loop.push([i / nu, 1]);
    for (let j = nv - 1; j >= 1; j--) loop.push([0, j / nv]);
    const skipEdge = opt.skipEdge || (() => false);
    const top = [], bot = [];
    for (const [u, v] of loop) { const [ph, t] = map(u, v); const p = skUpper(ph, t, new V3()); skUpperN(ph, t, nn); const d = skUpperD(ph, t, lvF); top.push(p.clone().addScaledVector(nn, d + h)); bot.push(p.clone().addScaledVector(nn, d - 0.0004)); }
    const wg = K.gridGeo([bot, top], { wrapU: true, outward: (p, out) => { out.set(0, 0.03, SK.cz); }, uv: (i, j) => [i / loop.length, 0.02 + j * 0.001] });
    parts.push({ geo: wg, ex, v3, uv: true });
  };
  const H = 0.0011;
  if (q >= 1) {
    // mudguard / toe cap: around the toe, top edge scalloped up toward the vamp
    patch(pr(26), pr(3), (u, v) => { const ph = lerp(-1.05, 1.05, u); const tTop = 0.34 + 0.12 * Math.cos(ph * 1.5) ** 2; return [ph, lerp(0.0, tTop, v)]; }, H, CS.shoe2, cl(PART.toeCap, MC.leather, 0));
    // heel counter
    patch(pr(22), pr(3), (u, v) => { const ph = lerp(Math.PI - 1.2, Math.PI + 1.2, u); const d = Math.abs(ph - Math.PI); const tTop = 0.78 - 0.34 * sstep(0.35, 1.2, d); return [ph, lerp(0.0, tTop, v)]; }, H, CS.shoe2, cl(PART.toeCap, MC.leather, 1));
    // eyestays (lateral + medial), eyelet strips along the throat
    if (q >= 2) for (const sd of [1, -1]) patch(pr(4), pr(11), (u, v) => { const t = lerp(SK_THROAT.t0 - 0.02, 1.0, v); const a0 = throatHalf(t) - 0.02, a1 = a0 + 0.3 + 0.06 * (1 - v); return [sd * lerp(a0, a1, u), t]; }, H * 1.1, CS.shoe2, cl(PART.toeCap, MC.leather, 2));
    // side wave panel (team) on both sides: a swept band from the midfoot up to the heel
    for (const sd of [1, -1]) patch(pr(22), pr(3), (u, v) => { const ph = sd * lerp(0.95, 2.28, u); const mid = 0.2 + 0.4 * Math.pow(u, 1.25); const w = 0.085 * Math.sin(Math.PI * Math.pow(u, 0.62)) + 0.006; return [ph, lerp(mid - w, mid + w, v)]; }, H * 1.25, CS.team, cl(PART.toeCap, MC.leather, 3));
  }
  // ---- padded collar roll
  {
    const [nC, nPsi] = SR.collar;
    const rows = [];
    for (let j = 0; j <= nPsi; j++) {
      const psi = (j / nPsi) * TAU;
      rows.push(Array.from({ length: nC }, (_, i) => {
        const ph = (i / nC) * TAU; const c = skCollar(ph, new V3());
        const n = new V3(Math.sin(ph) / 0.0405, 0, Math.cos(ph) / 0.051).normalize();
        const rp = 0.0068 + 0.0014 * pos(-Math.cos(ph)) - 0.001 * pos(Math.cos(ph));
        return c.clone().addScaledVector(n, 0.0014 + rp * Math.cos(psi)).add(new V3(0, -0.0016 + rp * 0.85 * Math.sin(psi), 0));
      }));
    }
    const g = K.gridGeo(rows, { wrapU: true, outward: (p, out) => out.set(0, p.y, -0.004), uv: (i, j) => [i / nC, j / nPsi] });
    parts.push({ geo: g, ex: CS.shoe2, v3: cl(PART.collarPad, MC.padding), uv: true });
  }
  // ---- tongue: padded slab in the throat, rising above the collar with a woven team tab
  {
    const [nu, nv] = SR.tongue;
    const rows = [];
    const T0 = SK_THROAT.t0 - 0.04;
    for (let j = 0; j <= nv; j++) {
      const v = j / nv;
      const row = [];
      for (let i = 0; i <= nu; i++) {
        const u = i / nu, w = lerp(-1, 1, u);
        // lower part follows the vamp inside the throat; top 30 % rises free above the collar and leans forward
        const t = lerp(T0, 1.0, Math.min(1, v / 0.72));
        const p = skUpper(w * 0.16, t, new V3()); skUpperN(w * 0.16, t, nn);
        const up = Math.max(0, v - 0.72) / 0.28;
        p.addScaledVector(nn, -0.0006 + 0.0048 * (1 - w * w) ** 0.5).add(new V3(0, 0.024 * up, 0.006 * up * up));
        row.push(p);
      }
      rows.push(row);
    }
    // back face (thickness) as a second grid, offset inward
    const back = rows.map((r) => r.map((p) => p.clone().add(new V3(0, -0.0006, -0.0052))));
    const g = K.gridGeo(rows, { wrapU: false, outward: (p, out) => out.set(p.x, p.y - 0.02, p.z - 0.03), uv: (i, j) => [lerp(-1, 1, i / nu), j / nv] });
    parts.push({ geo: g, ex: CS.shoe2, v3: cl(PART.tongue, MC.mesh), uv: true });
    const gb = K.gridGeo(back, { wrapU: false, flip: true, uv: (i, j) => [lerp(-1, 1, i / nu), j / nv] });
    parts.push({ geo: gb, ex: CS.teamDark, v3: cl(PART.none, MC.padding), uv: true });
    // rim joining front and back faces along the sides and top
    const rim = [rows.map((r) => r[0]).concat(rows[nv].slice(1), rows.slice(0, nv).reverse().map((r) => r[nu])), back.map((r) => r[0]).concat(back[nv].slice(1), back.slice(0, nv).reverse().map((r) => r[nu]))];
    const rg = K.gridGeo(rim, { wrapU: false, outward: (p, out) => out.set(0, 0.06, 0.03), uv: (i, j) => [0, 0] });
    parts.push({ geo: rg, ex: CS.shoe2, v3: cl(PART.none, MC.padding), uv: true });
  }
  // ---- eyelets + laces
  const eyeT = [0.64, 0.72, 0.8, 0.88, 0.955];
  const eyeAt = (sd, t) => { const ph = sd * (throatHalf(t) + 0.075); const p = skUpper(ph, t, new V3()); skUpperN(ph, t, nn); return { p: p.addScaledVector(nn, skUpperD(ph, t, lvF) + H * 1.1 + 0.0004), n: nn.clone() }; };
  const laceFlat = (pts, nSeg) => {
    const sw = K.sweep(pts, { seg: Math.max(2, Math.round(nSeg * SR.pk * 0.8)), radial: lv >= 4 ? 5 : 4, capSteps: 1, radius: () => 0.0024, flat: 0.42, outward: (P, o) => { o.set(P.x * 0.3, 1, (P.z - SK.cz) * 0.2).normalize(); } });
    const len = sw.curve.getLength(); const tA = sw.t, cA = sw.cs;
    parts.push({ geo: sw.geo, ex: CS.lace, v3: cl(PART.cord, MC.lace), uvFn: (i) => [tA[i] * len, cA[i]] });
  };
  if (q >= 1) {
    if (q >= 2) for (const sd of [1, -1]) for (const t of eyeT) {
      const e = eyeAt(sd, t);
      const ring = K.torus(0.0034, 0.0011, lv >= 4 ? 4 : 3, lv >= 4 ? 8 : 6);
      ring.lookAt(e.n); ring.translate(e.p.x, e.p.y, e.p.z);
      parts.push({ geo: ring, ex: CS.metal, v3: cl(PART.none, MC.metal) });
    }
    const lift = (a, b, k) => { const m = a.clone().lerp(b, 0.5); m.addScaledVector(a.clone().add(b).multiplyScalar(0.5).sub(new V3(0, 0.02, SK.cz)).normalize(), k); return m; };
    if (q >= 2) {
      // criss-cross: bottom bar, then diagonals alternating over/under at the crossing
      const E = eyeT.map((t) => [eyeAt(1, t).p, eyeAt(-1, t).p]);
      laceFlat([E[0][0], lift(E[0][0], E[0][1], 0.0045), E[0][1]], 6);
      for (let r = 0; r < E.length - 1; r++) {
        const over = r % 2 === 0 ? 0.0072 : 0.0048;
        laceFlat([E[r][0], lift(E[r][0], E[r + 1][1], over), E[r + 1][1]], 7);
        laceFlat([E[r][1], lift(E[r][1], E[r + 1][0], r % 2 === 0 ? 0.0048 : 0.0072), E[r + 1][0]], 7);
      }
    } else {
      for (const t of eyeT.slice(0, 4)) { const a = eyeAt(1, t).p, b = eyeAt(-1, t).p; laceFlat([a, lift(a, b, 0.005), b], 4); }
    }
    // bow at the top lace: two loops + two tails with aglets
    const A = eyeAt(1, eyeT[eyeT.length - 1]).p, Bm = eyeAt(-1, eyeT[eyeT.length - 1]).p;
    const kn = A.clone().lerp(Bm, 0.5).add(new V3(0, 0.0065, 0.0015));
    const knot = K.superEllipsoid(0.0045, 0.0034, 0.0042, 0.8, 0.8, 6, 5); knot.translate(kn.x, kn.y, kn.z);
    parts.push({ geo: knot, ex: CS.lace, v3: cl(PART.cord, MC.lace) });
    if (q >= 2) for (const sd of [1, -1]) {
      laceFlat([kn, kn.clone().add(new V3(0.011 * sd, 0.006, 0.006)), kn.clone().add(new V3(0.023 * sd, 0.003, 0.0)), kn.clone().add(new V3(0.016 * sd, -0.0006, -0.006)), kn.clone().add(new V3(0.003 * sd, 0.0005, -0.001))], q >= 2 ? 10 : 6);
      const tailEnd = kn.clone().add(new V3(0.009 * sd, -0.012, 0.022));
      laceFlat([kn, kn.clone().add(new V3(0.006 * sd, 0.0, 0.01)), kn.clone().add(new V3(0.009 * sd, -0.006, 0.018)), tailEnd], q >= 2 ? 8 : 5);
      const ag = K.lathe([[0, -0.0045], [0.0017, -0.0045], [0.002, -0.0035], [0.002, 0.0035], [0, 0.0045]], 6);
      K.alongAxis(ag, tailEnd.clone().add(new V3(0.0006 * sd, -0.0032, 0.0036)), new V3(0.08 * sd, -0.66, 0.74).normalize());
      parts.push({ geo: ag, ex: CS.metal, v3: cl(PART.none, MC.plastic) });
    }
  }
  // ---- heel pull loop (webbing)
  if (lv >= 1) {
    const c = skCollar(Math.PI, new V3());
    const pts = [new V3(-0.0075, c.y - 0.012, c.z - 0.0045), new V3(-0.0078, c.y + 0.008, c.z - 0.0075), new V3(0, c.y + 0.0185, c.z - 0.0105), new V3(0.0078, c.y + 0.008, c.z - 0.0075), new V3(0.0075, c.y - 0.012, c.z - 0.0045)];
    const sw = K.sweep(pts, { seg: q >= 2 ? 12 : 6, radial: 6, capSteps: 2, radius: () => 0.0042, flat: 0.28, outward: (P, o) => o.set(0, 0, -1) });
    const len = sw.curve.getLength(); const tA = sw.t, cA = sw.cs;
    parts.push({ geo: sw.geo, ex: CS.team, v3: cl(PART.heelTab, MC.webbing), uvFn: (i) => [tA[i] * len, cA[i]] });
  }
  _shoeCache.set(lv, parts);
  return parts;
}

function addShoes(B, lv) {
  const parts = shoeParts(lv);
  for (const [s, sx] of [['L', 1], ['R', -1]]) {
    const F = K.REST['foot' + s];
    for (const pt of parts) {
      const g = pt.geo.clone();
      if (sx < 0) K.mirrorX(g);
      g.translate(F.x, 0, F.z);
      const uvA = g.attributes.uv;
      B.add(g, {
        ex: typeof pt.ex === 'function' ? (p, i) => pt.ex(p, i, uvA) : pt.ex,
        uv: pt.uvFn ? (i) => pt.uvFn(i) : !!pt.uv,
        v3: pt.v3,
        weights: (p) => { const zl = p.z - F.z; const w = sstep(0.056, 0.092, zl) * sstep(0.1, 0.06, p.y); return [['toe' + s, w], ['foot' + s, 1 - w]]; },
      });
    }
  }
}

// ------------------------------------------------------------------------------------------------
// INK TANK — premium hard-surface backpack in tank space (capsule axis +Y, tilted like the tank bone; everything here
// is weighted to the `tank` bone): chamfered anodised end caps with socket bolts, knurled metal collars + team O-rings
// gripping the glass, bevelled side rails with lightening slots, valve block with a knurled team knob and a
// quick-connect, back-facing pressure gauge, and a moulded back frame with a padded mesh cushion that sits on the tee.
// The glass + ink fill (character.js) come from tankGlass(): barrel glass and a fill whose top has a meniscus.
// ------------------------------------------------------------------------------------------------
const TK_RES = [
  { seg: 12, prof: 0.5, bolts: 0, knob: 8 },
  { seg: 18, prof: 0.7, bolts: 0, knob: 10 },
  { seg: 18, prof: 0.7, bolts: 0, knob: 10 },
  { seg: 32, prof: 1, bolts: 6, knob: 16 },
  { seg: 44, prof: 1, bolts: 6, knob: 22 },
];
/** Glass + ink-fill geometry (tank-local, used by character.js), per detail level. */
export function tankGlass(level = 3) {
  const lv = clamp(level | 0, 0, 4), T = TK_RES[lv];
  const g = K.lathe(K.smoothProfile([[0, -0.098], [0.046, -0.098], [0.0632, -0.092], [0.0676, -0.078], [0.0686, -0.04], [0.0689, 0], [0.0686, 0.04], [0.0676, 0.078], [0.0632, 0.092], [0.046, 0.098], [0, 0.098]], lv >= 3 ? 22 : 12), T.seg + 4);
  // fill in unit height (character.js scales y by the ink level); the top curls up the wall (meniscus)
  const f = K.lathe(K.smoothProfile([[0, 0.0], [0.05, 0.0], [0.0598, 0.006], [0.0614, 0.03], [0.0614, 0.972], [0.0616, 0.996], [0.0605, 1.004], [0.054, 0.992], [0.036, 0.986], [0, 0.985]], lv >= 3 ? 14 : 8), T.seg);
  return { glass: g, fill: f };
}
function addTank(B, lv) {
  const T = TK_RES[lv], seg = T.seg;
  const TKN = K.TANK;
  const M = new THREE.Matrix4().makeRotationX(TKN.tilt).setPosition(TKN.center);
  const add = (g, ex, v3, extra = {}) => { g.applyMatrix4(M); B.add(g, { ex, v3, bone: 'tank', uv: !!g.attributes.uv, ...extra }); };
  const prof = (pts, n) => (T.prof >= 1 ? K.smoothProfile(pts, n) : pts);
  // ---- end caps: dark anodised body, chamfered rim, recessed groove, flat face
  const capBody = [[0, -0.1292], [0.048, -0.1292], [0.0612, -0.1286], [0.0664, -0.127], [0.0692, -0.1238], [0.0699, -0.1198], [0.0699, -0.114], [0.0688, -0.1128], [0.0688, -0.1112], [0.0699, -0.11], [0.0699, -0.1072], [0.072, -0.1068], [0, -0.1068]];
  const lowT = lv <= 2;
  if (lowT) capBody.splice(0, capBody.length, [0, -0.1292], [0.061, -0.1288], [0.0692, -0.1238], [0.0699, -0.1072], [0.072, -0.1068], [0, -0.1068]);
  add(K.revolve(capBody, seg), CS.darkPlastic, cl(PART.none, MC.plastic));
  const capTop = capBody.map(([r, y]) => [r, -y]).reverse();
  capTop.splice(capTop.length - 1, 0, [0.034, 0.1294], [0.0286, 0.1312]);
  capTop[capTop.length - 1] = [0, 0.1312];
  add(K.revolve(capTop, seg), CS.darkPlastic, cl(PART.none, MC.plastic));
  // knurled metal collars gripping the glass (knurl band = PART.tankCap in the shader)
  const collar = lowT ? [[0.0662, -0.1078], [0.0785, -0.1072], [0.0791, -0.0868], [0.0688, -0.0862]] : [[0.0662, -0.1078], [0.0774, -0.1078], [0.0788, -0.1066], [0.0792, -0.1048], [0.0792, -0.0894], [0.0787, -0.0876], [0.077, -0.0862], [0.0688, -0.0862]];
  add(K.revolve(collar, seg + 4), CS.metal, cl(PART.tankCap, MC.metal));
  add(K.revolve(collar.map(([r, y]) => [r, -y]).reverse(), seg + 4), CS.metal, cl(PART.tankCap, MC.metal));
  if (lv >= 1) for (const y of [-0.0852, 0.0852]) { const r = K.torus(0.0689, 0.0025, lv >= 3 ? 6 : 3, seg + 4); r.rotateX(Math.PI / 2); r.translate(0, y, 0); add(r, CS.team, cl(PART.none, MC.rubber)); }
  // socket-head bolts around both cap faces
  if (T.bolts) for (const yy of [0.1292, -0.1292]) for (let k = 0; k < T.bolts; k++) {
    const a = (k / T.bolts) * TAU + Math.PI / T.bolts;
    const b = K.lathe([[0, 0], [0.0036, 0], [0.0036, 0.0012], [0.0031, 0.0019], [0.0016, 0.0019], [0.0016, 0.0008], [0, 0.0008]], 6);
    if (yy < 0) b.rotateX(Math.PI);
    b.translate(Math.sin(a) * 0.052, yy + (yy > 0 ? 0.0001 : -0.0001), Math.cos(a) * 0.052);
    add(b, CS.metal, cl(PART.none, MC.metal));
  }
  // ---- side rails: bevelled bars with two lightening slots, bolted into the caps
  for (const sx of [1, -1]) {
    const rail = K.superEllipsoid(0.0064, 0.1, 0.0112, 0.34, 0.42, lv >= 3 ? 10 : 6, lv >= 3 ? 14 : 8, (q) => { for (const yc of [-0.042, 0.042]) { const d = Math.max(0, 1 - Math.hypot(q.z / 0.0062, (q.y - yc) / 0.026)); q.x -= Math.sign(q.x) * 0.0032 * Math.min(1, d * 3); } });
    rail.translate(0.0748 * sx, 0, 0); add(rail, CS.darkPlastic, cl(PART.none, MC.plastic));
    if (lv >= 1) for (const y of [-0.0915, 0.0915]) {
      const bolt = K.lathe([[0, 0], [0.0047, 0], [0.0047, 0.0013], [0.0036, 0.0027], [0.0018, 0.0029], [0, 0.0029]], 6);
      bolt.rotateZ(-sx * Math.PI / 2); bolt.translate(0.081 * sx, y, 0.0); add(bolt, CS.metal, cl(PART.none, MC.metal));
    }
  }
  // ---- valve block + knurled team knob + quick-connect nozzle
  add(K.lathe(prof([[0, 0.1308], [0.0118, 0.1308], [0.0118, 0.1352], [0.0102, 0.1368], [0.0068, 0.1372], [0.0068, 0.1426], [0, 0.1426]], 10), T.knob), CS.metal, cl(PART.none, MC.metal));
  add(K.lathe(prof([[0, 0.1418], [0.0162, 0.1418], [0.0186, 0.1448], [0.0188, 0.1512], [0.0168, 0.1552], [0.0118, 0.1572], [0, 0.1574]], 10), T.knob + 4), CS.team, cl(PART.tankCap, MC.plastic, 1));
  if (lv >= 1) {
    const nz = K.lathe([[0, -0.012], [0.0042, -0.012], [0.0042, -0.004], [0.0052, -0.003], [0.0052, 0.0], [0.0034, 0.001], [0.0034, 0.009], [0.0026, 0.0095], [0, 0.0095]], 8);
    K.alongAxis(nz, new V3(0.024, 0.132, 0.022), new V3(-0.55, -0.62, -0.56).normalize()); add(nz, CS.metal, cl(PART.none, MC.metal));
  }
  // ---- pressure gauge on the back-top of the upper cap
  if (lv >= 1) {
    const n = new V3(0, 0.62, -0.785).normalize();
    const at = new V3(0, 0.113, -0.056);
    const housing = K.lathe([[0, -0.006], [0.0142, -0.006], [0.0148, 0.0], [0.0142, 0.0035], [0, 0.0035]], lv >= 3 ? 18 : 10);
    K.alongAxis(housing, at, n.clone().negate()); add(housing, CS.darkPlastic, cl(PART.none, MC.plastic));
    const bez = K.torus(0.0128, 0.0021, 4, lv >= 3 ? 18 : 10); bez.lookAt(n); bez.translate(...at.clone().addScaledVector(n, 0.0036).toArray());
    add(bez, CS.metal, cl(PART.none, MC.metal));
    const face = K.gridGeo([Array.from({ length: 17 }, () => new V3()), ...[0.34, 0.67, 1].map((r) => Array.from({ length: 16 }, (_, i) => { const a = (i / 16) * TAU; return new V3(Math.cos(a) * 0.0118 * r, Math.sin(a) * 0.0118 * r, 0); }))].slice(1), { wrapU: true, poles: { start: new V3(0, 0, 0) }, outward: (p, o) => o.set(0, 0, -1), uv: (i, j) => [0, 0] });
    const P = face.attributes.position; const uv = face.attributes.uv;
    for (let i = 0; i < P.count; i++) { const x = P.getX(i), y = P.getY(i); uv.setXY(i, ((Math.atan2(-x, -y) / TAU + 0.5) - 0.12) / 0.76, Math.hypot(x, y) / 0.0118); }
    K.placeBasis(face, new V3(1, 0, 0), new V3().crossVectors(n, new V3(1, 0, 0)), at.clone().addScaledVector(n, 0.0038));
    add(face, CS.white, cl(PART.gauge, MC.plastic));
    const needle = K.superEllipsoid(0.0007, 0.0052, 0.0006, 0.8, 0.8, 4, 4);
    needle.translate(0, 0.0045, 0); needle.rotateZ(-0.9);
    K.placeBasis(needle, new V3(1, 0, 0), new V3().crossVectors(n, new V3(1, 0, 0)), at.clone().addScaledVector(n, 0.0046));
    add(needle, CS.white, cl(PART.none, MC.plastic), { color: new THREE.Color(0.9, 0.12, 0.08) });
  }
  // ---- moulded back frame + padded mesh cushion (front face sits just behind the compressed tee)
  {
    const zF = 0.0775;   // tank-local z of the cushion's front face at the centre line
    const frame = K.superEllipsoid(0.074, 0.101, 0.0078, 0.32, 0.42, lv >= 3 ? 18 : 10, lv >= 3 ? 16 : 8, (q) => { q.z += 0.0145 * (q.x / 0.074) ** 2; });
    frame.translate(0, 0, zF - 0.0118 - 0.0078); add(frame, CS.strap, cl(PART.none, MC.plastic, 1), { color: new THREE.Color(0.62, 0.62, 0.64) });
    const pad = K.superEllipsoid(0.066, 0.092, 0.0068, 0.5, 0.6, lv >= 3 ? 18 : 10, lv >= 3 ? 16 : 8, (q) => { q.z += 0.0135 * (q.x / 0.066) ** 2; });
    const P = pad.attributes.position; const uv = new Float32Array(P.count * 2);
    for (let i = 0; i < P.count; i++) { uv[i * 2] = P.getX(i); uv[i * 2 + 1] = P.getY(i); }
    pad.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    pad.translate(0, 0, zF - 0.0068);
    add(pad, CS.strap, cl(PART.plate, MC.padding));
  }
}

/** Garments of the cloth mesh (tee, …) at a detail level. */
export function addOutfit(B, level = 3) {
  const lv = clamp(level | 0, 0, 4);
  addTee(B, lv);
  addHarness(B, lv);
  addShorts(B, lv);
  addSocks(B, lv);
  addShoes(B, lv);
  addTank(B, lv);
}

// ------------------------------------------------------------------------------------------------
// CONTACT AO — a point-cloud occlusion bake over skin + cloth at the rest pose (disc-to-point form factors from
// area-weighted surface clusters within 4 cm). Captures collar on neck, sleeves on arms, shorts on thighs, straps on
// the tee, tee hem on the shorts, socks in the shoe collar, and the cavities of every sculpted fold.
//   cloth → new float attribute aOcc = 1 − AO (0 = open; a mesh without it reads as unoccluded)
//   skin  → multiplied into the vertex colour of limbs / hands / neck (head vertices, aHead ≠ 0, are left alone)
// ------------------------------------------------------------------------------------------------
/** Laplacian smoothing of a per-vertex scalar over the mesh edges (+ coincident seam vertices share values). */
function smoothOnMesh(g, v, iters, mask = null) {
  const ix = g.index.array, n = v.length;
  const acc = new Float32Array(n), cnt = new Float32Array(n);
  for (let it = 0; it < iters; it++) {
    acc.fill(0); cnt.fill(0);
    for (let t = 0; t < ix.length; t += 3) {
      const a = ix[t], b = ix[t + 1], c = ix[t + 2];
      acc[a] += v[b] + v[c]; cnt[a] += 2; acc[b] += v[a] + v[c]; cnt[b] += 2; acc[c] += v[a] + v[b]; cnt[c] += 2;
    }
    for (let i = 0; i < n; i++) if (cnt[i] > 0 && (!mask || mask[i])) v[i] = 0.5 * v[i] + 0.5 * acc[i] / cnt[i];
  }
}
export function bakeBodyAO(skin, cloth, level = 3) {
  const lv = clamp(level | 0, 0, 4);
  const cell = [0.016, 0.012, 0.0105, 0.0088, 0.0078][lv];
  const RAD = 0.04, R2 = RAD * RAD, GC = RAD / 2;
  // ---- emitter clusters (grid cell × dominant normal axis so thin shells keep both faces)
  const cmap = new Map();
  let cx = [], cy = [], cz = [], cnx = [], cny = [], cnz = [], ca = [];
  for (const g of [skin, cloth]) {
    const P = g.attributes.position, N = g.attributes.normal, ix = g.index.array;
    const area = new Float32Array(P.count);
    for (let t = 0; t < ix.length; t += 3) {
      const a = ix[t], b = ix[t + 1], c = ix[t + 2];
      const ux = P.getX(b) - P.getX(a), uy = P.getY(b) - P.getY(a), uz = P.getZ(b) - P.getZ(a);
      const vx = P.getX(c) - P.getX(a), vy = P.getY(c) - P.getY(a), vz = P.getZ(c) - P.getZ(a);
      const ar = 0.5 * Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 3;
      area[a] += ar; area[b] += ar; area[c] += ar;
    }
    for (let i = 0; i < P.count; i++) {
      const A = area[i]; if (A <= 0) continue;
      const x = P.getX(i), y = P.getY(i), z = P.getZ(i), nx = N.getX(i), ny = N.getY(i), nz = N.getZ(i);
      const anx = Math.abs(nx), any = Math.abs(ny), anz = Math.abs(nz);
      const ax = anx >= any && anx >= anz ? (nx > 0 ? 0 : 1) : any >= anz ? (ny > 0 ? 2 : 3) : (nz > 0 ? 4 : 5);
      const key = `${Math.floor(x / cell)},${Math.floor(y / cell)},${Math.floor(z / cell)},${ax}`;
      let k = cmap.get(key);
      if (k === undefined) { k = ca.length; cmap.set(key, k); cx.push(0); cy.push(0); cz.push(0); cnx.push(0); cny.push(0); cnz.push(0); ca.push(0); }
      cx[k] += x * A; cy[k] += y * A; cz[k] += z * A; cnx[k] += nx * A; cny[k] += ny * A; cnz[k] += nz * A; ca[k] += A;
    }
  }
  const nC = ca.length;
  const EX = new Float32Array(nC), EY = new Float32Array(nC), EZ = new Float32Array(nC), ENX = new Float32Array(nC), ENY = new Float32Array(nC), ENZ = new Float32Array(nC), EA = new Float32Array(nC);
  for (let k = 0; k < nC; k++) {
    const A = ca[k]; EX[k] = cx[k] / A; EY[k] = cy[k] / A; EZ[k] = cz[k] / A;
    const l = Math.hypot(cnx[k], cny[k], cnz[k]) || 1; ENX[k] = cnx[k] / l; ENY[k] = cny[k] / l; ENZ[k] = cnz[k] / l; EA[k] = A;
  }
  cx = cy = cz = cnx = cny = cnz = ca = null;
  // ---- dense CSR grid over the kid's bounds (cell = RAD / 2, 5³ neighbourhood)
  let x0 = 1e9, y0 = 1e9, z0 = 1e9, x1 = -1e9, y1 = -1e9, z1 = -1e9;
  for (let k = 0; k < nC; k++) { x0 = Math.min(x0, EX[k]); y0 = Math.min(y0, EY[k]); z0 = Math.min(z0, EZ[k]); x1 = Math.max(x1, EX[k]); y1 = Math.max(y1, EY[k]); z1 = Math.max(z1, EZ[k]); }
  x0 -= RAD; y0 -= RAD; z0 -= RAD;
  const NX = Math.ceil((x1 - x0 + RAD) / GC) + 1, NY = Math.ceil((y1 - y0 + RAD) / GC) + 1, NZ = Math.ceil((z1 - z0 + RAD) / GC) + 1;
  const cellOf = (x, y, z) => (Math.floor((x - x0) / GC) * NY + Math.floor((y - y0) / GC)) * NZ + Math.floor((z - z0) / GC);
  const start = new Int32Array(NX * NY * NZ + 1), order = new Int32Array(nC), cellK = new Int32Array(nC);
  for (let k = 0; k < nC; k++) { cellK[k] = cellOf(EX[k], EY[k], EZ[k]); start[cellK[k] + 1]++; }
  for (let c = 0; c < NX * NY * NZ; c++) start[c + 1] += start[c];
  { const fill = start.slice(0, -1); for (let k = 0; k < nC; k++) order[fill[cellK[k]]++] = k; }
  const occAt = (x, y, z, nx, ny, nz) => {
    const gi = Math.floor((x - x0) / GC), gj = Math.floor((y - y0) / GC), gkk = Math.floor((z - z0) / GC);
    let occ = 0;
    for (let di = -2; di <= 2; di++) {
      const ii = gi + di; if (ii < 0 || ii >= NX) continue;
      for (let dj = -2; dj <= 2; dj++) {
        const jj = gj + dj; if (jj < 0 || jj >= NY) continue;
        const base = (ii * NY + jj) * NZ;
        const k0 = Math.max(0, gkk - 2), k1 = Math.min(NZ - 1, gkk + 2);
        for (let q = start[base + k0], qe = start[base + k1 + 1]; q < qe; q++) {
          const k = order[q];
          const vx = EX[k] - x, vy = EY[k] - y, vz = EZ[k] - z;
          const d2 = vx * vx + vy * vy + vz * vz;
          if (d2 > R2 || d2 < 1e-8) continue;
          const dot = nx * vx + ny * vy + nz * vz;
          if (dot <= 0.02 * Math.sqrt(d2)) continue;
          const d = Math.sqrt(d2), cr = dot / d;
          const ce = Math.abs(ENX[k] * vx + ENY[k] * vy + ENZ[k] * vz) / d;
          const A = EA[k];
          const f = 1 - d2 / R2;
          occ += cr * (0.25 + 0.75 * ce) * (A / (Math.PI * d2 + A)) * f * f;
        }
      }
    }
    return occ;
  };
  // ---- receivers
  {
    const P = cloth.attributes.position, N = cloth.attributes.normal;
    const ao = new Float32Array(P.count);
    for (let i = 0; i < P.count; i++) {
      const o = occAt(P.getX(i) + N.getX(i) * 0.0006, P.getY(i) + N.getY(i) * 0.0006, P.getZ(i) + N.getZ(i) * 0.0006, N.getX(i), N.getY(i), N.getZ(i));
      ao[i] = 0.7 * (1 - Math.exp(-1.9 * o));
    }
    smoothOnMesh(cloth, ao, 3);
    cloth.setAttribute('aOcc', new THREE.BufferAttribute(ao, 1));
  }
  {
    const P = skin.attributes.position, N = skin.attributes.normal, C = skin.attributes.color, H = skin.attributes.aHead;
    const occ = new Float32Array(P.count), use = new Uint8Array(P.count);
    for (let i = 0; i < P.count; i++) {
      if (H && Math.abs(H.getX(i)) + Math.abs(H.getY(i)) + Math.abs(H.getZ(i)) > 0.5) continue;
      if (P.getY(i) > 1.1) continue;
      const o = occAt(P.getX(i) + N.getX(i) * 0.0006, P.getY(i) + N.getY(i) * 0.0006, P.getZ(i) + N.getZ(i) * 0.0006, N.getX(i), N.getY(i), N.getZ(i));
      occ[i] = 0.68 * (1 - Math.exp(-1.9 * o)); use[i] = 1;
    }
    smoothOnMesh(skin, occ, 2, use);
    for (let i = 0; i < P.count; i++) {
      if (!use[i]) continue;
      const a = 1 - occ[i];
      // skin AO keeps a little warmth (light bleeding through)
      C.setXYZ(i, C.getX(i) * Math.pow(a, 0.8), C.getY(i) * a, C.getZ(i) * Math.pow(a, 1.08));
    }
    C.needsUpdate = true;
  }
}

// ---- compatibility probes for code that dresses the body (the hair module's accessories: wristbands, headphones) --------------
/** Forearm radius (forward axis) at the old sweep parameter t (0 shoulder … ~0.96 wrist) — wristbands size to it. */
export function armRadiusAt(t) { const s = 0.012 + t * 0.412; return ARM_R(s) * ARM_FWD(s); }
/** Point on the (undisplaced) tee at ray angle th (0 = front, +pi/2 = +X), height y, pushed out along the normal. */
export function teeSurfacePoint(th, y, off, out = new V3()) {
  teeBase(th, y, out);
  const n = teeNormal(out.x, out.z, out.y, new V3());
  return out.addScaledVector(n, off + Math.max(0, teeFold(out, 1, 0)));
}
/** Lateral / forward section ratio of the forearm at the old sweep parameter t (the wrist flattens). */
export function armFlatAt(t) { const s = 0.012 + t * 0.412; return ARM_LAT(s) / ARM_FWD(s); }
