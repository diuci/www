// INKWAVE — HULLBREAKER animation.
//
// Everything is driven from the sim state `st` (+ the root transform the sim writes), so every client animates the
// same way. Per frame:
//   1. pick the active clip from st (dead > intro > stun > roar > move:phase > recover > locomotion) + its clock τ
//   2. locomotion base pose (breathing, gait bob/sway, turn lean) → the clip layers on top → cross-fade on changes
//   3. additive springs (hurt flinch, shell rattle, eye jiggle, door swing)
//   4. gait: world-planted feet, tripod stepping phase-locked to measured root speed / yaw rate, predictive landing
//   5. apply: body/shell/head FK, 3-segment leg IK to the planted feet, 2-bone claw IK, eyes, hatches, flaps
//   6. verlet secondary (kelp, chains, tyre, buoy, anchor, flag, antennae) in world space
// Pose channels are a flat Float32Array so blending is trivial and nothing allocates per frame.
import * as THREE from 'three';
import { LEGS, ARMS, HEAD, BODY, CONT, MC, UP, frameQuat, ik2, ankleFor, legPole } from './bossModelGeo.js';

const NAMES = ['bx', 'by', 'bz', 'bp', 'br', 'byaw', 'sp', 'sr', 'sy', 'hp', 'hy', 'hr',
  'lx', 'ly', 'lz', 'lp', 'lyw', 'lr', 'lo', 'rx', 'ry', 'rz', 'rp', 'ryw', 'rr', 'ro',
  'ey', 'ep', 'es', 'ed', 'mouth', 'sipP', 'sipY', 'cannon', 'glowL', 'hA', 'hB', 'hC',
  'splay', 'curl', 'belly', 'steam', 'paw', 'slide', 'mand', 'tuck', 'bellyOut'];
export const C = Object.fromEntries(NAMES.map((n, i) => [n, i]));
const NC = NAMES.length;
// default phase lengths (the sim passes st.phaseDur; these are the fallbacks, = bossHazards MOVES)
const DUR = { slam: [1.15, 1.2, 1.0], barrage: [0.85, 2.0, 0.8], sweep: [1.15, 2.1, 0.9], charge: [1.15, 1.5, 0.9], crablets: [0.9, 0.8, 0.6], frenzy: [1.2, 3.0, 1.7] };
const PH = { tele: 0, act: 1, rec: 2 };
const ARM_CH = [[C.lx, C.ly, C.lz, C.lp, C.lyw, C.lr, C.lo], [C.rx, C.ry, C.rz, C.rp, C.ryw, C.rr, C.ro]];

const PI = Math.PI, TAU = PI * 2;
const cl = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const k01 = (t, a, b) => cl((t - a) / (b - a));
const sm = (x) => x * x * (3 - 2 * x);
const eo = (x) => 1 - (1 - x) * (1 - x) * (1 - x);
const ei = (x) => x * x * x;
const eob = (x) => { const c1 = 1.9, c3 = c1 + 1; return 1 + c3 * (x - 1) ** 3 + c1 * (x - 1) ** 2; };
const bump = (t, a, b) => (t <= a || t >= b ? 0 : Math.sin(((t - a) / (b - a)) * PI));
const mix = (a, b, t) => a + (b - a) * t;
const dampK = (l, dt) => 1 - Math.exp(-l * dt);
function hashN(i) { const s = Math.sin(i * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }
function vnoise(t, seed = 0) { const i = Math.floor(t), f = t - i, u = f * f * (3 - 2 * f); return mix(hashN(i + seed * 57), hashN(i + 1 + seed * 57), u) * 2 - 1; }

class Spring {
  constructor(k, d) { this.k = k; this.d = d; this.x = 0; this.v = 0; }
  step(dt, target = 0) { const n = dt > 1 / 90 ? 2 : 1, h = dt / n; for (let i = 0; i < n; i++) { this.v += (this.k * (target - this.x) - this.d * this.v) * h; this.x += this.v * h; } return this.x; }
}

// scratch
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _v4 = new THREE.Vector3(), _v5 = new THREE.Vector3(), _v6 = new THREE.Vector3();
const _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion(), _q4 = new THREE.Quaternion();
const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _m1 = new THREE.Matrix4(), _m2 = new THREE.Matrix4();
const _K = new THREE.Vector3(), _A = new THREE.Vector3(), _F = new THREE.Vector3(), _H = new THREE.Vector3(), _X = new THREE.Vector3(), _pole = new THREE.Vector3(), _out = new THREE.Vector3(), _n0 = new THREE.Vector3(), _n1 = new THREE.Vector3();
const DOWN = new THREE.Vector3(0, -1, 0);
const _ray = { hit: false, dist: 0, point: new THREE.Vector3(), normal: new THREE.Vector3(), face: -1, block: -1, u: 0, v: 0 };

// ------------------------------------------------------------------------------------------------ clips
// Each clip phase: fn(P, t, D, A) adds onto the locomotion pose P (t = seconds into the phase, D = its length).
// Shared key poses are functions so tele → act → rec stay continuous.
const slamUp = (P, u) => {           // crusher raised high over its shoulder (clear of the face), pincer braced, body leaning back
  P[C.lx] += 0.55 * u; P[C.ly] += 2.45 * u; P[C.lz] += -1.25 * u; P[C.lp] += 1.65 * u; P[C.lyw] += 0.35 * u; P[C.lr] += -0.5 * u; P[C.lo] = mix(P[C.lo], 0.95, u);
  P[C.bp] += -0.13 * u; P[C.br] += 0.07 * u; P[C.by] += 0.2 * u; P[C.bz] += -0.28 * u; P[C.byaw] += -0.14 * u; P[C.hp] += -0.08 * u;
  P[C.rx] += -0.5 * u; P[C.ry] += 0.35 * u; P[C.rz] += -0.4 * u; P[C.ro] = mix(P[C.ro], 0.55, u); P[C.rp] += 0.3 * u;
  P[C.splay] += 0.06 * u; P[C.ep] += 0.12 * u; P[C.ey] += 0.1 * u;
};
const slamHit = (P, f) => {          // claw on the ground in front, body lunged into it
  P[C.lx] += -0.95 * f; P[C.ly] += -0.62 * f; P[C.lz] += 0.35 * f; P[C.lp] += -0.32 * f; P[C.lyw] += -0.42 * f; P[C.lo] = mix(P[C.lo], 0.08, f);
  P[C.bp] += 0.15 * f; P[C.br] += -0.06 * f; P[C.by] += -0.3 * f; P[C.bz] += 0.32 * f; P[C.byaw] += 0.16 * f; P[C.hp] += 0.1 * f;
  P[C.rx] += -0.2 * f; P[C.ry] += -0.35 * f; P[C.rz] += 0.25 * f; P[C.splay] += 0.1 * f;
};
// fallbacks mirror bossBrain's current tuning when st.params isn't passed
const RINGS = [[0], [0], [0, 0.9], [0, 0.6]], BARRELS = [0, 3, 4, 6];
function slamRings(A) { const r = A.params?.rings; return Array.isArray(r) && r.length ? r : RINGS[Math.min(3, A.phaseNow)]; }
const CLIPS = {
  slam: {
    tele(P, t, D, A) {
      // raise (ease out), hold with a tremble while the claw glows, then the downswing lands exactly at act start
      const down0 = Math.max(0.35, D - 0.13);
      const u = eo(k01(t, 0, Math.min(0.62, down0 * 0.85)));
      const d = ei(k01(t, down0, D));
      slamUp(P, u * (1 - d)); slamHit(P, d);
      const tr = u * (1 - d) * k01(t, 0.5, down0);
      P[C.lx] += Math.sin(t * 47) * 0.03 * tr; P[C.ly] += Math.sin(t * 41 + 1) * 0.03 * tr; P[C.sy] += Math.sin(t * 33) * 0.012 * tr;
      P[C.glowL] = Math.max(P[C.glowL], sm(k01(t, 0.1, down0)) * (0.85 + 0.15 * Math.sin(t * 20)));
      P[C.ed] += 0.25 * d;
    },
    act(P, t, D, A) {
      const R = slamRings(A);
      // which slam are we in: each ring k lands at R[k]; between slams the claw re-raises
      let k = 0; while (k + 1 < R.length && t >= R[k + 1] - 0.4) k++;
      for (let i = 0; i < R.length; i++) if (A.cross(R[i])) { A.impact('clawL', 1.0); A.kickShell(1.0); }
      const t0 = R[k], dt0 = t - t0;
      let f;
      if (dt0 >= 0) f = 1 - 0.3 * sm(k01(dt0, 0.05, 0.45));                                // after impact: settle a little
      else { const up = eo(k01(dt0, -0.4, -0.16)) * (1 - ei(k01(dt0, -0.13, 0))); f = 0.7 * (1 - up); slamUp(P, up * 0.75); }   // quick re-raise
      const ov = bump(dt0, 0, 0.35) * 0.08;
      slamHit(P, f);
      P[C.bp] += ov; P[C.sy] += -bump(dt0, 0, 0.18) * 0.06;
      P[C.glowL] = dt0 < 0 ? sm(k01(dt0, -0.4, 0)) : Math.max(0, 1.6 * (1 - k01(dt0, 0, 0.45)));
      P[C.ed] += 0.5 * bump(dt0, -0.02, 0.4);
      P[C.mouth] += 0.5 * bump(dt0, 0, 0.5);
    },
    rec(P, t, D, A) {
      const u = sm(k01(t, 0.05, Math.min(0.8, D * 0.85)));
      slamHit(P, 0.7 * (1 - u));
      // drag the claw back out of the crater, a shake to fling off the ink
      P[C.lz] += -0.25 * bump(t, 0, 0.6); P[C.ly] += 0.35 * bump(t, 0.1, 0.7);
      P[C.lr] += Math.sin(t * 26) * 0.18 * bump(t, 0.3, 0.8); P[C.lo] += 0.3 * bump(t, 0.3, 0.8);
      P[C.glowL] = 0;
    },
  },
  barrage: {
    tele(P, t, D, A) {
      const u = eo(k01(t, 0, 0.5));
      P[C.by] += -0.22 * u; P[C.sp] += -0.12 * u; P[C.bp] += -0.06 * u; P[C.bz] += -0.1 * u;
      // lids rattle with the pressure building inside
      const rat = u * k01(t, 0.15, D);
      P[C.hA] += 0.07 * Math.abs(Math.sin(t * 31)) * rat; P[C.hB] += 0.07 * Math.abs(Math.sin(t * 29 + 1)) * rat;
      P[C.sy] += Math.sin(t * 37) * 0.012 * rat;
      // pincer winds down and back (the lob), crusher plants
      P[C.rx] += 0.1 * u; P[C.ry] += -0.35 * u; P[C.rz] += -0.9 * u; P[C.rp] += -0.4 * u; P[C.ro] = mix(P[C.ro], 0.7, u);
      P[C.lx] += -0.1 * u; P[C.ly] += -0.35 * u; P[C.lz] += 0.2 * u; P[C.lp] += -0.2 * u;
      P[C.ep] += 0.3 * u; P[C.splay] += 0.1 * u;
    },
    act(P, t, D, A) {
      const tele = A.teleDur || 0.85;
      const B = A.params?.b;
      let n = 0, last = -1;
      // throw times (act-relative); fallback: a throw every 0.3 s for the first 1.2 s
      const nt = B ? B.length : BARRELS[Math.min(3, A.phaseNow)] || 3;
      for (let i = 0; i < nt; i++) {
        const ti = B ? B[i][3] - tele : i * 0.26;
        if (A.cross(ti)) A.event('hatch', i % 2 ? 'hatchB' : 'hatchA', i);
        if (t >= ti - 0.05) { n = i + 1; last = ti; }
      }
      const endT = B ? B[nt - 1][3] - tele : (nt - 1) * 0.26;
      const tl = last < 0 ? 0 : t - last;
      const pump = bump(tl, 0, 0.24) * (n > 0 && t < endT + 0.3 ? 1 : 0);
      const hold = 1 - sm(k01(t, endT + 0.2, endT + 0.9));
      P[C.by] += -0.22 * hold + 0.18 * pump; P[C.sp] += -0.12 * hold - 0.05 * pump; P[C.bp] += -0.06 * hold - 0.05 * pump; P[C.bz] += -0.1 * hold;
      P[C.sy] += 0.03 * pump;
      // each lid pops open on its barrel then falls back
      let lidA = 0, lidB = 0;
      for (let i = 0; i < nt; i++) {
        const ti = B ? B[i][3] - tele : i * 0.26, dt0 = t - ti;
        if (dt0 < -0.02 || dt0 > 0.7) continue;
        const o = dt0 < 0.05 ? eo(k01(dt0, -0.02, 0.05)) : 1 - sm(k01(dt0, 0.1, 0.55));
        if (i % 2) lidB = Math.max(lidB, o); else lidA = Math.max(lidA, o);
      }
      P[C.hA] += lidA; P[C.hB] += lidB;
      // pincer: one big overhead lob that "conducts" the volley, then waves with each pop
      const lob = sm(k01(t, 0, 0.28)) * hold;
      P[C.rx] += mix(0.1, 0.35, lob) * hold; P[C.ry] += mix(-0.35, 1.9, lob) * hold; P[C.rz] += mix(-0.9, 0.5, lob) * hold; P[C.rp] += mix(-0.4, 1.0, lob) * hold; P[C.ro] = mix(P[C.ro], 0.8 - 0.5 * pump, hold);
      P[C.ry] += -0.35 * pump; P[C.rz] += 0.55 * pump; P[C.rp] += -0.75 * pump; P[C.ryw] += -0.2 * pump;
      P[C.lx] += -0.1 * hold; P[C.ly] += -0.35 * hold + 0.1 * pump; P[C.lz] += 0.2 * hold; P[C.lp] += -0.2 * hold;
      P[C.ep] += 0.35 * hold; P[C.splay] += 0.1 * hold; P[C.mouth] += 0.3 * pump;
    },
    rec(P, t, D, A) {
      const u = 1 - sm(k01(t, 0, Math.min(0.6, D)));
      P[C.by] += -0.05 * u; P[C.sy] += -0.04 * bump(t, 0, 0.2);
      if (A.cross(0.02)) A.kickShell(0.4);
    },
  },
  sweep: {
    tele(P, t, D, A) {
      const u = eo(k01(t, 0, 0.6));
      P[C.by] += -0.28 * u; P[C.bz] += -0.35 * u; P[C.bp] += 0.05 * u; P[C.hp] += 0.1 * u;
      // claws spread wide to brace, siphon swells and glows
      P[C.lx] += 0.55 * u; P[C.lz] += -0.55 * u; P[C.lyw] += 0.4 * u; P[C.lo] = mix(P[C.lo], 0.4, u);
      P[C.rx] += -0.55 * u; P[C.rz] += -0.5 * u; P[C.ryw] += -0.4 * u; P[C.ro] = mix(P[C.ro], 0.4, u);
      const c = sm(k01(t, 0.05, D)); P[C.cannon] = Math.max(P[C.cannon], c * (0.8 + 0.2 * Math.sin(t * 40)));
      P[C.sipP] += -0.08 * u + Math.sin(t * 50) * 0.02 * c;
      A.aimBlend(P, 0.7 * u);
      P[C.splay] += 0.16 * u; P[C.ed] += 0.2 * u; P[C.steam] = Math.max(P[C.steam], 0.3 * c);
    },
    act(P, t, D, A) {
      const u = 1;
      P[C.by] += -0.28; P[C.bz] += -0.35 + 0.25 * eo(k01(t, 0, 0.2)); P[C.bp] += 0.05; P[C.hp] += 0.1;
      P[C.lx] += 0.55; P[C.lz] += -0.55; P[C.lyw] += 0.4; P[C.rx] += -0.55; P[C.rz] += -0.5; P[C.ryw] += -0.4; P[C.lo] = 0.4; P[C.ro] = 0.4;
      P[C.cannon] = 1;
      // recoil buzz
      P[C.hp] += Math.sin(t * 61) * 0.012; P[C.hy] += Math.sin(t * 53) * 0.01; P[C.sy] += Math.sin(t * 47) * 0.006;
      A.aimBlend(P, u);
      P[C.splay] += 0.16; P[C.ed] += 0.25; P[C.mouth] += 0.35;
    },
    rec(P, t, D, A) {
      const u = 1 - sm(k01(t, 0, Math.min(0.55, D)));
      P[C.by] += -0.28 * u; P[C.bz] += -0.1 * u; P[C.lx] += 0.55 * u; P[C.lz] += -0.55 * u; P[C.rx] += -0.55 * u; P[C.rz] += -0.5 * u;
      P[C.cannon] = Math.max(0, 1 - k01(t, 0, 0.35));
      A.aimBlend(P, u);
      // head shake: cough the nozzle clear
      P[C.hy] += Math.sin(t * 22) * 0.14 * bump(t, 0.15, 0.75); P[C.sipP] += 0.25 * bump(t, 0.1, 0.7);
      P[C.steam] = Math.max(P[C.steam], bump(t, 0, 0.8));
    },
  },
  charge: {
    tele(P, t, D, A) {
      const u = eo(k01(t, 0, 0.5));
      // low crouch, nose down, claws locked forward like a ram, eyes narrowed; front-left leg paws the ground
      P[C.by] += -0.55 * u; P[C.bp] += 0.2 * u; P[C.bz] += -0.3 * u; P[C.hp] += 0.1 * u;
      P[C.lx] += -1.0 * u; P[C.ly] += -0.2 * u; P[C.lz] += 0.2 * u; P[C.lyw] += -0.5 * u; P[C.lp] += -0.1 * u; P[C.lo] = mix(P[C.lo], 0.05, u);
      P[C.rx] += 0.7 * u; P[C.ry] += -0.2 * u; P[C.rz] += 0.0; P[C.ryw] += 0.45 * u; P[C.ro] = mix(P[C.ro], 0.05, u);
      P[C.ed] += 0.35 * u; P[C.es] += -0.15 * u;
      P[C.paw] = sm(k01(t, 0.25, 0.45)) * (1 - sm(k01(t, D - 0.25, D)));
      P[C.sy] += Math.sin(t * 45) * 0.01 * k01(t, 0.4, D); P[C.sr] += Math.sin(t * 17) * 0.015 * k01(t, 0.4, D);
      P[C.splay] += 0.15 * u;
    },
    act(P, t, D, A) {
      const u = 1;
      P[C.by] += -0.35; P[C.bp] += 0.2; P[C.hp] += 0.12;
      P[C.lx] += -1.0; P[C.ly] += -0.1; P[C.lz] += 0.35; P[C.lyw] += -0.5; P[C.lo] = 0.05;
      P[C.rx] += 0.7; P[C.ry] += -0.1; P[C.rz] += 0.2; P[C.ryw] += 0.45; P[C.ro] = 0.05;
      P[C.ed] += 0.3; P[C.mouth] += 0.4;
    },
    rec(P, t, D, A) {
      // (no wall) skid to a stop and straighten up
      const s = bump(t, 0, 0.5), u = 1 - sm(k01(t, 0.1, Math.min(0.8, D)));
      P[C.by] += -0.35 * u; P[C.bp] += 0.2 * u - 0.22 * s; P[C.bz] += -0.35 * s;
      P[C.lx] += -1.0 * u; P[C.lz] += 0.35 * u; P[C.lyw] += -0.5 * u; P[C.rx] += 0.7 * u; P[C.rz] += 0.2 * u; P[C.ryw] += 0.45 * u;
      P[C.splay] += 0.2 * s; P[C.slide] = Math.max(P[C.slide], s * 0.5);
      if (A.cross(0.02)) A.kickShell(0.6);
    },
  },
  crablets: {
    tele(P, t, D, A) {
      const u = eo(k01(t, 0, 0.5));
      // rear squats (nose up), brood hatch strains
      P[C.bp] += -0.2 * u; P[C.by] += -0.1 * u; P[C.bz] += 0.1 * u; P[C.sp] += 0.06 * u;
      const r = u * k01(t, 0.2, D);
      P[C.hC] += 0.09 * Math.abs(Math.sin(t * 27)) * r; P[C.sy] += Math.sin(t * 39) * 0.015 * r; P[C.sr] += Math.sin(t * 23) * 0.02 * r;
      P[C.ly] += 0.35 * u; P[C.ry] += 0.35 * u; P[C.lo] = mix(P[C.lo], 0.6, u); P[C.ro] = mix(P[C.ro], 0.6, u);
      P[C.ep] += -0.1 * u; P[C.ey] += Math.sin(t * 5) * 0.2 * u;
    },
    act(P, t, D, A) {
      if (A.cross(0.02)) { A.event('crablets', 'hatch', A.params?.n || 3); A.kickShell(0.8); }
      const o = eob(k01(t, 0, 0.14));
      P[C.hC] += o * (1 - 0.1 * bump(t, 0.2, 0.5));
      // shake them out
      const sh = bump(t, 0.08, D);
      P[C.sr] += Math.sin(t * 34) * 0.1 * sh; P[C.br] += Math.sin(t * 34 + 0.6) * 0.05 * sh; P[C.sp] += 0.1 + Math.sin(t * 29) * 0.04 * sh;
      P[C.bp] += -0.28; P[C.by] += -0.12 + 0.08 * sh; P[C.bz] += 0.1;
      P[C.ly] += 0.35; P[C.ry] += 0.35; P[C.lo] = 0.6; P[C.ro] = 0.6; P[C.mouth] += 0.4 * sh;
    },
    rec(P, t, D, A) {
      const c = ei(k01(t, 0, 0.18));
      P[C.hC] += 1 - c;
      if (A.cross(0.18)) A.kickShell(0.6);
      const u = 1 - sm(k01(t, 0.1, Math.min(0.6, D)));
      P[C.bp] += -0.28 * u; P[C.by] += -0.12 * u; P[C.ly] += 0.35 * u; P[C.ry] += 0.35 * u;
    },
  },
  frenzy: {
    tele(P, t, D, A) {
      const u = eo(k01(t, 0, 0.7));
      // coil: twist against the spin, claws flung wide and open, cannon glowing
      P[C.byaw] += -0.55 * u; P[C.by] += -0.35 * u; P[C.br] += 0.05 * u; P[C.bp] += 0.05 * u;
      P[C.lx] += 1.0 * u; P[C.ly] += 0.5 * u; P[C.lz] += -0.9 * u; P[C.lyw] += 0.9 * u; P[C.lo] = mix(P[C.lo], 1, u);
      P[C.rx] += -1.0 * u; P[C.ry] += 0.5 * u; P[C.rz] += -0.9 * u; P[C.ryw] += -0.9 * u; P[C.ro] = mix(P[C.ro], 1, u);
      P[C.cannon] = Math.max(P[C.cannon], sm(k01(t, 0.2, D)) * 0.7);
      P[C.sy] += Math.sin(t * 40) * 0.015 * k01(t, 0.3, D); P[C.ed] += 0.2 * u;
    },
    act(P, t, D, A) {
      const u = 1 - sm(k01(t, D - 0.3, D)) * 0.5;
      // the sim spins the root (params.spin); otherwise the body thrashes back and forth on its own
      const rootSpin = Math.abs(A.yawRate) > 1.2;
      const unwind = 1 - eo(k01(t, 0, 0.25));
      P[C.byaw] += -0.55 * unwind + (rootSpin ? 0 : Math.sin(t * 7.5) * 0.9 * k01(t, 0, 0.3));
      P[C.by] += -0.3 + Math.abs(Math.sin(t * 9)) * 0.08; P[C.br] += (rootSpin ? -0.09 * Math.sign(A.yawRate) : 0) + Math.sin(t * 9) * 0.03;
      P[C.lx] += 1.1 * u; P[C.ly] += 0.4 * u + Math.sin(t * 13) * 0.2; P[C.lz] += -0.8 * u; P[C.lyw] += 0.9 * u; P[C.lo] = 0.7 + 0.3 * Math.sin(t * 17);
      P[C.rx] += -1.1 * u; P[C.ry] += 0.4 * u + Math.sin(t * 13 + 2) * 0.2; P[C.rz] += -0.8 * u; P[C.ryw] += -0.9 * u; P[C.ro] = 0.7 + 0.3 * Math.sin(t * 15);
      P[C.cannon] = 1; P[C.mouth] += 0.6; P[C.sipY] += Math.sin(t * 11) * 0.3;
      P[C.sy] += Math.sin(t * 43) * 0.012;
    },
    rec(P, t, D, A) {
      // (dizzy handled by the stun clip when the sim marks the rec as stunned)
      const u = 1 - sm(k01(t, 0, 0.6));
      P[C.by] += -0.3 * u; P[C.lx] += 1.1 * u; P[C.lz] += -0.8 * u; P[C.rx] += -1.1 * u; P[C.rz] += -0.8 * u;
      P[C.cannon] = Math.max(0, 1 - k01(t, 0, 0.3));
    },
  },
};

// stun: optional wall bonk, collapse nose-up with the belly out, legs splayed, eyes spiralling
function stunClip(P, t, D, A) {
  const bonk = A.stunKind === 'bonk';
  const t0 = bonk ? 0.34 : 0.12;
  if (bonk) {
    if (A.cross(0)) { A.impact('mouth', 1.2); A.kickShell(1.4); A.event('bonk', 'mouth', 1); }
    const j = bump(t, 0, 0.42);
    P[C.bz] += -0.75 * j; P[C.bp] += -0.3 * j; P[C.by] += 0.25 * j; P[C.ed] += 0.8 * j; P[C.mouth] += 0.6 * j;
  }
  const c = eo(k01(t, t0, t0 + 0.55));
  if (A.cross(t0 + 0.5)) { A.impact('belly', 0.7); A.kickShell(0.7); }
  P[C.by] += -1.05 * c; P[C.bp] += -0.28 * c; P[C.bz] += -0.25 * c;
  P[C.splay] += 0.45 * c; P[C.slide] = Math.max(P[C.slide], c < 1 ? 1 : 0.2);
  // limp claws resting on the floor
  P[C.lx] += 0.35 * c; P[C.ly] += -0.2 * c; P[C.lz] += -0.25 * c; P[C.lp] += -0.3 * c; P[C.lo] = mix(P[C.lo], 0.45, c);
  P[C.rx] += -0.35 * c; P[C.ry] += -0.35 * c; P[C.rz] += -0.3 * c; P[C.rp] += -0.25 * c; P[C.ro] = mix(P[C.ro], 0.5, c);
  // dazed sway + eye stalks circling
  const w = k01(t, t0 + 0.3, t0 + 0.9), s = t * 2.6;
  P[C.br] += Math.sin(s) * 0.05 * w; P[C.bp] += Math.cos(s) * 0.035 * w; P[C.hr] += Math.sin(s + 1) * 0.08 * w;
  P[C.ey] += Math.sin(s * 1.3) * 0.35 * w; P[C.ep] += Math.cos(s * 1.3) * 0.25 * w - 0.1 * c; P[C.es] += 0.25 * c; P[C.ed] += 0.35 * c;
  P[C.mouth] += 0.45 * c + 0.1 * Math.sin(t * 3); P[C.belly] = Math.max(P[C.belly], c); P[C.bellyOut] += c;
  P[C.sipP] += 0.3 * c;
}
// after a stun: shake it off and stand
function recoverClip(P, t, D, A) {
  const u = 1 - eo(k01(t, 0, 0.7));
  P[C.by] += -0.7 * u; P[C.bp] += -0.15 * u; P[C.splay] += 0.3 * u; P[C.slide] = Math.max(P[C.slide], u);
  const sh = bump(t, 0.35, 1.0);
  P[C.hy] += Math.sin(t * 24) * 0.2 * sh; P[C.br] += Math.sin(t * 24 + 0.8) * 0.06 * sh; P[C.sr] += Math.sin(t * 24 + 1.6) * 0.06 * sh;
  P[C.ey] += Math.sin(t * 24 + 0.4) * 0.25 * sh; P[C.belly] = Math.max(P[C.belly], u);
}
function roarClip(P, t, D, A) {
  const k = D > 0 ? D / 1.9 : 1, T = t / k;
  const an = eo(k01(T, 0, 0.32)) * (1 - k01(T, 0.32, 0.5));
  const up = eob(k01(T, 0.35, 0.72)) * (1 - sm(k01(T, 1.45, 1.9)));
  if (A.cross(0.38 * k)) { A.event('roar', 'mouth', 1); A.kickShell(0.8); }
  P[C.by] += -0.3 * an + 0.38 * up; P[C.bp] += 0.08 * an - 0.36 * up; P[C.bz] += -0.15 * up; P[C.hp] += 0.15 * an - 0.25 * up;
  P[C.lx] += 0.6 * up - 0.3 * an; P[C.ly] += 1.9 * up - 0.3 * an; P[C.lz] += -1.0 * up; P[C.lp] += 1.2 * up; P[C.lyw] += 0.6 * up; P[C.lo] = mix(P[C.lo], 1, up);
  P[C.rx] += -0.6 * up + 0.3 * an; P[C.ry] += 1.8 * up - 0.3 * an; P[C.rz] += -0.9 * up; P[C.rp] += 1.2 * up; P[C.ryw] += -0.6 * up; P[C.ro] = mix(P[C.ro], 1, up);
  P[C.mouth] += up; P[C.mand] += up; P[C.ep] += 0.45 * up; P[C.es] += 0.35 * up;
  const vib = up * k01(T, 0.45, 0.6);
  P[C.sy] += Math.sin(t * 57) * 0.02 * vib; P[C.sr] += Math.sin(t * 43) * 0.02 * vib; P[C.lr] += Math.sin(t * 31) * 0.1 * vib; P[C.rr] += Math.sin(t * 29) * 0.1 * vib;
  P[C.splay] += 0.1 * up; P[C.steam] = Math.max(P[C.steam], bump(T, 0.4, 1.6));
  P[C.cannon] = Math.max(P[C.cannon], 0.2 * up);
}
function introClip(P, t, D, A) {
  const k = D > 0 ? D / 3.4 : 1, T = t / k;
  // underground → burst → airborne → land → shake off → roar → settle
  if (A.cross(0.5 * k)) A.event('burst', 'shellTop', 1);
  if (A.cross(1.08 * k)) { A.impact('body', 1.2); A.kickShell(1.2); A.resetFeet = true; }
  if (A.cross(2.15 * k)) { A.event('roar', 'mouth', 1); A.kickShell(0.6); }
  let by;
  if (T < 0.5) by = -6.5;
  else if (T < 0.86) { const u = k01(T, 0.5, 0.86); by = mix(-6.5, 0.7, eo(u)); }
  else if (T < 1.08) { const u = k01(T, 0.86, 1.08); by = mix(0.7, -0.5, ei(u)); }
  else by = -0.5 * (1 - eo(k01(T, 1.08, 1.6))) ;
  P[C.by] += by;
  const air = k01(T, 0.5, 0.6) * (1 - k01(T, 1.0, 1.12));
  P[C.bp] += -0.45 * air + 0.12 * bump(T, 1.05, 1.5);
  P[C.curl] = Math.max(P[C.curl], T < 1.0 ? 1 : 1 - k01(T, 1.0, 1.1));
  P[C.lo] = mix(P[C.lo], 1, air); P[C.ro] = mix(P[C.ro], 1, air); P[C.ly] += 0.8 * air; P[C.ry] += 0.8 * air; P[C.lx] += 0.4 * air; P[C.rx] += -0.4 * air;
  // dog-shake
  const sh = bump(T, 1.2, 2.05) , s = T * 30;
  P[C.br] += Math.sin(s) * 0.11 * sh; P[C.sr] += Math.sin(s - 0.9) * 0.13 * sh; P[C.byaw] += Math.sin(s + 0.5) * 0.06 * sh; P[C.hy] += Math.sin(s + 1.3) * 0.15 * sh;
  P[C.ey] += Math.sin(s + 2) * 0.3 * sh; P[C.ed] += 0.4 * sh;
  // roar pose
  const up = eob(k01(T, 2.05, 2.35)) * (1 - sm(k01(T, 2.95, 3.4)));
  P[C.by] += 0.3 * up; P[C.bp] += -0.3 * up; P[C.hp] += -0.2 * up;
  P[C.lx] += 0.6 * up; P[C.ly] += 1.8 * up; P[C.lz] += -1.0 * up; P[C.lp] += 1.2 * up; P[C.lyw] += 0.6 * up; P[C.lo] = mix(P[C.lo], 1, up);
  P[C.rx] += -0.6 * up; P[C.ry] += 1.7 * up; P[C.rz] += -0.9 * up; P[C.rp] += 1.2 * up; P[C.ryw] += -0.6 * up; P[C.ro] = mix(P[C.ro], 1, up);
  P[C.mouth] += up; P[C.mand] += up; P[C.ep] += 0.4 * up; P[C.es] += 0.3 * up;
  P[C.sy] += Math.sin(t * 57) * 0.02 * up;
  P[C.slide] = Math.max(P[C.slide], T < 1.2 ? 1 : 0);
}
function deadClip(P, t, D, A) {
  // stagger → collapse → shell bursts (ink geyser) → X eyes, twitching legs
  const st = bump(t, 0, 0.9);
  P[C.bz] += -0.35 * st; P[C.bp] += -0.2 * st; P[C.br] += 0.1 * Math.sin(t * 7) * st; P[C.by] += 0.1 * st;
  P[C.ly] += 1.2 * st; P[C.lz] += -0.6 * st; P[C.lp] += 0.8 * st; P[C.lo] = mix(P[C.lo], 1, st); P[C.ry] += 1.0 * st; P[C.rp] += 0.6 * st; P[C.ro] = mix(P[C.ro], 1, st);
  P[C.mouth] += st; P[C.ed] += 0.4 * st;
  const c = eo(k01(t, 0.75, 1.45));
  if (A.cross(1.4)) { A.impact('body', 1.4); A.kickShell(1.2); }
  if (A.cross(1.9)) { A.event('geyser', 'shellTop', 1); A.kickShell(1.6); }
  P[C.by] += -1.55 * c; P[C.bp] += 0.12 * c; P[C.br] += 0.14 * c; P[C.bz] += -0.2 * c;
  P[C.splay] += 0.6 * c; P[C.slide] = Math.max(P[C.slide], t > 0.7 ? 1 : 0);
  P[C.lx] += 0.5 * c; P[C.ly] += -0.55 * c; P[C.lp] += -0.4 * c; P[C.lyw] += 0.3 * c; P[C.lo] = mix(P[C.lo], 0.6, c);
  P[C.rx] += -0.5 * c; P[C.ry] += -0.6 * c; P[C.rp] += -0.4 * c; P[C.ryw] += -0.3 * c; P[C.ro] = mix(P[C.ro], 0.6, c);
  P[C.ed] += 0.9 * c; P[C.es] += 0.5 * c; P[C.ep] += -0.5 * c; P[C.hp] += 0.2 * c;
  const b = k01(t, 1.9, 2.1);
  P[C.hA] += eob(b) * 1.1; P[C.hB] += eob(k01(t, 1.95, 2.15)) * 1.05; P[C.hC] += eob(k01(t, 1.92, 2.12)) * 1.1;
  P[C.curl] = Math.max(P[C.curl], 0.5 * k01(t, 2.2, 4.0));
  // last twitches
  const tw = k01(t, 2.2, 3.0) * (1 - k01(t, 4.5, 6));
  P[C.lo] += Math.max(0, Math.sin(t * 9) - 0.7) * 0.8 * tw; P[C.curl] += Math.max(0, Math.sin(t * 5.3 + 1) - 0.8) * 0.6 * tw;
  P[C.belly] = Math.max(P[C.belly], c * (1 - k01(t, 2.0, 4.0)));
}

// ------------------------------------------------------------------------------------------------ animator
export class BossAnimator {
  constructor(model, rig) {
    this.m = model; this.rig = rig; this.by = rig.by; this.rest = rig.rest;
    this.legBones = LEGS.map((L, i) => ['c', 'm', 't', 'd'].map((x) => rig.by['leg' + i + x]));
    this.armBones = ['L', 'R'].map((s) => [rig.by['arm' + s + '0'], rig.by['arm' + s + '1'], rig.by['claw' + s], rig.by['dact' + s]]);
    this.eyeBones = ['L', 'R'].map((s) => [rig.by['stalk' + s + '0'], rig.by['stalk' + s + '1'], rig.by['eye' + s], rig.by['mand' + s]]);
    this.P = new Float32Array(NC); this.Pb = new Float32Array(NC); this.Px = new Float32Array(NC); this.Pprev = new Float32Array(NC);
    this.key = ''; this.clipT = 0; this.prevT = -1; this.curT = 0; this.xf = 1; this.xfDur = 0.2;
    this.time = 0; this.params = null; this.phaseNow = 1; this.teleDur = 0; this.stunKind = 'daze'; this.lastMove = null; this.lastMoveKey = '';
    this.recoverT = 99; this.wasStunned = false; this.oneShot = null; this.oneT = 0; this.deadT = 0;
    this.prevPhase = 0; this.autoRoarT = 99; this.prevHurt = 0;
    // springs
    this.sp = { shP: new Spring(260, 11), shR: new Spring(260, 11), shY: new Spring(320, 12), lagP: new Spring(40, 9), lagR: new Spring(40, 9),
      flP: new Spring(90, 10), flR: new Spring(90, 10), flE: new Spring(70, 9), door: new Spring(14, 1.3),
      eLY: new Spring(110, 5), eLP: new Spring(110, 5), eRY: new Spring(110, 5), eRP: new Spring(110, 5), tear: new Spring(60, 7) };
    // root motion
    this.rootPos = new THREE.Vector3(); this.rootPrev = new THREE.Vector3(); this.vel = new THREE.Vector3(); this.yaw = 0; this.yawPrev = 0; this.yawRate = 0;
    this.first = true;
    this.rootInv = new THREE.Matrix4(); this.rootQ = new THREE.Quaternion(); this.rootQi = new THREE.Quaternion();
    // body model transform (for clips needing it) + head accel tracking
    this.bodyPos = new THREE.Vector3(); this.bodyQ = new THREE.Quaternion();
    this.headW = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    // gait
    this.phi = 0; this.gaitOn = false; this.cad = 0; this.resetFeet = true;
    this.legs = LEGS.map((L, i) => ({ L, i, foot: new THREE.Vector3(), from: new THREE.Vector3(), to: new THREE.Vector3(), home: new THREE.Vector3(), swing: false, s: 0, off: [0, 0.5, 0][i % 3] + (i < 3 ? 0 : 0.5), err: 0, restXZ: new THREE.Vector2(L.foot.x - BODY.pivot.x, L.foot.z - BODY.pivot.z) }));
    for (const l of this.legs) l.off %= 1;
    // aim
    this.aimYaw = 0; this.aimPitch = 0; this.aimW = 0; this.hasAim = false; this.aimLocal = new THREE.Vector3();
    // leg rest frames
    this.legRest = LEGS.map((L) => {
      const n = new THREE.Vector3().crossVectors(new THREE.Vector3().subVectors(L.ankle, L.cox), legPole(L.out, new THREE.Vector3())).normalize();
      return { n, dm: L.knee.clone().sub(L.cox).normalize(), dt: L.ankle.clone().sub(L.knee).normalize(), dd: L.foot.clone().sub(L.ankle).normalize(), coxOff: L.cox.clone().sub(L.hip), hipOff: L.hip.clone().sub(BODY.pivot), maxYaw: (LEGS.indexOf(L) % 3) ? 0.45 : 0.8 };
    });
    this.armRest = ARMS.map((A) => {
      const n = new THREE.Vector3().crossVectors(new THREE.Vector3().subVectors(A.W, A.S), A.pole).normalize();
      const side = new THREE.Vector3().crossVectors(A.U, A.D).normalize();
      return { n, du: A.E.clone().sub(A.S).normalize(), df: A.W.clone().sub(A.E).normalize(), sOff: A.S.clone().sub(BODY.pivot), wOff: A.W.clone().sub(BODY.pivot), side, D: A.D.clone(), U: A.U.clone().sub(A.D.clone().multiplyScalar(A.U.dot(A.D))).normalize() };
    });
    // chain sims
    this.chains = rig.chains.map((ch) => this._initChain(ch));
    this.contInv = new THREE.Matrix4().copy(MC).invert();
    this.contRot = new THREE.Quaternion().setFromRotationMatrix(MC);
    this.acc = 0;
    this.events = [];
  }

  // ---------------------------------------------------------------- hooks used by clips
  cross(t) { return this.prevT < t && this.curT >= t; }
  impact(socket, s) { this.m._emitImpact(socket, s); }
  event(name, socket, data) { this.m._emitEvent(name, socket, data); }
  kickShell(a) { this.sp.shY.v += -1.6 * a; this.sp.shP.v += (Math.sin(this.time * 13.1) > 0 ? 1 : -1) * 1.1 * a; this.sp.shR.v += (Math.sin(this.time * 7.7) > 0 ? 1 : -1) * 1.3 * a; this.sp.door.v += 2.5 * a; }
  flinch(a) { this.sp.flP.v += -3.6 * a; this.sp.flR.v += (Math.sin(this.time * 91.7) > 0 ? 1 : -1) * 1.6 * a; this.sp.flE.v += 6 * a; this.sp.shY.v += -0.8 * a; }
  trigger(name) { if (name === 'hurt') this.flinch(0.8); else { this.oneShot = name; this.oneT = 0; } }
  // sweep aim → body twist + head yaw + nozzle yaw/pitch
  aimBlend(P, w) {
    if (!this.hasAim) return;
    const y = this.aimYaw, p = this.aimPitch;
    const by = Math.max(-0.28, Math.min(0.28, y * 0.22));
    const hy = Math.max(-0.45, Math.min(0.45, (y - by) * 0.45));
    const sy = Math.max(-0.6, Math.min(0.6, y - by - hy));
    P[C.byaw] += by * w; P[C.hy] += hy * w; P[C.sipY] += sy * w; P[C.sipP] += Math.max(-0.5, Math.min(0.35, p)) * w;
    P[C.ey] += y * 0.3 * w;
  }

  // ---------------------------------------------------------------- main
  update(dt, st) {
    dt = Math.min(dt, 1 / 15);
    this.time += dt;
    const m = this.m, root = m.root;
    root.updateWorldMatrix(true, false);
    const RW = root.matrixWorld;
    this.rootInv.copy(RW).invert();
    RW.decompose(_v1, this.rootQ, _v2); this.rootQi.copy(this.rootQ).invert();
    this.rootPos.setFromMatrixPosition(RW);
    _v1.set(0, 0, 1).applyQuaternion(this.rootQ); const yaw = Math.atan2(_v1.x, _v1.z);
    if (this.first) { this.rootPrev.copy(this.rootPos); this.yawPrev = yaw; }
    // measured root motion (what the sim actually did) drives the gait
    _v2.subVectors(this.rootPos, this.rootPrev).divideScalar(Math.max(dt, 1e-4)); _v2.y = 0;
    if (_v2.lengthSq() > 30 * 30) _v2.set(0, 0, 0);            // teleport / snapshot snap
    this.vel.lerp(_v2, dampK(14, dt));
    let dy = yaw - this.yawPrev; while (dy > PI) dy -= TAU; while (dy < -PI) dy += TAU;
    this.yawRate = mix(this.yawRate, Math.abs(dy) > 1.5 ? 0 : dy / Math.max(dt, 1e-4), dampK(12, dt));
    this.rootPrev.copy(this.rootPos); this.yawPrev = yaw;

    // aim (model space) for the cannon / eyes
    this.hasAim = !!st.aim && !st.dead;
    if (this.hasAim) {
      this.aimLocal.copy(st.aim).applyMatrix4(this.rootInv);
      const dx = this.aimLocal.x - HEAD.nozzleTip.x, dyy = this.aimLocal.y - HEAD.nozzleTip.y, dz = this.aimLocal.z - HEAD.nozzle.z;
      const ty = Math.atan2(dx, Math.max(0.5, dz)), tp = Math.atan2(dyy, Math.max(1, Math.hypot(dx, dz)));
      this.aimYaw = mix(this.aimYaw, Math.max(-1.4, Math.min(1.4, ty)), dampK(10, dt)); this.aimPitch = mix(this.aimPitch, tp, dampK(10, dt));
    }
    this.params = st.params || null;

    // hurt → additive flinch
    const h = typeof st.hurt === 'number' ? st.hurt : st.hurt ? 1 : 0;
    if (h > 0 && (h !== this.prevHurt || this.prevHurt === 0)) this.flinch(Math.min(1.2, 0.35 + h));
    this.prevHurt = h;
    // phase change → roar (unless the sim plays one explicitly or something bigger is on)
    const phase = st.phase || 1; this.phaseNow = phase;
    if (this.prevPhase === 0) this.prevPhase = phase;          // a boss built mid-fight doesn't roar on its first frame
    if (phase > this.prevPhase && !st.dead) this.autoRoarT = 0;
    this.prevPhase = phase;
    this.autoRoarT += dt;

    // ---------- 1. clip selection
    let key, fn = null, t = 0, D = 0, own = false;
    if (st.dead) { this.deadT = this.key === 'dead' ? this.deadT + dt : 0; key = 'dead'; fn = deadClip; t = this.deadT; D = 6; }
    else if (st.move === 'intro' || this.oneShot === 'intro') { key = 'intro'; fn = introClip; D = st.move === 'intro' ? (st.phaseDur || 3.4) : 3.4; if (st.move === 'intro' && typeof st.moveT === 'number') t = st.moveT; else own = true; }
    else if (st.stunned) { key = 'stun'; fn = stunClip; own = true; D = st.phaseDur || 3; }
    else if (st.move === 'roar' || this.oneShot === 'roar' || (this.autoRoarT < 1.9 && !st.move)) { key = 'roar'; fn = roarClip; D = st.move === 'roar' ? (st.phaseDur || 1.9) : 1.9; if (st.move === 'roar' && typeof st.moveT === 'number') t = st.moveT; else if (this.oneShot === 'roar') own = true; else t = this.autoRoarT; }
    else if (st.move && CLIPS[st.move] && st.movePhase && PH[st.movePhase] !== undefined) {
      key = st.move + ':' + st.movePhase; fn = CLIPS[st.move][st.movePhase];
      D = st.phaseDur || DUR[st.move][PH[st.movePhase]];
      if (typeof st.moveT === 'number') t = st.moveT; else own = true;
      if (st.movePhase === 'tele') this.teleDur = D;
      this.lastMove = st.move;
    } else if (this.recoverT < 1.0) { key = 'recover'; fn = recoverClip; t = this.recoverT; D = 1.0; }
    else key = 'loco';
    // stun bookkeeping
    if (st.stunned && !this.wasStunned) this.stunKind = this.lastMoveKey === 'charge:act' && (!this.params || this.params.wall !== 0) ? 'bonk' : 'daze';
    if (!st.stunned && this.wasStunned && !st.dead) this.recoverT = 0;
    this.wasStunned = !!st.stunned; this.recoverT += dt;
    if (key !== 'stun' && key !== 'loco') this.lastMoveKey = key;
    if (key !== this.key) {
      // cross-fade from whatever was on screen
      this.Px.set(this.P); this.xf = 0;
      this.xfDur = key === 'intro' ? 0.0001 : key === 'dead' ? 0.12 : key === 'stun' ? 0.08 : key.endsWith(':act') ? 0.07 : 0.2;
      this.key = key; this.clipT = 0; this.prevT = -1e-6;
    } else this.prevT = this.curT;
    if (own) { t = this.clipT; }
    this.clipT += dt;
    if (this.oneShot && (key !== this.oneShot || this.clipT > D + 0.05)) { if (key !== this.oneShot || this.clipT > D) this.oneShot = null; }
    this.curT = t;

    // ---------- 2. locomotion base + clip + cross-fade
    const Pb = this.Pb; this._loco(Pb, dt, st);
    const P = this.P;
    const Pn = this.Pprev; Pn.set(Pb);
    if (fn) fn(Pn, t, D, this);
    this.xf = Math.min(1, this.xf + dt / this.xfDur);
    const w = sm(this.xf);
    for (let i = 0; i < NC; i++) P[i] = this.Px[i] + (Pn[i] - this.Px[i]) * w;

    // ---------- 3. additive springs
    const S = this.sp;
    S.shP.step(dt); S.shR.step(dt); S.shY.step(dt); S.flP.step(dt); S.flR.step(dt); S.flE.step(dt);
    // shell lags the body's acceleration (heavy container)
    _v3.copy(this.vel).applyQuaternion(this.rootQi);
    const ax = (_v3.x - (this._lvx || 0)) / Math.max(dt, 1e-3), az = (_v3.z - (this._lvz || 0)) / Math.max(dt, 1e-3); this._lvx = _v3.x; this._lvz = _v3.z;
    S.lagP.step(dt, Math.max(-0.12, Math.min(0.12, -az * 0.012))); S.lagR.step(dt, Math.max(-0.1, Math.min(0.1, ax * 0.01)));
    P[C.sp] += S.shP.x * 0.03 + S.lagP.x; P[C.sr] += S.shR.x * 0.025 + S.lagR.x; P[C.sy] += S.shY.x * 0.03;
    P[C.bp] += S.flP.x * 0.08; P[C.br] += S.flR.x * 0.05; P[C.ed] += S.flE.x * 0.07; P[C.by] += S.flP.x * 0.04; P[C.hp] += S.flP.x * 0.06;
    S.door.step(dt, 0); S.door.v += (-az * 0.02 + ax * 0.03) * dt * 6;
    S.tear.step(dt, phase >= 3 || (st.dead && this.deadT > 1.9) ? 1 : 0);

    // ---------- 4. body transform + gait
    this._bodyTransform(P);
    this._gait(dt, P, st);

    // ---------- 5. apply to the rig
    this._apply(dt, P, st);

    // ---------- 6. secondary chains (world space)
    root.updateMatrixWorld(true);
    this._chains(dt, st);
  }

  // ---------------------------------------------------------------- locomotion base pose
  _loco(P, dt, st) {
    P.fill(0);
    const t = this.time;
    const v = Math.hypot(this.vel.x, this.vel.z), yr = this.yawRate;
    const wv = cl(v / 3), gal = cl((v - 5) / 6);
    const br = t * (1.55 + 0.4 * (st.phase >= 3 ? 1 : 0));
    // breathing: body rises, shell lifts a hair after it, belly swells (bone scale in _apply)
    P[C.by] += Math.sin(br) * 0.04 * (1 - wv * 0.5); P[C.sp] += Math.sin(br - 0.7) * 0.012; P[C.hp] += Math.sin(br - 0.3) * 0.015;
    // gait bob: two dips per cycle (tripods landing), sway, lean into travel
    const ph = this.phi * TAU, gw = this.gaitOn ? 1 : 0;
    const bobA = (0.05 + 0.05 * wv + 0.2 * gal) * cl(this.cad / 0.8) * gw;
    P[C.by] += -bobA * (0.5 - 0.5 * Math.cos(ph * 2)) + 0.015 * wv;
    P[C.br] += Math.sin(ph) * (0.025 + 0.02 * gal) * wv;
    P[C.bp] += 0.05 * wv + 0.1 * gal + Math.sin(ph * 2 + 0.6) * 0.02 * wv;
    P[C.sp] += -Math.sin(ph * 2 + 1.2) * 0.012 * wv;
    // turn: lean into it, head + eyes lead
    P[C.br] += Math.max(-0.08, Math.min(0.08, -yr * 0.035));
    P[C.hy] += Math.max(-0.25, Math.min(0.25, yr * 0.12)); P[C.ey] += Math.max(-0.4, Math.min(0.4, yr * 0.18));
    // claws: carried forward, bob out of phase with the steps
    P[C.lz] += -0.55 + Math.sin(ph + 1.1) * 0.08 * wv; P[C.ly] += 0.12 + Math.cos(ph * 2 + 0.5) * 0.04 * wv; P[C.lx] += -0.15; P[C.lp] += 0.12; P[C.lyw] += -0.12;
    P[C.rz] += -0.5 + Math.sin(ph + 4.2) * 0.08 * wv; P[C.ry] += 0.08 + Math.cos(ph * 2 + 2.0) * 0.04 * wv; P[C.rx] += 0.12; P[C.rp] += 0.05; P[C.ryw] += 0.1;
    // idle life: claws open/close, an occasional clack, eye stalks look around, mouthparts flutter
    const idle = 1 - wv;
    P[C.lo] = 0.14 + 0.06 * Math.sin(t * 0.9) + 0.35 * bump((t % 5.3), 0.0, 0.35) * idle;
    P[C.ro] = 0.18 + 0.08 * Math.sin(t * 1.3 + 1) + 0.4 * bump(((t + 2.1) % 3.7), 0.0, 0.25) * idle;
    P[C.lr] += Math.sin(t * 0.7) * 0.05; P[C.rr] += Math.sin(t * 0.9 + 1) * 0.06;
    P[C.ey] += vnoise(t * 0.45, 1) * 0.3; P[C.ep] += vnoise(t * 0.4, 2) * 0.12; P[C.es] += vnoise(t * 0.3, 3) * 0.1;
    P[C.mand] += (Math.sin(t * 7) * 0.5 + 0.5) * 0.15;
    // look at the target (eyes + a little head)
    if (this.hasAim) { P[C.ey] += Math.max(-0.5, Math.min(0.5, this.aimYaw * 0.5)); P[C.hy] += Math.max(-0.12, Math.min(0.12, this.aimYaw * 0.12)); P[C.ep] += Math.max(-0.3, Math.min(0.3, this.aimPitch * 0.5)); }
    // phase flavour: phase 3 = enraged, faster breathing, steam
    if ((st.phase || 1) >= 3) { P[C.steam] = 0.55; P[C.belly] = 1; }
  }

  // ---------------------------------------------------------------- body transform (model space)
  _bodyTransform(P) {
    _e.set(P[C.bp], P[C.byaw], -P[C.br], 'YXZ');
    this.bodyQ.setFromEuler(_e);
    this.bodyPos.set(BODY.pivot.x + P[C.bx], BODY.pivot.y + P[C.by], BODY.pivot.z + P[C.bz]);
  }

  // ---------------------------------------------------------------- gait
  _groundY(x, z, fallback) {
    const ph = this.m.physics;
    if (!ph || !ph.raycast) return fallback;
    _v6.set(x, fallback + 2.5, z);
    const r = ph.raycast(_v6, DOWN, 5, _ray);
    return r && r.hit ? r.point.y : fallback;
  }
  _home(l, P, out, tAhead = 0) {
    // home = rest foot rotated with the body's yaw, splayed; world space (optionally predicted tAhead seconds)
    const sw = [1, 0.75, 0.55][l.i % 3], sp = 1 + P[C.splay] * sw, yaw = P[C.byaw] + this.yawRate * tAhead;
    const x = l.restXZ.x * sp, z = l.restXZ.y * (1 + P[C.splay] * 0.3 * sw);
    const c = Math.cos(yaw), s = Math.sin(yaw);
    out.set(BODY.pivot.x + P[C.bx] + x * c + z * s, 0, BODY.pivot.z + P[C.bz] - x * s + z * c);
    out.applyMatrix4(this.m.root.matrixWorld);
    if (tAhead) { _v5.copy(this.vel).multiplyScalar(tAhead); out.add(_v5); }
    return out;
  }
  _gait(dt, P, st) {
    const RW = this.m.root.matrixWorld, gy = this.rootPos.y;
    const v = Math.hypot(this.vel.x, this.vel.z), yr = Math.abs(this.yawRate);
    const vEff = v + yr * 2.8;
    const gallop = st.move === 'charge' && st.movePhase === 'act';
    // homes + errors
    let maxErr = 0;
    for (const l of this.legs) { this._home(l, P, l.home); l.home.y = gy; if (!l.swing) { l.err = Math.hypot(l.foot.x - l.home.x, l.foot.z - l.home.z); maxErr = Math.max(maxErr, l.err); } }
    if (this.first || this.resetFeet) { for (const l of this.legs) { l.foot.copy(l.home); l.swing = false; } this.first = false; this.resetFeet = false; maxErr = 0; }
    const slide = P[C.slide];
    if (slide > 0.001) for (const l of this.legs) if (!l.swing) { l.foot.lerp(l.home, cl(slide * dt * 8)); }
    const moving = vEff > 0.3;
    let anySwing = false; for (const l of this.legs) if (l.swing) anySwing = true;
    const settle = maxErr > 0.32 || anySwing;
    this.gaitOn = moving || settle;
    const duty = gallop ? 0.52 : 0.42;
    const Ls = gallop ? mix(2.6, 4.6, cl((v - 6) / 8)) : mix(1.5, 2.8, cl(v / 5));
    const f = moving ? Math.max(0.9, Math.min(gallop ? 3.4 : 2.4, vEff / Ls)) : Math.min(2.6, 1.5 + maxErr * 1.2);
    this.cad = this.gaitOn ? f : 0;
    const Tst = (1 - duty) / f;
    const arc = gallop ? 0.7 : 0.32 + 0.08 * Math.min(v, 4);
    if (this.gaitOn) this.phi = (this.phi + f * dt) % 1;
    for (const l of this.legs) {
      const lp = (this.phi + l.off) % 1;
      const inSwing = this.gaitOn && lp < duty;
      if (inSwing && !l.swing) {
        // lift off (skip tiny corrections while settling)
        if (moving || l.err > 0.2) { l.swing = true; l.from.copy(l.foot); }
      }
      if (l.swing) {
        const s = lp / duty;
        if (!inSwing || s < l.s - 0.5) {
          // land
          l.swing = false; l.s = 0; l.foot.copy(l.to);
          this.m._emitFoot(l.i, l.foot, Math.min(1.5, 0.35 + v * 0.1 + (gallop ? 0.5 : 0)));
          this.kickShell(0.05 + 0.02 * Math.min(v, 6));
        } else {
          l.s = s;
          this._home(l, P, l.to, Tst * 0.5 + (1 - s) * duty / f);
          // don't overreach
          _v4.subVectors(l.to, l.home); const dl = _v4.length(), mx = 1.25 + (gallop ? 0.8 : 0); if (dl > mx) l.to.copy(l.home).addScaledVector(_v4, mx / dl);
          l.to.y = this._groundY(l.to.x, l.to.z, gy);
          const e = sm(s);
          l.foot.lerpVectors(l.from, l.to, e);
          l.foot.y = mix(l.from.y, l.to.y, e) + Math.sin(s * PI) * arc * (1 - 0.3 * Math.pow(s, 3));
        }
      }
      // skitter fallback: a planted foot never gets left more than ~2.3 m behind (frenzy spin, snaps)
      if (!l.swing) { _v4.subVectors(l.foot, l.home); _v4.y = 0; const d = _v4.length(), mx = 2.6; if (d > mx) { l.foot.x = l.home.x + _v4.x * mx / d; l.foot.z = l.home.z + _v4.z * mx / d; } }
    }
    // charge tele: the front-left leg paws the ground
    const paw = P[C.paw];
    if (paw > 0.001) {
      const l = this.legs[0]; const cyc = (this.time * 2.3) % 1;
      _v4.set(0, Math.max(0, Math.sin(cyc * TAU)) * 0.35, 0.55 - cyc * 1.1).applyQuaternion(this.rootQ);
      _v5.copy(l.home).add(_v4);
      l.foot.lerp(_v5, paw);
      if (cyc < 0.5 && ((this.time - dt) * 2.3) % 1 > 0.5) this.m._emitFoot(0, l.foot, 0.3);
    }
  }

  // ---------------------------------------------------------------- apply pose to bones
  _apply(dt, P, st) {
    const by = this.by, R = this.rest;
    const bQ = this.bodyQ, bP = this.bodyPos;
    // body
    by.body.position.copy(bP); by.body.quaternion.copy(bQ);
    // shell (relative to body)
    _e.set(P[C.sp], 0, -P[C.sr], 'YXZ'); by.shell.quaternion.setFromEuler(_e);
    by.shell.position.copy(R.shell).sub(R.body); by.shell.position.y += P[C.sy];
    // head
    _e.set(P[C.hp], P[C.hy], -P[C.hr], 'YXZ'); by.head.quaternion.setFromEuler(_e);
    // belly: breathing + push out when exposed
    const bs = 1 + Math.sin(this.time * 1.55) * 0.03 + P[C.bellyOut] * 0.08;
    by.belly0.scale.setScalar(bs); by.belly1.scale.setScalar(1 + Math.sin(this.time * 1.55 - 0.5) * 0.025);
    by.belly0.quaternion.setFromAxisAngle(_v1.set(1, 0, 0), -0.25 * P[C.bellyOut]);
    by.abdomen.scale.setScalar(1 + Math.sin(this.time * 1.55 - 1.0) * 0.02 + 0.03 * this.sp.tear.x);

    // ---- legs
    const rootInv = this.rootInv;
    const bodyUp = _n1.set(0, 1, 0).applyQuaternion(bQ);
    const curl = cl(P[C.curl]);
    for (let i = 0; i < 6; i++) {
      const L = LEGS[i], LR = this.legRest[i], leg = this.legs[i];
      const LB = this.legBones[i];
      // hip + foot in model space
      _H.copy(LR.hipOff).applyQuaternion(bQ).add(bP);
      _F.copy(leg.foot).applyMatrix4(rootInv);
      if (curl > 0.001) {
        // tucked: foot pulled up under the body
        _v4.set(L.foot.x * 0.55, L.foot.y + 1.3, (L.foot.z - BODY.pivot.z) * 0.7 + BODY.pivot.z).sub(BODY.pivot).applyQuaternion(bQ).add(bP);
        _F.lerp(_v4, curl);
      }
      // coxa yaw toward the foot (about the body's up axis), clamped
      _out.subVectors(_F, _H); _out.addScaledVector(bodyUp, -_out.dot(bodyUp)); if (_out.lengthSq() < 1e-6) _out.copy(L.out); _out.normalize();
      _v1.copy(L.out).applyQuaternion(bQ); _v1.addScaledVector(bodyUp, -_v1.dot(bodyUp)).normalize();
      let ang = Math.atan2(_v2.crossVectors(_v1, _out).dot(bodyUp), _v1.dot(_out));
      ang = Math.max(-LR.maxYaw, Math.min(LR.maxYaw, ang));
      _q1.setFromAxisAngle(bodyUp, ang).multiply(bQ);               // coxa model quat
      LB[0].quaternion.copy(bQ).invert().multiply(_q1);
      _X.copy(LR.coxOff).applyQuaternion(_q1).add(_H);                 // coxa end
      // ankle + knee
      _out.subVectors(_F, _X); _out.y = 0; if (_out.lengthSq() < 1e-6) _out.copy(L.out); _out.normalize();
      ankleFor(_F, _out, L.ld, _A);
      legPole(_out, _pole);
      ik2(_X, _A, L.l1, L.l2, _pole, _K, _v3);                          // _v3 = reachable ankle
      _v4.subVectors(_v3, _A); _F.add(_v4); _A.copy(_v3);               // overreach → the whole foot follows
      _n0.subVectors(_A, _X).cross(_pole).normalize();
      // merus / tibia / dactyl
      _v1.subVectors(_K, _X); frameQuat(LR.dm, LR.n, _v1, _n0, _q2);
      LB[1].quaternion.copy(_q1).invert().multiply(_q2);
      _v1.subVectors(_A, _K); frameQuat(LR.dt, LR.n, _v1, _n0, _q3);
      LB[2].quaternion.copy(_q2).invert().multiply(_q3);
      _v1.subVectors(_F, _A); frameQuat(LR.dd, LR.n, _v1, _n0, _q4);
      LB[3].quaternion.copy(_q3).invert().multiply(_q4);
    }

    // ---- claws (2-bone IK to a body-space wrist target, explicit claw orientation)
    for (let a = 0; a < 2; a++) {
      const A = ARMS[a], AR = this.armRest[a], AB = this.armBones[a];
      const o = ARM_CH[a];
      _H.copy(AR.sOff).applyQuaternion(bQ).add(bP);                    // shoulder
      _v1.set(AR.wOff.x + P[o[0]], AR.wOff.y + P[o[1]], AR.wOff.z + P[o[2]]);
      // keep claws off the floor (model y) — the palm is ~0.55 tall under the wrist
      _A.copy(_v1).applyQuaternion(bQ).add(bP);
      const floorY = (a === 0 ? 0.62 : 0.4);
      if (_A.y < floorY) _A.y = floorY + (_A.y - floorY) * 0.15;
      // pole: out + down, swinging forward as the claw goes overhead
      const raise = cl((_A.y - _H.y) / 1.6);
      _pole.copy(A.pole).applyQuaternion(bQ); _v2.set(0, 0, 1).applyQuaternion(bQ); _pole.addScaledVector(_v2, raise * 1.2).addScaledVector(bodyUp, raise * 0.6).normalize();
      ik2(_H, _A, A.lu, A.lf, _pole, _K, _v3);
      _n0.subVectors(_v3, _H).cross(_pole).normalize();
      _v1.subVectors(_K, _H); frameQuat(AR.du, AR.n, _v1, _n0, _q1);
      AB[0].quaternion.copy(bQ).invert().multiply(_q1);
      _v1.subVectors(_v3, _K); frameQuat(AR.df, AR.n, _v1, _n0, _q2);
      AB[1].quaternion.copy(_q1).invert().multiply(_q2);
      // claw: rest frame → yaw (about up) · pitch (about side) · roll (about claw axis), then the body
      _q3.setFromAxisAngle(AR.D, P[o[5]]);
      _q4.setFromAxisAngle(AR.side, -P[o[3]]); _q4.multiply(_q3);
      _q3.setFromAxisAngle(UP, P[o[4]]); _q3.multiply(_q4);
      _q4.copy(bQ).multiply(_q3);                                        // claw model quat
      AB[2].quaternion.copy(_q2).invert().multiply(_q4);
      const open = cl(P[o[6]]) * (a === 0 ? 0.62 : 0.55);
      AB[3].quaternion.setFromAxisAngle(AR.side, -open);
    }

    // ---- eyes on stalks: look + spread + droop, jiggle springs from head acceleration
    const S = this.sp;
    const hW = this.headW; hW[2].copy(hW[1]); hW[1].copy(hW[0]); by.head.getWorldPosition(hW[0]);
    if (this.time > 0.2) {
      _v1.copy(hW[0]).addScaledVector(hW[1], -2).add(hW[2]).divideScalar(Math.max(dt * dt, 1e-5)).applyQuaternion(this.rootQi);
      const ax = Math.max(-40, Math.min(40, _v1.x)), ay = Math.max(-40, Math.min(40, _v1.y)), az = Math.max(-40, Math.min(40, _v1.z));
      S.eLY.v += -ax * 0.004; S.eRY.v += -ax * 0.004; S.eLP.v += (az * 0.004 + ay * 0.003); S.eRP.v += (az * 0.004 + ay * 0.0035);
    }
    S.eLY.step(dt); S.eLP.step(dt); S.eRY.step(dt); S.eRP.step(dt);
    for (let e = 0; e < 2; e++) {
      const k = e === 0 ? 1 : -1, EB = this.eyeBones[e];
      const yawJ = e === 0 ? S.eLY.x : S.eRY.x, pitJ = e === 0 ? S.eLP.x : S.eRP.x;
      const look = P[C.ey], pit = P[C.ep], spread = P[C.es], droop = cl(P[C.ed]);
      // stalk base: splay outward + droop back; mid: the look; eye: counter to stay level-ish
      _e.set(-0.25 * droop + pitJ * 0.5 - pit * 0.25, look * 0.35 + yawJ * 0.4, -k * (spread * 0.35 + droop * 0.18), 'YXZ');
      EB[0].quaternion.setFromEuler(_e);
      _e.set(-0.35 * droop + pitJ - pit * 0.4, look * 0.4 + yawJ * 0.6, -k * spread * 0.2, 'YXZ');
      EB[1].quaternion.setFromEuler(_e);
      _e.set(-pit * 0.35 + 0.15 * droop, look * 0.3, 0, 'YXZ');
      EB[2].quaternion.setFromEuler(_e);
      EB[2].scale.set(1, 1 - 0.25 * droop, 1);
      // mandibles
      EB[3].quaternion.setFromAxisAngle(_v1.set(0, 0, 1), k * (0.1 * P[C.mand] + 0.35 * P[C.mouth])).premultiply(_q1.setFromAxisAngle(_v2.set(1, 0, 0), -0.25 * P[C.mouth]));
    }
    // siphon / nozzle
    _e.set(P[C.sipP] * 0.5, P[C.sipY] * 0.5, 0, 'YXZ'); by.siphon.quaternion.setFromEuler(_e);
    _e.set(P[C.sipP] * 0.5, P[C.sipY] * 0.5, 0, 'YXZ'); by.nozzle.quaternion.setFromEuler(_e);
    by.nozzle.scale.setScalar(1 + 0.12 * P[C.cannon] + 0.04 * Math.sin(this.time * 40) * P[C.cannon]);
    // hatches: A hinges on +x edge (lifts with −angle about the container z), B mirrored, C on its rear edge
    const cz = _v1.set(0, 0, 1).applyQuaternion(this.contRot), cx = _v2.set(1, 0, 0).applyQuaternion(this.contRot), cy = _v3.set(0, 1, 0).applyQuaternion(this.contRot);
    by.hatchA.quaternion.setFromAxisAngle(cz, -1.95 * Math.max(0, P[C.hA]));
    by.hatchB.quaternion.setFromAxisAngle(cz, 1.95 * Math.max(0, P[C.hB]));
    by.hatchC.quaternion.setFromAxisAngle(cx, -2.0 * Math.max(0, P[C.hC]));
    by.doorR.quaternion.setFromAxisAngle(cy, Math.max(-0.5, Math.min(0.9, S.door.x * 0.4)));
    // phase-3 tear flaps (blow open, overshoot, settle hanging)
    const to = S.tear.x;
    by.tearL.quaternion.setFromAxisAngle(cz, -1.9 * to);
    by.tearR.quaternion.setFromAxisAngle(cz, 1.9 * to);
  }

  // ---------------------------------------------------------------- verlet chains
  _initChain(ch) {
    const n = ch.pts.length;
    const P = new Float32Array(n * 3), Q = new Float32Array(n * 3), L = new Float32Array(n);
    for (let i = 1; i < n; i++) L[i] = ch.pts[i].distanceTo(ch.pts[i - 1]);
    const parentRest = this.rest[ch.parent];
    return { ch, n, P, Q, L, bones: ch.bones.map((b) => this.by[b]), parent: this.by[ch.parent], restLocal: ch.pts.map((p) => p.clone().sub(parentRest)), restDir: ch.pts.slice(1).map((p, i) => p.clone().sub(ch.pts[i]).normalize()), init: false };
  }
  _chains(dt, st) {
    this.acc = Math.min(this.acc + dt, 4 / 60);
    const h = 1 / 60;
    let steps = 0; while (this.acc >= h) { this.acc -= h; steps++; }
    const t = this.time;
    for (const c of this.chains) {
      const { ch, n, P, Q, L } = c;
      const pm = c.parent.matrixWorld;
      if (!c.init) { for (let i = 0; i < n; i++) { _v1.copy(c.restLocal[i]).applyMatrix4(pm); P[i * 3] = Q[i * 3] = _v1.x; P[i * 3 + 1] = Q[i * 3 + 1] = _v1.y; P[i * 3 + 2] = Q[i * 3 + 2] = _v1.z; } c.init = true; }
      // plane constraint (container space) → world
      let hasPlane = false;
      if (ch.plane) {
        hasPlane = true;
        _m1.copy(this.by.shell.matrixWorld).multiply(_m2.makeTranslation(-this.rest.shell.x, -this.rest.shell.y, -this.rest.shell.z)).multiply(MC);   // container local → world
        _n0.set(ch.plane[0], ch.plane[1], ch.plane[2]).transformDirection(_m1);
        _v6.set(ch.plane[0] * ch.plane[3], ch.plane[1] * ch.plane[3], ch.plane[2] * ch.plane[3]).applyMatrix4(_m1);
      }
      const grav = -9.8 * (ch.grav ?? 1) * h * h, damp = ch.damp ?? 0.98, stiff = ch.stiff || 0;
      for (let s = 0; s < steps; s++) {
        _v1.copy(c.restLocal[0]).applyMatrix4(pm);
        P[0] = _v1.x; P[1] = _v1.y; P[2] = _v1.z;
        for (let i = 1; i < n; i++) {
          const j = i * 3;
          const x = P[j], y = P[j + 1], z = P[j + 2];
          let fx = 0, fz = 0;
          if (ch.flag) { const g = 0.5 + 0.5 * Math.sin(t * 1.7 + i) * Math.sin(t * 0.63); fx = (0.6 + g) * 0.00035 * (0.6 + Math.sin(t * 9.1 + i * 1.7) * 0.4); fz = Math.sin(t * 5.3 + i * 2.1) * 0.00018; }
          // verlet with a speed cap (≈ 6 m/s) so a violent body snap can't fling the junk over the roof
          let vx = (x - Q[j]) * damp, vy = (y - Q[j + 1]) * damp, vz = (z - Q[j + 2]) * damp;
          const vl = Math.sqrt(vx * vx + vy * vy + vz * vz); if (vl > 0.1) { const k = 0.1 / vl; vx *= k; vy *= k; vz *= k; }
          P[j] += vx + fx; P[j + 1] += vy + grav; P[j + 2] += vz + fz;
          Q[j] = x; Q[j + 1] = y; Q[j + 2] = z;
          if (stiff > 0) { _v1.copy(c.restLocal[i]).applyMatrix4(pm); P[j] += (_v1.x - P[j]) * stiff; P[j + 1] += (_v1.y - P[j + 1]) * stiff; P[j + 2] += (_v1.z - P[j + 2]) * stiff; }
        }
        for (let it = 0; it < 3; it++) {
          for (let i = 1; i < n; i++) {
            const a = (i - 1) * 3, b = i * 3;
            const dx = P[b] - P[a], dy = P[b + 1] - P[a + 1], dz = P[b + 2] - P[a + 2];
            const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6, k = (d - L[i]) / d;
            if (i === 1) { P[b] -= dx * k; P[b + 1] -= dy * k; P[b + 2] -= dz * k; }
            else { P[a] += dx * k * 0.5; P[a + 1] += dy * k * 0.5; P[a + 2] += dz * k * 0.5; P[b] -= dx * k * 0.5; P[b + 1] -= dy * k * 0.5; P[b + 2] -= dz * k * 0.5; }
          }
          if (hasPlane) for (let i = 1; i < n; i++) { const j = i * 3; _v1.set(P[j] - _v6.x, P[j + 1] - _v6.y, P[j + 2] - _v6.z); const d = _v1.dot(_n0); if (d < 0) { P[j] -= _n0.x * d; P[j + 1] -= _n0.y * d; P[j + 2] -= _n0.z * d; } }
          // the ground
          const gy = this.rootPos.y + 0.03;
          for (let i = 1; i < n; i++) { const j = i * 3; if (P[j + 1] < gy) P[j + 1] = gy; }
        }
      }
      // bones follow the particles
      c.parent.matrixWorld.decompose(_v1, _q1, _v2);        // parent world quat
      for (let i = 0; i < c.bones.length; i++) {
        const a = i * 3, b = a + 3;
        _v3.set(P[b] - P[a], P[b + 1] - P[a + 1], P[b + 2] - P[a + 2]).normalize();
        _v4.copy(c.restDir[i]).applyQuaternion(this.rootQ);
        _q2.setFromUnitVectors(_v4, _v3).multiply(this.rootQ);   // bone world quat
        c.bones[i].quaternion.copy(_q1).invert().multiply(_q2);
        _q1.copy(_q2);
      }
      c.bones[0].updateMatrixWorld(true);
    }
  }
}
