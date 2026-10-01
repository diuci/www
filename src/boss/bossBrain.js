// HULLBREAKER's mind (runs on one client: offline, or the host). Walks its home ground on the boss nav, spreads its
// attention across the squad (not always the nearest kid; never anyone on a spawn pad), picks moves that suit the
// moment, faces its mark before any aimed move, and turns each into a move record the hazards and the guests replay.
// Phases: 66 % / 33 % → a roar (invulnerable beat, never mid-move) and a nastier move set; crablets from phase 2,
// Shell Frenzy + an exposed belly in phase 3.
import * as THREE from 'three';
import { G, clamp, angleDiff, rng } from '../core/ctx.js';
import { PLAYER } from '../config.js';
import { BOSS } from './boss.js';
import { MOVES, PACE, MIN_TELE, HZ, moveTimes, movePhaseAt, chargeDist, chargeTime, beamAngle } from './bossHazards.js';

const SPEED = [0, 2.9, 3.3, 3.8];          // walk (m/s) by phase
const TURN = [0, 1.25, 1.45, 1.75];        // turn rate (rad/s)
const COOL = [0, 1.05, 0.8, 0.6];          // gap between moves (+ up to COOL_RND)
const COOL_RND = [0, 0.8, 0.6, 0.45];
const PREF = [0, 10, 9, 8];                // preferred distance to its mark
const r3 = (x) => Math.round(x * 1000) / 1000;
const _v = new THREE.Vector3();

export class BossBrain {
  constructor(boss, { adopt = false } = {}) {
    this.b = boss;
    this.rnd = rng((Math.random() * 2 ** 31) >>> 0);
    this.cool = adopt ? 1.0 : 2.4;
    this.path = null; this.pi = 0; this.goal = null; this.goalT = 0; this.stuckT = 0;
    this.attn = new Map(); this.dmgBy = new Map();
    this.last = null; this.cd = { crablets: 0, frenzy: 0 };
    this.retarget = 0; this.plan = null; this.speed = 0;
    this.pendingPhase = 0;
    let maxId = 0;
    for (const c of boss.crabs.values()) { maxId = Math.max(maxId, c.id); if (c.age === undefined) { c.age = 0; c.tgt = -1; c.retgt = 0; c.speed = c.speed || 0; } }
    this.crabSeq = maxId + 1;
    // adopted mid-move (host migration): a brood already out isn't spilled twice
    const m = boss.move;
    this._spawned = !!(m && m.id === 'crablets' && boss.bt - m.t0 >= m.d[0]);
    if (adopt) this.checkPhase();
  }

  get pace() { return BOSS.paceDiff[this.b.difficulty] ?? 1; }
  noteDamage(atk, d) { if (atk) { const k = atk.nid ?? atk.slot; this.dmgBy.set(k, (this.dmgBy.get(k) || 0) + d); } }
  checkPhase() {
    const f = this.b.hpFrac(), want = f <= BOSS.phases[1] ? 3 : f <= BOSS.phases[0] ? 2 : 1;
    if (want > this.b.phase && want > this.pendingPhase) this.pendingPhase = want;
  }
  onDefeat() { this.b.move = null; this.path = null; this.plan = null; }

  // ---------------------------------------------------------------------------------------------- per frame
  update(dt) {
    const b = this.b, st = b.match.state;
    b.bt += dt;
    const px = b.pos.x, pz = b.pos.z, pyaw = b.yaw;
    this.cd.crablets -= dt; this.cd.frenzy -= dt;
    for (const [k, v] of this.dmgBy) this.dmgBy.set(k, v * Math.exp(-dt / 8));   // "who hurt me lately"
    // intro: it bursts out of its home ground, roars, then the round starts
    if (!b.visible && b.bt >= BOSS.introAt) { b.visible = true; b.anim = 1; b.animT0 = b.bt; }
    if (b.anim === 1 && b.bt - b.animT0 >= BOSS.introLen) b.anim = 0;
    if (b.anim === 2 && b.bt - b.animT0 >= BOSS.roarLen) { b.anim = 0; b.invuln = false; this.cool = Math.min(this.cool, 0.9 * this.pace); }
    if (!b.dead && b.visible) {
      if (st === 'playing') {
        this._crabs(dt);
        if (b.move) this._runMove(dt);
        else if (b.anim === 2) { /* roaring */ }
        else if (this.pendingPhase > b.phase) this._roar();
        else this._idle(dt);
      } else if (b.move) { b.move = null; b.stunned = false; }   // time's up mid-move: hazards stop (Boss.update fizzles them)
    }
    b.stunned = !!(b.move && b.move.p.stun && movePhaseAt(b.move, b.bt - b.move.t0) === 'rec');
    // floor height (strides over curbs / planters: follow the main floor, eased)
    const fy = b.nav.floorAt(b.pos.x, b.pos.z);
    b.pos.y += (fy - b.pos.y) * Math.min(1, dt * 5);
    if (dt > 0) { b.vel.set((b.pos.x - px) / dt, 0, (b.pos.z - pz) / dt); b.turn = angleDiff(pyaw, b.yaw) / dt; }
  }

  _roar() {
    const b = this.b;
    b.phase = this.pendingPhase; this.pendingPhase = 0;
    b.anim = 2; b.animT0 = b.bt; b.invuln = true;
    this.path = null; this.plan = null;
    if (b.phase >= 2) this.cd.crablets = Math.min(this.cd.crablets, 2);
    if (b.phase >= 3) this.cd.frenzy = Math.min(this.cd.frenzy, 3);
  }

  // ---------------------------------------------------------------------------------------------- between moves
  _idle(dt) {
    const b = this.b;
    this.retarget -= dt; this.goalT -= dt; this.cool -= dt;
    if (this.retarget <= 0 || !b.targetActor()) this._pickTarget();
    const t = b.targetActor();
    if (this.cool <= 0 && t) {
      if (!this.plan) { this.plan = this._choose(t); if (this.plan) this.plan.t = 0; }
      const P = this.plan;
      if (P) {
        P.t += dt;
        // aimed moves wait until it faces its mark (it keeps turning, never sliding sideways)
        if (P.face === null || P.face === undefined) { this._start(P, t); return; }
        const want = P.faceFn ? P.faceFn() : P.face;
        const dy = angleDiff(b.yaw, want);
        if (Math.abs(dy) < 0.16 || (P.id !== 'charge' && P.t > 1.2 && Math.abs(dy) < 0.6)) { this._start(P, t); return; }   // (a slam / sweep reads fine a little off-axis)
        if (!this._turn(want, dt) || P.t > 2.4) { this.plan = null; this.cool = 0.3; this.last = P.id; }   // can't line up here: rethink
        this.speed = 0;
        return;
      }
    }
    this._walk(dt, t);
  }

  _pickTarget() {
    const b = this.b, nav = b.nav;
    this.retarget = 3 + this.rnd() * 2.5;
    let best = null, bs = -Infinity;
    for (const a of G.actors) {
      if (!a.alive || a.team !== 0 || a.superJumpState || nav.inPad(a.pos.x, a.pos.z, 3)) continue;
      const k = a.nid ?? a.slot, d = Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z);
      const s = -d * 0.1 + (this.dmgBy.get(k) || 0) * 0.004 - (this.attn.get(k) || 0) * 1.4 + this.rnd() * 1.3;
      if (s > bs) { bs = s; best = a; }
    }
    for (const [k, v] of this.attn) this.attn.set(k, v * 0.8);
    if (best) { const k = best.nid ?? best.slot; this.attn.set(k, (this.attn.get(k) || 0) + 1); if (b.target !== k) this.goalT = 0; b.target = k; }
    else b.target = -1;
  }

  _walk(dt, t) {
    const b = this.b, nav = b.nav, ph = b.phase;
    if (!this.goal || this.goalT <= 0 || (this.path && this.pi >= this.path.length && this.goalT < 1.5)) this._pickGoal(t);
    let want = b.yaw, go = false;
    if (this.path && this.pi < this.path.length) {
      let wp = this.path[this.pi];
      while (Math.hypot(wp[0] - b.pos.x, wp[1] - b.pos.z) < 1.1 && this.pi < this.path.length - 1) wp = this.path[++this.pi];
      const d = Math.hypot(wp[0] - b.pos.x, wp[1] - b.pos.z);
      if (this.pi >= this.path.length - 1 && d < 1.1) this.pi = this.path.length;
      else { want = Math.atan2(wp[0] - b.pos.x, wp[1] - b.pos.z); go = true; }
    }
    if (!go && t) want = Math.atan2(t.pos.x - b.pos.x, t.pos.z - b.pos.z);   // arrived: face its mark
    const dy = angleDiff(b.yaw, want);
    this._turn(want, dt);
    const vmax = SPEED[ph] * (go ? clamp(1 - Math.abs(dy) / 0.9, 0, 1) : 0);
    this.speed += clamp(vmax - this.speed, -4 * dt, 3 * dt);
    if (this.speed > 0.01) {
      const nx = b.pos.x + Math.sin(b.yaw) * this.speed * dt, nz = b.pos.z + Math.cos(b.yaw) * this.speed * dt;
      if (nav.poseOk(nx, nz, b.yaw)) { b.pos.x = nx; b.pos.z = nz; this.stuckT = 0; }
      else { this.speed = 0; this.stuckT += dt; if (this.stuckT > 0.8) { this.stuckT = 0; this.goalT = 0; this.path = null; } }
    }
  }
  // turn toward yaw at the phase's rate, only through headings its body fits. Hemmed in (a claw would meet a wall), it
  // sidles toward open floor while it turns — up the clearance field, never off it → false when it can't do either
  _turn(want, dt) {
    const b = this.b, nav = b.nav, dy = angleDiff(b.yaw, want);
    if (Math.abs(dy) < 1e-3) return true;
    const ny = b.yaw + clamp(dy, -TURN[b.phase] * dt, TURN[b.phase] * dt);
    if (nav.turnOk(b.pos.x, b.pos.z, ny)) { b.yaw = ny; return true; }
    const room = (x, z) => nav.wallClear(x, z) + Math.min(nav.floorClear(x, z), 3) * 0.5;
    const r = SPEED[b.phase] * 0.55 * dt, here = room(b.pos.x, b.pos.z);
    let best = null, bs = here + 1e-3;
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2, x = b.pos.x + Math.sin(a) * r, z = b.pos.z + Math.cos(a) * r;
      if (!nav.turnOk(x, z, b.yaw)) continue;
      const sc = room(x, z);
      if (sc > bs) { bs = sc; best = [x, z]; }
    }
    if (!best) return false;
    b.pos.x = best[0]; b.pos.z = best[1];
    if (nav.turnOk(b.pos.x, b.pos.z, ny)) b.yaw = ny;
    return true;
  }

  _pickGoal(t) {
    const b = this.b, nav = b.nav, pad = nav.pads[0];
    this.goalT = 3 + this.rnd() * 2.5;
    let best = null, bs = -Infinity;
    for (let i = 0; i < 16; i++) {
      const [x, z] = nav.randomPoint(this.rnd);
      const ci = nav.cell(x, z);
      let s = Math.min(nav.Dw[ci], 6) * 0.7 + Math.min(nav.Dv[ci], 4) * 0.4 - Math.hypot(x - b.pos.x, z - b.pos.z) * 0.07 + this.rnd() * 1.5;
      if (t) s -= Math.abs(Math.hypot(x - t.pos.x, z - t.pos.z) - PREF[b.phase]);
      else s -= Math.hypot(x - b.home.x, z - b.home.z) * 0.2;
      if (Math.hypot(x - pad.x, z - pad.z) < 18) s -= 12;   // never camps the squad's spawn
      if (s > bs) { bs = s; best = [x, z]; }
    }
    if (!best) return;
    this.goal = best;
    this.path = nav.path(b.pos.x, b.pos.z, best[0], best[1]);
    this.pi = 1;
  }

  // ---------------------------------------------------------------------------------------------- choosing a move
  _choose(t) {
    const b = this.b, nav = b.nav, ph = b.phase;
    const fx = b.pos.x + Math.sin(b.yaw) * 2, fz = b.pos.z + Math.cos(b.yaw) * 2;
    const d = Math.hypot(t.pos.x - fx, t.pos.z - fz);
    const kids = G.actors.filter((a) => a.alive && a.team === 0 && !nav.inPad(a.pos.x, a.pos.z, 1));
    const near = kids.filter((a) => Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z) < 10.5).length;
    const far = kids.filter((a) => Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z) > 13).length;
    const aimAt = () => Math.atan2(t.pos.x - b.pos.x, t.pos.z - b.pos.z);
    const W = [];
    W.push(['slam', d < 11 ? 3 + near * 0.6 : 0.25]);
    W.push(['barrage', 1.3 + far * 0.45 + (d > 12 ? 1 : 0)]);
    W.push(['sweep', d > 5 && d < 17 ? 2.1 : 0.4]);
    // charge only down a real lane toward (roughly) its mark
    const lane = this._lane(aimAt());
    W.push(['charge', lane ? (d > 5.5 ? 2.2 : 1.2) : 0]);
    if (ph >= 2 && this.cd.crablets <= 0 && [...b.crabs.values()].filter((c) => !c.dead).length < 3) W.push(['crablets', 2.4]);
    if (ph >= 3 && this.cd.frenzy <= 0) W.push(['frenzy', 1.1 + near * 0.9]);
    for (const w of W) if (w[0] === this.last) w[1] *= 0.3;   // don't repeat itself
    let sum = 0; for (const w of W) sum += w[1];
    let r = this.rnd() * sum, id = 'barrage';
    for (const w of W) { r -= w[1]; if (r <= 0) { id = w[0]; break; } }
    if (this.force) { id = this.force; this.force = null; if (id === 'charge' && !lane) id = 'barrage'; }   // audits: __G.boss.brain.force = 'slam'
    switch (id) {
      case 'slam': case 'sweep': return { id, face: aimAt(), faceFn: aimAt };
      case 'charge': return { id, face: lane.yaw, lane };
      default: return { id, face: null };
    }
  }
  // a charge lane: roughly toward its mark, long enough to be worth it (longer is better; a wall at the end best)
  _lane(yaw) {
    const b = this.b;
    let best = null, bs = -Infinity;
    for (const o of [0, 0.25, -0.25, 0.5, -0.5, 0.8, -0.8, 1.1, -1.1, 1.45, -1.45, 1.8, -1.8]) {   // (piers: along the pier)
      const y = yaw + o;
      if (!b.nav.turnOk(b.pos.x, b.pos.z, y)) continue;
      const c = b.nav.cast(b.pos.x, b.pos.z, y, 34);
      if (c.dist < HZ.chargeMin) continue;
      const s = Math.min(c.dist, 22) * 0.2 - Math.abs(o) * 1.6 + (c.wall ? 1 : 0);
      if (s > bs) { bs = s; best = { yaw: y, L: c.dist, wall: c.wall }; }
    }
    return best;
  }

  // build the record: everything a client needs to reproduce the move from its start time
  _start(P, t) {
    const b = this.b, ph = b.phase, pace = PACE[ph], M = MOVES[P.id];
    this.plan = null; this.speed = 0; this.path = null;
    const fwx = Math.sin(b.yaw), fwz = Math.cos(b.yaw), y = b.pos.y;
    const tele = Math.max(MIN_TELE, M.tele * pace);
    let act = M.act * pace, rec = M.rec * pace, p;
    switch (P.id) {
      case 'slam': {
        const x = b.pos.x + fwx * 4.3, z = b.pos.z + fwz * 4.3;
        p = { x: r3(x), y: r3(b.nav.floorAt(x, z)), z: r3(z), rings: ph >= 3 ? [0, 0.6] : ph >= 2 ? [0, 0.9] : [0] };
        act = 1.2;
        break;
      }
      case 'barrage': {
        const n = [0, 4, 5, 7][ph], pts = [];
        const cands = G.actors.filter((a) => a.alive && a.team === 0 && !a.superJumpState && !b.nav.inPad(a.pos.x, a.pos.z, HZ.barrelR + 1));
        // spread: every kid gets one before anyone gets two; far ones first (the barrage is its long-range answer)
        cands.sort((a1, a2) => Math.hypot(a2.pos.x - b.pos.x, a2.pos.z - b.pos.z) - Math.hypot(a1.pos.x - b.pos.x, a1.pos.z - b.pos.z) + (this.rnd() - 0.5) * 6);
        for (let i = 0; i < n && cands.length; i++) {
          const a = cands[i % cands.length], extra = i >= cands.length;
          const ang = this.rnd() * Math.PI * 2, off = extra ? 3 + this.rnd() * 2.5 : 0;
          let x = a.pos.x + a.vel.x * 0.3 + Math.cos(ang) * off, z = a.pos.z + a.vel.z * 0.3 + Math.sin(ang) * off;
          const g = G.level.groundHeight(x, z, a.pos.y + 1);
          if (!(g > PLAYER.waterY) || b.nav.inPad(x, z, HZ.barrelR + 0.5)) { x = a.pos.x; z = a.pos.z; }
          const gy = G.level.groundHeight(x, z, a.pos.y + 1);
          if (!(gy > PLAYER.waterY) || b.nav.inPad(x, z, HZ.barrelR + 0.5)) continue;
          pts.push([r3(x), r3(gy), r3(z), r3(tele + pts.length * HZ.barrelGap)]);
        }
        if (!pts.length) { this.cool = 0.5; this.last = 'barrage'; return; }
        p = { sx: r3(b.pos.x - fwx * 0.6), sy: r3(y + 5.4), sz: r3(b.pos.z - fwz * 0.6), b: pts };
        act = pts[pts.length - 1][3] - tele + HZ.barrelFlight + 0.1;
        break;
      }
      case 'sweep': {
        const c = Math.atan2(t.pos.x - b.pos.x, t.pos.z - b.pos.z), span = [0, 1.9, 2.2, 2.5][ph], dir = this.rnd() < 0.5 ? 1 : -1;
        p = { ox: r3(b.pos.x + fwx * 3.3), oy: r3(y + 2.3), oz: r3(b.pos.z + fwz * 3.3), y: r3(y), a0: r3(c - dir * span / 2), a1: r3(c + dir * span / 2), c: r3(b.yaw) };
        break;
      }
      case 'charge': {
        const L = P.lane || this._lane(b.yaw);
        if (!L) { this.cool = 0.4; this.last = 'charge'; return; }
        const c = b.nav.cast(b.pos.x, b.pos.z, b.yaw, 34);   // re-cast from where it actually stands now
        if (c.dist < HZ.chargeMin) { this.cool = 0.4; this.last = 'charge'; return; }
        p = { x: r3(b.pos.x), y: r3(y), z: r3(b.pos.z), yaw: r3(b.yaw), L: r3(c.dist), wall: c.wall ? 1 : 0, v: HZ.chargeSpeed[ph], stun: 1 };
        act = chargeTime(p);
        rec = HZ.stun[ph];
        break;
      }
      case 'crablets': {
        const n = ph >= 3 ? 5 : 3;
        p = { n };
        this.cd.crablets = 14 * this.pace;
        break;
      }
      case 'frenzy': {
        const roomy = b.nav.wallClear(b.pos.x, b.pos.z) >= 5 && b.nav.floorClear(b.pos.x, b.pos.z) >= 3.9;
        p = { x: r3(b.pos.x), y: r3(y), z: r3(b.pos.z), rot0: r3(this.rnd() * Math.PI * 2), spin: roomy ? 1 : 0, stun: 1 };
        this.cd.frenzy = 11 * this.pace;
        break;
      }
    }
    const rec0 = { id: P.id, t0: r3(b.bt), s: (this.rnd() * 1e9) >>> 0, d: [r3(tele), r3(act), r3(rec)], p };
    b.move = rec0;
    b.hz.add(rec0);
    G.netm?.recBoss(['bm', rec0]);
    this._spawned = false;
  }

  // ---------------------------------------------------------------------------------------------- playing a move
  _runMove(dt) {
    const b = this.b, m = b.move, u = b.bt - m.t0, T = moveTimes(m), p = m.p;
    if (u >= T.end) {
      b.move = null; this.last = m.id;
      this.cool = (COOL[b.phase] + this.rnd() * COOL_RND[b.phase]) * this.pace;
      this.goalT = 0;
      return;
    }
    switch (m.id) {
      case 'charge': {
        const s = chargeDist(p, u, T.tele);
        b.pos.x = p.x + Math.sin(p.yaw) * s; b.pos.z = p.z + Math.cos(p.yaw) * s; b.yaw = p.yaw;
        break;
      }
      case 'sweep':
        // the body leans into the beam a little (the cannon does the rest)
        if (u >= T.tele && u <= T.tele + T.act) {
          const want = p.c + angleDiff(p.c, beamAngle(m, u)) * 0.5;
          if (b.nav.turnOk(b.pos.x, b.pos.z, want)) b.yaw = want;
        }
        break;
      case 'frenzy':
        if (p.spin && u >= T.tele && u <= T.tele + T.act) b.yaw += dt * 4.2 * Math.min(1, (u - T.tele) / 0.4, (T.tele + T.act - u) / 0.4);
        break;
      case 'crablets':
        if (!this._spawned && u >= T.tele) { this._spawned = true; this._spawnCrabs(p.n); }
        break;
    }
  }

  // ---------------------------------------------------------------------------------------------- crablets (host)
  _spawnCrabs(n) {
    const b = this.b, bx = -Math.sin(b.yaw), bz = -Math.cos(b.yaw);
    for (let i = 0; i < n; i++) {
      const side = (i - (n - 1) / 2) * 1.1, x0 = b.pos.x + bx * 3.6 + bz * side, z0 = b.pos.z + bz * 3.6 - bx * side;
      let x = x0, z = z0, g = G.level.groundHeight(x, z, b.pos.y + 1.5);
      if (!(g > PLAYER.waterY) || b.nav.inPad(x, z, 0.8)) { x = b.pos.x + bz * side; z = b.pos.z - bx * side; g = b.pos.y; }
      const c = { id: this.crabSeq++, x, y: g, z, yaw: b.yaw + Math.PI + side * 0.4, hp: HZ.crabHp, age: 0, tgt: -1, speed: 0, dead: false, retgt: 0 };
      b.crabs.set(c.id, c);
      G.fx?.burst(_v.set(x, g + 0.4, z), undefined, G.teamColors[1], { count: 8, speed: 3.5, size: 0.1 });
    }
  }

  _crabs(dt) {
    const b = this.b, nav = b.nav, L = G.level, sp = HZ.crabSpeed[b.phase] || HZ.crabSpeed[2];
    for (const c of b.crabs.values()) {
      if (c.dead) continue;
      c.age += dt; c.retgt -= dt;
      if (c.age > HZ.crabLife) { b.crabPop(c, false); continue; }
      if (c.retgt <= 0) {
        c.retgt = 0.4;
        let best = null, bd = 30;
        for (const a of G.actors) {
          if (!a.alive || a.team !== 0 || nav.inPad(a.pos.x, a.pos.z, 0.5)) continue;
          const d = Math.hypot(a.pos.x - c.x, a.pos.z - c.z);
          if (d < bd) { bd = d; best = a; }
        }
        c.tgt = best ? best.nid ?? best.slot : -1;
      }
      const t = c.tgt >= 0 ? G.actors.find((a) => (a.nid ?? a.slot) === c.tgt) : null;
      if (t && t.alive && Math.hypot(t.pos.x - c.x, t.pos.z - c.z) < 1.05 && Math.abs(t.pos.y - c.y) < 1.3) { b.crabPop(c, false); continue; }
      let moved = false;
      if (t && t.alive) {
        const want = Math.atan2(t.pos.x - c.x, t.pos.z - c.z);
        for (const o of [0, 0.5, -0.5, 1.0, -1.0, 1.6, -1.6]) {
          const yaw = want + o, nx = c.x + Math.sin(yaw) * sp * dt, nz = c.z + Math.cos(yaw) * sp * dt;
          if (nav.inPad(nx, nz, 0.8)) continue;
          const g = L.groundHeight(nx, nz, c.y + 0.7);
          if (!(g > PLAYER.waterY + 0.3) || g < c.y - 1.4 || L.pointInside(_v.set(nx, g + 0.3, nz), 0)) continue;
          c.x = nx; c.z = nz; c.y += (g - c.y) * Math.min(1, dt * 12);
          c.yaw += angleDiff(c.yaw, yaw) * Math.min(1, dt * 10);
          moved = true; break;
        }
      }
      c.speed += ((moved ? sp : 0) - c.speed) * Math.min(1, dt * 8);
    }
  }
}
