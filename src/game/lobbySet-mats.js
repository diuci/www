// Lobby set materials. All of them share one uniform block (U) so a team change, the ambient clock and the haze are
// single writes. Two workhorses carry almost all static geometry in one draw each:
//   surface — every wall, prop, frame and fixture: texlib PBR layer per vertex (brick / stucco / steel / hazard ...),
//             world-space grime, damp streaks, a wet splash band at the base of walls, contact darkening, and a
//             channel-encoded decal atlas (graffiti, posters, tags, splats) that recolours with the teams
//   ground  — the wet asphalt: texlib asphalt, painted puddle / ink mask, a planar reflection (with vertical streaks
//             on the damp film, sharp in standing water), drip ripples
// plus small ShaderMaterials for neon tubes, additive halos (alpha-preserving: the showcase un-premultiplies the stage
// by its alpha, so additive light must never raise alpha above 1), billboard glows, the sky, skyline cards and steam.
// Every material gets the set's own depth haze (the showcase owns scene.fog, so the set cannot use it).
import * as THREE from 'three';
import { TEXLIB_GLSL } from '../world/texlib.js';

export function makeUniforms() {
  return {
    uTime: { value: 0 },
    uTeamA: { value: new THREE.Color('#ff8a14') }, uTeamB: { value: new THREE.Color('#2f5bff') },
    uHzA: { value: new THREE.Color(0.012, 0.018, 0.034) },    // haze near the camera: cool blue-hour air
    uHzB: { value: new THREE.Color(0.2, 0.13, 0.09) },        // haze toward the street mouth: lit by the sodium lamps
    uHzK: { value: new THREE.Vector4(0.013, 0.14, 10, 36) },  // density /m, height falloff /m, mouth-warm start/end (-z)
    uHzStart: { value: 6.0 },
  };
}

// ------------------------------------------------------------------------------------------------ GLSL snippets
const HAZE_V_PARS = 'varying vec3 vLsW;\n';
const HAZE_V = `
  { vec4 lsw = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
    lsw = instanceMatrix * lsw;
  #endif
    vLsW = (modelMatrix * lsw).xyz; }`;
const HAZE_F_PARS = /* glsl */`
varying vec3 vLsW;
uniform vec3 uHzA; uniform vec3 uHzB; uniform vec4 uHzK; uniform float uHzStart;
float lsHazeAmt(vec3 w) {
  float d = max(distance(w, cameraPosition) - uHzStart, 0.0);
  float h = exp(-max(w.y, 0.0) * uHzK.y);
  return 1.0 - exp(-d * uHzK.x * (0.3 + 0.7 * h));
}
vec3 lsHazeCol(vec3 w) { return mix(uHzA, uHzB, smoothstep(uHzK.z, uHzK.w, -w.z) * (0.55 + 0.45 * exp(-max(w.y, 0.0) * 0.08))); }
`;
const NOISE = /* glsl */`
float lsH(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float lsN(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(lsH(i), lsH(i + vec2(1, 0)), u.x), mix(lsH(i + vec2(0, 1)), lsH(i + vec2(1, 1)), u.x), u.y); }
float lsF(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { s += a * lsN(p); p = mat2(1.6, 1.2, -1.2, 1.6) * p + 7.1; a *= 0.5; } return s / 0.9375; }
`;

// Chain the haze into a built-in material's shader (call from onBeforeCompile). additive: only attenuate.
function hazeify(shader, U, additive = false) {
  Object.assign(shader.uniforms, { uHzA: U.uHzA, uHzB: U.uHzB, uHzK: U.uHzK, uHzStart: U.uHzStart });
  shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\n' + HAZE_V_PARS)
    .replace('#include <project_vertex>', '#include <project_vertex>\n' + HAZE_V);
  shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\n' + HAZE_F_PARS)
    .replace('#include <tonemapping_fragment>', (additive ? 'gl_FragColor.rgb *= 1.0 - lsHazeAmt(vLsW);\n'
      : 'gl_FragColor.rgb = mix(gl_FragColor.rgb, lsHazeCol(vLsW), lsHazeAmt(vLsW));\n') + '#include <tonemapping_fragment>');
}
export function hazeMaterial(mat, U, additive = false) {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (s, r) => { prev?.call(mat, s, r); hazeify(s, U, additive); };
  mat.customProgramCacheKey = () => 'lsHaze' + (additive ? 1 : 0) + (mat.userData.key || '');
  return mat;
}

// ------------------------------------------------------------------------------------------------ surface
// Slots (aSurf.x) → texlib layer. tint modes: -1 no texture (plain), 0 own colours, 1 albedo x vertex colour, 2 mask.
export const SLOT = { plain: 0, brick: 1, render: 2, concrete: 3, metalpanel: 4, corrugated: 5, hazard: 6, treads: 7, planks: 8, grate: 9, rubber: 10, asphalt: 11 };
const SLOT_LAYER = ['concrete', 'brick', 'render', 'concrete', 'metalpanel', 'corrugated', 'hazard', 'treads', 'planks', 'grate', 'rubber', 'asphalt'];
const SLOT_NSTR = [0, 1.0, 0.9, 0.8, 0.8, 1.0, 0.8, 0.9, 1.0, 0.7, 0.7, 0.9];

export function surfaceMaterial(U, texlib, decalTex, envMap) {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, envMap, envMapIntensity: 0.55 });
  const lib = texlib;
  mat.onBeforeCompile = (s) => {
    s.uniforms.tDecal = { value: decalTex };
    s.uniforms.uTeamA = U.uTeamA; s.uniforms.uTeamB = U.uTeamB; s.uniforms.uTime = U.uTime;
    if (lib) {
      const L = lib.layers, M = lib.meta;
      s.uniforms.tAlbedo = { value: lib.albedo }; s.uniforms.tNormal = { value: lib.normal }; s.uniforms.tOrm = { value: lib.orm };
      s.uniforms.uTL = { value: SLOT_LAYER.map((n) => new THREE.Vector4(L[n] ?? 0, 1 / ((M[n] && M[n].scale) || 2), (M[n] && M[n].mode) ?? 1, (M[n] && M[n].sym) ?? 7)) };
      // hazard is re-tinted (mode 1) so its stripes can be dirtied down by the vertex colour instead of shouting
      s.uniforms.uTLt = { value: SLOT_LAYER.map((n, i) => new THREE.Vector4(i === 0 ? -1 : i === SLOT.hazard ? 1 : M[n] && M[n].mask ? 2 : M[n] && M[n].tint === false ? 0 : 1, SLOT_NSTR[i], 0, 0)) };
      s.defines = { ...(s.defines || {}), LS_TEXLIB: 1 };
    }
    s.vertexShader = s.vertexShader
      .replace('#include <common>', `#include <common>
attribute vec4 aSurf; attribute vec3 aDec;
varying vec2 vUvM; varying vec4 vSurf; varying vec3 vDec; varying vec3 vWN;`)
      .replace('#include <uv_vertex>', '#include <uv_vertex>\n vUvM = uv; vSurf = aSurf; vDec = aDec;')
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\n vWN = normalize(mat3(modelMatrix) * objectNormal);');
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec2 vUvM; varying vec4 vSurf; varying vec3 vDec; varying vec3 vWN;
uniform sampler2D tDecal; uniform vec3 uTeamA; uniform vec3 uTeamB; uniform float uTime;
#ifdef LS_TEXLIB
precision highp sampler2DArray;
uniform sampler2DArray tAlbedo; uniform sampler2DArray tNormal; uniform sampler2DArray tOrm;
uniform vec4 uTL[12]; uniform vec4 uTLt[12];
${TEXLIB_GLSL}
#endif
${NOISE}
vec3 gN = vec3(0.0, 0.0, 1.0); float gNS = 0.0; float gRough = 0.7; float gMetal = 0.0;`)
      .replace('#include <color_fragment>', /* glsl */`#include <color_fragment>
{
  int slot = int(vSurf.x + 0.5);
  vec3 tint = diffuseColor.rgb, base = tint;
  vec3 wp = vLsW; vec3 wn = normalize(vWN);
  float vert = 1.0 - abs(wn.y);
  gRough = 0.7 * vSurf.z; gMetal = vSurf.w;
#ifdef LS_TEXLIB
  vec4 tl = uTL[slot]; vec4 tt = uTLt[slot];
  TexlibSample ts = texlibSample(tAlbedo, tNormal, tOrm, vUvM * tl.y, tl.x, int(tl.z), int(tl.w));
  if (tt.x > -0.5) {
    base = tt.x > 1.5 ? ts.albedo.rgb + tint * ts.albedo.a * 1.25 : (tt.x > 0.5 ? tint * ts.albedo.rgb * 1.25 : ts.albedo.rgb);
    base *= mix(1.0, ts.orm.r, 0.8);
    gRough = clamp(ts.orm.g * vSurf.z, 0.03, 1.0);
    gN = ts.normal; gNS = tt.y;
    if (slot == 9 && ts.albedo.a < 0.5) discard;   // grate openings
  }
#else
  if (slot == 1) {   // procedural brick fallback: 0.23 x 0.075 m running bond
    vec2 b = vUvM / vec2(0.23, 0.075); b.x += 0.5 * floor(b.y);
    vec2 f = fract(b); float m = step(0.06, f.x) * step(0.1, f.y);
    base = tint * mix(0.55, 0.9 + 0.2 * lsH(floor(b)), m);
  } else base = tint * (0.9 + 0.2 * lsN(vUvM * 3.0));
#endif
  // weathering, all world-space (walls never repeat their dirt): blotchy grime, damp streaks running down from
  // ledges, a dark wet splash band at the foot of every wall, contact darkening where walls meet the ground
  float gr = vSurf.y;
  if (gr > 0.0) {
    float hc = dot(wp.xz, vec2(-wn.z, wn.x));
    float blot = lsF(vec2(hc, wp.y) * 0.45 + wp.xz * 0.05);
    float st = lsF(vec2(hc * 2.6, wp.y * 0.16 + 3.0 * lsN(vec2(hc * 0.4, 1.7))));
    float streak = smoothstep(0.5, 0.82, st) * vert;
    float band = (1.0 - smoothstep(0.04, 0.3 + 0.35 * lsN(vec2(hc * 1.7, 2.0)), wp.y)) * vert;
    float grime = gr * (0.6 * smoothstep(0.3, 0.8, blot) + 0.55 * streak);
    base *= 1.0 - 0.5 * grime;
    base *= mix(1.0, 0.5, band * min(gr * 1.5, 1.0));
    base *= mix(0.55, 1.0, smoothstep(0.0, 0.8, wp.y) * vert + (1.0 - vert));
    gRough = mix(gRough, gRough * 0.4, clamp(streak * 0.7 + band, 0.0, 1.0) * min(gr * 1.5, 1.0));
    // tops of things are rain-wet
    gRough *= mix(1.0, 0.55, smoothstep(0.6, 0.95, wn.y) * gr);
  }
  // decals (channel encoded): teamA*R + teamB*G + white*B over black; mode 1/2 = paint on this surface,
  // 3/4 = decal-only quad (discards outside the paint), even modes swap the team channels
  if (vDec.z > 0.5) {
    vec4 d = texture2D(tDecal, vDec.xy);
    if (mod(vDec.z + 0.5, 2.0) < 1.0) d.rg = d.gr;
    float wear = smoothstep(0.45, 0.85, lsF(vUvM * 2.3 + 11.0)) * 0.75 + smoothstep(0.5, 0.9, lsN(vUvM * 14.0)) * 0.25;
    float cov = d.a * (1.0 - wear * 0.8);
    if (vDec.z > 2.5 && cov < 0.08) discard;
    vec3 paint = uTeamA * d.r * 0.85 + uTeamB * d.g * 0.85 + vec3(0.72) * d.b;
    base = mix(base, paint * mix(1.0, 0.8, gr), cov);
    gRough = mix(gRough, 0.5, cov * 0.7);
    gNS *= 1.0 - 0.5 * cov;
  }
  diffuseColor.rgb = base;
}`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n roughnessFactor = gRough;')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n metalnessFactor = gMetal;')
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
#ifdef LS_TEXLIB
  { int slot = int(vSurf.x + 0.5); mat3 tbn = texlibTangentFrame(-vViewPosition, normal, vUvM * uTL[slot].y);
    if (gNS > 0.0) normal = texlibPerturbNormal(gN, tbn, gNS); }
#endif`);
    hazeify(s, U);
  };
  mat.customProgramCacheKey = () => 'lsSurface' + (lib ? 1 : 0);
  return mat;
}

// ------------------------------------------------------------------------------------------------ ground
export function groundMaterial(U, texlib, maskTex, maskRect, envMap) {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0, envMap, envMapIntensity: 1 });
  const lib = texlib;
  const R = (mat.userData.refl = { tex: { value: null }, mat: { value: new THREE.Matrix4() }, on: { value: 0 }, res: { value: new THREE.Vector2(1, 1) } });
  mat.userData.rip = { value: Array.from({ length: 6 }, () => new THREE.Vector4(0, 0, -99, 0)) };
  mat.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, { tMask: { value: maskTex }, uMaskR: { value: new THREE.Vector4(...maskRect) }, uTeamA: U.uTeamA, uTeamB: U.uTeamB, uTime: U.uTime,
      tRefl: R.tex, uReflMat: R.mat, uReflOn: R.on, uReflRes: R.res, uRip: mat.userData.rip });
    if (lib) {
      const n = 'asphalt', M = lib.meta[n] || { scale: 2, mode: 2, sym: 7 };
      Object.assign(s.uniforms, { tAlbedo: { value: lib.albedo }, tNormal: { value: lib.normal }, tOrm: { value: lib.orm },
        uAs: { value: new THREE.Vector4(lib.layers[n] ?? 0, 1 / M.scale, M.mode ?? 2, M.sym ?? 7) } });
      s.defines = { ...(s.defines || {}), LS_TEXLIB: 1 };
    }
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', `#include <common>
uniform sampler2D tMask; uniform vec4 uMaskR; uniform vec3 uTeamA; uniform vec3 uTeamB; uniform float uTime;
uniform sampler2D tRefl; uniform mat4 uReflMat; uniform float uReflOn; uniform vec2 uReflRes; uniform vec4 uRip[6];
#ifdef LS_TEXLIB
precision highp sampler2DArray;
uniform sampler2DArray tAlbedo; uniform sampler2DArray tNormal; uniform sampler2DArray tOrm; uniform vec4 uAs;
${TEXLIB_GLSL}
#endif
${NOISE}
vec3 gN = vec3(0.0, 0.0, 1.0); float gRough = 0.8; float gWater = 0.0; float gDamp = 0.0; float gInk = 0.0; vec2 gRipN = vec2(0.0); vec2 gTilt = vec2(0.0);`)
      .replace('#include <color_fragment>', /* glsl */`#include <color_fragment>
{
  vec2 p = vLsW.xz;
  vec3 alb = vec3(0.075, 0.074, 0.078);
#ifdef LS_TEXLIB
  TexlibSample ts = texlibSample(tAlbedo, tNormal, tOrm, p * uAs.y, uAs.x, int(uAs.z), int(uAs.w));
  alb *= ts.albedo.rgb * 1.25 * texlibMacro(p);
  alb *= mix(1.0, ts.orm.r, 0.7);
  gRough = ts.orm.g; gN = ts.normal;
#else
  alb *= 0.8 + 0.4 * lsN(p * 9.0) * lsN(p * 2.3);
  gRough = 0.82;
#endif
  // patched repairs: darker, smoother rectangles of newer asphalt
  vec2 pc = floor(p / vec2(2.7, 3.9)); float patchSel = step(0.8, lsH(pc + 3.0));
  vec2 pf = fract(p / vec2(2.7, 3.9)); float inPatch = patchSel * step(0.12, pf.x) * step(pf.x, 0.88) * step(0.1, pf.y) * step(pf.y, 0.9);
  alb *= mix(1.0, 0.7, inPatch);
  // painted mask (stage area) + procedural puddles further out + the drain gutter down the lane
  vec2 muv = vec2((p.x - uMaskR.x) / (uMaskR.z - uMaskR.x), 1.0 - (p.y - uMaskR.y) / (uMaskR.w - uMaskR.y));
  float inside = step(0.0, muv.x) * step(muv.x, 1.0) * step(0.0, muv.y) * step(muv.y, 1.0);
  vec3 m = texture2D(tMask, clamp(muv, 0.0, 1.0)).rgb * inside;
  float pn = lsF(p * vec2(0.42, 0.3) + 5.0);
  float far = smoothstep(-12.0, -16.0, p.y);
  float gut = (1.0 - smoothstep(0.1, 0.32, abs(p.x + 2.35))) * smoothstep(8.0, 5.0, p.y);
  float water = clamp(m.b * 1.6 - 0.12, 0.0, 1.0);
  water = max(water, smoothstep(0.6, 0.7, pn) * far);
  water = max(water, gut * (0.55 + 0.45 * smoothstep(0.35, 0.6, lsN(p * vec2(3.0, 0.4)))));
  gWater = water;
  gDamp = clamp(0.55 + 0.6 * (lsF(p * 0.55 + 1.3) - 0.5) + m.b * 0.6 + gut * 0.5, 0.0, 1.0);
  alb *= mix(1.0, 0.55, gDamp);
  alb *= mix(1.0, 0.35, water);
  // tyre-polished centre track (a touch smoother / darker where vans drive)
  float track = (1.0 - smoothstep(0.3, 0.9, abs(abs(p.x + 1.9) - 0.85))) * 0.25;
  alb *= 1.0 - track * 0.3;
  // oil stains
  float oil = smoothstep(0.72, 0.8, lsF(p * 0.9 + 17.0)) * 0.6;
  alb *= 1.0 - oil * 0.55;
  // ink splats: glossy, slightly raised, team coloured (normal flattened)
  float ia = clamp(m.r * 1.2, 0.0, 1.0), ib = clamp(m.g * 1.2, 0.0, 1.0);
  alb = mix(alb, uTeamA * 0.4, ia); alb = mix(alb, uTeamB * 0.4, ib);
  float ink = max(ia, ib);
  gInk = ink;
  // ink is a liquid film with a rounded rim: slope from the mask gradient (world metres) tilts the normal at its edges
  {
    vec2 du = vec2(0.025 / (uMaskR.z - uMaskR.x), 0.0), dv = vec2(0.0, 0.025 / (uMaskR.w - uMaskR.y));
    float hx = dot(texture2D(tMask, muv + du).rg - texture2D(tMask, muv - du).rg, vec2(1.0));
    float hz = -dot(texture2D(tMask, muv + dv).rg - texture2D(tMask, muv - dv).rg, vec2(1.0));
    gTilt = vec2(hx, hz) * 0.35 * inside;
  }
  gRough = mix(gRough, gRough * 0.42, gDamp);
  gRough = mix(gRough, 0.07, max(ink, track * 0.4));
  gRough = mix(gRough, 0.025, water);
  // drip ripples in standing water
  for (int i = 0; i < 6; i++) {
    vec4 r = uRip[i]; float age = uTime - r.z;
    if (age < 0.0 || age > 2.2) continue;
    vec2 dv = p - r.xy; float d = length(dv) + 1e-4;
    float front = age * 0.32;
    float env = exp(-age * 1.8) * smoothstep(front + 0.05, front - 0.03, d) * smoothstep(0.0, 0.03, d) * r.w;
    gRipN += (dv / d) * cos((d - front) * 70.0) * env * 0.6;
  }
  gRipN *= water;
  gTilt += gRipN;
  diffuseColor.rgb = alb;
}`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n roughnessFactor = gRough;')
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
{
#ifdef LS_TEXLIB
  mat3 tbn = texlibTangentFrame(-vViewPosition, normal, vLsW.xz * uAs.y);
  normal = texlibPerturbNormal(normalize(gN + vec3(gRipN, 0.0) * 0.0), tbn, 1.0 - gWater * 0.92);
#endif
  // ripples + ink rims tilt the surface (world xz slope → view normal)
  if (dot(gTilt, gTilt) > 1e-6) {
    vec3 rw = normalize(vec3(-gTilt.x, 1.0, -gTilt.y));
    normal = normalize(mix(normal, (viewMatrix * vec4(rw, 0.0)).xyz, clamp(max(gWater, gInk), 0.0, 1.0)));
  }
}`)
      .replace('#include <lights_fragment_end>', /* glsl */`#include <lights_fragment_end>
  // planar reflection: sharp in standing water, streaked + blurred on the damp film. Replaces the env-map specular
  // where it applies (the env map can't place the neon / door / kids correctly on the floor).
  if (uReflOn > 0.5) {
    vec4 rp = uReflMat * vec4(vLsW, 1.0);
    vec3 nw = (vec4(normal, 0.0) * viewMatrix).xyz;          // view → world normal
    vec2 ruv = rp.xy / rp.w + nw.xz * vec2(0.05, 0.08) * (1.0 - gWater * 0.6);
    float lod = mix(3.2, 0.2, gWater);
    float sp = mix(0.018, 0.003, gWater);
    vec3 rc = textureLod(tRefl, ruv, lod).rgb * 0.36
            + (textureLod(tRefl, ruv + vec2(0.0, sp), lod).rgb + textureLod(tRefl, ruv - vec2(0.0, sp), lod).rgb) * 0.22
            + (textureLod(tRefl, ruv + vec2(0.0, sp * 2.6), lod + 0.6).rgb + textureLod(tRefl, ruv - vec2(0.0, sp * 2.6), lod + 0.6).rgb) * 0.1;
    float NdV = saturate(dot(normal, geometryViewDir));
    float F = 0.02 + 0.98 * pow(1.0 - NdV, 5.0);
    float k = clamp(gWater + gDamp * 0.5 + gInk * 0.5, 0.0, 1.0);
    reflectedLight.indirectSpecular = mix(reflectedLight.indirectSpecular, rc * F * mix(0.8, 1.0, gWater), k);
  }`);
    hazeify(s, U);
  };
  mat.customProgramCacheKey = () => 'lsGround' + (lib ? 1 : 0);
  return mat;
}

// ------------------------------------------------------------------------------------------------ lit glass
// Windows, the vending front, the shop back room: dark glossy glass (reflects the env) over an emissive atlas;
// per-vertex aLit = emissive multiplier (rgb) so lit / dim / off windows share one draw. A cheap parallax shift of
// the interior along the view ray gives the rooms depth.
export function litMaterial(U, atlas, envMap) {
  const mat = new THREE.MeshStandardMaterial({ color: 0x06070a, roughness: 0.07, metalness: 0, emissive: 0xffffff, emissiveMap: atlas, envMap, envMapIntensity: 1.2 });
  mat.onBeforeCompile = (s) => {
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nattribute vec3 aLit; varying vec3 vLit;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\n vLit = aLit;');
    s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vLit;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance *= vLit;');
    hazeify(s, U);
  };
  mat.customProgramCacheKey = () => 'lsLit';
  return mat;
}

// ------------------------------------------------------------------------------------------------ neon
// Glass tubes: team colour, a hot near-white core where the tube faces the viewer. aNeon = (team, buzz, sign).
export function neonMaterial(U) {
  return new THREE.ShaderMaterial({
    uniforms: { uColA: U.uTeamA, uColB: U.uTeamB, uColC: { value: new THREE.Color(0.1, 1, 0.35) }, uI: { value: new THREE.Vector4(7, 7, 1, 5) }, uHzA: U.uHzA, uHzB: U.uHzB, uHzK: U.uHzK, uHzStart: U.uHzStart },
    vertexShader: /* glsl */`
      attribute vec3 aNeon; varying vec3 vN; varying vec3 vV; varying vec3 vNe; varying vec3 vLsW;
      void main() { vec4 w = modelMatrix * vec4(position, 1.0); vLsW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); vV = cameraPosition - w.xyz; vNe = aNeon;
        gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */`
      uniform vec3 uColA; uniform vec3 uColB; uniform vec3 uColC; uniform vec4 uI; varying vec3 vN; varying vec3 vV; varying vec3 vNe;
      ${HAZE_F_PARS}
      void main() {
        vec3 n = normalize(vN), v = normalize(vV); float f = abs(dot(n, v));
        vec3 c = vNe.x > 1.5 ? uColC : (vNe.x > 0.5 ? uColB : uColA); c /= max(max(c.r, c.g), max(c.b, 1e-3));
        float I = vNe.x > 1.5 ? uI.w : (vNe.x > 0.5 ? uI.y : uI.x); if (vNe.y > 0.5) I *= uI.z;
        vec3 col = c * I * (0.45 + 0.55 * f) + vec3(1.0) * I * 0.4 * pow(f, 4.0) + c * 0.06;
        col *= 1.0 - lsHazeAmt(vLsW) * 0.6;
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
}
// additive blending that leaves destination alpha alone (see the header)
const ADD = { blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor, transparent: true, depthWrite: false };
// Halo planes (texture R = glow) in a team colour; uI.x = intensity.
export function haloMaterial(U, map, team) {
  return new THREE.ShaderMaterial({
    uniforms: { map: { value: map }, uCol: team ? U.uTeamB : U.uTeamA, uI: { value: 1 }, uHzA: U.uHzA, uHzB: U.uHzB, uHzK: U.uHzK, uHzStart: U.uHzStart },
    vertexShader: 'varying vec2 vUv; varying vec3 vLsW; void main() { vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vLsW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: `uniform sampler2D map; uniform vec3 uCol; uniform float uI; varying vec2 vUv;
      ${HAZE_F_PARS}
      void main() { float g = texture2D(map, vUv).r; vec3 c = uCol / max(max(uCol.r, uCol.g), max(uCol.b, 1e-3));
        gl_FragColor = vec4(c * g * g * uI * (1.0 - lsHazeAmt(vLsW)), 1.0); }`,
    ...ADD, side: THREE.DoubleSide,
  });
}
// Camera-facing glow sprites (instanced): instance scale = radius, instanceColor = HDR colour. Pulled toward the viewer
// so a glow on a wall isn't cut in half by it.
export function glowMaterial(U) {
  return new THREE.ShaderMaterial({
    uniforms: { uHzA: U.uHzA, uHzB: U.uHzB, uHzK: U.uHzK, uHzStart: U.uHzStart },
    vertexShader: /* glsl */`
      varying vec2 vUv; varying vec3 vCol; varying vec3 vLsW;
      void main() {
        vec3 c = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        float r = length(instanceMatrix[0].xyz);
        vLsW = c; vUv = position.xy; vCol = instanceColor;
        vec4 mv = viewMatrix * vec4(c, 1.0);
        vec3 toCam = normalize(-mv.xyz);
        mv.xyz += toCam * min(r * 0.8, 0.6);
        mv.xy += position.xy * r;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `varying vec2 vUv; varying vec3 vCol;
      ${HAZE_F_PARS}
      void main() { float d = length(vUv); float g = exp(-d * d * 7.0) * 0.8 + exp(-d * d * 60.0) * 1.2; g *= smoothstep(1.0, 0.7, d);
        gl_FragColor = vec4(vCol * g * (1.0 - lsHazeAmt(vLsW) * 0.8), 1.0); }`,
    ...ADD,
  });
}
// Bulbs / lamp lenses: flat HDR emitters (instanced), hazed like everything else.
export function emitMaterial(U) {
  const m = new THREE.MeshBasicMaterial({ color: 0xffffff });
  return hazeMaterial(m, U, false);
}

// ------------------------------------------------------------------------------------------------ sky + skyline
// Blue hour: deep indigo zenith, a pale teal band over the roofs, the city's sodium glow low toward the street mouth.
// Drawn at the far plane (depth forced) so it works with any camera far distance.
export function skyMaterial(U) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: U.uTime, uGlow: { value: new THREE.Color(0.55, 0.3, 0.18) } },
    vertexShader: 'varying vec3 vDir; void main() { vec4 w = modelMatrix * vec4(position, 1.0); vDir = w.xyz - cameraPosition; gl_Position = projectionMatrix * viewMatrix * w; gl_Position.z = gl_Position.w * 0.99999; }',
    fragmentShader: /* glsl */`
      uniform float uTime; uniform vec3 uGlow; varying vec3 vDir;
      ${NOISE}
      void main() {
        vec3 d = normalize(vDir); float e = d.y;
        vec3 zen = vec3(0.006, 0.012, 0.045), mid = vec3(0.02, 0.05, 0.14), hor = vec3(0.07, 0.12, 0.2);
        vec3 c = mix(hor, mid, smoothstep(0.0, 0.25, e)); c = mix(c, zen, smoothstep(0.2, 0.75, e));
        float toward = smoothstep(0.2, 1.0, -d.z);
        c += uGlow * exp(-max(e, 0.0) * 9.0) * (0.25 + 0.75 * toward);
        // thin high cloud streaks catching the city light from below
        vec2 cp = d.xz / max(e + 0.12, 0.05);
        float cl = smoothstep(0.55, 0.8, lsF(cp * vec2(0.35, 1.2) + vec2(uTime * 0.004, 0.0)));
        c = mix(c, uGlow * 0.35 + vec3(0.03, 0.04, 0.07), cl * 0.55 * smoothstep(0.02, 0.2, e) * smoothstep(0.9, 0.3, e));
        gl_FragColor = vec4(c, 1.0);
      }`,
    side: THREE.BackSide, depthWrite: false,
  });
}
export function skylineMaterial(U, map, fogCol, fog) {
  return new THREE.ShaderMaterial({
    uniforms: { map: { value: map }, uFog: { value: fogCol }, uF: { value: fog }, uV: { value: new THREE.Vector2(0, 0.5) } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform sampler2D map; uniform vec3 uFog; uniform float uF; uniform vec2 uV; varying vec2 vUv;
      void main() { vec4 t = texture2D(map, vec2(vUv.x, uV.x + vUv.y * uV.y)); if (t.a < 0.5) discard;
        vec3 c = t.rgb * t.rgb * 1.6;
        float h = mix(1.0, 0.45, vUv.y);
        gl_FragColor = vec4(mix(c, uFog, uF * h), 1.0); }`,
  });
}

// ------------------------------------------------------------------------------------------------ steam
// Soft curling plume on camera-facing cards: two scrolling noise octaves, faded at the card edges and with height.
export function steamMaterial(U) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: U.uTime, uCol: { value: new THREE.Color(0.2, 0.19, 0.21) }, uHzA: U.uHzA, uHzB: U.uHzB, uHzK: U.uHzK, uHzStart: U.uHzStart },
    vertexShader: /* glsl */`
      attribute float aSeed; varying vec2 vUv; varying float vSeed; varying vec3 vLsW;
      void main() { vUv = uv; vSeed = aSeed; vec4 w = modelMatrix * vec4(position, 1.0); vLsW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */`
      uniform float uTime; uniform vec3 uCol; varying vec2 vUv; varying float vSeed;
      ${HAZE_F_PARS}
      ${NOISE}
      void main() {
        vec2 p = vUv * vec2(1.6, 3.0); float t = uTime * 0.35 + vSeed * 7.0;
        vec2 q = vec2(lsF(p + vec2(0.0, -t)), lsF(p * 1.3 + vec2(3.1, -t * 1.3)));
        float n = lsF(p * 1.1 + q * 1.4 + vec2(vSeed * 3.0, -t * 0.8));
        float edge = smoothstep(0.0, 0.3, vUv.x) * smoothstep(1.0, 0.7, vUv.x) * smoothstep(0.0, 0.12, vUv.y) * smoothstep(1.0, 0.35, vUv.y);
        float a = smoothstep(0.4, 0.85, n) * edge * 0.6;
        vec3 c = mix(uCol, lsHazeCol(vLsW), 0.3);
        gl_FragColor = vec4(c, a);
      }`,
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
  });
}
