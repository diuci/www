// INKWAVE — HULLBREAKER materials.
//
// Five MeshPhysicalMaterials patched with onBeforeCompile, all reading the per-vertex aM = (class, param, ao, extra)
// written by bossModelGeo.js and one shared uniform block U (so a single write drives every material):
//   steel  (double-sided) 0 painted corrugated wall (param = panel id, extra 1 = tear flap, 2 = torn petal)
//                         1 frame paint · 2 bare/rusty steel (chain, bars) · 3 brass nozzle (param 1 = bore)
//                         5 barnacle · 6 wood (deck / crate) · 7 ink barrel · 8 cast-iron anchor
//   cara                  0 carapace (param = tone 0 top … 1 underside/tip; extra: crusher glow weight, 10+t/11+t/12+t leg
//                         segments, 2+v antenna) · 1 spine / dactyl tip · 2 teeth · 3 barnacle
//   flesh                 0 membrane · 1 belly segment · 2 abdomen · 3 siphon
//   eye                   aM = (side, local unit direction) → iris / slit pupil / spiral (stun) / X (dead)
//   junk  (double-sided) 0 tyre rubber · 1 rope · 2 plastic (param 0 buoy, 1 life ring) · 3 strap · 4 kelp · 5 flag · 6 lamp
import * as THREE from 'three';

export function makeUniforms() {
  return {
    uTime: { value: 0 }, uInk: { value: new THREE.Color('#2f5bff') }, uWeak: { value: new THREE.Color('#ff8a14') },
    uFlash: { value: 0 }, uWeakFlash: { value: 0 }, uCrack: { value: 0 }, uOpen: { value: 0 }, uEnrage: { value: 0 },
    uGlowL: { value: 0 }, uCannon: { value: 0 }, uBelly: { value: 0 }, uEyeMode: { value: 0 }, uEyeSpin: { value: 0 },
    uEyeGlow: { value: 1 }, uDrip: { value: 0.6 }, uStencil: { value: null }, uLamp: { value: 1 }, uHeat: { value: 0 },
    uContInv: { value: new THREE.Matrix4() }, uAO: { value: 1 },
  };
}

const COMMON = /* glsl */`
uniform float uTime; uniform vec3 uInk; uniform vec3 uWeak; uniform float uFlash; uniform float uWeakFlash;
uniform float uCrack; uniform float uOpen; uniform float uEnrage; uniform float uGlowL; uniform float uCannon; uniform float uBelly;
uniform float uEyeMode; uniform float uEyeSpin; uniform float uEyeGlow; uniform float uDrip; uniform float uLamp; uniform float uHeat;
uniform mat4 uContInv; uniform float uAO;
varying vec4 vM; varying vec3 vB; varying vec2 vU;
float bHash(vec3 p){ p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3)); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float bNoise(vec3 x){ vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(bHash(i), bHash(i + vec3(1,0,0)), f.x), mix(bHash(i + vec3(0,1,0)), bHash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(bHash(i + vec3(0,0,1)), bHash(i + vec3(1,0,1)), f.x), mix(bHash(i + vec3(0,1,1)), bHash(i + vec3(1,1,1)), f.x), f.y), f.z); }
float bFbm(vec3 p){ return 0.52 * bNoise(p) + 0.3 * bNoise(p * 2.13 + 7.1) + 0.18 * bNoise(p * 4.37 + 3.7); }
float bH2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
float bN2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(bH2(i), bH2(i + vec2(1, 0)), f.x), mix(bH2(i + vec2(0, 1)), bH2(i + vec2(1, 1)), f.x), f.y); }
// voronoi border distance (F2 − F1), 2D
float bVoro(vec2 p){ vec2 n = floor(p), f = fract(p); float d1 = 8.0, d2 = 8.0;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) { vec2 g = vec2(float(i), float(j)); vec2 o = vec2(bH2(n + g), bH2(n + g + 17.3)); vec2 r = g + o - f; float d = dot(r, r);
    if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d; }
  return sqrt(d2) - sqrt(d1); }
float bVoro3(vec3 p){ return bVoro(p.xy * 0.8 + p.z * 0.6) ; }
float bAA(float x){ return max(fwidth(x), 1e-4); }
float bLine(float d, float w){ float a = bAA(d); return 1.0 - smoothstep(w - a, w + a, d); }
vec3 bBumpN(vec3 n, float h, vec3 pos){
  vec3 dpx = dFdx(pos), dpy = dFdy(pos); vec3 r1 = cross(dpy, n), r2 = cross(n, dpx); float det = dot(dpx, r1);
  vec3 g = sign(det) * (dFdx(h) * r1 + dFdy(h) * r2); return abs(det) > 1e-14 ? normalize(abs(det) * n - g) : n; }
vec3 bLin(vec3 c){ return pow(c, vec3(2.2)); }
// bind-space occlusion from the big masses: under the container floor, inside it, under the crab's head
float bMassAO(vec3 p){
  vec3 q = (uContInv * vec4(p, 1.0)).xyz;
  float fx = 1.0 - smoothstep(1.0, 1.9, abs(q.x)), fz = 1.0 - smoothstep(2.8, 3.7, abs(q.z));
  float below = max(0.0, -1.3 - q.y);
  float under = fx * fz * (q.y < -1.25 ? exp(-below * 0.55) : 0.0);
  float inside = step(abs(q.x), 1.2) * step(abs(q.z), 2.98) * step(abs(q.y), 1.28) * (1.0 - smoothstep(2.3, 3.05, q.z));
  float head = (1.0 - smoothstep(0.9, 1.6, abs(p.x))) * smoothstep(1.9, 1.3, p.y) * smoothstep(0.6, 1.6, p.z) * (1.0 - smoothstep(3.2, 4.2, p.z));
  return clamp(1.0 - 0.62 * under - 0.6 * inside - 0.35 * head, 0.12, 1.0);
}
`;

const VERT_DECL = 'attribute vec4 aM;\nvarying vec4 vM; varying vec3 vB; varying vec2 vU;\n';
const VERT_BODY = '#include <begin_vertex>\n vM = aM; vB = position; vU = uv;\n';

// every material funnels its procedural result through these locals, then the stock chunks consume them
const PRE = /* glsl */`
  float bRough = roughness, bMetal = metalness, bBumpH = 0.0, bCC = 0.0, bCCR = 0.2, bSheen = 0.0; vec3 bEmis = vec3(0.0); vec3 bSheenC = vec3(1.0);
  float bAO = mix(1.0, bMassAO(vB) * mix(1.0, vM.z, 0.85), uAO);
  vec3 bRimC = vec3(0.0); float bRimP = 3.0;
`;
function patch(mat, U, body, { extraFrag = '' } = {}) {
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = VERT_DECL + sh.vertexShader.replace('#include <begin_vertex>', VERT_BODY);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D uStencil;\n' + COMMON + extraFrag)
      .replace('#include <color_fragment>', '#include <color_fragment>\n' + PRE + body)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n roughnessFactor = bRough;')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n metalnessFactor = bMetal;')
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n normal = bBumpN(normal, bBumpH, -vViewPosition);')
      .replace('#include <clearcoat_normal_fragment_maps>', '#include <clearcoat_normal_fragment_maps>\n#ifdef USE_CLEARCOAT\n clearcoatNormal = normal;\n#endif')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += bEmis + bRimC * pow(1.0 - abs(dot(normal, normalize(vViewPosition))), bRimP);')
      .replace('#include <aomap_fragment>', '#include <aomap_fragment>\n reflectedLight.indirectDiffuse *= bAO; reflectedLight.indirectSpecular *= mix(bAO, 1.0, 0.25);')
      .replace('#include <lights_physical_fragment>', `#include <lights_physical_fragment>
#ifdef USE_CLEARCOAT
 material.clearcoat = bCC; material.clearcoatRoughness = clamp(bCCR, 0.03, 1.0);
#endif
#ifdef USE_SHEEN
 material.sheenColor = bSheenC * bSheen;
#endif
`);
  };
  mat.customProgramCacheKey = () => 'hullbreaker-' + mat.name;
  return mat;
}

// flash rim shared by all: whole-body white pop on damage
const FLASH = /* glsl */`
  bEmis += vec3(1.0, 0.97, 0.92) * uFlash * 0.07; bRimC += vec3(1.0, 0.97, 0.92) * uFlash * 1.1; bRimP = min(bRimP, 2.0);
`;

// ------------------------------------------------------------------------------------------------ steel
const STEEL = /* glsl */`
  float cls = floor(vM.x + 0.5), pid = floor(vM.y + 0.5), ao = vM.z, ex = floor(vM.w + 0.5);
  vec3 P = vB; vec2 uv = vU;
  float n1 = bFbm(P * 0.9 + 1.7), n2 = bFbm(P * 5.5 + 3.1), n3 = bNoise(P * 29.0);
  bool inner = !gl_FrontFacing && cls < 1.5 && (pid < 4.5 || cls > 0.5);
  bool backLeaf = !gl_FrontFacing && cls < 0.5 && pid > 4.5;
  vec3 c = vec3(0.5);
  vec3 RUST = vec3(0.24, 0.066, 0.02), RUSTD = vec3(0.065, 0.02, 0.008), PRIMER = vec3(0.25, 0.24, 0.215), BARE = vec3(0.3, 0.32, 0.34);
  if (cls < 1.5) {
    // ---------------- painted panels / frame
    vec3 paint = cls < 0.5 ? vec3(0.04, 0.26, 0.23) : vec3(0.022, 0.1, 0.095);
    vec3 faded = cls < 0.5 ? vec3(0.2, 0.46, 0.41) : vec3(0.07, 0.2, 0.19);
    float fade = smoothstep(0.35, 0.8, n1) * 0.55 + smoothstep(-0.2, 1.6, P.y - 3.3) * 0.35;
    c = mix(paint, faded, clamp(fade, 0.0, 1.0));
    c *= 0.9 + 0.2 * bNoise(P * 3.0);
    bool wall = cls < 0.5 && (pid < 4.5 || pid > 4.5 && pid < 8.5);
    float H = 2.36;
    // wear: bottom, top rail line, edges of panels, torn petals, flaps' rim
    float edgeW = 0.0;
    if (wall) edgeW = max(smoothstep(0.55, 0.0, uv.y), smoothstep(H - 0.25, H, uv.y) * 0.7);
    if (cls > 0.5) edgeW = 0.55;
    if (ex > 1.5) edgeW = 1.0;
    // stencils (paint on top of paint: chipped with it)
    float st = 0.0; vec3 stC = vec3(0.8, 0.77, 0.66);
    if (wall) {
      vec2 a = vec2(-1.0);
      if (pid < 1.5) a = vec2((uv.x - 1.2) / 4.0, (uv.y - 1.24) / 1.0);                 // left wall logo
      else if (pid < 2.5) a = vec2((uv.x - 0.65) / 4.0, (uv.y - 1.24) / 1.0);            // right wall logo
      if (a.x > 0.0 && a.x < 1.0 && a.y > 0.0 && a.y < 1.0) st = texture2D(uStencil, vec2(a.x, 0.5 + a.y * 0.5)).a;
      if (pid > 2.5 && pid < 3.5) {                                                      // rear wall: code + placard
        vec2 b = vec2((uv.x - 0.12) / 1.2, (uv.y - 1.72) / 0.6);
        if (b.x > 0.0 && b.x < 1.0 && b.y > 0.0 && b.y < 1.0) st = texture2D(uStencil, vec2(b.x * 0.5, b.y * 0.5)).a;
        vec2 d = vec2((uv.x - 1.42) / 0.62, (uv.y - 0.92) / 0.62);
        if (d.x > 0.0 && d.x < 1.0 && d.y > 0.0 && d.y < 1.0) { vec4 pl = texture2D(uStencil, vec2(0.5 + d.x * 0.25, d.y * 0.5)); st = pl.a; stC = mix(vec3(0.85, 0.62, 0.05), vec3(0.03), pl.r); }
      }
      if (pid > 4.5 && pid < 6.5) {                                                      // door leaves: code
        vec2 b = vec2((uv.x - 0.08) / 1.05, (uv.y - 1.62) / 0.52);
        if (b.x > 0.0 && b.x < 1.0 && b.y > 0.0 && b.y < 1.0) st = texture2D(uStencil, vec2(b.x * 0.5, b.y * 0.5)).a;
      }
      if (pid > 1.5 && pid < 2.5) {                                                      // right wall: sprayed warning
        vec2 d = vec2((uv.x - 2.2) / 1.35, (uv.y - 0.3) / 0.68);
        if (d.x > 0.0 && d.x < 1.0 && d.y > 0.0 && d.y < 1.0) { float sp = texture2D(uStencil, vec2(0.75 + d.x * 0.25, d.y * 0.5)).a; if (sp > 0.02) { st = sp; stC = vec3(0.62, 0.03, 0.02); } }
      }
    }
    if (!backLeaf) c = mix(c, stC, st * 0.92);
    // chips: concentrated where it's worn (bottom, top rail, frame edges, torn metal, big damage patches);
    // primer ring → bare steel → rust core
    float macro = bFbm(P * 0.5 + 4.0);
    float wear = clamp(edgeW * 0.85 + smoothstep(0.58, 0.8, macro) * 0.75 + (ex > 1.5 ? 0.6 : 0.0), 0.0, 1.0);
    float chipN = bFbm(P * 3.6 + 3.1) * 0.62 + bNoise(P * 12.0 + 1.3) * 0.38;
    float th = mix(0.82, 0.47, wear);
    float chip = smoothstep(th, th + 0.015, chipN), primer = smoothstep(th - 0.035, th - 0.02, chipN) - chip;
    float rustCore = smoothstep(th + 0.05, th + 0.1, chipN + 0.05 * n1);
    c = mix(c, PRIMER, primer * 0.85);
    c = mix(c, mix(BARE, RUST, 0.55 + 0.45 * n3), chip);
    c = mix(c, mix(RUST, RUSTD, n3), rustCore);
    // rust streaks running down from the top rail / seams
    if (wall && pid < 3.5) {
      float col = floor(uv.x * 6.0 + 0.5 * bN2(vec2(uv.y * 0.7, pid)));
      float len = 0.35 + 1.7 * bH2(vec2(col, pid * 3.1));
      float fromTop = H - uv.y;
      float streak = bN2(vec2(uv.x * 22.0, uv.y * 0.9 + pid)) * bN2(vec2(uv.x * 7.0, uv.y * 0.4));
      float sm = smoothstep(0.25, 0.55, streak) * smoothstep(len, len * 0.15, fromTop);
      c = mix(c, mix(RUST, vec3(0.34, 0.12, 0.04), n3), sm * 0.75);
      bRough = mix(bRough, 0.8, sm);
    }
    // grime + algae along the bottom
    float grime = wall ? smoothstep(0.85, 0.0, uv.y) * (0.55 + 0.45 * n1) : 0.0;
    c = mix(c, vec3(0.045, 0.05, 0.025), grime * 0.7);
    c = mix(c, vec3(0.05, 0.1, 0.03), smoothstep(0.35, 0.0, uv.y) * step(0.5, n2) * (wall ? 0.6 : 0.0));
    bRough = mix(0.5, 0.85, max(max(chip * 0.4, rustCore), grime));
    bMetal = chip * (1.0 - rustCore) * 0.65;
    bBumpH = (chip * 0.0012 + rustCore * 0.0015 * n3 + n3 * 0.0006) ;
    // ink drips down the walls from the roof hatches + pooled along the top rail
    if (wall && pid < 2.5) {
      float cw = uv.x * 3.2; float ci = floor(cw); float cf = fract(cw);
      float h0 = bH2(vec2(ci, pid + 9.0));
      float L = (0.25 + 1.4 * h0 * h0) * uDrip * (0.92 + 0.08 * sin(uTime * 0.7 + h0 * 20.0));
      float fromTop = H - uv.y;
      float w = 0.06 + 0.05 * h0;
      float xc = 0.3 + 0.4 * bH2(vec2(ci, pid + 3.0));
      float drip = step(0.35, h0) * (1.0 - smoothstep(w * 0.8, w, abs(cf - xc) * 3.2 / (1.0 + 0.8 * smoothstep(L - 0.12, L, fromTop)))) * step(fromTop, L);
      float pool = smoothstep(0.16, 0.05, fromTop) * uDrip * smoothstep(0.3, 0.6, bN2(vec2(uv.x * 2.0, pid)));
      float ink = max(drip, pool);
      c = mix(c, uInk * 0.55, ink);
      bRough = mix(bRough, 0.08, ink); bMetal = mix(bMetal, 0.0, ink); bCC = max(bCC, ink); bCCR = 0.04;
    }
    // phase-2+ glowing fracture around the tear flap outline (light from the abdomen leaks through)
    if (wall && pid < 2.5) {
      float uc = pid < 1.5 ? 3.145 : 2.715;
      vec2 d = vec2((uv.x - uc) / 0.535, (uv.y - 1.68) / 0.55);
      float r = pow(pow(abs(d.x), 4.0) + pow(abs(d.y), 4.0), 0.25);
      float ang = atan(d.y, d.x);
      float jag = 1.0 + 0.1 * sin(ang * 7.0 + (pid < 1.5 ? 1.0 : -1.0)) + 0.06 * sin(ang * 13.0 + 2.0) + 0.05 * sin(ang * 23.0);
      float edge = abs(r - jag) * 0.5;
      float near = exp(-max(0.0, r - jag) * 2.2);
      float vor = bVoro(uv * 2.6 + 11.0);
      float cracks = bLine(vor, 0.035) * near * smoothstep(0.2, 0.9, bN2(uv * 1.7)) * step(jag, r);
      float rim = bLine(edge, 0.018);
      float pulse = 0.75 + 0.25 * sin(uTime * 3.0 + uv.x * 2.0);
      float g = (rim + cracks) * uCrack * pulse;
      c = mix(c, vec3(0.01), g * 0.8);
      bEmis += uWeak * g * (2.5 + 3.0 * uOpen);
    }
    if (backLeaf) c *= 0.55;
    if (inner) { c = vec3(0.05, 0.04, 0.032) * (0.7 + 0.6 * n1); bRough = 0.9; bMetal = 0.0; bCC = 0.0; bEmis += uWeak * 0.12 * uOpen; }
    c *= mix(1.0, ao, 0.8);
  } else if (cls < 2.5) {
    // bare rusty steel (bars, chain, castings)
    float r = smoothstep(0.35, 0.7, n2 + 0.15 * n3);
    c = mix(BARE * (0.8 + 0.3 * n3), mix(RUST, RUSTD, n3), r);
    if (pid > 0.5 && pid < 1.5) c = mix(c, vec3(0.03, 0.09, 0.085), 0.6);     // castings: painted-over
    bRough = mix(0.38, 0.85, r); bMetal = mix(0.85, 0.1, r); bBumpH = r * n3 * 0.002;
  } else if (cls < 3.5) {
    // brass nozzle with verdigris; bore glows while the cannon charges
    vec3 brass = vec3(0.5, 0.29, 0.06);
    float vg = smoothstep(0.55, 0.75, n2 + 0.2 * (1.0 - ao));
    c = mix(brass * (0.85 + 0.3 * n3), vec3(0.09, 0.26, 0.2), vg);
    bRough = mix(0.28, 0.75, vg); bMetal = mix(1.0, 0.0, vg);
    if (pid > 0.5) { c = vec3(0.02); bMetal = 0.0; bEmis += uInk * (0.4 + 14.0 * uCannon) + vec3(3.0) * uCannon * uCannon; }
    else { float fl = uCannon * (0.75 + 0.25 * sin(uTime * 30.0)); bEmis += uInk * 0.6 * fl; bRimC += uInk * 2.5 * fl; bRimP = 2.0; }
  } else if (cls < 5.5) {
    // barnacles: chalky plates, purple-grey, a little algae
    float pl = bNoise(P * 60.0);
    c = mix(vec3(0.66, 0.61, 0.55), vec3(0.25, 0.19, 0.26), smoothstep(0.3, 0.8, n3 * 0.7 + pl * 0.5));
    c = mix(c, vec3(0.08, 0.14, 0.05), smoothstep(0.7, 0.85, n2) * 0.6);
    bRough = 0.92; bMetal = 0.0; bBumpH = pl * 0.004;
  } else if (cls < 6.5) {
    // weathered planks (deck along the length, crate boards)
    float pc = pid < 0.5 ? uv.x * 5.0 : P.y * 9.0 + P.x * 0.1;
    float seam = bLine(abs(fract(pc) - 0.5) - 0.47, 0.02);
    float grain = bNoise(vec3(fract(pc) * 3.0, P.y * 40.0 + P.z * 40.0, floor(pc)));
    vec3 wood = pid < 0.5 ? vec3(0.13, 0.09, 0.055) : vec3(0.33, 0.2, 0.09);
    c = mix(wood * (0.75 + 0.45 * grain), vec3(0.23, 0.22, 0.2), smoothstep(0.5, 0.8, n1) * 0.5);
    if (pid > 1.5) c = mix(c, BARE * 0.6, 0.8);
    c *= 1.0 - seam * 0.6; bRough = 0.85; bMetal = 0.0; bBumpH = -seam * 0.004 + grain * 0.0008;
  } else if (cls < 7.5) {
    // ink barrels: painted drums full of the boss's ink
    float band = step(0.9, abs(fract(P.y * 2.0 + 0.5) - 0.5) * 2.0);
    c = mix(uInk * 0.5, vec3(0.08), band); c = mix(c, RUST, smoothstep(0.7, 0.8, n2));
    bRough = 0.4; bMetal = 0.2; bCC = 0.6; bCCR = 0.1;
  } else {
    // cast-iron anchor
    float r = smoothstep(0.3, 0.6, n2);
    c = mix(vec3(0.045, 0.045, 0.05), mix(RUST, RUSTD, n3), r * 0.8);
    bRough = 0.7; bMetal = mix(0.6, 0.0, r); bBumpH = n3 * 0.003;
  }
  // phase-3 heat: steel near the tears glows faintly
  bEmis += uWeak * uHeat * 0.05 * smoothstep(0.6, 1.0, n1);
  diffuseColor.rgb = c;
` + FLASH;

// ------------------------------------------------------------------------------------------------ carapace
const CARA = /* glsl */`
  float cls = floor(vM.x + 0.5), tone = vM.y, ex = vM.w;
  vec3 P = vB;
  float tub = bNoise(P * 9.0), pit = bNoise(P * 34.0 + 5.0), mot = bFbm(P * 3.3 + 2.0);
  vec3 TOP = vec3(0.1, 0.01, 0.022), MID = vec3(0.5, 0.055, 0.04), UNDER = vec3(0.86, 0.6, 0.38), TIP = vec3(0.018, 0.01, 0.016);
  float tn = clamp(tone + (tub - 0.5) * 0.22 + (mot - 0.5) * 0.18, 0.0, 1.0);
  vec3 c = mix(TOP, MID, smoothstep(0.12, 0.5, tn));
  c = mix(c, UNDER, smoothstep(0.58, 0.95, tn));
  c = mix(c, c * 1.55 + vec3(0.02, 0.005, 0.0), smoothstep(0.62, 0.82, tub) * (1.0 - tn) * 0.7);   // tubercle crowns
  c *= 1.0 - 0.32 * smoothstep(0.72, 0.9, bNoise(P * 15.0 + 11.0)) * (1.0 - tn);                     // speckles
  float wet = smoothstep(0.35, 0.7, bFbm(P * 1.6 + 7.0));
  bRough = mix(0.62, 0.34, wet); bCC = mix(0.35, 1.0, wet); bCCR = mix(0.22, 0.05, wet); bSheen = 0.6; bSheenC = vec3(1.0, 0.45, 0.35);
  c *= mix(0.86, 1.0, wet);                                                                             // dry patches go chalky-dull
  bBumpH = tub * 0.006 - smoothstep(0.75, 0.9, pit) * 0.0025 + bNoise(P * 70.0) * 0.0006;
  float legSeg = ex >= 9.5 ? floor(ex) : -1.0, lt = fract(ex);
  if (legSeg > 0.0) {
    // hermit-crab leg bands at the joints
    float band = legSeg < 10.5 ? smoothstep(0.86, 0.9, lt) : legSeg < 11.5 ? (1.0 - smoothstep(0.06, 0.1, lt)) + smoothstep(0.47, 0.5, lt) * (1.0 - smoothstep(0.55, 0.58, lt)) * 0.8 : 0.0;
    c = mix(c, vec3(0.78, 0.42, 0.3), band * 0.85);
  }
  if (cls > 0.5 && cls < 1.5) {
    // spines + dactyls: dark lacquered tips
    float k = legSeg > 11.5 ? smoothstep(0.25, 0.85, lt) : 0.75;
    c = mix(c * 0.6, TIP, k); bRough = 0.28; bCCR = 0.04;
  } else if (cls > 1.5 && cls < 2.5) {
    c = vec3(0.83, 0.76, 0.6) * (0.85 + 0.2 * tub); bRough = 0.3; bSheen = 0.2;       // teeth / molars
  } else if (cls < 0.5) {
    c = mix(c, TIP, smoothstep(0.91, 0.985, tone));                                     // claw fingers: lacquered black tips
  } else if (cls > 2.5) {
    float pl = bNoise(P * 60.0);
    c = mix(vec3(0.62, 0.58, 0.52), vec3(0.25, 0.19, 0.26), smoothstep(0.3, 0.8, pit * 0.7 + pl * 0.5)); bRough = 0.9; bCC = 0.1; bSheen = 0.0; bBumpH = pl * 0.004;
  }
  if (ex > 1.5 && ex < 3.5) { float v = ex - 2.0; c = mix(c, UNDER * 0.8, step(0.5, fract(v * 7.0)) * 0.6); }           // antenna rings
  // boss ink: dipped feet + splashes on the claws
  float inkM = 0.0;
  if (legSeg > 0.0) inkM = smoothstep(0.42, 0.3, P.y + (bNoise(P * 7.0) - 0.5) * 0.18 - smoothstep(0.6, 0.9, bNoise(vec3(P.x * 40.0, P.y * 3.0, P.z * 40.0))) * 0.25);
  inkM = max(inkM, smoothstep(0.78, 0.84, bFbm(P * 2.6 + 9.0)) * uDrip * step(0.5, 1.0 - step(9.5, ex)) * step(cls, 0.5));
  c = mix(c, uInk * 0.32, inkM); bRough = mix(bRough, 0.06, inkM); bCCR = mix(bCCR, 0.03, inkM); bSheen *= 1.0 - inkM;
  // crusher charge veins (slam telegraph) — ink colour
  float cw = (ex > 0.2 && ex < 1.5) ? ex : 0.0;
  if (cw > 0.0) {
    // a few fat fissures that light up (not a net): ridged noise at low frequency, masked to the upper carapace
    float rv = abs(bNoise(P * 2.3 + 5.0) * 2.0 - 1.0);
    float veins = bLine(rv, 0.03) * smoothstep(0.35, 0.65, bNoise(P * 1.1 + 2.0)) + 0.4 * bLine(abs(bNoise(P * 5.5 + 9.0) * 2.0 - 1.0), 0.02) * smoothstep(0.6, 0.8, bNoise(P * 1.7));
    float g = uGlowL * cw;
    c = mix(c, vec3(0.02, 0.01, 0.02), g * veins * 0.8);
    bEmis += uInk * (veins * 10.0 + 0.03) * g + vec3(1.0) * veins * g * g * 0.6; bRimC += uInk * 0.5 * g;
  }
  // phase cracks: carapace fracture lines glowing in the weak-point colour
  if (uCrack > 0.001 && cls < 0.5) {
    float vor = bVoro(P.xz * 1.7 + P.y * 1.1) + bVoro(P.yz * 1.9 + 3.0) * 0.5;
    float cr = bLine(vor, 0.03) * smoothstep(0.55, 0.3, tone) * smoothstep(0.45, 0.65, bFbm(P * 1.2));
    float pulse = 0.7 + 0.3 * sin(uTime * 3.2 + P.y * 3.0);
    c = mix(c, vec3(0.01), cr * uCrack);
    bEmis += uWeak * cr * uCrack * pulse * (2.2 + 2.5 * uOpen);
  }
  // enrage: hotter, redder, heat shimmer on the rims
  c = mix(c, c * vec3(1.35, 0.55, 0.5), uEnrage * 0.45);
  bRimC += uWeak * uEnrage * (0.25 + 0.2 * sin(uTime * 6.0));
  diffuseColor.rgb = c;
` + FLASH;

// ------------------------------------------------------------------------------------------------ flesh
const FLESH = /* glsl */`
  float cls = floor(vM.x + 0.5), seg = vM.y;
  vec3 P = vB;
  float mot = bFbm(P * 3.8 + 1.0), vein = 1.0 - abs(bNoise(P * 4.5) * 2.0 - 1.0), vein2 = 1.0 - abs(bNoise(P * 9.0 + 4.0) * 2.0 - 1.0);
  float vm = smoothstep(0.9, 0.97, vein) + 0.5 * smoothstep(0.93, 0.985, vein2);
  vec3 PALE = vec3(0.74, 0.4, 0.38), PURP = vec3(0.26, 0.07, 0.17);
  vec3 c = mix(PALE, PURP, smoothstep(0.45, 0.85, mot) * 0.6);
  c = mix(c, PURP * 0.8, vm * 0.25);
  if (cls > 0.5 && cls < 1.5) {
    float fold = sin(P.z * 9.0 + P.y * 3.0);
    c = mix(PALE * 1.05, PURP, smoothstep(0.5, 0.85, mot) * 0.35) * (1.0 - 0.35 * smoothstep(0.7, 1.0, fold));
    vm = smoothstep(0.7, 1.0, fold) * 0.9 + 0.15 * vm; bBumpH = fold * 0.006;
  }
  if (cls > 2.5) c = mix(c, vec3(0.3, 0.08, 0.14), 0.4);
  if (cls < 0.5 && seg > 0.5) c = mix(c, vec3(0.12, 0.03, 0.07), 0.7);                 // joint membranes: dark, recessed
  if (cls > 1.5 && cls < 2.5) {
    // hermit-crab abdomen: soft transverse folds, not veins
    vec3 q = (uContInv * vec4(P, 1.0)).xyz;
    float fold = sin(q.z * 7.5 + sin(q.x * 2.0) * 0.6);
    float groove = smoothstep(0.75, 1.0, fold);
    c = mix(PALE * 0.95, PURP * 0.9, smoothstep(0.4, 0.8, mot) * 0.45);
    c *= 1.0 - 0.45 * groove;
    vm = groove * 0.8 + 0.2 * vm;
    bBumpH = fold * 0.01;
  }
  c *= mix(1.0, vM.z, 0.35);
  bRough = 0.42; bCC = 0.85; bCCR = 0.22; bSheen = 1.0; bSheenC = vec3(1.0, 0.5, 0.5) * 0.7;
  bBumpH += mot * 0.004 + vm * 0.0015;
  // fake subsurface: a little self-lit warmth
  bEmis += c * 0.07;
  float pulse = 0.8 + 0.2 * sin(uTime * 4.0 + P.z * 2.0);
  if (cls > 0.5 && cls < 1.5) bEmis += uWeak * uBelly * (0.8 + 4.0 * vm) * pulse * (1.0 + 2.0 * uWeakFlash);
  if (cls > 1.5 && cls < 2.5) bEmis += uWeak * (uOpen * (0.22 + 3.2 * vm + 0.5 * smoothstep(0.55, 0.9, mot)) * pulse + uCrack * 0.18) * (1.0 + 2.0 * uWeakFlash);
  if (cls > 2.5) bEmis += uInk * uCannon * (1.2 + 3.0 * vm);
  if (cls > 0.5 && cls < 1.5) c = mix(c, uWeak * 0.45, 0.3 * uBelly);
  if (cls > 1.5 && cls < 2.5) c = mix(c, uWeak * 0.25 + vec3(0.05, 0.0, 0.02), 0.45 * min(1.0, uOpen));
  diffuseColor.rgb = c;
` + FLASH;

// ------------------------------------------------------------------------------------------------ eye
const EYE = /* glsl */`
  float side = vM.x; vec3 d = normalize(vM.yzw);
  vec3 ctr = normalize(vec3(0.3 * side, 0.12, 1.0));
  float ang = acos(clamp(dot(d, ctr), -1.0, 1.0));
  // local 2D coords around the iris centre
  vec3 ax = normalize(cross(vec3(0.0, 1.0, 0.0), ctr)), ay = cross(ctr, ax);
  vec2 q = vec2(dot(d, ax), dot(d, ay));
  float irisR = 0.46;
  float iris = 1.0 - smoothstep(irisR - 0.025, irisR + 0.015, ang);
  float ring = smoothstep(irisR - 0.16, irisR - 0.03, ang) * iris;
  float limbal = smoothstep(irisR - 0.05, irisR - 0.01, ang) * iris;
  float strie = 0.7 + 0.3 * sin(atan(q.y, q.x) * 26.0 + ang * 12.0) * sin(atan(q.y, q.x) * 7.0);
  vec3 dark = vec3(0.006, 0.005, 0.01);
  vec3 c = dark;
  float glow = uEyeGlow;
  vec3 E = vec3(0.0);
  if (uEyeMode < 0.5) {
    // slit pupil (horizontal bar), dilates a touch while enraged
    // vertical slit pupil, dilates while enraged; the iris burns brightest at its rim
    float pw = 0.07 + 0.05 * uEnrage, ph = 0.36;
    float pup = 1.0 - smoothstep(0.0, 0.08, max(abs(q.x) / pw, abs(q.y) / ph) - 1.0);
    float halo = (1.0 - smoothstep(0.0, 0.1, max(abs(q.x) / (pw + 0.05), abs(q.y) / (ph + 0.05)) - 1.0)) * (1.0 - pup);   // hot rim hugging the slit
    float lit = iris * (1.0 - pup) * (1.0 - limbal * 0.75);
    E = uWeak * lit * (0.55 + 1.5 * ring * strie + 1.4 * halo) * glow + vec3(1.0, 0.85, 0.6) * halo * lit * 0.35 * glow;
    c = mix(dark, uWeak * 0.35, lit);
  } else if (uEyeMode < 1.5) {
    // stunned: hypnotic spiral
    float a = atan(q.y, q.x);
    float sp = sin(a * 1.0 + ang * 22.0 - uEyeSpin * 6.0);
    float lit = iris * smoothstep(-0.2, 0.4, sp);
    E = uWeak * lit * 2.2 * glow; c = mix(dark, uWeak * 0.3, lit);
  } else {
    // dead: X
    float x1 = abs(q.x - q.y) * 0.7071, x2 = abs(q.x + q.y) * 0.7071;
    float X = max(bLine(x1, 0.07), bLine(x2, 0.07)) * step(ang, 0.9);
    E = uWeak * X * 1.8; c = mix(dark, uWeak * 0.3, X);
  }
  E += uWeak * 0.005 * glow; bRimC += uWeak * 0.6 * glow; bRimP = 2.5;   // faint glowing rim so it reads at 30 m
  E *= 1.0 + 2.5 * uWeakFlash;
  E += vec3(1.0) * uWeakFlash * 0.6;
  bEmis += E; bRough = 0.12; bCC = 1.0; bCCR = 0.02;
  diffuseColor.rgb = c;
` + FLASH;

// ------------------------------------------------------------------------------------------------ junk
const JUNK = /* glsl */`
  float cls = floor(vM.x + 0.5), prm = vM.y; vec3 P = vB; vec2 uv = vU;
  float n2 = bFbm(P * 5.0 + 2.0), n3 = bNoise(P * 31.0);
  vec3 c = vec3(0.5); bRough = 0.8;
  if (cls < 0.5) {
    // tyre: rubber, tread blocks around the tube, sun-bleached dust
    float tread = step(0.5, fract(uv.x * 36.0)) * smoothstep(0.35, 0.45, abs(uv.y - 0.5));
    c = mix(vec3(0.025, 0.025, 0.028), vec3(0.11, 0.1, 0.09), smoothstep(0.55, 0.8, n2) * 0.6);
    bRough = 0.88; bBumpH = tread * 0.006 + n3 * 0.0006;
  } else if (cls < 1.5) {
    // rope: twisted strands
    float tw = sin((uv.x * 3.0 + uv.y * 26.0) * 6.2831);
    c = mix(vec3(0.34, 0.24, 0.12), vec3(0.2, 0.15, 0.08), smoothstep(0.4, 0.9, n2)) * (0.8 + 0.2 * tw);
    bRough = 0.92; bBumpH = tw * 0.002 + n3 * 0.0005;
  } else if (cls < 2.5) {
    if (prm < 0.5) { float band = step(0.35, abs(uv.y - 0.5)); c = mix(vec3(0.75, 0.13, 0.03), vec3(0.8, 0.78, 0.72), 1.0 - band); }
    else { float q = step(0.5, fract(uv.x * 4.0 + 0.125)); c = mix(vec3(0.8, 0.79, 0.74), vec3(0.68, 0.06, 0.04), q); }
    c = mix(c, c * 0.55, smoothstep(0.6, 0.85, n2) * 0.7);        // grime
    bRough = 0.35; bCC = 0.5; bCCR = 0.2;
  } else if (cls < 3.5) {
    float rib = sin(uv.y * 700.0);
    c = vec3(0.72, 0.42, 0.04) * (0.85 + 0.1 * rib); c = mix(c, c * 0.5, smoothstep(0.6, 0.85, n2) * 0.6);
    bRough = 0.75; bBumpH = rib * 0.0003;
  } else if (cls < 4.5) {
    // kelp: olive-brown blades, lighter translucent edges, wet
    float t = prm; float edge = abs(uv.x - 0.5) * 2.0;
    c = mix(vec3(0.03, 0.032, 0.008), vec3(0.085, 0.07, 0.012), smoothstep(0.5, 1.0, edge) * 0.8 + 0.2 * n2);
    c *= 0.75 + 0.35 * t;
    bRough = 0.35; bCC = 0.8; bCCR = 0.18; bSheen = 0.6; bSheenC = vec3(0.16, 0.18, 0.03);
    bEmis += c * 0.05;
    bBumpH = sin(uv.y * 40.0 + vM.w) * 0.001 + n3 * 0.0005;
  } else if (cls < 5.5) {
    // torn pennant: faded red canvas with a white claw roundel
    vec2 f = vec2(uv.x, 1.0 - vM.w);
    vec2 cq = (f - vec2(0.33, 0.5)) * vec2(2.2, 1.0);
    float rd = length(cq);
    float claw = step(rd, 0.3) * (1.0 - step(rd, 0.22) * step(0.0, cq.x) * step(abs(cq.y), 0.06 + cq.x * 0.4));
    c = mix(vec3(0.42, 0.04, 0.03), vec3(0.78, 0.74, 0.66), claw * 0.9);
    c = mix(c, c * 0.6, smoothstep(0.55, 0.85, n2)); bRough = 0.95; bSheen = 0.4; bSheenC = vec3(1.0);
  } else {
    c = vec3(0.6, 0.02, 0.02); bRough = 0.1; bCC = 1.0; bCCR = 0.02;
    float blink = step(0.55, fract(uTime * 0.8)) * uLamp;
    bEmis += vec3(1.0, 0.08, 0.04) * (0.25 + blink * 7.0);
  }
  diffuseColor.rgb = c;
` + FLASH;

// ------------------------------------------------------------------------------------------------ factory
export function makeBossMaterials(U) {
  const phys = (name, o) => { const m = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.5, metalness: 0, clearcoat: 0.01, clearcoatRoughness: 0.3, ...o }); m.name = name; return m; };
  const steel = patch(phys('steel', { side: THREE.DoubleSide, shadowSide: THREE.DoubleSide }), U, STEEL);
  const cara = patch(phys('cara', { sheen: 1, sheenRoughness: 0.55, sheenColor: new THREE.Color(1, 1, 1) }), U, CARA);
  const flesh = patch(phys('flesh', { sheen: 1, sheenRoughness: 0.4, sheenColor: new THREE.Color(1, 1, 1) }), U, FLESH);
  const eye = patch(phys('eye', {}), U, EYE);
  const junk = patch(phys('junk', { side: THREE.DoubleSide, sheen: 1, sheenRoughness: 0.5, sheenColor: new THREE.Color(1, 1, 1) }), U, JUNK);
  return { steel, cara, flesh, eye, junk };
}

// crablet: one material per crablet (own flash / pop), same program
const CRAB = /* glsl */`
  float cls = floor(vM.x + 0.5), tone = vM.y, ex = vM.w; vec3 P = vB * 4.0;
  float n2 = bFbm(P * 3.0), n3 = bNoise(P * 20.0);
  vec3 c; bRough = 0.4; bCC = 1.0; bCCR = 0.08; bSheen = 0.5; bSheenC = vec3(1.0, 0.45, 0.35);
  if (cls < 0.5) {
    c = mix(vec3(0.04, 0.26, 0.23), vec3(0.2, 0.46, 0.41), smoothstep(0.4, 0.8, n2) * 0.5);
    float chip = smoothstep(0.66, 0.7, n2 + 0.05 * n3); c = mix(c, vec3(0.24, 0.066, 0.02), chip);
    bRough = mix(0.5, 0.85, chip); bCC = 0.1; bSheen = 0.0;
  } else if (cls < 1.5) {
    c = mix(vec3(0.16, 0.016, 0.03), vec3(0.6, 0.07, 0.045), smoothstep(0.1, 0.5, tone));
    c = mix(c, vec3(0.022, 0.012, 0.02), smoothstep(0.75, 1.0, tone));
    if (ex > 11.5) c = mix(c, uInk * 0.5, smoothstep(0.55, 0.8, fract(ex)));
  } else if (cls < 2.5) { c = vec3(0.74, 0.4, 0.38); bSheen = 1.0; bEmis += c * 0.08;
  } else if (cls < 3.5) { c = vec3(0.3, 0.32, 0.34); bMetal = 0.8; bRough = 0.4;
  } else {
    vec3 d = normalize(vB - vec3(tone * 0.078, 0.42, 0.155));
    float ang = acos(clamp(dot(d, normalize(vec3(0.25 * tone, 0.1, 1.0))), -1.0, 1.0));
    float iris = 1.0 - smoothstep(0.55, 0.62, ang), slit = 1.0 - smoothstep(0.0, 0.05, abs(d.x - 0.25 * tone * d.z) - 0.05);
    c = mix(vec3(0.01), uWeak * 0.3, iris * (1.0 - slit)); bEmis += uWeak * iris * (1.0 - slit) * 1.4; bRough = 0.1;
  }
  bEmis += vec3(1.0) * uFlash * 1.2;
  diffuseColor.rgb = c;
`;
export function makeCrabletMaterial(U) {
  const m = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.5, clearcoat: 0.01, sheen: 1, sheenRoughness: 0.5, sheenColor: new THREE.Color(1, 1, 1) });
  m.name = 'crablet';
  return patch(m, U, CRAB);
}

// ------------------------------------------------------------------------------------------------ stencil atlas
// 1024 × 1024 alpha atlas: top half = side-wall logo; bottom-left = container code; bottom 3rd quarter = placard;
// bottom-right = sprayed warning. All original art (the DEEPTIDE line is fictional).
let _fontP = null;
const FD = 'HullbreakerDisplay', FT = 'HullbreakerText';
function loadFonts() {
  if (_fontP) return _fontP;
  if (typeof FontFace === 'undefined' || typeof document === 'undefined') return (_fontP = Promise.resolve());
  const d = new FontFace(FD, `url(${new URL('../../assets/fonts/TitanOne-latin.woff2', import.meta.url)})`);
  const t = new FontFace(FT, `url(${new URL('../../assets/fonts/Rubik-latin.woff2', import.meta.url)})`, { weight: '400 900' });
  _fontP = Promise.all([d.load(), t.load()]).then((f) => { f.forEach((x) => document.fonts.add(x)); }).catch(() => {});
  return _fontP;
}
function stencilBridges(x, x0, y0, w, h, every, bw) {
  // stencil-cut bridges: thin vertical gaps punched through the letters
  x.globalCompositeOperation = 'destination-out';
  for (let px = x0 + every * 0.5; px < x0 + w; px += every) x.fillRect(px, y0, bw, h);
  x.globalCompositeOperation = 'source-over';
}
function drawStencils(cv) {
  const x = cv.getContext('2d'); const W = cv.width, H = cv.height;
  x.clearRect(0, 0, W, H);
  x.fillStyle = '#fff'; x.strokeStyle = '#fff';
  // --- logo (top half: 1024 × 512 → 4 m × 1 m on the wall; flip y because the shader v runs up)
  x.save();
  const lx = 30, ly = 256;
  // roundel: a whale fluke rising out of three waves
  x.lineWidth = 22; x.beginPath(); x.arc(lx + 200, ly, 190, 0, Math.PI * 2); x.stroke();
  x.save(); x.beginPath(); x.arc(lx + 200, ly, 170, 0, Math.PI * 2); x.clip();
  for (let i = 0; i < 3; i++) { x.beginPath(); const yy = ly + 40 + i * 50; x.moveTo(lx, yy); for (let k = 0; k <= 20; k++) x.lineTo(lx + k * 20, yy + Math.sin(k * 0.9 + i) * 14); x.lineWidth = 18; x.stroke(); }
  x.beginPath(); x.moveTo(lx + 200, ly + 30); x.bezierCurveTo(lx + 190, ly - 40, lx + 150, ly - 70, lx + 90, ly - 110); x.bezierCurveTo(lx + 150, ly - 100, lx + 190, ly - 90, lx + 200, ly - 60);
  x.bezierCurveTo(lx + 210, ly - 90, lx + 250, ly - 100, lx + 310, ly - 110); x.bezierCurveTo(lx + 250, ly - 70, lx + 210, ly - 40, lx + 200, ly + 30); x.fill();
  x.restore();
  x.font = `230px ${FD}, 'Titan One', 'Arial Black', sans-serif`; x.textBaseline = 'middle'; x.textAlign = 'left';
  let s = 'DEEPTIDE'; let px = 230; while (x.measureText(s).width > 560 && px > 60) { px -= 6; x.font = `${px}px ${FD}, 'Titan One', 'Arial Black', sans-serif`; }
  x.save(); x.translate(lx + 430, ly - 20); x.scale(1.02, 1.3); x.fillText(s, 0, 0); x.restore();
  x.font = `800 58px ${FT}, Rubik, Arial, sans-serif`; x.fillText('C A R G O   L I N E S', lx + 440, ly + 150);
  stencilBridges(x, lx + 430, ly - 180, 580, 300, 67, 9);
  x.restore();
  // --- container code (bottom-left 512 × 512, drawn upright → flip for v-up)
  x.save(); x.translate(0, 512);
  x.font = `800 92px ${FT}, Rubik, Arial, sans-serif`; x.textAlign = 'left'; x.textBaseline = 'middle';
  x.fillText('DPTU 470331', 20, 80);
  x.lineWidth = 8; x.strokeRect(410, 34, 80, 92); x.fillText('6', 425, 82);
  x.font = `800 64px ${FT}, Rubik, Arial, sans-serif`; x.fillText('22G1', 20, 200);
  x.font = `700 40px ${FT}, Rubik, Arial, sans-serif`; x.fillText('MAX.GR  30,480 KG', 20, 300); x.fillText('TARE      2,280 KG', 20, 352); x.fillText('NET       28,200 KG', 20, 404);
  x.restore();
  // --- placard (512..768 × 512..1024): ochre diamond, dark rim + claw pictogram + LIVE CARGO. r = pictogram (dark)
  x.save(); x.translate(512, 512);
  x.fillStyle = 'rgb(0,0,0)'; x.beginPath(); x.moveTo(128, 20); x.lineTo(240, 256); x.lineTo(128, 492); x.lineTo(16, 256); x.closePath(); x.fill();
  x.fillStyle = 'rgba(255,0,0,1)';
  x.lineWidth = 10; x.strokeStyle = 'rgb(255,0,0)'; x.beginPath(); x.moveTo(128, 44); x.lineTo(222, 256); x.lineTo(128, 468); x.lineTo(34, 256); x.closePath(); x.stroke();
  // claw pictogram
  x.beginPath(); x.ellipse(118, 230, 46, 34, -0.4, 0, Math.PI * 2); x.fill();
  x.beginPath(); x.moveTo(140, 200); x.quadraticCurveTo(190, 150, 175, 110); x.quadraticCurveTo(160, 160, 128, 190); x.fill();
  x.beginPath(); x.moveTo(150, 226); x.quadraticCurveTo(205, 205, 200, 160); x.quadraticCurveTo(178, 205, 146, 212); x.fill();
  x.font = `800 30px ${FT}, Rubik, Arial, sans-serif`; x.textAlign = 'center'; x.fillText('LIVE', 128, 310); x.fillText('CARGO', 128, 345);
  x.restore();
  // --- sprayed warning (768..1024 × 512..1024), rough spray edges + drips
  x.save(); x.translate(768, 512);
  x.fillStyle = '#fff'; x.font = `64px ${FD}, 'Titan One', 'Arial Black', sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.save(); x.translate(128, 190); x.rotate(-0.08); x.fillText('DO NOT', 0, 0); x.fillText('FEED', 6, 70); x.restore();
  let sd = 77; const r = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 9; i++) { const dx = 30 + r() * 200, dl = 20 + r() * 90; x.fillRect(dx, 240 + r() * 30, 4, dl); x.beginPath(); x.arc(dx + 2, 240 + dl + 30, 4, 0, Math.PI * 2); x.fill(); }
  for (let i = 0; i < 500; i++) { x.fillRect(10 + r() * 236, 120 + r() * 140, 1.5, 1.5); }
  x.restore();
}
export function makeStencilTexture() {
  const cv = typeof document !== 'undefined' ? document.createElement('canvas') : null;
  if (!cv) return { tex: null, ready: Promise.resolve() };
  cv.width = cv.height = 1024;
  drawStencils(cv);
  const tex = new THREE.CanvasTexture(cv); tex.anisotropy = 8; tex.generateMipmaps = true; tex.colorSpace = THREE.NoColorSpace;
  const ready = loadFonts().then(() => { drawStencils(cv); tex.needsUpdate = true; });
  return { tex, ready };
}
