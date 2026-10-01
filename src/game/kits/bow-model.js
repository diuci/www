// Tideline Bow — procedural recurve bow held by squidkids, its part animation and its loadout / HUD icon.
//
// Weapon space (see character-weapons.js): the ORIGIN is the nock on the string, held in the right fist (gripR);
// +Z = the arrows' flight, +Y = up, character's right = -X. At rest (braced) the string runs straight through the
// nock and the riser's grip sits `brace` in front of it, where the left fist holds it (gripL). The bow is authored
// upright; character.js (_poseBow) cants the whole weapon onto its side on the ground so the fan reads flat.
//
// Drawing (animate): character.js pulls the right fist back along the arrow by drawLen × draw (w.bowDraw) and this
// file slides the whole bow forward in weapon space by the same amount (the `off` group), so in the world the bow and
// the left hand stay put while the string hand draws. What rides the fist instead — the string's nock and the three
// nocked arrows — is moved back by the same amount. The limbs flex with the string. On the release the string snaps
// home and rings while the fist follows through, the arrows vanish (they're in the air) and a new trio nocks in.
// The two glow rings on the riser light at ring 1 and at full draw (coil material, aSeg 0.45 / 1.0); the arrowheads
// glow brighter at each ring.
import * as THREE from 'three';
import { registerWeaponModel, GEO_KIT } from '../character-weapons.js';
import { superEllipsoid, sweep } from '../character-geo.js';
import { WEAPONS } from '../../config.js';
import { WEAPON_ICONS } from '../../ui/ui-icons.js';

const { Parts, C, M, latheZ, torus, at } = GEO_KIT;
const V3 = THREE.Vector3;

const BRACE = 0.1;                   // riser grip → string at rest (m)
const DRAW = 0.22;                   // how far the fist pulls the nock back at full draw
const FLEX = 0.3;                    // limb bend at full draw (rad, about each limb's root)
const FAN = 0.075;                   // nocked arrows' fan (rad between neighbours; the flight fan is in bow.js)
const TIP_U = new V3(0, 0.382, 0), TIP_L = new V3(0, -0.407, 0);       // string ends on the limb tips (at rest)
const ROOT_U = new V3(0, 0.165, 0.118), ROOT_L = new V3(0, -0.19, 0.118); // limb roots in the riser pockets
const ARROW = 0.5;                   // nocked arrow length (nock → tip)
const INK = C.white;                 // (ink parts ignore the vertex colour; the team gloss material paints them)

function sweepY(pts, r, flat, extra = {}) {
  return sweep(pts.map((p) => new V3(p[0], p[1], p[2])), { seg: 22, radial: 12, capSteps: 3, radius: r, flat, outward: (P, o) => o.set(1, 0, 0), ...extra }).geo;
}
function part(P, pivot, mat = 'body', lamp = null) { return { src: P.build(), pivot: pivot.clone(), mat, lamp }; }

// one limb (sign +1 upper, -1 lower): the centreline leaves the riser pocket, bends back toward the archer and curls
// away again at the tip (the recurve); the string touches the belly where the curl starts (TIP_*)
function limbPts(sign) {
  const y0 = sign > 0 ? ROOT_U.y : ROOT_L.y;
  const prof = [[0, 0.118], [0.06, 0.104], [0.115, 0.07], [0.16, 0.032], [0.196, 0.0105], [0.217, 0.0052], [0.234, 0.013], [0.247, 0.036]];
  return prof.map(([dy, z]) => [0, y0 + sign * dy, z]);
}

function buildBow() {
  const P = new Parts(), I = new Parts(), GL = new Parts();
  const LU = new Parts(), LUI = new Parts(), LL = new Parts(), LLI = new Parts();
  const SU = new Parts(), SL = new Parts(), AR = new Parts(), HD = new Parts(), FL = new Parts();
  const B = BRACE, RX = -0.013;   // the riser body sits to the right of the arrows (they pass its left flank)
  // ---- riser: a chunky cream body (upper + lower blocks) with the rubber grip between, a windowed ink tank in the
  // upper block, the arrow shelf and a sight pin on the left flank
  P.add(at(superEllipsoid(0.0125, 0.086, 0.025, 0.42, 0.5, 12, 14, (q) => { q.z += 0.012 * (q.y / 0.086) ** 2; }), RX, 0.084, B + 0.018), C.cream, M.gloss);
  P.add(at(superEllipsoid(0.0135, 0.058, 0.023, 0.42, 0.5, 12, 12, (q) => { q.z += 0.01 * ((q.y + 0.058) / 0.116) ** 2 - 0.004; }), 0, -0.14, B + 0.018), C.cream, M.gloss);
  // ink tank window: the capsule shows through both flanks of the upper block
  I.add(at(superEllipsoid(0.0152, 0.044, 0.0142, 0.9, 1, 10, 12), RX, 0.1, B + 0.0185), INK);
  for (const y of [0.052, 0.148]) P.add(at(superEllipsoid(0.0142, 0.0035, 0.0155, 0.5, 0.6, 10, 4), RX, y, B + 0.02), C.dark, M.satin);
  // rubber grip (the left fist's handle) + thumb shelf / throat
  P.add(sweepY([[0, -0.092, B + 0.005], [0, -0.068, B + 0.001], [0, -0.045, B - 0.001], [0, -0.022, B + 0.001], [-0.004, -0.004, B + 0.006]], () => 0.0148, 0.86), C.rubber, M.rubber);
  P.add(at(superEllipsoid(0.0165, 0.005, 0.02, 0.5, 0.6, 10, 5), RX * 0.5, -0.001, B + 0.012), C.dark, M.satin);
  // arrow shelf (a cream ledge the three shafts ride over) + strike plate
  P.add(at(superEllipsoid(0.012, 0.0032, 0.017, 0.45, 0.5, 8, 4), -0.006, -0.0085, B + 0.01), C.cream, M.gloss);
  P.add(at(superEllipsoid(0.0018, 0.012, 0.012, 0.5, 0.6, 5, 6), RX + 0.0118, 0.012, B + 0.012), C.gunmetal, M.metal);
  // limb pockets (the limbs bolt in here) + bolts
  for (const [y, s] of [[0.166, 1], [-0.19, -1]]) {
    P.add(at(superEllipsoid(0.0175, 0.022, 0.021, 0.45, 0.55, 10, 8), RX * 0.4, y - s * 0.004, B + 0.026), C.dark, M.satin);
    const bolt = latheZ([[0, -0.004], [0.0058, -0.004], [0.0062, 0.001], [0, 0.002]], 10); bolt.rotateY(Math.PI / 2);
    for (const sx of [1, -1]) { const b = bolt.clone(); if (sx < 0) b.rotateY(Math.PI); P.add(at(b, RX * 0.4 + sx * 0.0175, y, B + 0.026), C.metal, M.metal); }
  }
  // stabiliser: a short rod forward off the lower block, with an ink-capped end weight
  P.add(at(latheZ([[0, 0], [0.004, 0], [0.004, 0.11], [0, 0.11]], 8), 0, -0.13, B + 0.035), C.gunmetal, M.metal);
  P.add(at(latheZ(_smooth([[0, 0], [0.0095, 0.002], [0.0108, 0.014], [0.0095, 0.028], [0, 0.03]]), 12), 0, -0.13, B + 0.14), C.dark, M.gloss);
  I.add(at(latheZ([[0, 0], [0.011, 0], [0.011, 0.005], [0, 0.005]], 12), 0, -0.13, B + 0.152), INK);
  // sight pin on the left flank (a small ring with a bead)
  const ring = torus(0.0095, 0.0018, 5, 16); ring.rotateY(Math.PI / 2); P.add(at(ring, 0.02, 0.05, B + 0.05), C.dark, M.satin);
  P.add(at(superEllipsoid(0.0035, 0.004, 0.022, 0.6, 0.6, 5, 5), 0.009, 0.05, B + 0.034), C.dark, M.satin);
  P.add(at(superEllipsoid(0.0024, 0.0024, 0.0024, 1, 1, 6, 5), 0.02, 0.05, B + 0.05), C.hazard, M.led);
  // charge bands round the upper block: the lower one lights at ring 1, the upper one at full draw
  for (const y of [0.158, 0.137]) GL.add(at(superEllipsoid(0.0152, 0.0045, 0.0282, 0.5, 0.5, 10, 4), RX, y, B + 0.018 + 0.012 * ((y - 0.084) / 0.086) ** 2), '#ffffff');
  // ---- limbs: team-ink laminate, cream tip caps with a string groove
  for (const [sign, LB, LI] of [[1, LU, LUI], [-1, LL, LLI]]) {
    const pts = limbPts(sign);
    LI.add(sweepY(pts, (t) => 0.0088 - 0.0036 * t, (t) => 2.7 - 1.0 * t), INK);
    LB.add(sweepY(pts.slice(0, 2).concat([[0, pts[0][1] + sign * 0.085, 0.092]]), () => 0.0094, 2.75, { seg: 8 }), C.dark, M.satin);   // the root shoe in the pocket
    const tip = pts[pts.length - 1], pre = pts[pts.length - 2];
    const cap = superEllipsoid(0.0105, 0.0125, 0.0068, 0.55, 0.6, 8, 6);
    cap.rotateX(-Math.atan2(tip[2] - pre[2], Math.abs(tip[1] - pre[1])) * sign);
    LB.add(at(cap, 0, tip[1] + sign * 0.001, tip[2] + 0.001), C.cream, M.gloss);
    LB.add(at(superEllipsoid(0.0108, 0.0022, 0.0072, 0.6, 0.6, 8, 4), 0, tip[1] - sign * 0.009, tip[2] - 0.004), C.dark, M.satin);
  }
  // ---- string (two halves from the nock to the tips) — cream bowstring, dark centre serving, brass nock beads
  for (const [S, tip, s] of [[SU, TIP_U, 1], [SL, TIP_L, -1]]) {
    const L = Math.abs(tip.y);
    const g = new THREE.CylinderGeometry(0.0021, 0.0021, L, 6, 1); g.translate(0, s * L / 2, 0);
    S.add(g, C.bone, M.satin);
    const sv = new THREE.CylinderGeometry(0.003, 0.003, 0.045, 6, 1); sv.translate(0, s * 0.0225, 0);
    S.add(sv, C.darker, M.rubber);
    S.add(at(superEllipsoid(0.0038, 0.0028, 0.0038, 1, 1, 8, 5), 0, s * 0.012, 0), '#d8a640', M.metal);
  }
  // ---- three nocked ink arrows fanned in the bow's plane: ink shafts, glowing ink-bulb heads, fletching + nocks
  for (const a of [FAN, 0, -FAN]) {
    const sh = latheZ([[0, -0.004], [0.0052, -0.004], [0.0052, ARROW - 0.06], [0, ARROW - 0.06]], 8); sh.rotateX(-a); AR.add(sh, INK);
    const hd = latheZ(_smooth([[0, ARROW - 0.068], [0.0075, ARROW - 0.06], [0.0132, ARROW - 0.041], [0.011, ARROW - 0.019], [0.005, ARROW - 0.005], [0, ARROW]]), 12);
    hd.rotateX(-a); HD.add(hd, '#ffffff', M.gloss);
    const nk = latheZ([[0, -0.015], [0.006, -0.015], [0.0062, 0.003], [0, 0.003]], 8); nk.rotateX(-a); FL.add(nk, C.darker, M.satin);
    for (let k = 0; k < 3; k++) {
      const v = superEllipsoid(0.0009, 0.0072, 0.022, 0.8, 0.5, 4, 6, (q) => { q.y *= 0.75 + 0.25 * (q.z + 0.022) / 0.044; });
      v.translate(0, 0.0118, 0); v.rotateZ((k / 3) * Math.PI * 2 + 0.5); v.translate(0, 0, 0.04); v.rotateX(-a);
      FL.add(v, k === 0 ? C.hazard : C.white, M.satin);
    }
  }
  // glow: per-vertex aSeg thresholds (makeCoilMaterial lights each band as the charge passes it)
  const glow = GL.build();
  {
    const pz = glow.attributes.position, seg = new Float32Array(pz.count);
    for (let i = 0; i < pz.count; i++) seg[i] = pz.getY(i) < 0.1475 ? 0.45 : 1.0;
    glow.setAttribute('aSeg', new THREE.Float32BufferAttribute(seg, 1));
  }
  return {
    kind: 'bow', body: P.build(), ink: I.build(), glow, drawLen: DRAW, brace: BRACE,
    parts: {
      limbU: part(LU, ROOT_U), limbUInk: part(LUI, ROOT_U, 'ink'), limbL: part(LL, ROOT_L), limbLInk: part(LLI, ROOT_L, 'ink'),
      stringU: part(SU, new V3()), stringL: part(SL, new V3()),
      arrows: part(AR, new V3(), 'ink'), fletch: part(FL, new V3()),
      heads: part(HD, new V3(), 'lamp', { color: '#1b1e25', emissive: '#ffffff', intensity: 0.4, roughness: 0.2 }),
    },
    muzzle: new V3(0, 0, B + 0.08),
    gripR: { pos: new V3(0, 0, 0), handZ: new V3(0, 1, 0), handY: new V3(0, 0.12, -1) },
    gripL: { pos: new V3(0, -0.047, B - 0.001), handZ: new V3(0, 1, 0), handY: new V3(0, -0.12, -1) },
  };
}
function _smooth(ctrl, n = 14) {
  const c = new THREE.SplineCurve(ctrl.map(([r, y]) => new THREE.Vector2(r, y)));
  return c.getSpacedPoints(n).map((p) => [Math.max(0, p.x), p.y]);
}

// ---------------------------------------------------------------------------------------------- animation
const _v = new V3(), _v2 = new V3(), UPV = new V3(0, 1, 0), DNV = new V3(0, -1, 0), _white = new THREE.Color(1, 1, 1);
const RING1 = WEAPONS.bow?.ring1 ?? 0.45;
function tipAt(tip, root, th, out) {
  const dy = tip.y - root.y, dz = tip.z - root.z, c = Math.cos(th), s = Math.sin(th);
  return out.set(tip.x, root.y + dy * c - dz * s, root.z + dy * s + dz * c);
}
function aimString(g, nock, tip, dirRest, L) {
  _v2.subVectors(tip, nock); const len = _v2.length() || 1e-4;
  g.position.copy(nock); g.quaternion.setFromUnitVectors(dirRest, _v2.multiplyScalar(1 / len)); g.scale.set(1, len / L, 1);
}
function animateBow(w, st) {
  const d = w.def, P = w.parts, t = st.t, dt = Math.min(0.1, Math.max(0, st.dt || 0));
  let s = w.bw;
  if (!s) {
    s = w.bw = { rest: w.off.position.clone(), ax: new V3(0, 0, 1).applyQuaternion(w.off.quaternion), str: 0, strV: 0, loose: false, lastRel: 99, glow: 0.4 };
    w.pump = 0; w.trig = 0;
  }
  const R = st.runner;
  const hand = Math.max(0, w.bowDraw ?? 0);
  const drawing = R ? !!R.charging : (st.charge || 0) > 0.01;
  const c = R ? (R.charge || 0) : (st.charge || 0);
  // the bow rides forward by the fist's draw (so it stays put in the world)
  w.off.position.copy(s.rest).addScaledVector(s.ax, d.drawLen * hand);
  // string: rides the fist while drawing; loosed, it snaps home and rings, then waits for the fist to come back
  const rel = st.sinceRelease ?? 99;
  if (rel < s.lastRel - 1e-4) { s.loose = true; s.strV = 0; }
  s.lastRel = rel;
  if (drawing) s.loose = false;
  if (s.loose) {
    const om = Math.PI * 2 * 15, z = 0.3;   // exact underdamped spring toward 0
    const wd = om * Math.sqrt(1 - z * z), e = Math.exp(-z * om * dt), co = Math.cos(wd * dt), sn = Math.sin(wd * dt);
    const x0 = s.str, v0 = s.strV, Bq = (v0 + z * om * x0) / wd;
    s.str = e * (x0 * co + Bq * sn); s.strV = e * ((-z * om * x0 + wd * Bq) * co + (-z * om * Bq - wd * x0) * sn);
    s.str = Math.max(-0.16, s.str);
    if (rel > 0.3 && hand < 0.03 && Math.abs(s.str) < 0.02) s.loose = false;
  } else { s.str = hand; s.strV = 0; }
  // limbs flex with the string
  const phi = FLEX * Math.min(1.05, Math.max(-0.2, s.str));
  P.limbU.rotation.x = -phi; P.limbUInk.rotation.x = -phi; P.limbL.rotation.x = phi; P.limbLInk.rotation.x = phi;
  // string halves from the nock to the flexed tips
  _v.set(0, 0, -d.drawLen * s.str);
  const nock = _v;
  const tu = tipAt(TIP_U, ROOT_U, -phi, new V3()), tl = tipAt(TIP_L, ROOT_L, phi, new V3());
  aimString(P.stringU, nock, tu, UPV, Math.abs(TIP_U.y));
  aimString(P.stringL, nock, tl, DNV, Math.abs(TIP_L.y));
  // nocked arrows: gone on the release (they're flying), a fresh trio nocks in a beat later
  const show = drawing ? 1 : rel < 0.3 ? 0 : Math.min(1, (rel - 0.3) / 0.12);
  for (const g of [P.arrows, P.heads, P.fletch]) {
    g.position.copy(nock); g.scale.setScalar(Math.max(0.001, show)); g.visible = show > 0.01;
  }
  // glow: heads brighten at each ring; the riser's rings light in turn (coil material)
  const ring = c >= 0.999 ? 2 : c >= RING1 ? 1 : 0;
  const want = drawing ? 0.35 + 1.4 * c + (ring >= 1 ? 1.4 : 0) + (ring === 2 ? 2.2 + 0.9 * Math.sin(t * 30) : 0) : 0.35;
  s.glow += (want - s.glow) * (1 - Math.exp(-dt * 18));
  const hm = P.heads.userData.mesh.material;
  const col = st.color || _white;
  hm.color.copy(col).multiplyScalar(0.55); hm.emissive.copy(col); hm.emissiveIntensity = s.glow + 5 * (st.chargeFlash || 0);
  if (w.coil) {
    const u = w.coil.userData.u;
    u.uCharge.value = drawing ? c : 0; u.uFull.value = drawing && ring === 2 ? 1 : 0; u.uFlash.value = st.chargeFlash || 0; u.uTime.value = t;
  }
}

registerWeaponModel('bow', buildBow, animateBow);

// ---------------------------------------------------------------------------------------------- icon
// (same kit as ui-icons.js: 64² box, ink outline, dark / light plastic, team ink = currentColor, white glints)
const K = '#15121c', DK = '#2b2735', LT = '#e4e8ef';
const O = `stroke="${K}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"`;
WEAPON_ICONS.bow = (() => {
  // bow upright on the left (string at x 15, riser at x 27), three ink arrows fanning out to the right
  const tips = [-12, 0, 12].map((dy) => { const x = 55, y = 32 + dy, a = Math.atan2(dy, x - 14) * 180 / Math.PI; return { x, y, a }; });
  const shafts = tips.map((t) => `<path d="M14 32 L${t.x} ${t.y}" stroke="${K}" stroke-width="7" stroke-linecap="round"/>`).join('')
    + tips.map((t) => `<path d="M14 32 L${t.x} ${t.y}" stroke="currentColor" stroke-width="3.2" stroke-linecap="round"/>`).join('');
  const heads = tips.map((t) => `<ellipse cx="${t.x}" cy="${t.y}" rx="6.6" ry="4.6" transform="rotate(${t.a.toFixed(1)} ${t.x} ${t.y})" fill="currentColor"/>`).join('');
  const vanes = tips.map((t) => { const r = (t.a * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r), x0 = 16 + 3 * c, y0 = 32 + 3 * s;
    const P = (u, v) => `${(x0 + u * c - v * s).toFixed(1)} ${(y0 + u * s + v * c).toFixed(1)}`;
    return `<path d="M${P(0, 0)} L${P(6.5, -4.2)} L${P(8.5, 0)} Z M${P(0, 0)} L${P(6.5, 4.2)} L${P(8.5, 0)} Z" fill="#fff" stroke-width="2"/>`; }).join('');
  return `<svg class="iw-ico " viewBox="0 0 64 64" aria-hidden="true">
    <path d="M15 6.5 L15 57.5" stroke="${K}" stroke-width="2.2"/>
    <path d="M27 22 Q26.5 9 15 6 L19.5 2.2 M27 42 Q26.5 55 15 58 L19.5 61.8" fill="none" stroke="${K}" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M27 22 Q26.5 9 15 6 L19.5 2.2 M27 42 Q26.5 55 15 58 L19.5 61.8" fill="none" stroke="currentColor" stroke-width="4.4" stroke-linecap="round" stroke-linejoin="round"/>
    <g ${O}>
      <path d="M22.5 22 Q22.5 17 27.5 17 Q33 17 33 22.5 L33 41.5 Q33 47 27.5 47 Q22.5 47 22.5 42 Z" fill="${LT}"/>
      <rect x="22.5" y="29.5" width="10.5" height="10.5" rx="3" fill="${DK}"/>
    </g>
    ${shafts}
    <g ${O}>${heads}${vanes}</g>
    <path d="M25.5 21.5 L25.5 26" stroke="#fff" stroke-opacity=".75" stroke-width="2.4" stroke-linecap="round"/>
    ${tips.map((t) => `<circle cx="${(t.x - 1.6).toFixed(1)}" cy="${(t.y - 1.4).toFixed(1)}" r="1.5" fill="#fff" fill-opacity=".65"/>`).join('')}
  </svg>`;
})();
