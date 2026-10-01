// INKWAVE — tentacle hair + squid-form geometry kernel (used by character-geo.js: buildStrand / buildHair / buildSquid).
//
// A tentacle is an analytic surface S(t, θ): a centripetal Catmull-Rom spine (arc-length t ∈ [0, 1]) carrying a
// parallel-transported frame (O = "top", away from the scalp; B = across) and a tapered, flattened, twisted cross-section.
// Everything that sits on a tentacle (the tube itself, modelled suction cups, the rounded tip) is generated from the same
// S(t, θ), so cups are stamped conformally onto the skin (never floating, never sunk) and every vertex knows its spine
// parameter t (→ skin weights along the strand) and its local half-thickness (→ the translucency shader).
//
// Detail: hairDetail(lod, quality) → ring / radial / cup resolution for the LOD tiers ('hero' | 'game' | 'far')
// scaled by the settings quality ('low' | 'medium' | 'high' | 'ultra'). Bone rest positions never depend on detail.
import * as THREE from 'three';
import { G } from '../core/ctx.js';

const V3 = THREE.Vector3;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const TAU = Math.PI * 2;
const even = (n) => Math.max(4, 2 * Math.round(n / 2));

// ------------------------------------------------------------------------------------------------
// Detail ladder
// ------------------------------------------------------------------------------------------------
const QK = { low: 0.6, medium: 0.8, high: 1, ultra: 1.25 };
/** Current settings quality (defaults to 'high' outside the game, e.g. in the labs). */
export function hairQuality() { const q = G.settings?.quality; return QK[q] ? q : 'high'; }
export const HAIR_LOD_NAMES = ['hero', 'game', 'far'];
/**
 * Resolution of the tentacle hair / squid for a LOD tier × settings quality.
 *  ringsPerM: spine rings per metre (curvature-adaptive), radial: vertices round the section, tipSteps: rounded-tip rings,
 *  cups: modelled suction cups ({ radial, prof, gap } — gap scales the spacing) or null (the shader prints them),
 *  cap: scalp-cap grid (around × rows), brow: brow stroke rings × radial.
 */
export function hairDetail(lod = 'hero', quality = hairQuality()) {
  const k = QK[quality] ?? 1;
  // far: a few dozen px tall — sized under the far hair target (~1.8k tris) so it is used as-is (never re-clustered)
  if (lod === 'far') return { lod, k, ringsPerM: 24, radial: 6, tipSteps: 2, cups: null, locks: false, cap: [24, 5], brow: [4, 4], squid: { around: 24, rows: 16, arm: [8, 6] } };
  if (lod === 'game') {
    // in-match distance (a head is ~60–120 px tall): cups are printed by the shader below ultra (modelled ones would
    // only shimmer at 2–4 px), sections stay round enough for clean silhouettes
    return {
      lod, k, ringsPerM: Math.round(60 * k), radial: even(10 * k), tipSteps: 3,
      cups: k > 1 ? { radial: 6, prof: 'lo', gap: 1.5 } : null,
      cap: [Math.round(56 * k), Math.round(10 * k)], brow: [10, 6],
      squid: { around: Math.round(48 * k), rows: Math.round(34 * k), arm: [Math.round(18 * k), even(9 * k)], cups: k > 1 ? { radial: 6, prof: 'lo', gap: 1.4 } : null },
    };
  }
  return {
    lod, k, ringsPerM: Math.round(120 * k), radial: even(16 * k), tipSteps: 5,
    cups: k >= 0.8 ? { radial: Math.max(6, Math.round(7 * k)), prof: 'hi', gap: 1.12 } : { radial: 6, prof: 'lo', gap: 1.3 },
    cap: [Math.round(96 * k), Math.round(18 * k)], brow: [18, 10],
    squid: { around: Math.round(72 * k), rows: Math.round(48 * k), arm: [Math.round(28 * k), even(12 * k)], cups: { radial: Math.max(6, Math.round(7 * k)), prof: 'lo', gap: 1.6 } },
  };
}

// ------------------------------------------------------------------------------------------------
// Tentacle surface
// ------------------------------------------------------------------------------------------------
const _a = new V3(), _b = new V3(), _c = new V3(), _d = new V3(), _e = new V3();

/**
 * o.radius(t) half-width · o.flat(t) thickness ratio · o.twist(t) rad · o.section(c, s, t) → [c', s'] unit-section reshape
 * o.outward(P, out, t) "top" hint · o.transport: carry the frame (no flips at curled tips), biased toward the hint.
 */
export class TentacleSurface {
  constructor(points, o = {}) {
    this.o = o;
    const curve = this.curve = new THREE.CatmullRomCurve3(points.map((p) => (p.isVector3 ? p.clone() : new V3(...p))), false, o.curveType || 'centripetal');
    this.len = curve.getLength();
    const N = this.N = o.samples ?? 240;
    const P = this.P = [], T = this.T = [], O = this.O = [], B = this.B = [];
    for (let i = 0; i <= N; i++) { P.push(curve.getPointAt(i / N)); T.push(curve.getTangentAt(i / N).normalize()); }
    const hint = new V3(), prev = new V3();
    const wStep = (hl) => 1 - Math.pow(1 - 0.22 * hl * hl, 18 / N); // same bias per unit length as the old 18-ring sweep
    for (let i = 0; i <= N; i++) {
      const Ti = T[i];
      if (o.outward) o.outward(P[i], hint, i / N); else hint.set(0, 1, 0);
      hint.addScaledVector(Ti, -hint.dot(Ti));
      const hl = hint.length();
      let oi;
      if (i === 0 || !o.transport) {
        if (hl > 1e-6) oi = hint.clone().divideScalar(hl);
        else { oi = new V3(0, 1, 0).addScaledVector(Ti, -Ti.y); if (oi.lengthSq() < 1e-6) oi.set(1, 0, 0).addScaledVector(Ti, -Ti.x); oi.normalize(); }
      } else {
        oi = prev.clone().addScaledVector(Ti, -prev.dot(Ti)).normalize();
        if (hl > 1e-6) oi.lerp(hint.divideScalar(hl), wStep(hl)).normalize();
      }
      prev.copy(oi); O.push(oi); B.push(new V3().crossVectors(Ti, oi).normalize());
    }
  }
  /** Spine frame at t (t outside [0, 1] extrapolates along the end tangents). */
  frame(t, P, T, O, B) {
    const N = this.N;
    const tc = clamp(t, 0, 1);
    const f = tc * N, i0 = Math.min(N - 1, Math.floor(f)), a = f - i0;
    P.copy(this.P[i0]).lerp(this.P[i0 + 1], a);
    T.copy(this.T[i0]).lerp(this.T[i0 + 1], a).normalize();
    O.copy(this.O[i0]).lerp(this.O[i0 + 1], a); O.addScaledVector(T, -O.dot(T)).normalize();
    B.crossVectors(T, O).normalize();
    if (t !== tc) P.addScaledVector(T, (t - tc) * this.len);
    return P;
  }
  /** Section at t: { r, flat, tw } (profiles are evaluated at the clamped t). */
  section(t) { const o = this.o, tc = clamp(t, 0, 1); return { r: o.radius(tc), flat: o.flat ? o.flat(tc) : 1, tw: o.twist ? o.twist(tc) : 0 }; }
  /** Local (O, B) offset of ring angle th at t (scale shrinks the section, e.g. for the rounded tip). */
  offset(t, th, scale = 1, sec = null) {
    const s0 = sec || this.section(t);
    let c = Math.cos(th), s = Math.sin(th);
    if (this.o.section) [c, s] = this.o.section(c, s, clamp(t, 0, 1));
    const xo = c * s0.r * s0.flat * scale, xb = s * s0.r * scale;
    const ct = Math.cos(s0.tw), st = Math.sin(s0.tw);
    return [xo * ct - xb * st, xo * st + xb * ct, Math.abs(c) * s0.r * s0.flat * scale];
  }
  /** Surface point S(t, th). */
  point(t, th, out, scale = 1, shift = 0) {
    const P = this.frame(t, _a, _b, _c, _d);
    const [x, y] = this.offset(t, th, scale);
    return out.copy(P).addScaledVector(_c, x).addScaledVector(_d, y).addScaledVector(_b, shift);
  }
  /** Outward unit normal of the surface at (t, th) (finite differences; oriented away from the spine). */
  normal(t, th, out) {
    const e = 1e-3;
    const p0 = this.point(t, th, new V3());
    const pt = this.point(t + e, th, new V3()).sub(this.point(t - e, th, new V3()));
    const pa = this.point(t, th + e, new V3()).sub(this.point(t, th - e, new V3()));
    out.crossVectors(pt, pa).normalize();
    this.frame(t, _a, _b, _c, _d);
    if (out.dot(_e.copy(p0).sub(_a)) < 0) out.negate();
    return out;
  }
  /** Curvature-adaptive ring params: n + 1 values on [0, 1], denser in tight curls, at the root and toward the tip. */
  ringParams(n, tipBias = 1) {
    const N = this.N, rho = new Float64Array(N);
    const ds = this.len / N;
    for (let i = 0; i < N; i++) {
      const k = Math.acos(clamp(this.T[i].dot(this.T[i + 1]), -1, 1)) / Math.max(ds, 1e-6); // 1/m
      const t = (i + 0.5) / N;
      rho[i] = 1 + clamp(k * 0.03, 0, 3.5) + tipBias * (0.9 * sstep(0.8, 1.0, t) + 0.4 * (1 - sstep(0, 0.08, t)));
    }
    // soften (curvature from a spline is noisy) — two box passes
    for (let pass = 0; pass < 2; pass++) { const c = rho.slice(); for (let i = 0; i < N; i++) rho[i] = (c[Math.max(0, i - 2)] + c[Math.max(0, i - 1)] + c[i] + c[Math.min(N - 1, i + 1)] + c[Math.min(N - 1, i + 2)]) / 5; }
    const cum = new Float64Array(N + 1);
    for (let i = 0; i < N; i++) cum[i + 1] = cum[i] + rho[i];
    const out = [0]; let j = 0;
    for (let k = 1; k < n; k++) {
      const target = (k / n) * cum[N];
      while (j < N - 1 && cum[j + 1] < target) j++;
      out.push((j + clamp((target - cum[j]) / Math.max(1e-12, cum[j + 1] - cum[j]), 0, 1)) / N);
    }
    out.push(1);
    return out;
  }
}

// ------------------------------------------------------------------------------------------------
// Tube mesh
// ------------------------------------------------------------------------------------------------
/**
 * Closed tube over S with a buried rounded start cap and a rounded tip (tipSteps rings closing on a point).
 * opts: rings (spine rings), radial, tipSteps, startSteps, t0/t1 (build only [t0, t1]), tipLen (tip cap length / r).
 * Per vertex: t (spine param), cs/sn (ring angle), thick (half-thickness through the section there, metres).
 */
export function tentacleTube(S, opts = {}) {
  const radial = opts.radial ?? 16;
  const t0 = opts.t0 ?? 0, t1 = opts.t1 ?? 1;
  const ts = S.ringParams(Math.max(4, opts.rings ?? 32), opts.tipBias ?? 1).map((u) => t0 + u * (t1 - t0));
  const pos = [], tt = [], cs = [], sn = [], th = [], idx = [];
  const P = new V3(), T = new V3(), O = new V3(), B = new V3();
  const ring = (t, scale, shift) => {
    S.frame(t, P, T, O, B);
    const sec = S.section(t);
    for (let k = 0; k < radial; k++) {
      const a = (k / radial) * TAU;
      const [x, y, h] = S.offset(t, a, scale, sec);
      pos.push(P.x + O.x * x + B.x * y + T.x * shift, P.y + O.y * x + B.y * y + T.y * shift, P.z + O.z * x + B.z * y + T.z * shift);
      tt.push(t); cs.push(Math.cos(a)); sn.push(Math.sin(a)); th.push(Math.max(h, 0.18 * sec.r * sec.flat * scale));
    }
  };
  const pole = (t, shift) => {
    S.frame(t, P, T, O, B); pos.push(P.x + T.x * shift, P.y + T.y * shift, P.z + T.z * shift);
    const sec = S.section(t);
    tt.push(t); cs.push(shift > 0 ? 1 : -1); sn.push(0); th.push(0.3 * sec.r * sec.flat);
  };
  let rings = 0;
  const startSteps = opts.startSteps ?? 2;
  const hasStart = opts.capStart !== false;
  const r0 = S.section(ts[0]).r;
  if (hasStart) {
    pole(ts[0], -r0 * 0.9);
    for (let j = 1; j < startSteps; j++) { const a = (j / startSteps) * Math.PI * 0.5; ring(ts[0], Math.sin(a), -r0 * 0.9 * Math.cos(a)); rings++; }
  }
  for (const t of ts) { ring(t, 1, 0); rings++; }
  const tipSteps = opts.tipSteps ?? 4;
  const r1 = S.section(ts[ts.length - 1]).r, tipLen = (opts.tipLen ?? 1.05) * r1;
  for (let j = 1; j < tipSteps; j++) { const a = (j / tipSteps) * Math.PI * 0.5; ring(ts[ts.length - 1], Math.cos(a), tipLen * Math.sin(a)); rings++; }
  pole(ts[ts.length - 1], tipLen);
  const base = (r) => (hasStart ? 1 : 0) + r * radial;
  for (let r = 0; r < rings - 1; r++) {
    const a0 = base(r), a1 = base(r + 1);
    for (let k = 0; k < radial; k++) { const k1 = (k + 1) % radial; idx.push(a0 + k, a1 + k1, a1 + k, a0 + k, a0 + k1, a1 + k1); }
  }
  if (hasStart) for (let k = 0; k < radial; k++) idx.push(0, 1 + ((k + 1) % radial), 1 + k);
  const tip = pos.length / 3 - 1, last = base(rings - 1);
  for (let k = 0; k < radial; k++) idx.push(last + k, last + ((k + 1) % radial), tip);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return { geo, t: new Float32Array(tt), cs: new Float32Array(cs), sn: new Float32Array(sn), thick: new Float32Array(th), rings: ts };
}

// ------------------------------------------------------------------------------------------------
// Suction cups: small ringed cups stamped onto S in two staggered rows along the underside
// ------------------------------------------------------------------------------------------------
// cup profile: [radius / R, height / h] from the buried foot (fillet into the skin) → skirt → rolled rim → dish → centre
const CUP_PROF = {
  hi: [[1.22, -0.1], [0.98, 0.36], [0.84, 0.94], [0.68, 1.0], [0.55, 0.72], [0.34, 0.3], [0.0, 0.16]],
  lo: [[1.18, -0.1], [0.92, 0.7], [0.7, 1.0], [0.52, 0.55], [0.0, 0.2]],
};
/**
 * opts: rows [{ th, phase }] (section angles; phase 0..1 staggers the row), from/to (t range), size(t) → cup radius R (m),
 * gap (spacing multiplier), radial, prof ('hi' | 'lo'), skip(C, t) → true drops a cup (inside the head / another strand).
 * Returns { geo, t (per vertex: the cup centre's spine param), ring (0 centre … 1 rim top … ≥1 foot), list: [{t, th, R}] }.
 */
export function suctionCups(S, opts) {
  const prof = CUP_PROF[opts.prof || 'hi'];
  const radial = opts.radial ?? 9;
  const gap = opts.gap ?? 1;
  const pos = [], tt = [], rr = [], idx = [], list = [];
  const n = new V3(), et = new V3(), ea = new V3(), C = new V3(), q = new V3(), qn = new V3();
  const eps = 1e-3;
  const rimK = prof.findIndex((p) => p[1] >= 0.99);
  for (const row of opts.rows) {
    let t = opts.from;
    const R0 = opts.size(t);
    t += (row.phase ?? 0) * (R0 * 2.7 * gap) / S.len;
    while (t < opts.to) {
      const R = opts.size(t);
      if (R < 6e-4) break;
      S.point(t, row.th, C);
      if (!(opts.skip && opts.skip(C, t, R))) {
        // local metric: metres per unit t / per radian round the section
        const lt = S.point(t + eps, row.th, new V3()).distanceTo(S.point(t - eps, row.th, new V3())) / (2 * eps);
        const la = S.point(t, row.th + eps, new V3()).distanceTo(S.point(t, row.th - eps, new V3())) / (2 * eps);
        const h = R * (opts.height ?? 0.46);
        const b0 = pos.length / 3;
        const nr = prof.length;
        for (let j = 0; j < nr; j++) {
          const [pr, pz] = prof[j];
          if (pr === 0) {
            S.normal(t, row.th, qn); S.point(t, row.th, q).addScaledVector(qn, pz * h);
            pos.push(q.x, q.y, q.z); tt.push(t); rr.push(0);
            continue;
          }
          for (let k = 0; k < radial; k++) {
            const a = (k / radial) * TAU;
            const dt = (pr * R * Math.cos(a)) / Math.max(lt, 1e-6), da = (pr * R * Math.sin(a)) / Math.max(la, 1e-6);
            S.normal(t + dt, row.th + da, qn);
            S.point(t + dt, row.th + da, q).addScaledVector(qn, pz * h - (j === 0 ? 0.0004 : 0));
            pos.push(q.x, q.y, q.z); tt.push(t); rr.push(j === 0 ? 1.4 : j < rimK ? 1 + 0.4 * (rimK - j) / rimK : pr / prof[rimK][0]);
          }
        }
        // rings j (radial verts) → j+1; the last profile entry is the centre point
        const ringStart = (j) => b0 + j * radial;
        for (let j = 0; j < nr - 2; j++) {
          const a0 = ringStart(j), a1 = ringStart(j + 1);
          for (let k = 0; k < radial; k++) { const k1 = (k + 1) % radial; idx.push(a0 + k, a0 + k1, a1 + k1, a0 + k, a1 + k1, a1 + k); }
        }
        const ctr = b0 + (nr - 1) * radial, lr = ringStart(nr - 2);
        for (let k = 0; k < radial; k++) idx.push(lr + k, lr + ((k + 1) % radial), ctr);
        list.push({ t, th: row.th, R });
      }
      t += (R * 2.7 * gap) / S.len;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  // orient: the cup's rim normals must face away from the spine (winding depends on the local frame handedness)
  {
    const N = geo.attributes.normal, Pp = geo.attributes.position; let acc = 0; const sp = new V3(), tmp = new V3(), nn = new V3();
    for (let i = 0; i < Pp.count; i += 7) { S.frame(tt[i], sp, _b, _c, _d); tmp.fromBufferAttribute(Pp, i).sub(sp); nn.fromBufferAttribute(N, i); acc += nn.dot(tmp); }
    if (acc < 0) { const ix = geo.index.array; for (let i = 0; i < ix.length; i += 3) { const s = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = s; } geo.computeVertexNormals(); }
  }
  return { geo, t: new Float32Array(tt), ring: new Float32Array(rr), list };
}

// ------------------------------------------------------------------------------------------------
// Curled tips + sculpted locks
// ------------------------------------------------------------------------------------------------
/**
 * Roll the end of a spine: extend the last segment and curl it toward `outDir(b)` (away from the head) in a tightening
 * spiral (≈ a quarter to three-quarter turn for curl 0.5 … 1.2). Returns a new point list.
 */
export function curlTip(pts, curl, outDir, lift = 0.35) {
  if (!curl) return pts.map((p) => p.clone());
  const out = pts.map((p) => p.clone());
  const a = pts[pts.length - 2], b = pts[pts.length - 1];
  const d = b.clone().sub(a).normalize();
  const o = outDir(b).clone(); o.addScaledVector(d, -o.dot(d)).normalize();
  const L = a.distanceTo(b);
  const turn = Math.abs(curl) * 1.9;            // total roll angle (rad)
  const R = L * 0.42 / Math.max(0.5, Math.abs(curl));
  const n = 4;
  const sg = Math.sign(curl) || 1;
  for (let k = 1; k <= n; k++) {
    const u = k / n, ang = turn * u, rk = R * (1 - 0.35 * u);
    // spiral in the (d, o) plane: starts tangent to d, bends toward o
    const x = rk * Math.sin(ang), y = sg * rk * (1 - Math.cos(ang));
    out.push(b.clone().addScaledVector(d, x + L * 0.12 * u).addScaledVector(o, y).add(new V3(0, lift * rk * u * u * Math.abs(curl), 0)));
  }
  return out;
}

/**
 * Sculpted locks around a main strand (bangs): each lock follows the main spine for `len` of its length, fanned sideways
 * by `d` (m, at the lock's tip; ~35 % of it at the root) and layered by `h` (m along the top direction), then curls.
 * S = the main strand's surface (frames), n = samples. Returns an array of point lists (V3).
 */
export function lockSpines(S, locks, outDir, n = 12) {
  const res = [];
  const P = new V3(), T = new V3(), O = new V3(), B = new V3();
  for (const L of locks) {
    const pts = [];
    for (let k = 0; k <= n; k++) {
      const u = k / n, t = u * (L.len ?? 0.8);
      S.frame(t, P, T, O, B);
      const fan = lerp(L.root ?? 0.3, 1, sstep(0.05, 1, u));
      const lay = sstep(0.0, 0.25, u);
      pts.push(P.clone().addScaledVector(B, (L.d || 0) * fan).addScaledVector(O, (L.h || 0) * lay).add(new V3(0, (L.dy || 0) * sstep(0.3, 1, u), 0)));
    }
    res.push(curlTip(pts, L.curl ?? 0.6, outDir));
  }
  return res;
}

// ------------------------------------------------------------------------------------------------
// Baked contact occlusion for the hair: distance of a point to a set of occluders (head / other strands)
// ------------------------------------------------------------------------------------------------
/** Spine samples of a surface (for proximity tests): [{ p, r, h }] every ~1 cm. */
export function spineSamples(S, from = 0, to = 1) {
  const out = []; const P = new V3(), T = new V3(), O = new V3(), B = new V3();
  const n = Math.max(4, Math.ceil((S.len * (to - from)) / 0.008));
  for (let i = 0; i <= n; i++) {
    const t = lerp(from, to, i / n); S.frame(t, P, T, O, B); const s = S.section(t);
    out.push({ p: P.clone(), r: s.r, h: s.r * s.flat, O: O.clone(), T: T.clone(), t });
  }
  return out;
}
