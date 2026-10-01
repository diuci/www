// Sponge Mitts — the held model: a pair of squishy ink-soaked sponge boxing gloves (one per fist, dual wield), their
// part animation (each glove squashes on its own punch, both swell and glow while a leap charges, the left one flattens
// against the wall while clinging) and the procedural sponge material (pores + wet sheen in the team's ink).
//
// Weapon space (character-weapons.js): grip at the origin, +Z = the punching face, +Y = up (the thumb), X across.
// The squidkid fist closes round a vertical handle there (a vertical-fist punch), so the glove is modelled as a shell
// round the fist: pad from z ≈ -0.055 (behind the knuckles) to +0.08 (the face), cuff over the wrist behind it. The
// model is symmetric in X — the same geometry sits in both fists (`dual: true`), so nothing may favour one side.
import * as THREE from 'three';
import { superEllipsoid, lathe, smoothProfile } from '../character-geo.js';
import { registerWeaponModel, GEO_KIT } from '../character-weapons.js';

const { Parts, C, M, latheZ, torus, at, deformG, decal, placeXY, squidShape } = GEO_KIT;
const V3 = THREE.Vector3;
const gauss = (x, s) => Math.exp(-(x * x) / (2 * s * s));
const PAD_PIVOT = new V3(0, 0, -0.034);   // pad ↔ cuff seam: the pad squashes / swells about it

function buildMitts() {
  const P = new Parts(), I = new Parts(), PAD = new Parts();
  // ---- the pad: a fat rounded sponge mitt, flattened punching face, knuckle roll on top, tapering into the cuff
  const pad = superEllipsoid(0.071, 0.064, 0.077, 0.7, 0.66, 44, 32, (q) => {
    if (q.z > 0.031) q.z = 0.031 + (q.z - 0.031) * 0.72;                        // flatter punching face
    if (q.z < -0.02) { const t = Math.min(1, (-0.02 - q.z) / 0.057); q.x *= 1 - 0.14 * t; q.y *= 1 - 0.11 * t; }
    q.y += 0.007 * gauss(q.z - 0.04, 0.02) * Math.max(0, q.y / 0.064);           // knuckle roll
    q.x *= 1 + 0.05 * gauss(q.y + 0.01, 0.033) * gauss(q.z - 0.022, 0.044);        // a little belly on the flanks
  });
  PAD.add(at(pad, 0, 0.004, 0.02), C.cream);
  // thumb: lies along the top of the fist (vertical-fist grip → the thumb is on top), fused into the pad
  const thumb = superEllipsoid(0.024, 0.021, 0.041, 0.8, 0.78, 22, 14, (q) => {
    q.y -= 0.013 * ((q.z + 0.041) / 0.082) ** 2;                               // tip curls down onto the face
    q.x *= 1 - 0.18 * Math.max(0, q.z / 0.041);
  });
  thumb.rotateX(0.12);
  PAD.add(at(thumb, 0, 0.062, 0.012), C.cream);
  // ink welling out of the sponge: three fat drips hanging off the lower rim toward the cuff
  for (const [x, y, z, s] of [[0.032, -0.048, -0.03, 1], [-0.024, -0.054, -0.02, 0.8], [0.0, -0.061, -0.01, 0.9]]) {
    const d = superEllipsoid(0.0085 * s, 0.017 * s, 0.0085 * s, 0.9, 1, 10, 8, (q) => { if (q.y < 0) { const k = 1 + 0.35 * (-q.y / (0.017 * s)); q.x *= k; q.z *= k; } });
    PAD.add(at(d, x, y, z), C.cream);
  }
  // ---- cuff: a stubby cream sleeve over the wrist with a rolled opening; the forearm goes in through the back
  const cuff = latheZ(smoothProfile([
    [0.041, -0.03], [0.05, -0.036], [0.056, -0.05], [0.057, -0.09], [0.0595, -0.112], [0.0605, -0.122], [0.057, -0.128],
    [0.05, -0.126], [0.047, -0.118], [0.045, -0.09], [0.044, -0.05],
  ], 30), 30);
  P.add(cuff, C.cream, M.satin);
  // rolled rim + seam where the sponge meets the sleeve
  P.add(at(torus(0.0585, 0.0042, 6, 30), 0, 0, -0.123), C.bone, M.satin);
  P.add(at(torus(0.0532, 0.0038, 5, 30), 0, 0, -0.034), C.darker, M.satin);
  // wrist strap: dark rubber band round the sleeve, a velcro tab over the top, team-ink stripe near the rim
  P.add(at(latheZ(smoothProfile([[0.0572, -0.064], [0.0612, -0.066], [0.0618, -0.08], [0.0612, -0.094], [0.0572, -0.096]], 10), 30), 0, 0, 0), C.rubber, M.rubber);
  const tab = superEllipsoid(0.022, 0.0048, 0.018, 0.4, 0.45, 12, 5, (q) => { const r = 0.0615 + q.y; const a = q.x / 0.0615; q.x = Math.sin(a) * r; q.y = Math.cos(a) * r - 0.0615; });
  P.add(at(tab, 0, 0.0625, -0.08), C.dark, M.gloss);
  for (const sx of [1, -1]) P.add(at(superEllipsoid(0.0022, 0.0022, 0.0022, 1, 1, 6, 4), sx * 0.015, 0.0672, -0.08), C.metal, M.metal);
  I.add(at(torus(0.0588, 0.0026, 5, 30), 0, 0, -0.106));
  // squid badge on both flanks of the sleeve (x = ±, symmetric) + a hazard chevron pair under it
  for (const sx of [1, -1]) {
    const sq = decal(squidShape(0.026));
    placeXY(sq, new V3(0, 0, sx), new V3(0, 1, 0), new V3(sx * 0.0612, 0.004, -0.08));
    P.add(sq, C.decal, M.print);
  }
  // ---- inner grip bar (never seen: the fist closes round it) — kept tiny so the far LOD has no holes
  P.add(latheZ([[0, -0.03], [0.012, -0.03], [0.012, 0.03], [0, 0.03]], 8).rotateX(Math.PI / 2), C.darker, M.rubber);
  const padG = PAD.build();
  return {
    kind: 'mitts', body: P.build(), ink: I.build(),
    // the sponge pad is its own part (team sponge material near, merged into the ink far LOD)
    parts: { pad: { src: padG, pivot: PAD_PIVOT.clone(), mat: 'ink' } },
    muzzle: new V3(0, 0.006, 0.088),
    gripR: { pos: new V3(0, 0, 0), handZ: new V3(0, 1, 0), handY: new V3(0, 0, -1) },
    gripL: { pos: new V3(0, 0, 0), handZ: new V3(0, 1, 0), handY: new V3(0, 0, -1) },
    dual: true,
    twirl: new V3(0, 0, 0),
  };
}

// ---------------------------------------------------------------------------------------------- sponge material
// Team-ink sponge: Worley pores (two octaves, object space so they ride the squash) darken + roughen the surface and
// dent it (screen-space bump, faded out once pores get smaller than a pixel); a clear wet coat on top. uGlow = the
// leap charge (the sponge soaks the ink up and glows with it).
const SPONGE_FRAG_PARS = /* glsl */`
varying vec3 vSpP;
uniform float uGlow, uSoak;
vec3 spHash(vec3 p) {
  p = vec3(dot(p, vec3(127.1, 311.7, 74.7)), dot(p, vec3(269.5, 183.3, 246.1)), dot(p, vec3(113.5, 271.9, 124.6)));
  return fract(sin(p) * 43758.5453);
}
float spPore(vec3 p) {
  vec3 i = floor(p), f = fract(p); float d = 8.0;
  for (int z = -1; z <= 1; z++) for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec3 g = vec3(float(x), float(y), float(z));
    vec3 r = g + 0.1 + 0.8 * spHash(i + g) - f;
    d = min(d, dot(r, r));
  }
  return 1.0 - smoothstep(0.02, 0.17, d);
}
vec3 spPerturb(vec3 surf_pos, vec3 surf_norm, vec2 dHdxy, float fd) {
  vec3 sx = normalize(dFdx(surf_pos)), sy = normalize(dFdy(surf_pos));
  vec3 r1 = cross(sy, surf_norm), r2 = cross(surf_norm, sx);
  float det = dot(sx, r1) * fd;
  vec3 grad = sign(det) * (dHdxy.x * r1 + dHdxy.y * r2);
  return normalize(abs(det) * surf_norm - grad);
}
float spH = 0.0, spFade = 1.0;
`;
export function makeSpongeMaterial() {
  const m = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.34, metalness: 0, clearcoat: 0.7, clearcoatRoughness: 0.18, sheen: 0.5, sheenRoughness: 0.45, sheenColor: 0xffffff, name: 'iw-sponge' });
  const U = { uGlow: { value: 0 }, uSoak: { value: 1 } };
  m.userData.u = U;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSpP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSpP = position;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + SPONGE_FRAG_PARS)
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          vec3 q = vSpP * 92.0;
          spFade = 1.0 - smoothstep(0.35, 0.9, length(fwidth(q)));
          spH = (spPore(q) + 0.55 * spPore(q * 2.1 + 3.7)) * spFade;
          diffuseColor.rgb *= 1.0 - 0.42 * clamp(spH, 0.0, 1.0) * uSoak;
        }`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = min(1.0, roughnessFactor + 0.45 * clamp(spH, 0.0, 1.0));`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        normal = spPerturb(-vViewPosition, normal, vec2(dFdx(spH), dFdy(spH)) * 0.55, faceDirection);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += diffuse * uGlow * (0.55 + 0.45 * (1.0 - clamp(spH, 0.0, 1.0)));`);
  };
  m.customProgramCacheKey = () => 'iw-sponge-1';
  return m;
}

// ---------------------------------------------------------------------------------------------- part animation
// st: see character-weapons.js animateWeapon. The runner's kit state (kits/mitts.js) says what the gloves are doing.
const _white = new THREE.Color(1, 1, 1);
const pulse = (t, atk, dec) => (t < 0 ? 0 : t < atk ? t / atk : Math.exp(-(t - atk) * dec));
function spring(S, i, target, hz, zeta, dt) {   // exact damped spring (see character-weapons sprE)
  const w = Math.PI * 2 * hz, x0 = S[i] - target, v0 = S[i + 1];
  const wd = w * Math.sqrt(1 - zeta * zeta), e = Math.exp(-zeta * w * dt), c = Math.cos(wd * dt), sn = Math.sin(wd * dt), B = (v0 + zeta * w * x0) / wd;
  S[i] = e * (x0 * c + B * sn) + target; S[i + 1] = e * ((-zeta * w * x0 + wd * B) * c + (-zeta * w * B - wd * x0) * sn);
  return S[i];
}
function animateMitts(w, st) {
  const dt = Math.min(0.1, Math.max(0, st.dt || 0));
  if (!w.ms) { w.ms = new Float32Array(8); w.ms[0] = 1; w.ms[2] = 1; w.near = true; w.sponge = makeSpongeMaterial(); w.lastPunch = 99; }
  const S = w.ms, pad = w.parts && w.parts.pad;
  // near / far LOD (kit weapons animate themselves, LOD included)
  const near = st.near !== false;
  if (near !== w.near) {
    w.near = near;
    if (w.body) w.body.visible = near; if (w.ink) w.ink.visible = near;
    if (w.bodyFar) w.bodyFar.visible = !near; if (w.inkFar) w.inkFar.visible = !near;
    for (const g of w.partList || []) g.visible = near;
  }
  if (!pad) return;
  const mesh = pad.userData.mesh;
  if (mesh.material !== w.sponge) mesh.material = w.sponge;   // (setColor re-assigns 'ink' parts; take it back)
  const sp = w.sponge, U = sp.userData.u;
  sp.color.copy(st.color); sp.sheenColor.copy(st.color).lerp(_white, 0.5);
  const R = st.runner, K = R && R.kit && R.kit.mitts ? R.kit : null;
  const hand = st.hand || 0;
  const ts = R && R.sinceHand ? R.sinceHand[hand] : (st.sinceShoot ?? 99);
  // punch: the glove lands at full reach (~45 ms in): squash along the face, bulge round it, jiggle back
  if (ts < w.lastPunch) S[1] -= 7.5;                                      // (new punch this frame: kick the spring)
  w.lastPunch = ts;
  const charge = K && K.charging ? K.charge : 0;
  const cling = K && K.cling && hand === 1 ? 1 : 0;
  const leap = K && K.leaping ? 1 : 0;
  const land = K ? pulse(K.landT - 0.01, 0.02, 7) : 0;
  const wob = charge > 0 ? 0.022 * charge * Math.sin(st.t * (22 + 14 * charge) + hand * 1.7) : 0;
  const zT = 1 + 0.08 * charge - 0.3 * cling + 0.05 * leap - 0.28 * land + wob;
  const z = spring(S, 0, zT, charge > 0 ? 6 : 9, 0.3, dt);
  const xy = 1 + (1 - z) * 0.55 + 0.1 * charge + 0.06 * cling;
  pad.scale.set(xy, xy * (1 - 0.35 * cling * 0.5), Math.max(0.55, z));
  // glow: builds with the charge, flashes when a fist leaves, pulses at full charge
  const full = charge >= 0.999 ? 0.35 + 0.25 * Math.sin(st.t * 18) : 0;
  const g = 0.06 + 1.1 * charge * charge + full + 1.4 * pulse(ts - 0.005, 0.01, 20) + 0.8 * land;
  S[4] += (g - S[4]) * (1 - Math.exp(-dt * 30));
  U.uGlow.value = S[4];
  U.uSoak.value = 1 - 0.4 * charge;
}

registerWeaponModel('mitts', buildMitts, animateMitts);
export { buildMitts };
