// Zone Control ground markings (src/game/zones.js is the rules engine; this only draws).
//
// Every zone of a Zone Control match is drawn ON the floor it covers: the zone's outline(s) are clipped against each
// inkable floor face that holds the zone's paint cells (so uneven / multi-level floors, ramps and bridges all carry
// their own piece, at their own height) and lifted 2 cm off the face. Nothing floats, nothing z-fights.
//
//   active objective   dark keyline · band (neutral: yellow striped with dark; held: the holder's ink) · white
//                      pinline · dark hairline, an inner glow, a tinted fill and a light curtain rising off the edge;
//                      a capture flashes it
//   inactive zones     a faint dashed ghost outline, so players learn where the next objective will be
//   rotation           the old objective fades back to its ghost; the new one sweeps out from its centre
//   map view (TAB)     the bands widen and the ghosts strengthen as the camera swoops overhead (G.rig.mapK)
//   distance           the band grows bolder with camera distance (today's look within ~11 m, ≈ 3.5× by ~44 m) so a
//                      zone reads from across the stage; the curtain rises taller and a little stronger with it
//   capture flood      a bright crest rides the ink front out across the zone as it floods with the taker's ink
//                      (zones.js zone.flood, same radius function as PaintSystem.flood)
//   contested          a held zone the other team has inked toward the neutralise line pulses in their colour
//   sound              ZoneSounds: a positional hum at each live zone (neutral / ours / theirs, quickening as a flip
//                      nears), the flood / wipe surges, and the contested warnings
//
// One mesh, one transparent ShaderMaterial (a single draw call). Per-zone state lives in small uniform arrays; the
// mesh updates itself from onBeforeRender (frustumCulled = false, so it runs every rendered frame; the clock is G.time,
// so skipped / stepped frames catch up) and hides from the GTAO normal pass (scene.overrideMaterial). Built when a
// Zone Control match starts ('match:state'), cleared when any other match starts or the stage is rebuilt (clear()).
import * as THREE from 'three';
import { G, on } from '../core/ctx.js';
import { ZONES } from '../config.js';

const MAXZ = 8;                 // zones per match (centre 1–2 + two sides; headroom for multi-zone layouts)
const RING = 2.2;               // metres of edge band geometry (border + glow); the core fill carries d = RING
const CURTAIN = 1.7;            // light curtain height (m): tall enough to show over railings the outline hugs
const LIFT = 0.02;              // floor overlay offset (m)
// neutral band colour (linear): Splat-Zones yellow — or a warm cream when a team's ink is itself yellow (Lemon, the
// colour-blind Sun), so a neutral zone never reads as held. The dark stripes carry the contrast either way.
const NEUTRAL_YELLOW = new THREE.Color(1.0, 0.8, 0.3), NEUTRAL_CREAM = new THREE.Color(1.0, 0.93, 0.78);
const NEUTRAL = NEUTRAL_YELLOW.clone();
function yellowish(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ''));
  if (!m) return false;
  const n = parseInt(m[1], 16), r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), c = mx - mn;
  if (c < 0.001 || c / mx < 0.5) return false;
  const h = (mx === r ? ((g - b) / c) % 6 : mx === g ? (b - r) / c + 2 : (r - g) / c + 4) * 60;
  return Math.abs(((h + 360) % 360) - 48) < 14;   // Lemon 56°, Sun 48° (not Tangerine 30°, Lime 81°)
}
const SWEEP_T = 0.7;            // reveal sweep duration (s)

// distance boldening: today's look within ~11 m of the camera, easing up to full strength by ~44 m
const FAR = 'smoothstep(11.0, 44.0, length(%P - cameraPosition)) * uFarK';
const VS = /* glsl */`
attribute vec4 aInfo;           // zone index, kind (0 floor, 1 curtain), d (m from the outline | curtain height 0..1), s (m along the outline)
uniform float uFarK;
varying vec4 vInfo;
varying vec3 vW;
void main() {
  vInfo = aInfo;
  vec4 w = modelMatrix * vec4(position, 1.0);
  // far away the light curtain rises taller (its top edge), so a zone reads across the stage
  if (aInfo.y > 0.5 && aInfo.z > 0.5) w.y += ${CURTAIN} * 0.85 * ${FAR.replace('%P', 'w.xyz')};
  vW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const FS = /* glsl */`
precision highp float;
uniform vec3 uCol[${MAXZ}];     // current ink of each zone (neutral / holder), linear
uniform vec4 uSt[${MAXZ}];      // x active 0..1 · y reveal sweep radius (m) · z capture flash 0..1 · w visible 0..1
uniform vec4 uCen[${MAXZ}];     // xz centre, sweep reach (m), held 0..1
uniform vec4 uFl[${MAXZ}];      // x capture-flood front radius (m) · y its strength 0..1 · z contested 0..1 · w contester
uniform vec3 uTeamC[2];         // team inks (linear)
uniform float uTime, uWide, uFarK;
varying vec4 vInfo;
varying vec3 vW;
const vec3 K = vec3(0.0075, 0.0065, 0.012);
float band(float d, float a, float b, float aa) { return smoothstep(a - aa, a + aa, d) * (1.0 - smoothstep(b - aa, b + aa, d)); }
void main() {
  int i = int(vInfo.x + 0.5);
  vec3 col = uCol[i]; vec4 st = uSt[i]; vec4 cen = uCen[i];
  float act = st.x, flash = st.z;
  float r = length(vW.xz - cen.xy);
  float reveal = 1.0 - smoothstep(st.y - 0.9, st.y, r);
  float front = smoothstep(st.y - 1.4, st.y - 0.15, r) * reveal * step(st.y, cen.z + 1.0);   // bright leading edge of the sweep
  float s = vInfo.w;
  vec3 bright = mix(col, vec3(1.0), 0.16 + 0.5 * flash);
  vec4 fl = uFl[i];
  // bolder with distance: today's look within ~11 m, easing up to ≈ 3.5× by ~44 m
  float far = ${FAR.replace('%P', 'vW')};
  vec4 A = vec4(0.0), Gh = vec4(0.0);
  if (vInfo.y < 0.5) {
    float d = vInfo.z;
    float px = fwidth(d);
    float aa = max(px * 0.75, 0.003);
    // band scale: bolder far away, wider in the map view, and never thinner than ~2.5 px at grazing angles
    float w = clamp(max(max(mix(1.0, 2.2, uWide), mix(1.0, 3.5, far)), px * 9.0), 1.0, 3.6);
    float held = cen.w;
    // active, outside in: a dark keyline | the band | a white pinline | a dark hairline, then an inner glow and a core
    // tint. Neutral, the band is Splat-Zones yellow striped with dark (light AND dark, so it reads on white decking and
    // dark cobbles alike; far away the stripes average to a deep ochre); held, it is the holder's ink, stripes faint.
    float rim = 1.0 - smoothstep(0.09 * w - aa, 0.09 * w + aa, d);
    float ink = band(d, 0.09 * w, 0.4 * w, aa);
    float pin = band(d, 0.4 * w, 0.46 * w, aa);
    float hair = band(d, 0.46 * w, 0.52 * w, aa);
    float q = (s - d) * 1.35 / mix(1.0, w, 0.8) - uTime * 0.45, fq = min(fwidth(q), 0.5);
    float stripe = smoothstep(0.3 - fq, 0.3 + fq, abs(fract(q) - 0.5));            // 1 on the dark stripes (40 %)
    vec3 inkC = mix(mix(bright, K * 1.5, stripe), bright * (1.0 + 0.12 * stripe), held);
    // contested: the band pulses in the contesting team's ink
    inkC = mix(inkC, uTeamC[int(fl.w + 0.5)] * 1.15, fl.z * (0.35 + 0.35 * sin(uTime * 10.0)));
    float g = 1.0 - smoothstep(0.52 * w, 0.52 * w + 1.6 + 0.3 * uWide, d);
    vec3 c = K * rim + inkC * ink + vec3(1.0) * pin + K * hair;
    float a = rim * 0.95 + ink * 0.97 + pin * 0.95 + hair * 0.7;
    float ga = (mix(0.46, 0.34, held) + 0.35 * flash + 0.3 * front) * g * g + mix(0.13, 0.08, held) + 0.1 * uWide;
    A.rgb = c + col * ga * (1.0 - a);
    A.a = a + ga * (1.0 - a);
    A.rgb /= max(A.a, 1e-4);
    A.rgb = mix(A.rgb, vec3(1.0), front * 0.55);
    // capture flood: a bright crest riding the ink front out across the zone, a wet sheen just behind it
    if (fl.y > 0.001) {
      float x = r - fl.x;
      float crest = exp(-x * x * 4.0) * fl.y;
      float wake = (1.0 - smoothstep(0.0, 2.2, -x)) * step(x, 0.0) * fl.y;
      float ca = clamp(crest * 0.85 + wake * 0.3, 0.0, 0.92);
      vec3 cc = mix(bright, vec3(1.0), 0.55 * crest / max(crest + wake, 1e-3));
      float na = ca + A.a * (1.0 - ca);
      A.rgb = (cc * ca + A.rgb * A.a * (1.0 - ca)) / max(na, 1e-4);
      A.a = na;
    }
    // ghost: a thin dashed line
    float gw = clamp(max(max(mix(0.12, 0.3, uWide), mix(0.12, 0.26, far)), px * 2.2), 0.12, 0.6);
    float dash = step(0.42, fract(s / 1.15));
    float gl = (1.0 - smoothstep(gw - aa, gw + aa, d));
    float grim = 1.0 - smoothstep(0.035 - aa, 0.035 + aa, d);
    Gh.rgb = mix(vec3(0.96), K, grim);
    Gh.a = gl * dash * mix(0.42, 0.8, uWide);
  } else {
    // light curtain: a bright foot, a gradient fading upward and thin scan lines drifting up it
    float hgt = vInfo.z;
    float fade = pow(clamp(1.0 - hgt, 0.0, 1.0), 1.5);
    float foot = 1.0 - smoothstep(0.025, 0.07, hgt);
    float scan = smoothstep(0.4, 0.49, abs(fract(hgt * 4.0 - uTime * 0.45) - 0.5));
    float held = cen.w;
    A.rgb = mix(bright, vec3(1.0), mix(0.08, 0.2, held) + 0.3 * scan + 0.3 * flash);
    A.a = ((mix(0.46, 0.36, held) + 0.36 * scan + 0.3 * flash) * fade + 0.6 * foot) * (1.0 - uWide * 0.75) * (1.0 + 0.4 * far);
  }
  float ka = act * reveal;
  vec4 o;
  o.a = A.a * ka + Gh.a * (1.0 - ka);
  o.rgb = (A.rgb * A.a * ka + Gh.rgb * Gh.a * (1.0 - ka)) / max(o.a, 1e-4);
  o.a *= st.w;
  if (o.a < 0.004) discard;
  gl_FragColor = o;
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

// ---------------------------------------------------------------------------------------------------- 2D helpers
const partsOf = (def) => def.polys || [def.poly];
function area(p) { let a = 0; for (let i = 0, j = p.length - 1; i < p.length; j = i++) a += p[j][0] * p[i][1] - p[i][0] * p[j][1]; return a / 2; }
// Sutherland–Hodgman against one affine half-plane f(x, z) = a·x + b·z + c ≥ 0
function clipHalf(poly, a, b, c) {
  const out = [];
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const P = poly[i], Q = poly[(i + 1) % n];
    const fp = a * P[0] + b * P[1] + c, fq = a * Q[0] + b * Q[1] + c;
    if (fp >= 0) out.push(P);
    if ((fp >= 0) !== (fq >= 0)) { const t = fp / (fp - fq); out.push([P[0] + (Q[0] - P[0]) * t, P[1] + (Q[1] - P[1]) * t]); }
  }
  return out;
}
function clip(poly, planes) { let p = poly; for (const [a, b, c] of planes) { if (p.length < 3) return p; p = clipHalf(p, a, b, c); } return p; }
// segment [P, Q] against half-planes → [t0, t1] or null
function clipSeg(P, Q, planes) {
  let t0 = 0, t1 = 1;
  for (const [a, b, c] of planes) {
    const fp = a * P[0] + b * P[1] + c, fq = a * Q[0] + b * Q[1] + c;
    if (fp < 0 && fq < 0) return null;
    if (fp < 0) t0 = Math.max(t0, fp / (fp - fq));
    else if (fq < 0) t1 = Math.min(t1, fp / (fp - fq));
  }
  return t1 - t0 > 1e-4 ? [t0, t1] : null;
}
// inset of a polygon (CCW in x/z with inward normals) by d, mitred
function inset(poly, nrm, d) {
  const n = poly.length, out = [];
  for (let i = 0; i < n; i++) {
    const h = (i + n - 1) % n;
    const n0 = nrm[h], n1 = nrm[i];
    const k = 1 + n0[0] * n1[0] + n0[1] * n1[1];
    const mx = (n0[0] + n1[0]) / Math.max(k, 0.2), mz = (n0[1] + n1[1]) / Math.max(k, 0.2);   // miter vector (|m| = 1/cos(θ/2))
    out.push([poly[i][0] + mx * d, poly[i][1] + mz * d]);
  }
  return out;
}
// the largest inset (≤ want) that keeps the polygon from folding over: a fraction of its narrowest width
function safeInset(poly, nrm, want) {
  let minW = Infinity;
  for (let i = 0; i < poly.length; i++) {
    let far = 0;
    for (const q of poly) far = Math.max(far, (q[0] - poly[i][0]) * nrm[i][0] + (q[1] - poly[i][1]) * nrm[i][1]);
    minW = Math.min(minW, far);
  }
  return Math.min(want, minW * 0.42);
}

export class ZoneMarks {
  constructor(scene) {
    this.scene = scene;
    this.mesh = null; this.match = null; this.Z = null;
    this.state = [];
    this._t = null;
    this.sounds = new ZoneSounds();
    this._unsubs = [
      on('match:state', ({ state, match }) => {
        if (!match || match.attract || !match.zones) { if (match !== this.match || state === 'intro') this.clear(); return; }
        if (match !== this.match) this.build(match);
        if (state === 'results') this.clear();
      }),
      on('zones:active', (e) => { this._syncActive(true); if (this.Z) this.sounds.shifted(this.Z, this.match, e); }),
      on('zones:zone', ({ zone, owner }) => { const s = this.state[zone?.id]; if (s) s.flash = 1; if (this.Z) this.sounds.flipped(this.match, zone, owner); }),
      on('zones:contest', ({ zone, holder }) => { if (this.Z) this.sounds.contested(this.match, zone, holder); }),
    ];
  }

  clear() {
    this.sounds?.stop();
    if (this.mesh) {
      this.scene.remove(this.mesh);
      this.mesh.geometry.dispose(); this.mesh.material.dispose();
      this.mesh = null;
    }
    this.match = null; this.Z = null; this.state = []; this._t = null;
  }

  dispose() { this.clear(); this._unsubs.forEach((u) => u()); }

  build(match) {
    this.clear();
    const Z = match.zones;
    if (!Z || !G.paint || !G.level) return;
    this.match = match; this.Z = Z;
    NEUTRAL.copy((G.teamHex || []).some(yellowish) ? NEUTRAL_CREAM : NEUTRAL_YELLOW);
    const pos = [], info = [], idx = [];
    const faces = this._faceList();
    Z.zones.slice(0, MAXZ).forEach((zone, zi) => this._buildZone(zone, zi, faces, pos, info, idx));
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('aInfo', new THREE.Float32BufferAttribute(info, 4));
    geo.setIndex(idx);
    geo.computeBoundingSphere();
    const uniforms = {
      uCol: { value: Array.from({ length: MAXZ }, () => NEUTRAL.clone()) },
      uSt: { value: Array.from({ length: MAXZ }, () => new THREE.Vector4(0, 0, 0, 0)) },
      uCen: { value: Array.from({ length: MAXZ }, () => new THREE.Vector4()) },
      uFl: { value: Array.from({ length: MAXZ }, () => new THREE.Vector4()) },
      uTeamC: { value: [new THREE.Color(1, 0.5, 0), new THREE.Color(0, 0.3, 1)] },
      uTime: { value: 0 }, uWide: { value: 0 }, uFarK: { value: 1 },   // uFarK: the distance boldening (0 = off, A/B shots)
    };
    const mat = new THREE.ShaderMaterial({
      uniforms, vertexShader: VS, fragmentShader: FS,
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = 'zoneMarks';
    mesh.frustumCulled = false;
    mesh.renderOrder = -1;           // before the other transparents (particles, ink spray stay on top)
    mesh.castShadow = false; mesh.receiveShadow = false;
    // the GTAO normal/depth pass (scene.overrideMaterial) must not see these transparent overlays (same gate as the
    // weapon ribbons / character parts): skip the draw there, update + draw in the colour pass
    mesh.onBeforeRender = (renderer, scene, camera, geometry) => {
      if (scene.overrideMaterial) { geometry.drawRange.count = 0; return; }
      geometry.drawRange.count = Infinity;
      this._update();
    };
    this.mesh = mesh;
    this.scene.add(mesh);
    // per-zone animation state
    this.state = Z.zones.slice(0, MAXZ).map((zone, i) => {
      let reach = 0;
      for (const p of partsOf(zone.def)) for (const [x, z] of p) reach = Math.max(reach, Math.hypot(x - zone.center[0], z - zone.center[2]));
      uniforms.uCen.value[i].set(zone.center[0], zone.center[2], reach + 1.5, 0);
      return { zone, col: NEUTRAL.clone(), act: 0, sweep: reach + 3, reach: reach + 1.5, flash: 0, vis: 0, held: 0, active: false };
    });
    this._syncActive(false);
    this._update();
  }

  // paint faces sorted by their first grid cell (paint.js assigns grids in paintFaces order)
  _faceList() {
    return G.paint.paintFaces.filter((f) => f.grid >= 0);
  }
  _facesOf(zone, faces) {
    const set = new Set();
    const c = zone.cells;
    let lo = 0;
    for (let k = 0; k < c.length; k++) {
      const cell = c[k];
      // cells come in face order: walk forward (binary search when we jump)
      if (!(faces[lo] && cell >= faces[lo].grid && cell < faces[lo].grid + faces[lo].nu * faces[lo].nv)) {
        let a = 0, b = faces.length - 1;
        while (a < b) { const m = (a + b + 1) >> 1; if (faces[m].grid <= cell) a = m; else b = m - 1; }
        lo = a;
      }
      set.add(faces[lo]);
    }
    return [...set];
  }

  _buildZone(zone, zi, faces, pos, info, idx) {
    const def = zone.def;
    const y0 = (def.y0 ?? -2) - 0.05, y1 = (def.y1 ?? 6) + 0.05;
    const zf = this._facesOf(zone, faces);
    // per face: its xz region as half-planes, the zone's height range on it (sloped faces: two more half-planes — where
    // a ramp leaves the range is a real edge of the zone, so it gets a border too) and its plane height y(x, z)
    const regions = zf.map((f) => {
      const o = f.origin, u = f.u, v = f.v, n = f.n;
      const C = [[o.x, o.z], [o.x + u.x * f.su, o.z + u.z * f.su], [o.x + u.x * f.su + v.x * f.sv, o.z + u.z * f.su + v.z * f.sv], [o.x + v.x * f.sv, o.z + v.z * f.sv]];
      const ccw = area(C) > 0 ? 1 : -1;
      const planes = [];
      for (let i = 0; i < 4; i++) {
        const P = C[i], Q = C[(i + 1) % 4];
        const ex = Q[0] - P[0], ez = Q[1] - P[1];
        const a = -ez * ccw, b = ex * ccw;                              // inward normal
        planes.push([a, b, -(a * P[0] + b * P[1])]);
      }
      // y(x, z) = o.y − (n.x (x − o.x) + n.z (z − o.z)) / n.y
      const ky = -n.x / n.y, kz = -n.z / n.y, k0 = o.y + (n.x * o.x + n.z * o.z) / n.y;
      const cut = [];
      if (Math.abs(n.y) < 0.999) {
        const g = Math.hypot(ky, kz);                                   // normalised: f = metres from the cut line
        cut.push([ky / g, kz / g, (k0 - y0) / g], [-ky / g, -kz / g, (y1 - k0) / g]);
      }
      let bx0 = Infinity, bx1 = -Infinity, bz0 = Infinity, bz1 = -Infinity;
      for (const [x, z] of C) { bx0 = Math.min(bx0, x); bx1 = Math.max(bx1, x); bz0 = Math.min(bz0, z); bz1 = Math.max(bz1, z); }
      return { planes, cut, y: (x, z) => ky * x + kz * z + k0, box: [bx0, bx1, bz0, bz1] };
    });
    const overlaps = (R, pts) => {
      let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
      for (const [x, z] of pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
      return !(x1 < R.box[0] || x0 > R.box[1] || z1 < R.box[2] || z0 > R.box[3]);
    };
    const emitPoly = (R, poly, attr, fan) => {
      if (poly.length < 3) return;
      const base = pos.length / 3;
      for (const [x, z] of poly) { pos.push(x, R.y(x, z) + LIFT, z); const [d, s] = attr(x, z); info.push(zi, 0, d, s); }
      if (fan) { for (let i = 1; i < poly.length - 1; i++) idx.push(base, base + i, base + i + 1); return; }
      const tris = THREE.ShapeUtils.triangulateShape(poly.map(([x, z]) => new THREE.Vector2(x, z)), []);
      for (const t of tris) idx.push(base + t[0], base + t[1], base + t[2]);
    };
    // a CCW outline with its edge frames, perimeter coordinate and ring inset
    const outline = (poly) => {
      const P = [];
      for (const p of poly) { const q = P[P.length - 1]; if (!q || Math.hypot(p[0] - q[0], p[1] - q[1]) > 1e-4) P.push(p); }
      while (P.length > 2 && Math.hypot(P[0][0] - P[P.length - 1][0], P[0][1] - P[P.length - 1][1]) <= 1e-4) P.pop();
      if (P.length < 3) return null;
      const n = P.length, nrm = [], tan = [], len = [], S = [];
      let acc = 0;
      for (let i = 0; i < n; i++) {
        const A = P[i], B = P[(i + 1) % n];
        const ex = B[0] - A[0], ez = B[1] - A[1], L = Math.hypot(ex, ez) || 1;
        tan.push([ex / L, ez / L]); nrm.push([-ez / L, ex / L]); len.push(L); S.push(acc); acc += L;
      }
      const D = safeInset(P, nrm, RING);
      return { P, n, nrm, tan, len, S, D, Q: inset(P, nrm, D) };
    };
    for (let part of partsOf(def)) {
      if (!part || part.length < 3) continue;
      if (area(part) < 0) part = [...part].reverse();                 // CCW (x·z' − x'·z > 0)
      const whole = outline(part);
      if (!whole) continue;
      for (const R of regions) {
        if (!overlaps(R, part)) continue;
        const O = R.cut.length ? outline(clip(part, R.cut)) : whole;
        if (!O) continue;
        const { P: poly, n, nrm, tan, len, S, D, Q } = O;
        // edge band: one trapezoid per edge, d = distance from that edge's line, s = arc length along the outline
        for (let i = 0; i < n; i++) {
          const j = (i + 1) % n;
          const trap = [poly[i], poly[j], Q[j], Q[i]];
          if (!overlaps(R, trap)) continue;
          const A = poly[i], nn = nrm[i], tt = tan[i], s0 = S[i];
          emitPoly(R, clip(trap, R.planes), (x, z) => [Math.max(0, (x - A[0]) * nn[0] + (z - A[1]) * nn[1]), s0 + (x - A[0]) * tt[0] + (z - A[1]) * tt[1]], true);
        }
        // core fill
        if (overlaps(R, Q)) emitPoly(R, clip(Q, R.planes), () => [D, 0], false);
        // light curtain along the outline, 4 cm inside it (clear of any wall the outline is snapped to)
        for (let i = 0; i < n; i++) {
          const j = (i + 1) % n, nn = nrm[i];
          const A = [poly[i][0] + nn[0] * 0.04, poly[i][1] + nn[1] * 0.04], B = [poly[j][0] + nn[0] * 0.04, poly[j][1] + nn[1] * 0.04];
          if (!overlaps(R, [A, B])) continue;
          const tt = clipSeg(A, B, R.planes);
          if (!tt) continue;
          const ax = A[0] + (B[0] - A[0]) * tt[0], az = A[1] + (B[1] - A[1]) * tt[0];
          const bx = A[0] + (B[0] - A[0]) * tt[1], bz = A[1] + (B[1] - A[1]) * tt[1];
          const ya = R.y(ax, az) + LIFT, yb = R.y(bx, bz) + LIFT;
          const sa = S[i] + tt[0] * len[i], sb = S[i] + tt[1] * len[i];
          const base = pos.length / 3;
          pos.push(ax, ya, az, bx, yb, bz, bx, yb + CURTAIN, bz, ax, ya + CURTAIN, az);
          info.push(zi, 1, 0, sa, zi, 1, 0, sb, zi, 1, 1, sb, zi, 1, 1, sa);
          idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
        }
      }
    }
  }

  _syncActive(animate) {
    const Z = this.Z;
    if (!Z) return;
    const act = new Set(Z.active.zones);
    for (const s of this.state) {
      const on = act.has(s.zone);
      if (on && !s.active) { s.sweep = animate ? 0 : s.reach + 2; if (animate) s.flash = 0.6; }
      s.active = on;
    }
  }

  _update() {
    const Z = this.Z, mesh = this.mesh;
    if (!Z || !mesh) return;
    const t = G.time;
    const dt = this._t == null ? 0 : Math.min(0.25, Math.max(0, t - this._t));
    this._t = t;
    const u = mesh.material.uniforms;
    u.uTime.value = t;
    u.uWide.value = G.rig?.mapK ?? 0;
    const tc = G.teamColors;
    if (tc && tc[0] && tc[1]) { u.uTeamC.value[0].copy(tc[0]); u.uTeamC.value[1].copy(tc[1]); }
    const over = Z.winner != null && this.match && this.match.state !== 'playing';
    for (let i = 0; i < this.state.length; i++) {
      const s = this.state[i], z = s.zone;
      // capture flood front (zones.js zone.flood; the radius function PaintSystem.flood runs the ink with)
      const f = z.flood, F = u.uFl.value[i];
      if (f && f.team >= 0 && t - f.t0 < f.dur) {
        const x = Math.max(0, (t - f.t0) / f.dur);
        F.x = f.reach * (f.ease === 'linear' ? x : 1 - (1 - x) * (1 - x));
        F.y = x < 0.85 ? 1 : (1 - x) / 0.15;
      } else F.y = 0;
      // contested: held, and the other team is past the warning line toward the neutralise line
      const warnS = (ZONES.warn ?? 0.3) - 0.05;
      const cz = s.active && z.owner >= 0 ? Math.min(1, Math.max(0, (z.share[1 - z.owner] - warnS) / (ZONES.contest - warnS))) : 0;
      s.warn = (s.warn || 0) + (cz - (s.warn || 0)) * (1 - Math.exp(-dt * 6));
      F.z = s.warn; if (z.owner >= 0) F.w = 1 - z.owner;
      const target = z.owner >= 0 && tc && tc[z.owner] ? tc[z.owner] : NEUTRAL;
      const k = 1 - Math.exp(-dt * 9);
      s.col.lerp(target, k);
      s.act += ((s.active ? 1 : 0) - s.act) * (1 - Math.exp(-dt * (s.active ? 14 : 6)));
      if (s.active && s.sweep < s.reach + 2) s.sweep = Math.min(s.reach + 2, s.sweep + dt * (s.reach + 2) / SWEEP_T);
      s.flash = Math.max(0, s.flash - dt * 1.6);
      s.held += ((z.owner >= 0 ? 1 : 0) - s.held) * k;
      u.uCen.value[i].w = s.held;
      s.vis += ((over ? 0.55 : 1) - s.vis) * (1 - Math.exp(-dt * 4));
      u.uCol.value[i].copy(s.col);
      u.uSt.value[i].set(s.act, s.sweep, s.flash, s.vis);
    }
    this.sounds.update(Z, this.match, dt);
  }
}

// ---------------------------------------------------------------------------------------------------- sound
// The zones' own sounds (src/audio/audio.js): a positional hum at each live zone — one loop per zone, its timbre saying
// who holds it (neutral / ours / theirs, relative to the viewer) and its pulse quickening, pitch lifting as a flip nears
// (the holder's hold being inked back toward the 40 % line, or a neutral zone being inked toward the 80 % capture) —
// plus the flood / wipe surges at the zone and the contested warnings (2D, rate-limited). The control cues themselves
// (WE / THEY took it, WE / THEY lost it) are the HUD's, with its call-outs.
const HUM_DT = 1 / 6;            // hum control updates (s)
const zonePos = (z) => ({ x: z.center[0], y: z.center[1] + 1, z: z.center[2] });
class ZoneSounds {
  constructor() { this.hums = new Map(); this.acc = 0; this.warnT = -99; }
  _me(match) { const a = match?.local; return a && (a.team === 0 || a.team === 1) ? a.team : 0; }
  _live(match) { return !!(match && !match.attract && G.mode === 'match' && G.audio && match.state === 'playing'); }

  update(Z, match, dt) {
    this.acc += dt;
    if (this.acc < HUM_DT) return;
    const step = Math.min(1, this.acc); this.acc = 0;
    const on = this._live(match) && !match.paused && Z.winner == null;
    const act = on ? Z.active.zones : [];
    const me = this._me(match);
    for (const z of act) {
      let h = this.hums.get(z);
      if (!h || !h.handle.playing) {
        const handle = G.audio.loop('zone_hum', { pos: zonePos(z), volume: 0 });
        if (!handle || !handle.playing) continue;          // audio not started yet: try again next update
        h = { handle, k: 0 };
        this.hums.set(z, h);
      }
      const mode = z.owner < 0 ? 'neutral' : z.owner === me ? 'ours' : 'theirs';
      const tension = z.owner >= 0 ? (z.share[1 - z.owner] - 0.08) / (ZONES.contest - 0.08) : (Math.max(z.share[0], z.share[1]) - 0.35) / (ZONES.control - 0.35);
      h.k += (Math.min(1, Math.max(0, tension)) - h.k) * Math.min(1, step * 4);
      h.handle.set({ volume: (mode === 'neutral' ? 0.8 : 0.95) * (1 + 0.6 * h.k), params: { mode, tension: h.k } });
    }
    for (const [z, h] of this.hums) if (!act.includes(z)) { h.handle.stop(0.6); this.hums.delete(z); }
  }

  // a zone was taken: the ink surge rolls out from it (a little brighter when it's ours)
  flipped(match, zone, owner) {
    if (!this._live(match) || !zone || !(owner === 0 || owner === 1)) return;
    G.audio.play('zone_flood', { pos: zonePos(zone), pitch: owner === this._me(match) ? 1.06 : 0.9 });
  }

  // a new objective: its old ink drains away as it's revealed
  shifted(Z, match, e) {
    if (!this._live(match) || !e || e.moved === false) return;
    for (const z of Z.active.zones) G.audio.play('zone_wipe', { pos: zonePos(z) });
  }

  // contested: our hold is being inked back → the alarm; theirs is nearly broken → the go-go chirps
  contested(match, zone, holder) {
    if (!this._live(match) || !zone || !(holder === 0 || holder === 1)) return;
    const now = G.time ?? 0;
    if (now - this.warnT < 2.5) return;
    this.warnT = now;
    G.audio.play(holder === this._me(match) ? 'zone_warn' : 'zone_chance');
  }

  stop() { for (const h of this.hums.values()) h.handle.stop(0.3); this.hums.clear(); this.acc = 0; }
}
