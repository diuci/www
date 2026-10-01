// INKWAVE — the wet-ink layer of the level surface shader. levelMaterial.js splices these GLSL chunks
// into its MeshPhysicalMaterial at the `${INK_*}` markers and merges inkUniforms() / calls inkBeforeRender().
//
// Paint atlas (src/world/paint.js), premultiplied by coverage — divide by A to read a channel:
//   R = team share (0 team A … 1 team B, "over" composited: the newest splat wins at a border)
//   G = wetness (every splat lands at 1; a subtract pass dries it to 0 over ≈ 6 s)
//   B = per-splat tone      A = coverage, a smooth ≈ 3-texel profile, MAX blended (union of all splats)
//
// Per pixel the layer
//  * rebuilds the atlas with a cubic B-spline close up (round outlines + a C2 height field with analytic gradients of
//    all four channels), mip-filtered far away;
//  * builds the ink surface: a meniscus lip at every edge (taller while wet), an overlap lip where the two teams meet
//    (the wetter = newer ink rides over the older one; two dry inks meet in a crease between their rounded edges),
//    expanding ripples from impacts / footsteps / dives (paint.ripple) and the gel micro-surface (smooth while fresh,
//    a little textured once dry);
//  * colours it: team colour × per-splat tone, a lighter translucent lip, a deeper body, a wet sheen; floors get a
//    contact shadow thrown away from the sun by the lip, walls a damp halo where the ink soaks into the surface;
//  * lights it: a clear wet coat (sharp while fresh, satin once dry) with a tamed grazing Fresnel so a low camera still
//    sees the team colour, and a lifted, richer fill in shade — ink never turns brown or muddy.
import * as THREE from 'three';

export const INK_RIPPLES = 24;

export function inkUniforms() {
  return {
    uInkClock: { value: 0 },
    // ripples: xyz + birth time (paint clock) · amplitude (m), wavelength (m), speed (m/s), life (s)
    uRip: { value: Array.from({ length: INK_RIPPLES }, () => new THREE.Vector4(0, -999, 0, -99)) },
    uRipP: { value: Array.from({ length: INK_RIPPLES }, () => new THREE.Vector4(0, 0.2, 1, 0.01)) },
  };
}

// Per draw: paint clock + the ripple table (paint.rip / paint.ripP are Float32Arrays of INK_RIPPLES × 4).
export function inkBeforeRender(U, P) {
  if (!U.uInkClock) return;
  U.uInkClock.value = P.clock || 0;
  const A = P.rip, B = P.ripP;
  if (!A || !B) return;
  const ra = U.uRip.value, rb = U.uRipP.value;
  for (let i = 0; i < INK_RIPPLES; i++) {
    const o = i * 4;
    ra[i].set(A[o], A[o + 1], A[o + 2], A[o + 3]);
    rb[i].set(B[o], B[o + 1], B[o + 2], B[o + 3]);
  }
}

// ---------------------------------------------------------------------------------------------------- fragment pars
// (after levelMaterial's own uniforms / varyings / noise helpers; uPaint, uTexel, uAtlasSize, uGel … are declared there)
export const INK_PARS = /* glsl */`
uniform float uInkClock;
uniform vec4 uRip[${INK_RIPPLES}];
uniform vec4 uRipP[${INK_RIPPLES}];
float gInkKeep = 0.0;      // share of the surface relief that still shows through thin (wall) ink
// Paint lookups use textureGrad with gradients clamped to ≤ 8 texels: trilinear + anisotropic filtering (no shimmer at
// distance) while never reaching mip levels coarse enough to bleed across the 8-texel face padding.
vec2 gPdx = vec2(0.0), gPdy = vec2(0.0);
vec4 paintAt(vec2 uv) { return textureGrad(uPaint, uv, gPdx, gPdy); }
// Close-up reconstruction of the paint atlas with a cubic B-spline (C2: smooth, round ink outlines and a smooth height
// field at any magnification) plus its analytic gradient — 12 bilinear taps inside one 4×4 texel footprint.
void inkBspl(float t, out vec4 w, out vec4 dw) {
  float t2 = t * t, t3 = t2 * t, it = 1.0 - t;
  w = vec4(it * it * it, 3.0 * t3 - 6.0 * t2 + 4.0, -3.0 * t3 + 3.0 * t2 + 3.0 * t + 1.0, t3) * (1.0 / 6.0);
  dw = vec4(-it * it, 3.0 * t2 - 4.0 * t, -3.0 * t2 + 2.0 * t + 1.0, t2) * 0.5;
}
vec4 inkTap(vec2 st) { return textureLod(uPaint, (st + 0.5) / uAtlasSize, 0.0); }
vec4 paintCubic(vec2 uv, out vec4 gX, out vec4 gY) {
  vec2 st = uv * uAtlasSize - 0.5;
  vec2 i = floor(st), f = st - i;
  vec4 wx, dwx, wy, dwy;
  inkBspl(f.x, wx, dwx); inkBspl(f.y, wy, dwy);
  vec2 gx = vec2(wx.x + wx.y, wx.z + wx.w), gy = vec2(wy.x + wy.y, wy.z + wy.w);
  vec2 ox = vec2(-1.0 + wx.y / gx.x, 1.0 + wx.w / gx.y), oy = vec2(-1.0 + wy.y / gy.x, 1.0 + wy.w / gy.y);
  vec2 dgx = vec2(dwx.x + dwx.y, dwx.z + dwx.w), dgy = vec2(dwy.x + dwy.y, dwy.z + dwy.w);
  vec2 dox = vec2(-1.0 + dwx.y / dgx.x, 1.0 + dwx.w / dgx.y), doy = vec2(-1.0 + dwy.y / dgy.x, 1.0 + dwy.w / dgy.y);
  vec4 v = gx.x * (gy.x * inkTap(i + vec2(ox.x, oy.x)) + gy.y * inkTap(i + vec2(ox.x, oy.y)))
         + gx.y * (gy.x * inkTap(i + vec2(ox.y, oy.x)) + gy.y * inkTap(i + vec2(ox.y, oy.y)));
  gX = dgx.x * (gy.x * inkTap(i + vec2(dox.x, oy.x)) + gy.y * inkTap(i + vec2(dox.x, oy.y)))
     + dgx.y * (gy.x * inkTap(i + vec2(dox.y, oy.x)) + gy.y * inkTap(i + vec2(dox.y, oy.y)));
  gY = dgy.x * (gx.x * inkTap(i + vec2(ox.x, doy.x)) + gx.y * inkTap(i + vec2(ox.y, doy.x)))
     + dgy.y * (gx.x * inkTap(i + vec2(ox.x, doy.y)) + gx.y * inkTap(i + vec2(ox.y, doy.y)));
  return v;
}
// Unnormalised Mikkelsen bump: dHdxy is the per-pixel change of a height in metres, so the tilt equals the true
// slope of the ink surface regardless of distance/viewing angle.
vec3 perturbInk(vec3 surf_pos, vec3 surf_norm, vec2 dHdxy, float faceDirection) {
  vec3 vSigmaX = dFdx(surf_pos.xyz);
  vec3 vSigmaY = dFdy(surf_pos.xyz);
  vec3 R1 = cross(vSigmaY, surf_norm);
  vec3 R2 = cross(surf_norm, vSigmaX);
  float fDet = dot(vSigmaX, R1) * faceDirection;
  vec3 vGrad = sign(fDet) * (dHdxy.x * R1 + dHdxy.y * R2);
  return normalize(abs(fDet) * surf_norm - vGrad);
}
`;

// ---------------------------------------------------------------------------------------------------- colour
// Inside levelMaterial's color_fragment block, after the surface (base, rough) is built; writes gInk* and mixes base.
export const INK_COLOR = /* glsl */`
  if (vFaceData.y > 0.5) {
    vec2 pdx = dFdx(vPaintUv), pdy = dFdy(vPaintUv);
    float texFoot = max(length(pdx), length(pdy)) / uTexel;
    float gk = min(1.0, 8.0 / max(texFoot, 1e-4));
    gPdx = pdx * gk; gPdy = pdy * gk;
    vec4 pnt = paintAt(vPaintUv);
    float near = 1.0 - smoothstep(0.9, 2.4, texFoot);
    vec4 gX = vec4(0.0), gY = vec4(0.0);                   // per-texel gradients of all four channels
    vec4 l2 = textureLod(uPaint, vPaintUv, 2.0);
    float seam2 = l2.r / max(l2.a, 1e-3);
    if (near > 0.0 && l2.a > 0.002 && (l2.a < 0.998 || pnt.a < 0.998 || (seam2 > 0.006 && seam2 < 0.994))) {
      vec4 cX, cY;
      vec4 cub = paintCubic(vPaintUv, cX, cY);
      pnt = mix(pnt, cub, near);
      gX = cX * near; gY = cY * near;
    }
    gInkNear = near;
    float amt = pnt.a;
    float fw = fwidth(amt);
    float w = clamp(fw * 0.8, 0.008, 0.25);
    gInk = smoothstep(0.5 - w, 0.5 + w, amt);
    float ia = 1.0 / max(amt, 0.02);
    float tRaw = clamp(pnt.r * ia, 0.0, 1.0);
    // crisp, pixel-anti-aliased colour border between the teams (no muddy mixed-colour fringe)
    float wT = clamp(fwidth(tRaw) * 0.75, 0.012, 0.2);
    float tm = smoothstep(0.5 - wT, 0.5 + wT, tRaw);
    float wet = clamp(pnt.g * ia, 0.0, 1.0);
    float fresh = smoothstep(0.3, 0.97, wet);               // visibly wet for ≈ 4 s after landing
    gFresh = fresh * gInk;
    float tone = clamp(pnt.b * ia, 0.0, 1.0);
    bool wallF = abs(vWNorm.y) < 0.5;
    vec3 Tf = normalize(vFaceTan - vWNorm * dot(vFaceTan, vWNorm)), Bf = cross(vWNorm, Tf);
    // world-space direction toward the sun (the scene's only directional light)
#if NUM_DIR_LIGHTS > 0
    vec3 sunW = normalize((vec4(directionalLights[0].direction, 0.0) * viewMatrix).xyz);
#else
    vec3 sunW = normalize(vec3(-0.41, 0.83, -0.38));
#endif
    vec2 sunF = vec2(dot(sunW, Tf), dot(sunW, Bf));        // sun direction in the face's (u, v) plane
    // thickness profile: 0 at the edge → 1 on the flat top (≈2–3 texels in). Floors pool (tall rounded lip, taller
    // while fresh); walls hold a thinner clinging film that lets the surface relief show through a little.
    float s = clamp((amt - 0.5) * 1.7, 0.0, 1.0);
    float hs = 1.0 - (1.0 - s) * (1.0 - s);
    gInkS = hs;
    float thick = (wallF ? 0.6 : 1.0) * (1.0 + 0.5 * fresh);
    gInkKeep = wallF ? 0.32 * (1.0 - 0.5 * fresh) : 0.0;
    vec2 gradA = vec2(gX.a, gY.a);
    gInkD = gradA * 2.0 * (1.0 - s) * 1.7 * 1.9 * gInk * thick;
    // where the two teams' inks meet: the newer (wetter) ink rides over the older one on a rounded lip; two inks of
    // the same age meet in a soft crease between their rounded edges
    vec2 gT = (vec2(gX.r, gY.r) - tRaw * gradA) * ia;       // d(team share) per texel
    float gTl = length(gT);
    float seam = 0.0, seamShadow = 0.0;
    if (gTl > 0.03 && amt > 0.6) {
      vec2 sn = gT / gTl;                                    // across the seam, toward team B
      float x = (tRaw - 0.5) / gTl;                          // signed distance to the midline, texels
      float e1 = exp(-x * x / 1.7), e2 = exp(-x * x / 0.8);
      seam = e1 * smoothstep(0.03, 0.14, gTl) * near;
      vec2 gW = (vec2(gX.g, gY.g) - wet * gradA) * ia;
      float newer = clamp(dot(gW, sn) / gTl * 1.6, -1.0, 1.0);   // +1: team B's side is the newer, wetter ink
      float dh = newer * 2.4 * e1 / 2.3 + 0.9 * 2.0 * x / 0.8 * e2 * (1.0 - 0.6 * abs(newer));
      gInkD += sn * dh * seam * gInk * thick;
      // the lower (older) side sits in the lip's shadow; the crease itself is a thin dark line
      seamShadow = seam * (0.45 * max(0.0, -x * newer) * e1 + 0.55 * e2 * (1.0 - 0.7 * abs(newer)));
    }
    vec3 team = mix(uTeamA, uTeamB, tm);
    vec3 inkCol = team * (0.93 + 0.13 * tone);
    // translucent thin lip reads lighter and a touch more saturated; the thick body a little deeper
    float lip = (1.0 - hs) * near;
    inkCol = mix(inkCol, inkCol * 1.16 + team * 0.05, lip * 0.35);
    inkCol *= 1.0 - 0.05 * hs;
    inkCol *= 1.0 - 0.3 * seamShadow * gInk;
    // fresh ink: a touch brighter + richer for the first moments, settling to its dry colour
    inkCol *= 1.0 + 0.07 * fresh * fresh;
    gInkCol = inkCol;
    float halo = smoothstep(0.06, 0.5, amt) * (1.0 - gInk) * near;
    if (!wallF) {
      // ink sits ON the ground: the lip throws a soft contact shadow, heavier on the side away from the sun
      vec2 outN = -gradA / max(length(gradA), 1e-4);
      float away = clamp(0.55 - 0.9 * dot(outN, normalize(sunF + 1e-4)) * length(sunF), 0.25, 1.3);
      halo *= smoothstep(0.4, 0.85, vWNorm.y) * away;
      base *= mix(vec3(1.0), team * 0.45 + 0.3, halo * 0.5);
    } else {
      // walls: the edge soaks into the surface — a damp, slightly tinted halo instead of a shadow
      base *= mix(vec3(1.0), team * 0.35 + 0.5, halo * 0.55);
    }
    base = mix(base, gInkCol, gInk);
  }`;

// roughness of the pigment layer under the coat
export const INK_ROUGH = /* glsl */`
roughnessFactor = mix(gBaseRough, mix(0.26, 0.14, gFresh), gInk);`;

// ---------------------------------------------------------------------------------------------------- normal
// Inside levelMaterial's normal block before the face frame is built: adds the gel micro-surface to \`slope\`.
export const INK_GEL = /* glsl */`
  if (gInk > 0.01) {
    // gel micro-surface: soft swells so reflections break into wet highlights. Mip-filtered (fades to flat by itself
    // at distance). Walls stretch it vertically. Fresh ink is smoother (surface tension) and sways very gently while it
    // settles; dry ink shows a little more texture.
    vec2 gp = vFaceUv * (abs(vWNorm.y) < 0.5 ? vec2(0.9, 0.42) : vec2(0.75));
    float fr2 = gFresh * gFresh;
    gp += vec2(uTime * 0.011, -uTime * 0.007) + fr2 * 0.022 * vec2(sin(uTime * 2.3), cos(uTime * 1.9));
#ifdef USE_TEXLIB
    if (uGel >= 0.0) {
      vec2 gx = dFdx(gp), gy = dFdy(gp);
      vec3 gn = textureGrad(tNormal, vec3(gp, uGel), gx, gy).xyz * 2.0 - 1.0;
      slope += -gn.xy / max(gn.z, 0.3) * (0.95 - 0.5 * gFresh) * gInk * gInkS;
    }
#else
    {
      const float e = 0.06;
      vec2 q = gp * 2.2;
      float hx = vnoise(q + vec2(e, 0.0)) - vnoise(q - vec2(e, 0.0));
      float hy = vnoise(q + vec2(0.0, e)) - vnoise(q - vec2(0.0, e));
      float gf = 1.0 - smoothstep(0.03, 0.12, length(fwidth(vWPos)));
      slope += vec2(hx, hy) / (2.0 * e) * 0.035 * gf * gInk;
    }
#endif
  }`;

// After the swim wakes (T, Bt = the face's world tangent frame): expanding ripples in the ink surface.
export const INK_SLOPE = /* glsl */`
  if (gInk > 0.01) {
    // ripples: a wave packet runs out from every impact / footstep / dive, thinning as it spreads; the crests catch
    // the light (glossier). Height field → analytic gradient in the face plane.
    vec3 rS = vec3(0.0); float rG = 0.0;
    for (int i = 0; i < ${INK_RIPPLES}; i++) {
      vec4 Pr = uRip[i], Qr = uRipP[i];
      float age = uInkClock - Pr.w;
      if (age <= 0.0 || age >= Qr.w) continue;
      vec3 D = vWPos - Pr.xyz;
      float off = dot(D, vWNorm);
      if (abs(off) > 0.4) continue;                          // another surface
      D -= vWNorm * off;
      float front = Qr.z * age;
      float d = length(D);
      float x = d - front;
      float sg = Qr.y * 0.8;
      if (x > sg * 3.0 || x < -Qr.y * 4.0) continue;
      float env = exp(-x * x / (sg * sg));
      float k = 6.2831853 / Qr.y;
      float fade = 1.0 - age / Qr.w;
      fade *= fade * smoothstep(0.0, 0.03, age);
      float amp = Qr.x * fade / (1.0 + d * 1.6);
      float dh = amp * env * (-2.0 * x / (sg * sg) * cos(k * x) - k * sin(k * x));
      rS += D * (dh / max(d, 1e-4));
      rG += env * fade * min(Qr.x * 90.0, 1.0);
    }
    float rl = length(rS);
    if (rl > 0.75) rS *= 0.75 / rl;
    float rFar = 1.0 - smoothstep(0.05, 0.18, length(fwidth(vWPos)));
    slope += vec2(dot(rS, T), dot(rS, Bt)) * gInk * rFar;
    gWake = max(gWake, clamp(rG * 0.5, 0.0, 1.0) * gInk * rFar);
  }`;

// ---------------------------------------------------------------------------------------------------- lighting
// a little self-light keeps ink loud in shadow and at dusk (subsurface-ish glow, stronger in the thick body)
export const INK_EMISSIVE = /* glsl */`
totalEmissiveRadiance += gInkCol * gInk * uInkGlow * (0.75 + 0.35 * gInkS);`;

// after lights_physical_fragment: the wet coat
export const INK_LIGHTS = /* glsl */`
{
  // glossy wet coat on ink (sharp while fresh, satin once dry); roughness widened where the ink normal varies faster
  // than the pixel grid (no sparkle)
  vec3 cdu = dFdx(normal), cdv = dFdy(normal);
  float kern = min(0.3 * (dot(cdu, cdu) + dot(cdv, cdv)), 0.18);
  float cr = mix(mix(0.06, 0.028, gFresh), 0.022, gWake);
  material.clearcoat = gInk;
  material.clearcoatRoughness = min(sqrt(sqrt(cr * cr * cr * cr + kern)), 1.0);
  material.roughness = mix(material.roughness, min(sqrt(sqrt(pow(material.roughness, 4.0) + kern)), 1.0), gInk);
  // the coat carries the gloss; the pigment layer underneath only adds a soft sheen (keeps the hue pure)
  material.specularColor *= 1.0 - 0.7 * gInk;
  material.specularColorBlended *= 1.0 - 0.7 * gInk;
  material.specularF90 = mix(material.specularF90, 0.35, gInk);
  // flatter Fresnel on the coat: a little more reflection head-on, far less at grazing angles, so the team colour
  // survives a low gameplay camera instead of washing out to sky-white
  material.clearcoatF0 = vec3(mix(0.04, 0.055 + 0.015 * gFresh, gInk));
  material.clearcoatF90 = mix(1.0, 0.3, gInk);
}`;

// after lights_fragment_maps: ambient / reflection treatment
export const INK_LIGHT_MAPS = /* glsl */`
// ink keeps its hue in shade: the blue sky's ambient is applied hue-neutral to the pigment
if (gInk > 0.0) {
  const vec3 LW = vec3(0.2126, 0.7152, 0.0722);
  irradiance = mix(irradiance, vec3(dot(irradiance, LW)), 0.7 * gInk);
  #if defined( USE_ENVMAP ) && defined( RE_IndirectSpecular )
  iblIrradiance = mix(iblIrradiance, vec3(dot(iblIrradiance, LW)), 0.7 * gInk);
  #endif
}
#if defined( USE_ENVMAP ) && defined( RE_IndirectSpecular ) && defined( USE_CLEARCOAT )
  // stylised wet reflections: pushed toward a neutral sheen so a blue sky never turns yellow ink olive, then tinted a
  // little by the pigment underneath (a thick coloured gel) so a grazing view keeps the team hue
  {
    float cl = dot(clearcoatRadiance, vec3(0.2126, 0.7152, 0.0722));
    vec3 tint = gInkCol / max(dot(gInkCol, vec3(0.2126, 0.7152, 0.0722)), 1e-3);
    clearcoatRadiance = mix(clearcoatRadiance, mix(vec3(cl), cl * min(tint, vec3(2.5)), 0.3), 0.6 * gInk);
    clearcoatRadiance *= 1.0 + gInk * (0.25 + 0.3 * gFresh) + gWake * 0.7;
  }
#endif`;

// after lights_fragment_end: pigment in shade glows through its own body — more fill, and a richer (never browner) hue
export const INK_SHADE = /* glsl */`
if (gInk > 0.0) {
  const vec3 LW = vec3(0.2126, 0.7152, 0.0722);
  float dL = dot(reflectedLight.directDiffuse, LW), iL = dot(reflectedLight.indirectDiffuse, LW);
  float shade = 1.0 - smoothstep(0.1, 0.6, dL / max(dL + iL, 1e-5));
  vec3 c2 = gInkCol * gInkCol;
  vec3 rich = c2 * (dot(gInkCol, LW) / max(dot(c2, LW), 1e-4));      // same brightness, deeper chroma
  vec3 id = reflectedLight.indirectDiffuse;
  vec3 idRich = rich * (iL / max(dot(gInkCol, LW), 1e-4));
  id = mix(id, idRich, 0.5 * shade) * (1.0 + 0.6 * shade);
  reflectedLight.indirectDiffuse = mix(reflectedLight.indirectDiffuse, id, gInk);
}`;
