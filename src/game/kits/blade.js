// Brine Cutlass (kind 'blade') — a sword that swings like a brush, without the rolling: see kits/registry.js.
//   Tap fire   → a quick horizontal cut (alternating right → left / left → right). The blade itself is a hitbox for the
//                sweep (an arc in front, `reach` m) that deals `tapMelee`; the cut flings a wide crescent of droplets
//                forward (one droplet per victim per cut: `tapDamageNear` → `tapDamageFar`).
//   Hold fire  → after the cut, the blade rises and charges (`chargeTime`, glowing hilt → tip, a rising hum); full
//                charge holds as long as the trigger does (and through a quick dive, `chargeStore` s). Release at full
//                → an overhead cut with a short lunge: the blade splats in one hit (`heavyMelee`) and a long straight ink
//                wave flies `waveRange` m, piercing enemies (`waveDamage` → `waveDamageFar`) and painting a stripe.
//                Released early (≥ 30 %) → just a quick cut.
// Runner state lives in runner.kit (see st()); runner.charge mirrors the charge (HUD meter, pose, blade glow) but
// runner.charging stays false: that flag makes the core treat the kid as busy (no diving), and the blade may dive with
// a charge held. World objects (waves, arc trails) are module-owned (tick / clear).
import * as THREE from 'three';
import { G, emit, clamp, lerp, angleDiff } from '../../core/ctx.js';
import { PLAYER, WEAPONS, weaponRange } from '../../config.js';
import { MAIN_KITS, netRec } from './registry.js';
import { MELEE } from '../bots.js';
import { registerWeaponModel } from '../character-weapons.js';
import { Hit } from '../physics.js';
import { WEAPON_ICONS } from '../../ui/ui-icons.js';
import { buildBlade, animateBlade } from './blade-model.js';
import { BladeFX, installBladeSounds, BLADE_ICON } from './blade-fx.js';

const _bossTip = new THREE.Vector3();
const DEG = Math.PI / 180;
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _n = new THREE.Vector3();
const _m = new THREE.Matrix4(), _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3();
const _hit = new Hit(), _hit2 = new Hit();
const DOWN = new THREE.Vector3(0, -1, 0), UP = new THREE.Vector3(0, 1, 0);

// ------------------------------------------------------------------------------------------ registration
registerWeaponModel('blade', buildBlade, animateBlade);
WEAPON_ICONS.blade = BLADE_ICON;
installBladeSounds();
MELEE.blade = true;

// ------------------------------------------------------------------------------------------ runner state
function st(R) {
  return R.kit || (R.kit = {
    held: false, holdT: 0, charge: 0, charging: false, full: false, store: 0,
    cd: 0, queued: 0, side: -1, swing: null, lunge: 0, lx: 0, lz: 0, lv: 0,
    lastT: G.time, flashT: 99, since: 99, taps: 0, heavies: 0,
  });
}
// charge hums are keyed by runner (runner.kit is nulled before reset hooks run, and a loadout swap resets through the
// NEW kind's kit — tick() sweeps any hum whose runner stopped charging a blade)
const HUMS = new Map();
function stopHum(R) { const h = HUMS.get(R); if (h) { h.stop(0.06); HUMS.delete(R); } }
function cancelCharge(R, K) {
  K.charging = false; K.charge = 0; K.full = false; K.store = 0;
  R.charge = 0;
  stopHum(R);
}
const heard = (a) => a.isLocal || a._nearCamera?.();
const sndPos = (a) => (a.isLocal ? undefined : a.pos);
function rumble(a, strong, weak, ms) { if (a && a.isLocal && !a.isBot) G.input?.rumble?.(strong, weak, ms); }
// core bot logic holding the trigger for its own ends (inking a wall to climb, a puddle to refill in): quick cuts
const coreDriven = (a) => !!(a.bot && !a.isLocal && (a.bot._climbAim || a.bot.mode === 'refill'));
// a bot brain that wants to keep holding a charge even though the core cleared its trigger this frame (aim drifted)
const botHolds = (a) => !!(a.bot && a.bot._blHold > G.time - 0.3);

// ------------------------------------------------------------------------------------------ the cuts
// Heading of a cut: toward the crosshair's world point (the camera sits over the shoulder, so its ray and the kid's
// facing differ by a few degrees at mid range), else the aim yaw.
function cutYaw(a) {
  const p = a.aimPoint, dx = p.x - a.pos.x, dz = p.z - a.pos.z;
  if (dx * dx + dz * dz < 4) return a.aimYaw;
  const y = Math.atan2(dx, dz);
  let d = y - a.aimYaw; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
  return Math.abs(d) < 0.35 ? y : a.aimYaw;
}
function tap(R, K, w) {
  const a = R.a;
  if (a.ink < w.tapInk) { R._empty(); K.cd = 0.18; return false; }
  a.ink -= w.tapInk; a.lastFire = 0;
  K.side = -K.side;
  K.cd = w.tapInterval; K.since = 0; K.taps++;
  K.swing = { heavy: false, t: 0, side: K.side, yaw: cutYaw(a), pitch: a.aimPitch, hits: new Set(), fired: false, dev: false, sp: !!a.specialActive };
  R.firingT = 0.4; a.fireFacing = 0.45;
  a.character.trigger('blade_slash', K.side);
  BladeFX.slash(a, K.side, false, 0.1, K.swing.yaw);
  if (heard(a)) G.audio?.play('blade_swish', { pos: sndPos(a), volume: a.isLocal ? 0.55 : 0.42, pitch: K.side > 0 ? 1 : 1.09 });
  if (a.isLocal) emit('recoil', { amount: 0.004 });
  rumble(a, 0.05, 0.12, 45);
  return true;
}
function heavy(R, K, w) {
  const a = R.a;
  a.ink = Math.max(0, a.ink - w.heavyInk); a.lastFire = 0;
  K.cd = w.heavyInterval; K.since = 0; K.flashT = 0; K.heavies++;
  K.swing = { heavy: true, t: 0, side: 1, yaw: cutYaw(a), pitch: a.aimPitch, hits: new Set(), fired: false, dev: false, stroke: false, sp: !!a.specialActive };
  R.firingT = 0.5; a.fireFacing = 0.6;
  // short forward lunge with the cut (grounded; never off into the sea)
  const fx = Math.sin(K.swing.yaw), fz = Math.cos(K.swing.yaw);
  K.lunge = 0;
  if (a.grounded && lungeSafe(a, fx, fz, w.lungeDist)) { K.lunge = w.lungeTime; K.lx = fx; K.lz = fz; K.lv = w.lungeDist / (w.lungeTime * 0.75); }
  a.character.trigger('blade_heavy');
  BladeFX.slash(a, 1, true, 0.12, K.swing.yaw);
  if (heard(a)) G.audio?.play('blade_heavy', { pos: sndPos(a), volume: a.isLocal ? 0.7 : 0.55 });
  if (a.isLocal) { emit('recoil', { amount: 0.012 }); emit('shake', { amount: 0.1 }); }
  rumble(a, 0.25, 0.3, 120);
}
function lungeSafe(a, fx, fz, d) {
  const L = G.level; if (!L) return false;
  for (const k of [0.5, 1, 1.4]) {
    const gy = L.groundHeight(a.pos.x + fx * d * k, a.pos.z + fz * d * k, a.pos.y + 0.6);
    if (!(gy > PLAYER.waterY + 0.25)) return false;             // sea / void ahead
    if (a.bot && !a.isLocal && gy < a.pos.y - 1.6) return false;  // bots don't lunge off ledges
  }
  return true;
}

// the swing in progress: ink leaves the blade, the blade itself hits, the lunge carries the kid forward
function runSwing(R, K, dt, w) {
  const S = K.swing, a = R.a;
  S.t += dt;
  if (!S.fired && S.t >= (S.heavy ? 0.05 : 0.028)) { S.fired = true; if (S.heavy) spawnWave(a, w, S); else fireDrops(a, w, S); }
  if (S.heavy && !S.stroke && S.t >= 0.075) { S.stroke = true; groundStroke(a, w, S); }
  const t0 = 0.01, t1 = S.heavy ? 0.16 : 0.12;
  if (S.t >= t0 && S.t - dt <= t1) melee(a, w, S);
  if (K.lunge > 0) {
    K.lunge -= dt;
    const k = K.lunge > 0 ? 1 : 0;
    if (k && a.alive) { const v = K.lv * (0.55 + 0.45 * Math.min(1, K.lunge / (w.lungeTime * 0.5))); a.vel.x = K.lx * v; a.vel.z = K.lz * v; }
  }
  if (S.t > 0.4) K.swing = null;
}

// Quick cut: a crescent of droplets flung across the front along the sweep (the centre ones fastest, so the sheet
// bows forward), leaving from the blade's path in sweep order. Aiming steeply down throws them at your feet.
function fireDrops(a, w, S) {
  const P = G.projectiles; if (!P) return;
  const yaw = S.yaw, side = S.side;
  const pitch = a.aimPitch;
  const steep = pitch < -0.55;
  const up = steep ? pitch * 0.85 : clamp(pitch, -0.4, 0.45) * 0.75 + 0.06;
  const vol = { hit: new Set() };
  const N = w.tapDrops, A = w.tapSpreadDeg * DEG;
  const col = G.teamColors[a.team] || a.color;
  for (let i = 0; i < N; i++) {
    const t = N > 1 ? i / (N - 1) : 0.5;
    const off = side * (t - 0.5) * A;                         // side +1 sweeps the kid's right → left
    const ang = yaw + off, ox = Math.sin(ang), oz = Math.cos(ang);
    const mid = 1 - Math.abs(t - 0.5) * 2;
    const sp = w.tapSpeed * (0.8 + 0.24 * mid) * (0.95 + Math.random() * 0.1) * (steep ? 0.45 : 1);
    const p = P._new();
    Object.assign(p, {
      type: 'drop', owner: a, team: a.team, age: 0, life: 1.2, straight: steep ? 0 : w.tapStraight,
      radius: w.tapDropRadius * (0.85 + Math.random() * 0.3), damage: w.tapDamageNear, dmgFar: w.tapDamageFar,
      size: 0.13, trail: -0.2, trailEvery: 1.25, trailRadius: 0.3, grav: 24, drag: 0.5, seed: Math.random(), volley: vol, weaponId: 'blade',
      delay: t * 0.018, sp: S.sp,
      vis: 0.044 + 0.03 * mid + Math.random() * 0.01, tail0: 0.8, tailK: 1.7, wob: 0.07, wobF: 22, nose: 0.15, sats: 1,
    });
    // leaves from the blade's path: a diagonal cut (high at the start, low at the end) — never from inside a wall the
    // kid is hugging (then it leaves from the body and splats on the wall)
    const r = steep ? 0.55 : 0.8;
    p.pos.set(a.pos.x + ox * r, a.pos.y + (steep ? 0.7 : 0.98) + (0.5 - t) * 0.12, a.pos.z + oz * r);
    _v3.set(a.pos.x, p.pos.y, a.pos.z);
    if (!G.physics.los(_v3, p.pos)) p.pos.copy(_v3).addScaledVector(_v.set(ox, 0, oz), 0.12);
    p.prev.copy(p.pos); p.start.copy(p.pos);
    const cu = Math.cos(up + (Math.random() - 0.5) * 0.05);
    // outward, with a little of the sweep's own motion
    const tx = -oz * side, tz = ox * side;
    const hx = ox + tx * 0.12, hz = oz + tz * 0.12, hl = Math.hypot(hx, hz);
    p.vel.set((hx / hl) * cu * sp, Math.sin(up) * sp, (hz / hl) * cu * sp);
    P._push(p);
  }
  // a fine spray off the edge (FX only)
  if (G.fx && heard(a)) {
    for (let i = 0; i < 6; i++) {
      const off = side * (Math.random() - 0.5) * A * 1.1, ang = yaw + off;
      _v.set(a.pos.x + Math.sin(ang) * 0.9, a.pos.y + 0.98, a.pos.z + Math.cos(ang) * 0.9);
      _v2.set(Math.sin(ang) * (4 + Math.random() * 4), 1 + Math.random() * 2, Math.cos(ang) * (4 + Math.random() * 4));
      G.fx.drop(_v, _v2, col, { size: 0.035 + Math.random() * 0.03, life: 0.6 });
    }
  }
  emit('weapon:fire', { actor: a, weapon: w.id, cut: 'quick', muzzle: new THREE.Vector3(a.pos.x + Math.sin(yaw) * 0.8, a.pos.y + 0.98, a.pos.z + Math.cos(yaw) * 0.8), dir: new THREE.Vector3(Math.sin(yaw), Math.sin(up), Math.cos(yaw)).normalize() });
}

// the blade meets the ground in front at the bottom of the overhead cut: a stroke of ink (cuts through enemy ink)
function groundStroke(a, w, S) {
  const fx = Math.sin(S.yaw), fz = Math.cos(S.yaw);
  _n.set(fx, 0, fz);
  let area = 0;
  for (const d of [0.75, 1.35]) {
    _v.set(a.pos.x + fx * d, a.pos.y + 0.8, a.pos.z + fz * d);
    const g = G.physics.raycast(_v, DOWN, 2.2, _hit2, true);
    if (!g.hit) continue;
    _v2.copy(g.point).addScaledVector(g.normal, 0.08);
    area += G.paint.splat(_v2, w.strokeRadius, a.team, { seed: Math.random(), stretch: _n, stretchAmt: 0.9 });
    if (d > 1 && heard(a)) G.fx?.burst(g.point, g.normal, G.teamColors[a.team] || a.color, { count: 10, speed: 3.5, size: 0.08 });
  }
  credit(a, area, S.sp);
}
function credit(a, area, sp) { if (area > 0) { if (sp) a.addTurfNoSpecial(area); else a.addTurf(area); } }

// The blade as a hitbox: every enemy inside the arc in front (reach + their body radius, the swing's vertical window,
// nothing through walls) takes the cut's melee damage once per swing. Shields / curtains in between take it instead.
function melee(a, w, S) {
  const reach = w.reach, half = (S.heavy ? w.heavyArcDeg : w.meleeArcDeg) * DEG * 0.5;
  const fx = Math.sin(S.yaw), fz = Math.cos(S.yaw);
  const dmg = S.heavy ? w.heavyMelee : w.tapMelee;
  _v3.set(a.pos.x, a.pos.y + 1.0, a.pos.z);
  for (const e of G.actors) {
    if (e === a || e.team === a.team || !e.alive || S.hits.has(e)) continue;
    const hr = e.hitR || PLAYER.radius, h = e.hitH || (e.form === 'squid' ? PLAYER.squidHeight : PLAYER.height);
    const dx = e.pos.x - a.pos.x, dz = e.pos.z - a.pos.z, d = Math.hypot(dx, dz);
    if (d > reach + hr) continue;
    const ey = e.pos.y + (e.smoothY || 0) - a.pos.y;
    if (ey > (S.heavy ? 1.9 : 1.55) || ey + h < (S.heavy ? -0.9 : -0.35)) continue;
    const fwd = dx * fx + dz * fz, lat = Math.abs(dx * fz - dz * fx);
    const ang = Math.atan2(lat, fwd);
    if (ang > half && !(d < hr + 0.4 && fwd > -0.15)) continue;
    _v.set(e.pos.x, e.pos.y + (e.smoothY || 0) + Math.min(h * 0.6, 0.85), e.pos.z);
    if (!G.physics.los(_v3, _v)) continue;
    S.hits.add(e);
    if (G.subs?.blockShot(_v3, _v, a.team, dmg)) { if (heard(a)) G.audio?.play('blade_hit', { pos: _v, volume: 0.4, pitch: 1.4 }); continue; }
    G.projectiles.applyHit(a, e, dmg, 'blade');
    // contact: where the edge meets the body
    _v2.copy(_v).sub(_v3); const l = _v2.length() || 1; _v2.multiplyScalar(1 / l);
    _v.copy(_v3).addScaledVector(_v2, Math.max(0.2, l - hr));
    if (heard(a) || e.isLocal) {
      const col = G.teamColors[a.team] || a.color;
      G.fx?.burst(_v, _v2.negate(), col, { count: S.heavy ? 18 : 10, speed: S.heavy ? 6 : 4, size: 0.09, mist: true });
      G.audio?.play('blade_hit', { pos: a.isLocal ? undefined : _v, volume: a.isLocal ? 0.6 : 0.5, pitch: S.heavy ? 0.78 : 1 });
    }
    if (a.isLocal) emit('shake', { amount: S.heavy ? 0.22 : 0.06 });
    rumble(a, S.heavy ? 0.4 : 0.15, S.heavy ? 0.45 : 0.2, S.heavy ? 140 : 60);
    emit('blade:hit', { actor: a, victim: e, damage: dmg, heavy: S.heavy });
  }
  // Boss Battle: the edge meets HULLBREAKER (or a crablet) along the swing's centre line — once per swing
  if (G.boss && !S.hits.has(G.boss)) {
    const bh = G.boss.segHit(_v3, _bossTip.set(_v3.x + fx * reach, _v3.y, _v3.z + fz * reach), 0.55);
    if (bh) { S.hits.add(G.boss); G.boss.hit(a, dmg, bh.target, 'blade', bh.point.clone()); }
  }
  // devices in reach (sprinklers, beacons, curtains) and bubbles: the blade cuts them too — once per swing
  if (!S.dev) {
    S.dev = true;
    _v.set(a.pos.x + fx * reach * 0.6, a.pos.y + 0.8, a.pos.z + fz * reach * 0.6);
    G.subs?.damageArea?.(_v, reach * 0.75, dmg * 0.6, a.team);
  }
}

// ------------------------------------------------------------------------------------------ the ink wave
const WAVES = [];
const r2 = (x) => Math.round(x * 100) / 100, r3 = (x) => Math.round(x * 1000) / 1000;
function spawnWave(a, w, S) {
  const pitch = Math.abs(S.pitch) < 0.3 ? S.pitch * 0.4 : clamp(S.pitch, -0.45, 0.35);
  const cp = Math.cos(pitch);
  const dir = new THREE.Vector3(Math.sin(S.yaw) * cp, Math.sin(pitch), Math.cos(S.yaw) * cp);
  const pos = new THREE.Vector3(a.pos.x + Math.sin(S.yaw) * 0.55, a.pos.y + w.waveHeight * 0.52, a.pos.z + Math.cos(S.yaw) * 0.55);
  // starting inside a wall (hugging cover): the wave is born where the wall is and bursts there
  _v.set(a.pos.x, pos.y, a.pos.z);
  if (!G.physics.los(_v, pos)) pos.copy(_v);
  addWave(a, w, pos, dir, S.sp, false);
  netRec(a, 'blade', [r2(pos.x), r2(pos.y), r2(pos.z), r3(dir.x), r3(dir.y), r3(dir.z)]);
  emit('weapon:fire', { actor: a, weapon: w.id, cut: 'charged', muzzle: pos.clone(), dir: dir.clone() });
}
// ghost: a remote player's wave (online) — it rolls, cuts and bursts for the eye only (the owner's hits + splats arrive
// apart)
function addWave(a, w, pos, dir, sp, ghost) {
  const col = (G.teamColors[a.team] || a.color).clone();
  const W = { owner: a, team: a.team, pos: pos.clone(), prev: pos.clone(), dir: dir.clone(), dist: 0, t: 0, hits: new Set(), paintAcc: 0.3, dying: -1, sp, col, fx: BladeFX.waveMesh(col), w, ghost };
  WAVES.push(W);
  if (ghost && a._nearCamera?.()) G.audio?.play('blade_heavy', { pos, volume: 0.5 });   // (the remote cut's sound)
}
function ghost(a, d) {
  if (!Array.isArray(d)) return;
  addWave(a, WEAPONS.blade, _gp.set(d[0], d[1], d[2]), _gd.set(d[3], d[4], d[5]).normalize(), false, true);
}
const _gp = new THREE.Vector3(), _gd = new THREE.Vector3();
function endWave(W, at, normal) {
  W.dying = 0.14;
  const col = W.col;
  if (at) {
    const area = G.paint.splat(_v.copy(at).addScaledVector(normal, 0.1), W.w.waveEndRadius, W.team, { seed: Math.random() });
    credit(W.owner, area, W.sp);
    emit('weapon:impact', { pos: at.clone(), normal: normal.clone(), team: W.team, kind: 'drop', radius: W.w.waveEndRadius });
    if (G.camera && G.camera.position.distanceToSquared(at) < 30 * 30) {
      G.fx?.burst(at, normal, col, { count: 16, speed: 5, size: 0.1, mist: true });
      G.audio?.play('splat_big', { pos: at, volume: 0.5 });
    }
  } else {
    // spent: the wave slumps into a spatter of drops that paint where they land
    const g = G.physics.raycast(W.pos, DOWN, 3, _hit2, true);
    if (g.hit) credit(W.owner, G.paint.splat(_v.copy(g.point).addScaledVector(g.normal, 0.1), W.w.waveEndRadius * 0.85, W.team, { seed: Math.random(), stretch: _n.set(W.dir.x, 0, W.dir.z).normalize(), stretchAmt: 0.6 }), W.sp);
    if (G.fx && G.camera && G.camera.position.distanceToSquared(W.pos) < 30 * 30) {
      for (let i = 0; i < 8; i++) {
        _v.copy(W.pos); _v.y += (Math.random() - 0.5) * 1.2;
        _v2.copy(W.dir).multiplyScalar(3 + Math.random() * 3); _v2.y = Math.random() * 1.5;
        G.fx.drop(_v, _v2, col, { size: 0.05 + Math.random() * 0.04, life: 0.8, paint: false });
      }
    }
  }
}
function updateWaves(dt) {
  const nm = G.netm;
  for (let i = WAVES.length - 1; i >= 0; i--) {
    const W = WAVES[i], g = W.ghost && nm;   // (a ghost wave's splats are its owner's to send)
    if (g) nm.mute++;
    try { stepWave(W, i, dt); } finally { if (g) nm.mute--; }
  }
}
function stepWave(W, i, dt) {
  {
    const w = W.w;
    W.t += dt;
    if (W.dying >= 0) {
      W.dying -= dt;
      if (W.fx) W.fx.mesh.material.uniforms.uFade.value = Math.max(0, W.dying / 0.14);
      if (W.dying <= 0) { BladeFX.freeWave(W.fx); WAVES.splice(i, 1); }
      else placeWave(W);
      return;
    }
    const step = w.waveSpeed * dt;
    W.prev.copy(W.pos);
    W.pos.addScaledVector(W.dir, step);
    W.dist += step;
    // enemies inside the crescent's sweep (a tall, narrow slab moving along dir); each is hit once
    const hx = W.dir.x, hz = W.dir.z, hl = Math.hypot(hx, hz) || 1, ux = hx / hl, uz = hz / hl;
    const dmg = lerp(w.waveDamage, w.waveDamageFar, clamp(W.dist / w.waveRange, 0, 1));
    for (const e of G.actors) {
      if (e.team === W.team || !e.alive || W.hits.has(e)) continue;
      const hr = e.hitR || PLAYER.radius, h = e.hitH || (e.form === 'squid' ? PLAYER.squidHeight : PLAYER.height);
      const ex = e.pos.x - W.prev.x, ez = e.pos.z - W.prev.z;
      const along = ex * ux + ez * uz;
      if (along < -hr || along > step * hl + hr) continue;
      if (Math.abs(ex * uz - ez * ux) > w.waveWidth * 0.5 + hr) continue;
      const cy = W.prev.y + (W.pos.y - W.prev.y) * clamp(along / Math.max(1e-4, step * hl), 0, 1);
      const y0 = e.pos.y + (e.smoothY || 0);
      if (y0 + h < cy - w.waveHeight * 0.55 || y0 > cy + w.waveHeight * 0.45) continue;
      W.hits.add(e);
      if (!W.ghost) G.projectiles.applyHit(W.owner, e, dmg, 'blade');
      if (G.camera && G.camera.position.distanceToSquared(e.pos) < 30 * 30) {
        _v.set(e.pos.x, y0 + Math.min(h * 0.6, 0.9), e.pos.z);
        G.fx?.burst(_v, _v2.copy(W.dir).negate(), W.col, { count: 12, speed: 4.5, size: 0.09 });
      }
    }
    // Boss Battle: the crescent cuts HULLBREAKER / a crablet once on its way through
    if (G.boss && !W.hits.has(G.boss)) {
      const bh = G.boss.segHit(W.prev, W.pos, w.waveWidth * 0.5);
      if (bh) { W.hits.add(G.boss); G.boss.hit(W.owner, dmg, bh.target, 'blade', bh.point.clone()); }
    }
    // shields, curtains, devices and bubbles catch it; walls break it
    let stop = false;
    const bd = W.ghost ? 0 : dmg;
    if (G.subs?.blockShot(W.prev, W.pos, W.team, bd) || G.specials?.shotHit(W.prev, W.pos, W.team, bd, W.owner)) { endWave(W, W.pos.clone(), _n.copy(W.dir).negate()); stop = true; }
    if (!stop) {
      const hit = G.physics.segment(W.prev, W.pos, _hit, true);
      if (hit.hit) { W.pos.copy(hit.point); endWave(W, hit.point, hit.normal); stop = true; }
    }
    // a straight stripe of ink along its path
    W.paintAcc += step;
    if (!stop && W.paintAcc >= w.wavePaintEvery) {
      W.paintAcc = 0;
      const g = G.physics.raycast(W.pos, DOWN, w.waveHeight * 0.52 + 1.4, _hit2, true);
      if (g.hit) {
        _n.set(ux, 0, uz);
        const area = G.paint.splat(_v.copy(g.point).addScaledVector(g.normal, 0.08), w.wavePaintRadius * (0.9 + Math.random() * 0.2), W.team, { seed: Math.random(), stretch: _n, stretchAmt: 0.85 });
        credit(W.owner, area, W.sp);
      }
    }
    if (!stop && W.dist >= w.waveRange) { endWave(W, null, null); stop = true; }
    // spray off the crescent (FX)
    if (!stop && G.fx && Math.random() < 0.6 && G.camera && G.camera.position.distanceToSquared(W.pos) < 28 * 28) {
      _v.copy(W.pos); _v.y += (Math.random() - 0.5) * w.waveHeight * 0.8;
      _v2.set(W.dir.x * w.waveSpeed * 0.25 + (Math.random() - 0.5) * 2, 0.5 + Math.random(), W.dir.z * w.waveSpeed * 0.25 + (Math.random() - 0.5) * 2);
      G.fx.drop(_v, _v2, W.col, { size: 0.035 + Math.random() * 0.03, life: 0.5 });
    }
    placeWave(W);
  }
}
function placeWave(W) {
  if (!W.fx) return;
  const m = W.fx.mesh, w = W.w;
  _z.copy(W.dir).normalize();
  _x.crossVectors(UP, _z); if (_x.lengthSq() < 1e-6) _x.set(1, 0, 0); _x.normalize();
  _y.crossVectors(_z, _x).normalize();
  _m.makeBasis(_x, _y, _z);
  m.quaternion.setFromRotationMatrix(_m);
  m.position.copy(W.pos);
  const grow = Math.min(1, 0.55 + W.t * 6);
  m.scale.set(w.waveWidth * 1.45 * grow, w.waveHeight * 0.5 * grow, 1.0 + Math.min(1, W.dist / 4) * 0.9);
  m.material.uniforms.uT.value = W.t;
}

// ------------------------------------------------------------------------------------------ bots
// A Cutlass bot fights like an aggressive human swordsman. bot.tactics (botTactics) runs every fight frame, aimed or
// not, after bots.js's defaults (and in its retreat, ctx.retreat), and owns the trigger (tap / hold / release), the
// swim and the footwork. Bot enemies see every kid in line of sight, so a head-on walk into a shooter is a lost duel:
// the sword's kills are the enemy busy with someone else, the corner and the ink.
//   · targets (targetBias): an enemy busy with a teammate before a ranged one that has us spotted from range
//   · closing in: swim wherever own ink runs toward the target (a steady, unseen swim if it hasn't spotted us);
//     a busy / unaware target: run in and pre-charge from ~5–8 m so the charge fills on arrival — then cut the moment
//     it's in blade + lunge reach (the lunge closes the last metre); a ranged target that has us spotted: wait under
//     in our ink for it to look away, or charge from beyond the droplets' reach (arcing out of its line, behind cover
//     if there's any) and poke with the wave, then rush the stripe it paints; inside ~6.5 m: quick cuts as we close
//   · a full charge with a lane ahead: dive and carry it in a swim (hard bots mostly), surface in reach and cut
//   · up close: a quick-cut combo (two splat), circling them
//   · no dodge-hop on every hit; hurt: slip out of a shooter's line in our ink; at blade range, finish the fight
//     (stayIn) instead of turning away; falling back: swim where the way back is ours, run where it isn't
// SKILL (per difficulty) scales the flank / cover / lurk / dive use, the strafe and the timing.
const SKILL = { easy: 0.35, normal: 0.7, hard: 1 };
const DIVE = { easy: 0, normal: 0.6, hard: 0.9 };          // chance a full charge is carried in a swim (lane permitting)
const _rs = { own: 0, enemy: 0, empty: 0, n: 0 };
function botState(brain) {
  return brain._bl || (brain._bl = {
    press: false, hold: 0, full: 0, dive: 0, dove: 0, diveOK: false, rush: 0, waveT: 3, side: Math.random() < 0.5 ? -1 : 1,
    sideT: 0, flankT: 0, flank: null, coverT: 0, cover: null, laneT: 0, lane: false, walkT: 0, walk: false, patience: 1,
    target: null, lastD: 0, closeV: 0, square: 0, lurk: 0,
  });
}
// own ink along the line (nx, nz) from the kid, as far as d m ahead: a swim lane
function ownLane(a, nx, nz, d) {
  for (const k of [1.2, 2.6, 4.2]) {
    if (k > 1.2 && k > d - 0.6) break;
    const s = G.paint.regionStats(a.pos.x + nx * k, a.pos.y, a.pos.z + nz * k, 0.8, a.team, _rs);
    if (!s.n || s.own < 0.5) return false;
  }
  return true;
}
// can the kid walk len m along (ux, uz): no wall at knee height, no water, no drop off a ledge
function walkable(brain, a, ux, uz, len) {
  const x1 = a.pos.x + ux * len, z1 = a.pos.z + uz * len;
  if (!brain._fatLos(a.pos.x, a.pos.y, a.pos.z, x1, a.pos.y, z1)) return false;
  if (!brain._dryLine(a.pos.x, a.pos.y, a.pos.z, x1, z1)) return false;
  return G.level.groundHeight(x1, z1, a.pos.y + 0.6) > a.pos.y - 1.4;
}
// heading along the bot's nav path (its look-ahead waypoint); null without one
function pathDir(brain, a) {
  const p = brain.path; if (!p || brain.pi >= p.length) return null;
  const i = brain._laPath === p && brain._laTi >= brain.pi && brain._laTi < p.length ? brain._laTi : brain.pi;
  const n = G.nav.nodes[p[i]], dx = n.x - a.pos.x, dz = n.z - a.pos.z, l = Math.hypot(dx, dz);
  return l > 0.05 ? [dx / l, dz / l] : null;
}
// a spot 1.6–3.2 m away, level with us and reachable on foot, that the target can't see: charge behind it
function coverSpot(brain, a, t, dist) {
  _v3.set(t.pos.x, t.pos.y + 1.3, t.pos.z);
  let best = null, bs = -Infinity;
  const base = Math.random() * Math.PI * 2;
  for (let i = 0; i < 10; i++) {
    const ang = base + (i / 10) * Math.PI * 2, r = i % 2 ? 1.6 : 3.2, ux = Math.sin(ang), uz = Math.cos(ang);
    const x = a.pos.x + ux * r, z = a.pos.z + uz * r, gy = G.level.groundHeight(x, z, a.pos.y + 0.6);
    if (!(Math.abs(gy - a.pos.y) < 0.5)) continue;
    const dT = Math.hypot(t.pos.x - x, t.pos.z - z);
    if (dT > dist + 1.5 || dT < 3) continue;                                    // not a retreat, not into their face
    if (G.physics.los(_v3, _v2.set(x, gy + 1.0, z))) continue;                  // they'd still see us there
    if (!walkable(brain, a, ux, uz, r)) continue;
    const sc = -(dT - dist) * 0.6 - r * 0.3;
    if (sc > bs) { bs = sc; best = { x, z }; }
  }
  return best;
}

function botTactics(brain, ctx) {
  const { a, w, dist, dt, it, move, target: t } = ctx;
  const K = a.weaponRunner.kit;
  const B = botState(brain), sk = SKILL[brain.diff?.id] ?? 0.7;
  if (B.target !== t) { B.target = t; B.rush = 0; B.cover = null; B.coverT = 0; B.flank = null; B.flankT = 0; B.patience = lerp(1.3, 0.5, sk) + Math.random() * 0.5; B.lastD = dist; B.closeV = 0; }
  const charging = !!(K && K.charging), full = !!(K && K.full);
  B.sideT -= dt; B.rush -= dt; B.coverT -= dt; B.flankT -= dt; B.laneT -= dt; B.walkT -= dt;
  if (charging && B.hold === 0) B.diveOK = Math.random() < (DIVE[brain.diff?.id] ?? 0.6);   // decided once per charge
  B.hold = charging ? B.hold + dt : 0;
  B.full = full ? B.full + dt : 0;
  if (!charging) { B.dive = 0; B.dove = 0; B.square = 0; }
  B.closeV += ((B.lastD - dist) / Math.max(dt, 1e-3) - B.closeV) * (1 - Math.exp(-5 * dt)); B.lastD = dist;   // closing speed
  // --- geometry
  const dx = t.pos.x - a.pos.x, dz = t.pos.z - a.pos.z, dy = t.pos.y + (t.smoothY || 0) - a.pos.y;
  const nx = dx / Math.max(dist, 0.01), nz = dz / Math.max(dist, 0.01);
  const pd = Math.hypot(dx + t.vel.x * 0.1, dz + t.vel.z * 0.1);               // where they'll be as the blade lands
  const hitR = t.hitR || PLAYER.radius;
  const level = dy < 1.5 && dy > -1.1;                                            // inside the blade's vertical window
  const aimOff = Math.abs(angleDiff(a.aimYaw, Math.atan2(dx, dz)));
  // does the target (a bot) have us spotted? A swimmer it hasn't spotted stays unseen if it keeps under ~7 m/s
  const spotted = !t.bot || (t.bot.target === a && t.bot.seeTimer > 0);
  // their sights: looking our way (a bot that has us spotted: a wider cone), and do they outrange us?
  const tw = t.weapon, ranged = !!tw && !MELEE[tw.kind] && weaponRange(tw) > w.range + 1;
  const facing = -(Math.sin(t.aimYaw) * nx + Math.cos(t.aimYaw) * nz);
  const sighted = ctx.visible && facing > (t.bot && spotted ? 0.6 : 0.85);
  const exposed = sighted && ranged;
  const lane = () => {
    if (B.laneT <= 0) { B.laneT = 0.15; B.lane = a.groundTeam === 1 && ownLane(a, nx, nz, dist); }
    return B.lane;
  };
  const kidOK = a.form !== 'squid' && (a.kidT ?? 9) >= PLAYER.emergeDelay + 0.02;   // fully out of the ink (can cut)
  if (ctx.retreat) {
    // falling back to heal (bots.js retreat path): cornered at blade range → cut; else swim where the way back is our
    // ink (fast, and out of sight), run where it isn't (a squid on dry ground crawls); a charge in hand is kept
    const reach = w.reach + hitR + (a.grounded ? w.lungeDist * 0.6 : 0);
    if (full && kidOK && level && pd <= reach && aimOff < 0.4) { it.fire = false; brain._blHold = -1; it.squid = false; return; }
    if (!charging && dist < 2.3 && level && ctx.visible && aimOff < 0.75 && a.ink >= w.tapInk) { it.squid = false; it.fire = (B.press = !B.press); brain._blHold = -1; return; }
    const ml = Math.hypot(move.x, move.z);
    it.squid = a.groundTeam === 1 && (ml < 0.1 || ownLane(a, move.x / ml, move.z / ml, 2.4));
    it.fire = charging; brain._blHold = charging ? G.time : -1;
    return;
  }
  // footwork toward them: the nav path (straight when the way is open and short), arcing out of a ranged enemy's
  // sightline on the side we're already on. null: no path and not close — leave the core's move alone (a Zone Control
  // guard holding its ground, a replan pending)
  const approach = () => {
    let ux = nx, uz = nz;
    const pdir = pathDir(brain, a);
    if (!pdir && dist > 7) return null;
    if (pdir) {
      if (dist < 6 && ctx.visible) { if (B.walkT <= 0) { B.walkT = 0.12; B.walk = walkable(brain, a, nx, nz, Math.min(dist - 0.8, 3)); } }
      else B.walk = false;
      if (!B.walk) { ux = pdir[0]; uz = pdir[1]; }
    }
    if (exposed && dist > 3.2 && sk >= 0.5) {
      if (B.flankT <= 0) {
        B.flankT = 0.2; B.flank = null;
        // turn the heading off the line to them by up to ~30–50° (skill), toward the side away from their aim: a
        // spiral in (a turning tracker keeps us sighted, so the arc keeps going) — tighter if a wall / the sea is there
        const fx = Math.sin(t.aimYaw), fz = Math.cos(t.aimYaw);
        const f = fx * -nz + fz * nx;                                            // their aim across the line to us
        const s = Math.abs(f) < 0.05 ? B.side : f > 0 ? -1 : 1;
        const th0 = lerp(0.35, 0.9, sk);
        for (const k of [1, 0.6, 0.3]) {
          const th = -th0 * k * s, c = Math.cos(th), sn = Math.sin(th);          // s = +1: toward (-nz, nx)
          const mx = ux * c + uz * sn, mz = -ux * sn + uz * c;
          if (walkable(brain, a, mx, mz, 2.2)) { B.flank = [mx, mz]; break; }
        }
      }
      if (B.flank) { ux = B.flank[0]; uz = B.flank[1]; }
    }
    return [ux, uz];
  };
  let fire = false, hold = false, squid = false, mv = null;

  if ((brain.blockT || 0) > 0.15) {
    // an enemy canopy in the way: bots.js flanks round it (_shieldFight); keep a charge for the opening, no cuts into it
    it.fire = charging; brain._blHold = charging ? G.time : -1; it.squid = false;
    if (it.jump && !(a.hp < 45 && !charging)) it.jump = false;
    return;
  }
  if (charging) {
    // ================= holding a charge
    hold = true;
    // (released during the pop-out the charge would be lost: kidOK — the kid must be fully out of the ink)
    const sees = ctx.visible || dist < 2.2;
    const near = full && pd < 3.4;
    const cutR = w.reach + hitR - 0.05 + (near && a.grounded && lungeSafe(a, nx, nz, w.lungeDist) ? w.lungeDist * 0.7 : 0);
    const eta = (pd - cutR) / w.moveSpeedCharging;                               // walking in with it held
    if (full && kidOK && level && sees && pd <= cutR && aimOff < 0.32) {
      hold = false; mv = [nx, nz];                                                // in blade + lunge reach: cut
    } else if (full && kidOK && B.dove === 0 && B.diveOK && pd > cutR + 1.4 && dist < 10 && level && lane() && walkable(brain, a, nx, nz, Math.min(dist - 1, 4))) {
      B.dove = 1; B.dive = 0;                                                     // dive with the charge stored
    } else if (full && kidOK && sees && dist > cutR + 0.4 && dist < w.waveRange * 0.9
      && ((exposed && dist > 4.2) || !level || (B.full > B.patience && eta > 0.5 && B.closeV < 1.5) || (a.hp < 40 && dist > 4))) {
      // poke with the wave (then rush the stripe it paints): square up first — the wave is narrow, the arc skews the aim
      B.square += dt;
      if (aimOff < Math.atan2(0.45, dist) || B.square > 0.45) { hold = false; B.rush = 1.5; B.square = 0; }
      mv = [nx * 0.3, nz * 0.3];
    } else if (B.hold > 3.2 || (!full && dist < w.reach + hitR && K.charge < 0.65)) {
      hold = false;                                                               // never got there / they rushed us
    }
    if (hold && B.dove === 1) {
      // swimming in with the charge: surface short of reach (the pop-out takes a moment), or before the store runs out
      B.dive += dt;
      squid = B.dive < 0.8 && pd > cutR + 0.9 && lane();
      if (!squid) B.dove = 2;
      mv = [nx, nz];
    } else if (hold) {
      // walking in with the charge: charge behind cover while they have us in their sights
      if (!full && exposed && sk >= 0.5 && dist > 4.5) {
        if (B.coverT <= 0) { B.coverT = 0.6; B.cover = Math.random() < sk ? coverSpot(brain, a, t, dist) : null; }
        if (B.cover) { const cx = B.cover.x - a.pos.x, cz = B.cover.z - a.pos.z, cl = Math.hypot(cx, cz); mv = cl > 0.4 ? [cx / cl, cz / cl] : [0, 0]; }
      }
      if (!mv) mv = approach();
    }
  } else if (dist <= 3.1 && level) {
    // ================= up close: a quick-cut combo, circling them (the blade's arc is ±75°: no need for a fine aim;
    // the circle is slow enough, ~2 rad/s, that our own aim keeps them in front)
    fire = ctx.visible && brain.react <= 0 && aimOff < 0.75 && a.ink >= w.tapInk && (B.press = !B.press);
    if (B.sideT <= 0) {
      B.sideT = lerp(1.0, 0.45, sk) + Math.random() * 0.5;
      if (Math.random() < 0.55) B.side = -B.side;
      if (!walkable(brain, a, -nz * B.side, nx * B.side, 1.2)) B.side = -B.side;
    }
    const rad = clamp((dist - 1.45) * 1.3, -0.6, 0.9), amp = lerp(0.3, 0.55, sk);
    mv = [-nz * B.side * amp + nx * rad, nx * B.side * amp + nz * rad];
  } else if (a.hp < 50 && t.hp > 40 && exposed && dist > 5 && sk >= 0.5 && brain._pickRetreat) {
    // ================= hurt, and a ranged enemy has us spotted out of reach: fall back to heal in our ink (the core's
    // retreat: own ink away from it, out of its line; ctx.retreat runs it) instead of walking into its fire
    brain.mode = 'retreat'; brain.retreatT = 1.6 + Math.random() * 1.2; brain.repath = 0; brain._pickRetreat();
    squid = a.groundTeam === 1;
  } else {
    // ================= closing in without a charge: swim the lane if there is one (straight down it after a wave);
    // a target busy with someone else: run in and pre-charge from ~5–8 m (it fills as we arrive: a one-shot surprise);
    // a ranged one that has us spotted: charge for the wave poke from beyond the droplets' reach (or wait in our ink
    // for it to look away); inside the droplets' reach: quick cuts as we close (damage now, and a painted path)
    const busyHeavy = !!(K && K.swing && K.swing.heavy);
    mv = B.rush > 0 && (busyHeavy || lane()) ? [nx, nz] : approach();
    const canCharge = B.rush <= 0 && !busyHeavy && brain.react <= 0 && a.ink >= w.heavyInk + 2;
    const surprise = w.reach + hitR + w.lungeDist * 0.7 + (w.chargeDelay + w.chargeTime) * w.moveSpeedCharging;   // ≈ 6 m
    if (lane() && dist > 3.4) {
      squid = true;
      if (!spotted && dist < 10 && mv) mv = [mv[0] * 0.55, mv[1] * 0.55];            // unspotted: a steady swim stays unseen
    } else if (exposed && sk >= 0.5 && a.groundTeam === 1 && dist > 5 && B.rush <= 0 && B.lurk < lerp(0.8, 1.6, sk)) {
      // a ranged enemy has us in its sights and there's no lane to it: stay under in our ink until it looks away
      // (it loses a still swimmer), rather than charging in the open
      squid = true; B.lurk += dt; mv = [0, 0]; brain.noProg = 0;
    } else if (canCharge && (exposed ? dist > w.range && dist < 12 : dist > surprise - 0.8 && dist < surprise + 2)) {
      hold = true;
    } else fire = ctx.canFire && dist < w.range && (B.press = !B.press);
  }
  if (!squid || !exposed) B.lurk = Math.max(0, B.lurk - dt * 0.4);
  // no dodge-hop on every hit: only when hurt and not about to cut
  if (it.jump && !(a.hp < 45 && !charging && dist > 3.2)) it.jump = false;
  it.fire = fire || hold;
  brain._blHold = hold ? G.time : -1;
  it.squid = squid;
  if (mv) {
    const l = Math.hypot(mv[0], mv[1]), k = l > 1 ? 1 / l : 1;                   // (shorter than 1: a slower step)
    if (l > 0.01) move.set(mv[0] * k, 0, mv[1] * k); else move.set(0, 0, 0);
    // steering our own way (arcs, circling, cover): the waypoint-progress watchdog mustn't read it as stuck
    if (Math.hypot(a.vel.x, a.vel.z) > 1.5) brain.noProg = 0;
  }
}

// ------------------------------------------------------------------------------------------ the kit
MAIN_KITS.blade = {
  ghost,
  update(R, dt, inp, w) {
    const a = R.a, K = st(R);
    if (G.time - K.lastT > 0.3) { cancelCharge(R, K); K.held = false; K.swing = null; K.lunge = 0; K.queued = 0; }   // resumed after a special took the trigger
    K.lastT = G.time;
    K.cd -= dt; K.since += dt; K.flashT += dt; K.queued = Math.max(0, K.queued - dt);
    if (K.swing) runSwing(R, K, dt, w);
    const raw = !!a.intent.fire;
    const canAct = a.form !== 'squid' && (a.kidT ?? 99) >= PLAYER.emergeDelay && a.alive;
    if (!canAct) {
      // squid / emerging: a charge keeps while the trigger stays held (briefly), and is lost once it's let go
      if (K.charging) { K.store += dt; a.lastFire = 0; if (!raw || K.store > w.chargeStore) cancelCharge(R, K); }
      K.held = K.held && raw;
      R.charge = K.charge;
      return;
    }
    K.store = 0;
    const auto = coreDriven(a);
    let fire = inp.fire;
    if (!fire && K.charging && botHolds(a)) fire = true;
    // press: a quick cut right away (mashing faster than the swing buffers the next one)
    if (inp.firePressed || (auto && fire && K.cd <= 0)) {
      if (K.cd <= 0) tap(R, K, w); else K.queued = 0.16;
      K.held = true; K.holdT = 0;
    } else if (K.queued > 0 && K.cd <= 0 && !K.charging) { K.queued = 0; tap(R, K, w); }
    if (fire && K.held) {
      K.holdT += dt;
      // held past the cut: the blade rises and charges
      if (!auto && !K.charging && K.holdT >= w.chargeDelay && !(K.swing && K.swing.heavy)) {
        K.charging = true; K.charge = 0; K.full = false;
        if (heard(a)) { stopHum(R); HUMS.set(R, G.audio?.loop('blade_charge', { pos: sndPos(a), volume: a.isLocal ? 0.5 : 0.32, pitch: 1 })); }
      }
      if (K.charging) {
        const cap = a.ink >= w.heavyInk ? 1 : 0.94;              // not enough ink for the heavy cut: it never completes
        K.charge = Math.min(cap, K.charge + dt / w.chargeTime);
        if (K.charge >= 1 && !K.full) {
          K.full = true;
          if (heard(a)) G.audio?.play('blade_ready', { pos: sndPos(a), volume: a.isLocal ? 0.6 : 0.4 });
          rumble(a, 0.06, 0.3, 60);
        }
        if (cap < 1 && K.charge >= cap && !K.lowWarned && a.isLocal) { K.lowWarned = true; R._empty(); }
        HUMS.get(R)?.set({ pitch: 1 + 0.6 * K.charge + (K.full ? 0.02 * Math.sin(G.time * 40) : 0), pos: sndPos(a) });
        a.fireFacing = Math.max(a.fireFacing, 0.35); R.firingT = Math.max(R.firingT, 0.3); a.lastFire = 0;   // no idle refill mid-charge
      }
    } else if (K.held && !fire) {
      // release
      K.held = false; K.lowWarned = false;
      if (K.charging) {
        const c = K.charge;
        cancelCharge(R, K);
        if (c >= 1) heavy(R, K, w);
        else if (c >= 0.3) { if (K.cd <= 0.04) { K.cd = 0; tap(R, K, w); } else K.queued = 0.16; }
      }
    }
    R.charge = K.charge;
  },
  reset(R) { stopHum(R); },
  // (a charge doesn't make the runner busy: you can dive with it held — see chargeStore — and swim on)
  busy(R) { const K = R.kit; return !!K && !!K.swing; },
  firingPose(R) { const K = R.kit; return !!K && (K.charging || (!!K.swing && K.swing.t < 0.3)); },
  moveSpeed(R, w) {
    const K = R.kit; if (!K) return 0;
    if (K.swing && K.swing.heavy && K.swing.t < 0.3) return w.moveSpeedFiring * 0.55;   // planted after the lunge
    if (K.charging) return w.moveSpeedCharging;
    if (R.firingT > 0) return w.moveSpeedFiring;
    return 0;
  },
  tick(dt) {
    BladeFX.tick(dt);
    updateWaves(dt);
    for (const [R] of HUMS) { const K = R.kit; if (!K || !K.charging || R.a.weapon?.kind !== 'blade' || !R.a.alive) stopHum(R); }
  },
  clear() {
    for (const W of WAVES) BladeFX.freeWave(W.fx);
    WAVES.length = 0;
    BladeFX.clear();
    for (const [R] of HUMS) stopHum(R);
  },

  // ---------------------------------------------------------------------------------------- bots
  // Played like an aggressive human swordsman — see botTactics() below (it runs every fight frame and owns the
  // trigger, the swim and the footwork; bots.js calls it after its defaults). paint: quick cuts on the move, keeping
  // a reserve for fights, and now and then a charged wave down a long lane.
  bot: {
    paintPitch: -0.2,
    tactics: botTactics,
    // low on health in a fight at blade range (or charged and nearly there): finish it rather than turn and run
    stayIn(brain) {
      const a = brain.a, t = brain.target; if (!t || !t.pos) return false;
      const d = Math.hypot(t.pos.x - a.pos.x, t.pos.z - a.pos.z), K = a.weaponRunner.kit;
      return Math.abs(t.pos.y - a.pos.y) < 1.4 && (d < 4.5 || (!!K && K.full && d < 5.5));
    },
    // target choice (bots.js _perceive adds this to the distance score; lower is preferred): an enemy busy with one of
    // our team is the kill a sword gets; a ranged one that has us spotted from beyond the droplets' reach is the duel
    // it loses — another enemy within ~4 m of it is taken first
    targetBias(brain, e, d) {
      const eb = e.bot, a = brain.a;
      let b = e.hp <= 50 && d < 12 ? -2 : 0;                                          // a hurt one: finish it
      if (!eb) return b;
      if (eb.target && eb.target !== a && eb.target.team === a.team && eb.seeTimer > 0 && d < 14) b -= 4;
      else if (eb.target === a && eb.seeTimer > 0 && d > a.weapon.range && !MELEE[e.weapon.kind]) b += 4;
      return b;
    },
    paint(brain, ctx) {
      const { a, w, needPaint, inkFrac, wantMove, dt } = ctx;
      const K = a.weaponRunner.kit || {};
      const B = botState(brain);
      B.waveT -= dt;
      if (K.charging) {
        if (K.full) { brain._blHold = -1; B.waveT = 3.5 + Math.random() * 3; return false; }   // loose a paint wave down the lane
        brain._blHold = G.time; return true;
      }
      brain._blHold = -1;
      // now and then, with a long way to go and ink to spare: charge a wave to paint a long stripe ahead
      if (B.waveT <= 0 && wantMove && inkFrac > 0.45 && needPaint && (brain._pathRemaining?.() ?? 0) > 9) { brain._blHold = G.time; return true; }
      // quick cuts while moving, but keep a reserve so a fight doesn't start on an empty tank
      if (needPaint && inkFrac > 0.25 && wantMove) { B.press = !B.press; return B.press; }
      return false;
    },
  },
};
