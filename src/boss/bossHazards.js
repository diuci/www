// HULLBREAKER's attacks as geometry. Every hazard is a pure function of its move record { id, t0, s, d: [tele, act,
// rec], p } and the boss clock, so every client draws the same rings, circles, lanes and beams at the same moment:
//   · damage to a squidkid is applied by whoever owns it (victim-side, from what that screen shows — no "it hit me
//     there but I was over here");
//   · ink is painted by the host only (its splats replicate like any other); the sim side calls paint() with the
//     slice of boss time it just advanced.
// Also here: the telegraph / hazard visuals, and threat() — what bots read to step out of circles, hop rings and
// take cover.
import * as THREE from 'three';
import { G, clamp, smoothstep } from '../core/ctx.js';
import { PLAYER } from '../config.js';
import { Hit } from '../game/physics.js';
import { WALL_BODY } from './bossNav.js';

// ------------------------------------------------------------------------------------------------ tuning
// Seconds per move phase at phase 1 (scaled by PACE[phase]); telegraphs never go below MIN_TELE.
export const MOVES = {
  slam: { tele: 1.15, act: 1.9, rec: 1.0 },
  barrage: { tele: 0.85, act: 0, rec: 0.8 },    // act = last throw + flight
  sweep: { tele: 1.15, act: 2.1, rec: 0.9 },
  charge: { tele: 1.15, act: 0, rec: 0.9 },     // act = run time; rec = stun when it bonks
  crablets: { tele: 0.9, act: 0.8, rec: 0.6 },
  frenzy: { tele: 1.2, act: 3.0, rec: 1.7 },    // rec: dizzy (a short open window)
};
export const PACE = [1, 1, 0.88, 0.78];
export const MIN_TELE = 0.7;
export const HZ = {
  slamR: 3.3, slamDmg: 48, ringSpeed: 9.5, ringR0: 2.4, ringMax: 19, ringW: 0.55, ringH: 0.5, ringDmg: 32,
  barrelR: 2.4, barrelDmg: 52, barrelFlight: 1.3, barrelGap: 0.26,
  beamLen: 17, beamW: 0.95, beamDps: 170,
  chargeSpeed: [0, 13, 14.5, 16], chargeRamp: 0.35, chargeDmg: 55, chargeMin: 6, stun: [0, 4.2, 3.7, 3.3],
  frenzyR: 8.8, frenzyDps: 52,
  crabR: 2.1, crabDmg: 40, crabHp: 30, crabLife: 12, crabSpeed: [0, 4.4, 4.4, 5.2],
};
const SAFE_PAD = 0.6;      // squidkids standing on a spawn pad (+ this) are out of reach of every hazard
const REACH_N = 96;        // headings for the floor-clipped extent of rings / danger zones

export function moveTimes(m) { const [tele, act, rec] = m.d; return { tele, act, rec, end: tele + act + rec }; }
export function movePhaseAt(m, u) {
  const [tele, act, rec] = m.d;
  if (u < 0) return null;
  if (u < tele) return 'tele';
  if (u < tele + act) return 'act';
  if (u < tele + act + rec) return 'rec';
  return null;
}
// charge: distance along the lane at time u (accelerates over chargeRamp, then full speed), and when it arrives
export function chargeDist(p, u, tele) {
  const t = u - tele;
  if (t <= 0) return 0;
  const v = p.v, a = v / HZ.chargeRamp, r = HZ.chargeRamp;
  const s = t < r ? 0.5 * a * t * t : 0.5 * a * r * r + v * (t - r);
  return Math.min(p.L, s);
}
export function chargeTime(p) { const v = p.v, r = HZ.chargeRamp, s0 = 0.5 * v * r; return p.L <= s0 ? Math.sqrt((2 * p.L * r) / v) : r + (p.L - s0) / v; }
// a lobbed barrel in flight (k 0..1 of its flight): a high arc from the shell to its circle
export function barrelPos(p, b, k, out) {
  const peak = 5 + 0.35 * Math.hypot(b[0] - p.sx, b[2] - p.sz);
  return out.set(p.sx + (b[0] - p.sx) * k, p.sy + (b[1] - p.sy) * k + peak * 4 * k * (1 - k), p.sz + (b[2] - p.sz) * k);
}
export function beamAngle(m, u) { const p = m.p, k = clamp((u - m.d[0]) / m.d[1], 0, 1); return p.a0 + (p.a1 - p.a0) * smoothstep(0, 1, k); }
const ringStart = (m, k) => m.d[0] + m.p.rings[k];
const ringRadius = (m, k, u) => HZ.ringR0 + HZ.ringSpeed * (u - ringStart(m, k));

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0), DOWN = new THREE.Vector3(0, -1, 0);
const _hit = new Hit(), _hit2 = new Hit();

export class BossHazards {
  constructor(boss) {
    this.boss = boss;
    this.moves = [];            // active + recently finished records (hazards can outlive their move: barrels in flight)
    this.hits = new Set();      // one-shot hits already dealt on this client: `${t0}|${kind}|${i}|${actor id}`
    this.cache = new WeakMap(); // per move record: derived geometry (never stored on the record — it goes over the wire)
    this.prevBt = 0;
    this.dead = -1;             // boss time of the defeat: nothing lands after it
    this.fx = new HazardFX();
  }

  add(m) {
    if (this.moves.some((x) => x.t0 === m.t0)) return false;   // idempotent by t0 (net replays, host migration)
    this.moves.push(m);
    this.boss.log.moves.push([m.t0, m.id]);
    return true;
  }
  current(bt) { for (let i = this.moves.length - 1; i >= 0; i--) { const m = this.moves[i]; if (bt >= m.t0 && bt < m.t0 + moveTimes(m).end) return m; } return null; }
  // defeat / time's up: every pending hazard stops here; barrels still in the air burst harmlessly where they are
  fizzle(bt) {
    if (this.dead >= 0) return;
    this.dead = bt;
    for (const m of this.moves) {
      if (m.id !== 'barrage') continue;
      for (const b of m.p.b) {
        const k = (bt - m.t0 - b[3]) / HZ.barrelFlight;
        if (k > 0 && k < 1) G.fx?.burst(barrelPos(m.p, b, k, _v3), UP, this.fx.color, { count: 10, speed: 4, size: 0.1 });
      }
    }
  }

  // hazards still able to hurt at boss time bt (a move stays listed until its last barrel / ring is spent)
  _live(m, bt) {
    const u = bt - m.t0, T = moveTimes(m);
    const extra = m.id === 'slam' ? (HZ.ringMax - HZ.ringR0) / HZ.ringSpeed + (m.p.rings.at(-1) || 0) : 0;
    return u >= 0 && u < T.end + extra + 0.2 && (this.dead < 0 || bt < this.dead);
  }

  update(dt, bt, { live }) {
    for (let i = this.moves.length - 1; i >= 0; i--) {
      const m = this.moves[i];
      if (bt - m.t0 > moveTimes(m).end + 4) { this.moves.splice(i, 1); for (const k of [...this.hits]) if (k.startsWith(m.t0 + '|')) this.hits.delete(k); }
    }
    const prev = this.prevBt;
    if (live) this._hurtLocal(prev, bt, dt);
    this.prevBt = bt;
    this.fx.draw(this, bt, dt, live);
  }

  // ------------------------------------------------------------------------------------ victim-side damage
  _hurtLocal(bt0, bt1, dt) {
    const boss = this.boss, mul = boss.dmgMul;
    for (const a of G.actors) {
      if (a.remote || !a.alive || a.team === 1) continue;
      if (boss.nav.inPad(a.pos.x, a.pos.z, SAFE_PAD)) continue;
      for (const m of this.moves) {
        if (!this._live(m, bt1)) continue;
        const u0 = bt0 - m.t0, u1 = bt1 - m.t0;
        const key = (kind, i) => `${m.t0}|${kind}|${i}|${a.nid ?? a.slot}`;
        const once = (kind, i, dmg) => { const k = key(kind, i); if (this.hits.has(k)) return; this.hits.add(k); this._damage(a, dmg * mul); };
        const p = m.p, [tele] = m.d;
        switch (m.id) {
          case 'slam': {
            if (u0 < tele && u1 >= tele && hDist(a.pos, p.x, p.z) < HZ.slamR + 0.35 && a.pos.y < p.y + 2) once('impact', 0, HZ.slamDmg);
            for (let k = 0; k < p.rings.length; k++) {
              if (u1 < ringStart(m, k)) continue;
              const r0 = ringRadius(m, k, Math.max(u0, ringStart(m, k))), r1 = ringRadius(m, k, u1);
              if (r0 > HZ.ringMax) continue;
              const d = hDist(a.pos, p.x, p.z);
              // swept band (no tunnelling at a low frame rate); the wave hugs the floor: a hop clears it
              if (d > r0 - HZ.ringW - 0.25 && d < r1 + HZ.ringW + 0.25 && a.pos.y < p.y + HZ.ringH && a.pos.y > p.y - 0.8 &&
                d < this.reachAt(m, p.x, p.z, a.pos.x, a.pos.z, HZ.ringMax) + 0.3) once('ring', k, HZ.ringDmg);
            }
            break;
          }
          case 'barrage':
            p.b.forEach((b, i) => {
              const land = b[3] + HZ.barrelFlight;
              if (u0 < land && u1 >= land && hDist(a.pos, b[0], b[2]) < HZ.barrelR + 0.35 && Math.abs(a.pos.y - b[1]) < 2.2) once('barrel', i, HZ.barrelDmg);
            });
            break;
          case 'sweep': {
            if (u1 < tele || u1 > tele + m.d[1] || a.submerged) break;   // diving under your own ink ducks the beam
            const ang = beamAngle(m, u1), len = this.beamLen(m, ang);
            const sx = Math.sin(ang), sz = Math.cos(ang), dx = a.pos.x - p.ox, dz = a.pos.z - p.oz;
            const along = dx * sx + dz * sz, lat = Math.abs(dx * sz - dz * sx);
            if (along > 1.5 && along < len + 0.4 && lat < HZ.beamW + PLAYER.radius && a.pos.y < p.y + 2.4 &&
              this._los(p.ox, p.oy, p.oz, a.pos.x, a.pos.y + 0.9, a.pos.z)) this._damage(a, HZ.beamDps * mul * dt);
            break;
          }
          case 'charge': {
            if (u1 < tele || u1 > tele + m.d[1]) break;
            const s = chargeDist(p, u1, tele), bx = p.x + Math.sin(p.yaw) * s, bz = p.z + Math.cos(p.yaw) * s;
            for (const c of WALL_BODY) {
              const cx = bx + Math.sin(p.yaw) * c.z, cz = bz + Math.cos(p.yaw) * c.z;
              if (Math.hypot(a.pos.x - cx, a.pos.z - cz) < c.r + 0.35 && a.pos.y < p.y + 3.5) {
                const k = key('ram', 0);
                if (!this.hits.has(k)) {
                  this.hits.add(k);
                  // bowled aside, away from the lane, and popped up
                  const side = (a.pos.x - bx) * Math.cos(p.yaw) - (a.pos.z - bz) * Math.sin(p.yaw) >= 0 ? 1 : -1;
                  a.vel.x += Math.cos(p.yaw) * side * 9 + Math.sin(p.yaw) * 5; a.vel.z += -Math.sin(p.yaw) * side * 9 + Math.cos(p.yaw) * 5; a.vel.y = 7;
                  a.grounded = false;
                  this._damage(a, HZ.chargeDmg * mul);
                }
                break;
              }
            }
            break;
          }
          case 'frenzy': {
            if (u1 < tele || u1 > tele + m.d[1]) break;
            if (hDist(a.pos, p.x, p.z) < HZ.frenzyR && a.pos.y < p.y + 3 && this._los(p.x, p.y + 1.6, p.z, a.pos.x, a.pos.y + 0.8, a.pos.z)) this._damage(a, HZ.frenzyDps * mul * dt);
            break;
          }
        }
      }
    }
  }
  // a crablet burst (net: played on the host's timeline) — the owner of each squidkid nearby takes the hit
  crabBurst(x, y, z, id) {
    for (const a of G.actors) {
      if (a.remote || !a.alive || a.team === 1 || this.boss.nav.inPad(a.pos.x, a.pos.z, SAFE_PAD)) continue;
      if (Math.hypot(a.pos.x - x, a.pos.z - z) < HZ.crabR && Math.abs(a.pos.y - y) < 1.6) this._damage(a, HZ.crabDmg * this.boss.dmgMul);
    }
  }
  _damage(a, dmg) { if (dmg > 0) a.damage(dmg, this.boss.attacker, 'boss'); }
  _los(x0, y0, z0, x1, y1, z1) { return G.physics.los(_v.set(x0, y0, z0), _v2.set(x1, y1, z1)); }

  // How far a ground hazard centred on (x, z) spreads along each of REACH_N headings before its floor ends — a wall, a
  // drop (sea, trench), a spawn pad. The shockwave stops there, and the drawn rings / danger zones are clipped to it,
  // so nothing floats over a gap or runs through a wall. Cached on the move (the stage doesn't change).
  _c(m) { let c = this.cache.get(m); if (!c) this.cache.set(m, (c = { beam: new Map(), reach: null })); return c; }
  reach(m, x, z, R) {
    const C = this._c(m);
    if (C.reach) return C.reach;
    const nav = this.boss.nav, out = new Float32Array(REACH_N);
    for (let k = 0; k < REACH_N; k++) {
      const a = ((k + 0.5) / REACH_N) * Math.PI * 2, sx = Math.sin(a), sz = Math.cos(a);
      let r = 0;
      while (r < R && (r < 1.2 || nav.kindAt(x + sx * r, z + sz * r) === 0)) r += 0.35;
      out[k] = Math.min(r, R);
    }
    return (C.reach = out);
  }
  reachAt(m, x, z, px, pz, R) {
    const a = Math.atan2(px - x, pz - z), k = Math.floor(((a < 0 ? a + Math.PI * 2 : a) / (Math.PI * 2)) * REACH_N) % REACH_N;
    return this.reach(m, x, z, R)[k];
  }

  // the beam stops at the first wall along it (cached per move + angle bucket; walls don't move)
  beamLen(m, ang) {
    const c = this._c(m).beam, key = Math.round(ang * 90);
    let L = c.get(key);
    if (L === undefined) {
      const p = m.p, a = key / 90;
      const h = G.physics.raycast(_v.set(p.ox, p.y + 1.0, p.oz), _v2.set(Math.sin(a), 0, Math.cos(a)), HZ.beamLen, _hit, true);
      L = h.hit ? h.dist : HZ.beamLen;
      c.set(key, L);
    }
    return L;
  }

  // ------------------------------------------------------------------------------------ host: paint the boss ink
  paint(bt0, bt1) {
    const P = G.paint; if (!P) return;
    const nav = this.boss.nav;
    const splat = (x, y, z, r) => {
      if (nav.inPad(x, z, 0.3)) return;
      const g = G.physics.raycast(_v.set(x, y + 1.5, z), DOWN, 4, _hit2, true);
      if (!g.hit || g.point.y < PLAYER.waterY) return;
      P.splat(_v3.copy(g.point).addScaledVector(g.normal, 0.08), r, 1, { seed: Math.random() });
    };
    const steps = (u0, u1, start, every, fn) => { const k0 = Math.floor((u0 - start) / every), k1 = Math.floor((u1 - start) / every); for (let k = Math.max(0, k0 + 1); k <= k1; k++) fn(k, start + k * every); };
    for (const m of this.moves) {
      if (!this._live(m, bt1)) continue;
      const u0 = bt0 - m.t0, u1 = bt1 - m.t0, p = m.p, [tele, act] = m.d;
      switch (m.id) {
        case 'slam':
          if (u0 < tele && u1 >= tele) { splat(p.x, p.y, p.z, 2.8); for (let i = 0; i < 7; i++) { const a = i * 0.9; splat(p.x + Math.cos(a) * 2.6, p.y, p.z + Math.sin(a) * 2.6, 1.3); } }
          for (let k = 0; k < p.rings.length; k++) steps(u0, u1, ringStart(m, k), 2.2 / HZ.ringSpeed, (j) => {
            const r = HZ.ringR0 + 2.2 * (j + 1);
            if (r > HZ.ringMax - 1) return;
            const n = Math.round(r * 1.4);
            for (let i = 0; i < n; i++) {
              const a = (i / n) * Math.PI * 2 + k * 0.4 + j;
              const x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r;
              if (r < this.reachAt(m, p.x, p.z, x, z, HZ.ringMax)) splat(x, p.y, z, 0.75);
            }
          });
          break;
        case 'barrage':
          p.b.forEach((b) => {
            const land = b[3] + HZ.barrelFlight;
            if (u0 < land && u1 >= land) { splat(b[0], b[1], b[2], 2.2); for (let i = 0; i < 4; i++) { const a = i * 1.6 + b[0]; splat(b[0] + Math.cos(a) * 1.8, b[1], b[2] + Math.sin(a) * 1.8, 1.0); } }
          });
          break;
        case 'sweep':
          steps(u0, Math.min(u1, tele + act), tele, 0.06, (k, t) => {
            const ang = beamAngle(m, t), L = this.beamLen(m, ang);
            splat(p.ox + Math.sin(ang) * L, p.y, p.oz + Math.cos(ang) * L, 1.05);
            if (k % 2) { const f = 0.45 + 0.4 * ((k * 0.37) % 1); splat(p.ox + Math.sin(ang) * L * f, p.y, p.oz + Math.cos(ang) * L * f, 0.8); }
          });
          break;
        case 'charge':
          steps(u0, Math.min(u1, tele + act), tele, 0.09, (k, t) => {
            const s = chargeDist(p, t, tele), sx = Math.sin(p.yaw), sz = Math.cos(p.yaw), side = k % 2 ? 1.3 : -1.3;
            splat(p.x + sx * (s - 1) + sz * side, p.y, p.z + sz * (s - 1) - sx * side, 1.0);
          });
          break;
        case 'frenzy':
          steps(u0, Math.min(u1, tele + act), tele, 0.07, (k) => {
            for (let j = 0; j < 2; j++) {
              const a = p.rot0 + (k * 0.07) * 2.6 + (j * Math.PI) + (k % 3) * 0.7, r = HZ.frenzyR * (0.35 + 0.6 * ((k * 0.618 + j * 0.3) % 1));
              splat(p.x + Math.sin(a) * r, p.y, p.z + Math.cos(a) * r, 0.9);
            }
          });
          break;
      }
    }
  }

  // ------------------------------------------------------------------------------------ bots: what's coming for (x, z)?
  // → { level 0..1, ax, az (unit escape direction), ringIn (s until a slam ring reaches here, or -1), cover (a beam / spray
  //   that cover beats), beam (the sweep: diving under your own ink beats it too), lane (a charge is coming down it) }
  threat(x, y, z, horizon = 1.2) {
    const bt = this.boss.bt, out = this._thr || (this._thr = {});
    out.level = 0; out.ax = 0; out.az = 0; out.ringIn = -1; out.cover = false; out.lane = false; out.beam = false;
    const push = (lvl, dx, dz) => {
      const l = Math.hypot(dx, dz) || 1;
      out.ax += (dx / l) * lvl; out.az += (dz / l) * lvl;
      out.level = Math.max(out.level, lvl);
    };
    if (this.boss.nav.inPad(x, z, SAFE_PAD)) return out;
    for (const m of this.moves) {
      if (!this._live(m, bt)) continue;
      const u = bt - m.t0, p = m.p, [tele, act] = m.d;
      switch (m.id) {
        case 'slam': {
          if (u < tele + 0.1 && hDist3(x, z, p.x, p.z) < HZ.slamR + 1.2) push(1, x - p.x, z - p.z);
          const d = hDist3(x, z, p.x, p.z);
          for (let k = 0; k < p.rings.length; k++) {
            const r = ringRadius(m, k, u), tIn = (d - HZ.ringW - r) / HZ.ringSpeed;
            if (d > this.reachAt(m, p.x, p.z, x, z, HZ.ringMax) + 0.3 || Math.abs(y - p.y) > 0.8) continue;
            if (r < HZ.ringMax && tIn > -0.1 && tIn < horizon && (out.ringIn < 0 || tIn < out.ringIn)) out.ringIn = Math.max(0, tIn);
          }
          break;
        }
        case 'barrage':
          for (const b of p.b) {
            const land = b[3] + HZ.barrelFlight;
            if (u < land + 0.05 && u > b[3] - 0.6 && hDist3(x, z, b[0], b[2]) < HZ.barrelR + 1.0) push(0.9, x - b[0], z - b[2]);
          }
          break;
        case 'sweep': {
          if (u > tele + act) break;
          const d = hDist3(x, z, p.ox, p.oz);
          if (d > HZ.beamLen + 1.5) break;
          // inside the part of the fan the beam has still to cross
          const ang = Math.atan2(x - p.ox, z - p.oz), from = u < tele ? p.a0 : beamAngle(m, u);
          const lo = Math.min(from, p.a1) - 0.2, hi = Math.max(from, p.a1) + 0.2;
          let a = ang; while (a < lo - Math.PI) a += Math.PI * 2; while (a > hi + Math.PI) a -= Math.PI * 2;
          if (a >= lo && a <= hi) { out.cover = true; out.beam = true; const f = this.boss; push(0.8, -Math.sin(f.yaw), -Math.cos(f.yaw)); }
          break;
        }
        case 'charge': {
          if (u > tele + act) break;
          const s = chargeDist(p, Math.max(u, tele), tele), sx = Math.sin(p.yaw), sz = Math.cos(p.yaw);
          const dx = x - p.x, dz = z - p.z, along = dx * sx + dz * sz, lat = dx * sz - dz * sx;
          if (along > s - 3 && along < p.L + 5 && Math.abs(lat) < 3.6) { out.lane = true; push(1, sz * Math.sign(lat || 1), -sx * Math.sign(lat || 1)); }
          break;
        }
        case 'frenzy':
          if (u < tele + act && hDist3(x, z, p.x, p.z) < HZ.frenzyR + 2) { out.cover = true; push(0.9, x - p.x, z - p.z); }
          break;
      }
    }
    const l = Math.hypot(out.ax, out.az);
    if (l > 1e-3) { out.ax /= l; out.az /= l; }
    return out;
  }

  dispose() { this.fx.dispose(); }
}

const hDist = (p, x, z) => Math.hypot(p.x - x, p.z - z);
const hDist3 = (x0, z0, x1, z1) => Math.hypot(x0 - x1, z0 - z1);

// ================================================================================================= visuals
// Ground telegraphs and the hazards themselves, in the boss's ink. Everything that lies on the floor is clipped to the
// floor it covers (reach()): a ring runs out at a wall or a drop instead of floating across the trench or the sea.
// Pooled / per-move meshes; nothing is allocated per frame.
const DECAL_VERT = /* glsl */`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
// charge lane: chevrons racing down it, hard edges
const LANE_FRAG = /* glsl */`
uniform vec3 uColor; uniform float uAlpha; uniform float uTime; uniform float uK;
varying vec2 vUv;
void main() {
  float edge = smoothstep(0.08, 0.0, min(vUv.x, 1.0 - vUv.x));
  float chev = step(0.55, fract((vUv.y * 9.0 - abs(vUv.x - 0.5) * 2.2) - uTime * 1.8));
  float fill = 0.16 + 0.22 * uK;
  float a = max(edge * 0.95, max(chev * (0.3 + 0.35 * uK), fill)) * smoothstep(1.0, 0.92, vUv.y);
  gl_FragColor = vec4(mix(uColor, vec3(1.0), edge * 0.25) * 1.35, a * uAlpha);
}`;
// shockwave: a band around (uC) of radius uR ± uW, built from per-heading segments that stop at their reach (aReach)
const RING_VERT = /* glsl */`
uniform vec3 uC; uniform float uR; uniform float uW;
attribute float aA; attribute float aSide; attribute float aReach;
varying float vSide; varying float vCut; varying float vA;
void main() {
  float r = max(0.0, uR + aSide * uW);
  vSide = aSide; vCut = aReach - uR; vA = aA;
  gl_Position = projectionMatrix * viewMatrix * vec4(uC.x + sin(aA) * r, uC.y, uC.z + cos(aA) * r, 1.0);
}`;
const RING_FRAG = /* glsl */`
uniform vec3 uColor; uniform float uAlpha; uniform float uTime;
varying float vSide; varying float vCut; varying float vA;
void main() {
  if (vCut < 0.0) discard;
  float x = vSide * 0.5 + 0.5;                          // 0 trailing edge → 1 wave front
  float band = smoothstep(0.0, 0.35, x) * smoothstep(1.0, 0.8, x);
  float crest = smoothstep(0.55, 0.9, x) * smoothstep(1.0, 0.9, x);
  float a = max(band * (0.75 + 0.25 * sin(vA * 70.0 + uTime * 10.0)), crest);
  gl_FragColor = vec4(mix(uColor, vec3(1.0), crest * 0.45) * 1.4, a * uAlpha * smoothstep(0.0, 0.7, vCut));
}`;
// danger zone / sweep fan: a floor-clipped fan (aR 0 centre → 1 at its edge on that heading)
const FAN_VERT = /* glsl */`
attribute float aR; varying float vR;
void main() { vR = aR; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const FAN_FRAG = /* glsl */`
uniform vec3 uColor; uniform float uAlpha; uniform float uTime; uniform float uK;
varying float vR;
void main() {
  float rim = smoothstep(0.86, 0.99, vR);
  float stripes = step(0.6, fract(vR * 7.0 - uTime * 2.2));
  float a = max(rim * 0.9, stripes * 0.35 * uK) + 0.08 + 0.12 * uK;
  gl_FragColor = vec4(mix(uColor, vec3(1.0), rim * 0.2) * 1.35, a * uAlpha);
}`;

class HazardFX {
  constructor() {
    this.group = new THREE.Group(); this.group.name = 'BossHazards';
    G.scene?.add(this.group);
    this.color = new THREE.Color(1, 0.3, 0.3);
    this.mat = (vert, frag, extra = {}) => new THREE.ShaderMaterial({
      uniforms: { uColor: { value: this.color }, uAlpha: { value: 1 }, uTime: { value: 0 }, uK: { value: 0 }, uC: { value: new THREE.Vector3() }, uR: { value: 0 }, uW: { value: 0 } },
      vertexShader: vert, fragmentShader: frag, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false,
      polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, ...extra,
    });
    this.geo = {
      lane: new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0, 0, 0.5),
      beam: new THREE.CylinderGeometry(1, 1, 1, 12, 1, true).rotateX(Math.PI / 2).translate(0, 0, 0.5),
      barrel: new THREE.CylinderGeometry(0.42, 0.42, 0.95, 16, 1),
    };
    // ring template: REACH_N segments, 4 verts each (trailing / front edge at both ends); aReach is per ring mesh
    {
      const n = REACH_N, aA = new Float32Array(n * 4), aSide = new Float32Array(n * 4), idx = [];
      for (let k = 0; k < n; k++) {
        const a0 = (k / n) * Math.PI * 2, a1 = ((k + 1) / n) * Math.PI * 2, o = k * 4;
        aA.set([a0, a0, a1, a1], o); aSide.set([-1, 1, -1, 1], o);
        idx.push(o, o + 1, o + 2, o + 2, o + 1, o + 3);
      }
      this.ringAttr = { position: new THREE.BufferAttribute(new Float32Array(n * 12), 3), aA: new THREE.BufferAttribute(aA, 1), aSide: new THREE.BufferAttribute(aSide, 1), index: idx };
    }
    this.pools = {};
    this.beamMat = new THREE.MeshBasicMaterial({ color: this.color, transparent: true, opacity: 0.92, depthWrite: false, fog: false });
    this.barrelMat = new THREE.MeshStandardMaterial({ color: 0x8a4a32, roughness: 0.55, metalness: 0.35, emissive: this.color, emissiveIntensity: 0.18 });
    this._per = new Map();    // per-move meshes (rings, fans), keyed `${t0}:${what}`
    this.t = 0;
  }
  setColor(c) { this.color.copy(c); this.barrelMat.emissive.copy(c); }
  _pool(name) { return this.pools[name] || (this.pools[name] = { list: [], n: 0 }); }
  _take(name) {
    const P = this._pool(name);
    let m = P.list[P.n];
    if (!m) {
      m = new THREE.Mesh(this.geo[name], name === 'beam' ? this.beamMat : name === 'barrel' ? this.barrelMat : this.mat(DECAL_VERT, LANE_FRAG));
      m.frustumCulled = false; m.renderOrder = name === 'beam' ? 9 : 7;
      if (name === 'barrel') { m.castShadow = true; m.renderOrder = 0; }
      P.list.push(m); this.group.add(m);
    }
    P.n++; m.visible = true;
    return m;
  }
  _perMove(key, make) {
    let o = this._per.get(key);
    if (!o) { o = make(); o.frustumCulled = false; o.renderOrder = 7; this.group.add(o); this._per.set(key, o); }
    o.visible = true; o.userData.used = true;
    return o;
  }
  // a shockwave band sharing the template, with this move's reach per segment
  _ring(key, reach) {
    return this._perMove(key, () => {
      const R = this.ringAttr, g = new THREE.BufferGeometry(), r4 = new Float32Array(REACH_N * 4);
      for (let k = 0; k < REACH_N; k++) r4.fill(reach[k], k * 4, k * 4 + 4);
      g.setAttribute('position', R.position); g.setAttribute('aA', R.aA); g.setAttribute('aSide', R.aSide); g.setAttribute('aReach', new THREE.BufferAttribute(r4, 1));
      g.setIndex(R.index);
      return new THREE.Mesh(g, this.mat(RING_VERT, RING_FRAG));
    });
  }
  // a fan on the floor at (x, y, z) from heading a0 to a1 (full circle when a1 − a0 = 2π) out to radius(angle)
  _fan(key, x, y, z, a0, a1, radius) {
    return this._perMove(key, () => {
      const n = Math.max(8, Math.ceil(Math.abs(a1 - a0) / (Math.PI * 2) * REACH_N));
      const pos = [x, y, z], aR = [0], idx = [];
      for (let i = 0; i <= n; i++) {
        const a = a0 + (a1 - a0) * (i / n), r = radius(a);
        pos.push(x + Math.sin(a) * r, y, z + Math.cos(a) * r); aR.push(1);
        if (i) idx.push(0, i, i + 1);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('aR', new THREE.Float32BufferAttribute(aR, 1)); g.setIndex(idx);
      return new THREE.Mesh(g, this.mat(FAN_VERT, FAN_FRAG));
    });
  }

  draw(hz, bt, dt, live) {
    this.t += dt;
    for (const k in this.pools) this.pools[k].n = 0;
    for (const o of this._per.values()) { o.visible = false; o.userData.used = false; }
    const fx = G.fx, col = this.color, T = this.t;
    for (const m of hz.moves) {
      if (!hz._live(m, bt)) continue;
      const u = bt - m.t0, p = m.p, [tele, act] = m.d;
      switch (m.id) {
        case 'slam': {
          if (u < tele + 0.15) fx?.mark(_v.set(p.x, p.y + 0.04, p.z), UP, col, HZ.slamR, 3, 1, clamp(u / tele, 0, 1), 1.4, 0.3);
          const reach = hz.reach(m, p.x, p.z, HZ.ringMax);
          for (let k = 0; k < p.rings.length; k++) {
            const r = ringRadius(m, k, u);
            if (u < ringStart(m, k) || r > HZ.ringMax) continue;
            const ring = this._ring(m.t0 + ':ring' + k, reach), U = ring.material.uniforms;
            U.uC.value.set(p.x, p.y + 0.06, p.z); U.uR.value = r; U.uW.value = HZ.ringW + 0.1; U.uTime.value = T;
            U.uAlpha.value = 1 - smoothstep(HZ.ringMax - 4, HZ.ringMax, r);
            // spray thrown up off the wave front (it reads as something to hop)
            if (live && fx) for (let j = 0; j < 5; j++) {
              const kk = (Math.random() * REACH_N) | 0, a = ((kk + 0.5) / REACH_N) * Math.PI * 2;
              if (r + HZ.ringW > reach[kk]) continue;
              _v.set(p.x + Math.sin(a) * (r + HZ.ringW * 0.6), p.y + 0.1, p.z + Math.cos(a) * (r + HZ.ringW * 0.6));
              fx.drop(_v, _v2.set(Math.sin(a) * 2.5, 2.4 + Math.random() * 1.6, Math.cos(a) * 2.5), col, { size: 0.12, life: 0.6, paint: false });
            }
          }
          break;
        }
        case 'barrage':
          for (const b of p.b) {
            const land = b[3] + HZ.barrelFlight;
            if (u > land + 0.05) continue;
            // circle from the wind-up on (≥ 1.3 s before it lands), pulsing faster as the barrel drops
            if (u > Math.min(tele * 0.4, b[3] - 0.5)) fx?.mark(_v.set(b[0], b[1] + 0.04, b[2]), UP, col, HZ.barrelR, 3, 1, clamp(1 - (land - u) / (HZ.barrelFlight + 0.5), 0, 1), 1.2, 0.6);
            if (u >= b[3]) {
              const k = (u - b[3]) / HZ.barrelFlight, br = this._take('barrel');
              barrelPos(p, b, k, br.position);
              br.rotation.set(k * 9 + b[0], 0, k * 6);
            }
          }
          break;
        case 'sweep': {
          if (u > tele + act) break;
          // the fan the beam will cross, out to where it hits a wall (or the floor runs out)
          const reach = hz.reach(m, p.ox, p.oz, HZ.beamLen), lo = Math.min(p.a0, p.a1), hi = Math.max(p.a0, p.a1);
          const fan = this._fan(m.t0 + ':fan', p.ox, p.y + 0.05, p.oz, lo, hi, (a) => {
            const k = Math.floor((((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2) * REACH_N) % REACH_N;
            return Math.max(2, Math.min(hz.beamLen(m, a), reach[k]));
          });
          const k = u < tele ? u / tele : 1 - (u - tele) / act, U = fan.material.uniforms;
          U.uAlpha.value = 0.55 + 0.45 * Math.min(1, k * 1.5); U.uK.value = clamp(k, 0, 1); U.uTime.value = T;
          if (u >= tele) {
            const ang = beamAngle(m, u), L = hz.beamLen(m, ang), beam = this._take('beam');
            const ex = p.ox + Math.sin(ang) * L, ez = p.oz + Math.cos(ang) * L;
            beam.position.set(p.ox, p.oy, p.oz);
            beam.lookAt(_v.set(ex, p.y + 0.3, ez));
            const w = 0.32 + 0.06 * Math.sin(T * 40);
            beam.scale.set(w, w, Math.hypot(ex - p.ox, p.y + 0.3 - p.oy, ez - p.oz));
            if (live && Math.random() < 0.6) fx?.burst(_v.set(ex, p.y + 0.15, ez), UP, col, { count: 5, speed: 5, size: 0.12 });
          }
          break;
        }
        case 'charge': {
          if (u > tele + act) break;
          const lane = this._take('lane'), k = clamp(u / tele, 0, 1);
          const s = chargeDist(p, u, tele), len = Math.max(0.5, p.L + 4.2 - s);
          lane.position.set(p.x + Math.sin(p.yaw) * s, p.y + 0.05, p.z + Math.cos(p.yaw) * s); lane.rotation.set(0, p.yaw, 0); lane.scale.set(5.0, 1, len);
          const U = lane.material.uniforms; U.uK.value = k; U.uTime.value = T; U.uAlpha.value = u < tele ? 0.35 + 0.65 * k : 0.9;
          break;
        }
        case 'frenzy':
          if (u < tele + act) {
            const reach = hz.reach(m, p.x, p.z, HZ.frenzyR);
            const zone = this._fan(m.t0 + ':zone', p.x, p.y + 0.05, p.z, 0, Math.PI * 2, (a) => reach[Math.floor(((a % (Math.PI * 2)) / (Math.PI * 2)) * REACH_N) % REACH_N]);
            const U = zone.material.uniforms, k = u < tele ? clamp(u / tele, 0, 1) : 1;
            U.uK.value = k; U.uAlpha.value = 0.5 + 0.5 * k; U.uTime.value = T * (u < tele ? 1 : 2.5);
          }
          if (u >= tele && u < tele + act && live && fx) {
            // six rotating jets of ink out of the spinning shell
            for (let j = 0; j < 6; j++) {
              const a = p.rot0 + (u - tele) * 2.6 + (j / 6) * Math.PI * 2, sp = 10 + Math.random() * 5;
              _v.set(p.x + Math.sin(a) * 2.2, p.y + 2.2, p.z + Math.cos(a) * 2.2);
              _v2.set(Math.sin(a) * sp, 3 + Math.random() * 2, Math.cos(a) * sp);
              fx.drop(_v, _v2, col, { size: 0.16, life: 1.0, paint: false });
            }
          }
          break;
      }
    }
    for (const k in this.pools) { const P = this.pools[k]; for (let i = P.n; i < P.list.length; i++) P.list[i].visible = false; }
    // per-move meshes whose move has gone
    for (const [key, o] of this._per) {
      const t0 = +key.split(':')[0];
      if (!hz.moves.some((m) => m.t0 === t0)) { this.group.remove(o); if (o.geometry.attributes.aReach) o.geometry.deleteAttribute('aReach'); o.geometry.dispose(); o.material.dispose(); this._per.delete(key); }
    }
  }

  // compile everything once while the match loads (no hitch on the first slam)
  warm() {
    for (const k of ['lane', 'beam', 'barrel']) { const m = this._take(k); m.position.set(0, -40, 0); }
    const z = new Float32Array(REACH_N).fill(1);
    this._ring('-1:warm', z).material.uniforms.uC.value.set(0, -40, 0);
    this._fan('-1:warmfan', 0, -40, 0, 0, 1, () => 1);
    return this.group;
  }

  dispose() {
    this.group.removeFromParent();
    for (const k in this.geo) this.geo[k].dispose();
    for (const k in this.pools) for (const m of this.pools[k].list) if (m.material !== this.beamMat && m.material !== this.barrelMat) m.material.dispose();
    for (const o of this._per.values()) { o.geometry.dispose(); o.material.dispose(); }
    this.beamMat.dispose(); this.barrelMat.dispose();
  }
}
