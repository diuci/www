// Sponge Mitts (main weapon, kind 'mitts') — a melee boxing weapon: a squishy ink-soaked sponge glove in each fist.
//
//  · Punches (tap / hold fire): the gloves alternate right / left (≈ 6 a second). Each throws an ink fist — a glossy
//    glove-shaped blob — that flies fistRange and bursts: a direct hit does punchDamage (three splat), the burst splashes
//    anyone else near it for less and paints a splat. Near full run speed while punching.
//  · Charged leap (hold fire, press jump — the press never becomes a jump): a coiled crouch while jump stays held, the
//    gloves swelling with ink; let go to leap along the aim (aim higher for a higher arc, ≈ 4.5–13 m on flat ground).
//    Costs leapInkMin … leapInkMax ink with the charge. Where it comes down: a glove smash on anyone right there
//    (gloveDamage within gloveRadius), a splash ring (landDamageMax at the centre, falling off to landDamageMin), a big
//    paint splat, and landInvuln s untouchable (the spawn-protection flicker). The local player sees the arc + landing ring while charging;
//    in flight everyone sees the landing zone marked on the ground in the leaper's ink (the telegraph).
//  · Wall cling: a leap that meets a wall (one that rises past the head) sticks there — the kid hangs off it by the left
//    glove, still punching with the right. Holding on drains clingDrain ink / s; jump lets go (fire + jump leaps off the
//    wall instead), an empty tank drops you, squid form lets go (and can swim up the splash the landing left).
//
// Engine hooks: MAIN_KITS.mitts (update / busy / firingPose / moveSpeed / spreadDeg / tick / clear / bot) plus two
// small ones in actor.js: `jump(runner, intent)` takes a jump press, `runner.kit.hang` holds the kid in place.
// Per-runner state lives in runner.kit ({ mitts: true, … }; reset to null on spawn / death / loadout swap — tick() sweeps
// anything left behind: loops, the preview). The fists are this module's own projectiles (instanced glove blobs).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { G, emit, clamp, lerp } from '../../core/ctx.js';
import { WEAPONS, PLAYER } from '../../config.js';
import { Physics, Hit } from '../physics.js';
import { superEllipsoid } from '../character-geo.js';
import { MAIN_KITS, netRec } from './registry.js';
import { MELEE } from '../bots.js';
import './mitts-model.js';
import './mitts-assets.js';

const DEG = Math.PI / 180;
const UP = new THREE.Vector3(0, 1, 0), DOWN = new THREE.Vector3(0, -1, 0);
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3();
const _dir = new THREE.Vector3(), _hb = new THREE.Vector3(), _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3();
const _c = new THREE.Color(), _xa = new THREE.Vector3(), _ya = new THREE.Vector3();
const _hit = new Hit(), _hitP = new Hit(), _hitC = new Hit();
const _res = { t: 0, dist: 0 };
const W = () => WEAPONS.mitts;
const TAU = Math.PI * 2;
const r2 = (x) => Math.round(x * 100) / 100, r3 = (x) => Math.round(x * 1000) / 1000;
const HAND_R = Object.freeze({ hand: 0, valueOf() { return 1; } }), HAND_L = Object.freeze({ hand: 1, valueOf() { return 1; } });
const near = (p, r = 30) => { const c = G.rig?.gameCam || G.camera; return !!c && c.position.distanceToSquared(p) < r * r; };
function rumble(a, strong, weak, ms) { if (a && a.isLocal && !a.isBot) G.input?.rumble?.(strong, weak, ms); }
function credit(a, area, sp) { if (!(area > 0)) return; if (sp || a.specialActive) a.addTurfNoSpecial(area); else a.addTurf(area); }

// ================================================================================================ per-runner state
const STATES = new Map();   // runner → its state (so tick can sweep a state the runner dropped)
function K(r) {
  let k = r.kit;
  if (!k || !k.mitts) {
    k = r.kit = {
      mitts: true, seen: 0, cd: 0, side: 1,
      // leap charge
      charging: false, charge: 0, chargeT: 0, chargeAir: 0, full: false, loop: null,
      // leap in flight
      leaping: false, leapT: 0, leapV: new THREE.Vector3(), leapH: 0, slid: false, trail: 0, trailP: new THREE.Vector3(), predT: 0,
      land: { kind: 'none', pos: new THREE.Vector3(), normal: new THREE.Vector3(0, 1, 0), hitPt: new THREE.Vector3(), block: -1, t: 0, n: 0 },
      landT: 9,
      // wall cling
      cling: false, hang: false, clingT: 0, clingN: new THREE.Vector3(), clingPt: new THREE.Vector3(), drain: null, dryWarn: 0,
      // bots: a leap they asked for (charge to reach, direction), set by bot.fight / bot.paint
      botWant: -1, botYaw: 0, botPitch: 0,
    };
    STATES.set(r, k);
  }
  return k;
}
function stopLoops(k) {
  k.loop?.stop(0.08); k.loop = null;
  k.drain?.stop(0.12); k.drain = null;
}

// ================================================================================================ fists (projectiles)
// A glove-shaped ink blob flying knuckles-first: a fat fist, a row of four knuckle bumps across the face, the thumb
// folded under them and a tapering ink tail. Instanced (team colour per instance) with a rim glow so it reads fast.
const MAX_FISTS = 96;
const fists = [], fistPool = [];
let fistMesh = null;
function fistGeometry() {
  const parts = [];
  parts.push(superEllipsoid(0.105, 0.092, 0.09, 0.72, 0.68, 22, 16, (q) => { if (q.z > 0.03) q.z = 0.03 + (q.z - 0.03) * 0.72; }));
  for (let i = 0; i < 4; i++) {
    const x = -0.069 + i * 0.046;
    parts.push(superEllipsoid(0.027, 0.029, 0.022, 0.8, 0.8, 10, 8).translate(x, 0.03 - Math.abs(x) * 0.12, 0.078 - Math.abs(x) * 0.12));
  }
  parts.push(superEllipsoid(0.055, 0.022, 0.024, 0.8, 0.8, 12, 8).rotateZ(-0.18).translate(0.02, -0.04, 0.074));
  // tail: the ink the fist drags behind it — a fat drop pinching off, then two trailing blobs
  parts.push(superEllipsoid(0.07, 0.062, 0.1, 0.9, 0.9, 16, 12, (q) => { if (q.z < 0) { const t = -q.z / 0.1; q.x *= 1 - 0.55 * t * t; q.y *= 1 - 0.55 * t * t; } }).translate(0, 0, -0.07));
  parts.push(superEllipsoid(0.036, 0.034, 0.042, 1, 1, 10, 8).translate(0, 0.004, -0.2));
  parts.push(superEllipsoid(0.02, 0.02, 0.024, 1, 1, 8, 6).translate(0, 0.008, -0.27));
  for (const g of parts) { if (g.attributes.uv) g.deleteAttribute('uv'); }
  return mergeGeometries(parts, false);
}
function ensureFistMesh() {
  if (!G.scene) return null;
  if (!fistMesh) {
    const mat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.05, sheen: 0.5, sheenRoughness: 0.3, sheenColor: 0xffffff, envMapIntensity: 1.2 });
    mat.onBeforeCompile = (sh) => {
      sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        { float fr = 1.0 - abs(dot(normalize(normal), normalize(vViewPosition))); totalEmissiveRadiance += diffuseColor.rgb * (0.18 + 0.9 * fr * fr * fr); }`);
    };
    mat.customProgramCacheKey = () => 'iw-mitts-fist-1';
    fistMesh = new THREE.InstancedMesh(fistGeometry(), mat, MAX_FISTS);
    fistMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    fistMesh.setColorAt(0, _c.set(0xffffff));
    fistMesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    fistMesh.frustumCulled = false; fistMesh.castShadow = true; fistMesh.count = 0; fistMesh.name = 'mitts:fists';
  }
  if (fistMesh.parent !== G.scene) G.scene.add(fistMesh);
  return fistMesh;
}

// the glove's face (where a fist leaves), falling back to a point in front of the chest on the punching side
function gloveMuzzle(a, hand, out) {
  const ch = a.character;
  if (ch.getMuzzleHand) ch.getMuzzleHand(out, hand); else ch.getMuzzle(out);
  _v3.copy(a.pos); _v3.y += 1.05;
  if (!isFinite(out.x) || out.distanceToSquared(_v3) > 1.5 * 1.5 || !G.physics.los(_v3, out)) {
    const sx = hand ? 1 : -1, cy = Math.cos(a.yaw), sy = Math.sin(a.yaw);
    out.copy(_v3).addScaledVector(a.aimDir, 0.35);
    out.x += cy * 0.16 * sx; out.z -= sy * 0.16 * sx;
    if (!G.physics.los(_v3, out)) out.copy(_v3);
  }
  return out;
}

// a fist leaves the glove at m along dir. ghost: a remote player's (online) — flies and bursts for the eye only
function spawnFist(a, w, hand, m, dir, ghost = false) {
  const f = fistPool.pop() || { pos: new THREE.Vector3(), prev: new THREE.Vector3(), start: new THREE.Vector3(), vel: new THREE.Vector3(), dir: new THREE.Vector3() };
  f.owner = a; f.team = a.team; f.age = 0; f.life = w.fistRange / w.fistSpeed; f.hand = hand; f.seed = Math.random();
  f.sp = !!a.specialActive; f.trail = -0.8; f.spin = (Math.random() - 0.5) * 0.6; f.ghost = ghost;
  f.pos.copy(m); f.prev.copy(m); f.start.copy(m); f.dir.copy(dir); f.vel.copy(dir).multiplyScalar(w.fistSpeed);
  fists.push(f);
  if (a.isLocal || near(m)) G.audio?.play('mitts_punch', { pos: a.isLocal ? undefined : m, volume: a.isLocal ? 0.6 : 0.45, pitch: hand ? 1.06 : 0.97 });
  return f;
}
function fireFist(a, w, hand) {
  const m = gloveMuzzle(a, hand, _v);
  const dir = G.projectiles._aimFrom(a, m, _dir);
  G.projectiles._spread(dir, w.punchSpread);
  spawnFist(a, w, hand, m, dir);
  netRec(a, 'mitts', [0, r2(m.x), r2(m.y), r2(m.z), r3(dir.x), r3(dir.y), r3(dir.z), hand]);
  emit('weapon:fire', { actor: a, weapon: w.id, muzzle: m.clone(), dir: dir.clone(), hand });
  const r = a.weaponRunner;
  if (r.rumbleT <= 0) { r.rumbleT = 0.08; rumble(a, 0.05, 0.12, 45); }
}

function hitBase(e) { return _hb.set(e.pos.x, e.pos.y + (e.smoothY || 0), e.pos.z); }

// A fist bursts: splash damage to everyone near but the one it hit, paint where it burst (on the surface it hit, else
// the ground under it), FX + pop.
function burstFist(f, at, direct, normal) {
  const w = W(), o = f.owner;
  if (!o) return;
  const c = _a.copy(at);
  if (f.ghost) { burstFx(f, o, c, direct, normal, w); return; }
  let area = 0;
  if (normal) area = G.paint.splat(_b.copy(at).addScaledVector(normal, 0.12), w.fistPaint * (0.85 + Math.random() * 0.3), f.team, { seed: f.seed, stretch: f.dir, stretchAmt: 0.45 });
  else {
    const g = G.physics.raycast(_b.set(at.x, at.y + 0.2, at.z), DOWN, 3.4, _hit, true);
    if (g.hit) area = G.paint.splat(_b.copy(g.point).addScaledVector(g.normal, 0.1), w.fistPaint * 0.85, f.team, { seed: f.seed });
  }
  credit(o, area, f.sp);
  for (const e of G.actors) {
    if (e.team === f.team || !e.alive || e === direct) continue;
    _v2.copy(e.pos); _v2.y += (e.smoothY || 0) + (e.form === 'squid' ? 0.3 : 0.7);
    const d = _v2.distanceTo(c);
    if (d > w.splashRadius || !G.physics.los(c, _v2)) continue;
    G.projectiles.applyHit(o, e, lerp(w.splashMax, w.splashMin, clamp(d / w.splashRadius, 0, 1)), 'mitts');
  }
  G.specials?.areaHit?.(c, w.splashRadius, w.splashMin, f.team, o);
  if (direct !== 'boss') G.boss?.splash(o, c, w.splashRadius, w.splashMax, w.splashMin, 'mitts');   // Boss Battle
  burstFx(f, o, c, direct, normal, w);
}
function burstFx(f, o, c, direct, normal, w) {
  const col = o.color, show = o.isLocal || near(c, 26);
  if (show) {
    const n = normal || _v2.copy(f.dir).negate();
    G.fx?.burst(c, n, col, { count: 12, speed: 4.4, size: 0.085, ring: true, mist: true });
    // the full ink-sheet pop only where it can't wall off your own view: someone else's fists, or a fist that connected
    if ((direct || !o.isLocal) && near(c, 16)) G.fx?.explosion(c, col, direct ? 0.6 : 0.5);
    else G.fx?.ring?.(c, n, col, { radius: w.splashRadius * 0.8, life: 0.22, snap: !!normal });
    G.audio?.play('mitts_pop', { pos: c, volume: direct ? 0.75 : 0.55, pitch: 0.95 + Math.random() * 0.12 });
  }
  emit('weapon:impact', { pos: c.clone(), normal: (normal || UP).clone(), team: f.team, kind: 'shot', radius: w.splashRadius, victim: direct && direct !== 'boss' ? direct : undefined });
}

function updateFists(dt) {
  const w = W(), nm = G.netm;
  for (let i = fists.length - 1; i >= 0; i--) {
    const f = fists[i];
    if (f.ghost && nm) nm.mute++;   // (a ghost's splats are its owner's to send)
    try { stepFist(f, i, w, dt); } finally { if (f.ghost && nm) nm.mute--; }
  }
  drawFists();
}
function stepFist(f, i, w, dt) {
  {
    let dead = !f.owner;
    f.age += dt;
    f.prev.copy(f.pos);
    f.pos.addScaledVector(f.vel, dt);
    const hr0 = w.fistSize;
    // bodies (a ghost fist bursts on them for the eye; the owner's client decides the hit)
    if (!dead) for (const e of G.actors) {
      if (e.team === f.team || !e.alive) continue;
      const h = e.hitH || (e.form === 'squid' ? PLAYER.squidHeight : PLAYER.height), hr = e.hitR || PLAYER.radius;
      if (Math.abs(e.pos.x - f.pos.x) > 3 + hr || Math.abs(e.pos.z - f.pos.z) > 3 + hr) continue;
      Physics.segmentCapsuleDist(f.prev, f.pos, hitBase(e), hr, h, _res);
      if (_res.dist < hr * 0.95 + hr0) {
        _v.copy(f.prev).lerp(f.pos, _res.t);
        if (!f.ghost) G.projectiles.applyHit(f.owner, e, w.punchDamage, 'mitts');
        G.fx?.burst(_v, _v2.copy(f.dir).negate(), f.owner.color, { count: 7, speed: 3.2, size: 0.08 });
        burstFist(f, _v, e, null);
        dead = true; break;
      }
    }
    // Boss Battle: HULLBREAKER's hit spheres / its crablets
    if (!dead && G.boss) {
      const bh = G.boss.segHit(f.prev, f.pos, hr0);
      if (bh) { const at = bh.point.clone(); G.boss.hit(f.owner, w.punchDamage, bh.target, 'mitts', at); burstFist(f, at, 'boss', null); dead = true; }
    }
    // enemy curtains / devices / special objects catch it (and it bursts there) — a ghost's blow costs them nothing
    const fd = f.ghost ? 0 : w.punchDamage;
    if (!dead && G.subs && G.subs.blockShot(f.prev, f.pos, f.team, fd)) { burstFist(f, f.pos, null, null); dead = true; }
    if (!dead && G.specials && G.specials.shotHit(f.prev, f.pos, f.team, fd, f.owner)) { burstFist(f, f.pos, null, null); dead = true; }
    // the level
    if (!dead) {
      const h = G.physics.segment(f.prev, f.pos, _hit, true);
      if (h.hit) { _v.copy(h.point); _v3.copy(h.normal); burstFist(f, _v, null, _v3); dead = true; }
    }
    // end of its reach: bursts in the air
    if (!dead && f.age >= f.life) { burstFist(f, f.pos, null, null); dead = true; }
    if (!dead && f.pos.y < PLAYER.waterY - 1.5) dead = true;
    // a thin drip trail under it
    if (!dead) {
      f.trail += w.fistSpeed * dt;
      if (f.trail > 1.5) {
        f.trail = 0;
        const g = G.physics.raycast(f.pos, DOWN, 3, _hit, true);
        if (g.hit) credit(f.owner, G.paint.splat(_v.copy(g.point).addScaledVector(g.normal, 0.08), 0.28 + Math.random() * 0.1, f.team, { seed: Math.random() }), f.sp);
      }
    }
    if (dead) { f.owner = null; fists[i] = fists[fists.length - 1]; fists.pop(); fistPool.push(f); }
  }
}
function drawFists() {
  const mesh = fists.length || (fistMesh && fistMesh.count) ? ensureFistMesh() : null;
  if (!mesh) return;
  let n = 0;
  for (const f of fists) {
    if (n >= MAX_FISTS) break;
    // knuckles along the flight, kept level (roll a little per fist); pops out of the glove, wobbles like a jelly
    _dir.copy(f.dir);
    _xa.crossVectors(UP, _dir); if (_xa.lengthSq() < 1e-6) _xa.set(1, 0, 0); _xa.normalize();
    _ya.crossVectors(_dir, _xa);
    _m4.makeBasis(_xa, _ya, _dir);
    _q.setFromRotationMatrix(_m4);
    const grow = Math.min(1, 0.45 + f.age / 0.05 * 0.55), wob = Math.sin(f.age * 46 + f.seed * 6) * 0.1;
    const k = 1.25 * grow;
    _s.set(k * (1 + wob * 0.6), k * (1 + wob * 0.6), k * (1 - wob));
    _m4.compose(f.pos, _q, _s);
    mesh.setMatrixAt(n, _m4);
    mesh.setColorAt(n, f.owner ? f.owner.color : _c.set(0xffffff));
    n++;
  }
  mesh.count = n;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
}

// ================================================================================================ leap
// Launch velocity for a charge: speed² eases linearly with the charge (distance ∝ v² on flat ground), heading = the aim
// yaw, elevation = leapAngle + aim pitch × leapPitchK (clamped), the vertical speed capped. Off a wall: never into it.
function leapVelocity(a, k, c, out) {
  const w = W();
  const yaw = k.botWant >= 0 ? k.botYaw : a.aimYaw, pitch = k.botWant >= 0 ? k.botPitch : a.aimPitch;
  const ang = clamp(w.leapAngle * DEG + pitch * w.leapPitchK, w.leapAngleMin * DEG, w.leapAngleMax * DEG);
  const v = Math.sqrt(lerp(w.leapSpeedMin * w.leapSpeedMin, w.leapSpeedMax * w.leapSpeedMax, clamp(c, 0, 1)));
  const vy = Math.min(w.leapVyMax, v * Math.sin(ang)), vh = v * Math.cos(ang);
  let dx = Math.sin(yaw), dz = Math.cos(yaw);
  if (k.cling) {
    const n = k.clingN, dn = dx * n.x + dz * n.z;
    if (dn < 0.35) { dx += n.x * (0.35 - dn); dz += n.z * (0.35 - dn); const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l; }
  }
  return out.set(dx * vh, vy, dz * vh);
}

// Where a leap from `from` with velocity v0 comes down: the actor's own integrator (gravity with the fall / apex
// multipliers; the kit holds the horizontal speed) swept against the level — the chest for walls, the feet for ground,
// the head for ceilings. out.kind: 'ground' | 'wall' (clingable) | 'bump' (a wall it can't stick to) | 'sea' | 'none'.
// pts (optional Float32Array) gets the path for the arc preview (out.n points).
const PRED_DT = 1 / 60, PRED_PTS = 64;
function predictLeap(from, v0, out, pts) {
  const P = PLAYER;
  let x = from.x, y = from.y, z = from.z, vy = v0.y;
  const vx = v0.x, vz = v0.z, hs = Math.hypot(vx, vz), dx = hs > 1e-4 ? vx / hs : 0, dz = hs > 1e-4 ? vz / hs : 0;
  out.kind = 'none'; out.n = 0; out.block = -1;
  const push = () => { if (pts && out.n < PRED_PTS) { pts[out.n * 3] = x; pts[out.n * 3 + 1] = y + 0.35; pts[out.n * 3 + 2] = z; out.n++; } };
  push();
  for (let i = 1; i <= 210; i++) {
    let g = P.gravity; if (vy < 0) g *= P.fallGravityMul; if (Math.abs(vy) < P.apexBand) g *= P.apexGravityMul;
    vy = Math.max(-P.maxFall, vy - g * PRED_DT);
    const nx = x + vx * PRED_DT, nz = z + vz * PRED_DT;
    let ny = y + vy * PRED_DT;
    // head against a ceiling: stop rising
    if (vy > 0) {
      _a.set(x, y + P.height, z); _b.set(nx, ny + P.height, nz);
      const h = G.physics.segment(_a, _b, _hitP, false);
      if (h.hit && h.normal.y < -0.5) { vy = 0; ny = y; }
    }
    // chest against a wall
    _a.set(x, y + 0.8, z); _b.set(nx + dx * P.radius, ny + 0.8, nz + dz * P.radius);
    let h = G.physics.segment(_a, _b, _hitP, false);
    if (h.hit && Math.abs(h.normal.y) < 0.55) {
      out.t = i * PRED_DT; out.normal.copy(h.normal); out.normal.y = 0; out.normal.normalize(); out.block = h.block;
      out.hitPt.set(h.point.x, ny + 0.8, h.point.z);
      out.pos.set(h.point.x + out.normal.x * P.radius, ny, h.point.z + out.normal.z * P.radius);
      out.kind = clingableAt(out.pos, out.normal, h.block) ? 'wall' : 'bump';
      x = out.pos.x; y = ny; z = out.pos.z; push();
      return out;
    }
    // feet onto the ground (falling)
    if (vy <= 0.5) {
      _a.set(x, y + 0.3, z); _b.set(nx, ny - 0.02, nz);
      h = G.physics.segment(_a, _b, _hitP, false);
      if (h.hit && h.normal.y > 0.55) {
        out.kind = 'ground'; out.pos.copy(h.point); out.normal.copy(h.normal); out.hitPt.copy(h.point); out.block = h.block; out.t = i * PRED_DT;
        x = h.point.x; y = h.point.y; z = h.point.z; push();
        return out;
      }
    }
    x = nx; y = ny; z = nz;
    if ((i & 1) === 0) push();
    if (y < P.fallDeathY && G.level.groundHeight(x, z, y + 0.6) === -Infinity) {
      out.kind = 'sea'; out.pos.set(x, P.waterY, z); out.normal.set(0, 1, 0); out.hitPt.copy(out.pos); out.t = i * PRED_DT;
      return out;
    }
  }
  out.pos.set(x, y, z);
  return out;
}

// a wall a sponge can stick to: solid (not a railing / grate), rising past the head, with no floor right under the feet
function clingableAt(pos, n, blockId) {
  const b = blockId >= 0 ? G.level.blocks[blockId] : null;
  if (b && (b.rail || b.grate)) return false;
  _v2.set(pos.x, pos.y + 1.35, pos.z); _v3.set(-n.x, 0, -n.z);
  const h = G.physics.raycast(_v2, _v3, PLAYER.radius + 0.45, _hitC, false);
  if (!h.hit || Math.abs(h.normal.y) > 0.5) return false;
  _v2.set(pos.x, pos.y + 0.2, pos.z);
  return !G.physics.raycast(_v2, DOWN, 0.5, _hitC, false).hit;
}

function startCharge(r, k) {
  const a = r.a, w = W();
  if (k.charging || k.leaping) return true;
  if (a.ink < w.leapInkMin) { r._empty(); return false; }
  k.charging = true; k.charge = 0; k.chargeT = 0; k.chargeAir = 0; k.full = false;
  if (a.isLocal || near(a.pos)) k.loop = G.audio?.loop('mitts_charge', { pos: a.isLocal ? undefined : a.pos, volume: a.isLocal ? 0.5 : 0.35, pitch: 1 }) || null;
  return true;
}
function cancelCharge(r, k) {
  k.charging = false; k.charge = 0; k.chargeT = 0; k.botWant = -1; r.charge = 0;
  k.loop?.stop(0.08); k.loop = null;
}

function releaseLeap(r, k) {
  const a = r.a, w = W();
  const c = k.charge;
  k.charging = false; r.charge = 0;
  k.loop?.stop(0.05); k.loop = null;
  a.ink = Math.max(0, a.ink - lerp(w.leapInkMin, w.leapInkMax, c));
  a.lastFire = 0;
  const v = leapVelocity(a, k, c, _v);
  const fromWall = k.cling;
  if (fromWall) { k.cling = false; k.hang = false; k.drain?.stop(0.1); k.drain = null; }
  k.botWant = -1;
  a.vel.copy(v); a.grounded = false; a.coyote = 0; a.jumpBuffer = 0;
  k.leaping = true; k.leapT = 0; k.slid = false; k.leapV.set(v.x, 0, v.z); k.leapH = Math.hypot(v.x, v.z);
  k.trail = 0; k.trailP.copy(a.pos); k.predT = 0;
  predictLeap(a.pos, v, k.land, null);
  a.character.trigger('jump');
  leapFx(a, a.pos, c, fromWall ? k.clingN : null);
  netRec(a, 'mitts', [2, r2(a.pos.x), r2(a.pos.y), r2(a.pos.z), r2(c), fromWall ? r2(k.clingN.x) : 0, fromWall ? r2(k.clingN.z) : 0, fromWall ? 1 : 0]);
  // push-off splat
  if (!fromWall) credit(a, G.paint.splat(_v2.copy(a.pos).setY(a.pos.y + 0.25), 0.9, a.team, { seed: Math.random() }));
  emit('mitts:leap', { actor: a, from: a.pos.clone(), to: k.land.pos.clone(), kind: k.land.kind, charge: c });
  rumble(a, 0.25, 0.35, 110);
}

// the launch: whoosh + a ring of ink off the deck (or a burst off the wall it pushed away from: wallN)
function leapFx(a, pos, c, wallN) {
  if (!(a.isLocal || near(pos))) return;
  const col = a.color;
  G.audio?.play('mitts_leap', { pos: a.isLocal ? undefined : pos, volume: a.isLocal ? 0.75 : 0.55, pitch: 1.05 - 0.15 * c });
  if (!wallN) {
    G.fx?.burst(_v2.copy(pos).setY(pos.y + 0.08), UP, col, { count: 14, speed: 5, size: 0.08, spread: 0.7 });
    G.fx?.ring?.(pos, UP, col, { radius: 1.3, life: 0.35 });
  } else G.fx?.burst(_v2.copy(pos).setY(pos.y + 1), wallN, col, { count: 12, speed: 4, size: 0.08 });
}
// the landing's look and sound (the ghost of a remote leap plays just this: its paint + hits are the owner's)
function landFx(a, at, n, c) {
  const w = W(), col = a.color;
  if (a.isLocal || near(c, 40)) {
    G.fx?.explosion(c, col, 1.9);
    if (n.y > 0.7) G.fx?.superJumpLand?.(at, col);
    else G.fx?.ring?.(at, n, col, { radius: w.landRadius, life: 0.45 });
    G.audio?.play('mitts_land', { pos: c, volume: a.isLocal ? 0.95 : 0.75 });
  }
  emit('shake', { pos: c.clone(), amount: 0.35 });
}
// in flight: the landing zone marked on the ground in the leaper's ink, for everyone (re-aimed now and then in case
// something nudged the flight; a remote leaper's is predicted from its replicated velocity)
function telegraph(a, k, w, dt) {
  k.predT -= dt;
  if (k.predT <= 0) { k.predT = 0.1; predictLeap(a.pos, a.vel, k.land, null); }
  const L = k.land;
  if (L.kind === 'ground' || L.kind === 'wall') {
    const at = L.kind === 'wall' ? L.hitPt : L.pos, n = L.normal;
    G.fx?.mark?.(_v2.copy(at).addScaledVector(n, 0.03), n, a.color, w.landRadius, 3, 0.95, G.time % 1, 1.2, 0.5);
    G.fx?.mark?.(_v2.copy(at).addScaledVector(n, 0.035), n, a.color, w.landRadius * 0.45 * (0.8 + 0.2 * Math.sin(G.time * 20)), 4, 0.8, G.time % 1, 1, 0.3);
  }
}
// the leap's splash where it comes down (ground or wall): damage ring + big splat + FX
function landSplash(a, at, n) {
  const w = W(), col = a.color;
  if (w.landInvuln) a.invuln = Math.max(a.invuln, w.landInvuln);   // a moment untouchable on landing (it flickers)
  // the gloves themselves: whoever it comes down on takes a glove smash on top of the splash
  if (w.gloveDamage) for (const e of G.actors) {
    if (e.team === a.team || !e.alive) continue;
    const reach = w.gloveRadius + (e.hitR || PLAYER.radius);
    if (Math.hypot(e.pos.x - at.x, e.pos.z - at.z) > reach || Math.abs(e.pos.y + (e.smoothY || 0) + 0.7 - at.y) > 1.6) continue;
    G.projectiles.applyHit(a, e, w.gloveDamage, 'mitts');
    if (a.isLocal || e.isLocal || near(e.pos, 30)) G.fx?.burst(_b.copy(e.pos).setY(e.pos.y + 0.8), UP, col, { count: 10, speed: 3.6, size: 0.09 });
  }
  const c = _a.copy(at).addScaledVector(n, 0.35);
  let area = G.paint.splat(c, w.landPaint, a.team, { seed: Math.random() });
  for (let i = 0; i < 6; i++) {
    const ang = (i / 6) * Math.PI * 2 + Math.random() * 0.5, rr = w.landPaint * (0.75 + Math.random() * 0.35);
    // round the contact, in the surface plane
    _xa.set(n.y > 0.7 ? 1 : -n.z, 0, n.y > 0.7 ? 0 : n.x).normalize(); _ya.crossVectors(n, _xa);
    _b.copy(c).addScaledVector(_xa, Math.cos(ang) * rr).addScaledVector(_ya, Math.sin(ang) * rr);
    area += G.paint.splat(_b, 0.55 + Math.random() * 0.35, a.team, { seed: Math.random() });
  }
  credit(a, area);
  for (const e of G.actors) {
    if (e.team === a.team || !e.alive) continue;
    _v2.copy(e.pos); _v2.y += (e.smoothY || 0) + (e.form === 'squid' ? 0.3 : 0.7);
    const d = _v2.distanceTo(c);
    if (d > w.landRadius || !G.physics.los(c, _v2)) continue;
    const dmg = lerp(w.landDamageMax, w.landDamageMin, clamp((d - 0.6) / (w.landRadius - 0.6), 0, 1));
    G.projectiles.applyHit(a, e, dmg, 'mitts');
  }
  G.specials?.areaHit?.(c, w.landRadius, w.landDamageMin, a.team, a);
  G.boss?.splash(a, c, w.landRadius, w.landDamageMax, w.landDamageMin, 'mitts');   // Boss Battle
  landFx(a, at, n, c);
  netRec(a, 'mitts', [1, r2(at.x), r2(at.y), r2(at.z), r2(n.x), r2(n.y), r2(n.z)]);
  emit('mitts:land', { actor: a, pos: c.clone(), normal: n.clone(), radius: w.landRadius });
  rumble(a, 0.45, 0.5, 160);
}

function startCling(r, k, n) {
  const a = r.a;
  k.cling = true; k.hang = true; k.leaping = false; k.clingT = 0; k.dryWarn = 0;
  k.botHold = 1.3 + Math.random() * 1.7;   // bots: how long to hang on before leaping / dropping
  k.clingN.copy(n); k.clingN.y = 0; k.clingN.normalize();
  k.clingPt.copy(a.pos).addScaledVector(k.clingN, -PLAYER.radius); k.clingPt.y = a.pos.y + 1.0;
  a.vel.set(0, 0, 0); a.grounded = false;
  k.landT = 0;
  landSplash(a, _v3.copy(k.clingPt), k.clingN);
  if (a.isLocal || near(a.pos)) {
    G.audio?.play('mitts_cling', { pos: a.isLocal ? undefined : a.pos, volume: a.isLocal ? 0.8 : 0.6 });
    k.drain = G.audio?.loop('mitts_drain', { pos: a.isLocal ? undefined : a.pos, volume: a.isLocal ? 0.35 : 0.22 }) || null;
  }
  emit('mitts:cling', { actor: a, on: true, pos: k.clingPt.clone(), normal: k.clingN.clone() });
}
// let go of the wall: 'jump' hops off it, 'empty' / 'squid' / anything else just drops
function dropCling(r, k, why) {
  const a = r.a;
  if (!k.cling) return;
  k.cling = false; k.hang = false;
  k.drain?.stop(0.12); k.drain = null;
  const n = k.clingN;
  if (why === 'jump') { a.vel.set(n.x * 3.4, 4.6, n.z * 3.4); a.character.trigger('jump'); }
  else if (why !== 'squid') a.vel.set(n.x * 1.2, 0.5, n.z * 1.2);
  a.grounded = false;
  if (a.isLocal || near(a.pos)) G.audio?.play('mitts_unstick', { pos: a.isLocal ? undefined : a.pos, volume: a.isLocal ? 0.7 : 0.5, pitch: why === 'empty' ? 0.85 : 1 });
  emit('mitts:cling', { actor: a, on: false, why });
}

// ================================================================================================ local preview
// While the local player charges: a dashed arc along the leap path and a ring where it comes down (white; red-ish X
// over the sea). Scene objects owned here, hidden whenever nobody local is charging.
let prevLine = null, prevRing = null, prevX = null, prevShown = 0;
const prevPts = new Float32Array(PRED_PTS * 3), prevOut = { kind: 'none', pos: new THREE.Vector3(), normal: new THREE.Vector3(), hitPt: new THREE.Vector3(), block: -1, t: 0, n: 0 };
function ensurePreview() {
  if (!G.scene) return false;
  if (!prevLine) {
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(PRED_PTS * 3), 3));
    prevLine = new THREE.Line(g, new THREE.LineDashedMaterial({ color: 0xffffff, dashSize: 0.3, gapSize: 0.2, transparent: true, opacity: 0.9, depthTest: false }));
    prevLine.renderOrder = 10; prevLine.frustumCulled = false;
    // landing ring (the splash radius) + a soft fill + a centre dot
    prevRing = new THREE.Group();
    const rm = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide });
    const fm = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide });
    prevRing.add(new THREE.Mesh(new THREE.RingGeometry(0.86, 1.12, 56), rm), new THREE.Mesh(new THREE.CircleGeometry(0.86, 56), fm), new THREE.Mesh(new THREE.RingGeometry(0.0, 0.1, 20), rm));
    prevRing.userData.mats = [rm, fm];
    for (const c of prevRing.children) c.renderOrder = 10;
    const xg = mergeGeometries([new THREE.PlaneGeometry(1.4, 0.2).rotateZ(Math.PI / 4), new THREE.PlaneGeometry(1.4, 0.2).rotateZ(-Math.PI / 4)], false);
    prevX = new THREE.Mesh(xg, new THREE.MeshBasicMaterial({ color: 0xff5a4a, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }));
    prevX.renderOrder = 10;
    prevLine.visible = prevRing.visible = prevX.visible = false;
  }
  for (const o of [prevLine, prevRing, prevX]) if (o.parent !== G.scene) G.scene.add(o);
  return true;
}
function showPreview(a, k) {
  if (!ensurePreview()) return;
  const v = leapVelocity(a, k, k.charge, _v);
  predictLeap(a.pos, v, prevOut, prevPts);
  const pos = prevLine.geometry.attributes.position;
  pos.array.set(prevPts.subarray(0, prevOut.n * 3));
  for (let i = prevOut.n; i < PRED_PTS; i++) pos.array.set(prevPts.subarray((prevOut.n - 1) * 3, prevOut.n * 3), i * 3);
  pos.needsUpdate = true; prevLine.geometry.setDrawRange(0, prevOut.n);
  prevLine.computeLineDistances();
  prevLine.visible = prevOut.n > 1;
  const good = prevOut.kind === 'ground' || prevOut.kind === 'wall';
  const R = W().landRadius / 1.12;
  prevRing.visible = good; prevX.visible = prevOut.kind === 'sea';
  if (good) {
    const n = prevOut.kind === 'wall' ? prevOut.normal : prevOut.normal;
    prevRing.position.copy(prevOut.kind === 'wall' ? prevOut.hitPt : prevOut.pos).addScaledVector(n, 0.04);
    prevRing.quaternion.setFromUnitVectors(_v2.set(0, 0, 1), n);
    prevRing.scale.setScalar(R * (0.96 + 0.04 * Math.sin(G.time * 12)));
    const [rm, fm] = prevRing.userData.mats;
    rm.color.set(0xffffff).lerp(a.color, k.charge >= 0.999 ? 0.55 : 0.2);
    fm.color.copy(a.color);
  }
  if (prevX.visible) { prevX.position.copy(prevOut.pos).setY(PLAYER.waterY + 0.05); prevX.quaternion.setFromUnitVectors(_v2.set(0, 0, 1), UP); }
  prevShown = G.time;
}
function hidePreview() { if (prevLine) prevLine.visible = prevRing.visible = prevX.visible = false; }

// ================================================================================================ the runner
function update(r, dt, inp, w) {
  const a = r.a, k = K(r);
  // the body was owned by something else (a body special, a super jump …): nothing carries over
  if (k.seen && G.time - k.seen > 0.25) { if (k.charging) cancelCharge(r, k); k.leaping = false; if (k.cling) dropCling(r, k, 'reset'); }
  k.seen = G.time;
  k.cd -= dt; k.landT += dt;
  if (a.specialActive && k.cling) dropCling(r, k, 'special');
  if (a.form === 'squid') { if (k.cling) dropCling(r, k, 'squid'); if (k.charging) cancelCharge(r, k); }

  // ---- leap charge (started by fire + jump — see jump() — or by a bot)
  if (k.charging) {
    k.chargeT += dt;
    const maxC = clamp((a.ink - w.leapInkMin) / (w.leapInkMax - w.leapInkMin), 0, 1);
    k.charge = Math.min(maxC, k.chargeT / w.leapChargeTime);
    r.charge = k.charge;
    a.lastFire = 0; a.fireFacing = 0.5;
    k.loop?.set({ pitch: 0.8 + 0.9 * k.charge, pos: a.isLocal ? undefined : a.pos });
    if (k.charge >= 0.999 && !k.full) {
      k.full = true;
      if (a.isLocal || near(a.pos)) G.audio?.play('mitts_full', { pos: a.isLocal ? undefined : a.pos, volume: a.isLocal ? 0.6 : 0.4 });
      rumble(a, 0.05, 0.3, 60);
    }
    if (near(a.pos, 26)) {
      for (let h = 0; h < 2; h++) { gloveMuzzle(a, h, _v2); G.fx?.chargeGlow?.(_v2, a.color, 0.3 + 0.7 * k.charge); }
    }
    // walked off a ledge mid-charge: the crouch has nothing to push off
    if (!a.grounded && !k.cling) { k.chargeAir += dt; if (k.chargeAir > 0.12) cancelCharge(r, k); } else k.chargeAir = 0;
    if (k.charging) {
      const go = k.botWant >= 0 ? k.charge >= Math.min(k.botWant, maxC) - 1e-3 || k.chargeT > w.leapChargeTime + 0.6 : !a.intent.jump;
      if (go && k.botWant >= 0 && !botReleaseOk(a, k)) cancelCharge(r, k);   // a bot never leaps somewhere it didn't plan
      else if (go) releaseLeap(r, k);
      else if (a.isLocal && !a.isBot) showPreview(a, k);
    }
  }

  // ---- leap in flight (after this frame's integrate: contacts are fresh)
  if (k.leaping) {
    k.leapT += dt;
    if (a.grounded) {
      k.leaping = false; k.landT = 0;
      landSplash(a, _v3.copy(a.pos), a.groundN && a.groundN.y > 0.5 ? a.groundN : UP);
    } else if (a.form !== 'kid' || k.leapT > 4) {
      k.leaping = false;
    } else {
      const c = a.contacts;
      if (!k.slid && c.wall && k.leapT > 0.03) {
        const into = -(k.leapV.x * c.wallNormal.x + k.leapV.z * c.wallNormal.z);
        if (into > 1.5 && clingableAt(a.pos, c.wallNormal, c.wallBlock)) startCling(r, k, c.wallNormal);
        else k.slid = true;   // a wall it can't stick to: physics takes it from here
      }
      if (k.leaping) {
        // hold the launch's horizontal speed (air drag / steering never bend the pounce) unless something else moved us
        if (!k.slid && Math.hypot(a.vel.x - k.leapV.x, a.vel.z - k.leapV.z) > 2.2) k.slid = true;
        if (!k.slid) { a.vel.x = k.leapV.x; a.vel.z = k.leapV.z; }
        a.fireFacing = 0.3; a.lastFire = 0;
        // trail: a few drips painted under the path, droplets + glow off the body
        k.trail += a.pos.distanceTo(k.trailP); k.trailP.copy(a.pos);
        if (k.trail > 1.6) {
          k.trail = 0;
          const g = G.physics.raycast(_v2.copy(a.pos).setY(a.pos.y + 0.3), DOWN, 5, _hit, true);
          if (g.hit) credit(a, G.paint.splat(_v2.copy(g.point).addScaledVector(g.normal, 0.08), 0.42 + Math.random() * 0.15, a.team, { seed: Math.random() }));
        }
        if (near(a.pos, 34)) G.fx?.superJumpTrail?.(_v2.copy(a.pos).setY(a.pos.y + 0.8), a.vel, a.color);
        telegraph(a, k, w, dt);
      }
    }
  }

  // ---- wall cling
  if (k.cling) {
    k.clingT += dt;
    a.vel.set(0, 0, 0);
    a.lastFire = 0;                                   // holding on: no idle refill
    a.ink = Math.max(0, a.ink - w.clingDrain * dt);
    k.drain?.set({ volume: (a.isLocal ? 0.35 : 0.22) * (0.6 + 0.4 * Math.sin(G.time * 7)), pos: a.isLocal ? undefined : a.pos });
    if (a.isLocal && a.ink < 20 && (k.dryWarn -= dt) <= 0) { k.dryWarn = 0.8; emit('lowink', { actor: a }); }
    if (near(a.pos, 20) && Math.random() < dt * 5) G.fx?.climbDrip?.(_v2.copy(k.clingPt), k.clingN, a.color);
    // let go: out of ink, landed on something, or the wall's gone
    _v2.set(a.pos.x, a.pos.y + 1.0, a.pos.z); _v3.set(-k.clingN.x, 0, -k.clingN.z);
    const wallThere = G.physics.raycast(_v2, _v3, PLAYER.radius + 0.5, _hitC, false).hit;
    if (a.ink <= 0) dropCling(r, k, 'empty');
    else if (a.grounded || !wallThere || !a.alive) dropCling(r, k, 'lost');
    else if (a.isBot && (k.botHold -= dt) < -0.6) dropCling(r, k, 'jump');   // (bot code leaps / lets go at 0; this is the backstop)
  }

  // ---- punches (not while charging or mid-leap; from the wall only the right glove is free)
  if (!inp.fire || k.charging || k.leaping) { if (k.cd < 0) k.cd = 0; }
  else {
    r.firingT = 0.35; a.fireFacing = 0.5;
    let guard = 0;
    while (k.cd <= 0 && guard++ < 2) {
      if (a.ink < w.inkPerPunch) { r._empty(); k.cd += w.punchInterval; break; }
      a.ink -= w.inkPerPunch; a.lastFire = 0;
      k.side = k.cling ? 0 : 1 - k.side;
      fireFist(a, w, k.side);
      r.sinceHand[k.side] = 0;
      a.character.trigger('shoot', k.side ? HAND_L : HAND_R);
      k.cd += w.punchInterval;
    }
  }
}

// fire + jump → charge a leap (grounded, or stuck to a wall); jump alone on a wall → let go. A press mid-charge /
// mid-leap is swallowed (it must never turn into a jump that overrides the leap). Bots start leaps via bot code only.
function jump(r, intent) {
  const a = r.a, k = r.kit && r.kit.mitts ? r.kit : null;
  if (k && (k.charging || k.leaping)) return true;
  if (k && k.cling) {
    if (intent.fire && !a.isBot && a.ink >= W().leapInkMin) startCharge(r, k);
    else if (!a.isBot || !intent.fire) dropCling(r, k, 'jump');
    return true;
  }
  if (a.isBot || !intent.fire || !a.grounded || a.form !== 'kid') return false;
  return startCharge(r, K(r));
}

// ================================================================================================ bots
// Close in and punch (MELEE: bots.js walks them straight at the target); pounce in from mid range; leap away when
// hurt and cornered; now and then leap onto a wall near the fight and punch down from it.
const _bp = { kind: 'none', pos: new THREE.Vector3(), normal: new THREE.Vector3(), hitPt: new THREE.Vector3(), block: -1, t: 0, n: 0 };
const _bv = new THREE.Vector3();
function botState(brain) { return brain._mitts || (brain._mitts = { leapCd: 1.5 + Math.random() * 2, wallCd: 4 + Math.random() * 4, travelCd: 4 + Math.random() * 4, escapeCd: 0 }); }
// pick a charge that lands at (tx, ty, tz) with the given yaw/pitch (two secant passes over the real prediction)
function botPlan(a, k, yaw, pitch, dist) {
  k.botYaw = yaw; k.botPitch = pitch;
  let c = clamp((dist - 4.5) / 8.5, 0, 1);
  for (let it = 0; it < 3; it++) {
    k.botWant = c;                                   // (leapVelocity reads the bot's yaw / pitch while botWant ≥ 0)
    predictLeap(a.pos, leapVelocity(a, k, c, _bv), _bp, null);
    if (it === 2) break;
    const got = Math.hypot(_bp.pos.x - a.pos.x, _bp.pos.z - a.pos.z);
    if (!(got > 0.5)) break;
    c = clamp(c + (dist - got) / 8.5, 0, 1);
  }
  k.botWant = -1;
  return c;
}
// a landing a bot may aim for: ground that is walkable nav (not a roof / perch / prop top it can't path off), not far
// above or below
function landingOk(a, P) {
  if (P.kind !== 'ground') return false;
  const b = P.block >= 0 ? G.level.blocks[P.block] : null;
  if (b && (b.roof || b.perch || b.rail)) return false;
  if (Math.abs(P.pos.y - a.pos.y) > 4) return false;
  if (!G.nav) return true;
  const id = G.nav.nearest(P.pos, 0.6);
  if (id < 0) return false;
  const n = G.nav.nodes[id];
  return Math.hypot(n.x - P.pos.x, n.z - P.pos.z) < 1.3 && Math.abs(n.y - P.pos.y) < 0.6;
}
function botLeap(r, k, c, yaw, pitch, kind = 'ground') {
  k.botYaw = yaw; k.botPitch = pitch;
  if (!startCharge(r, k)) { k.botWant = -1; return false; }
  k.botWant = c; k.botKind = kind;
  return true;
}
// at release: does the leap still come down where the bot planned (it may have been nudged while crouching)?
function botReleaseOk(a, k) {
  predictLeap(a.pos, leapVelocity(a, k, k.charge, _bv), _bp, null);
  return k.botKind === 'wall' ? _bp.kind === 'wall' : landingOk(a, _bp);
}
// a wall near the fight worth sticking to: probe round the bot at chest and head height
function botFindWall(a, target) {
  let best = null, bestS = Infinity;
  for (let i = 0; i < 10; i++) {
    const yaw = (i / 10) * Math.PI * 2 + Math.random() * 0.3;
    _v2.set(a.pos.x, a.pos.y + 1.2, a.pos.z); _v3.set(Math.sin(yaw), 0, Math.cos(yaw));
    const h = G.physics.raycast(_v2, _v3, 9, _hitC, false);
    if (!h.hit || h.dist < 3.5 || Math.abs(h.normal.y) > 0.3) continue;
    _v2.y += 1.6;
    const h2 = G.physics.raycast(_v2, _v3, 9.5, _hitP, false);
    if (!h2.hit || Math.abs(h2.dist - h.dist) > 0.6) continue;           // needs height above the cling point
    const s = Math.hypot(h.point.x - target.pos.x, h.point.z - target.pos.z);
    if (s < 7 && s < bestS) { bestS = s; best = { yaw, dist: h.dist }; }
  }
  return best;
}
// own ink along (nx, nz) from the kid, as far as d m ahead: a lane to swim in on
const _rs = { own: 0, enemy: 0, empty: 0, n: 0 };
function ownLane(a, nx, nz, d) {
  for (const k of [1.2, 2.6, 4.2]) {
    if (k > 1.2 && k > d - 0.6) break;
    const st = G.paint.regionStats(a.pos.x + nx * k, a.pos.y, a.pos.z + nz * k, 0.8, a.team, _rs);
    if (!st.n || st.own < 0.5) return false;
  }
  return true;
}
// The approach is the Mitts' whole fight: most of their splats happen before they reach anyone. bot.tactics runs every
// fight frame after the core's defaults (which walk a melee bot straight at the target) and takes over from 5–14 m:
//   · own ink running toward the target → swim it in (fast, low, hard to hit)
//   · no lane → punch while closing: the fists paint the way (a lane for the next few metres) and the sponge guard is up
//   · both weave across the line to them instead of walking a straight, easy-to-track line
// Leaps / wall clings / out of sight / in reach: the kit's fight() and the core keep the frame.
function botTactics(brain, ctx) {
  const { a, w, dist, dt, it, move, target: t } = ctx;
  if (!w.botApproach || ctx.retreat || !t || !t.pos || !ctx.visible) return;
  const k = K(a.weaponRunner);
  if (k.charging || k.leaping || k.cling || dist <= w.range * 1.05 || dist > 14) return;
  const B = botState(brain);
  B.weaveT = (B.weaveT || 0) + dt;
  if (B.weaveP === undefined) B.weaveP = Math.random() * 6.28;
  const nx = (t.pos.x - a.pos.x) / dist, nz = (t.pos.z - a.pos.z) / dist;
  // heading: straight at them when the way is open (the core's melee walk), else the nav path's; plus the weave
  let ux = nx, uz = nz;
  const ml = Math.hypot(move.x, move.z);
  if (dist > 7 && ml > 0.1) { ux = move.x / ml; uz = move.z / ml; }
  const sway = Math.sin(B.weaveT * 4.2 + B.weaveP) * 0.6;
  const mx = ux - uz * sway, mz = uz + ux * sway, l = Math.hypot(mx, mz) || 1;
  move.set(mx / l, 0, mz / l);
  if (a.groundTeam === 1 && ownLane(a, nx, nz, Math.min(dist - w.range, 5))) { it.squid = true; it.fire = false; return; }
  if (a.ink > w.inkPerPunch * 6) { it.squid = false; it.fire = true; }
}

const bot = {
  paintPitch: -0.32,
  tactics: botTactics,
  fight(brain, ctx) {
    const { a, w, dist, dt, move, target: t } = ctx;
    const r = a.weaponRunner, k = K(r), B = botState(brain);
    B.leapCd -= dt; B.wallCd -= dt; B.escapeCd -= dt;
    if (k.charging || k.leaping) return false;
    const inReach = dist < w.range * 1.05;
    if (k.cling) {
      // punch down from the wall while they're in reach; after a while leap at them (or drop)
      if (k.botHold <= 0 || a.ink < 18) {
        if (a.ink > w.leapInkMax + 8 && dist > 4 && dist < 12) {
          const yaw = Math.atan2(t.pos.x - a.pos.x, t.pos.z - a.pos.z);
          const c = botPlan(a, k, yaw, -0.1, dist);
          if (landingOk(a, _bp) && botLeap(r, k, c, yaw, -0.1)) { B.leapCd = 3 + Math.random() * 3; return false; }
        }
        dropCling(r, k, 'jump');
      }
      return inReach;
    }
    const hp = a.hp / PLAYER.hp;
    const clear = G.physics.los(_v2.set(a.pos.x, a.pos.y + 1.1, a.pos.z), _v3.set(t.pos.x, t.pos.y + 1.0, t.pos.z));
    // escape: hurt and in their face → leap away (never into the sea / onto a roof)
    if (a.grounded && hp < 0.35 && dist < 5 && a.ink > w.leapInkMax && B.escapeCd <= 0 && Math.random() < dt * 3) {
      B.escapeCd = 3;
      const away = Math.atan2(a.pos.x - t.pos.x, a.pos.z - t.pos.z) + (Math.random() - 0.5) * 1.2;
      const c = botPlan(a, k, away, 0.05, 11);
      if (landingOk(a, _bp) && botLeap(r, k, c, away, 0.05)) { B.leapCd = 4; return false; }
    }
    // pounce from mid range
    if (a.grounded && B.leapCd <= 0 && dist > 5.5 && dist < 12.5 && a.ink >= w.leapInkMax + 8 && clear && Math.abs(t.pos.y - a.pos.y) < 2.5 && Math.random() < dt * 3) {
      B.leapCd = 2 + Math.random() * 2;
      const lead = 0.8;
      const tx = t.pos.x + t.vel.x * lead, tz = t.pos.z + t.vel.z * lead;
      const yaw = Math.atan2(tx - a.pos.x, tz - a.pos.z), d = Math.hypot(tx - a.pos.x, tz - a.pos.z);
      const c = botPlan(a, k, yaw, 0, d);
      if (landingOk(a, _bp) && Math.hypot(_bp.pos.x - tx, _bp.pos.z - tz) < 2.6 && botLeap(r, k, c, yaw, 0)) return false;
    }
    // now and then: onto a wall by the fight
    if (a.grounded && B.wallCd <= 0 && dist > 3 && dist < 11 && a.ink >= 70 && Math.random() < dt * 0.7) {
      B.wallCd = 7 + Math.random() * 7;
      const wl = botFindWall(a, t);
      if (wl) {
        for (const c of [0.35, 0.55, 0.75, 1]) {
          k.botWant = c; k.botYaw = wl.yaw; k.botPitch = 0.3;
          predictLeap(a.pos, leapVelocity(a, k, c, _bv), _bp, null);
          k.botWant = -1;
          if (_bp.kind === 'wall' && _bp.pos.y > a.pos.y + 0.8) {
            if (botLeap(r, k, c, wl.yaw, 0.3, 'wall')) return false;
            break;
          }
        }
      }
    }
    void move;
    return inReach;
  },
  paint(brain, ctx) {
    const { a, dt, move, needPaint, inkFrac, wantMove } = ctx;
    const r = a.weaponRunner, k = K(r), B = botState(brain);
    B.travelCd -= dt;
    if (k.charging || k.leaping) return false;
    if (k.cling) { if (k.botHold <= 0 || inkFrac < 0.15) dropCling(r, k, 'jump'); return inkFrac > 0.1; }   // hang a moment, ink the wall + the ground below
    // cover ground: a long pounce along the path (paints the landing), with plenty of ink and a long way to go
    if (B.travelCd <= 0 && a.grounded && inkFrac > 0.7 && wantMove && brain._pathRemaining && brain._pathRemaining() > 14 && Math.random() < dt * 0.8) {
      B.travelCd = 6 + Math.random() * 6;
      const yaw = Math.atan2(move.x, move.z);
      const c = botPlan(a, k, yaw, 0, 11);
      if (landingOk(a, _bp) && botLeap(r, k, c, yaw, 0)) return false;
    }
    return inkFrac > 0.08 && (needPaint || Math.random() < 0.02) && wantMove;
  },
};
MELEE.mitts = true;

// ================================================================================================ online
// Other players see a remote Mitts kid from: netState bits in its tick (1 charging · 2 leaping · 4 clinging · 8 full
// charge · bits 4–9 the cling wall's facing, 64 steps) → netApply rebuilds its runner.kit (the gloves' / body's pose, the
// landing telegraph, cling sounds); and kit records → ghost: 0 a fist (flies + bursts for the eye), 1 a landing splash's
// look, 2 a leap's launch.
function netState(r) {
  const k = r.kit && r.kit.mitts ? r.kit : null;
  if (!k) return 0;
  let b = (k.charging ? 1 : 0) | (k.leaping ? 2 : 0) | (k.cling ? 4 : 0) | (k.full ? 8 : 0);
  if (k.cling) b |= (Math.round((Math.atan2(k.clingN.x, k.clingN.z) / TAU) * 64) & 63) << 4;
  return b;
}
function netApply(r, b, dt) {
  const k = K(r), a = r.a, w = W();
  const wasLeap = k.leaping, wasCling = k.cling;
  k.seen = G.time;
  k.charging = !!(b & 1); k.full = !!(b & 8); k.charge = r.charge || 0;
  k.leaping = !!(b & 2);
  k.cling = !!(b & 4); k.hang = false;           // (a remote kid's position is its owner's: nothing to hold here)
  if (k.cling) {
    const ang = (((b >> 4) & 63) / 64) * TAU;
    k.clingN.set(Math.sin(ang), 0, Math.cos(ang));
    k.clingPt.set(a.pos.x - k.clingN.x * PLAYER.radius, a.pos.y + 1.0, a.pos.z - k.clingN.z * PLAYER.radius);
  }
  if (wasLeap && !k.leaping) k.landT = 0; else k.landT += dt;
  if (k.leaping) telegraph(a, k, w, dt);
  if (k.cling !== wasCling && near(a.pos, 30)) G.audio?.play(k.cling ? 'mitts_cling' : 'mitts_unstick', { pos: a.pos, volume: 0.5 });
}
function ghost(a, d) {
  const w = W();
  switch (d[0]) {
    case 0: spawnFist(a, w, d[7] | 0, _v.set(d[1], d[2], d[3]), _dir.set(d[4], d[5], d[6]), true); break;
    case 1: { const at = _v3.set(d[1], d[2], d[3]), n = _v2.set(d[4], d[5], d[6]); landFx(a, at, n, _a.copy(at).addScaledVector(n, 0.35)); break; }
    case 2: leapFx(a, _v3.set(d[1], d[2], d[3]), d[4], d[7] ? _dir.set(d[5], 0, d[6]) : null); break;
  }
}

// ================================================================================================ registration
MAIN_KITS.mitts = {
  netState,
  netApply,
  ghost,
  update,
  jump,
  busy: (r) => !!(r.kit && r.kit.mitts && r.kit.leaping),
  // leap armour: an incoming leap is otherwise picked off before it lands — mid-air (and on the landing beat) the kid
  // takes W().leapArmor of any damage. Sponge guard: punching with the gloves up (and a beat after), a hit from the
  // front (within guardArc° of the facing) takes W().guardArmor — the sponge soaks part of it (a squish off the gloves).
  damageTaken: (r, amount, attacker) => {
    const k = r.kit && r.kit.mitts ? r.kit : null, w = W();
    if (k && (k.leaping || k.landT < (w.leapArmorGrace ?? 0.15))) return amount * (w.leapArmor ?? 0.35);
    const a = r.a;
    if (k && !k.cling && a.form === 'kid' && attacker && attacker !== a && attacker.pos && r.firingT > 0.35 - (w.guardAfter ?? 0.25)) {
      const dx = attacker.pos.x - a.pos.x, dz = attacker.pos.z - a.pos.z, l = Math.hypot(dx, dz);
      if (l > 0.01 && (Math.sin(a.aimYaw) * dx + Math.cos(a.aimYaw) * dz) / l > Math.cos((w.guardArc ?? 70) * DEG)) {
        if (a.isLocal || near(a.pos, 22)) {
          const t = G.time;
          if (!(k.squishT > t - 0.12)) {   // (a spray of hits squishes once)
            k.squishT = t;
            gloveMuzzle(a, k.side, _v2);
            G.fx?.burst(_v2, _v3.set(dx / l, 0.35, dz / l), a.color, { count: 6, speed: 2.4, size: 0.07 });
            G.audio?.play('mitts_pop', { pos: a.isLocal ? undefined : _v2, volume: a.isLocal ? 0.35 : 0.25, pitch: 0.7 });
          }
        }
        return amount * (w.guardArmor ?? 0.65);
      }
    }
    return amount;
  },
  firingPose: (r) => { const k = r.kit && r.kit.mitts ? r.kit : null; return !!k && (k.charging || k.leaping || k.cling || k.landT < 0.35); },
  moveSpeed: (r, w) => {
    const k = r.kit && r.kit.mitts ? r.kit : null;
    if (!k) return 0;
    if (k.leaping) return Math.max(k.leapH, PLAYER.airMinSpeed);
    if (k.charging) return r.a.isBot ? 0.05 : w.moveSpeedCharging;   // bots crouch still (their plan assumes the spot)
    if (k.landT < 0.25) return w.moveSpeedCharging * 2;
    return r.firingT > 0 ? w.moveSpeedFiring : 0;
  },
  spreadDeg: (r, w) => w.punchSpread,
  tick(dt) {
    // states their runner dropped (death, respawn, loadout swap): stop their sounds
    for (const [r, k] of STATES) {
      if (r.kit !== k || !r.a.alive || r.a.weapon?.kind !== 'mitts') { stopLoops(k); k.hang = false; STATES.delete(r); }
    }
    if (prevShown && G.time - prevShown > 0.05) { hidePreview(); prevShown = 0; }
    updateFists(dt);
  },
  clear() {
    for (const f of fists) { f.owner = null; fistPool.push(f); }
    fists.length = 0;
    if (fistMesh) fistMesh.count = 0;
    for (const [, k] of STATES) stopLoops(k);
    STATES.clear();
    hidePreview(); prevShown = 0;
  },
  bot,
};

// test / debug handle (page tests read the tuning + the prediction)
export const MITTS = { predictLeap, leapVelocity, K, fists };
