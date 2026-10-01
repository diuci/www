// Swim wakes drawn into the ink surface itself (levelMaterial.js, "swim wakes"). Up to 4 swimmers near the camera —
// the local player always first — each keep a 12-point trail of where they swam (a new point every ~0.75 m, the live
// head as the last point, breaks where they left the ink). The shader turns every trail segment into an expanding
// ripple (their envelope opens into the V-wake) and pushes a glossy mound up over the submerged body.
import * as THREE from 'three';
import { G, clamp, damp } from '../core/ctx.js';

const SLOTS = 4, PTS = 12, LIFE = 1.15, SPACING = 0.75;
const BREAK = -9;

export class SwimWake {
  constructor() {
    this.slots = Array.from({ length: SLOTS }, () => ({
      actor: null, pts: [], k: 0, speedK: 0, fwd: new THREE.Vector3(0, 0, 1), head: new THREE.Vector3(), last: null, swimming: false,
    }));
    this._cand = [];
  }

  reset() { for (const s of this.slots) { s.actor = null; s.pts.length = 0; s.k = 0; s.last = null; s.swimming = false; } }

  update(dt, U, camPos) {
    if (!U || !U.uWake) return;
    const now = G.time;
    const m = G.match;
    // who is in the ink near the camera
    const cand = this._cand; cand.length = 0;
    if (m && m.state !== 'results') {
      for (const a of m.actors || G.actors || []) {
        if (!a.alive) continue;
        const f = a.anim?.form;
        if (f !== 'swim' && f !== 'climb') continue;
        const d2 = a.pos.distanceToSquared(camPos);
        if (!a.isLocal && d2 > 38 * 38) continue;
        cand.push(a); a._wakeD2 = a.isLocal ? -1 : d2;
      }
      cand.sort((x, y) => x._wakeD2 - y._wakeD2);
    }
    for (const s of this.slots) s.swimming = false;
    for (const a of cand) {
      let s = this.slots.find((o) => o.actor === a);
      if (!s) s = this.slots.find((o) => !o.actor);
      if (!s && a.isLocal) {   // the local player always gets one: take the farthest bot's
        s = this.slots.reduce((w, o) => (!w || (o.actor && (o.actor._wakeD2 ?? 0) > (w.actor._wakeD2 ?? 0)) ? o : w), null);
        if (s) { s.pts.length = 0; s.last = null; s.k = 0; }
      }
      if (!s) continue;
      if (s.actor !== a) { s.actor = a; s.pts.length = 0; s.last = null; s.k = 0; }
      s.swimming = true;
    }
    for (const s of this.slots) {
      const a = s.actor;
      if (!a) continue;
      // expire old points (a break marker at the front is meaningless)
      while (s.pts.length && (s.pts[0].t === BREAK ? true : now - s.pts[0].t > LIFE)) s.pts.shift();
      if (s.swimming) {
        const p = a.pos;
        const v = a.vel, sp = v.length();
        if (sp > 0.6) s.fwd.set(v.x, a.anim?.form === 'climb' ? v.y : 0, v.z).normalize();
        s.speedK = damp(s.speedK, clamp(sp / 11.8, 0, 1), 10, dt);
        // teleports / re-entries start a new trail (never draw a ripple across a jump or a respawn)
        if (s.last && s.last.distanceToSquared(p) > 2.5 * 2.5) { if (s.pts.length && s.pts[s.pts.length - 1].t !== BREAK) s.pts.push({ x: 0, y: 0, z: 0, t: BREAK }); s.last = null; }
        if (!s.last || s.last.distanceToSquared(p) > SPACING * SPACING) {
          if (sp > 0.8 || !s.last) {
            s.pts.push({ x: p.x, y: p.y, z: p.z, t: now });
            (s.last || (s.last = new THREE.Vector3())).copy(p);
          }
        }
        s.head.copy(p);
        s.k = damp(s.k, 1, 14, dt);
      } else {
        // left the ink (jumped, emerged, splatted): the mound sinks away, the trail ages out, then the slot frees
        if (s.pts.length && s.pts[s.pts.length - 1].t !== BREAK) s.pts.push({ x: 0, y: 0, z: 0, t: BREAK });
        s.last = null;
        s.k = damp(s.k, 0, 16, dt);
        if (s.k < 0.004 && !s.pts.some((o) => o.t !== BREAK)) { s.actor = null; s.pts.length = 0; s.k = 0; }
      }
      while (s.pts.length > PTS - 1) s.pts.shift();
    }
    // upload
    const W = U.uWake.value, B = U.uWakeB.value, H = U.uSwimH.value, F = U.uSwimF.value;
    for (let si = 0; si < SLOTS; si++) {
      const s = this.slots[si], base = si * PTS;
      let n = 0;
      if (s.actor) {
        let cx = 0, cy = 0, cz = 0, c = 0;
        for (const o of s.pts) {
          W[base + n++].set(o.x, o.y, o.z, o.t);
          if (o.t !== BREAK) { cx += o.x; cy += o.y; cz += o.z; c++; }
        }
        // the live head closes the trail while swimming (age 0 at the body)
        if (s.swimming) { W[base + n++].set(s.head.x, s.head.y, s.head.z, now); cx += s.head.x; cy += s.head.y; cz += s.head.z; c++; }
        if (c) {
          cx /= c; cy /= c; cz /= c;
          let r = 0;
          for (let i = 0; i < n; i++) { const w = W[base + i]; if (w.w !== BREAK) r = Math.max(r, Math.hypot(w.x - cx, w.y - cy, w.z - cz)); }
          r = Math.max(r, Math.hypot(s.head.x - cx, s.head.y - cy, s.head.z - cz));
          B[si].set(cx, cy, cz, r + 1.6);
        } else B[si].set(0, -999, 0, 0);
        H[si].set(s.head.x, s.head.y, s.head.z, s.k);
        F[si].set(s.fwd.x, s.fwd.y, s.fwd.z, s.speedK);
      } else {
        B[si].set(0, -999, 0, 0); H[si].set(0, -999, 0, 0);
      }
      for (let i = n; i < PTS; i++) W[base + i].set(0, 0, 0, BREAK);
    }
  }
}
