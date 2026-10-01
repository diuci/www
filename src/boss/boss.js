// HULLBREAKER — the boss entity. Owns the replicated state (pos, yaw, hp, phase, current move, stun, crablets …), the
// model, the hazards and the damage the squad deals it. One client simulates it (offline: you; online: the host, like
// the bots) through BossBrain; everyone else follows the host's 20 Hz snapshots on the same playback clock as remote
// squidkids and replays its moves from their records, so what you see — telegraphs, rings, beams — is what hits you.
//
// The boss clock (bt, seconds since the match began, advanced by the sim's frame time) is the timeline every move is
// keyed to; guests read it off the snapshots at their playback time.
import * as THREE from 'three';
import { G, emit, on, clamp } from '../core/ctx.js';
import { BossModel } from './bossModel.js';
import { BossNav, FLOOR_BODY } from './bossNav.js';
import { BossHazards, movePhaseAt, moveTimes, beamAngle, HZ } from './bossHazards.js';
import { BossBrain } from './bossBrain.js';

export const BOSS = {
  name: '铁壳诗怪',
  hpPerUnit: 18000,                                     // × squad units (human 1.0, bot 0.6) × difficulty
  hpDiff: { easy: 0.75, normal: 1, hard: 1.3 },
  dmgDiff: { easy: 0.7, normal: 1, hard: 1.2 },         // what its attacks deal
  paceDiff: { easy: 1.25, normal: 1, hard: 0.85 },      // gaps between its moves
  weak: 2.5, stunned: 1.25,                             // damage multipliers (weak point · while stunned)
  weapon: { roller: 0.3, slam: 0.6, bomb: 0.75, sticky: 0.75, seeker: 0.75, burst: 0.75, shaker: 0.75, waddle: 0.75, torpedo: 0.75 },   // area weapons against a target this big
  phases: [0.66, 0.33],
  introAt: 1.8, introLen: 3.4, roarLen: 1.9,
};
const SELF = 'boss';                                    // hit bookkeeping key for "the boss" (vs a crablet)
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _aim = new THREE.Vector3();
const _hs = { t: 0, target: null, weak: false, point: new THREE.Vector3(), dist: 0 };

export class Boss {
  constructor(match, { maxHp, difficulty = 'normal', sim = true }) {
    this.match = match;
    this.name = BOSS.name;
    this.difficulty = difficulty;
    this.sim = sim;
    this.dmgMul = BOSS.dmgDiff[difficulty] ?? 1;
    this.nav = G.level._bossNav || (G.level._bossNav = new BossNav(G.level));
    // state (replicated)
    this.bt = 0;
    this.pos = new THREE.Vector3(); this.vel = new THREE.Vector3(); this.yaw = 0; this.turn = 0;
    this.maxHp = maxHp; this.hp = maxHp; this.phase = 1;
    this.dead = false; this.killer = -1; this.stunned = false; this.invuln = false; this.visible = false;
    this.anim = 0; this.animT0 = 0;                     // set pieces: 1 intro, 2 roar
    this.move = null;                                   // the move record being played (null between moves)
    this.target = -1;                                   // nid it's focused on
    this.flashN = 0; this.weakN = 0; this.hurt = 0;
    this.crabs = new Map();                             // id → { id, x, y, z, yaw, hp, model, … }
    this.log = { moves: [], sent: 0, sentDmg: 0, recv: 0, recvDmg: 0 };   // audits (tools/net-test.mjs --mode boss)
    this._spawnPoint();
    // pseudo attacker for squidkid damage ('damage' / 'splatted' events, death cam, kill feed)
    const self = this;
    this.attacker = { name: BOSS.name, team: 1, pos: this.pos, boss: true, isLocal: false, isBot: true, stats: { splats: 0, turf: 0, deaths: 0 }, addTurf() {}, get color() { return G.teamColors[1]; }, _nearCamera: () => true, get vel() { return self.vel; } };
    this.hz = new BossHazards(this);
    this.hz.fx.setColor(G.teamColors[1]);
    this.model = new BossModel({ ink: G.teamColors[1], weak: G.teamColors[0], quality: G.settings?.quality || 'high' });
    this.model.root.visible = false;
    this.model.root.position.copy(this.pos); this.model.root.rotation.y = this.yaw;
    G.scene.add(this.model.root);
    this.model.onFoot = (i, pos, s) => { emit('boss:foot', { pos: pos.clone(), strength: s, leg: i }); if (s > 0.5) emit('shake', { amount: 0.12 * s, pos: pos.clone() }); };
    this.model.onImpact = (socket, pos, s) => { emit('boss:impact', { socket, pos: pos.clone(), strength: s }); emit('shake', { amount: 0.5 * s, pos: pos.clone() }); };
    this.model.onEvent = (name, data) => emit('boss:fx', { name, data });
    this.st = { speed: 0, turn: 0, move: null, moveT: 0, movePhase: null, phaseDur: 0, phase: 1, stunned: false, hurt: 0, dead: false, aim: null };
    this.brain = sim ? new BossBrain(this) : null;
    this.net = { buf: [], err: new THREE.Vector3(), errV: new THREE.Vector3(), prev: null, ready: false, handoff: false };
    this._ev = { key: '', phase: 1, stun: false, dead: false, anim: 0, hp: -1, intro: false };
    this._paintBt = 0;
    this._rain = new Map();
    this.unsubs = [on('special:slam', ({ actor, pos, radius }) => {
      // Tidal Slam is actor.js's; the slammer's own client deals it to the boss (remote slams are replays)
      if (actor && !actor.remote && actor.team === 0) this.splash(actor, pos, radius, 180, 55, 'slam');
    })];
  }

  // spawn: the roomiest floor near the middle of its home ground, facing down the stage toward the squad
  _spawnPoint() {
    const nav = this.nav;
    let sx = 0, sz = 0;
    for (const i of nav.planIds) { const [x, z] = nav.xz(i); sx += x; sz += z; }
    const n = Math.max(1, nav.planIds.length), cx = sx / n, cz = sz / n;
    let best = -1, bs = -Infinity;
    for (const i of nav.planIds) {
      const [x, z] = nav.xz(i);
      const s = Math.min(nav.Dw[i], 6) * 1.5 + Math.min(nav.Dv[i], 5) - Math.hypot(x - cx, z - cz) * 0.25;
      if (s > bs) { bs = s; best = i; }
    }
    const [x, z] = best >= 0 ? nav.xz(best) : [0, 0];
    const pad = nav.pads[0];
    this.pos.set(x, nav.floorAt(x, z), z);
    this.yaw = Math.atan2(pad.x - x, pad.z - z);
    // the facing may not fit here (a pier): take the nearest heading that does
    for (let k = 0; k < 24 && !nav.turnOk(x, z, this.yaw); k++) this.yaw += (k % 2 ? 1 : -1) * k * 0.13;
    this.home = { x, z };
  }

  hpFrac() { return this.maxHp > 0 ? this.hp / this.maxHp : 0; }
  get movePhase() { return this.st.movePhase; }   // the displayed move's phase ('tele' | 'act' | 'rec' | null)
  live() { return this.match.state === 'playing' && !this.dead; }

  // ---------------------------------------------------------------------------------------------- per frame
  update(dt) {
    if (this.match.state === 'init') { this.model.root.visible = false; return; }   // loading: the clock starts with the intro
    const bt0 = this.bt;
    if (this.sim) this.brain.update(dt);
    else this._follow(dt);
    const live = this.live() && this.visible;
    if (!live && this.hz.dead < 0 && (this.dead || this.match.state === 'finish' || this.match.state === 'judge' || this.match.state === 'results')) this.hz.fizzle(this.bt);
    // host: paint the slice of boss time just simulated
    if (this.sim && live && this.bt > bt0) this.hz.paint(Math.max(bt0, this._paintBt), this.bt);
    this._paintBt = this.bt;
    this.hz.update(dt, this.bt, { live });
    this._events();
    this._crabVisuals(dt);
    if (live) this._pushActors();
    this._modelUpdate(dt);
    this._flushRain(dt);
  }

  // what the model plays: the current move and its phase (or a set piece), from state alone — identical everywhere
  _modelUpdate(dt) {
    const st = this.st, m = this.move, root = this.model.root;
    root.visible = this.visible;
    root.position.copy(this.pos); root.rotation.y = this.yaw;
    st.speed = Math.hypot(this.vel.x, this.vel.z); st.turn = this.turn; st.phase = this.phase; st.stunned = this.stunned; st.dead = this.dead;
    st.hurt = this.hurt; this.hurt = 0;
    st.aim = null;
    if (this.anim) {
      st.move = this.anim === 1 ? 'intro' : 'roar'; st.movePhase = 'act'; st.moveT = this.bt - this.animT0; st.phaseDur = this.anim === 1 ? BOSS.introLen : BOSS.roarLen;
    } else if (m && !this.dead) {
      const u = this.bt - m.t0, ph = movePhaseAt(m, u), T = moveTimes(m);
      st.move = ph ? m.id : null; st.movePhase = ph;
      const start = ph === 'tele' ? 0 : ph === 'act' ? T.tele : T.tele + T.act;
      st.moveT = u - start; st.phaseDur = ph === 'tele' ? T.tele : ph === 'act' ? T.act : T.rec;
      st.aim = this._moveAim(m, u, _aim);
    } else { st.move = null; st.movePhase = null; st.moveT = 0; st.phaseDur = 0; }
    if (!st.aim && !this.dead) {
      const t = this.targetActor();
      if (t) st.aim = _aim.set(t.pos.x, t.pos.y + 1, t.pos.z);
    }
    this.model.update(dt, st);
  }

  _moveAim(m, u, out) {
    const p = m.p;
    switch (m.id) {
      case 'slam': return out.set(p.x, p.y, p.z);
      case 'sweep': { const a = u < m.d[0] ? p.a0 : beamAngle(m, u); return out.set(p.ox + Math.sin(a) * 12, p.y, p.oz + Math.cos(a) * 12); }
      case 'charge': return out.set(p.x + Math.sin(p.yaw) * (p.L + 3), p.y + 1, p.z + Math.cos(p.yaw) * (p.L + 3));
      case 'barrage': { const b = p.b.find((x) => x[3] + 0.2 > u) || p.b[p.b.length - 1]; return out.set(b[0], b[1], b[2]); }
      default: return null;
    }
  }

  targetActor() { return this.target >= 0 ? G.actors.find((a) => (a.nid ?? a.slot) === this.target && a.alive) || null : null; }

  // UI / audio events, raised from the displayed state on every client (the host's sim and the guests' replay alike)
  _events() {
    const E = this._ev;
    if (this.anim !== E.anim) {
      E.anim = this.anim;
      if (this.anim === 1 && !E.intro) { E.intro = true; emit('boss:intro', { boss: this, dur: BOSS.introLen }); }
    }
    const m = this.move, ph = m && !this.dead ? movePhaseAt(m, this.bt - m.t0) : null;
    const key = ph ? m.t0 + ph : '';
    if (key !== E.key) {
      E.key = key;
      if (ph) {
        const T = moveTimes(m);
        emit('boss:move', { id: m.id, phase: ph, dur: ph === 'tele' ? T.tele : ph === 'act' ? T.act : T.rec, boss: this });
      }
    }
    if (this.stunned !== E.stun) {
      E.stun = this.stunned;
      if (this.stunned) { const T = m ? moveTimes(m) : null; emit('boss:stun', { dur: T ? Math.max(0.5, m.t0 + T.end - this.bt) : 1.5, boss: this }); }
    }
    if (this.phase !== E.phase) { E.phase = this.phase; this.model.setPhase?.(this.phase); emit('boss:phase', { phase: this.phase, boss: this }); }
    if (Math.abs(this.hp - E.hp) > 0.01) { E.hp = this.hp; emit('boss:hp', { hp: this.hp, max: this.maxHp }); }
    if (this.dead && !E.dead) {
      E.dead = true;
      const by = G.actors.find((a) => (a.nid ?? a.slot) === this.killer) || null;
      for (const c of this.crabs.values()) { if (!c.dead) G.fx?.burst(_v.set(c.x, c.y + 0.3, c.z), undefined, G.teamColors[1], { count: 6, speed: 3, size: 0.08 }); c.dead = true; this._crabPopFx(c, true); }
      emit('boss:defeat', { by, boss: this });
      emit('shake', { amount: 0.9, pos: this.pos.clone() });
    }
  }

  // squidkids can't walk through the boss: owned ones are pushed out of its body (remote ones by their owners)
  _pushActors() {
    const s = Math.sin(this.yaw), c = Math.cos(this.yaw);
    for (const a of G.actors) {
      if (a.remote || !a.alive || a.pos.y > this.pos.y + 4.2) continue;
      for (const b of FLOOR_BODY) {
        const cx = this.pos.x + s * b.z, cz = this.pos.z + c * b.z, R = b.r + 0.75;
        const dx = a.pos.x - cx, dz = a.pos.z - cz, d = Math.hypot(dx, dz);
        if (d >= R) continue;
        const nx = d > 1e-3 ? dx / d : s, nz = d > 1e-3 ? dz / d : c;
        a.pos.x = cx + nx * R; a.pos.z = cz + nz * R;
        const vn = a.vel.x * nx + a.vel.z * nz;
        if (vn < 0) { a.vel.x -= vn * nx; a.vel.z -= vn * nz; }
      }
    }
  }

  // ---------------------------------------------------------------------------------------------- damage intake
  // Nearest hit shape (or crablet) along the segment a→b, within `pad` of its surface → _hs or null.
  segHit(a, b, pad = 0) {
    if (!this.visible || this.dead) return this._segCrabs(a, b, pad, null);
    let best = null;
    const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z, L2 = abx * abx + aby * aby + abz * abz || 1e-9;
    for (const h of this.model.hitShapes) {
      if (!h.active) continue;
      const c = h.pos;
      let t = ((c.x - a.x) * abx + (c.y - a.y) * aby + (c.z - a.z) * abz) / L2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const px = a.x + abx * t - c.x, py = a.y + aby * t - c.y, pz = a.z + abz * t - c.z;
      const R = h.r + pad, d2 = px * px + py * py + pz * pz;
      if (d2 > R * R) continue;
      // entry point along the segment (back off from the closest point)
      const back = Math.sqrt(Math.max(0, R * R - d2) / L2);
      const te = Math.max(0, t - back);
      // weak spheres sit on the shell: when both are hit, the weak one wins only if it is (nearly) in front
      const key = te - (h.weak ? 0.02 : 0);
      if (!best || key < best.key) best = { key, t: te, target: h, weak: h.weak };
    }
    const crab = this._segCrabs(a, b, pad, best);
    if (crab) return crab;
    if (!best) return null;
    _hs.t = best.t; _hs.target = best.target; _hs.weak = best.weak;
    _hs.point.set(a.x + abx * best.t, a.y + aby * best.t, a.z + abz * best.t);
    _hs.dist = Math.sqrt(L2) * best.t;
    return _hs;
  }
  _segCrabs(a, b, pad, best) {
    let hit = null;
    const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z, L2 = abx * abx + aby * aby + abz * abz || 1e-9;
    for (const c of this.crabs.values()) {
      if (c.dead) continue;
      const cy = c.y + 0.35;
      let t = ((c.x - a.x) * abx + (cy - a.y) * aby + (c.z - a.z) * abz) / L2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const px = a.x + abx * t - c.x, py = a.y + aby * t - cy, pz = a.z + abz * t - c.z, R = 0.55 + pad;
      if (px * px + py * py + pz * pz > R * R) continue;
      if ((best && t >= best.t) || (hit && t >= hit.t)) continue;
      hit = { t, target: c };
    }
    if (!hit) return null;
    _hs.t = hit.t; _hs.target = hit.target; _hs.weak = false;
    _hs.point.set(a.x + abx * hit.t, a.y + aby * hit.t, a.z + abz * hit.t);
    _hs.dist = Math.sqrt(L2) * hit.t;
    return _hs;
  }
  // a roller's drum (pos + forward): the lowest shapes it can reach — claws, belly — or a crablet → { target, point, boss }
  rollHit(pos, fx, fz, width) {
    const cx = pos.x + fx * 0.8, cz = pos.z + fz * 0.8, cy = pos.y + 0.45, R = width / 2 + 0.35;
    const out = this._roll || (this._roll = { target: null, point: new THREE.Vector3(), boss: false });
    for (const c of this.crabs.values()) {
      if (c.dead || Math.abs(c.y - pos.y) > 1 || Math.hypot(c.x - cx, c.z - cz) > R + 0.4) continue;
      out.target = c; out.boss = false; out.point.set(c.x, c.y + 0.35, c.z); return out;
    }
    if (!this.visible || this.dead) return null;
    let best = null, bd = Infinity;
    for (const h of this.model.hitShapes) {
      if (!h.active || h.pos.y - h.r > cy + 0.7) continue;
      const d = Math.hypot(h.pos.x - cx, h.pos.z - cz) - h.r;
      if (d < R && d < bd) { bd = d; best = h; }
    }
    if (!best) return null;
    out.target = best; out.boss = true; out.point.set(cx, Math.max(cy, best.pos.y - best.r * 0.5), cz);
    return out;
  }

  // exact ray vs the hit spheres (the local player's crosshair) → distance or -1
  rayDist(o, d, max) {
    if (!this.visible || this.dead) return -1;
    let best = -1;
    for (const h of this.model.hitShapes) {
      if (!h.active) continue;
      const ox = o.x - h.pos.x, oy = o.y - h.pos.y, oz = o.z - h.pos.z;
      const bq = ox * d.x + oy * d.y + oz * d.z, cq = ox * ox + oy * oy + oz * oz - h.r * h.r, disc = bq * bq - cq;
      if (disc < 0) continue;
      const t = -bq - Math.sqrt(disc);
      if (t > 0 && t < max && (best < 0 || t < best)) best = t;
    }
    return best;
  }

  // A shot / blob / beam connected (target from segHit). Routing: ghosts never hurt; offline + host apply, guests send
  // the hit to the host (shooter-authoritative) and show the marker now.
  hit(attacker, dmg, target, wid, point) {
    if (!attacker || attacker.remote || dmg <= 0 || this.dead) return;
    if (target && target.hp !== undefined && target.id !== undefined) { this._hitCrab(attacker, target, dmg); return; }
    const weak = !!(target && target.weak);
    const d = dmg * (weak ? BOSS.weak : 1) * (this.stunned ? BOSS.stunned : 1) * (BOSS.weapon[wid] ?? 1);
    if (point) G.fx?.burst(point, _v2.copy(point).sub(this.pos).setY(0.4).normalize(), attacker.color, { count: weak ? 10 : 5, speed: weak ? 5 : 3, size: 0.08 });
    if (this.invuln || !this.visible) { if (attacker.isLocal) emit('boss:hit', { damage: 0, weak, attacker, local: true, blocked: true, pos: point || null }); return; }
    if (G.netm && !G.netm.isHost) {
      G.netm.sendBossHit(attacker, d, weak, wid, -1);
      this.model.flash(clamp(d / 90, 0.25, 1), weak);
      emit('boss:hit', { damage: d, weak, attacker, local: true, predicted: true, pos: point || null });
      return;
    }
    this.applyDamage(attacker, d, weak, point);
  }
  // splash damage (blaster burst, slosh splash, bombs, Tidal Slam): falloff from the nearest body sphere, cover blocks
  splash(attacker, c, R, dmax, dmin, wid) {
    if (!attacker || attacker.remote || this.dead) return;
    for (const cr of this.crabs.values()) {
      if (cr.dead) continue;
      const d = Math.hypot(cr.x - c.x, cr.y + 0.3 - c.y, cr.z - c.z);
      if (d < R + 0.4) this._hitCrab(attacker, cr, dmax);
    }
    if (!this.visible) return;
    let best = null, bd = Infinity;
    for (const h of this.model.hitShapes) {
      if (!h.active || h.weak) continue;
      const d = Math.max(0, h.pos.distanceTo(c) - h.r);
      if (d < bd) { bd = d; best = h; }
    }
    if (!best || bd > R) return;
    if (!G.physics.los(_v.copy(c).setY(c.y + 0.3), _v2.copy(best.pos).lerp(c, Math.min(0.9, best.r / Math.max(best.r, best.pos.distanceTo(c)))))) return;
    this.hit(attacker, dmax + (dmin - dmax) * clamp(bd / R, 0, 1), best, wid, null);
  }
  // Ink Tempest rain: small per-frame amounts, batched so a guest sends a few messages a second, not sixty
  rain(owner, cx, cz, R, dmg) {
    if (!owner || owner.remote || this.dead || !this.visible) return;
    if (Math.hypot(this.pos.x - cx, this.pos.z - cz) > R + 2.4) return;
    this._rain.set(owner, (this._rain.get(owner) || 0) + dmg);
  }
  _flushRain(dt) {
    this._rainT = (this._rainT || 0) - dt;
    if (this._rainT > 0 || !this._rain.size) return;
    this._rainT = 0.3;
    for (const [owner, d] of this._rain) this.hit(owner, d, null, 'storm', null);
    this._rain.clear();
  }

  // host / offline: the damage lands
  applyDamage(attacker, d, weak, point) {
    if (this.dead || this.invuln || !this.visible || this.match.state !== 'playing') return 0;
    d = Math.min(d, this.hp);
    this.hp -= d;
    if (attacker?.stats) { attacker.stats.bossDmg = (attacker.stats.bossDmg || 0) + d; if (weak) attacker.stats.weakHits = (attacker.stats.weakHits || 0) + 1; }
    this.brain?.noteDamage(attacker, d);
    this.flashN++; if (weak) this.weakN++;
    this.model.flash(clamp(d / 90, 0.25, 1), weak);
    if (d >= 60) this.hurt = clamp(d / 160, 0.3, 1);
    emit('boss:hit', { damage: d, weak, attacker, local: !!attacker?.isLocal, pos: point || null });
    if (this.hp <= 0.001) { this.hp = 0; this._defeat(attacker); }
    else this.brain?.checkPhase();
    return d;
  }
  // host: a guest's hit arrived ({k:'bhit'})
  remoteHit(d) {
    if (!this.sim) return;
    const atk = G.netm?.byNid.get(d.a);
    if (!atk) return;
    this.log.recv++; this.log.recvDmg += +d.d || 0;
    if (d.c >= 0) { const c = this.crabs.get(d.c); if (c) this._hitCrab(atk, c, d.d, true); return; }
    this.applyDamage(atk, Math.min(+d.d || 0, 2000), !!d.weak, null);
  }

  _defeat(attacker) {
    if (this.dead) return;
    this.dead = true; this.stunned = false; this.anim = 0;
    this.killer = attacker ? (attacker.nid ?? attacker.slot) : -1;
    this.hz.fizzle(this.bt);
    this.brain?.onDefeat();
    this.match.bossMode?.onDefeat(attacker);
  }

  // ---------------------------------------------------------------------------------------------- crablets
  _hitCrab(attacker, c, dmg, fromNet = false) {
    if (c.dead) return;
    if (G.netm && !G.netm.isHost && !fromNet) {
      G.netm.sendBossHit(attacker, dmg, false, 'crab', c.id);
      emit('boss:hit', { damage: dmg, weak: false, attacker, local: !!attacker.isLocal, crab: true, predicted: true, pos: new THREE.Vector3(c.x, c.y + 0.4, c.z) });
      return;
    }
    c.hp -= dmg;
    if (!fromNet) emit('boss:hit', { damage: dmg, weak: false, attacker, local: !!attacker.isLocal, crab: true, pos: new THREE.Vector3(c.x, c.y + 0.4, c.z) });
    if (c.hp <= 0) { if (attacker.stats) attacker.stats.splats++; this.crabPop(c, true); }
  }
  // host: a crablet bursts (killed: harmless, into the squad's ink · otherwise: a boss-ink burst that hurts)
  crabPop(c, killed) {
    if (c.dead) return;
    c.dead = true;
    G.netm?.recBoss(['bc', c.id, r2(c.x), r2(c.y), r2(c.z), killed ? 1 : 0]);
    this._crabBurst(c.id, c.x, c.y, c.z, killed);
  }
  // everyone: the burst itself (guests get it on the host's timeline)
  _crabBurst(id, x, y, z, killed) {
    const c = this.crabs.get(id);
    if (c) { c.dead = true; this._crabPopFx(c, killed); }
    _v.set(x, y + 0.3, z);
    G.fx?.explosion(_v, killed ? G.teamColors[0] : G.teamColors[1], killed ? 1.2 : HZ.crabR);
    emit('boss:crablet', { phase: 'pop', pos: _v.clone(), killed: !!killed });
    if (!killed && this.live()) this.hz.crabBurst(x, y, z, id);
    if (this.sim && (!G.netm || G.netm.isHost)) {
      // painted once, by the host
      const g = G.level.groundHeight(x, z, y + 0.8);
      if (g > -5 && !this.nav.inPad(x, z, 0.3)) G.paint?.splat(_v.set(x, g + 0.1, z), killed ? 1.3 : 1.7, killed ? 0 : 1, { seed: Math.random() });
    }
  }
  _crabPopFx(c, killed) {
    if (c.model && !c.popped) { c.popped = true; c.model.pop?.(); c.popT = 0; }
  }
  // crablet model per live crablet; guests position them from the snapshots
  _crabVisuals(dt) {
    for (const [id, c] of this.crabs) {
      if (!c.model) {
        emit('boss:crablet', { phase: 'spawn', pos: new THREE.Vector3(c.x, c.y + 0.3, c.z) });
        try { c.model = BossModel.makeCrablet({ ink: G.teamColors[1], weak: G.teamColors[0], quality: G.settings?.quality }); G.scene.add(c.model.root); } catch (e) { console.warn('[boss] crablet', e); c.model = { root: new THREE.Group(), update() {}, pop() {}, dispose() {} }; }
      }
      const r = c.model.root;
      r.position.set(c.x, c.y, c.z); r.rotation.y = c.yaw;
      c.model.update(dt, { speed: c.speed || 0, turn: 0, dead: c.dead });
      if (c.dead) { c.popT = (c.popT || 0) + dt; if (c.popT > 1.2) { c.model.dispose?.(); r.removeFromParent(); this.crabs.delete(id); } }
    }
  }

  // ---------------------------------------------------------------------------------------------- netcode (see netmatch.js)
  // host → every tick: [bt, x, y, z, yaw, vx, vz, hp, phase, flags, move t0, anim, turn, flashN, weakN, killer, crabs, maxHp]
  pack(full) {
    let f = 0;
    if (this.stunned) f |= 1; if (this.dead) f |= 2; if (this.invuln) f |= 4; if (this.visible) f |= 8;
    const crabs = [];
    for (const c of this.crabs.values()) if (!c.dead) crabs.push([c.id, r2(c.x), r2(c.y), r2(c.z), r2(c.yaw), Math.round(c.hp)]);
    const s = [r3(this.bt), r2(this.pos.x), r2(this.pos.y), r2(this.pos.z), r3(this.yaw), r2(this.vel.x), r2(this.vel.z), Math.round(this.hp * 10) / 10, this.phase, f,
      this.move ? this.move.t0 : -1, this.anim, r2(this.turn), this.flashN, this.weakN, this.killer, crabs, Math.round(this.maxHp)];
    if (full && this.move) s.push(this.move);
    return s;
  }
  static unpack(s, ts) {
    return { t: ts, bt: s[0], x: s[1], y: s[2], z: s[3], yaw: s[4], vx: s[5], vz: s[6], hp: s[7], phase: s[8], f: s[9], mv: s[10], anim: s[11], turn: s[12], fl: s[13], wk: s[14], killer: s[15], crabs: s[16], maxHp: s[17], move: s[18] || null };
  }
  // a move record from the host's timeline (or a snapshot's copy): idempotent by t0
  onMove(m) { if (m && typeof m.t0 === 'number') this.hz.add(m); }

  // guest: apply this frame's sample (netmatch._sampleBoss fills this.net.cur)
  _follow(dt) {
    const n = this.net, S = n.cur;
    if (!S) return;
    const px = this.pos.x, pz = this.pos.z;
    this.pos.set(S.x + n.err.x, S.y + n.err.y, S.z + n.err.z);
    this.yaw = S.yaw; this.turn = S.turn;
    if (dt > 0) this.vel.set((this.pos.x - px) / dt, 0, (this.pos.z - pz) / dt);
    if (this.vel.lengthSq() > 400) this.vel.set(S.vx, 0, S.vz);
    this.bt = Math.max(this.bt, S.bt);            // the boss clock never runs backwards on screen
    this.hp = S.hp; this.phase = S.phase; if (S.maxHp) this.maxHp = S.maxHp;
    this.stunned = !!(S.f & 1); this.invuln = !!(S.f & 4); this.visible = !!(S.f & 8);
    if (S.f & 2) { if (!this.dead) { this.killer = S.killer; this.dead = true; this.hz.fizzle(this.bt); } }
    if (S.anim !== this.anim) { this.anim = S.anim; this.animT0 = this.bt; }
    if (S.move) this.onMove(S.move);
    this.move = S.mv >= 0 ? this.hz.moves.find((m) => m.t0 === S.mv) || null : null;
    // flashes for everyone's hits (the host counts them)
    if (n.fl !== undefined && S.fl > n.fl) this.model.flash(0.6, false);
    if (n.wk !== undefined && S.wk > n.wk) this.model.flash(0.8, true);
    n.fl = S.fl; n.wk = S.wk;
    this.flashN = S.fl; this.weakN = S.wk;
    // crablets: the sampled set (interpolated per id); ones gone from the snapshots without a burst event are dropped
    const seen = n.crabSeen || (n.crabSeen = new Set());
    seen.clear();
    for (const k of S.crabs || []) {
      seen.add(k[0]);
      let c = this.crabs.get(k[0]);
      if (!c) { c = { id: k[0], x: k[1], y: k[2], z: k[3], yaw: k[4], hp: k[5], dead: false }; this.crabs.set(k[0], c); }
      if (c.dead) continue;
      const sp = Math.hypot(k[1] - c.x, k[3] - c.z) / Math.max(dt, 1e-3);
      c.speed = c.speed === undefined ? 0 : c.speed + (Math.min(sp, 8) - c.speed) * Math.min(1, dt * 8);
      c.x = k[1]; c.y = k[2]; c.z = k[3]; c.yaw = k[4]; c.hp = k[5];
    }
    for (const c of this.crabs.values()) if (!c.dead && !seen.has(c.id)) { c.missT = (c.missT || 0) + dt; if (c.missT > 0.6) { c.dead = true; this._crabPopFx(c, true); } } else c.missT = 0;
  }

  // host migration: this client now runs the boss, from exactly what it was showing
  adopt() {
    if (this.sim) return;
    this.sim = true;
    this.net.err.set(0, 0, 0); this.net.errV.set(0, 0, 0);
    this.brain = new BossBrain(this, { adopt: true });
  }
  // a new host took over: its path starts where it adopted us — keep drawing from here, settle the offset
  handoff() { this.net.buf.length = 0; this.net.handoff = true; }

  warm() { return [this.model.root, this.hz.fx.warm()]; }

  dispose() {
    this.unsubs.forEach((u) => u());
    for (const c of this.crabs.values()) { c.model?.dispose?.(); c.model?.root?.removeFromParent(); }
    this.crabs.clear();
    this.hz.dispose();
    this.model.dispose();
    if (G.boss === this) G.boss = null;
  }
}

const r2 = (x) => Math.round(x * 100) / 100;
const r3 = (x) => Math.round(x * 1000) / 1000;
