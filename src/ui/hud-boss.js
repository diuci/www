// INKWAVE — boss-mode HUD layer (docs/BOSS.md "UI"). The HUD owns one: `hud.boss = new BossHud(hud)`.
//   Boss bar (top centre, under the timer): emblem, name tape, phase pips, HP with 66 / 33 % notches, white chip-away
//   trail, damage + weak-point flashes, OPEN! stun state with a draining stun meter, phase-change shield, phase-3 enrage.
//   Title card on boss:intro (splat band + slammed letters, ~2.5 s, never blocks input), move callouts pinned to the
//   boss on screen (kept out of the crosshair zone; edge-pinned with an arrow when it's off screen; CHARGE! shows the
//   charge direction), combo damage numbers + CRIT! pops for your own hits, phase banners, SUNK! / TIME'S UP endings.
// Driven by the bus events of the contract; a few fields are read off the live Boss (pos, yaw, hp, stunned) as a
// fallback / for projection only. Everything per-frame is transform/opacity; the rest is class toggles.
//
// Lab / console preview (no gameplay needed):  __G.hud.boss.demo()  → runs every state on a fake boss in front of you.
import { h, clamp, splatSVG, restartAnim, easeOutCubic, fmtInt } from './ui-util.js';
import { GLYPHS } from './ui-icons.js';
import { on, emit, G } from '../core/ctx.js';
import { BOSS_NAME, BOSS_EPITHET, MOVE_ICONS, MOVE_LABELS, bossEmblem } from './boss-art.js';

const NOTCHES = [2 / 3, 1 / 3];
const CALL_MOVES = new Set(['slam', 'barrage', 'sweep', 'charge', 'crablets', 'frenzy']);
const PHASE_TXT = {
  2: { big: '第二阶段！', sub: '小蟹群来袭——快点清掉！' },
  3: { big: '蟹壳碎裂！', sub: '最终阶段 · 打它发光的肚子！' },
};
const V3 = () => ({ x: 0, y: 0, z: 0 });

export class BossHud {
  constructor(hud) {
    this.hud = hud;
    this.on = false;
    this.boss = null;
    this.T = 0;
    this.S = this._fresh();
    this._tmp = { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }, copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; } };
    this._build();
    this._unsubs = [
      on('boss:spawn', (e) => this._spawn(e && e.boss)),
      on('boss:intro', (e) => this._intro(e || {})),
      on('boss:hp', (e) => this._hp(e || {})),
      on('boss:move', (e) => this._move(e || {})),
      on('boss:hit', (e) => this._hit(e || {})),
      on('boss:stun', (e) => this._stun(e || {})),
      on('boss:phase', (e) => this._phase(e || {})),
      on('boss:defeat', (e) => this._defeat(e || {})),
    ];
  }

  _fresh() {
    return { hp: 1, max: 1, shown: 1, chip: 1, chipHold: 0, gotHp: false, phase: 1, stunT: 0, stunDur: 0, sawStun: false, shieldT: 0,
      dead: false, introT: null, tickT: 0, hitT: -9, weakT: -9, critT: -9, move: null, moveT: 0, movePh: null, openT: 0,
      cx: null, cy: null, combo: null, nums: [], ended: false, L: {} };
  }

  // ================================================================ build
  _build() {
    const hud = this.hud;
    // ---- boss bar
    this.fill = h('i', { class: 'iw-bb__fill' }, h('i', { class: 'iw-bb__stripes' }), h('i', { class: 'iw-bb__gloss' }));
    this.chip = h('i', { class: 'iw-bb__chip' });
    this.edge = h('i', { class: 'iw-bb__edgewrap' }, h('i', { class: 'iw-bb__edge' }));
    this.notches = NOTCHES.map((f, i) => h('i', { class: 'iw-bb__notch', style: { left: `${(f * 100).toFixed(2)}%` } }, h('b', null, i ? 'III' : 'II')));
    this.shield = h('i', { class: 'iw-bb__shield', html: GLYPHS.lock });
    this.track = h('div', { class: 'iw-bb__track' }, h('div', { class: 'iw-bb__clip' }, this.chip, this.fill, this.edge, h('i', { class: 'iw-bb__flash' })), this.notches, this.shield);
    this.stunBar = h('i', { class: 'iw-bb__stunfill' });
    this.pips = [1, 2, 3].map((n) => h('i', { class: 'iw-bb__pip', 'data-n': n }));
    this.pctEl = h('b', null, '100');
    this.emb = h('div', { class: 'iw-bb__emb' },
      h('span', { class: 'iw-bb__embsplat', html: splatSVG({ seed: 44, fill: 'var(--boss)', r: 60, arms: 9, drops: 3 }) }),
      h('span', { class: 'iw-bb__embart', html: bossEmblem() }),
      h('span', { class: 'iw-bb__stars' }, h('i', { html: GLYPHS.star }), h('i', { html: GLYPHS.star }), h('i', { html: GLYPHS.star })),
      h('span', { class: 'iw-bb__x', html: GLYPHS.close }));
    this.bar = h('div', { class: 'iw-bb is-off' },
      this.emb,
      h('div', { class: 'iw-bb__plate' },
        h('div', { class: 'iw-bb__head' },
          h('span', { class: 'iw-bb__name iw-display' }, BOSS_NAME),
          h('span', { class: 'iw-bb__rage' }, '狂暴'),
          h('span', { class: 'iw-bb__grow' }),
          h('span', { class: 'iw-bb__phase' }, h('small', null, '阶段'), this.pips)),
        this.track,
        h('div', { class: 'iw-bb__stun' }, this.stunBar)),
      h('div', { class: 'iw-bb__pct' }, this.pctEl, h('small', null, '%')),
      h('div', { class: 'iw-bb__open' }, h('i', { html: MOVE_ICONS.open }), h('span', { class: 'iw-display' }, '破绽！')));

    // ---- move callout (one reusable pill that follows the boss on screen)
    this.callIcon = h('i', { class: 'iw-bmv__icon' });
    this.callTxt = h('b', { class: 'iw-display' });
    this.callArrow = h('i', { class: 'iw-bmv__dir', html: '<svg viewBox="-20 -20 40 40" aria-hidden="true"><path d="M-12 -9 L10 0 L-12 9 L-7 0 Z"/></svg>' });
    this.callEdge = h('i', { class: 'iw-bmv__edge' });
    this.call = h('div', { class: 'iw-bmv' }, this.callEdge, h('span', { class: 'iw-bmv__pill' }, this.callIcon, this.callTxt, this.callArrow));
    this.numLayer = h('div', { class: 'iw-bnums' });
    this.layer = h('div', { class: 'iw-bhud' }, this.numLayer, this.call, this.bar);
    hud.el.insertBefore(this.layer, hud.top);
    // big moments survive hud.setVisible(false) (intro, results hand-over)
    this.over = h('div', { class: 'iw-bover' });
    hud.overLayer.appendChild(this.over);
  }

  dispose() { this._unsubs.forEach((u) => u()); this.layer.remove(); this.over.remove(); }

  // ================================================================ mode + accessors
  /** Called by the HUD at every match intro (and by boss:spawn). */
  setMode(onoff, boss = null) {
    onoff = !!onoff;
    this.on = onoff;
    this.boss = onoff ? boss || this.boss || null : null;
    this.S = this._fresh();
    this.hud.el.classList.toggle('is-boss', onoff);
    this.hud.overLayer.classList.toggle('is-boss', onoff);
    this.bar.className = 'iw-bb' + (onoff ? '' : ' is-off');
    this.emb.querySelector('.iw-bb__embart').innerHTML = bossEmblem();
    this.numLayer.innerHTML = '';
    this.over.innerHTML = '';
    this.call.classList.remove('is-on', 'is-act', 'is-open');
    this.notches.forEach((n) => n.classList.remove('is-past', 'is-break'));
    this._pips(1);
    const b = this.boss;
    if (b && b.maxHp) { this.S.max = b.maxHp; this.S.hp = this.S.shown = this.S.chip = clamp(b.hp / b.maxHp); }
    this._writeBar(true);
  }
  _b() { return this.boss || (G.match && G.match.boss) || null; }
  _mine(a) { const hd = this.hud; return !!a && (a === hd._local() || !!a.isLocal); }
  _t() { return this.T; }   // own clock (the HUD's fx clock only runs while it has effects)
  _u() { return Math.min(innerWidth / 100, (innerHeight * 1.7778) / 100); }
  /** World-space anchor: a model socket if the model exposes one, else the boss root + a height. */
  _anchor(name, up, out) {
    const b = this._b();
    if (!b) return null;
    const m = b.model;
    if (m && m.getSocket && name && b.pos && b.pos.constructor && b.pos.constructor.prototype.applyMatrix4) {
      // the model wants a real THREE.Vector3 (localToWorld) — borrow the class off boss.pos, no three import here
      const v = this._sv || (this._sv = new b.pos.constructor());
      try { m.getSocket(name, v); if (Number.isFinite(v.x) && (v.x || v.y || v.z)) { out.x = v.x; out.y = v.y + up; out.z = v.z; return out; } } catch (e) { /* model mid-rebuild */ }
    }
    const p = b.pos || (b.root && b.root.position);
    if (!p) return null;
    out.x = p.x; out.y = p.y + (name === 'shellTop' ? 5.2 : 3.2) + up; out.z = p.z;
    return out;
  }
  _screen(w, out) {
    const cam = G.camera;
    if (!cam || !w) return null;
    const p = this.hud._project(cam, w.x, w.y, w.z);
    if (!p) return null;
    out.x = (p.x * 0.5 + 0.5) * innerWidth; out.y = (-p.y * 0.5 + 0.5) * innerHeight; out.behind = p.z > 1;
    return out;
  }

  // ================================================================ events
  _spawn(boss) {
    if (!boss) return;
    if (!this.on || this.boss !== boss) this.setMode(true, boss);
  }

  _intro(e) {
    if (!this.on) this.setMode(true, e.boss || null);
    const S = this.S;
    S.introT = 0;
    S.shown = 0; S.chip = 0;
    this._writeBar(true);
    restartAnim(this.bar, 'is-intro');
    this._titleCard();
  }

  _hp({ hp, max }) {
    if (!this.on) return;
    const S = this.S;
    if (max > 0) S.max = max;
    const t = clamp((+hp || 0) / Math.max(1e-6, S.max));
    S.gotHp = true;
    const prev = S.hp;
    S.hp = t;
    if (t < prev - 1e-5) {
      // a new white chip segment starts only once the last one has caught up — under a constant stream of hits
      // (the whole squad firing) the chip still drains instead of hanging at the fight's first hit
      if (S.chip <= S.shown + 0.003) S.chipHold = 0.6;
      const now = this._t();
      if (now - S.hitT > 0.07) { S.hitT = now; restartAnim(this.bar, 'is-hit'); }
      NOTCHES.forEach((f, i) => {
        if (prev > f && t <= f) { this.notches[i].classList.add('is-past'); restartAnim(this.notches[i], 'is-break'); }
      });
    }
    if (t <= 0 && !S.dead) restartAnim(this.bar, 'is-zero');
  }

  _move({ id, phase }) {
    if (!this.on || this.S.dead) return;
    const S = this.S;
    S.move = id; S.movePh = phase; S.moveT = 0;
    if (!CALL_MOVES.has(id)) { if (phase !== 'act' && S.openT <= 0) this.call.classList.remove('is-on', 'is-act'); return; }
    if (phase === 'tele') {
      if (S.openT > 0) return;
      this._showCall(id);
      this.hud._snd('ui_hover', { volume: 0.4, pitch: 0.7 });
    } else if (phase === 'act') {
      if (this.call.dataset.move === id) restartAnim(this.call, 'is-act');
    } else if (phase === 'rec' && S.openT <= 0) this.call.classList.remove('is-on', 'is-act');
  }
  _showCall(id) {
    this.call.dataset.move = id;
    this.callIcon.innerHTML = MOVE_ICONS[id] || MOVE_ICONS.open;
    this.callTxt.textContent = MOVE_LABELS[id] || id.toUpperCase();
    this.call.classList.toggle('is-open', id === 'open');
    this.call.classList.toggle('has-dir', id === 'charge');
    this.call.classList.remove('is-act');
    this.S.callT = 0;
    restartAnim(this.call, 'is-on');
  }

  _hit({ damage = 0, weak = false, attacker = null, pos = null, crab = false, blocked = false }) {
    if (!this.on || this.S.dead) return;
    const S = this.S, now = this._t();
    const mine = this._mine(attacker);
    if (crab) { if (mine) { this.hud._lastHitDmg = damage; this.hud.hitMarker('hit'); } return; }   // crablets: just the reticle tick
    if (blocked) {
      // invulnerable beat (phase change / intro): a grey IMMUNE pop instead of numbers
      if (mine && now - (S.immT || -9) > 0.6) { S.immT = now; const w = V3(); if (pos && Number.isFinite(pos.x)) { w.x = pos.x; w.y = pos.y; w.z = pos.z; } else if (!this._anchor('shellTop', -1, w)) return; this._crit(w, '免疫'); }
      return;
    }
    if (weak && now - S.weakT > 0.12) { S.weakT = now; restartAnim(this.bar, 'is-weak'); restartAnim(this.emb, 'is-weak'); }
    if (!mine) return;
    // reticle: the HUD's own hit marker (heavier for weak points)
    const hd = this.hud;
    hd._lastHitDmg = weak ? Math.max(70, damage) : Math.max(24, damage);
    hd.hitMarker('hit');
    hd.hitEl.classList.toggle('is-weak', !!weak);
    // world point: the hit position, else a weak-point / body socket
    const w = V3();
    if (pos && Number.isFinite(pos.x)) { w.x = pos.x; w.y = pos.y; w.z = pos.z; }
    else if (!this._anchor(weak ? (S.phase >= 3 || S.openT > 0 ? 'belly' : Math.random() < 0.5 ? 'eyeL' : 'eyeR') : 'shellTop', weak ? 0 : -1.2, w)) return;
    this._addNum(w, +damage || 0, !!weak, now);
    if (weak && now - S.critT > 0.22) { S.critT = now; this._crit(w); }
  }

  _stun({ dur = 3 }) {
    if (!this.on || this.S.dead) return;
    const S = this.S;
    S.stunDur = S.stunT = S.openT = Math.max(0.5, +dur || 3);
    S.sawStun = false;
    this.bar.classList.add('is-open');
    restartAnim(this.bar.querySelector('.iw-bb__open'), 'is-pop');
    this._showCall('open');
    this.hud._snd('special_ready', { volume: 0.45, pitch: 1.25 });
  }

  _phase({ phase }) {
    if (!this.on) return;
    const S = this.S;
    phase = clamp(phase | 0, 1, 3);
    if (phase <= S.phase) return;
    S.phase = phase;
    S.shieldT = 1.8;
    this._pips(phase);
    if (phase >= 3) { this.bar.classList.add('is-enraged'); this.emb.querySelector('.iw-bb__embart').innerHTML = bossEmblem({ cracked: true }); }
    restartAnim(this.bar, 'is-phase');
    const T = PHASE_TXT[phase];
    if (T) this._banner(T.big, T.sub, phase);
  }

  _defeat() {
    if (!this.on || this.S.dead) return;
    const S = this.S;
    S.dead = true; S.hp = 0; S.openT = 0; S.stunT = 0;
    this.bar.classList.remove('is-open');
    this.bar.classList.add('is-dead');
    this.call.classList.remove('is-on', 'is-act');
    setTimeout(() => { if (this.S === S) this.bar.classList.add('is-gone'); }, 1300);
    this._ending(true);
  }

  /** hud.banner('timesup') in boss mode lands here. Returns true when handled. */
  timesUp() {
    if (!this.on) return false;
    if (this.S.dead || this.S.ended) return true;
    this.call.classList.remove('is-on', 'is-act');
    this._ending(false);
    return true;
  }

  /** Contextual prompt: the turf tutorial line becomes a boss one; OPEN! gets its own nudge. */
  prompt(p) {
    if (this.S.openT > 0.4 && !this.S.dead) return '破绽出现了 \u2014 火力全开！';
    if (p && /turf wins/i.test(p)) return this.S.phase >= 3 ? '蟹壳碎了 \u2014 打它发光的肚子！' : `瞄准${BOSS_NAME} \u2014 打它发光的眼睛伤害更高！`;
    return p;
  }

  /** The 4v4 roster slots re-used for the squad: up to 8 kids, 4 either side of the timer, all in squad ink. */
  squadTeams(teams) {
    const all = [];
    for (const t of teams || []) for (const p of (t && t.players) || []) all.push(p);
    return [{ color: teams && teams[0] && teams[0].color, players: all.slice(0, 4) }, { color: teams && teams[0] && teams[0].color, players: all.slice(4, 8) }];
  }

  // ================================================================ per frame
  update(dt) {
    if (!this.on) return;
    this.T += dt;
    const S = this.S, b = this._b();
    // fallbacks when the host's events are late / missing
    if (b && !S.gotHp && b.maxHp > 0) { const t = clamp(b.hp / b.maxHp); if (Math.abs(t - S.hp) > 1e-5) { this._hp({ hp: b.hp, max: b.maxHp }); S.gotHp = false; } }
    if (b && b.dead && !S.dead && S.hp <= 0.001) this._defeat();
    // HP display: intro fill, else a quick ease toward the target; the white chip lags then drains
    if (S.introT != null) {
      // fills once the title card is leaving AND the HUD is up (in the boss intro the HUD appears later)
      S.introT += dt;
      S.visT = this.hud._visible ? (S.visT || 0) + dt : 0;
      const k = clamp(Math.min(S.introT - 2.25, S.visT - 0.2) / 1.05);
      S.shown = S.chip = S.hp * easeOutCubic(k);
      if (k > 0 && k < 1 && (S.tickT -= dt) <= 0) { S.tickT = 0.055; this.hud._snd('xp_tick', { volume: 0.45, pitch: 0.6 + k * 0.7 }); }
      if (k >= 1) { S.introT = null; restartAnim(this.bar, 'is-full'); }
    } else {
      S.shown += (S.hp - S.shown) * Math.min(1, dt * 16);
      if (Math.abs(S.hp - S.shown) < 1e-4) S.shown = S.hp;
      if (S.chipHold > 0) S.chipHold -= dt;
      else S.chip = Math.max(S.shown, S.chip - dt * Math.max(0.2, (S.chip - S.shown) * 2.2));
      if (S.chip < S.shown) S.chip = S.shown;
    }
    this._writeBar(false);
    // stun window + phase shield
    if (S.openT > 0) {
      S.openT -= dt; S.stunT = S.openT;
      if (b && b.stunned) S.sawStun = true;
      if (b && S.sawStun && b.stunned === false && S.openT > 0.2) S.openT = 0;   // host ended it early
      this.stunBar.style.transform = `scaleX(${clamp(S.openT / Math.max(0.01, S.stunDur)).toFixed(4)})`;
      if (S.openT <= 0) { this.bar.classList.remove('is-open'); if (this.call.dataset.move === 'open') this.call.classList.remove('is-on'); }
    }
    if (S.shieldT > 0) S.shieldT -= dt;
    const sh = S.shieldT > 0 || !!(b && b.invuln);
    if (sh !== S.L.sh) { S.L.sh = sh; this.bar.classList.toggle('is-shield', sh); }
    // callout follows the boss
    if (this.call.classList.contains('is-on')) {
      S.callT = (S.callT || 0) + dt;
      if (S.callT > 3.2 && this.call.dataset.move !== 'open') this.call.classList.remove('is-on', 'is-act');
      else this._placeCall(dt);
    } else S.cx = null;
    this._updNums(dt);
  }

  _writeBar(force) {
    const S = this.S, L = S.L;
    const f = (v) => `translateX(${((v - 1) * 100).toFixed(3)}%)`;
    const a = Math.round(S.shown * 4000), c = Math.round(S.chip * 4000);
    if (force || a !== L.a) { L.a = a; this.fill.style.transform = f(S.shown); this.edge.style.transform = f(S.shown); }
    if (force || c !== L.c) { L.c = c; this.chip.style.transform = f(S.chip); }
    const pc = S.shown > 0 && S.shown < 0.01 ? 1 : Math.ceil(S.shown * 100 - 1e-6);
    if (force || pc !== L.pc) { L.pc = pc; this.pctEl.textContent = String(pc); }
    const low = S.shown <= 0.2 && S.shown > 0;
    if (low !== L.low) { L.low = low; this.bar.classList.toggle('is-low', low); }
  }

  _pips(phase) {
    this.pips.forEach((p, i) => { p.classList.toggle('is-on', i < phase); p.classList.toggle('is-cur', i === phase - 1); });
    this.bar.dataset.phase = String(phase);
  }

  _placeCall(dt) {
    const S = this.S, u = this._u(), W = innerWidth, H = innerHeight;
    const w = this._anchor('shellTop', 1.9, this._tmp);
    const sp = w && this._screen(w, { x: 0, y: 0 });
    if (!sp) return;
    let x = sp.x, y = sp.y, edge = false, ang = 0;
    let dx = x - W / 2, dy = y - H / 2;
    if (sp.behind) { dx = -dx; dy = -dy; if (Math.abs(dx) < 1 && Math.abs(dy) < 1) dy = 1; }
    const mx = u * 7, myT = u * 16, myB = u * 7;
    if (!sp.behind && x >= mx && x <= W - mx && y < myT) y = myT;   // on screen but tall: sit just under the boss bar
    if (sp.behind || x < mx || x > W - mx || y > H - myB) {
      edge = true;
      ang = Math.atan2(dy, dx);
      const ex = W / 2 - mx, ey = (H - myT - myB) / 2, cyE = myT + ey;
      const k = Math.min(ex / Math.max(1e-3, Math.abs(Math.cos(ang))), ey / Math.max(1e-3, Math.abs(Math.sin(ang))));
      x = W / 2 + Math.cos(ang) * k; y = cyE + Math.sin(ang) * k;
    } else {
      // never over the crosshair: push out of an ellipse around the centre (upward when dead centre)
      const rx = u * 15, ry = u * 10.5;
      const ddx = x - W / 2, ddy = y - H / 2, r = (ddx / rx) ** 2 + (ddy / ry) ** 2;
      if (r < 1) {
        if (r < 1e-4) { x = W / 2; y = H / 2 - ry; } else { const s = 1 / Math.sqrt(r); x = W / 2 + ddx * s; y = H / 2 + ddy * s; }
      }
    }
    if (S.cx == null) { S.cx = x; S.cy = y; }
    const k = Math.min(1, dt * 12);
    S.cx += (x - S.cx) * k; S.cy += (y - S.cy) * k;
    this.call.style.transform = `translate3d(${S.cx.toFixed(1)}px,${S.cy.toFixed(1)}px,0)`;
    if (edge !== S.L.edge) { S.L.edge = edge; this.call.classList.toggle('is-edge', edge); }
    if (edge) this.callEdge.style.transform = `rotate(${ang.toFixed(3)}rad)`;
    // CHARGE!: the arrow points where it's going to run (boss forward, projected)
    if (this.call.dataset.move === 'charge') {
      const b = this._b();
      let da = 0;
      const p = b && (b.pos || (b.root && b.root.position));
      if (p) {
        const mp = b.move && (b.move.p || b.move.params);
        const yaw = mp && Number.isFinite(mp.yaw) ? mp.yaw : b.yaw ?? (b.root ? b.root.rotation.y : 0);
        const d = mp && mp.dir;
        const fx = d ? d.x : Math.sin(yaw), fz = d ? d.z : Math.cos(yaw);
        const a0 = this._screen({ x: p.x, y: p.y + 1, z: p.z }, { x: 0, y: 0 }), a1 = this._screen({ x: p.x + fx * 6, y: p.y + 1, z: p.z + fz * 6 }, { x: 0, y: 0 });
        if (a0 && a1 && !a0.behind && !a1.behind) da = Math.atan2(a1.y - a0.y, a1.x - a0.x);
        else { const cam = G.camera; if (cam && cam.matrixWorld) { const e = cam.matrixWorld.elements; da = Math.atan2(-(fx * -e[8] + fz * -e[10]), fx * e[0] + fz * e[2]); } }
      }
      this.callArrow.style.transform = `rotate(${da.toFixed(3)}rad)`;
    }
  }

  // ---------------------------------------------------------------- damage numbers
  _addNum(w, dmg, weak, now) {
    const S = this.S;
    let c = S.combo;
    if (!c || c.out || now - c.last > 0.45) {
      const el = h('div', { class: 'iw-bnum' }, h('b'));
      this.numLayer.appendChild(el);
      c = S.combo = { el, txt: el.firstChild, sum: 0, w: { ...w }, last: now, born: now, weak: false, out: false, jx: (Math.random() - 0.5) * 2 };
      S.nums.push(c);
      while (S.nums.length > 6) { const o = S.nums.shift(); o.el.remove(); }
    }
    c.sum += dmg; c.last = now;
    c.w.x += (w.x - c.w.x) * 0.35; c.w.y += (w.y - c.w.y) * 0.35; c.w.z += (w.z - c.w.z) * 0.35;
    if (weak && !c.weak) { c.weak = true; c.el.classList.add('is-weak'); }
    c.txt.textContent = fmtInt(c.sum);
    c.el.style.setProperty('--s', clamp(0.85 + Math.log10(Math.max(1, c.sum)) * 0.16 + (c.weak ? 0.2 : 0), 0.85, 1.6).toFixed(3));
    restartAnim(c.el, 'is-bump');
  }
  _crit(w, txt = '暴击！') {
    const p = this._screen(w, { x: 0, y: 0 });
    if (!p || p.behind) return;
    const el = h('div', { class: 'iw-bcrit' + (txt === '暴击！' ? '' : ' is-immune') }, h('i', { class: 'iw-bcrit__burst' }), h('span', { class: 'iw-display' }, txt));
    el.style.transform = `translate3d(${p.x.toFixed(1)}px,${(p.y - this._u() * 2.4).toFixed(1)}px,0)`;
    el.addEventListener('animationend', (e) => { if (e.target === el) el.remove(); });
    setTimeout(() => el.remove(), 900);
    this.numLayer.appendChild(el);
  }
  _updNums() {
    const S = this.S, now = this._t(), u = this._u();
    for (let i = S.nums.length - 1; i >= 0; i--) {
      const c = S.nums[i];
      const age = now - c.last;
      if (age > 1.05) { c.el.remove(); S.nums.splice(i, 1); if (S.combo === c) S.combo = null; continue; }
      if (age > 0.45 && !c.out) { c.out = true; c.el.classList.add('is-out'); }
      const p = this._screen(c.w, { x: 0, y: 0 });
      if (!p || p.behind) { c.el.style.opacity = '0'; continue; }
      const rise = (now - c.born) * u * 1.6 + (c.out ? (age - 0.45) * u * 5 : 0);
      c.el.style.opacity = '';
      c.el.style.transform = `translate3d(${(p.x + c.jx * u).toFixed(1)}px,${(p.y - u * 1.5 - rise).toFixed(1)}px,0)`;
    }
  }

  // ---------------------------------------------------------------- big moments
  _titleCard() {
    this.over.querySelectorAll('.iw-btc').forEach((e) => e.remove());
    const letters = [...BOSS_NAME].map((c, i) => h('span', { style: { '--i': i } }, c));
    const el = h('div', { class: 'iw-btc' },
      h('div', { class: 'iw-btc__band' },
        h('i', { class: 'iw-btc__stripes' }),
        h('span', { class: 'iw-btc__splat a', html: splatSVG({ seed: 71, fill: 'var(--boss)', r: 58, arms: 10, drops: 6 }) }),
        h('span', { class: 'iw-btc__splat b', html: splatSVG({ seed: 23, fill: 'var(--boss)', r: 56, arms: 9, drops: 5 }) })),
      h('div', { class: 'iw-btc__emb', html: bossEmblem() }),
      h('div', { class: 'iw-btc__txt' },
        h('div', { class: 'iw-btc__tags' }, h('div', { class: 'iw-btc__tag' }, h('i', { html: GLYPHS.swords }), '斗诗会'), h('span', { class: 'iw-beta iw-btc__beta' }, '公开测试')),
        h('div', { class: 'iw-btc__name iw-display' }, letters),
        h('div', { class: 'iw-btc__epi' }, BOSS_EPITHET.toUpperCase())));
    el.addEventListener('animationend', (e) => { if (e.target === el) el.remove(); });
    setTimeout(() => el.remove(), 3200);
    this.over.appendChild(el);
    setTimeout(() => { if (el.isConnected) this.hud._snd('splat_big', { volume: 0.7, pitch: 0.7 }); }, 80);
  }

  _banner(big, sub, phase) {
    this.over.querySelectorAll('.iw-bph').forEach((e) => e.remove());
    const el = h('div', { class: 'iw-bph' + (phase >= 3 ? ' is-rage' : '') },
      h('span', { class: 'iw-bph__splat', html: splatSVG({ seed: 30 + phase * 7, fill: 'var(--boss)', r: 58, arms: 10, drops: 6 }) }),
      h('div', { class: 'iw-bph__tape' }, h('span', { class: 'iw-bph__big iw-display' }, big)),
      sub ? h('div', { class: 'iw-bph__sub' }, sub) : null);
    el.addEventListener('animationend', (e) => { if (e.target === el) el.remove(); });
    setTimeout(() => el.remove(), 3400);
    this.over.appendChild(el);
  }

  _ending(win) {
    const S = this.S;
    if (S.ended) return;
    S.ended = true;
    this.over.querySelectorAll('.iw-bph, .iw-btc').forEach((e) => e.remove());
    this.hud.bannerLayer.querySelectorAll('.iw-bn').forEach((b) => b.remove());
    const drops = Array.from({ length: 14 }, (_, i) => h('i', { class: 'iw-bend__drop', style: { '--a': `${i * (360 / 14) + Math.random() * 14}deg`, '--d': `${0.9 + Math.random() * 0.8}`, '--s': `${0.5 + Math.random() * 0.9}` } }));
    const word = win ? '击沉！' : '时间到！';
    const el = h('div', { class: 'iw-bend ' + (win ? 'is-win' : 'is-lose') },
      h('div', { class: 'iw-bend__burst' }, drops),
      h('div', { class: 'iw-bend__splat b', html: splatSVG({ seed: win ? 12 : 8, fill: win ? 'var(--boss)' : 'var(--self)', r: 60, arms: 10, drops: 6 }) }),
      h('div', { class: 'iw-bend__splat', html: splatSVG({ seed: win ? 5 : 19, fill: win ? 'var(--self)' : 'var(--boss)', r: 60, arms: 11, drops: 8 }) }),
      h('div', { class: 'iw-bend__emb', html: bossEmblem({ cracked: win }) }),
      h('div', { class: 'iw-bend__txt' },
        h('small', { class: 'iw-bend__who' }, win ? BOSS_NAME : `${BOSS_NAME}逃走了…`),
        h('div', { class: 'iw-bend__word iw-display' }, [...word].map((c, i) => h('span', { style: { '--i': i } }, c === ' ' ? ' ' : c)))));
    el.addEventListener('animationend', (e) => { if (e.target === el) el.remove(); });
    setTimeout(() => el.remove(), 5200);
    this.over.appendChild(el);
    if (win) this.hud.el.classList.remove('is-live');
  }

  // ================================================================ console preview
  /** Runs every boss HUD state on a fake boss 14 m in front of the camera. For UI work / audits only. */
  demo(opts = {}) {
    const cam = G.camera;
    const fwd = { x: 0, z: -1 };
    if (cam && cam.matrixWorld) { const e = cam.matrixWorld.elements; const l = Math.hypot(e[8], e[10]) || 1; fwd.x = -e[8] / l; fwd.z = -e[10] / l; }
    const base = cam ? cam.position : { x: 0, y: 0, z: 0 };
    const d = opts.dist ?? 16;
    const boss = this._demoBoss = { pos: { x: base.x + fwd.x * d, y: 0, z: base.z + fwd.z * d }, yaw: Math.atan2(-fwd.x, -fwd.z) + (opts.yaw || 0.9), hp: 12000, maxHp: 12000, phase: 1, stunned: false, dead: false, move: null };
    const me = this.hud._local();
    const T = [];
    const at = (s, fn) => T.push(setTimeout(fn, s * 1000));
    const hit = (dmg, weak) => { boss.hp = Math.max(0, boss.hp - dmg * (weak ? 2.5 : 1)); emit('boss:hit', { damage: dmg * (weak ? 2.5 : 1), weak, attacker: me, pos: { x: boss.pos.x + (Math.random() - 0.5) * 2, y: weak ? 4.1 : 3 + Math.random() * 2, z: boss.pos.z } }); emit('boss:hp', { hp: boss.hp, max: boss.maxHp }); };
    emit('boss:spawn', { boss });
    at(0.1, () => emit('boss:intro', { boss, dur: 2.5 }));
    const steps = opts.steps || ['move', 'hits', 'stun', 'phase2', 'charge', 'phase3', 'end'];
    let t = 3.2;
    for (const s of steps) {
      if (s === 'move') { at(t, () => emit('boss:move', { id: 'slam', phase: 'tele', boss })); at(t + 0.9, () => emit('boss:move', { id: 'slam', phase: 'act', boss })); at(t + 1.6, () => emit('boss:move', { id: 'slam', phase: 'rec', boss })); t += 2; }
      if (s === 'hits') { for (let i = 0; i < 14; i++) at(t + i * 0.09, () => hit(38, i % 5 === 4)); t += 1.8; }
      if (s === 'stun') { at(t, () => { boss.stunned = true; emit('boss:stun', { dur: 3.5 }); }); for (let i = 0; i < 10; i++) at(t + 0.4 + i * 0.12, () => hit(40, true)); at(t + 3.5, () => { boss.stunned = false; }); t += 4; }
      if (s === 'phase2') { at(t, () => { boss.hp = Math.min(boss.hp, boss.maxHp * 0.64); emit('boss:hp', { hp: boss.hp, max: boss.maxHp }); boss.phase = 2; emit('boss:phase', { phase: 2 }); }); t += 3; }
      if (s === 'charge') { at(t, () => emit('boss:move', { id: 'charge', phase: 'tele', boss })); at(t + 1.2, () => emit('boss:move', { id: 'charge', phase: 'act', boss })); at(t + 2.4, () => emit('boss:move', { id: 'charge', phase: 'rec', boss })); t += 2.6; }
      if (s === 'phase3') { at(t, () => { boss.hp = Math.min(boss.hp, boss.maxHp * 0.3); emit('boss:hp', { hp: boss.hp, max: boss.maxHp }); boss.phase = 3; emit('boss:phase', { phase: 3 }); }); t += 3; }
      if (s === 'end') { at(t, () => { boss.hp = 0; boss.dead = true; emit('boss:hp', { hp: 0, max: boss.maxHp }); emit('boss:defeat', { by: me }); }); t += 4; }
    }
    return { boss, stop: () => T.forEach(clearTimeout), duration: t };
  }
}
