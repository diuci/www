// INKWAVE — squidkid LOD kit (used by character.js only).
//   • tier policy: hero / game / far picked by the kid's projected screen height, per quality setting, with hysteresis
//   • screen-door dither cross-fade: per-kid clones of the body materials that discard complementary pixel sets, so two
//     tiers overlap for ~0.3 s with every pixel drawn exactly once (no pop, no double-blend, no sorting)
//   • bone-aware clustering decimator: builds the 'far' tier from any skinned geometry the builders hand us, keeping
//     limbs / strands / fingers separate (clusters never straddle two dominant bones → no webbing when joints bend)
import * as THREE from 'three';

export const TIERS = ['hero', 'game', 'far'];
export const T_HERO = 0, T_GAME = 1, T_FAR = 2;
export const KID_H = 1.32;          // head-top height of the kid (m) for the screen-size estimate
export const FADE_S = 0.3;          // cross-fade duration (s)

// Screen height (CSS px) of the kid: above `hero` → hero tier in a match (`heroLocal` for the local player — the kid
// you look at all match), below `far` → far tier; `menu` = tier out of a match (showcase pedestal, locker, lobby line-up).
// Hysteresis ±12 %. (Default FOV: the local player stands ≈ 28 % of the viewport tall — 250 px at 900 — so from
// 720p up (≈ 200 px) it is hero at high; a kid across the plaza is ≈ 40–90 px.)
export const LOD_QUALITY = {
  low: { hero: Infinity, heroLocal: Infinity, far: 150, menu: T_GAME },
  medium: { hero: 760, heroLocal: 260, far: 110, menu: T_HERO },
  high: { hero: 430, heroLocal: 150, far: 78, menu: T_HERO },
  ultra: { hero: 300, heroLocal: 110, far: 54, menu: T_HERO },
};
export const HYST = 0.12;
/** Tier for a screen height `px` given the current tier `cur` (hysteresis), quality row `Q` and hero threshold `H`. */
export function pickTier(px, cur, Q, H = Q.hero) {
  const up = 1 + HYST, dn = 1 - HYST;
  let t = cur < 0 ? (px >= H ? T_HERO : px < Q.far ? T_FAR : T_GAME) : cur;
  if (t === T_HERO && px < H * dn) t = px < Q.far ? T_FAR : T_GAME;
  else if (t === T_GAME && px >= H * up) t = T_HERO;
  else if (t === T_GAME && px < Q.far * dn) t = T_FAR;
  else if (t === T_FAR && px >= Q.far * up) t = px >= H * up ? T_HERO : T_GAME;
  return t;
}

// ------------------------------------------------------------------------------------------------
// Dither cross-fade materials
// ------------------------------------------------------------------------------------------------
// uLodFade = (f, side): f ∈ (0,1] fade progress; side +1 = outgoing (keeps IGN ≥ f), −1 = incoming (keeps IGN < f).
// f = 0 disables the test. Interleaved-gradient noise: fine-grained and even at every f.
const DITHER_PARS = 'uniform vec2 uLodFade;\nfloat iwLodIGN(vec2 p){ return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }\n';
const DITHER_TEST = '\n  if (uLodFade.x > 0.0) { float iwLodN = iwLodIGN(floor(gl_FragCoord.xy)); if ((iwLodN < uLodFade.x) == (uLodFade.y > 0.0)) discard; }\n';
const MAIN_RE = /void\s+main\s*\(\s*\)\s*\{/;

/** A clone of `base` whose fragment shader dithers against `fadeU` ({ value: Vector2 }). Same program for every kid. */
export function ditherMaterial(base, fadeU) {
  const m = base.clone();
  const prev = base.onBeforeCompile;
  const key = (base.customProgramCacheKey ? base.customProgramCacheKey() : '') + '|iwLodZ';
  m.onBeforeCompile = function (sh, r) {
    if (prev) prev.call(this, sh, r);
    sh.uniforms.uLodFade = fadeU;
    if (MAIN_RE.test(sh.fragmentShader)) sh.fragmentShader = sh.fragmentShader.replace(MAIN_RE, (s) => DITHER_PARS + s + DITHER_TEST);
  };
  m.customProgramCacheKey = () => key;
  return m;
}

// ------------------------------------------------------------------------------------------------
// Far tier: bone-aware vertex clustering
// ------------------------------------------------------------------------------------------------
const _farCache = new WeakMap();

/**
 * Decimate an (indexed or not) skinned geometry by vertex clustering. Cluster key = grid cell + dominant bone + discrete
 * material ids (aEx, aCloth.xy, aTint gear class), so material borders survive; opposite-facing members split off (thin
 * shells keep both faces). Each cluster keeps its most central vertex (attributes incl. skin
 * weights copied from it — the surface never shrinks) with the members' averaged normal.
 */
export function clusterDecimate(src, cell) {
  const A = src.attributes, P = A.position, n = P.count;
  const N = A.normal, SI = A.skinIndex, SW = A.skinWeight, EX = A.aEx, CL = A.aCloth, TI = A.aTint;
  const inv = 1 / cell;
  const key2c = new Map(), vc = new Int32Array(n);
  const sx = [], sy = [], sz = [], cn = [], rx = [], ry = [], rz = [];
  const newC = (key, i) => {
    const c = cn.length; key2c.set(key, c); sx.push(0); sy.push(0); sz.push(0); cn.push(0);
    rx.push(N ? N.getX(i) : 0); ry.push(N ? N.getY(i) : 0); rz.push(N ? N.getZ(i) : 0);
    return c;
  };
  for (let i = 0; i < n; i++) {
    const x = P.getX(i), y = P.getY(i), z = P.getZ(i);
    let dom = 0;
    if (SI && SW) { let bw = -1; for (let k = 0; k < 4; k++) { const w = SW.getComponent(i, k); if (w > bw) { bw = w; dom = SI.getComponent(i, k); } } }
    let d = '';
    if (EX) d += Math.round(EX.getX(i));
    if (CL) d += ':' + Math.round(CL.getX(i)) + '.' + Math.round(CL.getY(i));
    if (TI) { const t = TI.getX(i); d += ':' + (t <= -1.5 ? Math.round(t) : 0); }
    const key = `${Math.floor(x * inv)},${Math.floor(y * inv)},${Math.floor(z * inv)},${dom},${d}`;
    let c = key2c.get(key);
    if (c === undefined) c = newC(key, i);
    // a member facing away from the cluster's first normal (the other face of a thin shell, a > 95° crease) gets its own
    // cluster — smooth curvature never splits, so the count stays low while sheets keep both faces
    else if (N && N.getX(i) * rx[c] + N.getY(i) * ry[c] + N.getZ(i) * rz[c] < -0.09) { const k2 = key + '#'; c = key2c.get(k2); if (c === undefined) c = newC(k2, i); }
    vc[i] = c; sx[c] += x; sy[c] += y; sz[c] += z; cn[c]++;
  }
  const nc = cn.length;
  // representative = member nearest the centroid
  const rep = new Int32Array(nc).fill(-1), rd = new Float64Array(nc).fill(Infinity);
  for (let i = 0; i < n; i++) {
    const c = vc[i], k = 1 / cn[c];
    const dx = P.getX(i) - sx[c] * k, dy = P.getY(i) - sy[c] * k, dz = P.getZ(i) - sz[c] * k, d = dx * dx + dy * dy + dz * dz;
    if (d < rd[c]) { rd[c] = d; rep[c] = i; }
  }
  const out = new THREE.BufferGeometry();
  for (const name in A) {
    const a = A[name], s = a.itemSize, arr = new a.array.constructor(nc * s);
    for (let c = 0; c < nc; c++) { const r = rep[c]; for (let k = 0; k < s; k++) arr[c * s + k] = a.getComponent(r, k); }
    out.setAttribute(name, new THREE.BufferAttribute(arr, s, a.normalized));
  }
  if (N) {
    const acc = new Float32Array(nc * 3);
    for (let i = 0; i < n; i++) { const c = vc[i] * 3; acc[c] += N.getX(i); acc[c + 1] += N.getY(i); acc[c + 2] += N.getZ(i); }
    const on = out.attributes.normal;
    for (let c = 0; c < nc; c++) {
      const x = acc[c * 3], y = acc[c * 3 + 1], z = acc[c * 3 + 2], l = Math.hypot(x, y, z);
      if (l > 0.3 * cn[c]) on.setXYZ(c, x / l, y / l, z / l);
    }
  }
  // triangles: remap, drop collapsed ones and exact duplicates (orientation kept: both faces of a sheet survive)
  const src3 = src.index ? src.index.array : null, nt = (src3 ? src3.length : n) / 3;
  const tris = [], seen = new Set();
  for (let t = 0; t < nt; t++) {
    const a = vc[src3 ? src3[t * 3] : t * 3], b = vc[src3 ? src3[t * 3 + 1] : t * 3 + 1], c = vc[src3 ? src3[t * 3 + 2] : t * 3 + 2];
    if (a === b || b === c || a === c) continue;
    const m = Math.min(a, b, c), key = m === a ? `${a},${b},${c}` : m === b ? `${b},${c},${a}` : `${c},${a},${b}`;
    if (seen.has(key)) continue;
    seen.add(key); tris.push(a, b, c);
  }
  out.setIndex(nc > 65535 ? new THREE.Uint32BufferAttribute(tris, 1) : new THREE.Uint16BufferAttribute(tris, 1));
  out.userData = { ...src.userData, iwLod: 'far', cell };
  out.computeBoundingSphere();
  return out;
}

const triCount = (g) => (g.index ? g.index.count : g.attributes.position.count) / 3;

/** Far-tier version of `geo`, decimated to ≲ `target` triangles (cached per source geometry). */
export function farGeometry(geo, target) {
  if (!geo || !geo.attributes || !geo.attributes.position) return geo;
  let c = _farCache.get(geo);
  if (c) return c;
  if (triCount(geo) <= target) { _farCache.set(geo, geo); return geo; }
  // cell size from the surface density, then one correction step (triangle count ∝ 1 / cell²)
  let cell = 0.018;
  let g = clusterDecimate(geo, cell);
  for (let it = 0; it < 3 && triCount(g) > target * 1.12; it++) {
    cell *= Math.sqrt(triCount(g) / target) * 1.02;
    g.dispose(); g = clusterDecimate(geo, cell);
  }
  _farCache.set(geo, g);
  return g;
}
export { triCount };
