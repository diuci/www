// INKWAVE — squidkid materials. Body materials are per-character (they carry per-character uniforms for
// hurt splotches / invuln flash / special glow) but share one compiled program per kind. Weapon + glass
// materials are shared and cached by colour hex.
//
// Per-vertex authoring contract (see character-geo.js):
//  • cloth : aEx = colour source (CS_* below), aCloth = (part id, material class, param), uv = part coordinates.
//  • skin  : aEx = sub-material (0 skin, 1 nail, 2 inner ear, 3 lip), aHead = unit head direction (face decals).
//  • hair  : aTint (+ lighter / − darker team ink; ≤ −1.5 = "gear" accessory, class = −aTint − 2),
//            colour = strand data (t, suckers, sinA) | cap flag (b ≥ 1.5) | gear rgb (r < 0 → team × g).
//  • weapon plastic: aMat = material class (0 satin, 1 gloss, 2 rubber, 3 metal, 4 lens, 5 LED, 6 print).
import * as THREE from 'three';
import { FACE_SHADER } from './character-face.js';

const NOISE = /* glsl */`
float iwHash(vec3 p){ p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3)); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float iwNoise(vec3 x){ vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(iwHash(i), iwHash(i + vec3(1,0,0)), f.x), mix(iwHash(i + vec3(0,1,0)), iwHash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(iwHash(i + vec3(0,0,1)), iwHash(i + vec3(1,0,1)), f.x), mix(iwHash(i + vec3(0,1,1)), iwHash(i + vec3(1,1,1)), f.x), f.y), f.z); }
float iwFbm(vec3 p){ return 0.56 * iwNoise(p) + 0.29 * iwNoise(p * 2.07 + 7.1) + 0.15 * iwNoise(p * 4.31 + 3.7); }
float iwBand(float x, float a, float b){ float w = max(fwidth(x) * 0.8, 1e-4); return smoothstep(a - w, a + w, x) - smoothstep(b - w, b + w, x); }
float iwHash2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
float iwAAw(float d){ return max(fwidth(d), 1e-5); }
// filled SDF (d < 0 inside) and stroke of half-width hw, both antialiased
float iwFill(float d){ float w = iwAAw(d); return 1.0 - smoothstep(-w, w, d); }
float iwStroke(float d, float hw){ float w = iwAAw(d); return 1.0 - smoothstep(hw - w, hw + w, abs(d)); }
// 1 while a pattern of spatial period P (same units as coord) is resolvable (>= ~3 px), fading to 0 when sub-pixel
float iwLod(float coord, float P){ float px = fwidth(coord) / P; return 1.0 - smoothstep(0.22, 0.55, px); }
// dashed stitch along s (period P, duty 0..1)
float iwDash(float s, float P, float duty){ float x = s / P; float f = fract(x); float w = min(max(fwidth(x), 1e-4) * 1.2, 0.3); return smoothstep(0.0, w, f) * (1.0 - smoothstep(duty - w, duty, f)); }
float iwSdBox(vec2 p, vec2 b, float r){ vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
float iwSdSeg(vec2 p, vec2 a, vec2 b){ vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * h); }
float iwSmin(float a, float b, float k){ float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0); return mix(b, a, h) - k * h * (1.0 - h); }
`;

// screen-space bump: perturb the view-space shading normal by a scalar height field (metres)
const BUMP = /* glsl */`
vec3 iwBumpN(vec3 n, float h, vec3 pos){
  vec3 dpx = dFdx(pos), dpy = dFdy(pos);
  vec3 r1 = cross(dpy, n), r2 = cross(n, dpx);
  float det = dot(dpx, r1);
  vec3 g = sign(det) * (dFdx(h) * r1 + dFdy(h) * r2);
  return abs(det) > 1e-14 ? normalize(abs(det) * n - g) : n;
}
`;

const HURT_FRAG = /* glsl */`
  float iwHurtM = 0.0;
  if (uHurt.w > 0.002) {
    vec3 hp = vBindPos * vec3(10.0, 6.5, 10.0) + vec3(uHurtSeed);
    hp.y += 0.35 * iwNoise(vBindPos * 23.0);
    float n = iwFbm(hp);
    float th = mix(1.0, 0.47, clamp(uHurt.w, 0.0, 1.0));
    float w = max(fwidth(n) * 0.9, 0.004);
    iwHurtM = smoothstep(th - w, th + w, n);
    float rim = smoothstep(th - 0.05, th - w, n) * (1.0 - iwHurtM);
    diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.8, rim * 0.6);
    diffuseColor.rgb = mix(diffuseColor.rgb, uHurt.rgb, iwHurtM);
  }
`;

function inject(shader, o) {
  let v = shader.vertexShader, f = shader.fragmentShader;
  if (o.vPars) v = v.replace('#include <common>', '#include <common>\n' + o.vPars);
  if (o.vBegin) v = v.replace('#include <begin_vertex>', '#include <begin_vertex>\n' + o.vBegin);
  if (o.fPars) f = f.replace('#include <common>', '#include <common>\n' + o.fPars);
  if (o.fColor) f = f.replace('#include <color_fragment>', '#include <color_fragment>\n' + o.fColor);
  if (o.fRough) f = f.replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n' + o.fRough);
  if (o.fMetal) f = f.replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n' + o.fMetal);
  if (o.fNormal) f = f.replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n' + o.fNormal);
  if (o.fEmissive) f = f.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n' + o.fEmissive);
  if (o.fLights) f = f.replace('#include <lights_physical_fragment>', '#include <lights_physical_fragment>\n' + o.fLights);
  if (o.fAO) f = f.replace('#include <aomap_fragment>', '#include <aomap_fragment>\n' + o.fAO);
  if (o.fOpaque) f = f.replace('#include <opaque_fragment>', o.fOpaque + '\n#include <opaque_fragment>');
  shader.vertexShader = v; shader.fragmentShader = f;
}

/** Per-character uniform bundle (shared by that character's body materials). */
export function makeCharUniforms() {
  return {
    uTeam: { value: new THREE.Color('#ff8a14') },
    uShirt: { value: new THREE.Color('#f3f1ec') },
    uShorts: { value: new THREE.Color('#2a3350') },
    uShoe: { value: new THREE.Color('#2a2d36') },
    uSole: { value: new THREE.Color('#f4f2ec') },
    uSock: { value: new THREE.Color('#f7f7f4') },
    uStrap: { value: new THREE.Color('#33363f') },
    uPattern: { value: 0 },
    uHurt: { value: new THREE.Vector4(0, 0, 0, 0) },
    uHurtSeed: { value: 0 },
    uFlash: { value: new THREE.Color(0, 0, 0) },
    uGlow: { value: new THREE.Color(0, 0, 0) },
    uLook: { value: new THREE.Vector2(0, 0) },
    uIris: { value: new THREE.Color('#ffb21c') },
    uIris2: { value: new THREE.Color('#ff6a00') },
    uTime: { value: 0 },
    uWig: { value: new THREE.Vector3(0.012, 9, 0) }, // amp, freq, unused
    uOpacity: { value: 1 },
    uMouth: { value: new THREE.Vector4(0.75, 1, 0, 0) },
    uFreckle: { value: 0 },
    // Face hooks (driven per frame by character.js). All additive to the legacy drivers (eye-bone Y scale, uLook, uMouth).
    uLid: { value: new THREE.Vector4(0, 0, 0, 0) },    // lid close 0…1: upper L, upper R, lower L, lower R
    uGaze: { value: new THREE.Vector4(0, 0, 0, 0) },   // eyeball yaw/pitch (rad): L.x L.y R.x R.y (+x = kid's left, +y = up)
    uPupil: { value: 0.5 },                             // pupil dilation 0…1
    uMouth2: { value: new THREE.Vector4(0, 0, 0, 0) }, // x smile (unused by the shader: cheek bones) · y sneer · z pucker · w blush
  };
}

const bodyVPars = /* glsl */`
varying vec3 vBindPos;
attribute float aEx;
varying float vEx;
`;
const bodyVBegin = /* glsl */`
vBindPos = position; vEx = aEx;
`;
const bodyFPars = /* glsl */`
uniform vec4 uHurt; uniform float uHurtSeed; uniform vec3 uFlash;
varying vec3 vBindPos; varying float vEx;
${NOISE}
${BUMP}
`;

// ================================================================================================
// SKIN — stylised subsurface skin + the face. Geometry does the sculpt (character-face.js); this shader adds:
//  • lighting: per-channel wrapped diffuse (red scatters past the terminator, blue stays tight), translucent ears
//    against back light, soft spec + sheen, baked vertex AO (aFace.w) on indirect light, a little cavity in direct.
//  • animation (vertex): the lids rotate about each eyeball's axis in eye space (exact slide over the ball; closure from
//    the eye bones' Y scale — character.js' blink/squint — and/or uLid), the mouth deforms from uMouth / uMouth2
//    (smile/frown corners, width, smirk tilt, upper-lip lift, pucker); the jaw + cheek bones do the rest.
//  • pigment: the Inkling mask (recessed in geometry, glossy lacquer here), painted hairline, freckles, blush, lip tint,
//    wet lid margins, mouth cavity / teeth / tongue.
// Sub-materials (aEx): 0 skin · 1 nail · 2 ear cup · 8 ear shell · 9 lid margin · 10 inner lip / cavity · 11 teeth · 12 tongue.
// ================================================================================================
const FACE_GLSL = /* glsl */`
float iwSmax(float a, float b, float k){ float h = clamp(0.5 + 0.5 * (a - b) / k, 0.0, 1.0); return mix(b, a, h) + k * h * (1.0 - h); }
float iwVisorSD(float az, float el){
  float ax = abs(az);
  float lobe = (1.0 - length(vec2((ax - 0.355) / 0.3, (el - 0.15) / 0.29))) * 0.26;
  float bridge = ax < 0.42 ? 0.1 + 0.1 * smoothstep(0.0, 0.36, ax) - abs(el - 0.17) : -1.0;
  float s = (ax - 0.42) / 0.9;
  float wc = 0.16 + 0.2 * pow(clamp(s, 0.0, 1.0), 1.35);
  float wh = 0.205 * pow(clamp(1.0 - s, 0.0, 1.0), 0.8);
  float wing = (s > -0.1 && s <= 1.0) ? wh - abs(el - wc) : -1.0;
  return iwSmax(iwSmax(lobe, bridge, 0.06), wing, 0.07);
}
float iwHairline(float az){ float a = abs(az) / 3.14159265; float h = mix(0.58, 0.3, smoothstep(0.1, 0.42, a)); return mix(h, -0.8, smoothstep(0.5, 0.96, a)); }
`;
// eye-space constants shared by the skin (lids) and eye (ball, lid shadow) shaders
function faceUniforms() {
  const S = FACE_SHADER;
  return {
    uEyeC: { value: S.eyeC }, uEyeM: { value: S.eyeM }, uEyeMi: { value: S.eyeMi },
    uEyeAp: { value: S.ap }, uEyeLid: { value: S.lid },
    uMouthC: { value: S.mouthC }, uMouthU: { value: S.mouthU }, uMouthF: { value: S.mouthF }, uMouthHW: { value: S.mouthHW },
  };
}
// lid closure from the eye bones (character.js blinks/squints by scaling eyeL/eyeR Y): 0 open … 1 shut
const LID_BONE_GLSL = /* glsl */`
#ifdef USE_SKINNING
float iwBoneClose(float bi){ mat4 bE = getBoneMatrix(bi); mat4 bH = getBoneMatrix(${FACE_SHADER.bones.head.toFixed(1)}); float open = length(bE[1].xyz) / max(length(bH[1].xyz), 1e-5); return clamp((1.0 - open) / 0.93, 0.0, 1.0); }
#else
float iwBoneClose(float bi){ return 0.0; }
#endif
vec2 iwLidClose(int si, vec4 lid){
  float b = iwBoneClose(si == 0 ? ${FACE_SHADER.bones.eyeL.toFixed(1)} : ${FACE_SHADER.bones.eyeR.toFixed(1)});
  return vec2(max(b, si == 0 ? lid.x : lid.y), max(b, si == 0 ? lid.z : lid.w));
}
`;

export function makeSkinMaterial(u, skinHex) {
  const m = new THREE.MeshPhysicalMaterial({
    color: skinHex, roughness: 0.6, metalness: 0, vertexColors: true, specularIntensity: 0.32,
    sheen: 1, sheenRoughness: 0.85, sheenColor: new THREE.Color('#ffd2c0'),
    clearcoat: 0.01, clearcoatRoughness: 0.5,   // > 0 keeps USE_CLEARCOAT (wet line, nails, teeth set it per fragment)
  });
  const tone = new THREE.Color(skinHex);
  const lum = tone.r * 0.3 + tone.g * 0.59 + tone.b * 0.11;
  // freckles on the second-lightest tone only (a character trait, not noise on everyone)
  if (u.uFreckle && Math.abs(lum - 0.5) < 0.2 && tone.r > 0.8) u.uFreckle.value = 1;
  m.userData.iwLum = lum;
  // scatter: how far each channel wraps past the terminator, and the colour light picks up inside the skin
  const sssW = new THREE.Vector3(0.46, 0.22, 0.15).multiplyScalar(lerpN(1.0, 0.75, clampN((0.62 - lum) / 0.45)));
  const sssTint = new THREE.Color(1.0, 0.38, 0.26).lerp(new THREE.Color(0.75, 0.3, 0.2), clampN((0.6 - lum) / 0.4));
  m.onBeforeCompile = (shader) => {
    for (const k of ['uHurt', 'uHurtSeed', 'uFlash', 'uMouth', 'uTeam', 'uFreckle']) shader.uniforms[k] = u[k];
    shader.uniforms.uLid = u.uLid || { value: new THREE.Vector4() };
    shader.uniforms.uMouth2 = u.uMouth2 || { value: new THREE.Vector4() };
    shader.uniforms.uSkinLum = { value: lum };
    shader.uniforms.uSSSW = { value: sssW }; shader.uniforms.uSSSTint = { value: sssTint };
    Object.assign(shader.uniforms, faceUniforms());
    inject(shader, {
      vPars: bodyVPars + /* glsl */`
        attribute vec3 aHead; attribute vec4 aFace; varying vec3 vHead; varying vec4 vFace; varying vec2 vIwUv;
        uniform vec4 uLid; uniform vec4 uMouth; uniform vec4 uMouth2;
        uniform vec3 uEyeC[2]; uniform mat3 uEyeM[2]; uniform mat3 uEyeMi[2];
        uniform vec3 uMouthC; uniform vec3 uMouthU; uniform vec3 uMouthF; uniform float uMouthHW;`,
      vBegin: bodyVBegin + 'vHead = aHead; vFace = aFace; vIwUv = uv; transformed = iwPos;',
      fPars: bodyFPars + /* glsl */`
        uniform vec4 uMouth; uniform vec4 uMouth2; uniform vec3 uTeam; uniform float uFreckle; uniform float uSkinLum;
        uniform vec3 uSSSW; uniform vec3 uSSSTint; uniform vec3 uMouthC; uniform vec3 uMouthF;
        varying vec3 vHead; varying vec4 vFace; varying vec2 vIwUv;
        float iwSSS = 1.0; float iwThin = 0.0;` + FACE_GLSL,
      fColor: /* glsl */`
        float iwVisor = 0.0; float iwHairP = 0.0; float iwH = 0.0; float iwNail = 0.0; float iwWet = 0.0; float iwTooth = 0.0; float iwAO = vFace.w; float iwInner = 0.0;
        float iwSub = floor(vEx + 0.5);
        // subtle skin mottling (breaks the plastic look up close; invisible at range)
        {
          float mott = iwFbm(vBindPos * 60.0);
          diffuseColor.rgb *= 1.0 + (mott - 0.5) * 0.06 * iwLod(vBindPos.y * 60.0, 1.0);
        }
        if (iwSub > 0.5 && iwSub < 1.5) {                 // fingernail
          iwNail = 1.0; iwSSS = 0.3;
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0, 0.86, 0.84), 0.45);
        } else if (iwSub > 1.5 && iwSub < 2.5) {          // (legacy) inner ear
          diffuseColor.rgb *= vec3(1.0, 0.8, 0.76); iwThin = 1.0;
        } else if (iwSub > 7.5 && iwSub < 8.5) {          // ear: thin → translucent against back light; the cup (uv.x) is flushed
          diffuseColor.rgb *= mix(vec3(1.0, 0.95, 0.93), vec3(1.0, 0.8, 0.76), vIwUv.x); iwThin = mix(0.75, 1.0, vIwUv.x);
        } else if (iwSub > 10.5 && iwSub < 11.5) {        // teeth: one smooth band, gaps drawn here
          float g = abs(fract(vIwUv.x * 3.3 + 0.5) - 0.5);
          float gap = (1.0 - smoothstep(0.015, 0.05, g)) * step(0.2, abs(vIwUv.x) * 3.3);
          diffuseColor.rgb = vec3(0.96, 0.95, 0.92) * (1.0 - 0.18 * gap) * mix(0.82, 1.0, smoothstep(1.0, 0.6, abs(vIwUv.x)));
          iwTooth = 1.0; iwSSS = 0.25;
        } else if (iwSub > 11.5 && iwSub < 12.5) {        // tongue
          float groove = exp(-pow(vIwUv.x / 0.12, 2.0));
          diffuseColor.rgb = vec3(0.96, 0.44, 0.42) * (1.0 - 0.2 * groove) * (0.94 + 0.12 * iwNoise(vBindPos * 900.0));
          iwWet = 0.7;
        }
        float hl = length(vHead);
        if (hl > 0.5 && iwSub < 0.5) {
          vec3 d = vHead / hl;
          float az = atan(d.x, d.z), el = asin(clamp(d.y, -1.0, 1.0));
          float fw = max(fwidth(el), 1e-4);
          // ---- painted hairline under the cap edge (hides the cap/skin seam), soft shadow just below it
          float hs = el - iwHairline(az) + 0.004;
          float hw = max(fwidth(hs), 1e-4);
          iwHairP = smoothstep(-hw, hw, hs);
          float capShadow = smoothstep(-0.09, 0.0, hs) * (1.0 - iwHairP);
          diffuseColor.rgb *= 1.0 - 0.22 * capShadow;
          diffuseColor.rgb = mix(diffuseColor.rgb, uTeam * 0.55, iwHairP);
          // ---- blush: soft warm gradient over the cheek apples (+ uMouth2.w flush), stronger on fair skin
          float bl = exp(-pow((abs(az) - 0.6) / 0.2, 2.0) - pow((el + 0.3) / 0.13, 2.0));
          float blushK = bl * mix(0.3, 0.12, smoothstep(0.35, 0.8, 1.0 - uSkinLum)) * (1.0 + 1.5 * clamp(uMouth2.w, 0.0, 1.0));
          diffuseColor.rgb *= mix(vec3(1.0), vec3(1.0, 0.72, 0.72), blushK);
          // ---- freckles across the nose bridge + cheeks
          if (uFreckle > 0.5) {
            vec2 fp = vec2(az, el + 0.12) * 42.0;
            vec2 cell = floor(fp); vec2 fr = fract(fp) - 0.5;
            float rnd = iwHash2(cell);
            vec2 off = vec2(iwHash2(cell + 3.1), iwHash2(cell + 7.7)) - 0.5;
            float region = exp(-pow((abs(az) - 0.3) / 0.28, 2.0) - pow((el + 0.14) / 0.1, 2.0));
            float fd = length(fr - off * 0.5) - 0.13 * rnd;
            float fk = iwFill(fd) * step(0.45, rnd) * region;
            diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.78, 0.6, 0.5), fk * 0.7);
          }
          // ---- nose tip + nostril rims: slightly warmer
          float nose = exp(-pow(az / 0.06, 2.0) - pow((el + 0.13) / 0.06, 2.0)) + 0.6 * exp(-pow((abs(az) - 0.045) / 0.03, 2.0) - pow((el + 0.165) / 0.025, 2.0));
          diffuseColor.rgb *= mix(vec3(1.0), vec3(1.0, 0.88, 0.86), nose * 0.5);
          // ---- lips: a faint rosy tint, darker at the line and in the corners
          float mEl = ${FACE_SHADER.mouthEl.toFixed(4)}, mAz = ${FACE_SHADER.mouthAz.toFixed(4)};
          float lipX = 1.0 - smoothstep(mAz * 0.64, mAz * 1.14, abs(az));
          float lip = lipX * smoothstep(mEl - 0.06, mEl - 0.032, el) * (1.0 - smoothstep(mEl + 0.012, mEl + 0.032, el));
          diffuseColor.rgb *= mix(vec3(1.0), mix(vec3(0.95, 0.8, 0.8), vec3(0.98, 0.88, 0.85), smoothstep(0.35, 0.8, 1.0 - uSkinLum)), lip * 0.8);
          // lip line: a thin dark stroke on both lip edges (rest-space, so it rides the smile/frown and parts when open)
          float lx = abs(az) / mAz;
          float lineW = 0.0038 * mix(1.0, 0.5, smoothstep(0.6, 1.05, lx));
          float lineK = iwStroke(el - mEl + 0.002, lineW) * (1.0 - smoothstep(0.98, 1.12, lx)) * (1.0 - smoothstep(0.04, 0.2, uMouth.z)); // the opening takes over
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.42, 0.26, 0.28), lineK * 0.85);
          // ---- mask: pigment in the skin (not a lacquered band): near-black with a faint cool tint, satin, a soft
          //      ~1.5 mm feathered edge (plus AA), a whisper of a recess in the geometry, and a little of the skin's scatter
          float sd = iwVisorSD(az, el);
          float w = max(fwidth(sd), 1e-4);
          iwVisor = smoothstep(-0.008 - w, 0.008 + w, sd);
          vec3 vc = mix(vec3(0.012, 0.0135, 0.02), vec3(0.018, 0.021, 0.032), smoothstep(-0.1, 0.5, el));
          diffuseColor.rgb = mix(diffuseColor.rgb, vc, iwVisor);
          iwSSS *= 1.0 - 0.88 * iwVisor;
          // ---- lid margin (uv.x: rolls under the eyeball): wet, a touch warmer than the lacquer
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.06, 0.035, 0.045), vIwUv.x);
          iwWet = max(iwWet, vIwUv.x);
          // ---- inner lip → mouth cavity (uv.y), darkening with depth behind the lips
          if (vIwUv.y > 0.001) {
            float dz = dot(uMouthC - vBindPos, uMouthF);
            vec3 c = mix(vec3(0.8, 0.36, 0.38), vec3(0.3, 0.04, 0.05), smoothstep(0.003, 0.011, dz));
            c *= mix(1.0, 0.45, smoothstep(0.011, 0.026, dz));
            diffuseColor.rgb = mix(diffuseColor.rgb, c, vIwUv.y);
            iwWet = max(iwWet, smoothstep(0.55, 1.0, vIwUv.y) * 0.7 * smoothstep(0.04, 0.25, uMouth.z)); // matte seam when closed
            iwSSS *= 1.0 - 0.4 * vIwUv.y; iwVisor *= 1.0 - vIwUv.y; iwInner = vIwUv.y;
          }
        }
      ` + HURT_FRAG,
      fRough: 'roughnessFactor = mix(roughnessFactor, 0.16, iwHurtM); roughnessFactor = mix(roughnessFactor, 0.48, iwVisor); roughnessFactor = mix(roughnessFactor, 0.35, iwHairP); roughnessFactor = mix(roughnessFactor, 0.22, iwNail); roughnessFactor = mix(roughnessFactor, 0.14, iwWet); roughnessFactor = mix(roughnessFactor, 0.28, iwTooth);',
      fNormal: 'normal = iwBumpN(normal, iwH, -vViewPosition);',
      fEmissive: 'totalEmissiveRadiance += uFlash;',
      fLights: /* glsl */`
        #ifdef USE_CLEARCOAT
          material.clearcoat = max(iwNail * 0.6, max(iwWet * 0.8, iwTooth * 0.5));  // wet line, nails, teeth only (mask is satin)
          material.clearcoat *= mix(1.0, iwAO * iwAO, max(iwInner, iwTooth));   // no sky mirrored inside the mouth
          material.clearcoatRoughness = mix(0.45, 0.06, iwWet);
        #endif
        #ifdef USE_SHEEN
          material.sheenColor *= (1.0 - 0.85 * iwVisor) * (1.0 - iwHairP) * (1.0 - iwWet) * (1.0 - iwTooth) * mix(0.4, 0.22, uSkinLum);
        #endif`,
      fAO: 'reflectedLight.indirectDiffuse *= iwAO; reflectedLight.indirectSpecular *= mix(1.0, iwAO, 0.8);',
    });
    // vertex: lids + mouth (before skinning; normals too, so the lids shade as they slide)
    shader.vertexShader = shader.vertexShader
      .replace('#include <skinning_pars_vertex>', '#include <skinning_pars_vertex>\n' + LID_BONE_GLSL)
      .replace('#include <beginnormal_vertex>', /* glsl */`#include <beginnormal_vertex>
        vec3 iwPos = position;
        if (aFace.x + aFace.y > 1e-4) {
          int si = position.x >= 0.0 ? 0 : 1;
          vec2 cl = iwLidClose(si, uLid);
          float a = aFace.x * cl.x - aFace.y * cl.y;             // + rotates down (upper lid), − up (lower lid)
          mat3 M = uEyeM[si], Mi = uEyeMi[si]; vec3 C = uEyeC[si];
          vec3 s = Mi * (position - C);
          float ca = cos(a), sa = sin(a);
          iwPos = C + M * vec3(s.x, ca * s.y - sa * s.z, sa * s.y + ca * s.z);
          vec3 nu = transpose(M) * objectNormal;
          objectNormal = normalize(transpose(Mi) * vec3(nu.x, ca * nu.y - sa * nu.z, sa * nu.y + ca * nu.z));
        }
        if (abs(aFace.z) > 1e-4) {
          float w = abs(aFace.z), up = aFace.z > 0.0 ? 1.0 : 0.0;
          vec3 d = iwPos - uMouthC;
          float mx = d.x, my = dot(d, uMouthU);
          float xn = clamp(mx / uMouthHW, -1.35, 1.35), xw = min(xn * xn, 1.3);
          float band = exp(-my * my / 1.6e-4);
          float curve = clamp(uMouth.x, -1.3, 1.3), width = clamp(uMouth.y, 0.2, 1.5), open = clamp(uMouth.z, 0.0, 1.0);
          float pucker = clamp(uMouth2.z, 0.0, 1.0) + clamp((0.8 - width) * 1.2, 0.0, 0.6) * step(curve, -0.6);
          vec3 dp = vec3(mx * ((width - 1.0) * 0.75 - 0.3 * pucker + 0.2 * open), 0.0, 0.0);   // open → a wider D
          dp += uMouthU * (curve * 0.0062 * xw * mix(0.4, 1.0, band) + uMouth.w * mx * 0.45);   // smile / frown, smirk
          dp -= uMouthF * max(curve, 0.0) * 0.0017 * xw * band;                                // smiling corners dig in
          dp += uMouthU * up * open * 0.0024 * max(0.0, 1.0 - xw) * band;                     // upper lip lifts when open
          dp += uMouthU * up * clamp(uMouth2.y, 0.0, 1.0) * 0.003 * smoothstep(0.1, 0.8, xn) * band; // sneer (left side)
          dp += uMouthF * pucker * 0.005 * max(0.0, 1.0 - xw) * band;                           // lips push forward
          iwPos += dp * w;
        }`);
    // stylised SSS: replace the Lambert lobe of the direct light with a per-channel wrapped profile + ear translucency
    shader.fragmentShader = shader.fragmentShader.replace('#include <lights_physical_pars_fragment>', /* glsl */`#include <lights_physical_pars_fragment>
      void RE_Direct_IwSkin(const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight) {
        vec3 dd = reflectedLight.directDiffuse;
        RE_Direct_Physical(directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight);
        if (iwSSS > 0.001) {
          float ndl = dot(geometryNormal, directLight.direction);
          vec3 w = uSSSW * iwSSS;
          vec3 lam = vec3(clamp(ndl, 0.0, 1.0));
          vec3 wrapD = clamp((vec3(ndl) + w) / (1.0 + w), 0.0, 1.0);
          wrapD = lam + max(wrapD - lam, 0.0) * (1.0 - smoothstep(0.05, 0.55, ndl));  // lit side stays neutral
          vec3 halfDir = normalize(directLight.direction + geometryViewDir);
          vec3 F = F_Schlick(material.specularColor, material.specularF90, clamp(dot(geometryViewDir, halfDir), 0.0, 1.0));
          vec3 base = directLight.color * BRDF_Lambert(material.diffuseContribution) * (1.0 - F);
          // terminator band picks up the scatter tint (red light that travelled under the skin)
          float band = clamp(1.0 - abs(ndl) * 3.2, 0.0, 1.0) * iwSSS;
          vec3 sss = wrapD * mix(vec3(1.0), uSSSTint * 1.6, band * 0.4);
          reflectedLight.directDiffuse = dd + base * mix(lam, sss, 0.85);
          // thin parts glow when lit from behind
          float back = pow(clamp(dot(geometryViewDir, -directLight.direction), 0.0, 1.0), 2.5);
          reflectedLight.directDiffuse += directLight.color * material.diffuseContribution * uSSSTint * (iwThin * back * 0.55 + iwThin * 0.12 * clamp(-ndl + 0.3, 0.0, 1.0));
        }
      }
      #undef RE_Direct
      #define RE_Direct RE_Direct_IwSkin`)
      .replace('#include <clearcoat_normal_fragment_maps>', '#include <clearcoat_normal_fragment_maps>\n#ifdef USE_CLEARCOAT\n clearcoatNormal = normal;\n#endif');   // clearcoat 0 → no USE_CLEARCOAT (LIFE fix)
  };
  m.customProgramCacheKey = () => 'iw-skin4';
  return m;
}
const clampN = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const lerpN = (a, b, t) => a + (b - a) * t;

// ================================================================================================
// CLOTH — tee, shorts, socks, sneakers, tank harness. One program; per-vertex colour source (aEx),
// part id + material class (aCloth.xy) and part coordinates (uv) drive seams, stitching, graphics,
// ribbing, weave micro-normals, tread and per-class roughness / metalness / sheen / clearcoat.
// ================================================================================================
// colour sources (aEx)
export const CS = { white: 0, team: 1, shirt: 2, shorts: 3, shoe: 4, sock: 5, sole: 6, strap: 7, shoe2: 8, outsole: 9, metal: 10, darkPlastic: 11, lace: 12, teamDark: 13, trim: 14 };
// material classes (aCloth.y)
export const MC = { jersey: 0, twill: 1, rib: 2, leather: 3, foam: 4, rubber: 5, plastic: 6, metal: 7, webbing: 8, mesh: 9, lace: 10, padding: 11, print: 12 };
// part ids (aCloth.x)
export const PART = { none: 0, tee: 1, sleeve: 2, collar: 3, shorts: 4, shortLeg: 5, sock: 6, upper: 7, midsole: 8, outsole: 9, strap: 10, tongue: 11, tankCap: 12, gauge: 13, hem: 14, cuff: 15, cord: 16, collarPad: 17, plate: 18, heelTab: 19, toeCap: 20 };

// squid badge shared by the cloth prints and the headgear embroidery
const EMBLEM = /* glsl */`
// squid badge: ink splat with a white squid glyph; returns (splat coverage, glyph coverage)
vec2 iwEmblem(vec2 q, float R) {
  float a = atan(q.y, q.x); float r = length(q);
  float wob = 1.0 + 0.1 * sin(5.0 * a + 0.6) + 0.06 * sin(9.0 * a + 2.1) + 0.035 * sin(14.0 * a + 1.0);
  float splat = r - R * wob;
  splat = min(splat, length(q - vec2(R * 1.18, R * 0.62)) - R * 0.13);
  splat = min(splat, length(q - vec2(-R * 1.12, -R * 0.7)) - R * 0.1);
  splat = min(splat, length(q - vec2(R * 0.5, -R * 1.22)) - R * 0.08);
  // glyph: one silhouette — arrowhead mantle with swept fins flowing into a tall body, low oval eyes, four tentacles
  vec2 g = q / R;
  float fins = max(abs(g.x) * 1.02 + (g.y - 0.7) * 0.95, -(g.y - 0.22));
  float body = iwSdBox(g - vec2(0.0, 0.06), vec2(0.17, 0.3), 0.15);
  float glyph = iwSmin(fins, body, 0.08);
  float tent = 1e3;
  for (int i = 0; i < 4; i++) {
    float fi = float(i) - 1.5;
    vec2 tq = g - vec2(fi * 0.1, -0.2);
    tq.x -= fi * 0.1 * smoothstep(0.0, -0.3, tq.y) + 0.03 * sin(tq.y * 13.0 + fi) * smoothstep(-0.05, -0.3, tq.y);
    float w = mix(0.052, 0.03, smoothstep(-0.02, -0.3, tq.y));
    tent = min(tent, iwSdBox(tq - vec2(0.0, -0.15), vec2(w, 0.15), 0.028));
  }
  glyph = iwSmin(glyph, tent, 0.05);
  vec2 e1 = (g - vec2(0.075, 0.0)) / vec2(0.04, 0.062), e2 = (g - vec2(-0.075, 0.0)) / vec2(0.04, 0.062);
  float eyes = (min(length(e1), length(e2)) - 1.0) * 0.04;
  glyph = max(glyph, -eyes);
  return vec2(iwFill(splat), iwFill(glyph * R));
}
`;

const CLOTH_GLSL = /* glsl */`
uniform vec3 uTeam; uniform vec3 uShirt; uniform vec3 uShorts; uniform vec3 uShoe; uniform vec3 uSole; uniform vec3 uSock; uniform vec3 uStrap; uniform float uPattern;
varying vec3 vCloth; varying vec2 vIwUv; varying float vOcc;
float iwLum(vec3 c){ return dot(c, vec3(0.299, 0.587, 0.114)); }
vec3 iwContrast(vec3 c){ return iwLum(c) > 0.42 ? c * 0.74 : c * 1.55 + 0.05; }
// ---- tee fine creases: complements the sculpted fold field of character-outfit.js ------------------------
float iwTeeCrease(vec3 p, float th) {
  float ax = abs(p.x), h = 0.0;
  float side = pow(abs(sin(th * 6.2831)), 2.0);
  float wy = (p.y - 0.705) / 0.0105 + 0.6 * sin(th * 6.2831 * 9.0 + p.y * 40.0);
  h += 0.00032 * side * exp(-pow((p.y - 0.765) / 0.035, 2.0)) * (0.5 + 0.5 * sin(wy * 6.2831));
  vec2 q = vec2(ax - 0.114, p.y - 0.884);
  float r = length(q), ang = atan(q.y, -q.x);
  h += 0.00011 * sin(ang * 17.0 + 1.3 + (p.z > 0.0 ? 0.0 : 2.1) + 2.5 * iwNoise(vec3(ang * 3.0, r * 60.0, p.z * 20.0))) * exp(-pow(r / 0.045, 2.0)) * smoothstep(0.006, 0.02, r) * (0.4 + 0.6 * iwNoise(p * 90.0));
  h += 0.00028 * sin(th * 6.2831 * 23.0 + 2.0 * sin(th * 30.0)) * (1.0 - smoothstep(0.698, 0.726, p.y));
  return h;
}
// ---- tee graphics -------------------------------------------------------------------------------
float iwShirtPattern(vec3 p) {
  float ax = abs(p.x);
  float m = 0.0;
  if (uPattern < 0.5) {            // ringer: no body pattern (trim + big emblem)
    m = 0.0;
  } else if (uPattern < 1.5) {     // double pinstripe
    m = iwBand(p.y, 0.842, 0.852) + iwBand(p.y, 0.866, 0.876);
  } else if (uPattern < 2.5) {     // raglan sleeves + side panel
    float sleeve = smoothstep(0.108, 0.115, ax) * step(0.86, p.y);
    m = max(sleeve, iwBand(ax, 0.098, 0.2) * step(p.y, 0.86) * step(0.74, p.y) * step(abs(p.z + 0.012), 0.05));
  } else {                         // chevron + hem band
    float y0 = 0.925 - 0.55 * ax;
    m = iwBand(p.y - y0, -0.022, 0.0) * step(0.0, p.z);
    m = max(m, iwBand(p.y, 0.726, 0.738));
  }
  return clamp(m, 0.0, 1.0);
}
// ---- outfit patterns 4+ (appended; 0–3 above stay byte-identical so saved looks keep their graphics) -------------
// collar rib / sleeve cuff colours per pattern
vec3 iwTrimCol() {
  float pat = floor(uPattern + 0.5);
  if (pat < 0.5 || pat == 3.0) return uTeam;
  if (pat < 2.5) return iwContrast(uShirt);
  if (pat == 6.0) return uShirt * 0.55;            // camo: dark olive rib
  if (pat == 7.0) return uShirt;                   // dip-dye: undyed collar
  return uTeam;                                    // breton, splatter, jersey, track
}
vec3 iwCuffCol() {
  float pat = floor(uPattern + 0.5);
  if (pat < 0.5 || pat == 3.0) return uTeam;
  if (pat < 2.5) return iwContrast(uShirt);
  if (pat == 4.0 || pat == 5.0) return uShirt;     // breton / splatter: plain cuff
  if (pat == 6.0) return uShirt * 0.55;
  if (pat == 7.0) return uTeam * 0.9;              // dip-dyed ends
  return uTeam;                                    // jersey, track
}
// ink splat stamped on the (roughly cylindrical) torso/sleeve around surface point c: wobbly rim + satellite drops
float iwSplat3(vec3 p, vec3 c, float R, float seed) {
  vec3 d = p - c;
  vec3 n = normalize(vec3(c.x, 0.0, c.z + 0.012));
  vec3 u = normalize(cross(vec3(0.0, 1.0, 0.0), n));
  vec2 q = vec2(dot(d, u), d.y);
  float a = atan(q.y, q.x);
  float wob = 1.0 + 0.13 * sin(5.0 * a + seed) + 0.07 * sin(9.0 * a + seed * 2.3) + 0.04 * sin(15.0 * a + seed * 0.7);
  float sd = length(q) - R * wob;
  for (int k = 0; k < 4; k++) {
    float fk = float(k); float aa = seed * 1.7 + fk * 1.9;
    vec2 o = vec2(cos(aa), sin(aa)) * R * (1.28 + 0.4 * fract(fk * 0.37 + seed));
    sd = min(sd, length(q - o) - R * (0.08 + 0.07 * fract(fk * 0.71 + seed * 0.3)));
  }
  sd = max(sd, abs(dot(d, n)) - 0.045);            // stay on this side of the body
  return iwFill(sd);
}
// athletic block digit (seven segments, rounded); q in digit units (half-width 0.5, half-height 1); SDF in units
float iwDigitSD(vec2 q, int dgt) {
  const int SEG[10] = int[10](0x3F, 0x06, 0x5B, 0x4F, 0x66, 0x6D, 0x7D, 0x07, 0x7F, 0x6F);
  int bits = SEG[clamp(dgt, 0, 9)];
  float d = 1e3;
  if ((bits & 1) != 0) d = min(d, iwSdBox(q - vec2(0.0, 0.86), vec2(0.4, 0.14), 0.07));
  if ((bits & 2) != 0) d = min(d, iwSdBox(q - vec2(0.36, 0.44), vec2(0.14, 0.42), 0.07));
  if ((bits & 4) != 0) d = min(d, iwSdBox(q - vec2(0.36, -0.44), vec2(0.14, 0.42), 0.07));
  if ((bits & 8) != 0) d = min(d, iwSdBox(q - vec2(0.0, -0.86), vec2(0.4, 0.14), 0.07));
  if ((bits & 16) != 0) d = min(d, iwSdBox(q - vec2(-0.36, -0.44), vec2(0.14, 0.42), 0.07));
  if ((bits & 32) != 0) d = min(d, iwSdBox(q - vec2(-0.36, 0.44), vec2(0.14, 0.42), 0.07));
  if ((bits & 64) != 0) d = min(d, iwSdBox(q, vec2(0.36, 0.13), 0.07));
  return d;
}
/** Base colour of shirt-slot fragments (tee body = part 1, sleeves = part 2). */
vec3 iwShirtCol(vec3 p, vec2 uv, float part) {
  if (uPattern < 3.5) return mix(uShirt, uTeam, iwShirtPattern(p));
  float pat = floor(uPattern + 0.5);
  vec3 c = uShirt;
  float ax = abs(p.x), zc = p.z + 0.012;
  if (pat == 4.0) {                        // BRETON: team stripes on the body and around the sleeves, plain yoke
    float sy, P, lo, hi;
    if (part < 1.5) { sy = p.y; P = 0.026; lo = 0.703; hi = 0.938; }
    else { sy = uv.y; P = 0.0235; lo = 0.036; hi = vCloth.z - 0.024; }
    float f = abs(fract((sy - lo) / P) - 0.5);
    float band = iwFill((f - 0.21) * P) * step(lo, sy) * step(sy, hi);
    float m = mix(0.42 * step(lo, sy) * step(sy, hi), band, iwLod(sy, P));
    c = mix(uShirt, uTeam, m);
  } else if (pat == 5.0) {                 // SPLATTER: team ink splats, drips and speckles on a dark tee
    float m = 0.0;
    m = max(m, iwSplat3(p, vec3(0.062, 0.93, 0.072), 0.042, 1.3));
    m = max(m, iwSplat3(p, vec3(-0.058, 0.768, 0.086), 0.025, 4.1));
    m = max(m, iwSplat3(p, vec3(-0.096, 0.952, -0.052), 0.04, 2.2));
    m = max(m, iwSplat3(p, vec3(0.03, 0.742, -0.088), 0.027, 5.7));
    m = max(m, iwSplat3(p, vec3(0.2, 0.872, 0.004), 0.028, 3.3));
    if (part < 1.5 && p.z > 0.0) {
      for (int k = 0; k < 3; k++) {
        float fk = float(k);
        float x0 = 0.04 + 0.019 * fk; float y1 = 0.905 - 0.018 * fk; float y0 = y1 - (0.07 + 0.04 * fract(fk * 0.618 + 0.3));
        float w = 0.0056 - 0.0012 * fk;
        float dd = iwSdSeg(vec2(p.x, p.y), vec2(x0, y0), vec2(x0, y1)) - w * mix(1.0, 0.7, (y1 - p.y) / (y1 - y0));
        dd = min(dd, length(vec2(p.x - x0, (p.y - y0) * 0.85)) - w * 1.5);
        m = max(m, iwFill(dd));
      }
    }
    vec3 cp = p * 75.0; vec3 cell = floor(cp); vec3 fr = fract(cp) - 0.5;
    float rnd = iwHash(cell);
    m = max(m, iwFill((length(fr) - 0.24 * rnd) / 75.0) * step(0.87, rnd) * iwLod(p.y * 75.0, 1.0));
    c = mix(uShirt, uTeam, m);
  } else if (pat == 6.0) {                 // SPLAT CAMO: sand + shadow blobs over olive, with a few team-ink patches
    vec3 q = p * vec3(15.0, 11.0, 15.0);
    float n1 = iwFbm(q + 3.1), n2 = iwFbm(q * 1.15 + 11.7), n3 = iwFbm(q * 0.85 + 27.3);
    c = mix(c, mix(uShirt, vec3(0.8, 0.76, 0.62), 0.5), iwFill(0.585 - n2));
    c = mix(c, uShirt * 0.5, iwFill(0.575 - n1));
    c = mix(c, uTeam, iwFill(0.655 - n3));
  } else if (pat == 7.0) {                 // DIP-DYE: team dye soaked up from the hem with a bleeding waterline
    float wav = 0.011 * sin(uv.x * 6.2831 * 3.0 + 1.1) + 0.024 * (iwFbm(p * 26.0) - 0.5);
    vec3 pale = mix(uTeam, uShirt, 0.42);
    if (part < 1.5) {
      float line = 0.792 + wav;
      float k = 1.0 - smoothstep(line - 0.026, line + 0.004, p.y);
      c = mix(uShirt, mix(pale, uTeam * 0.92, 1.0 - smoothstep(0.7, line, p.y)), k);
      float streak = smoothstep(0.62, 0.9, iwNoise(vec3(p.x * 170.0, p.y * 7.0, p.z * 170.0))) * (1.0 - smoothstep(line, line + 0.04, p.y)) * step(line - 0.004, p.y);
      c = mix(c, mix(uShirt, uTeam, 0.3), streak * 0.65);
    } else {
      float L = vCloth.z;
      float k = smoothstep(L - 0.075 + wav, L - 0.035 + wav, uv.y);
      c = mix(uShirt, mix(pale, uTeam * 0.92, smoothstep(L - 0.05, L, uv.y)), k);
    }
  } else if (pat == 8.0) {                 // JERSEY: team side panels with white piping, V-neck insert, shoulder yoke
    if (part < 1.5) {
      float side = step(0.07, ax);
      float panel = iwFill(abs(zc) - 0.043) * side * step(p.y, 0.95);
      float pipe = iwStroke(abs(zc) - 0.043, 0.0017) * side * step(p.y, 0.95);
      float vneck = iwSdSeg(vec2(ax, p.y), vec2(0.056, 1.0), vec2(0.0, 0.93));
      float v = iwFill(vneck - 0.0085) * step(0.0, p.z);
      float vpipe = iwStroke(vneck - 0.0085, 0.0015) * step(0.0, p.z);
      float yoke = smoothstep(0.962, 0.966, p.y) * (1.0 - v);
      c = mix(c, uTeam, max(max(panel, v), yoke));
      c = mix(c, vec3(0.96), max(pipe, vpipe));
    } else {
      float L = vCloth.z;
      float pipe = iwStroke(uv.y - (L - 0.03), 0.0016);
      c = mix(c, uTeam, smoothstep(0.02, 0.024, uv.y) * (1.0 - smoothstep(0.034, 0.038, uv.y)));   // shoulder yoke continues
      c = mix(c, vec3(0.96), pipe);
    }
  } else {                                 // TRACK TOP: twin white stripes down the sides and sleeves, team yoke
    vec3 sc = vec3(0.95);
    if (part < 1.5) {
      float st = (iwStroke(zc - 0.0085, 0.0032) + iwStroke(zc + 0.0085, 0.0032)) * step(0.07, ax);
      float yoke = smoothstep(0.955, 0.959, p.y);
      c = mix(c, uTeam, yoke);
      c = mix(c, sc, clamp(st, 0.0, 1.0));
      c = mix(c, sc, iwStroke(p.y - 0.957, 0.0014));
    } else {
      float dx = (fract(uv.x + 0.5) - 0.5) * 0.31;
      float st = iwStroke(dx - 0.0085, 0.0032) + iwStroke(dx + 0.0085, 0.0032);
      c = mix(c, uTeam, 1.0 - smoothstep(0.03, 0.034, uv.y));
      c = mix(c, sc, clamp(st, 0.0, 1.0) * smoothstep(0.03, 0.034, uv.y));
    }
  }
  return c;
}
${EMBLEM}
`;

export function makeClothMaterial(u) {
  const m = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, roughness: 0.82, metalness: 0, vertexColors: true,
    sheen: 1, sheenRoughness: 0.6, sheenColor: new THREE.Color(1, 1, 1), clearcoat: 1, clearcoatRoughness: 0.3,
  });
  m.onBeforeCompile = (shader) => {
    for (const k of ['uHurt', 'uHurtSeed', 'uFlash', 'uTeam', 'uShirt', 'uShorts', 'uShoe', 'uSole', 'uSock', 'uStrap', 'uPattern']) shader.uniforms[k] = u[k];
    inject(shader, {
      vPars: bodyVPars + 'attribute vec3 aCloth; varying vec3 vCloth; varying vec2 vIwUv; attribute float aOcc; varying float vOcc;',
      vBegin: bodyVBegin + 'vCloth = aCloth; vIwUv = uv; vOcc = aOcc;',
      fPars: bodyFPars + CLOTH_GLSL,
      fColor: /* glsl */`
        float iwH = 0.0; float iwAO = 1.0 - clamp(vOcc, 0.0, 0.95); float iwCls = floor(vCloth.y + 0.5); float iwPart = floor(vCloth.x + 0.5);
        float iwGloss = 0.0; float iwShine = 0.0; // extra clearcoat / sheen tweaks from decorations
        {
          float slot = floor(vEx + 0.5);
          vec3 p = vBindPos; vec2 uv = vIwUv;
          vec3 base = vec3(1.0);
          if (slot == 1.0) base = uTeam;
          else if (slot == 2.0) base = iwShirtCol(p, uv, iwPart);
          else if (slot == 3.0) base = uShorts;
          else if (slot == 4.0) base = uShoe;
          else if (slot == 5.0) base = uSock;
          else if (slot == 6.0) base = uSole;
          else if (slot == 7.0) base = uStrap;
          else if (slot == 8.0) base = iwContrast(uShoe);
          else if (slot == 9.0) base = mix(uSole * 0.3 + vec3(0.035), vec3(0.09, 0.09, 0.1), 0.35);
          else if (slot == 10.0) base = vec3(0.78, 0.8, 0.84);
          else if (slot == 11.0) base = uStrap * 0.55 + vec3(0.02);
          else if (slot == 12.0) base = mix(uSock, vec3(0.96), 0.6);
          else if (slot == 13.0) base = uTeam * 0.62;
          else if (slot == 14.0) base = iwTrimCol();

          // ---------------- part decorations ----------------
          if (iwPart == 1.0) { // TEE body: uv = (theta/2pi, y)
            float circ = 0.68;
            float th = uv.x;
            // side seams (x = +-90 deg) with twin stitching
            for (int s = 0; s < 2; s++) {
              float c = s == 0 ? 0.25 : 0.75;
              float dx = (th - c) * circ;
              float seam = iwStroke(dx, 0.0008);
              iwH -= 0.0005 * exp(-pow(dx / 0.0016, 2.0));
              float st = iwStroke(abs(dx) - 0.004, 0.0005) * iwDash(p.y, 0.0055, 0.6);
              base *= 1.0 - 0.12 * seam;
              base = mix(base, base * 0.8, st * iwLod(p.y, 0.0055));
              iwH += 0.00025 * st;
            }
            // double-needle hem stitching + hem fold
            float hy = p.y - vCloth.z;
            float st2 = (iwStroke(hy - 0.013, 0.0005) + iwStroke(hy - 0.019, 0.0005)) * iwDash(th * circ, 0.0055, 0.62);
            base = mix(base, base * 0.8, st2 * iwLod(th * circ, 0.0055));
            iwH += 0.0003 * st2 - 0.0006 * exp(-pow((hy - 0.024) / 0.002, 2.0));
            // fine creases riding on the sculpted folds (geometry carries the big ones): waist compression, underarm
            // crease fans, short vertical hem creases — per pixel, faded with footprint
            iwH += iwTeeCrease(p, th) * iwLod(p.y, 0.012);
            // chest emblem (pattern-dependent placement)
            if (p.z > 0.0) {
              vec2 q; float R; float on = 1.0;
              if (uPattern < 0.5) { q = vec2(p.x, p.y - 0.826); R = 0.038; }
              else if (uPattern < 1.5) { q = vec2(p.x, p.y - 0.927); R = 0.0135; }
              else if (uPattern < 2.5) { q = vec2(p.x, p.y - 0.818); R = 0.032; }
              else if (uPattern < 3.5) { q = vec2(p.x, p.y - 0.8); R = 0.028; }
              else if (uPattern < 4.5) { q = vec2(p.x, p.y - 0.927); R = 0.0135; }          // breton: small logo under the collar
              else if (uPattern < 5.5) { q = vec2(0.0); R = 1.0; on = 0.0; }                  // splatter: the splats are the graphic
              else if (uPattern < 6.5) { q = vec2(p.x - 0.05, p.y - 0.905); R = 0.0125; }     // camo: chest patch
              else if (uPattern < 7.5) { q = vec2(p.x, p.y - 0.862); R = 0.03; }              // dip-dye: emblem above the dye line
              else if (uPattern < 8.5) { q = vec2(0.0); R = 1.0; on = 0.0; }                  // jersey: number instead
              else { q = vec2(p.x - 0.048, p.y - 0.925); R = 0.0115; }                        // track: small chest logo
              if (on > 0.5) {
                vec2 e = iwEmblem(q, R);
                vec3 ink = uTeam;
                base = mix(base, ink, e.x);
                base = mix(base, uShirt * 1.02 + 0.02, e.y * e.x);
                iwH += 0.00018 * e.x;             // screen print sits slightly proud
                iwShine += 0.35 * e.x;            // plastisol print: a touch glossier
              }
              if (uPattern > 7.5 && uPattern < 8.5) {
                // jersey number (stable per character: derived from the per-character seed), team fill + dark outline
                float no = floor(fract(uHurtSeed * 0.6180339 + 0.137) * 98.0) + 1.0;
                float d1 = floor(no / 10.0), d0 = no - d1 * 10.0;
                vec2 nq = vec2(p.x, p.y - 0.8) / 0.029;
                float sd = d1 > 0.5 ? min(iwDigitSD(nq - vec2(-0.6, 0.0), int(d1)), iwDigitSD(nq - vec2(0.6, 0.0), int(d0))) : iwDigitSD(nq, int(d0));
                sd *= 0.029;
                float nf = iwFill(sd), no2 = iwFill(sd - 0.0034);
                base = mix(base, vec3(0.09, 0.1, 0.12), no2);
                base = mix(base, uTeam, nf);
                iwH += 0.00016 * no2; iwShine += 0.3 * no2;
              } else if (uPattern > 8.5) {
                // track top: centre-front zip — dark tape, metal teeth, pull tab at the collar
                float zx = abs(p.x);
                float tape = iwFill(zx - 0.0046) * step(p.y, 0.994);
                base = mix(base, uShirt * 0.45 + 0.01, tape);
                float teeth = iwFill(zx - 0.0021) * mix(0.6, step(0.5, fract(p.y / 0.0034)), iwLod(p.y, 0.0034)) * step(p.y, 0.992);
                base = mix(base, vec3(0.74, 0.76, 0.8), teeth);
                float pull = iwFill(iwSdBox(vec2(p.x - 0.0036, p.y - 0.968), vec2(0.0034, 0.0088), 0.0022));
                base = mix(base, vec3(0.8, 0.82, 0.86), pull);
                iwH += 0.00025 * (teeth + pull) - 0.0002 * tape;
                iwShine += teeth + pull;
              }
            }
            // lower-back print (visible around the tank from the gameplay camera)
            if (p.z < 0.0 && uPattern > 0.5 && uPattern < 3.5) {
              float band = iwBand(p.y, 0.735, 0.748) * step(0.06, abs(p.x));
              base = mix(base, uTeam, band * 0.9);
            }
            // tank-strap pressure shading on the shoulders (strap sits on top)
            iwAO *= 1.0 - 0.18 * exp(-pow((abs(p.x) - 0.075) / 0.018, 2.0)) * smoothstep(0.9, 0.98, p.y);
          } else if (iwPart == 2.0) { // SLEEVE: uv = (theta, s along from shoulder)
            float s = uv.y, L = vCloth.z;
            float cuff = smoothstep(L - 0.02, L - 0.018, s);
            base = mix(base, slot == 2.0 ? iwCuffCol() : base, cuff);
            float circ = 0.3;
            float st = iwStroke(s - (L - 0.024), 0.0005) * iwDash(uv.x * circ, 0.005, 0.6);
            float st2 = iwStroke(s - 0.012, 0.0005) * iwDash(uv.x * circ, 0.005, 0.6);
            base = mix(base, base * 0.78, (st + st2) * iwLod(uv.x * circ, 0.005));
            iwH += 0.0003 * (st + st2);
            // rib on the cuff
            float rib = sin(uv.x * 6.2831 * 70.0);
            iwH += cuff * 0.00035 * rib * iwLod(uv.x * circ, circ / 70.0);
            // crease folds at the armpit side
            iwH += 0.0012 * sin(uv.x * 6.2831 * 3.0 + s * 60.0) * smoothstep(0.03, 0.0, s);
          } else if (iwPart == 3.0) { // COLLAR rib: uv = (theta, across)
            float rib = sin(uv.x * 6.2831 * 90.0);
            iwH += 0.0004 * rib * iwLod(uv.x * 0.3, 0.3 / 90.0);
            iwAO *= mix(0.8, 1.0, smoothstep(0.0, 0.35, uv.y));
          } else if (iwPart == 4.0 || iwPart == 5.0) { // SHORTS: uv = (theta, y | s)
            float circ = iwPart == 4.0 ? 0.66 : 0.46;
            float th = uv.x;
            // side seams + a team side stripe on some outfits
            float dx0 = (th - 0.25) * circ, dx1 = (th - 0.75) * circ;
            float dxs = iwPart == 4.0 ? min(abs(dx0), abs(dx1)) : abs(th - 0.5) * circ;   // legs: uv.x 0 = inseam, 0.5 = outer seam
            iwH -= 0.0005 * exp(-pow(dxs / 0.0016, 2.0));
            float stripe = 0.0; vec3 stripeC = uTeam;
            if (uPattern > 0.5 && uPattern < 2.5) stripe = iwStroke(dxs, 0.0065);
            else if (uPattern > 7.5 && uPattern < 8.5) stripe = iwStroke(dxs, 0.011);                                   // jersey: wide team panel
            else if (uPattern > 8.5) { stripe = iwStroke(dxs - 0.0075, 0.0026); stripeC = vec3(0.95); }                // track: twin white stripes
            base = mix(base, stripeC, stripe);
            float ss = iwStroke(dxs - 0.0045, 0.00045) * iwDash(p.y, 0.005, 0.6);
            base = mix(base, base * 0.75 + 0.02, ss * iwLod(p.y, 0.005));
            if (iwPart == 4.0) {
              vec2 f = vec2(p.x, p.y);
              // front: fly J-stitch + slant pocket openings
              if (p.z > 0.0) {
                float fly = iwSdSeg(f, vec2(0.012, 0.745), vec2(0.012, 0.64));
                fly = min(fly, iwSdSeg(f, vec2(0.012, 0.64), vec2(0.0, 0.625)));
                float fs = iwStroke(fly, 0.0005) * iwDash(p.y + p.x, 0.005, 0.6);
                base = mix(base, base * 0.72 + 0.02, fs * iwLod(p.y, 0.005));
                iwH -= 0.0006 * exp(-pow(abs(p.x) / 0.0018, 2.0)) * step(0.63, p.y);
                for (int s = -1; s <= 1; s += 2) {
                  float sx = float(s);
                  float pk = iwSdSeg(f, vec2(sx * 0.062, 0.752), vec2(sx * 0.112, 0.668));
                  iwH -= 0.0009 * exp(-pow(pk / 0.0018, 2.0));
                  float ps = iwStroke(pk - 0.004, 0.00045) * iwDash(p.y, 0.005, 0.6);
                  base = mix(base, base * 0.72 + 0.02, ps * iwLod(p.y, 0.005));
                  iwAO *= 1.0 - 0.25 * exp(-pow(pk / 0.003, 2.0));
                }
              } else {
                // back patch pockets with a little team label on the right one
                for (int s = -1; s <= 1; s += 2) {
                  float sx = float(s);
                  float pb = iwSdBox(f - vec2(sx * 0.058, 0.668), vec2(0.036, 0.04), 0.01);
                  iwH += 0.0008 * (1.0 - smoothstep(-0.002, 0.0015, pb));
                  float ps = (iwStroke(pb + 0.0035, 0.00045)) * iwDash(p.x + p.y, 0.005, 0.6);
                  base = mix(base, base * 0.72 + 0.02, ps * iwLod(p.y, 0.005));
                  iwAO *= 1.0 - 0.3 * exp(-pow(pb / 0.0022, 2.0)) * step(0.0, pb);
                  if (s < 0) { float lab = iwSdBox(f - vec2(sx * 0.03, 0.692), vec2(0.006, 0.012), 0.002); base = mix(base, uTeam, iwFill(lab)); }
                }
                // seat seam
                iwH -= 0.0006 * exp(-pow(p.x / 0.0017, 2.0));
              }
              // waistband stitch (mostly under the tee hem)
              float ws = iwStroke(p.y - 0.735, 0.0005) * iwDash(th * circ, 0.005, 0.6);
              base = mix(base, base * 0.75, ws);
            } else {
              // leg: inseam
              float dxi = min(th, 1.0 - th) * circ;
              iwH -= 0.0004 * exp(-pow(dxi / 0.0015, 2.0));
              // hem stitch above the cuff
              float L = vCloth.z;
              float hs = iwStroke(uv.y - (L - 0.02), 0.00045) * iwDash(th * circ, 0.005, 0.6);
              base = mix(base, base * 0.72 + 0.02, hs * iwLod(th * circ, 0.005));
              // relaxed folds
              iwH += 0.0013 * sin(th * 6.2831 * 5.0 + uv.y * 30.0) * smoothstep(0.02, 0.1, uv.y);
            }
          } else if (iwPart == 6.0) { // SOCK: uv = (theta, s from top)
            float rib = sin(uv.x * 6.2831 * 56.0);
            iwH += 0.00045 * rib * iwLod(uv.x * 0.22, 0.22 / 56.0);
            float s = uv.y;
            float stripes = iwBand(s, 0.018, 0.026) + iwBand(s, 0.033, 0.041);
            base = mix(base, uTeam, stripes);
            iwH += 0.0012 * sin(s * 190.0 + uv.x * 18.0) * smoothstep(0.05, 0.1, s) * smoothstep(0.14, 0.1, s); // scrunch
          } else if (iwPart == 7.0) { // SHOE UPPER (base layer): uv = (phi/2pi from the toe, t sole->collar, > 1 = lining)
            float phi = uv.x, t = uv.y;
            float front = cos(phi * 6.2831);
            // perforated toe box (vamp top, between the mudguard and the throat)
            float perfZ = smoothstep(0.72, 0.82, front) * smoothstep(0.47, 0.51, t) * smoothstep(0.62, 0.58, t);
            vec2 pp = vec2(p.x, p.z) * 260.0; pp.x += 0.5 * step(0.5, fract(pp.y * 0.5)); vec2 pc = fract(pp) - 0.5;
            float perf = iwFill(length(pc) - 0.16) * perfZ * iwLod(p.z * 260.0, 1.0) * iwLod(p.x * 260.0, 1.0);
            iwAO *= 1.0 - 0.55 * perf; iwH -= 0.00018 * perf;
            // fine pebbled grain, faded with pixel footprint (no shimmer)
            iwH += 0.00005 * (iwNoise(p * 1400.0) - 0.5) * iwLod(p.z * 1400.0, 2.0);
            iwAO *= mix(0.7, 1.0, smoothstep(0.0, 0.14, t));   // contact darkening at the sole line
            if (t > 1.001) iwAO *= 0.55;                       // lining inside the collar
          } else if (iwPart == 20.0) { // SHOE OVERLAYS (vCloth.z: 0 mudguard, 1 heel counter, 2 eyestay, 3 side panel); uv = patch (u, v)
            float ov = floor(vCloth.z + 0.5);
            vec2 q = uv;
            // twin-needle stitching inset from the free edges
            float st = 0.0;
            if (ov < 0.5) st = (iwStroke(q.y - 0.86, 0.018) + iwStroke(q.y - 0.79, 0.018)) * iwDash(q.x * 0.14, 0.0035, 0.6);
            else if (ov < 1.5) st = iwStroke(q.y - 0.88, 0.02) * iwDash(q.x * 0.12, 0.0035, 0.6);
            else if (ov < 2.5) st = (iwStroke(q.x - 0.84, 0.03) + iwStroke(q.x - 0.15, 0.03)) * iwDash(q.y * 0.06, 0.0035, 0.6);
            else st = (iwStroke(q.y - 0.8, 0.045) + iwStroke(q.y - 0.2, 0.045)) * iwDash(q.x * 0.1, 0.0035, 0.6) * step(0.06, q.x) * step(q.x, 0.97);
            st = clamp(st, 0.0, 1.0) * step(0.05, q.y) * iwLod(q.x * 0.1, 0.0035);
            base = mix(base, base * 0.62 + 0.04, st * 0.9);
            iwH += 0.00018 * st;
            iwH += 0.00004 * (iwNoise(p * 1600.0) - 0.5) * iwLod(p.z * 1600.0, 2.0);
            if (ov > 2.5) iwShine += 0.45;                     // glossy synthetic side panel
          } else if (iwPart == 8.0) { // MIDSOLE / cupsole wall: uv = (phi, h 0..1)
            float phi = uv.x, h = uv.y;
            float front = cos(phi * 6.2831), side = sin(phi * 6.2831);
            // thread in the sculpted stitch channel (h = 0.64)
            float st = iwStroke(h - 0.64, 0.035) * iwDash(phi * 0.62, 0.0042, 0.62) * iwLod(phi * 0.62, 0.0042);
            base = mix(base, base * 0.62 + vec3(0.02), st);
            iwH += 0.00018 * st;
            // team pinstripe near the top edge
            float pin = iwStroke(h - 0.82, 0.035) * step(abs(front), 0.96);
            base = mix(base, uTeam, pin * 0.95);
            // fine horizontal sidewall ribs (cupsole texture) below the channel
            iwH += 0.00016 * sin(h * 6.2831 * 9.0) * smoothstep(0.08, 0.2, h) * smoothstep(0.58, 0.5, h);
            // heel window (team) on both sides
            float win = iwSdBox(vec2(front + 0.64, h - 0.34), vec2(0.16, 0.14), 0.08);
            float wm = iwFill(win * 0.05) * step(0.3, abs(side));
            base = mix(base, uTeam * 0.85, wm);
            iwH -= 0.0005 * wm; iwShine += wm;
            // foam micro texture + grime near the ground and scuffs on the toe
            iwH += 0.00008 * (iwNoise(p * 700.0) - 0.5) * iwLod(p.z * 700.0, 1.0);
            float grime = (1.0 - smoothstep(0.0, 0.35, h)) * (0.55 + 0.45 * iwFbm(p * 90.0));
            float scuff = smoothstep(0.62, 0.8, iwFbm(p * 140.0 + 3.0)) * smoothstep(0.3, 0.9, front);
            base *= 1.0 - 0.13 * grime - 0.1 * scuff;
          } else if (iwPart == 9.0) { // OUTSOLE: uv = foot-local (x, z)
            vec2 f = uv;
            float edgeZone = step(0.5, vCloth.z);
            // herringbone traction pattern on the bottom
            float herr = abs(fract(f.y * 55.0 + abs(f.x) * 22.0) - 0.5);
            float lug = smoothstep(0.18, 0.26, herr);
            iwH += 0.0012 * lug * (1.0 - edgeZone) * iwLod(f.y * 55.0, 1.0);
            iwAO *= mix(0.6, 1.0, mix(lug, 1.0, edgeZone));
            // worn rubber: glazed at the toe + heel strike, dust on the wall
            float wear = smoothstep(0.05, 0.11, f.y) + smoothstep(-0.03, -0.07, f.y);
            base = mix(base, base * 1.35 + 0.04, 0.35 * wear * (1.0 - edgeZone) * lug);
            base = mix(base, base * 0.8 + vec3(0.03, 0.028, 0.025), edgeZone * (0.4 + 0.6 * iwFbm(p * 120.0)) * 0.5);
          } else if (iwPart == 10.0) { // STRAP webbing: uv = (along m, across -1..1)
            float edge = abs(uv.y);
            float st = iwStroke(edge - 0.72, 0.035) * iwDash(uv.x, 0.005, 0.62);
            base = mix(base, base * 0.6 + 0.06, st * iwLod(uv.x, 0.005));
            iwH += 0.00025 * st;
            iwAO *= mix(1.0, 0.8, smoothstep(0.8, 1.0, edge));
          } else if (iwPart == 11.0) { // TONGUE: uv = (across -1..1, along 0..1); team tab + logo at the top
            float tab = smoothstep(0.78, 0.8, uv.y);
            base = mix(base, uTeam, tab);
            vec2 e = iwEmblem(vec2(uv.x * 0.018, (uv.y - 0.9) * 0.02), 0.0065);
            base = mix(base, vec3(0.97), e.x * tab);
            float st = iwStroke(abs(uv.x) - 0.82, 0.03) * iwDash(uv.y * 0.05, 0.004, 0.6);
            base = mix(base, base * 0.7, st);
            vec2 mp = vec2(uv.x * 0.02, uv.y * 0.05) * 700.0; // mesh
            float mh = iwFill(length(fract(mp) - 0.5) - 0.2) * (1.0 - tab) * iwLod(uv.y * 0.05 * 700.0, 1.0);
            iwAO *= 1.0 - 0.35 * mh;
          } else if (iwPart == 12.0) { // TANK CAP: uv = (theta, h); knurled grip band
            float kn = sin(uv.x * 6.2831 * 48.0);
            float band = step(0.18, uv.y) * step(uv.y, 0.82);
            iwH += 0.0005 * kn * band * iwLod(uv.x * 0.42, 0.42 / 48.0);
          } else if (iwPart == 13.0) { // GAUGE face: uv = polar (angle 0..1, r 0..1)
            float a = uv.x, r = uv.y;
            vec3 face = vec3(0.95, 0.94, 0.9);
            float ticks = iwStroke(fract(a * 24.0) - 0.5, 0.06) * step(0.72, r) * step(r, 0.9) * step(0.1, a) * step(a, 0.9);
            float red = step(0.72, r) * step(r, 0.9) * step(0.78, a) * step(a, 0.9);
            face = mix(face, vec3(0.1), ticks);
            face = mix(face, vec3(0.85, 0.15, 0.12), red);
            base = mix(face, vec3(0.05), smoothstep(0.93, 0.97, r));
          } else if (iwPart == 15.0) { // shorts CUFF: rolled hem, rib-less twill + stitch
            float st = iwStroke(uv.y - 0.5, 0.05) * iwDash(uv.x * 0.46, 0.005, 0.6);
            base = mix(base, base * 0.75, st);
          } else if (iwPart == 17.0) { // COLLAR PAD: soft quilting lines
            iwH += 0.0005 * sin(uv.x * 6.2831 * 14.0);
          } else if (iwPart == 18.0) { // PLATE: quilted back pad
            vec2 q = vec2(uv.x, uv.y) * 38.0;
            float quilt = iwStroke(fract(q.x + q.y) - 0.5, 0.03) + iwStroke(fract(q.x - q.y) - 0.5, 0.03);
            iwH -= 0.0004 * quilt; iwAO *= 1.0 - 0.18 * quilt;
          } else if (iwPart == 16.0) { // drawcord: twisted
            iwH += 0.0003 * sin(uv.x * 900.0 + uv.y * 6.2831 * 3.0);
          }

          // ---------------- material-class micro detail ----------------
          if (iwCls == 0.0) {        // jersey knit: columns of tiny V loops (~1.1 mm wales), gone before it can shimmer
            float wale = (atan(p.x, p.z + 0.012) * 0.105 + p.x * 0.0) * 900.0, course = p.y * 1150.0;
            float v = abs(fract(wale) - 0.5) * 2.0;
            float k = sin((course + v * 0.9) * 6.2831);
            iwH += 0.000028 * k * iwLod(course, 1.0) * iwLod(wale, 1.0);
          } else if (iwCls == 1.0) { // twill: fine 45-degree wales (~1 mm) over a slubby yarn, faded with footprint
            float w = (p.y * 0.8 + (p.x + p.z) * 0.6) * 6400.0;
            float k = sin(w + 1.3 * iwNoise(p * 420.0));
            iwH += 0.000035 * k * iwLod(w, 6.2831);
            iwH += 0.00004 * (iwNoise(p * 260.0) - 0.5) * iwLod(p.y * 260.0, 1.0);
          } else if (iwCls == 8.0) { // webbing: cross ribs
            float k = sin(uv.x * 2600.0);
            iwH += 0.00004 * k * iwLod(uv.x * 2600.0, 6.2831);
          } else if (iwCls == 10.0) { // lace braid
            iwH += 0.00012 * sin(uv.x * 1800.0) * iwLod(uv.x * 1800.0, 6.2831);
          }
          diffuseColor.rgb *= base;
        }
      ` + HURT_FRAG,
      fRough: /* glsl */`
        {
          float r = 0.84;
          if (iwCls == 1.0) r = 0.8; else if (iwCls == 2.0) r = 0.86; else if (iwCls == 3.0) r = 0.46; else if (iwCls == 4.0) r = 0.62;
          else if (iwCls == 5.0) r = 0.86; else if (iwCls == 6.0) r = 0.3; else if (iwCls == 7.0) r = 0.28; else if (iwCls == 8.0) r = 0.7;
          else if (iwCls == 9.0) r = 0.74; else if (iwCls == 10.0) r = 0.8; else if (iwCls == 11.0) r = 0.78; else if (iwCls == 12.0) r = 0.5;
          roughnessFactor = mix(r, r * 0.55, clamp(iwShine, 0.0, 1.0));
          roughnessFactor = mix(roughnessFactor, 0.16, iwHurtM);
        }
      `,
      fMetal: 'metalnessFactor = iwCls == 7.0 ? 1.0 : 0.0;',
      fNormal: 'normal = iwBumpN(normal, iwH, -vViewPosition);',
      fEmissive: 'totalEmissiveRadiance += uFlash;',
      fLights: /* glsl */`
        {
          float cc = 0.0, ccr = 0.3, sh = 0.0, shr = 0.6;
          if (iwCls == 0.0) { sh = 0.55; shr = 0.55; }        // jersey
          else if (iwCls == 1.0) { sh = 0.35; shr = 0.5; }    // twill
          else if (iwCls == 2.0) { sh = 0.6; shr = 0.45; }    // rib knit
          else if (iwCls == 3.0) { cc = 0.35; ccr = 0.28; sh = 0.1; }
          else if (iwCls == 4.0) { cc = 0.05; ccr = 0.5; }
          else if (iwCls == 6.0) { cc = 1.0; ccr = 0.12; }
          else if (iwCls == 7.0) { cc = 0.4; ccr = 0.15; }
          else if (iwCls == 8.0) { sh = 0.45; shr = 0.4; }
          else if (iwCls == 9.0) { sh = 0.4; shr = 0.4; }
          else if (iwCls == 10.0) { sh = 0.5; shr = 0.4; }
          else if (iwCls == 11.0) { sh = 0.7; shr = 0.35; }
          cc = max(cc, iwShine * 0.6); ccr = mix(ccr, 0.15, clamp(iwShine, 0.0, 1.0));
          cc = mix(cc, 1.0, iwHurtM);
          #ifdef USE_CLEARCOAT
            material.clearcoat = cc; material.clearcoatRoughness = max(ccr, 0.06);
          #endif
          #ifdef USE_SHEEN
            material.sheenColor = mix(vec3(1.0), diffuseColor.rgb * 1.3 + 0.12, 0.6) * sh * (1.0 - iwHurtM);
            material.sheenRoughness = shr;
          #endif
        }
      `,
      fAO: 'reflectedLight.indirectDiffuse *= iwAO; reflectedLight.directDiffuse *= mix(1.0, iwAO, 0.35); reflectedLight.indirectSpecular *= mix(1.0, iwAO, 0.7);',
    });
  };
  m.customProgramCacheKey = () => 'iw-cloth4';
  return m;
}

// ================================================================================================
// HAIR — glossy team-ink tentacles. Strands: colour = (t, suckers, sin(angle)), uv = (distance, cos(angle)).
// Cap: colour.b >= 1.5, uv = (az, el) → bundle grooves radiating from the crown. Gear accessories
// (aTint <= -1.5): colour = rgb (r < 0 → team × g), class = -aTint - 2 (0 plastic, 1 metal, 2 fabric, 3 rubber).
// ================================================================================================
// Headgear fabrics (hair-mesh gear classes 4–6). uv.x = around the head (0.5 = front), uv.y = height above the rim in
// radians (crown rows continue as 0.32 + fraction to the top); uv.y ≥ 2 = cap bill / bucket brim (2 + s top, 3.2 + s under).
const HAT_GLSL = /* glsl */`
void iwHatShade(float cls, vec2 uv, vec3 bp, inout vec3 col, inout float h, inout float ao) {
  vec3 hd = normalize(bp - vec3(0.0, 1.214, 0.012));
  float ce = max(length(hd.xz), 0.05);                     // cos(elevation): the panels converge toward the crown
  float u = uv.x, v = uv.y;
  bool under = v > 3.1; float s = under ? v - 3.2 : v - 2.0;
  if (cls < 4.5) {                                         // ---- SNAPBACK: twill, six panels, eyelets, logo, stitched bill
    float tw = sin((bp.y * 0.9 + (bp.x + bp.z) * 0.6) * 1500.0);
    h += 0.00007 * tw * iwLod(bp.y * 1500.0, 6.2831);
    if (v < 1.9) {
      float su = (u - 0.5) * 6.0;
      float md = abs(fract(su + 0.5) - 0.5) / 6.0 * 1.19 * ce;       // metres to the nearest panel seam
      float seam = iwStroke(md, 0.0009);
      float st = iwStroke(md - 0.0042, 0.00045) * iwDash(v * 0.19, 0.0045, 0.62);
      col *= 1.0 - 0.18 * seam; col = mix(col, col * 0.72 + 0.03, st * iwLod(v * 0.19, 0.0045));
      h += 0.0007 * exp(-pow(md / 0.003, 2.0)) - 0.0005 * seam + 0.0002 * st;
      // eyelets high on every panel
      float pu = (fract(su) - 0.5) / 6.0 * 1.19 * ce;
      float ey = length(vec2(pu, (v - 0.86) * 0.1)) ;
      float eyR = iwStroke(ey - 0.0034, 0.0011), eyH = iwFill(ey - 0.0024);
      col = mix(col, col * 0.6, eyR); col = mix(col, vec3(0.02), eyH * 0.9); h += 0.0003 * eyR - 0.0004 * eyH;
      // front logo: team squid badge embroidered over the centre seam
      vec2 lq = vec2((u - 0.5) * 1.19 * ce, (v < 0.32 ? v * 0.19 : (0.32 + (v - 0.32) * 0.55) * 0.19) - 0.058);
      vec2 e = iwEmblem(lq, 0.026);
      col = mix(col, uTeam, e.x); col = mix(col, vec3(0.97), e.x * e.y);
      h += 0.0004 * e.x;
      ao *= mix(0.78, 1.0, smoothstep(0.0, 0.03, v));      // the rim sits in its own shadow
    } else {
      float rows = 0.0;
      for (int k = 0; k < 4; k++) rows += iwStroke(s - (0.52 + 0.12 * float(k)), 0.008);
      col = mix(col, col * 0.7 + 0.03, clamp(rows, 0.0, 1.0) * 0.8);
      h += 0.0002 * rows;
      h -= 0.0012 * smoothstep(0.9, 1.02, s);              // rounded bill edge
    }
  } else if (cls < 5.5) {                                  // ---- BEANIE: rib knit, folded cuff with a team stripe
    float rib = sin(u * 6.2831 * 76.0);
    h += 0.00055 * rib * iwLod(u * 76.0 * ce, 1.0);
    col *= 1.0 - 0.07 * (rib * 0.5 + 0.5) * iwLod(u * 76.0 * ce, 1.0);
    h += 0.00022 * sin(v * 540.0) * iwLod(v * 540.0, 6.2831);          // knit loops
    if (v < 0.21) {
      float stripe = iwBand(v, 0.07, 0.112);
      col = mix(col, uTeam, stripe);
      col = mix(col, vec3(0.95), iwBand(v, 0.058, 0.066) + iwBand(v, 0.116, 0.124));
    }
    h -= 0.0011 * exp(-pow((v - 0.2) / 0.006, 2.0));                    // fold of the cuff
    ao *= 1.0 - 0.32 * exp(-pow((v - 0.206) / 0.012, 2.0));
  } else {                                                  // ---- BUCKET: canvas, team band, stitched brim
    float wv = sin(bp.x * 2600.0) * sin(bp.y * 2600.0 + bp.z * 1300.0);
    h += 0.00006 * wv * iwLod(bp.y * 2600.0, 6.2831);
    if (v < 1.9) {
      col = mix(col, uTeam, iwBand(v, 0.018, 0.08));
      float st = (iwStroke(v - 0.098, 0.0016) + iwStroke(v - 0.118, 0.0016)) * iwDash(u * 1.19 * ce, 0.004, 0.6);
      col = mix(col, col * 0.7 + 0.03, st);
      float su = u * 4.0; float md = abs(fract(su + 0.5) - 0.5) / 4.0 * 1.19 * ce;
      col *= 1.0 - 0.14 * iwStroke(md, 0.001) * step(0.08, v);
      h -= 0.0004 * iwStroke(md, 0.001) * step(0.08, v);
      ao *= mix(0.72, 1.0, smoothstep(0.0, 0.025, v));
    } else {
      float rows = 0.0;
      for (int k = 0; k < 6; k++) rows += iwStroke(s - (0.16 + 0.135 * float(k)), 0.01);
      col = mix(col, col * 0.68 + 0.03, clamp(rows, 0.0, 1.0) * iwDash(u * 3.4, 0.004, 0.62));
      h -= 0.00025 * rows;
      h -= 0.001 * smoothstep(0.92, 1.02, s);
    }
  }
}
`;

// ================================================================================================
// GUMMY INK — the tentacle hair + squid form: glossy, translucent ink jelly without a transmission pass.
//  • light bleeds through thin parts (tips, ribbon edges, cup rims) when back-lit, and soaks round the terminator, in a
//    saturated team tint (a per-light term added to three's RE_Direct, so it follows every key / rim / neon light);
//  • a deeper, more saturated core where the view ray crosses more jelly; a lighter, wetter skin where it crosses little;
//  • sharp clearcoat highlight over a soft base-layer lobe, baked contact occlusion in crevices and at the roots.
// Per fragment the colour stage fills iwGumOn (0 = opaque gear), iwGumThin (0 thick … 1 thin), iwGumTrans (bleed tint).
// ================================================================================================
const GUMMY_PARS = /* glsl */`
vec3 iwGumTrans = vec3(0.0); float iwGumThin = 0.0; float iwGumOn = 0.0;
vec3 iwSat(vec3 c, float k){ float l = dot(c, vec3(0.2126, 0.7152, 0.0722)); return max(mix(vec3(l), c, k), 0.0); }
`;
const GUMMY_LIGHT = /* glsl */`
void iwRE_Direct( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
  RE_Direct_Physical( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
  if ( iwGumOn > 0.001 ) {
    vec3 L = directLight.direction, N = geometryNormal, V = geometryViewDir;
    float ndl = dot( N, L );
    float wrap = clamp( ( ndl + 0.6 ) / 1.6, 0.0, 1.0 );
    float soak = max( wrap * wrap - max( ndl, 0.0 ), 0.0 );               // light soaking round the shadow edge
    vec3 Lb = normalize( L + N * 0.45 );
    float back = pow( clamp( dot( V, -Lb ), 0.0, 1.0 ), 3.0 );             // looking through the jelly toward the light
    vec3 tr = pow( max( iwGumTrans, vec3( 1e-4 ) ), vec3( mix( 2.1, 0.85, iwGumThin ) ) );   // Beer–Lambert: longer path → deeper
    vec3 bleed = tr * back * ( 0.12 + 2.6 * iwGumThin * iwGumThin + 0.35 * iwGumThin ) + pow( max( iwGumTrans, vec3( 1e-4 ) ), vec3( 1.8 ) ) * soak * 0.4;
    reflectedLight.directDiffuse += iwGumOn * directLight.color * bleed * RECIPROCAL_PI;
  }
}
#undef RE_Direct
#define RE_Direct iwRE_Direct
`;
const GUMMY_AMBIENT = /* glsl */`
#if defined( RE_IndirectDiffuse )
  // sky / bounce light glowing through the thin parts (inner glow), occluded in crevices
  reflectedLight.indirectDiffuse += iwGumOn * iwGumTrans * RECIPROCAL_PI * ( irradiance + iblIrradiance ) * ( 0.015 + 0.14 * iwGumThin * iwGumThin ) * iwAO;
#endif
`;
function injectGummy(shader) {
  shader.fragmentShader = shader.fragmentShader.replace('#include <lights_physical_pars_fragment>', '#include <lights_physical_pars_fragment>\n' + GUMMY_LIGHT);
}

export function makeHairMaterial(u) {
  const m = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.34, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05, sheen: 1, sheenRoughness: 0.4, sheenColor: new THREE.Color(1, 1, 1), specularIntensity: 1 });
  m.onBeforeCompile = (shader) => {
    for (const k of ['uHurt', 'uHurtSeed', 'uFlash', 'uTeam', 'uGlow', 'uShirt', 'uShorts', 'uStrap']) shader.uniforms[k] = u[k];
    inject(shader, {
      vPars: `varying vec3 vBindPos; attribute float aTint; varying float vTint; varying vec4 vStrand; varying float vSinA; varying vec3 vGearCol;
        attribute vec3 aHair; varying vec3 vHair;
        #ifndef USE_COLOR
        attribute vec3 color;
        #endif`,
      vBegin: 'vBindPos = position; vTint = aTint; vStrand = vec4(color.r, color.g, uv.x, uv.y); vSinA = color.b * 2.0 - 1.0; vGearCol = color; vHair = aHair;',
      fPars: bodyFPars.replace('varying float vEx;', '') + 'uniform vec3 uTeam; uniform vec3 uGlow; uniform vec3 uShirt; uniform vec3 uShorts; uniform vec3 uStrap; varying float vTint; varying vec4 vStrand; varying float vSinA; varying vec3 vGearCol; varying vec3 vHair;' + EMBLEM + HAT_GLSL + GUMMY_PARS,
      fColor: /* glsl */`
        float iwSuck = 0.0; float iwGear = 0.0; float iwGearCls = 0.0; float iwH = 0.0; float iwTipK = 0.0; float iwAO = 1.0; float iwCup = 0.0;
        {
          vec3 tc = uTeam;
          float lum = dot(tc, vec3(0.299, 0.587, 0.114));
          vec3 light = mix(tc, vec3(1.0), 0.55);
          vec3 dark = tc * mix(1.0, 0.45, clamp(lum * 1.4, 0.0, 1.0));
          vec3 tsat = iwSat(tc, 1.4);                                   // the jelly's own (saturated) tint
          vec3 core = pow(max(tc, vec3(1e-4)), vec3(1.35)) * mix(0.8, 0.9, clamp(lum * 1.2, 0.0, 1.0));  // deep interior (dye over a long path)
          float nv = clamp(dot(normalize(vNormal), normalize(vViewPosition)), 0.0, 1.0);
          if (vTint <= -1.5) {
            // ---------------- gear accessory ----------------
            iwGear = 1.0; iwGearCls = floor(-vTint - 2.0 + 0.5);
            // colour code in r: >= 0 literal rgb; -1 team, -2 shirt, -3 strap, -4 shorts (each × g)
            vec3 gc = vGearCol;
            if (gc.r < -0.5) { float code = floor(-gc.r + 0.5); gc = (code == 1.0 ? tc : code == 2.0 ? uShirt : code == 3.0 ? uStrap : uShorts) * gc.g; }
            diffuseColor.rgb = gc;
            if (iwGearCls == 2.0) { // terry / knit fabric
              iwH += 0.00018 * iwNoise(vBindPos * 1400.0) * iwLod(vBindPos.y * 1400.0, 1.0);
            } else if (iwGearCls > 3.5) { // headgear fabrics (uv: around, rim-relative height | bill / brim)
              iwHatShade(iwGearCls, vStrand.zw, vBindPos, diffuseColor.rgb, iwH, iwAO);
            }
          } else if (vGearCol.b >= 1.5) {
            // ---------------- scalp cap: tentacle bundles radiating from the crown (or the style's gather point) ----
            // uv = stereographic coords of the head direction about the groove pole → (az, el) about that pole
            float spr = dot(vStrand.zw, vStrand.zw);
            float az = atan(vStrand.z, vStrand.w), el = asin(clamp((1.0 - spr) / (1.0 + spr), -1.0, 1.0));
            float crown = smoothstep(1.45, 0.9, el);
            float bundles = sin(az * 9.0 + 0.35 * sin(el * 5.0));
            float groove = pow(1.0 - abs(bundles), 6.0) * crown;
            iwH -= 0.0016 * groove;
            iwAO *= (1.0 - 0.3 * groove) * vHair.z;
            float edge = smoothstep(0.0, 0.25, vGearCol.g); // g = distance above the hairline (0 at the rolled lip)
            diffuseColor.rgb = mix(mix(core, tc, 0.5), tc, 0.45 + 0.55 * edge);
            diffuseColor.rgb = mix(diffuseColor.rgb, mix(tc, light, 0.3), 0.3 * smoothstep(0.8, 1.5, el) * (1.0 - groove));
            diffuseColor.rgb *= mix(0.62, 1.0, vHair.z);
            iwGumOn = 1.0; iwGumThin = 0.12 * (1.0 - edge) + 0.05; iwGumTrans = tsat * 1.05;
          } else {
            // ---------------- strand / sculpted lock / modelled cup ----------------
            float t = vStrand.x, on = vStrand.y, dist = vStrand.z, cs = vStrand.w;
            float thick = vHair.x; iwCup = vHair.y;
            vec3 base = vTint >= 0.0 ? mix(tc, light, vTint) : mix(tc, dark, -vTint);
            // how much jelly the view ray crosses: deep, saturated core facing the viewer, lighter wet skin at grazing
            float path = thick * (0.25 + 0.75 * nv);
            float deep = smoothstep(0.002, 0.012, path);
            diffuseColor.rgb = mix(base, mix(base, core, 0.62), deep);
            // root → tip: denser at the root (in the cap's shade), clearer and brighter toward the tip
            iwTipK = smoothstep(0.55, 1.0, t);
            diffuseColor.rgb *= mix(0.8, 1.0, smoothstep(0.0, 0.3, t));
            diffuseColor.rgb = mix(diffuseColor.rgb, mix(base, light, 0.22), 0.4 * iwTipK);
            // defined strand edges: a slightly darker crease where the ribbon turns under
            float edgeK = smoothstep(0.7, 0.98, abs(vSinA)) * smoothstep(0.02, 0.12, t) * step(iwCup, 0.5);
            diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * mix(vec3(0.8), core / max(tc, vec3(1e-3)), 0.5), edgeK * 0.7);
            iwAO *= 1.0 - 0.25 * edgeK;
            // soft highlight ridge along the top, a slightly paler sucker side underneath
            float ridge = smoothstep(0.75, 1.0, cs) * (1.0 - smoothstep(0.2, 0.5, abs(vSinA)));
            diffuseColor.rgb = mix(diffuseColor.rgb, mix(diffuseColor.rgb, light, 0.3), ridge * 0.45);
            diffuseColor.rgb = mix(diffuseColor.rgb, mix(base, light, 0.2), 0.22 * smoothstep(-0.3, -0.85, cs) * step(iwCup, 0.5));
            // faint wet unevenness so the reflections wobble instead of sliding like on a pipe
            iwH += 0.00009 * (iwNoise(vBindPos * vec3(55.0, 70.0, 55.0)) - 0.5);
            iwAO *= vHair.z;
            iwGumOn = 1.0;
            iwGumThin = 1.0 - smoothstep(0.0015, 0.013, thick);
            iwGumTrans = mix(tsat, mix(tsat, vec3(1.0), 0.15), iwTipK);
            if (iwCup > 0.5) {
              // modelled suction cup: ring 0 = dish centre, 1 = rim top, → 1.4 = foot on the skin
              float ring = iwCup - 1.0;
              vec3 rimC = mix(tc, vec3(1.0), 0.42);
              vec3 dish = mix(core * 0.38, core * 0.8, smoothstep(0.15, 0.6, ring));   // dark mouth → deep dish wall
              vec3 cupC = ring < 1.0 ? mix(dish, rimC, smoothstep(0.55, 0.9, ring)) : mix(rimC, diffuseColor.rgb, smoothstep(1.02, 1.3, ring));
              // cups only a few pixels wide melt into the arm (no shimmering rims at mid distance)
              float cupLod = 1.0 - smoothstep(0.3, 0.7, fwidth(ring));
              diffuseColor.rgb = mix(mix(diffuseColor.rgb, rimC, 0.35), cupC, cupLod);
              iwAO *= mix(1.0, ring < 1.0 ? mix(0.55, 1.0, smoothstep(0.1, 0.8, ring)) : mix(1.0, 0.5, smoothstep(1.12, 1.4, ring)), cupLod);
              iwGumThin = ring < 1.0 ? 0.35 + 0.5 * smoothstep(0.4, 1.0, ring) : 0.6;
              iwSuck = 1.0;
            } else if (on > 0.75 && t > 0.3 && t < 0.97 && cs < -0.15) {
              // printed suction cups (low detail tiers only): two staggered rows along the underside
              float side = vSinA;
              float row = side > 0.0 ? 0.5 : 0.0;
              float fa = fract(dist / 0.021 + row) - 0.5;
              float lat = (abs(side) - 0.42) / 0.24;
              float size = mix(0.58, 0.34, smoothstep(0.35, 0.96, t));
              float d = length(vec2(fa * 1.2, lat));
              float w = max(fwidth(d), 1e-3);
              float under = smoothstep(-0.15, -0.5, cs);
              iwSuck = (1.0 - smoothstep(size - w, size + w, d)) * under;
              float ring = smoothstep(size * 0.35, size * 0.8, d) * iwSuck;
              float cup = (1.0 - smoothstep(size * 0.25, size * 0.6, d)) * iwSuck;
              diffuseColor.rgb = mix(diffuseColor.rgb, mix(tc, vec3(1.0), 0.45), iwSuck * 0.8);
              diffuseColor.rgb *= 1.0 - cup * 0.22;
              iwH += 0.0009 * ring - 0.0006 * cup;
            }
            // crevices: the baked occlusion also darkens the direct light a little (shadow maps miss them)
            diffuseColor.rgb *= mix(0.66, 1.0, vHair.z);
          }
        }
      ` + HURT_FRAG,
      fRough: 'roughnessFactor = iwGear > 0.5 ? (iwGearCls == 1.0 ? 0.26 : iwGearCls == 2.0 ? 0.85 : iwGearCls == 3.0 ? 0.7 : iwGearCls > 3.5 ? 0.84 : 0.3) : roughnessFactor; roughnessFactor = mix(roughnessFactor, 0.2, iwHurtM); roughnessFactor = mix(roughnessFactor, 0.42, iwSuck * (1.0 - step(0.5, iwCup)));',
      fMetal: 'metalnessFactor = (iwGear > 0.5 && iwGearCls == 1.0) ? 1.0 : 0.0;',
      fNormal: 'normal = iwBumpN(normal, iwH, -vViewPosition);',
      fEmissive: 'totalEmissiveRadiance += uFlash + (1.0 - iwGear) * uGlow * (0.6 + 0.4 * clamp(vTint + 0.5, 0.0, 1.0)) * (0.7 + 0.6 * iwGumThin);',
      fLights: /* glsl */`
        #ifdef USE_CLEARCOAT
          if (iwGear > 0.5) { material.clearcoat = iwGearCls == 0.0 ? 1.0 : iwGearCls == 1.0 ? 0.3 : 0.0; material.clearcoatRoughness = 0.12; }
          else { material.clearcoat = mix(1.0, 0.55, iwSuck * (1.0 - step(0.5, iwCup))) * mix(0.35, 1.0, iwAO); material.clearcoatRoughness = min((iwCup > 0.5 ? 0.09 : 0.06) + geometryRoughness, 1.0); }
        #endif
        // the soft base-layer lobe is light scattered back out of the jelly: tinted by it (the clearcoat stays white)
        if (iwGumOn > 0.5) { vec3 iwST = mix(vec3(1.0), iwGumTrans / max(max(iwGumTrans.r, max(iwGumTrans.g, iwGumTrans.b)), 1e-3), 0.6); material.specularColor *= iwST; material.specularColorBlended *= iwST; }
        #ifdef USE_SHEEN
          material.sheenColor = iwGear > 0.5 ? (iwGearCls == 2.0 ? vec3(0.6) : iwGearCls > 3.5 ? mix(vec3(1.0), diffuseColor.rgb, 0.5) * 0.45 : vec3(0.0)) : mix(vec3(0.1), mix(uTeam, vec3(1.0), 0.6) * 0.22, iwTipK) * iwAO;
          material.sheenRoughness = 0.35;
        #endif
      `,
      fAO: 'reflectedLight.indirectDiffuse *= iwAO; reflectedLight.indirectSpecular *= mix(0.4, 1.0, iwAO);' + GUMMY_AMBIENT,
    });
    injectGummy(shader);
  };
  m.customProgramCacheKey = () => 'iw-hair4';
  return m;
}

let _dark = null;
export function getDarkMaterial() {
  if (!_dark) {
    _dark = new THREE.MeshPhysicalMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.25, metalness: 0.0, clearcoat: 1, clearcoatRoughness: 0.03 });
    _dark.name = 'iw-dark';
  }
  return _dark;
}

// ================================================================================================
// EYES — socketed eyeballs (character-face.js → aEx = ±2, aEyeS = eye-space position). The vertex shader turns the ball
// in eye space for the gaze (uLook as driven by character.js, plus uGaze), so the iris slides under the lids. Fragment:
// sclera with lid contact shadow, parallax iris under a refracting cornea (radial fibres, collarette, limbal ring, lower
// glow), pupil (uPupil), clearcoat cornea + a view-anchored catch-light that stays crisp up close and widens with
// distance. Legacy flat eye patches (aEx = ±1, e.g. the squid form) keep the painted look.
// ================================================================================================
export function makeEyeMaterial(u) {
  const m = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.14, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.03, specularIntensity: 0.5 });
  m.onBeforeCompile = (shader) => {
    for (const k of ['uLook', 'uIris', 'uIris2', 'uFlash']) shader.uniforms[k] = u[k];
    shader.uniforms.uGaze = u.uGaze || { value: new THREE.Vector4() };
    shader.uniforms.uLid = u.uLid || { value: new THREE.Vector4() };
    shader.uniforms.uPupil = u.uPupil || { value: 0.5 };
    shader.uniforms.uEyeRest = { value: FACE_SHADER.rest }; shader.uniforms.uIrisR = { value: FACE_SHADER.iris };
    Object.assign(shader.uniforms, faceUniforms());
    inject(shader, {
      vPars: /* glsl */`
        varying vec2 vEyeUv; attribute float aEx; varying float vSide; attribute vec3 aEyeS;
        uniform vec2 uLook; uniform vec4 uGaze; uniform vec4 uLid; uniform float uEyeRest;
        uniform vec3 uEyeC[2]; uniform mat3 uEyeM[2]; uniform mat3 uEyeMi[2];
        varying vec3 vEyeS; varying vec3 vEyeSock; varying vec3 vAi0; varying vec3 vAi1; varying vec3 vAi2; varying vec2 vLidC;`,
      vBegin: 'vEyeUv = uv; vSide = aEx; transformed = iwEP;',
      fPars: NOISE + /* glsl */`
        uniform vec2 uLook; uniform vec3 uIris; uniform vec3 uIris2; uniform vec3 uFlash; uniform float uPupil; uniform float uIrisR;
        uniform vec4 uEyeAp; uniform vec4 uEyeLid;
        varying vec2 vEyeUv; varying float vSide;
        varying vec3 vEyeS; varying vec3 vEyeSock; varying vec3 vAi0; varying vec3 vAi1; varying vec3 vAi2; varying vec2 vLidC;
        float iwCircle(vec2 p, vec2 c, float r){ float d = length(p - c) - r; float w = max(fwidth(d), 1e-4); return 1.0 - smoothstep(-w, w, d); }
      `,
      fColor: /* glsl */`
        vec3 iwEyeEmit = vec3(0.0); float iwEyeRim = 0.0; float iwCat = 0.0;
        if (abs(vSide) > 1.5) {
          // ---------------- socketed eyeball ----------------
          vec3 dS = normalize(vEyeS);
          vec3 V = normalize(mat3(vAi0, vAi1, vAi2) * normalize(vViewPosition));   // view dir in eye space
          // lid positions in the socket frame (same curves as the skin's lids) → contact shadow + corner shade
          vec3 sk = normalize(vEyeSock);
          float lam = atan(sk.y, sk.z), xu = sk.x / uEyeAp.x, q = sqrt(max(1.0 - xu * xu, 0.0));
          float lU0 = uEyeAp.w + uEyeAp.y * q, lL0 = uEyeAp.w - uEyeAp.z * q, lC = lL0 + uEyeLid.x * (lU0 - lL0);
          float lU = lU0 - vLidC.x * (lU0 - lC + uEyeLid.y), lL = lL0 + vLidC.y * (lC - lL0);
          float dU = lU - lam, dL = lam - lL;
          float shade = mix(0.3, 1.0, smoothstep(0.0, 0.2, dU)) * mix(0.55, 1.0, smoothstep(0.0, 0.12, dL));
          shade *= mix(0.7, 1.0, smoothstep(1.0, 0.72, abs(xu)));
          // soft contact shadow under the two lash tabs (they ride the upper lid)
          {
            float lnS = (lam - uEyeAp.w) / (lam >= uEyeAp.w ? uEyeAp.y : uEyeAp.z);
            for (int k = 0; k < 2; k++) {
              vec3 L = k == 0 ? vec3(${(0.91 * Math.cos(0.58)).toFixed(4)}, ${(0.91 * Math.sin(0.58)).toFixed(4)}, 0.155) : vec3(${(0.93 * Math.cos(0.24)).toFixed(4)}, ${(0.93 * Math.sin(0.24)).toFixed(4)}, 0.115);
              float tipA = k == 0 ? -1.2 : -0.7;
              float xl = L.x * uEyeAp.x, ql = sqrt(max(1.0 - L.x * L.x, 0.0));
              float lU0l = uEyeAp.w + uEyeAp.y * ql, lCl = uEyeAp.w - uEyeAp.z * ql + uEyeLid.x * (uEyeAp.y + uEyeAp.z) * ql;
              float yl = L.y - vLidC.x * (lU0l - lCl + uEyeLid.y) / uEyeAp.y;
              vec2 dv = vec2(xu - L.x, lnS - yl);
              float dl = length(dv) - L.z * (1.0 + 0.9 * pow(max(0.0, cos(atan(dv.y, dv.x) - tipA)), 5.0));
              shade *= mix(0.45, 1.0, smoothstep(-0.02, 0.07, dl));
            }
          }
          // sclera: warm white, cooler toward the rim, a hint of pink in the corners
          vec3 sclera = mix(vec3(0.95, 0.94, 0.92), vec3(0.8, 0.82, 0.88), smoothstep(0.35, 1.1, acos(clamp(dS.z, -1.0, 1.0))));
          sclera = mix(sclera, vec3(0.95, 0.8, 0.8), smoothstep(0.75, 1.05, abs(xu)) * 0.45);
          // iris seen through the cornea: refract the view ray onto a plane just under the limbus
          float zI = cos(uIrisR) - 0.03;
          vec3 rd = refract(-V, dS, 0.75);
          float tI = (vEyeS.z - zI) / max(-rd.z, 0.12);
          vec3 ip = vEyeS + rd * max(tI, 0.0);
          vec2 iq = ip.xy / sin(uIrisR);
          float r = length(iq), ang = atan(iq.y, iq.x);
          float iw = max(fwidth(r), 1e-3);
          float irisM = 1.0 - smoothstep(1.0 - iw, 1.0 + iw, r);
          vec3 ic = mix(uIris2, uIris, smoothstep(0.55, -0.8, iq.y));
          float fl = iwLod(r * 24.0, 1.0);
          vec2 idr = iq / max(r, 1e-4);                                   // seam-free angular coordinate
          float fib = iwNoise(vec3(idr * 11.0, r * 4.0 + vSide * 7.0)) * 0.6 + iwNoise(vec3(idr * 27.0, r * 1.5 + vSide)) * 0.4;
          ic *= mix(1.0, mix(0.76, 1.2, fib), smoothstep(0.3, 0.7, r) * fl);
          float coll = 1.0 - smoothstep(0.0, 0.07, abs(r - 0.47 - 0.035 * sin(ang * 9.0 + vSide)));
          ic = mix(ic, ic * 1.3 + 0.04, coll * 0.55 * fl);
          ic = mix(ic, ic * 1.45 + 0.07, smoothstep(0.3, 0.95, r) * smoothstep(0.15, -0.7, iq.y) * 0.85);  // lower glow
          ic *= mix(1.0, 0.22, smoothstep(0.78, 0.99, r));                                                  // limbal ring
          float pr = 0.34 * (0.8 + 0.45 * clamp(uPupil, 0.0, 1.0));
          float pd = length(iq * vec2(1.0, 0.86) - vec2(0.0, 0.03)) - pr;
          float pw = max(fwidth(pd), 1e-4);
          float pupil = (1.0 - smoothstep(-pw, pw, pd)) * irisM;
          ic = mix(ic, ic * 0.55, (1.0 - smoothstep(0.0, 0.08, pd)) * (1.0 - pupil));                        // pupil rim
          vec3 col = mix(sclera, ic, irisM);
          col = mix(col, vec3(0.01, 0.009, 0.022), pupil);
          col *= shade;
          iwEyeRim = 1.0 - shade;
          diffuseColor.rgb = col;
          iwEyeEmit = ic * irisM * (1.0 - pupil) * 0.07 * shade;
          // catch-light: a virtual key from the camera's upper left, on the cornea's true (bulged) normal
          vec3 nV = normalize(vNormal);
          float spread = clamp(length(fwidth(nV)) * 6.0, 0.0, 1.0);
          vec3 Vv = normalize(vViewPosition);
          float e1 = mix(1100.0, 90.0, spread), e2 = mix(1800.0, 160.0, spread);
          float c1 = pow(max(dot(nV, normalize(normalize(vec3(-0.42, 0.55, 0.72)) + Vv)), 0.0), e1);
          float c2 = pow(max(dot(nV, normalize(normalize(vec3(0.5, -0.35, 0.8)) + Vv)), 0.0), e2);
          iwCat = (c1 * 1.6 + c2 * 0.7) * mix(1.0, 0.35, spread) * smoothstep(0.02, 0.12, dU);
          iwEyeEmit += vec3(iwCat);
        } else {
          // ---------------- legacy painted eye patch (squid form) ----------------
          vec2 p = vEyeUv;
          float r = length(p);
          float outer = p.x * sign(vSide + 1e-3);
          vec2 q = p - uLook;
          vec3 sclera = mix(vec3(0.93, 0.94, 0.97), vec3(0.78, 0.8, 0.88), smoothstep(0.35, 1.0, r));
          sclera *= mix(0.72, 1.0, smoothstep(0.98, 0.3, p.y));
          vec2 iq = q * vec2(1.0, 0.94);
          float ir = length(iq) / 0.66;
          float iris = iwCircle(iq, vec2(0.0), 0.66);
          float ang = atan(iq.y, iq.x);
          vec3 ic = mix(uIris2, uIris, smoothstep(0.55, -0.75, q.y));
          float stri = 0.5 + 0.5 * sin(ang * 23.0 + 3.0 * sin(ang * 5.0));
          ic *= mix(0.86, 1.08, stri * smoothstep(0.25, 0.8, ir));
          ic = mix(ic, ic * 1.45 + 0.06, smoothstep(0.3, 0.95, ir) * smoothstep(0.15, -0.65, q.y));
          ic = mix(ic, ic * 1.25 + 0.04, (1.0 - smoothstep(0.34, 0.5, ir)) * 0.6);
          ic *= mix(1.0, 0.42, smoothstep(0.78, 1.0, ir));
          ic *= mix(0.7, 1.0, smoothstep(0.75, 0.1, q.y));
          vec2 pq = (q - vec2(0.0, 0.03)) * vec2(1.0, 0.8);
          float pd = length(vec2(pq.x, max(abs(pq.y) - 0.07, 0.0))) - 0.24;
          float pw = max(fwidth(pd), 1e-4);
          float pupil = 1.0 - smoothstep(-pw, pw, pd);
          vec3 col = mix(sclera, ic, iris);
          col = mix(col, vec3(0.012, 0.01, 0.028), pupil);
          float h1 = iwCircle(p * vec2(1.0, 0.9), uLook * 0.5 + vec2(-0.25, 0.3), 0.19);
          float h2 = iwCircle(p, uLook * 0.5 + vec2(0.24, -0.3), 0.075);
          float h3 = iwCircle(p * vec2(1.0, 1.6), uLook * 0.5 + vec2(0.08, 0.62), 0.07) * 0.6;
          col = mix(col, vec3(1.0), max(max(h1, h2 * 0.9), h3));
          float lidTop = smoothstep(0.7, 0.82, p.y + 0.12 * outer * outer) * smoothstep(0.35, 0.6, r);
          float lash1 = iwCircle(vec2(outer, p.y), vec2(0.86, 0.46), 0.1);
          float lash2 = iwCircle(vec2(outer, p.y), vec2(0.95, 0.24), 0.07);
          float rim = smoothstep(0.84, 0.97, r);
          float lids = max(max(lidTop, rim), max(lash1, lash2) * smoothstep(0.7, 0.9, r));
          col = mix(col, vec3(0.018, 0.018, 0.03), lids);
          iwEyeRim = lids;
          diffuseColor.rgb = col;
          iwEyeEmit = col * (0.07 * (1.0 - lids)) + vec3(1.0) * max(h1, h2) * 0.2 + ic * iris * (1.0 - pupil) * 0.06;
        }
      `,
      fRough: 'roughnessFactor = mix(roughnessFactor, 0.35, iwEyeRim);',
      fEmissive: 'totalEmissiveRadiance += iwEyeEmit + uFlash * 0.5;',
      fLights: /* glsl */`
        #ifdef USE_CLEARCOAT
          material.clearcoat *= mix(1.0, 0.35, iwEyeRim);
        #endif`,
    });
    // gaze: turn the ball in eye space (before skinning), then carry the eye-space basis to view space for the parallax
    shader.vertexShader = shader.vertexShader
      .replace('#include <skinning_pars_vertex>', '#include <skinning_pars_vertex>\n' + LID_BONE_GLSL)
      .replace('#include <beginnormal_vertex>', /* glsl */`#include <beginnormal_vertex>
        vec3 iwEP = position; mat3 iwMR = mat3(1.0);
        vEyeS = vec3(0.0, 0.0, 1.0); vEyeSock = vEyeS; vLidC = vec2(0.0);
        if (abs(aEx) > 1.5) {
          int si = aEx > 0.0 ? 0 : 1; float sd = aEx > 0.0 ? 1.0 : -1.0;
          mat3 M = uEyeM[si], Mi = uEyeMi[si]; vec3 C = uEyeC[si];
          // gaze (eyeball radians) → eye-space turn: the stylised aperture spans only ±30° of the ball, so ×0.6 and a clamp keep
          // the iris in the opening on the widest glances
          float yaw = uEyeRest + sd * clamp(0.6 * (uLook.x * 1.25 + (si == 0 ? uGaze.x : uGaze.z)), -0.36, 0.36);
          float pitch = clamp(0.6 * (uLook.y * 1.25 + (si == 0 ? uGaze.y : uGaze.w)), -0.3, 0.3);
          float cy = cos(yaw), sy = sin(yaw), cp = cos(-pitch), sp = sin(-pitch);
          mat3 Ry = mat3(cy, 0.0, -sy, 0.0, 1.0, 0.0, sy, 0.0, cy);
          mat3 Rx = mat3(1.0, 0.0, 0.0, 0.0, cp, sp, 0.0, -sp, cp);
          mat3 R = Ry * Rx;
          vec3 s = R * aEyeS;
          iwEP = C + M * s;
          objectNormal = normalize(transpose(Mi) * (R * (transpose(M) * objectNormal)));
          vEyeS = aEyeS; vEyeSock = s; iwMR = M * R;
          vLidC = iwLidClose(si, uLid);
        }`)
      .replace('#include <skinnormal_vertex>', /* glsl */`#include <skinnormal_vertex>
        {
          mat3 A = mat3(modelViewMatrix) * iwMR;
          #ifdef USE_SKINNING
            A = mat3(modelViewMatrix) * mat3(skinMatrix) * iwMR;
          #endif
          mat3 Ai = inverse(A);
          vAi0 = vec3(Ai[0][0], Ai[0][1], Ai[0][2]); vAi1 = vec3(Ai[1][0], Ai[1][1], Ai[1][2]); vAi2 = vec3(Ai[2][0], Ai[2][1], Ai[2][2]);
        }`);
  };
  m.customProgramCacheKey = () => 'iw-eye4';
  return m;
}

// ================================================================================================
// TANK — glass capsule with an etched level gauge; ink fill whose surface stays level in world space
// (onBeforeRender feeds world-up in fill space), with a bright meniscus and suspended bubbles.
// ================================================================================================
let _glass = null;
export function getGlassMaterial() {
  if (!_glass) {
    const m = new THREE.MeshPhysicalMaterial({ color: 0xf2fbff, roughness: 0.04, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.02, transparent: true, opacity: 0.14, depthWrite: false, envMapIntensity: 1.5 });
    m.onBeforeCompile = (shader) => {
      inject(shader, {
        vPars: 'varying vec3 vIwPos;', vBegin: 'vIwPos = position;',
        fPars: 'varying vec3 vIwPos;',
        fColor: /* glsl */`
          float iwTick = 0.0;
          {
            // etched gauge on the back face: a scale spine with ticks every 10 % (majors every 20 %)
            vec3 q = vIwPos;
            float ang = atan(q.x, -q.z);                 // 0 = straight back
            float s = ang * 0.068;                       // metres around the glass
            float inStrip = step(abs(q.y), 0.0745) * step(0.0, -q.z);
            float yv = (q.y + 0.074) / 0.0148;
            float yd = abs(fract(yv + 0.5) - 0.5) * 0.0148;
            float aa = max(fwidth(yd), 1e-5);
            float tickLine = 1.0 - smoothstep(0.00045 - aa, 0.00045 + aa, yd);
            float major = mod(floor(yv + 0.5), 2.0) < 0.5 ? 1.0 : 0.0;
            float len = major > 0.5 ? 0.009 : 0.0048;
            float tick = tickLine * step(0.004, s) * step(s, 0.004 + len);
            float sa = max(fwidth(s), 1e-5);
            float spine = 1.0 - smoothstep(0.0004 - sa, 0.0004 + sa, abs(s - 0.004));
            float tick2 = tick; float spine2 = spine;
            iwTick = clamp(max(tick2, spine2) * inStrip, 0.0, 1.0);
          }
        `,
        fOpaque: /* glsl */`
          {
            float fr = pow(1.0 - saturate(dot(normalize(geometryNormal), normalize(geometryViewDir))), 2.5);
            diffuseColor.a = clamp(opacity + fr * 0.6, 0.0, 0.9);
            outgoingLight = mix(outgoingLight, vec3(0.92), iwTick * 0.75);
            diffuseColor.a = max(diffuseColor.a, iwTick * 0.8);
          }
        `,
      });
    };
    m.customProgramCacheKey = () => 'iw-glass3';
    _glass = m;
  }
  return _glass;
}

/** Ink fill inside the tank (per character: emissive blink on low ink). Surface stays level in world space. */
export function makeInkFillMaterial() {
  const m = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.16, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05, emissive: 0x000000 });
  const U = { uUpL: { value: new THREE.Vector3(0, 1, 0) }, uSY: { value: 0.1 } };
  const _mq = new THREE.Quaternion(), _mv = new THREE.Vector3(), _ms = new THREE.Vector3();
  // world-up expressed in the PARENT (tank) frame: the free surface stays level however the kid leans, while any
  // slosh rotation animation applies on top of it (character.js rotates the fill mesh itself).
  m.onBeforeRender = (renderer, scene, camera, geometry, object) => {
    const par = object.parent || object;
    par.matrixWorld.decompose(_mv, _mq, _ms);
    U.uUpL.value.set(0, 1, 0).applyQuaternion(_mq.invert());
    const s = object.scale;
    U.uSY.value = Math.max(1e-3, s.y / Math.max(1e-4, (s.x + s.z) * 0.5));
  };
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uUpL = U.uUpL; shader.uniforms.uSY = U.uSY;
    inject(shader, {
      vPars: 'uniform vec3 uUpL; uniform float uSY; varying vec3 vIwP; varying float vIwTop;',
      vBegin: /* glsl */`
        {
          // shear the column so the free surface is level in world space (x/z in metres, y in fill units)
          vec3 up = normalize(uUpL);
          float tilt = -(up.x * transformed.x + up.z * transformed.z) / max(up.y, 0.35);
          float k = clamp(transformed.y, 0.0, 1.0);
          transformed.y = clamp(transformed.y + k * tilt / uSY, 0.0, 0.186 / uSY);
          vIwTop = smoothstep(0.93, 1.0, position.y);
          vIwP = position;
        }
      `,
      fPars: 'varying vec3 vIwP; varying float vIwTop;' + NOISE,
      fColor: /* glsl */`
        vec3 iwFillEmit = vec3(0.0);
        {
          float depth = 1.0 - clamp(vIwP.y, 0.0, 1.0);
          diffuseColor.rgb *= mix(1.0, 0.72, depth);          // deeper ink reads darker
          // suspended bubbles
          vec3 bp = vec3(vIwP.x * 60.0, vIwP.y * 9.0, vIwP.z * 60.0);
          vec3 bc = floor(bp); vec3 bf = fract(bp) - 0.5;
          float rnd = iwHash(bc);
          float bub = (1.0 - smoothstep(0.12, 0.17, length(bf * vec3(1.0, 1.0, 1.0)) - 0.12 * rnd)) * step(0.82, rnd);
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 1.5 + 0.12, bub * 0.7);
          // meniscus: bright rim where the surface meets the glass
          float r = length(vIwP.xz) / 0.0615;
          float men = vIwTop * smoothstep(0.82, 1.0, r);
          iwFillEmit = diffuseColor.rgb * men * 0.35;
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 1.35 + 0.1, men);
        }
      `,
      fEmissive: 'totalEmissiveRadiance += iwFillEmit;',
    });
  };
  m.customProgramCacheKey = () => 'iw-fill3';
  return m;
}

// ================================================================================================
// SQUID — glossy team ink + tentacle wiggle in the vertex shader. colour = (tint, wiggle, phase);
// uv = (t along tentacle, cos(angle)) with aEx = 1 on tentacles (suckers on the inner face).
// ================================================================================================
export function makeSquidMaterial(u, ghost = false) {
  const m = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.3, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05, sheen: 1, sheenRoughness: 0.4, sheenColor: new THREE.Color(1, 1, 1), specularIntensity: 1 });
  if (ghost) {
    m.transparent = true; m.depthWrite = false; m.depthFunc = THREE.GreaterDepth; m.opacity = 0.42;
  }
  m.onBeforeCompile = (shader) => {
    for (const k of ['uFlash', 'uTeam', 'uGlow', 'uTime', 'uWig', 'uOpacity']) shader.uniforms[k] = u[k];
    inject(shader, {
      vPars: /* glsl */`
        uniform float uTime; uniform vec3 uWig;
        #ifndef USE_COLOR
        attribute vec3 color;
        #endif
        attribute float aEx; attribute vec3 aSq;
        varying float vTint; varying vec2 vSqUv; varying float vSqPart; varying vec3 vSqP; varying vec3 vSq;
      `,
      vBegin: /* glsl */`
        {
          // arms: a wave travelling root → tip (phase per arm) that flexes each arm in / out and sways it sideways,
          // growing toward the tip, so the arms coil and uncoil like live tentacles (cups ride the same field)
          float wig = color.g; float ph = color.b * 6.2831;
          float s = sin(uTime * uWig.y + ph - wig * 4.2);
          float c = cos(uTime * uWig.y * 0.8 + ph * 1.3 - wig * 3.1);
          float k = wig * wig * uWig.x * 2.0;
          vec2 rad = position.xz; float rl = length(rad); rad = rl > 1e-4 ? rad / rl : vec2(0.0, 1.0);
          vec2 tng = vec2(-rad.y, rad.x);
          transformed.xz += rad * (s * k * 1.1) + tng * (c * k * 0.9);
          transformed.y += (s * 0.5 + 0.5) * wig * uWig.x * 0.8 + s * k * 0.35;
          vTint = color.r; vSqUv = uv; vSqPart = aEx; vSqP = position; vSq = aSq;
        }
      `,
      fPars: 'uniform vec3 uTeam; uniform vec3 uFlash; uniform vec3 uGlow; uniform float uOpacity; varying float vTint; varying vec2 vSqUv; varying float vSqPart; varying vec3 vSqP; varying vec3 vSq;' + NOISE + BUMP + GUMMY_PARS,
      fColor: /* glsl */`
        float iwH = 0.0; float iwSuck = 0.0; float iwAO = 1.0; float iwCup = 0.0; float iwTipK = 0.0;
        {
          vec3 tc = uTeam;
          float lum = dot(tc, vec3(0.299, 0.587, 0.114));
          vec3 light = mix(tc, vec3(1.0), 0.6);
          vec3 dark = tc * mix(1.0, 0.5, clamp(lum * 1.4, 0.0, 1.0));
          vec3 core = pow(max(tc, vec3(1e-4)), vec3(1.45)) * mix(0.82, 0.92, clamp(lum * 1.2, 0.0, 1.0));
          vec3 base = vTint >= 0.0 ? mix(tc, light, clamp(vTint, 0.0, 1.0)) : mix(tc, dark, clamp(-vTint, 0.0, 1.0));
          float nv = clamp(dot(normalize(vNormal), normalize(vViewPosition)), 0.0, 1.0);
          float thick = vSq.x;
          float deep = smoothstep(0.003, 0.03, thick * (0.25 + 0.75 * nv));
          diffuseColor.rgb = mix(base, mix(base, core, 0.7), deep);
          iwAO = vSq.z;
          iwGumOn = 1.0;
          iwGumThin = 1.0 - smoothstep(0.0015, 0.016, thick);
          iwGumTrans = iwSat(tc, 1.4);
          iwH += 0.00008 * (iwNoise(vSqP * vec3(60.0)) - 0.5);
          if (vSqPart > 0.5 && vSqPart < 3.5 && vSqPart != 2.0) {
            // arm
            float t = vSqUv.x, cs = vSqUv.y;
            iwTipK = smoothstep(0.55, 1.0, t);
            diffuseColor.rgb *= mix(0.86, 1.04, t);
            diffuseColor.rgb = mix(diffuseColor.rgb, mix(base, light, 0.22), 0.25 * smoothstep(-0.3, -0.85, cs));  // paler sucker side
            if (vSqPart < 1.5 && cs < -0.2 && t > 0.2 && t < 0.95) {
              // printed suckers (tiers without modelled ones)
              float fa = fract(t * 14.0) - 0.5;
              float d = length(vec2(fa * 1.0, (cs + 0.78) * 2.2));
              float size = mix(0.3, 0.2, t);
              float w = max(fwidth(d), 1e-3);
              iwSuck = 1.0 - smoothstep(size - w, size + w, d);
              diffuseColor.rgb = mix(diffuseColor.rgb, light, iwSuck * 0.75);
              iwH += 0.0006 * smoothstep(size * 0.4, size * 0.85, d) * iwSuck - 0.0004 * (1.0 - smoothstep(0.0, size * 0.5, d)) * iwSuck;
            }
          } else if (vSqPart > 1.5 && vSqPart < 2.5) {
            // modelled sucker: ring 0 = dish centre, 1 = rim top, → 1.4 = foot
            float ring = vSq.y - 1.0; iwCup = 1.0;
            vec3 rimC = mix(tc, vec3(1.0), 0.42);
            vec3 dish = mix(core * 0.38, core * 0.8, smoothstep(0.15, 0.6, ring));
            float cupLod = 1.0 - smoothstep(0.3, 0.7, fwidth(ring));
            vec3 cupC = ring < 1.0 ? mix(dish, rimC, smoothstep(0.55, 0.9, ring)) : mix(rimC, diffuseColor.rgb, smoothstep(1.02, 1.3, ring));
            diffuseColor.rgb = mix(mix(diffuseColor.rgb, rimC, 0.35), cupC, cupLod);
            iwAO *= mix(1.0, ring < 1.0 ? mix(0.6, 1.0, smoothstep(0.1, 0.8, ring)) : mix(1.0, 0.55, smoothstep(1.12, 1.4, ring)), cupLod);
            iwGumThin = ring < 1.0 ? 0.35 + 0.5 * smoothstep(0.4, 1.0, ring) : 0.6;
          }
          diffuseColor.rgb *= mix(0.7, 1.0, iwAO);
          iwGumTrans = mix(iwGumTrans, mix(iwGumTrans, vec3(1.0), 0.15), iwTipK);
          diffuseColor.a *= uOpacity;
        }
      ` + (ghost ? /* glsl */`
        {
          // submerged: a deeper, denser shade of the ink with a bright rim — a body seen through tinted liquid, not a
          // pale sticker lying on top of it
          float fres = pow(1.0 - abs(dot(normalize(vNormal), normalize(vViewPosition))), 3.0);
          diffuseColor.rgb = mix(uTeam * 0.5, uTeam * 0.95, fres);
          diffuseColor.a = uOpacity * mix(0.34, 0.5, fres) * (vSqPart > 0.5 ? 0.8 : 1.0);
          iwGumOn = 0.0;
        }
      ` : ''),
      fRough: 'roughnessFactor = mix(roughnessFactor, 0.4, iwCup);',
      fNormal: 'normal = iwBumpN(normal, iwH, -vViewPosition);',
      fEmissive: 'totalEmissiveRadiance += uFlash + uGlow * 0.5 * (0.7 + 0.6 * iwGumThin);' + (ghost ? 'totalEmissiveRadiance += uTeam * 0.12;' : ''),
      fLights: /* glsl */`
        #ifdef USE_CLEARCOAT
          material.clearcoat = mix(0.35, 1.0, iwAO); material.clearcoatRoughness = min((iwCup > 0.5 ? 0.09 : 0.06) + geometryRoughness, 1.0);
        #endif
        if (iwGumOn > 0.5) { vec3 iwST = mix(vec3(1.0), iwGumTrans / max(max(iwGumTrans.r, max(iwGumTrans.g, iwGumTrans.b)), 1e-3), 0.6); material.specularColor *= iwST; material.specularColorBlended *= iwST; }
        #ifdef USE_SHEEN
          material.sheenColor = mix(vec3(0.08), mix(uTeam, vec3(1.0), 0.6) * 0.2, iwTipK) * iwAO;
        #endif`,
      fAO: 'reflectedLight.indirectDiffuse *= iwAO; reflectedLight.indirectSpecular *= mix(0.45, 1.0, iwAO);' + GUMMY_AMBIENT,
    });
    injectGummy(shader);
  };
  m.customProgramCacheKey = () => (ghost ? 'iw-squid-ghost5' : 'iw-squid4');
  return m;
}

// ================================================================================================
// WEAPONS — one shared vertex-coloured physical material; aMat picks the surface class:
// 0 satin plastic · 1 gloss paint · 2 rubber (diamond knurl) · 3 metal (brushed) · 4 lens/dark glass ·
// 5 LED (emissive vertex colour) · 6 matte print
// ================================================================================================
let _plastic = null;
export const WMAT = { satin: 0, gloss: 1, rubber: 2, metal: 3, lens: 4, led: 5, print: 6 };
export function getPlasticMaterial() {
  if (!_plastic) {
    const m = new THREE.MeshPhysicalMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.4, metalness: 0.0, clearcoat: 1, clearcoatRoughness: 0.1, name: 'iw-plastic' });
    m.onBeforeCompile = (shader) => {
      inject(shader, {
        vPars: 'attribute float aMat; varying float vMat; varying vec3 vWPos;',
        vBegin: 'vMat = aMat; vWPos = position;',
        fPars: 'varying float vMat; varying vec3 vWPos;' + NOISE + BUMP,
        fColor: /* glsl */`
          float iwM = floor(vMat + 0.5); float iwH = 0.0; vec3 iwLed = vec3(0.0);
          if (iwM == 2.0) {                   // rubber: diamond knurl
            vec3 q = vWPos * 520.0;
            float k = abs(fract((q.x + q.y + q.z) * 0.5) - 0.5) + abs(fract((q.y - q.z + q.x * 0.3) * 0.5) - 0.5);
            iwH += 0.0003 * smoothstep(0.25, 0.6, k) * iwLod(vWPos.y * 520.0, 2.0);
          } else if (iwM == 3.0) {            // brushed metal streaks along the weapon axis
            float br = iwNoise(vec3(vWPos.x * 1800.0, vWPos.y * 1800.0, vWPos.z * 40.0));
            diffuseColor.rgb *= 0.9 + 0.2 * br;
          } else if (iwM == 5.0) {
            iwLed = diffuseColor.rgb * 2.2;
          } else if (iwM == 0.0) {            // satin: faint moulding texture
            iwH += 0.00004 * (iwNoise(vWPos * 1400.0) - 0.5) * iwLod(vWPos.y * 1400.0, 1.0);
          }
        `,
        fRough: 'roughnessFactor = iwM == 1.0 ? 0.2 : iwM == 2.0 ? 0.82 : iwM == 3.0 ? 0.3 : iwM == 4.0 ? 0.04 : iwM == 5.0 ? 0.25 : iwM == 6.0 ? 0.62 : 0.42;',
        fMetal: 'metalnessFactor = iwM == 3.0 ? 1.0 : 0.0;',
        fNormal: 'normal = iwBumpN(normal, iwH, -vViewPosition);',
        fEmissive: 'totalEmissiveRadiance += iwLed;',
        fLights: /* glsl */`
          #ifdef USE_CLEARCOAT
            material.clearcoat = iwM == 1.0 ? 1.0 : iwM == 4.0 ? 1.0 : iwM == 0.0 ? 0.25 : iwM == 3.0 ? 0.2 : 0.0;
            material.clearcoatRoughness = iwM == 4.0 ? 0.02 : 0.1;
          #endif
        `,
      });
    };
    m.customProgramCacheKey = () => 'iw-plastic3';
    _plastic = m;
  }
  return _plastic;
}
const _inkCache = new Map();
/** Glossy team ink for weapon parts, cached by hex. */
export function getInkMaterial(color) {
  const hex = color.getHexString();
  if (!_inkCache.has(hex)) {
    const m = new THREE.MeshPhysicalMaterial({ color: color.clone(), roughness: 0.16, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.04, sheen: 0.4, sheenRoughness: 0.3, sheenColor: color.clone().lerp(new THREE.Color(1, 1, 1), 0.5), name: 'iw-ink-' + hex });
    _inkCache.set(hex, m);
  }
  return _inkCache.get(hex);
}
export function makeGlowMaterial() {
  return new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xffffff, emissiveIntensity: 0.4, roughness: 0.3 });
}
