// Canopy Brolly — procedural model + part animation (registered from kits/brolly.js).
// Weapon space (see character-weapons.js): grip centre at the origin, +Z = forward, +Y = up, character's right = -X.
// Layout along the shaft: crook handle + pistol grip (right hand) · receiver with a team-ink canister · foregrip
// (left hand) · sliding runner collar · furled canopy · crown hub with a status-lamp ring · flared shot nozzle.
//
// The canopy is eight gores (alternating team ink / cream), each a part hinged at the crown and authored FURLED (so the
// merged far-LOD / menu model is a closed brolly). animateBrolly() re-poses them every frame from the runner's kit state
// (kits/brolly.js: open, grow, flash, hp …) with one affine matrix per gore: fold angle + fold squash about the hinge,
// in the gore's own frame — open (dome, ~1.4 m across), furled, regrowing from the crown, or gone (broken / launched).
// Canopy space (for the launched canopy, canopyOpenGeo): crown at the origin, axis +Z, dome curving back toward -Z.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GEO_KIT } from '../character-weapons.js';
import { superEllipsoid, lathe, smoothProfile, sweep } from '../character-geo.js';
import { getPlasticMaterial } from '../character-mats.js';

const { Parts, C, M, latheZ, torus, at, orient, screw, decal, placeXY, squidShape, onSphere } = GEO_KIT;
const V3 = THREE.Vector3;

// ---------------------------------------------------------------------------------------------- dimensions
export const AY = 0.066;                      // shaft axis height
export const CROWN_Z = 0.56;                  // canopy hinge (crown) on the shaft
export const RIM_R = 0.7;                     // open canopy rim radius
const TH = 52 * Math.PI / 180;                // dome half-angle
const RS = RIM_R / Math.sin(TH);              // dome sphere radius
export const DEPTH = RS * (1 - Math.cos(TH)); // crown → rim plane (~0.34)
export const NG = 8;                          // gores
const GW = Math.PI / NG;                      // gore half-width (azimuth)
const THICK = 0.006;
const TH0 = 0.075;                            // fabric starts here (the hub covers the crown)
// furled pose, in the gore's own frame: fold back about the hinge (+X), squash across (sx) and along (s)
const FOLD_A = -1.05, FOLD_SX = 0.19, FOLD_S = 0.37;
export const MUZZLE = new V3(0, AY, 0.678);
const RUNNER_Z0 = 0.305, RUNNER_Z1 = 0.47;    // runner collar: furled → open
const TEAM_GORE = (k) => (k & 1) === 1;       // odd gores wear the team ink

const CREAM = '#f4efe4', CREAM_HEM = '#e0d4bd', WHITE = '#ffffff', WHITE_HEM = '#cfcfcf', HANDLE = '#c08a58', HANDLE_DK = '#8a5a33';

// gore-local point on the dome: crown at the origin, axis +Z, gore centred on +Y, azimuth ps toward +X
function gp(th, ps, off, out = new V3()) {
  const r = RS + off;
  return out.set(r * Math.sin(th) * Math.sin(ps), r * Math.sin(th) * Math.cos(ps), -RS + r * Math.cos(th));
}
const sag = (th, ps) => -0.022 * (th / TH) * Math.cos(ps * (Math.PI / 2) / GW);        // fabric sags between ribs
const thEnd = (ps) => TH * (1 - 0.075 * Math.cos(ps * (Math.PI / 2) / GW));              // scalloped rim

/** Thin sheet from a parametric surface: outer + inner skins (smooth) and flat side walls. pt(u, v, inner, out). */
function sheet(ni, nj, pt) {
  const W = nj + 1, outer = [], inner = [], v = new V3();
  for (let i = 0; i <= ni; i++) for (let j = 0; j <= nj; j++) {
    pt(i / ni, j / nj, 0, v); outer.push(v.x, v.y, v.z);
    pt(i / ni, j / nj, 1, v); inner.push(v.x, v.y, v.z);
  }
  const io = [], ii = [];
  for (let i = 0; i < ni; i++) for (let j = 0; j < nj; j++) {
    const a = i * W + j, b = a + 1, c = a + W, d = c + 1;
    io.push(a, b, c, b, d, c); ii.push(a, c, b, b, c, d);
  }
  const mk = (pos, idx) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return g; };
  // side walls round the boundary loop, each quad with its own vertices (flat), facing away from the sheet centre
  const loop = [];
  for (let j = 0; j <= nj; j++) loop.push(j);
  for (let i = 1; i <= ni; i++) loop.push(i * W + nj);
  for (let j = nj - 1; j >= 0; j--) loop.push(ni * W + j);
  for (let i = ni - 1; i >= 1; i--) loop.push(i * W);
  const cen = new V3(); for (let q = 0; q < outer.length; q += 3) cen.x += outer[q], cen.y += outer[q + 1], cen.z += outer[q + 2];
  cen.multiplyScalar(3 / outer.length);
  const sp = [], si = [], A = new V3(), B = new V3(), Ci = new V3(), D = new V3(), n = new V3(), m = new V3();
  for (let k = 0; k < loop.length; k++) {
    const p0 = loop[k] * 3, p1 = loop[(k + 1) % loop.length] * 3;
    A.fromArray(outer, p0); B.fromArray(outer, p1); Ci.fromArray(inner, p1); D.fromArray(inner, p0);
    const base = sp.length / 3;
    sp.push(A.x, A.y, A.z, B.x, B.y, B.z, Ci.x, Ci.y, Ci.z, D.x, D.y, D.z);
    n.subVectors(B, A).cross(m.subVectors(Ci, A));
    m.copy(A).add(B).multiplyScalar(0.5).sub(cen);
    if (n.dot(m) >= 0) si.push(base, base + 1, base + 2, base, base + 2, base + 3);
    else si.push(base, base + 2, base + 1, base, base + 3, base + 2);
  }
  return [mk(outer, io), mk(inner, ii), mk(sp, si)];
}

/** One gore (gore-local frame): fabric, hem band, rib along its +ps edge, rib tip bead (+ the squid print on gore 0). */
function goreLocal(P, k) {
  const team = TEAM_GORE(k);
  const fab = team ? WHITE : CREAM, hem = team ? WHITE_HEM : CREAM_HEM;
  const H0 = 0.88;   // hem starts at this share of the gore's length
  const surf = (t0, t1) => (u, v, inner, out) => {
    const ps = (v * 2 - 1) * GW, th = TH0 + (thEnd(ps) - TH0) * (t0 + (t1 - t0) * u);
    return gp(th, ps, sag(th, ps) - (inner ? THICK : 0), out);
  };
  for (const g of sheet(9, 8, surf(0, H0))) P.add(g, fab, M.satin);
  for (const g of sheet(1, 8, surf(H0, 1))) P.add(g, hem, M.satin);
  // rib (under the fabric, along the seam) + tip bead just past the rim
  const pts = [];
  for (let i = 0; i <= 10; i++) { const th = 0.05 + (TH - 0.05) * i / 10; pts.push(gp(th, GW, -THICK - 0.0038)); }
  P.add(sweep(pts, { seg: 14, radial: 6, capSteps: 1, radius: () => 0.0036 }).geo, C.gunmetal, M.metal);
  const tipP = gp(TH + 0.022, GW, -0.003), tipD = gp(TH + 0.04, GW, -0.003).sub(gp(TH, GW, -0.003)).normalize();
  P.add(orient(superEllipsoid(0.0072, 0.013, 0.0072, 0.8, 1, 8, 6), tipD, tipP), team ? WHITE : C.darker, M.gloss);
  // squid print on the top gore's outer face (head toward the rim: upright to someone facing the open canopy)
  if (k === 0) {
    const thd = TH * 0.6, n = gp(thd, 0, 0).sub(new V3(0, 0, -RS)).normalize();
    const along = gp(thd + 0.01, 0, 0).sub(gp(thd, 0, 0)).normalize();
    const g = decal(squidShape(0.2), 0.0008);
    placeXY(g, new V3(1, 0, 0), along, new V3(0, 0, -RS).addScaledVector(n, RS + sag(thd, 0) + 0.0012));
    onSphere(g, new V3(0, 0, -RS), n, RS + sag(thd, 0) + 0.0012);
    P.add(g, '#2f3440', M.print);
  }
}

/** A jagged tear across a gore (damage stages); both skins, dark. Gore-local frame. */
function tearLocal(P, th0, th1, ps0, ps1, seed) {
  let s = seed >>> 0; const rnd = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
  const n = 7, w = 0.011, pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, th = th0 + (th1 - th0) * t, ps = ps0 + (ps1 - ps0) * t + (i > 0 && i < n ? (rnd() - 0.5) * 0.09 : 0);
    pts.push([th, ps]);
  }
  for (const side of [0, 1]) {
    const pos = [], idx = [];
    for (let i = 0; i <= n; i++) {
      const [th, ps] = pts[i], wk = w * (i === 0 || i === n ? 0.15 : 0.6 + rnd() * 0.8);
      const off = side ? -THICK - 0.0012 : 0.0012;
      const a = gp(th, ps - wk / Math.max(0.2, Math.sin(th)) / RS, sag(th, ps) + off), b = gp(th, ps + wk / Math.max(0.2, Math.sin(th)) / RS, sag(th, ps) + off);
      pos.push(a.x, a.y, a.z, b.x, b.y, b.z);
      if (i < n) { const q = i * 2; if (side) idx.push(q, q + 2, q + 1, q + 1, q + 2, q + 3); else idx.push(q, q + 1, q + 2, q + 1, q + 3, q + 2); }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    P.add(g, '#15171c', M.rubber);
  }
}
// damage stages: [gore, th0, th1, ps0, ps1] — stage 1 below 66 % hp, stage 2 below 33 %
const TEARS = [
  [[1, 0.2, 0.62, -0.12, 0.1], [4, 0.35, 0.8, 0.14, -0.08]],
  [[6, 0.15, 0.7, 0.05, -0.15], [2, 0.4, 0.86, -0.1, 0.12], [1, 0.55, 0.85, 0.2, 0.02], [7, 0.3, 0.6, 0.02, 0.18]],
];

// gore frame ↔ weapon (or canopy) space: rotation about +Z by the gore's azimuth; the furled fold in the gore frame
const goreRot = (k) => new THREE.Matrix4().makeRotationZ(-k * (Math.PI * 2 / NG));
function foldMatrix(a, sx, sy, sz, out = new THREE.Matrix4()) {
  const c = Math.cos(a), s = Math.sin(a);
  // Rx(a) · diag(sx, sy, sz)
  return out.set(sx, 0, 0, 0, 0, c * sy, -s * sz, 0, 0, s * sy, c * sz, 0, 0, 0, 0, 1);
}
const foldA = (k) => FOLD_A * (k & 1 ? 1 : 0.965);   // alternate gores fold a hair apart (they overlap, furled)
const FOLD0 = (k) => foldMatrix(foldA(k), FOLD_SX * (k & 1 ? 1 : 1.08), FOLD_S, FOLD_S);

// ---------------------------------------------------------------------------------------------- builder
let _openGeo = null;
/** The open canopy in canopy space (crown at the origin, axis +Z): { ink, cream } merged gore geometries (vertex
 *  coloured: multiply by the team colour / white) + the hub stub (plastic). For the launched canopy. */
export function canopyOpenGeo() {
  if (_openGeo) return _openGeo;
  const ink = [], cream = [];
  for (let k = 0; k < NG; k++) {
    const P = new Parts(); goreLocal(P, k);
    const g = P.build().applyMatrix4(goreRot(k));
    (TEAM_GORE(k) ? ink : cream).push(g);
  }
  const H = new Parts();
  H.add(latheZ(smoothProfile([[0, -0.03], [0.02, -0.028], [0.032, -0.012], [0.034, 0.004], [0.026, 0.02], [0, 0.026]], 8), 16), C.dark, M.gloss);
  H.add(latheZ([[0, -0.2], [0.011, -0.2], [0.011, -0.02], [0, -0.02]], 10), C.metal, M.metal);             // shaft stub
  H.add(latheZ(smoothProfile([[0, -0.13], [0.019, -0.128], [0.021, -0.11], [0.019, -0.09], [0, -0.088]], 6), 12), C.darker, M.satin);   // runner
  _openGeo = { ink: mergeGeometries(ink, false), cream: mergeGeometries(cream, false), hub: H.build() };
  return _openGeo;
}

function buildBrolly() {
  const P = new Parts(), I = new Parts(), T = new Parts(), RUN = new Parts(), LAMP = new Parts();
  // ---- crook handle: a pistol grip wrapped round the right fist's handle axis, curling forward into an umbrella J
  const GA = new V3(0, 1, 0.25).normalize(), tilt = Math.atan2(GA.z, GA.y);
  const core = superEllipsoid(0.0122, 0.055, 0.0152, 0.6, 0.7, 12, 12, (q) => {
    if (q.z > 0) { const f = 0.5 + 0.5 * Math.cos(((q.y + 0.0006) / 0.0122) * Math.PI * 2); q.z -= 0.0015 * f * (1 - Math.abs(q.x) / 0.0122) * (q.y < 0.03 ? 1 : 0); }
  });
  core.rotateX(tilt); P.add(at(core, 0, -0.006, -0.002), HANDLE, M.gloss);
  for (const sx of [1, -1]) { const pn = superEllipsoid(0.003, 0.036, 0.0115, 0.5, 0.55, 5, 8); pn.rotateX(tilt); P.add(at(pn, sx * 0.0107, -0.01, -0.004), C.rubber, M.rubber); }
  // the J: from the grip's heel, down and round forward, ending in a capped tip
  const jp = [new V3(0, -0.05, -0.02), new V3(0, -0.074, -0.012), new V3(0, -0.086, 0.012), new V3(0, -0.078, 0.038), new V3(0, -0.058, 0.05)];
  P.add(sweep(jp, { seg: 14, radial: 10, capSteps: 3, radius: (t) => 0.0118 - 0.0022 * t }).geo, HANDLE, M.gloss);
  P.add(orient(superEllipsoid(0.0105, 0.006, 0.0105, 0.6, 1, 10, 5), new V3(0, 0.6, 0.8), new V3(0, -0.055, 0.052)), C.darker, M.gloss);
  for (const y of [0.028, -0.036]) { const r = torus(0.0138, 0.0022, 4, 16); r.rotateX(Math.PI / 2 + tilt); I.add(at(r, 0, y, y * 0.25 - 0.002)); }   // ink bands
  // trigger guard + trigger blade
  const guard = sweep([new V3(0, 0.03, 0.012), new V3(0, 0.018, 0.043), new V3(0, 0.002, 0.05), new V3(0, -0.006, 0.028)], { seg: 8, radial: 5, capSteps: 2, radius: () => 0.0032, flat: 1.9, outward: (Pp, o) => o.set(1, 0, 0) });
  P.add(guard.geo, C.dark, M.satin);
  const trig = superEllipsoid(0.0034, 0.0105, 0.0034, 0.7, 0.7, 6, 6, (q) => { q.z += 16 * q.y * q.y; });
  trig.rotateX(-0.25); T.add(at(trig, 0, 0.0215, 0.0305), C.metal, M.metal);
  // ---- receiver: cream shell over a dark frame; team-ink canister on top in a cage; rear cap
  const recv = superEllipsoid(0.0255, 0.03, 0.092, 0.42, 0.56, 14, 10, (q) => { if (q.z > 0.04) q.y *= 1 - 0.32 * (q.z - 0.04) / 0.052; if (q.y > 0) q.x *= 1 - 0.12 * (q.y / 0.03); });
  P.add(at(recv, 0, 0.066, 0.02), C.cream, M.satin);
  P.add(at(superEllipsoid(0.0222, 0.011, 0.088, 0.4, 0.5, 12, 6), 0, 0.041, 0.022), C.dark, M.satin);
  const can = latheZ(smoothProfile([[0.0, -0.046], [0.0165, -0.044], [0.017, -0.034], [0.017, 0.034], [0.0165, 0.044], [0.0, 0.046]], 7), 12);
  I.add(at(can, 0, 0.113, 0.014));
  for (let k = 0; k < 4; k++) { const a = (k / 4) * Math.PI * 2 + Math.PI / 4; P.add(at(superEllipsoid(0.0024, 0.0024, 0.04, 0.6, 0.6, 4, 4), Math.cos(a) * 0.0183, 0.113 + Math.sin(a) * 0.0183, 0.014), C.dark, M.satin); }
  for (const [z, s] of [[-0.036, -1], [0.064, 1]]) P.add(at(latheZ([[0, -0.008 * s], [0.0196, -0.008 * s], [0.0206, -0.0035 * s], [0.0206, 0.005 * s], [0.017, 0.0085 * s], [0, 0.009 * s]], 12), 0, 0.113, z), C.dark, M.gloss);
  P.add(at(superEllipsoid(0.011, 0.011, 0.046, 0.5, 0.6, 8, 5), 0, 0.097, 0.014), C.dark, M.satin);
  P.add(at(superEllipsoid(0.0225, 0.027, 0.0095, 0.45, 0.55, 10, 6), 0, 0.066, -0.072), C.dark, M.gloss);
  for (const sx of [1, -1]) for (const [y, z] of [[0.074, -0.046], [0.074, 0.05]]) screw(P, new V3(sx * 0.0252, y, z), new V3(sx, 0, 0), 0.0027);
  const sq = decal(squidShape(0.024)); placeXY(sq, new V3(0, 0, -1), new V3(0, 1, 0), new V3(0.0262, 0.07, -0.004)); P.add(sq, C.decal, M.print);
  // ---- shaft (metal tube, collared), foregrip for the left hand
  P.add(latheZ([[0, 0.1], [0.0105, 0.1], [0.0105, CROWN_Z - 0.02], [0, CROWN_Z - 0.02]], 12).translate(0, AY, 0), C.metal, M.metal);
  for (const z of [0.108, 0.232]) P.add(at(torus(0.0125, 0.0028, 4, 14), 0, AY, z), C.darker, M.satin);
  P.add(latheZ(smoothProfile([[0.0, 0.118], [0.0145, 0.12], [0.0152, 0.14], [0.0152, 0.2], [0.0145, 0.222], [0.0, 0.224]], 8), 14).translate(0, AY, 0), C.rubber, M.rubber);   // shaft grip sleeve
  const fg = superEllipsoid(0.0118, 0.029, 0.0132, 0.55, 0.65, 10, 8, (q) => { if (q.z > 0) { const f = 0.5 + 0.5 * Math.cos((q.y / 0.0125) * Math.PI * 2); q.z -= 0.0012 * f; } });
  fg.rotateX(-0.12); P.add(at(fg, 0, 0.024, 0.17), C.darker, M.satin);
  P.add(at(superEllipsoid(0.0134, 0.0042, 0.0152, 0.5, 0.5, 10, 4), 0, -0.004, 0.174), C.dark, M.gloss);
  // ---- runner collar (slides up the shaft as the canopy opens)
  RUN.add(latheZ(smoothProfile([[0.0, -0.022], [0.0185, -0.02], [0.021, -0.006], [0.019, 0.012], [0.0, 0.02]], 7), 14).translate(0, AY, RUNNER_Z0), C.darker, M.satin);
  RUN.add(at(torus(0.0205, 0.0025, 4, 14), 0, AY, RUNNER_Z0 - 0.004), C.hazard, M.gloss);
  // ---- crown hub + status lamp ring + flared shot nozzle (team ring)
  P.add(latheZ(smoothProfile([[0, -0.03], [0.02, -0.028], [0.032, -0.012], [0.034, 0.004], [0.026, 0.02], [0, 0.026]], 8), 16).translate(0, AY, CROWN_Z), C.dark, M.gloss);
  I.add(at(torus(0.0322, 0.0036, 5, 18), 0, AY, CROWN_Z - 0.006));
  LAMP.add(at(torus(0.0205, 0.0026, 4, 18), 0, AY, CROWN_Z + 0.02), '#4dff8a', M.led);
  const noz = latheZ(smoothProfile([[0.0, CROWN_Z + 0.018], [0.0125, CROWN_Z + 0.02], [0.0125, CROWN_Z + 0.06], [0.0155, CROWN_Z + 0.075], [0.021, CROWN_Z + 0.108], [0.0215, CROWN_Z + 0.116]], 8)
    .concat([[0.0165, CROWN_Z + 0.118], [0.0125, CROWN_Z + 0.108], [0, CROWN_Z + 0.1]]), 14);
  P.add(noz.translate(0, AY, 0), C.gunmetal, M.metal);
  I.add(at(torus(0.0138, 0.003, 4, 14), 0, AY, CROWN_Z + 0.052));
  // ---- canopy gores (furled at rest)
  const parts = {
    trigger: { src: T.build(), pivot: new V3(0, 0.0315, 0.0282), mat: 'body' },
    runner: { src: RUN.build(), pivot: new V3(0, AY, RUNNER_Z0), mat: 'body' },
    lamp: { src: LAMP.build(), pivot: new V3(0, AY, CROWN_Z + 0.02), mat: 'lamp', lamp: { color: '#0f2a18', emissive: '#3dff7a', intensity: 1.4 } },
  };
  const crown = new V3(0, AY, CROWN_Z), place = (k) => new THREE.Matrix4().makeTranslation(crown.x, crown.y, crown.z).multiply(goreRot(k)).multiply(FOLD0(k));
  const tears = [[], []];
  for (let k = 0; k < NG; k++) {
    const G = new Parts(); goreLocal(G, k);
    parts['g' + k] = { src: G.build().applyMatrix4(place(k)), pivot: crown.clone(), mat: TEAM_GORE(k) ? 'ink' : 'body' };
    // damage tears ride their gore: authored in the same furled frame, relative to the crown (the gore part's pivot)
    TEARS.forEach((list, stage) => {
      for (const [g, a0, a1, p0, p1] of list) {
        if (g !== k) continue;
        const TP = new Parts(); tearLocal(TP, TH0 + (TH - TH0) * a0, TH0 + (TH - TH0) * a1, p0 * GW / 0.25, p1 * GW / 0.25, k * 97 + stage * 13 + 5);
        tears[stage].push({ gore: k, geo: TP.build().applyMatrix4(new THREE.Matrix4().multiply(goreRot(k)).multiply(FOLD0(k))) });
      }
    });
  }
  return {
    kind: 'brolly', body: P.build(), ink: I.build(), parts, tears,
    muzzle: MUZZLE.clone(),
    gripR: { pos: new V3(0, 0, 0), handZ: GA.clone(), handY: new V3(0, 0.25, -1) },
    gripL: { pos: new V3(0, 0.022, 0.17), handZ: new V3(0, 1, -0.12), handY: new V3(0.45, -0.05, -1) },
    twirl: new V3(0, 0.03, 0.12),
  };
}

// ---------------------------------------------------------------------------------------------- animation
const _M = new THREE.Matrix4(), _F = new THREE.Matrix4(), _c = new THREE.Color(), _w = new THREE.Color(1, 1, 1);
const _lampOk = new THREE.Color('#3dff7a'), _lampMid = new THREE.Color('#ffc21a'), _lampLow = new THREE.Color('#ff3b30'), _lampRe = new THREE.Color('#9fd8ff');
const easeOutBack = (t) => { const c1 = 1.9, c3 = c1 + 1; return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2; };

/** Per-instance fabric materials (vertex colour × team / white; emissive = hit flash + low-hp flicker). */
export function makeFabric(color, team) {
  return new THREE.MeshPhysicalMaterial({ color: color.clone(), vertexColors: true, roughness: team ? 0.32 : 0.5, metalness: 0, clearcoat: team ? 0.7 : 0.25, clearcoatRoughness: 0.12,
    sheen: 0.5, sheenRoughness: 0.45, sheenColor: team ? color.clone().lerp(_w, 0.5) : new THREE.Color('#ffffff'), emissive: 0x000000, name: team ? 'iw-brolly-ink' : 'iw-brolly-cream' });
}

// the canopy is big enough to matter to the AO / depth-normal passes (small parts sit those out: see character.js
// partGate) — always draw it, whatever pass is running
function drawAlways(renderer, scene, camera, geometry) { geometry.drawRange.count = Infinity; }

function initInstance(w, st) {
  const d = w.def, local = !!(st.runner && st.runner.a && st.runner.a.isLocal);
  const S = { gores: [], tears: [[], []], col: new THREE.Color().copy(st.color), inkMat: makeFabric(st.color, true), creamMat: makeFabric(_w, false), local };
  // your own canopy turns see-through as it opens (it would otherwise fill the over-the-shoulder view)
  if (local) for (const m of [S.inkMat, S.creamMat]) m.transparent = true;
  const crown = new V3(0, AY, CROWN_Z);
  for (let k = 0; k < NG; k++) {
    const g = w.parts['g' + k]; if (!g) continue;
    g.matrixAutoUpdate = false;
    const mesh = g.userData.mesh; mesh.castShadow = true; mesh.onBeforeRender = drawAlways;
    const mat = TEAM_GORE(k) ? S.inkMat : S.creamMat;
    mesh.material = mat;
    const R = goreRot(k);
    S.gores.push({ k, g, mesh, mat, T: new THREE.Matrix4().makeTranslation(crown.x, crown.y, crown.z), R, Ri: R.clone().invert(), F0i: FOLD0(k).invert(), a0: foldA(k), sx0: FOLD_SX * (k & 1 ? 1 : 1.08) });
  }
  // damage tears: children of their gore (same furled authoring frame), shown by hp stage
  const plastic = getPlasticMaterial();
  (d.tears || []).forEach((list, stage) => {
    for (const t of list) {
      const gg = w.parts['g' + t.gore]; if (!gg) continue;
      const m = new THREE.Mesh(t.geo, plastic); m.visible = false; gg.add(m); S.tears[stage].push(m);
    }
  });
  if (w.parts.runner) w.parts.runner.userData.mesh.castShadow = true;
  // stretchers: a strut from the runner collar to each rib (re-aimed every frame; they fold flat along the shaft)
  S.struts = [];
  const sg = strutGeo(), mat = getPlasticMaterial();
  for (const G of S.gores) {
    const m = new THREE.Mesh(sg, mat); m.matrixAutoUpdate = false; w.off.add(m);
    const ribA = gp(TH * 0.42, GW, -THICK - 0.004).applyMatrix4(G.R.clone().multiply(FOLD0(G.k)));   // authored, crown-relative
    const dir = new V3(Math.sin(GW), Math.cos(GW), 0).applyMatrix4(G.R).normalize();
    S.struts.push({ m, G, ribA, dir });
  }
  return S;
}
let _strutGeo = null;
function strutGeo() {
  if (_strutGeo) return _strutGeo;
  const P = new Parts(); P.add(lathe([[0, 0], [1, 0], [1, 1], [0, 1]], 6), C.gunmetal, M.metal);
  return (_strutGeo = P.build());
}
const _sa = new V3(), _sb = new V3(), _sx = new V3(), _sy = new V3(), _sz = new V3(), _ZA = new V3(0, 0, 1);

/** animate(w, st) for registerWeaponModel: drives the canopy from the runner's kit (st.runner.kit, see kits/brolly.js). */
export function animateBrolly(w, st) {
  const P = w.parts || {}, R = st.runner, k = R && R.kit && R.kit.brolly ? R.kit : null;
  const dt = Math.min(0.1, Math.max(0, st.dt || 0)), t = st.t || 0;
  const S = w.bs || (w.bs = initInstance(w, st));
  const open = k ? k.open : 0, grow = k ? k.grow : 1;
  // LOD: the merged far mesh is the furled brolly — anything else (open, regrowing, gone) keeps the live parts
  const near = st.near !== false || open > 0.004 || grow < 0.999;
  if (near !== w.near) {
    w.near = near;
    if (w.body) w.body.visible = near; if (w.ink) w.ink.visible = near;
    if (w.bodyFar) w.bodyFar.visible = !near; if (w.inkFar) w.inkFar.visible = !near;
    for (const g of w.partList || []) g.visible = near;
    for (const u of S.struts || []) u.m.visible = near;
  }
  // team colour (setColor re-points 'ink' parts at the shared ink material: take them back)
  if (!S.col.equals(st.color)) { S.col.copy(st.color); S.inkMat.color.copy(st.color); S.inkMat.sheenColor.copy(st.color).lerp(_w, 0.5); }
  for (const G of S.gores) if (G.mesh.material !== G.mat) G.mesh.material = G.mat;
  if (!near) return;
  // ---- gores: fold angle / squash from the (eased, overshooting) openness; hit recoil; regrowth scale from the crown
  const eo = open <= 0 ? 0 : open >= 1 ? 1 : (k && k.opening ? easeOutBack(open) : open * open * (3 - 2 * open));
  const flutter = open > 0.9 ? 0.012 * Math.sin(t * 13.7) : 0, kick = k ? k.shake || 0 : 0;
  const gs = Math.max(0.001, grow < 1 ? easeOutBack(Math.max(0, grow)) : 1);
  for (const G of S.gores) {
    const e = Math.max(0, eo), ec = Math.min(1, e);
    const a = G.a0 * (1 - e) - 0.16 * kick * (open > 0.5 ? 1 : 0) + flutter * ((G.k & 1) ? 1 : -1);
    const sx = (G.sx0 + (1 - G.sx0) * ec) * gs, sl = (FOLD_S + (1 - FOLD_S) * ec) * gs;
    foldMatrix(a, sx, sl, sl, _F);
    _M.copy(G.T).multiply(G.R).multiply(_F).multiply(G.F0i).multiply(G.Ri);
    G.g.matrix.copy(_M); G.g.matrixWorldNeedsUpdate = true;
    G.g.visible = grow > 0.002;
  }
  // struts: runner collar → rib (both where they are this frame)
  if (S.struts) {
    const rz = RUNNER_Z0 + (RUNNER_Z1 - RUNNER_Z0) * Math.min(1, Math.max(0, eo)), show = grow > 0.05;
    for (const u of S.struts) {
      u.m.visible = show;
      if (!show) continue;
      _sa.set(0, AY, rz).addScaledVector(u.dir, 0.019);
      _sb.copy(u.ribA).applyMatrix4(u.G.g.matrix);
      _sy.subVectors(_sb, _sa);
      _sx.crossVectors(_sy, _ZA); if (_sx.lengthSq() < 1e-10) _sx.set(1, 0, 0); _sx.normalize().multiplyScalar(0.0026);
      _sz.crossVectors(_sx, _sy).normalize().multiplyScalar(0.0026);
      u.m.matrix.makeBasis(_sx, _sy, _sz).setPosition(_sa); u.m.matrixWorldNeedsUpdate = true;
    }
  }
  // tears by hp stage (only while the canopy is there)
  const hpf = k ? k.hp / k.hpMax : 1, have = grow > 0.5;
  for (const m of S.tears[0]) m.visible = have && hpf < 0.66;
  for (const m of S.tears[1]) m.visible = have && hpf < 0.33;
  // runner collar rides the opening; trigger follows shots
  if (P.runner) P.runner.position.z = P.runner.userData.rest.z + (RUNNER_Z1 - RUNNER_Z0) * Math.min(1, Math.max(0, eo));
  if (P.trigger) {
    const want = (st.sinceShoot ?? 99) < 0.12 || open > 0.1 ? 1 : 0;
    w.trig = (w.trig || 0) + (want - (w.trig || 0)) * (1 - Math.exp(-(want ? 40 : 20) * dt));
    P.trigger.rotation.x = 0.42 * w.trig;
  }
  // status lamp: hp green → amber → red; off (broken / launched) with a blue blink while it regrows
  if (P.lamp) {
    const m = P.lamp.userData.mesh.material;
    if (!k || k.state === 'ready') {
      if (hpf > 0.5) m.emissive.copy(_lampMid).lerp(_lampOk, (hpf - 0.5) * 2); else m.emissive.copy(_lampLow).lerp(_lampMid, hpf * 2);
      m.emissiveIntensity = (hpf < 0.25 ? 0.6 + 2.2 * (Math.sin(t * 22) > 0 ? 1 : 0.1) : 1.4) + 2.5 * (k ? k.flash : 0) + (grow < 1 ? 3 * (1 - grow) : 0);
    } else {
      m.emissive.copy(_lampRe);
      const reK = k.regrowK || 0;
      m.emissiveIntensity = 0.15 + (Math.sin(t * (6 + 14 * reK)) > 0.3 ? 1.6 * reK : 0);
    }
  }
  // fabric: white flash on hits, sputtering flicker when nearly broken
  const fl = k ? k.flash : 0, low = k && k.state === 'ready' && hpf < 0.25 ? 1 : 0;
  const flick = low ? (Math.sin(t * 37) * Math.sin(t * 23.3) > 0.2 ? 0.35 : 0) : 0;
  S.inkMat.emissive.copy(S.col).multiplyScalar(0.5 * fl + flick).lerp(_w, fl * 0.5);
  S.creamMat.emissive.setRGB(1, 1, 1).multiplyScalar(0.45 * fl + flick * 0.6);
  if (S.local) {
    const op = 1 - 0.56 * Math.min(1, Math.max(0, open));
    for (const m of [S.inkMat, S.creamMat]) { m.opacity = op; m.depthWrite = op > 0.99; }
  }
}

export function brollyDef() { return buildBrolly(); }
