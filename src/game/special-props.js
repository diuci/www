// INKWAVE — procedural world props for the specials: Kraken, Howl Box speaker, Vortex Strike missile, Ink Jet pack
// and the Crab Rig. Same toy-plastic language as the held weapons (character-weapons.js): every geometry carries vertex
// colours + the `aMat` surface class, so `body` renders with getPlasticMaterial(), `ink` (and other *Ink parts) with
// getInkMaterial(teamColor), `glow` with an emissive team material (lit parts always sit on an opaque socket).
//
// Space: metres, +Y up, +Z forward, origin at the BOTTOM CENTRE (resting on the ground) unless a prop says otherwise
// (missile: its centre; jetpack: the ink tank's local frame). Parts meant to move are authored in prop space too and
// come with a pivot (`…At` / `at`): put a group at the pivot and the mesh inside it at −pivot (like the spinner's spin).
import * as THREE from 'three';
import { superEllipsoid, lathe, smoothProfile, sweep, finalize } from './character-geo.js';
import { GEO_KIT } from './character-weapons.js';

const { Parts, C, M, latheZ, torus, at, rbox, orient, screw, decal, placeXY, squidShape, chevrons, deformG, hring, wrapY, wrapZ, profR, wrapLathe, sphZone, led, refine } = GEO_KIT;
const V3 = THREE.Vector3;
const TAU = Math.PI * 2;

// ---------------------------------------------------------------------------------------------- helpers
/** Bevelled slab from a 2D shape (XY plane), extruded along +Z by depth and centred on z = 0. */
function slab(shape, depth, bevel = 0.006, curveSegments = 6) {
  const g = new THREE.ExtrudeGeometry(shape, { depth: Math.max(1e-4, depth - 2 * bevel), bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments });
  g.translate(0, 0, -depth / 2 + bevel);
  return finalize(g);
}
/** Straight rod of radius r from a to b (lathe along +Y, oriented). */
function rod(a, b, r, seg = 8) { const len = a.distanceTo(b); return orient(lathe([[0, 0], [r, 0], [r, len], [0, len]], seg), b.clone().sub(a), a); }
/** Horizontal ring on the XZ plane → ring around +Z at z (for things facing forward). */
function zring(R, r, x, y, z, rs = 5, ts = 24) { return at(torus(R, r, rs, ts), x, y, z); }
/** Sphere (superEllipsoid e = 1). */
function ball(r, x, y, z, ws = 12, hs = 8) { return at(superEllipsoid(r, r, r, 1, 1, ws, hs), x, y, z); }
/** Make a closed solid face outward (flip the winding if its signed volume is negative). */
function outward(g) {
  const p = g.attributes.position, ix = g.index.array, a = new V3(), b = new V3(), c = new V3(); let vol = 0;
  for (let i = 0; i < ix.length; i += 3) { a.fromBufferAttribute(p, ix[i]); b.fromBufferAttribute(p, ix[i + 1]); c.fromBufferAttribute(p, ix[i + 2]); vol += a.dot(b.cross(c)); }
  if (vol < 0) { for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; } g.computeVertexNormals(); }
  return g;
}
const _rc = new THREE.Raycaster();
/** First front-face hit of a ray on a (static, untransformed) mesh → { p, n } or null. */
function hitOn(mesh, origin, dir) { _rc.set(origin, dir); const h = _rc.intersectObject(mesh, false)[0]; return h ? { p: h.point.clone(), n: h.face.normal.clone() } : null; }
/** Drape a part placed on the tangent plane (p0, n) onto the mesh surface: every vertex keeps its height above that
 *  plane, measured from the surface point found straight below it (along −n). */
function drape(g, mesh, p0, n, lift = 0.002) {
  const d = new V3(), dn = n.clone().negate();
  return deformG(g, (v) => {
    const h = d.subVectors(v, p0).dot(n), base = v.clone().addScaledVector(n, -h);
    const hit = hitOn(mesh, base.clone().addScaledVector(n, 0.4), dn);
    if (hit) v.copy(hit.p).addScaledVector(n, h + lift);
  });
}

// ---------------------------------------------------------------------------------------------- kraken
/** Kraken: a big upright cartoon squid, 2.1 m tall, ~1.3 m wide. Bullet mantle (front-back squashed) with arrowhead fins
 *  on top and a ridge band, a dark goggle mask with big white eyes (glossy dark pupils, highlights), a skirt of ten
 *  short thick tentacles (curled tips, pale suckers) touching the ground. Squid in `ink`; mask, eyes, suckers in `body`.
 *  Extras: eyesAt (centre between the eyes, on the face), mouthAt (under the mask, for a shout/ink spit FX). */
function buildKraken() {
  const P = new Parts(), I = new Parts();
  const ZS = 0.88, sq = (g) => { g.scale(1, 1, ZS); return g; };
  const prof = smoothProfile([[0, 0.34], [0.3, 0.37], [0.47, 0.47], [0.57, 0.66], [0.605, 0.9], [0.59, 1.12], [0.535, 1.34], [0.445, 1.56], [0.325, 1.77], [0.19, 1.94], [0.075, 2.055], [0, 2.1]], 34);
  I.add(sq(lathe(prof, 36)));
  // arrowhead fins: two big rounded triangular flaps from near the tip down the upper mantle (the squid silhouette),
  // thick at the root, thinning toward the outer edge
  for (const sx of [1, -1]) {
    const sh = new THREE.Shape(); sh.moveTo(0.06, 2.0); sh.quadraticCurveTo(0.42, 1.74, 0.74, 1.4); sh.quadraticCurveTo(0.77, 1.33, 0.7, 1.325);
    sh.quadraticCurveTo(0.5, 1.33, 0.3, 1.36); sh.lineTo(0.06, 2.0);
    const fin = deformG(slab(sh, 0.16, 0.05, 10), (v) => { const t = Math.min(1, Math.max(0, (v.x - 0.3) / 0.45)); v.z *= 1 - 0.55 * t; });
    if (sx < 0) fin.rotateY(Math.PI);
    I.add(sq(fin));
  }
  // mask: dark goggle band hugging the face, pointed down between the eyes (determined look)
  const y0 = 1.1;
  const maskPts = [[-0.52, 0.0], [-0.46, 0.13], [-0.31, 0.205], [-0.15, 0.175], [0, 0.095], [0.15, 0.175], [0.31, 0.205], [0.46, 0.13], [0.52, 0.0], [0.45, -0.125], [0.3, -0.185], [0.14, -0.155], [0, -0.1], [-0.14, -0.155], [-0.3, -0.185], [-0.45, -0.125]];
  const mask = new THREE.Shape(new THREE.CatmullRomCurve3(maskPts.map(([x, y]) => new V3(x, y, 0)), true, 'centripetal').getPoints(72).slice(0, -1).map((p) => new THREE.Vector2(p.x, p.y)));
  P.add(sq(wrapLathe(refine(decal(mask, 0.014), 0.06), prof, 0, y0, 0.001)), C.darker, M.gloss);
  // eyes: white sclera, glossy dark pupils looking a little inward, two highlights each
  for (const sx of [1, -1]) {
    const scl = superEllipsoid(0.135, 0.158, 0.05, 0.9, 1, 18, 14); scl.translate(sx * 0.215, 0.012, 0);
    P.add(sq(wrapLathe(scl, prof, 0, y0, 0.012)), C.white, M.gloss);
    const pup = superEllipsoid(0.074, 0.1, 0.03, 0.95, 1, 16, 12); pup.translate(sx * 0.185, -0.004, 0);
    P.add(sq(wrapLathe(pup, prof, 0, y0, 0.045)), C.lens, M.lens);
    const hl = superEllipsoid(0.024, 0.028, 0.012, 1, 1, 10, 8); hl.translate(sx * 0.185 + 0.028, 0.045, 0);
    P.add(sq(wrapLathe(hl, prof, 0, y0, 0.07)), C.white, M.gloss);
    const hl2 = superEllipsoid(0.011, 0.011, 0.008, 1, 1, 8, 6); hl2.translate(sx * 0.185 - 0.03, -0.05, 0);
    P.add(sq(wrapLathe(hl2, prof, 0, y0, 0.068)), C.white, M.gloss);
  }
  // tentacle skirt: ten thick tapering arms, alternating long/short, tips curling up; pale suckers along the top
  for (let k = 0; k < 10; k++) {
    const az = (k + 0.5) * TAU / 10, s = k % 2 ? 0.86 : 1, d = new V3(Math.sin(az), 0, Math.cos(az) * ZS), tw = new V3(Math.cos(az), 0, -Math.sin(az)).multiplyScalar(0.05 * (k % 2 ? 1 : -1));
    const pt = (r, y) => d.clone().multiplyScalar(r).add(new V3(0, y, 0)).add(tw.clone().multiplyScalar(r));
    const pts = [pt(0.2, 0.56), pt(0.35, 0.36), pt(0.47 * s + 0.03, 0.15), pt(0.6 * s + 0.02, 0.085), pt(0.71 * s + 0.02, 0.13), pt(0.745 * s + 0.02, 0.25 * s + 0.02)];
    const tt = sweep(pts, { seg: 16, radial: 10, capSteps: 3, radius: (t) => 0.14 * (1 - 0.74 * t) + 0.012, flat: 0.82, outward: () => new V3(0, 1, 0), transport: true });
    I.add(tt.geo);
    for (const t of [0.46, 0.58, 0.7]) {
      const S = tt.sample(t), up = S.o.clone(), c = S.P.clone().addScaledVector(up, S.r * 0.8);
      P.add(orient(lathe([[0, 0], [0.024 * (1.2 - t), 0], [0.026 * (1.2 - t), 0.008], [0.016 * (1.2 - t), 0.013], [0, 0.011]], 10), up, c), C.bone, M.satin);
    }
  }
  const fr = profR(prof, y0) * ZS;
  return {
    kind: 'kraken', body: P.build(), ink: I.build(),
    eyesAt: new V3(0, y0 + 0.01, fr + 0.03),
    mouthAt: new V3(0, 0.82, profR(prof, 0.82) * ZS),
    height: 2.1, radius: 0.62,
  };
}

// ---------------------------------------------------------------------------------------------- speaker (Howl Box)
/** Howl Box: a cream PA cabinet (1.1 × 1.2 × 0.8 on stubby legs, carry handle on top → 1.52 tall) with rubber corner
 *  bumpers, a team band, squid emblems on the flanks and a dark front baffle. A thick cream collar with a lit team ring
 *  (`glow`) frames the huge woofer; the woofer itself — dark ribbed cone + team dust cap — is `cone` / `coneInk`, authored
 *  in prop space and concave BEHIND its rim plane: put it in a group at `coneAt` (rim centre) and pulse scale.z (< 1 pushes
 *  the cap out, > 1 sucks it in; the rim stays put). `mouth` = front of the dust cap (beam start). Tweeters, knobs and a
 *  lit level meter (`glow`) on the top strip. */
function buildSpeaker() {
  const P = new Parts(), I = new Parts(), L = new Parts(), CN = new Parts(), CI = new Parts();
  const W = 1.1, H = 1.2, D = 0.8, y0 = 0.2, cy = y0 + H / 2, fz = D / 2;
  const wy = 0.7, WR = 0.36;                                             // woofer centre height, cone radius
  // cabinet, team band, corner bumpers, back panel with vents, jack + LED
  P.add(at(rbox(W, H, D, 0.2, 24, 20), 0, cy, 0), C.cream, M.gloss);
  I.add(at(rbox(W + 0.014, 0.07, D + 0.014, 0.2, 24, 6), 0, 0.33, 0));
  for (const sx of [1, -1]) for (const sy of [0, 1]) for (const sz of [1, -1]) {
    P.add(at(superEllipsoid(0.085, 0.085, 0.085, 0.6, 0.6, 10, 8), sx * (W / 2 - 0.03), y0 + 0.03 + sy * (H - 0.06), sz * (D / 2 - 0.03)), C.rubber, M.rubber);
  }
  P.add(at(rbox(0.9, 1.0, 0.03, 0.3, 14, 12), 0, cy, -fz + 0.004), C.dark, M.satin);
  for (let k = 0; k < 6; k++) P.add(at(rbox(0.5, 0.03, 0.02, 0.5, 10, 4), 0, 0.95 + k * 0.06, -fz - 0.01), C.darker, M.satin);
  P.add(at(latheZ([[0, -0.03], [0.05, -0.03], [0.055, -0.02], [0.055, 0.0], [0, 0.0]], 16), -0.3, 0.45, -fz - 0.004), C.metal, M.metal);
  led(P, new V3(0.3, 0.45, -fz - 0.012), new V3(0, 0, -1), C.red, 0.014);
  // flanks: recessed carry grips + big squid emblems (team) + screws
  for (const sx of [1, -1]) {
    P.add(placeXY(rbox(0.28, 0.08, 0.03, 0.4, 12, 6), new V3(0, 0, -sx), new V3(0, 1, 0), new V3(sx * (W / 2 + 0.002), 1.2, 0)), C.dark, M.gloss);
    I.add(placeXY(decal(squidShape(0.42), 0.004), new V3(0, 0, -sx), new V3(0, 1, 0), new V3(sx * (W / 2 + 0.0015), 0.72, 0)));
    for (const [y, z] of [[0.3, 0.3], [0.3, -0.3], [1.1, 0.3], [1.1, -0.3]]) screw(P, new V3(sx * (W / 2 + 0.001), y, z), new V3(sx, 0, 0), 0.013);
  }
  // stubby legs + rubber feet
  for (const sx of [1, -1]) for (const sz of [1, -1]) {
    P.add(at(lathe(smoothProfile([[0, 0.02], [0.07, 0.022], [0.064, 0.1], [0.075, 0.2], [0, 0.21]], 8), 14), sx * 0.4, 0, sz * 0.26), C.dark, M.gloss);
    P.add(at(lathe([[0, 0], [0.085, 0], [0.09, 0.012], [0.08, 0.026], [0, 0.026]], 16), sx * 0.4, 0, sz * 0.26), C.rubber, M.rubber);
  }
  // carry handle on top (dark frame, rubber sleeve)
  const hd = sweep([new V3(-0.34, 1.36, 0), new V3(-0.3, 1.47, 0), new V3(-0.14, 1.5, 0), new V3(0.14, 1.5, 0), new V3(0.3, 1.47, 0), new V3(0.34, 1.36, 0)], { seg: 20, radial: 8, capSteps: 2, radius: () => 0.024, outward: () => new V3(0, 0, 1) });
  P.add(hd.geo, C.dark, M.gloss);
  const sl = []; for (let k = 0; k <= 6; k++) sl.push(hd.curve.getPointAt(0.3 + k * 0.0667));
  P.add(sweep(sl, { seg: 12, radial: 10, capSteps: 2, radius: (t) => 0.032 + 0.002 * Math.cos(t * Math.PI * 12), outward: () => new V3(0, 0, 1) }).geo, C.rubber, M.rubber);
  for (const sx of [1, -1]) P.add(at(rbox(0.1, 0.03, 0.1, 0.4, 8, 4), sx * 0.34, 1.405, 0), C.dark, M.gloss);
  // front baffle (dark); the woofer lives in FRONT of it inside a deep cream collar with a lit team ring + bolts
  P.add(at(rbox(W - 0.08, H - 0.08, 0.05, 0.25, 18, 16), 0, cy, fz + 0.004), C.dark, M.satin);
  const bz = fz + 0.029;                                                  // baffle front plane
  P.add(latheZ(smoothProfile([[WR + 0.012, bz - 0.01], [WR + 0.004, bz + 0.04], [WR + 0.008, bz + 0.11], [WR + 0.028, bz + 0.134], [WR + 0.068, bz + 0.126], [WR + 0.086, bz + 0.09], [WR + 0.092, bz + 0.03], [WR + 0.1, bz - 0.01]], 14), 44).translate(0, wy, 0), C.cream, M.gloss);
  P.add(zring(WR + 0.047, 0.016, 0, wy, bz + 0.126, 5, 48), C.darker, M.satin);
  L.add(zring(WR + 0.047, 0.012, 0, wy, bz + 0.134, 6, 48));
  for (let k = 0; k < 8; k++) { const a = (k + 0.5) * TAU / 8, n = new V3(Math.cos(a), Math.sin(a), 0.9).normalize(); screw(P, new V3(Math.cos(a) * (WR + 0.078), wy + Math.sin(a) * (WR + 0.078), bz + 0.108), n, 0.012); }
  const rimZ = bz + 0.108, depth = 0.094;
  P.add(zring(WR, 0.022, 0, wy, rimZ, 8, 48), C.rubber, M.rubber);
  // woofer (cone / coneInk): ribbed shallow dish, concave behind the rim plane; team dust cap; rings on the dish
  const dz = (r) => { const t = Math.min(1, Math.max(0, (WR - 0.004 - r) / (WR - 0.1))); return rimZ - depth * Math.pow(t, 1.3) + 0.0035 * Math.sin(t * Math.PI * 9) * (1 - t); };
  const dish = [[0, rimZ - depth - 0.012], [WR - 0.004, rimZ - depth - 0.012], [WR - 0.004, rimZ]];
  for (let i = 1; i <= 16; i++) { const r = WR - 0.004 - i * (WR - 0.1) / 16; dish.push([r, dz(r)]); }
  dish.push([0, rimZ - depth]);
  CN.add(outward(latheZ(dish, 44)).translate(0, wy, 0), C.darker, M.satin);
  CI.add(latheZ(smoothProfile([[0, rimZ - depth - 0.004], [0.08, rimZ - depth - 0.002], [0.104, rimZ - depth + 0.02], [0.094, rimZ - depth + 0.046], [0.056, rimZ - depth + 0.062], [0, rimZ - depth + 0.066]], 10), 30).translate(0, wy, 0));
  CI.add(zring(0.235, 0.011, 0, wy, dz(0.235) + 0.005, 6, 40));
  CN.add(zring(0.16, 0.006, 0, wy, dz(0.16) + 0.004, 4, 36), C.gunmetal, M.metal);
  // top strip: two horn tweeters, knobs, lit level meter, power LED
  for (const sx of [1, -1]) {
    const tx = sx * 0.38, ty = 1.245;
    P.add(latheZ([[0, bz - 0.01], [0.085, bz - 0.01], [0.09, bz + 0.012], [0.082, bz + 0.03], [0.07, bz + 0.03], [0.04, bz + 0.012], [0.02, bz + 0.004], [0, bz + 0.004]], 24).translate(tx, ty, 0), C.cream, M.gloss);
    P.add(latheZ([[0, bz + 0.002], [0.02, bz + 0.004], [0.042, bz + 0.013], [0.068, bz + 0.028], [0, bz + 0.028]], 20).translate(tx, ty, 0), C.darker, M.satin);
    P.add(at(superEllipsoid(0.018, 0.018, 0.012, 1, 1, 10, 6), tx, ty, bz + 0.008), C.metal, M.metal);
  }
  const knob = () => lathe(smoothProfile([[0, 0], [0.028, 0.0], [0.03, 0.012], [0.026, 0.03], [0, 0.034]], 7), 14, (v) => { const rr = Math.hypot(v.x, v.z); if (rr > 0.01) { const k = 1 - 0.07 * Math.max(0, Math.cos(Math.atan2(v.z, v.x) * 9)); v.x *= k; v.z *= k; } });
  for (const [x, col] of [[-0.2, C.white], [0.2, C.hazard]]) {
    P.add(orient(knob(), new V3(0, 0, 1), new V3(x, 1.265, bz)), C.dark, M.gloss);
    P.add(orient(superEllipsoid(0.004, 0.012, 0.003, 0.6, 0.6, 5, 5), new V3(0, 0, 1), new V3(x, 1.265 + 0.016, bz + 0.035)), col, M.gloss);
  }
  P.add(at(rbox(0.23, 0.06, 0.02, 0.3, 12, 6), 0, 1.245, bz + 0.002), C.darker, M.gloss);
  for (let k = 0; k < 7; k++) L.add(at(rbox(0.022, 0.028 + k * 0.003, 0.012, 0.4, 6, 4), -0.09 + k * 0.03, 1.245, bz + 0.012));
  led(P, new V3(0, 1.32, bz + 0.004), new V3(0, 0, 1), C.green, 0.012);
  return {
    kind: 'speaker', body: P.build(), ink: I.build(), glow: L.build(),
    cone: CN.build(), coneInk: CI.build(), coneAt: new V3(0, wy, rimZ),
    mouth: new V3(0, wy, rimZ - depth + 0.066),
    width: W, height: 1.53, depth: D,
  };
}

// ---------------------------------------------------------------------------------------------- missile (Vortex Strike)
/** Vortex Strike missile: 1.32 m long, origin at its CENTRE, +Z = nose. Cream airframe (Ø 0.21), team-ink warhead with a
 *  metal tip, team bands + chevrons, hazard collar, four canards, four swept tail fins with team tips, dark boat-tail
 *  and a gunmetal nozzle whose throat glows (`glow`). Extras: tail (exhaust point), nose. */
function buildMissile() {
  const P = new Parts(), I = new Parts(), L = new Parts();
  const R = 0.105;
  P.add(latheZ([[0, -0.47]].concat(smoothProfile([[R - 0.012, -0.47], [R, -0.455], [R, 0.3], [R - 0.001, 0.318]], 10), [[0, 0.318]]), 30), C.cream, M.gloss);
  // warhead (ogive) + metal tip + dark seam
  const og = []; for (let i = 0; i <= 12; i++) { const t = i / 12; og.push([(R + 0.002) * Math.sqrt(1 - t * t) * (1 - 0.06 * t) + 0.012 * t, 0.312 + 0.31 * t]); }
  I.add(latheZ([[0, 0.312]].concat(og, [[0, 0.63]]), 30));
  P.add(latheZ([[0, 0.61], [0.02, 0.608], [0.024, 0.62], [0.018, 0.64], [0.008, 0.652], [0, 0.655]], 14), C.metal, M.metal);
  P.add(zring(R + 0.002, 0.007, 0, 0, 0.315, 5, 30), C.dark, M.gloss);
  // bands, hazard collar, chevrons, squid decals
  for (const z of [0.14, 0.2]) I.add(latheZ([[R + 0.0015, z], [R + 0.0015, z + 0.032]], 30));
  for (let k = 0; k < 6; k++) P.add(latheZ([[R + 0.0012, -0.3 + k * 0.022], [R + 0.0012, -0.3 + (k + 1) * 0.022]], 30), k % 2 ? C.dark : C.hazard, M.print);
  for (const az of [0, Math.PI]) {
    for (const g of chevrons(0.16, 0.05, 3)) { g.rotateZ(Math.PI); I.add(wrapZ(g, R + 0.0006, az + Math.PI / 2, 0.02, 0)); }
    const sqd = refine(decal(squidShape(0.11)), 0.012); if (az) sqd.rotateZ(Math.PI); P.add(wrapZ(sqd, R + 0.0006, az, -0.12, 0), C.dark, M.print);
  }
  // canards (small, at the front of the body)
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + k * Math.PI / 2;
    const sh = new THREE.Shape(); sh.moveTo(0, 0); sh.lineTo(0.09, 0); sh.lineTo(0.05, 0.055); sh.lineTo(0.025, 0.055); sh.lineTo(0, 0);
    const g = slab(sh, 0.012, 0.004, 4); g.translate(-0.045, R - 0.01, 0);
    placeXY(g, new V3(0, 0, 1), new V3(Math.cos(a), Math.sin(a), 0), new V3(0, 0, 0.22)); P.add(g, C.dark, M.gloss);
  }
  // tail fins (swept, X pattern) with team tips
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + k * Math.PI / 2, rd = new V3(Math.cos(a), Math.sin(a), 0);
    const sh = new THREE.Shape(); sh.moveTo(-0.23, 0); sh.lineTo(0.0, 0); sh.quadraticCurveTo(-0.07, 0.07, -0.13, 0.16); sh.lineTo(-0.24, 0.16); sh.quadraticCurveTo(-0.25, 0.08, -0.23, 0);
    const g = slab(sh, 0.018, 0.006, 6); g.translate(0, R - 0.012, 0);
    P.add(placeXY(g, new V3(0, 0, 1), rd, new V3(0, 0, -0.28)), C.cream, M.gloss);
    const tip = superEllipsoid(0.058, 0.02, 0.0125, 0.5, 0.6, 10, 6); tip.translate(-0.188, R + 0.14, 0);
    I.add(placeXY(tip, new V3(0, 0, 1), rd, new V3(0, 0, -0.28)));
    screw(P, rd.clone().multiplyScalar(R + 0.001).add(new V3(0, 0, -0.33)), rd, 0.008);
  }
  // boat-tail + nozzle (gunmetal bell, dark liner, glowing throat on a dark socket)
  P.add(latheZ(smoothProfile([[R - 0.012, -0.468], [R - 0.02, -0.5], [0.078, -0.56], [0.066, -0.6]], 8).concat([[0, -0.6]]), 30), C.dark, M.gloss);
  P.add(latheZ([[0, -0.6], [0.05, -0.595], [0.056, -0.605], [0.07, -0.64], [0.086, -0.665], [0.08, -0.672], [0.066, -0.655], [0.048, -0.625], [0.03, -0.612], [0, -0.61]], 24), C.gunmetal, M.metal);
  P.add(latheZ([[0, -0.607], [0.032, -0.6075], [0.032, -0.604], [0, -0.604]], 16), C.darker, M.satin);
  L.add(latheZ([[0, -0.6135], [0.028, -0.612], [0.045, -0.626], [0.06, -0.648], [0, -0.65]], 20));
  return {
    kind: 'missile', body: P.build(), ink: I.build(), glow: L.build(),
    tail: new V3(0, 0, -0.672), nose: new V3(0, 0, 0.655), radius: R, length: 1.327,
  };
}
// ---------------------------------------------------------------------------------------------- jetpack (Ink Jet)
/** Ink Jet pack, authored in the INK TANK's local frame (tank capsule axis +Y through the origin, +Z toward the kid's
 *  back, see _buildTank / getKidShared().tank): add it to the tank group's parent with the tank group's position +
 *  rotation. A cream housing encloses the tank hardware (caps, collars, rails, gauge — they are part of the skinned
 *  cloth mesh and stay put) with a team ink window + squid decal on its back; two cream thruster pods with team bands,
 *  stubby fins and gunmetal nozzles pointing DOWN, lit throats (`glow`). Everything stays at z < 0.078 (clear of the
 *  back). `nozzles` = [left, right] exhaust points (tank frame; left = +X = the kid's left). ~0.39 wide, 0.46 tall. */
function buildJetpack() {
  const P = new Parts(), I = new Parts(), L = new Parts();
  const hz = -0.012;                                                     // housing centre z
  P.add(at(rbox(0.19, 0.33, 0.176, 0.28, 16, 14), 0, 0.012, hz), C.cream, M.gloss);
  P.add(at(rbox(0.198, 0.03, 0.184, 0.3, 16, 4), 0, -0.12, hz), C.dark, M.gloss);
  P.add(at(rbox(0.198, 0.03, 0.184, 0.3, 16, 4), 0, 0.148, hz), C.dark, M.gloss);
  // back face: ink window (gasket + pane + level ticks), squid decal, screws
  const bz = hz - 0.088;
  P.add(at(rbox(0.07, 0.19, 0.012, 0.4, 10, 12), 0, 0.012, bz), C.dark, M.gloss);
  I.add(at(rbox(0.05, 0.168, 0.014, 0.5, 10, 12), 0, 0.012, bz - 0.001));
  for (let k = 0; k < 4; k++) P.add(at(rbox(0.018, 0.004, 0.004, 0.6, 4, 4), 0.016, -0.045 + k * 0.038, bz - 0.008), C.white, M.print);
  for (const [x, y] of [[0.075, 0.12], [-0.075, 0.12], [0.075, -0.1], [-0.075, -0.1]]) screw(P, new V3(x, y, bz + 0.004), new V3(0, 0, -1), 0.0055);
  { const sq = decal(squidShape(0.05)); placeXY(sq, new V3(-1, 0, 0), new V3(0, 1, 0), new V3(0.062, 0.03, bz + 0.0015)); P.add(sq, C.dark, M.print); }
  led(P, new V3(-0.062, 0.1, bz + 0.002), new V3(0, 0, -1), C.green, 0.006);
  // top: valve cap + hazard lip
  P.add(at(lathe([[0, 0], [0.026, 0], [0.028, 0.012], [0.02, 0.022], [0, 0.024]], 14), 0, 0.172, hz), C.metal, M.metal);
  I.add(at(hring(0.03, 0.005, 0.174, 5, 16), 0, 0, hz));
  // thruster pods (left/right): cream can, dark caps, team bands, fin, bracket, nozzle
  const px = 0.138, pz = -0.012, noz = [];
  for (const sx of [1, -1]) {
    const x = sx * px;
    P.add(at(lathe(smoothProfile([[0, -0.15], [0.042, -0.15], [0.052, -0.13], [0.054, -0.1], [0.054, 0.06], [0.05, 0.1], [0.038, 0.13], [0.018, 0.145], [0, 0.148]], 14), 20), x, 0, pz), C.cream, M.gloss);
    P.add(at(lathe([[0, 0.118], [0.046, 0.118], [0.05, 0.126], [0.042, 0.14], [0.024, 0.152], [0, 0.155]], 18), x, 0, pz), C.dark, M.gloss);
    for (const y of [-0.06, 0.03]) I.add(at(hring(0.0548, 0.006, y, 5, 22), x, 0, pz));
    P.add(at(hring(0.055, 0.0045, -0.13, 5, 22), x, 0, pz), C.dark, M.gloss);
    // bracket to the housing (two straps)
    for (const y of [-0.08, 0.08]) P.add(at(rbox(0.07, 0.026, 0.05, 0.4, 8, 4), sx * 0.1, y, pz), C.dark, M.satin);
    // stubby fin on the outside
    const fs = new THREE.Shape(); fs.moveTo(0, -0.08); fs.lineTo(0, 0.05); fs.quadraticCurveTo(0.03, 0.0, 0.055, -0.1); fs.lineTo(0.045, -0.13); fs.quadraticCurveTo(0.02, -0.11, 0, -0.08);
    const fin = slab(fs, 0.012, 0.004, 5); P.add(placeXY(fin, new V3(sx, 0, 0), new V3(0, 1, 0), new V3(x + sx * 0.046, 0, pz)), C.dark, M.gloss);
    // nozzle: gunmetal bell pointing down, dark liner, lit throat
    P.add(at(lathe([[0, -0.14], [0.034, -0.145], [0.036, -0.158], [0.042, -0.19], [0.052, -0.218], [0.048, -0.224], [0.04, -0.21], [0.03, -0.184], [0.022, -0.168], [0, -0.166]], 20), x, 0, pz), C.gunmetal, M.metal);
    P.add(at(torus(0.05, 0.004, 4, 20).rotateX(Math.PI / 2), x, -0.221, pz), C.dark, M.gloss);
    L.add(at(lathe([[0, -0.2], [0.03, -0.19], [0.022, -0.172], [0, -0.17]], 14), x, 0, pz));
    for (const g of chevrons(0.05, 0.02, 2, false)) { g.rotateZ(-Math.PI / 2); I.add(wrapY(g, 0.0546, Math.PI, -0.09).translate(x, 0, pz)); }
    noz.push(new V3(x, -0.224, pz));
  }
  return { kind: 'jetpack', body: P.build(), ink: I.build(), glow: L.build(), nozzles: noz, width: 0.39 };
}

// ---------------------------------------------------------------------------------------------- crab rig
/** Crab Rig: a squat armoured crab walker the kid rides (standing in the top hatch, waist at the rim).
 *  Hull (`body`/`ink`, incl. the two big front claws, eye stalks, gatling mount, hatch + open lid): cream carapace 1.3 wide
 *  with team stripes and a squid emblem, dark underbelly, top at ~1.12 (hatch rim 1.16).
 *  `legs`: 6 × { body, ink, at (hip pivot), side (+1 = left/+X), index (0 front … 2 back) }, prop space.
 *  `gun` { body, ink, at } fixed gatling housing; `gunSpin` (+ `gunSpinInk`) barrel cluster turning about +Z through
 *  `gunSpinAt`; `gunMuzzle`. `cannon` { body, ink, at } stubby mortar on the back-right (at = its turret pivot);
 *  `cannonMuzzle`, `cannonDir`. `seatAt` = where to put the kid's ROOT (feet) so the hatch rim meets the waist.
 *  `ballBody`/`ballInk`: the armoured ball for the rolling mode, radius 0.95, origin at its bottom. */
function buildCrab() {
  const P = new Parts(), I = new Parts();
  const HC = new V3(0, 0.79, -0.02), RX = 0.64, RY = 0.34, RZ = 0.5;
  // carapace (wider at the front, flatter on top), underbelly, dark skirt line; a raycast copy for draping decals
  const cara = at(superEllipsoid(RX, RY, RZ, 0.62, 0.72, 28, 16, (q) => {
    const fz = q.z / RZ; q.x *= 1 + 0.08 * fz; if (q.y > 0) q.y *= 1 - 0.18 * Math.max(0, fz) ** 2; else q.y *= 0.8;
  }), HC.x, HC.y, HC.z);
  const caraMesh = new THREE.Mesh(cara);
  P.add(cara, C.cream, M.gloss);
  P.add(at(superEllipsoid(0.56, 0.1, 0.44, 0.5, 0.7, 24, 8), 0, 0.46, -0.02), C.dark, M.gloss);
  P.add(at(superEllipsoid(0.62, 0.035, 0.49, 0.5, 0.72, 32, 4), 0, 0.64, -0.02), C.dark, M.satin);
  const down = new V3(0, -1, 0), topAt = (x, z) => hitOn(caraMesh, new V3(x, 2, z), down);
  // team stripes over the top either side of the hatch, emblem on the front slope
  for (const sx of [1, -1]) {
    const pts = []; for (let i = 0; i <= 10; i++) { const z = -0.4 + i * 0.075, h = topAt(sx * 0.35, z); pts.push(h.p.add(new V3(0, 0.006, 0))); }
    I.add(sweep(pts, { seg: 16, radial: 5, capSteps: 2, radius: () => 0.024, flat: 2.4, outward: () => new V3(1, 0, 0) }).geo);
  }
  {
    const h = topAt(0, 0.3), n = h.n.normalize(), y = new V3().crossVectors(n, new V3(1, 0, 0)).normalize();
    const em = placeXY(refine(decal(squidShape(0.2), 0.004), 0.03), new V3(1, 0, 0), y, h.p);
    I.add(drape(em, caraMesh, h.p, n, 0.001));
  }
  // crab-shell teeth along the front-lateral rim
  for (const sx of [1, -1]) for (let k = 0; k < 3; k++) {
    const az = sx * (0.62 + k * 0.3), d = new V3(Math.sin(az), 0, Math.cos(az)), h = hitOn(caraMesh, HC.clone().addScaledVector(d, 2).add(new V3(0, 0.07, 0)), d.clone().negate());
    if (!h) continue;
    const dir = h.n.clone().add(new V3(0, 0.25, 0)).normalize();
    P.add(orient(lathe(smoothProfile([[0, -0.03], [0.05, -0.02], [0.042, 0.03], [0.02, 0.07], [0, 0.085]], 6), 10), dir, h.p), C.cream, M.gloss);
    P.add(orient(lathe([[0, 0.05], [0.026, 0.05], [0.014, 0.075], [0, 0.088]], 8), dir, h.p), C.dark, M.gloss);
  }
  // hatch: raised dark collar, rubber rim, metal lip, dark opening; open lid hinged on the left side
  const hz = -0.06, hr = 0.25, rimY = 1.16;
  P.add(lathe([[hr - 0.02, 1.02], [hr + 0.055, 1.02], [hr + 0.06, 1.1], [hr + 0.045, rimY - 0.012], [hr + 0.02, rimY], [hr - 0.02, rimY - 0.004], [hr - 0.022, 1.021]], 32).translate(0, 0, hz), C.dark, M.gloss);
  P.add(at(hring(hr + 0.012, 0.022, rimY, 6, 40), 0, 0, hz), C.rubber, M.rubber);
  P.add(at(hring(hr - 0.014, 0.009, rimY - 0.008, 4, 36), 0, 0, hz), C.metal, M.metal);
  P.add(lathe([[0, 1.132], [hr - 0.015, 1.132], [hr - 0.015, 1.138], [0, 1.138]], 32).translate(0, 0, hz), C.darker, M.satin);
  {
    const piv = new V3(hr + 0.05, rimY + 0.03, hz);
    const lidG = (g) => { g.translate(-0.3, 0, 0); g.rotateZ(-1.95); g.translate(piv.x, piv.y, piv.z); return g; };
    P.add(lidG(lathe(smoothProfile([[0, -0.03], [0.24, -0.03], [0.262, -0.02], [0.268, 0.0], [0.25, 0.022], [0.16, 0.034], [0, 0.036]], 8), 32)), C.cream, M.gloss);
    I.add(lidG(hring(0.2, 0.012, 0.03, 5, 32)));
    P.add(lidG(lathe([[0, 0.03], [0.05, 0.03], [0.05, 0.046], [0, 0.046]], 12)), C.metal, M.metal);
    P.add(at(rbox(0.06, 0.06, 0.16, 0.4, 6, 6), piv.x - 0.01, rimY + 0.005, hz), C.dark, M.gloss);
  }
  // front: brow ridge, face plate (gatling mount), eye stalks with lens eyes
  P.add(at(superEllipsoid(0.46, 0.05, 0.08, 0.5, 0.6, 20, 6, (q) => { q.y -= 0.35 * q.x * q.x; }), 0, 0.93, 0.43), C.dark, M.gloss);
  P.add(at(superEllipsoid(0.34, 0.16, 0.08, 0.45, 0.6, 18, 10), 0, 0.7, 0.43), C.dark, M.satin);
  for (const sx of [1, -1]) {
    const base = new V3(sx * 0.2, 1.0, 0.3), eye = new V3(sx * 0.25, 1.3, 0.36), look = new V3(sx * 0.15, 0.1, 1).normalize();
    P.add(sweep([base, base.clone().lerp(eye, 0.5).add(new V3(sx * 0.02, 0, -0.02)), eye.clone().add(new V3(0, -0.05, 0))], { seg: 8, radial: 10, capSteps: 2, radius: (t) => 0.032 - 0.008 * t }).geo, C.cream, M.gloss);
    I.add(at(hring(0.029, 0.008, 0, 4, 16), eye.x, eye.y - 0.055, eye.z));
    P.add(ball(0.07, eye.x, eye.y, eye.z, 14, 10), C.white, M.gloss);
    P.add(orient(superEllipsoid(0.045, 0.02, 0.045, 1, 1, 14, 6), look, eye.clone().addScaledVector(look, 0.058)), C.lens, M.lens);
    P.add(orient(superEllipsoid(0.012, 0.006, 0.012, 1, 1, 8, 4), look, eye.clone().add(new V3(sx * 0.15 + 0.2, 0.35, 1).normalize().multiplyScalar(0.072))), C.white, M.gloss);
  }
  // claws: shoulder joint, cream upper arm, elbow, cream forearm with a team band, wrist, team-ink pincer
  for (const sx of [1, -1]) {
    const sh = new V3(sx * 0.5, 0.66, 0.34), el = new V3(sx * 0.72, 0.69, 0.47), wr = new V3(sx * 0.64, 0.67, 0.66);
    P.add(ball(0.09, sh.x, sh.y, sh.z, 12, 8), C.dark, M.gloss);
    P.add(sweep([sh, el], { seg: 6, radial: 12, capSteps: 2, radius: () => 0.078 }).geo, C.cream, M.gloss);
    P.add(ball(0.075, el.x, el.y, el.z, 12, 8), C.dark, M.gloss);
    P.add(sweep([el, wr], { seg: 6, radial: 12, capSteps: 2, radius: (t) => 0.072 + 0.012 * t }).geo, C.cream, M.gloss);
    I.add(orient(hring(0.083, 0.013, 0, 5, 18), wr.clone().sub(el), el.clone().lerp(wr, 0.5)));
    P.add(ball(0.095, wr.x, wr.y, wr.z, 12, 8), C.dark, M.gloss);
    const fwd = new V3(-sx * 0.25, 0.05, 1).normalize(), side = new V3().crossVectors(new V3(0, 1, 0), fwd).normalize(), up = new V3().crossVectors(fwd, side);
    const palmC = wr.clone().addScaledVector(fwd, 0.19);
    I.add(placeXY(superEllipsoid(0.16, 0.175, 0.23, 0.7, 0.8, 14, 10, (q) => { if (q.z > 0) { const t = q.z / 0.23; q.x *= 1 - 0.25 * t; q.y *= 1 - 0.2 * t; } }), side, up, palmC));
    const fb = palmC.clone().addScaledVector(fwd, 0.17);
    const F = (f, h) => fb.clone().addScaledVector(fwd, f).addScaledVector(up, h);
    const fingers = [[[F(0, 0.09), F(0.16, 0.135), F(0.33, 0.07), F(0.41, -0.03)], 0.09, -1], [[F(0, -0.08), F(0.17, -0.12), F(0.35, -0.065), F(0.45, 0.03)], 0.105, 1]];
    for (const [pts, r0, inner] of fingers) {
      const f = sweep(pts, { seg: 10, radial: 9, capSteps: 3, radius: (t) => r0 * (1 - 0.72 * t) + 0.008, flat: 0.8, outward: () => side.clone(), transport: true });
      I.add(f.geo);
      const e = f.sample(0.94); P.add(orient(lathe(smoothProfile([[0, -0.04], [0.034, -0.026], [0.026, 0.026], [0, 0.065]], 6), 10), e.T, e.P), C.dark, M.gloss);
      for (const t of [0.3, 0.5, 0.7]) { const q = f.sample(t), n = up.clone().multiplyScalar(inner); P.add(orient(superEllipsoid(0.02, 0.017, 0.02, 1, 1, 8, 5), n, q.P.clone().addScaledVector(n, q.r * 0.7)), C.bone, M.satin); }
    }
  }
  // back: vent grille, tail lights; flank bolts above the legs
  for (let k = 0; k < 5; k++) P.add(at(rbox(0.36, 0.022, 0.05, 0.5, 10, 4), 0, 0.72 + k * 0.045, -0.5), C.darker, M.satin);
  for (const sx of [1, -1]) led(P, new V3(sx * 0.36, 0.78, -0.47), new V3(sx * 0.3, 0, -1).normalize(), C.red, 0.025);
  for (const sx of [1, -1]) for (const z of [-0.2, 0.1]) { const h = hitOn(caraMesh, new V3(sx * 1.5, 0.84, z), new V3(-sx, 0, 0)); if (h) screw(P, h.p, h.n, 0.016); }
  // gatling: fixed housing (gun) + spinning barrel cluster (gunSpin, axis +Z through gunSpinAt)
  const gy = 0.66, gz0 = 0.48, gz1 = 0.64;
  const G = new Parts(), GI = new Parts(), S = new Parts(), SI = new Parts();
  G.add(latheZ(smoothProfile([[0, gz0 - 0.04], [0.09, gz0 - 0.03], [0.11, gz0], [0.11, gz1 - 0.02], [0.1, gz1]], 8).concat([[0, gz1]]), 28).translate(0, gy, 0), C.dark, M.gloss);
  GI.add(zring(0.111, 0.01, 0, gy, gz1 - 0.045, 5, 28));
  for (const sx of [1, -1]) G.add(at(rbox(0.05, 0.1, 0.12, 0.4, 8, 6), sx * 0.12, gy, gz0 + 0.04), C.gunmetal, M.metal);
  S.add(latheZ([[0, 0], [0.012, 0], [0.012, 0.31], [0, 0.31]], 10).translate(0, gy, gz1), C.metal, M.metal);
  for (let k = 0; k < 6; k++) {
    const a = k * TAU / 6, bx = Math.cos(a) * 0.056, by = gy + Math.sin(a) * 0.056;
    S.add(latheZ([[0, 0.0], [0.019, 0.0], [0.019, 0.29], [0.023, 0.3], [0.023, 0.322], [0.015, 0.325], [0.012, 0.31], [0, 0.308]], 8).translate(bx, by, gz1), C.gunmetal, M.metal);
  }
  for (const [z, col] of [[0.06, C.dark], [0.22, C.cream]]) S.add(latheZ([[0, z - 0.014], [0.085, z - 0.014], [0.092, z - 0.006], [0.092, z + 0.006], [0.085, z + 0.014], [0, z + 0.014]], 28).translate(0, gy, gz1), col, M.gloss);
  SI.add(zring(0.093, 0.008, 0, gy, gz1 + 0.22, 5, 28));
  { const m = superEllipsoid(0.008, 0.014, 0.02, 0.6, 0.6, 6, 5), a = Math.PI / 6; m.rotateZ(a); S.add(at(m, Math.cos(a) * 0.092, gy + Math.sin(a) * 0.092, gz1 + 0.06), C.hazard, M.print); }
  // mortar on the back-right: turret drum, trunnion cheeks, stubby cream tube pitched up and forward
  const K = new Parts(), KI = new Parts();
  const cp = new V3(-0.4, 1.05, -0.24), cdir = new V3(0.0, 0.88, 0.47).normalize();
  K.add(lathe(smoothProfile([[0, -0.06], [0.15, -0.06], [0.16, 0.0], [0.15, 0.06], [0.12, 0.09], [0, 0.095]], 8), 28).translate(cp.x, cp.y, cp.z), C.dark, M.gloss);
  KI.add(at(hring(0.158, 0.01, 0.0, 5, 28), cp.x, cp.y, cp.z));
  for (const sx of [1, -1]) K.add(at(rbox(0.035, 0.12, 0.12, 0.4, 6, 6), cp.x + sx * 0.1, cp.y + 0.1, cp.z), C.gunmetal, M.metal);
  const tb = cp.clone().add(new V3(0, 0.11, 0));
  K.add(orient(lathe(smoothProfile([[0, -0.06], [0.1, -0.06], [0.11, 0.0], [0.105, 0.2], [0.115, 0.24], [0.125, 0.27]], 10).concat([[0.108, 0.278], [0.085, 0.265], [0, 0.25]]), 24), cdir, tb), C.cream, M.gloss);
  K.add(orient(lathe([[0, 0.24], [0.086, 0.262], [0, 0.262]], 18), cdir, tb), C.darker, M.satin);
  KI.add(orient(hring(0.108, 0.014, 0.12, 5, 24), cdir, tb));
  KI.add(orient(hring(0.118, 0.008, 0.27, 5, 24), cdir, tb));
  const trun = latheZ([[0, -0.13], [0.03, -0.13], [0.03, 0.13], [0, 0.13]], 10); trun.rotateY(Math.PI / 2); K.add(at(trun, tb.x, tb.y, tb.z), C.metal, M.metal);
  const cannonMuzzle = tb.clone().addScaledVector(cdir, 0.278);
  // legs: 3 per side, stubby and chunky; hip pivots on the hull flanks; armoured femur up-out to a knee, tibia down to
  // a rubber-capped foot
  const legs = [];
  for (const sx of [1, -1]) [0.22, -0.06, -0.34].forEach((z0, idx) => {
    const B = new Parts(), BI = new Parts();
    const splay = (1 - idx) * 0.3;                                        // front legs reach forward, back legs back
    const hip = new V3(sx * 0.56, 0.6, z0), knee = new V3(sx * 0.8, 0.8, z0 + splay * 0.3), ankle = new V3(sx * 0.9, 0.2, z0 + splay * 0.65);
    const foot = new V3(sx * 0.93, 0.0, z0 + splay * 0.72);
    B.add(ball(0.105, hip.x, hip.y, hip.z, 10, 7), C.dark, M.gloss);
    B.add(sweep([hip, hip.clone().lerp(knee, 0.5).add(new V3(0, 0.04, 0)), knee], { seg: 6, radial: 10, capSteps: 2, radius: (t) => 0.092 - 0.012 * t, flat: 0.85, outward: () => new V3(0, 0, 1) }).geo, C.cream, M.gloss);
    BI.add(orient(hring(0.088, 0.014, 0, 4, 16), knee.clone().sub(hip), hip.clone().lerp(knee, 0.42).add(new V3(0, 0.022, 0))));
    B.add(ball(0.09, knee.x, knee.y, knee.z, 10, 7), C.dark, M.gloss);
    B.add(sweep([knee, knee.clone().lerp(ankle, 0.5).add(new V3(sx * 0.025, 0, 0)), ankle], { seg: 6, radial: 10, capSteps: 2, radius: (t) => 0.082 - 0.014 * t, flat: 0.9, outward: () => new V3(0, 0, 1) }).geo, C.cream, M.gloss);
    for (let k = 0; k < 2; k++) B.add(orient(hring(0.078 - k * 0.005, 0.0065, 0, 3, 12), ankle.clone().sub(knee), knee.clone().lerp(ankle, 0.55 + k * 0.1)), C.dark, M.satin);
    const fd = foot.clone().sub(ankle).normalize();
    B.add(orient(lathe(smoothProfile([[0, -0.04], [0.074, -0.03], [0.08, 0.04], [0.07, 0.11], [0.04, 0.18], [0, 0.205]], 7), 12), fd, ankle.clone().addScaledVector(fd, -0.005)), C.rubber, M.rubber);
    BI.add(orient(hring(0.077, 0.012, 0.0, 4, 16), fd, ankle.clone().addScaledVector(fd, 0.005)));
    for (const t of [0.3, 0.7]) screw(B, hip.clone().lerp(knee, t).add(new V3(0, 0.086, 0)), new V3(0, 1, 0), 0.012);
    legs.push({ body: B.build(), ink: BI.build(), at: hip.clone(), side: sx, index: idx });
  });
  // armoured ball (rolling mode): latitude bands about the X axis (roll axis) over a dark seam sphere, team equator
  // with cream chevrons, rivets, dark hub caps with bolt circles and team squid emblems
  const BP = new Parts(), BI = new Parts(), BR = 0.95;
  const ax = (g) => { g.rotateZ(-Math.PI / 2); g.translate(0, BR, 0); return g; };      // lathe +Y axis → +X, lifted
  BP.add(ax(lathe(sphZone(BR - 0.018, 0, -Math.PI / 2 + 0.01, Math.PI / 2 - 0.01, 22), 40)), C.darker, M.satin);
  for (const [e0, e1, kind] of [[-1.2, -0.64, 'c'], [-0.6, -0.2, 'c'], [-0.16, 0.16, 'i'], [0.2, 0.6, 'c'], [0.64, 1.2, 'c']]) {
    const pr = [], n = 9;
    for (let i = 0; i <= n; i++) { const e = e0 + (e1 - e0) * i / n, m = Math.min(i, n - i), edge = m === 0 ? 0.014 : m === 1 ? 0.003 : 0; pr.push([(BR - edge) * Math.cos(e), (BR - edge) * Math.sin(e)]); }
    const g = ax(lathe(pr, 44));
    if (kind === 'i') BI.add(g); else BP.add(g, C.cream, M.gloss);
    if (kind === 'c') for (let k = 0; k < 10; k++) { const a = (k + 0.5) * TAU / 10, e = (e0 + e1) / 2, d = new V3(Math.sin(e), Math.cos(e) * Math.cos(a), Math.cos(e) * Math.sin(a)); screw(BP, d.clone().multiplyScalar(BR).add(new V3(0, BR, 0)), d, 0.014); }
  }
  for (let k = 0; k < 8; k++) {
    const a = k * TAU / 8;
    for (const g0 of chevrons(0.26, 0.11, 2)) {
      const g = refine(g0, 0.04);
      deformG(g, (v) => { const R = BR + 0.003 + v.z, th = a + v.x / BR, ph = -v.y / BR; v.set(R * Math.sin(ph), BR + R * Math.cos(ph) * Math.sin(th), R * Math.cos(ph) * Math.cos(th)); });
      BP.add(g, C.cream, M.print);
    }
  }
  for (const sx of [1, -1]) {
    const hub = lathe(smoothProfile([[0, 0.965], [0.26, 0.955], [0.33, 0.93], [0.345, 0.9], [0.33, 0.88]], 8), 36); if (sx < 0) hub.rotateZ(Math.PI);
    hub.rotateZ(-Math.PI / 2); hub.translate(0, BR, 0); BP.add(hub, C.dark, M.gloss);
    for (let k = 0; k < 8; k++) { const a = k * TAU / 8; screw(BP, new V3(sx * 0.957, BR + Math.cos(a) * 0.26, Math.sin(a) * 0.26), new V3(sx, 0, 0), 0.016); }
    BI.add(placeXY(decal(squidShape(0.3), 0.005), new V3(0, 0, -sx), new V3(0, 1, 0), new V3(sx * 0.962, BR, 0)));
  }
  return {
    kind: 'crab', body: P.build(), ink: I.build(), legs,
    gun: { body: G.build(), ink: GI.build(), at: new V3(0, gy, gz0) },
    gunSpin: S.build(), gunSpinInk: SI.build(), gunSpinAt: new V3(0, gy, gz1), gunMuzzle: new V3(0, gy, gz1 + 0.325),
    cannon: { body: K.build(), ink: KI.build(), at: cp.clone() }, cannonMuzzle, cannonDir: cdir.clone(),
    seatAt: new V3(0, rimY - 0.74, hz), hatchY: rimY, hatchR: hr,
    ballBody: BP.build(), ballInk: BI.build(), ballR: BR,
    width: 2.0, height: rimY,
  };
}

// ---------------------------------------------------------------------------------------------- registry
const BUILDERS = { kraken: buildKraken, speaker: buildSpeaker, missile: buildMissile, jetpack: buildJetpack, crab: buildCrab };
export const SPECIAL_PROP_KINDS = Object.keys(BUILDERS);
const _cache = new Map();
/** Geometry set for a special's world prop (cached per kind; shared — do not dispose). Unknown kinds → null. */
export function getSpecialProp(kind) {
  if (!BUILDERS[kind]) return null;
  if (!_cache.has(kind)) _cache.set(kind, BUILDERS[kind]());
  return _cache.get(kind);
}
