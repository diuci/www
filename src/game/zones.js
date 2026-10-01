// Zone Control: the rules engine (no UI). A match with opts.mode === 'zones' owns one of these (match.zones).
//
// Online (see netEvent): the host runs the rules and records every decision — captures, control, penalties, rotations,
// overtime, the end — plus a count snapshot twice a second, on its event timeline (in step with the paint it saw);
// everyone else is a follower that replays them (and only predicts the count between snapshots).
//
// Zones come from the stage layout (layout.zones, see ZONE_FORMAT below). There is a central objective (one zone, or
// two zones that must BOTH be held) and one side zone per team half (the one you give is Alpha's; Bravo's is its 180°
// mirror). Only one objective is operational at a time: the centre to start with, then every 30–60 s the operational
// one swaps between the centre and a side zone.
//
//   • coverage: the share of the zone's inkable floor each team has inked. Taking a zone needs ≥ 80 %; a held zone is
//     neutralised when the other team inks ≥ 40 % of it. An objective is held when a team holds all of its zones.
//   • countdown: each team starts at 100. Holding the operational objective counts you down — 1 pt/s at the centre;
//     a side zone on your own half 1 pt / 2 s; a side zone on the enemy's half (i.e. closer to THEIR spawn) 1 pt / 0.5 s.
//     A team at 0 wins on the spot.
//   • penalty: when a team loses the objective to the other team (not when it merely goes neutral), it gets a penalty
//     of ROUND(0.75 × (start − end)) + (start = 100 ? 1 : 0), where start = its count + penalty when it took the
//     objective from the other team, end = its count + penalty when the other team takes it. The penalty is NOT part
//     of the score: it's a lock that has to be counted off (holding the objective) before the count moves again.
//   • score: the count alone — the lower count is ahead and wins at time up (a count of 1 with a +50 penalty beats
//     2 +1); the penalty only decides how long the team has to hold before its count moves.
//   • specials: while one team holds the objective, the other team's gauges fill at 4.5 p/s; while nobody holds it, the
//     team that's behind fills at 1.5 p/s.
//   • time (5 min) + overtime: see _timeUp / _overtime. The last 30 s (ZONES.finalCentre) and overtime are played on
//     the centre only: a live side zone is swapped back to the centre and there are no more rotations.
//   • ink: taking a zone floods every one of its cells with the taker's ink (a front running out from its centre, see
//     PaintSystem.flood; nobody is credited for it), so the other team has to ink the full 40 % back to neutralise it.
//     An objective that becomes operational is wiped back to bare floor first (in step with the zone marks' reveal).
//
// Events (on / emit, src/core/ctx.js):
//   zones:zone { zone, owner }  ·  zones:control { owner, prev, objective }  ·  zones:penalty { team, penalty, … }
//   zones:active { objective, zones, final?, moved? } — a rotation; final: the last-30-s lock (moved: false when the
//                  centre was already live and only the lock is announced)
//   zones:contest { zone, holder, share } — the other team has inked a held zone up to ZONES.warn (≈ 30 %) of it
//   zones:overtime { losing }  ·  zones:end { winner, reason, counts, penalty } (counts = the scores, penalty apart)
//
// ZONE_FORMAT (layout.zones):
//   { center: [zone] | [zone, zone], side: zone }
//   zone = { poly: [[x, z], …] (outline, world metres, any simple polygon) | polys: [poly, …] (several parts, one
//            shared coverage), y0: -1, y1: 3 (floor heights counted) }   — the stages' zones live in zones-data.js
//   side = the zone on Alpha's half (closer to Alpha's spawn); Bravo's is mirrored automatically.
// Stages without zones get a placeholder layout (flagged placeholder: true) so the mode always runs.
import { G, emit } from '../core/ctx.js';
import { ZONES } from '../config.js';
import { judgePair, POEM_SCORE } from './poems/assign.js';

const FINAL = ZONES.finalCentre ?? 30;   // the last N s (+ overtime): the centre only, no more rotations
const WARN = ZONES.warn ?? 0.3;          // the other team's share of a held zone that sounds the "contested" warning
const WARN_GAP = 4;                      // s between two warnings for one zone
const MIN_STINT = 10;                    // a rotation never leaves an objective live for less than this before the lock
const FILL_T = 0.6;                      // capture flood: the front's run time (s), eased out
const r3 = (x) => Math.round(x * 1000) / 1000;
const WIPE_T = 0.7;                      // new-objective wipe: in step with ZoneMarks' reveal sweep (SWEEP_T, linear)

const partsOf = (z) => z.polys || [z.poly];
const mirrorZone = (z) => ({ ...z, poly: undefined, polys: partsOf(z).map((p) => p.map(([x, zz]) => [-x, -zz])) });

function insidePoly(poly, x, z) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

// placeholder zones when a stage has none yet: a 10 × 10 m square at mid, side zones a third of the way to each spawn
function placeholderZones(level) {
  const B = level.bounds, pad = level.spawnPads[0];
  const sq = (cx, cz, h) => [[cx - h, cz - h], [cx + h, cz - h], [cx + h, cz + h], [cx - h, cz + h]];
  const sx = pad.x * 0.4, sz = pad.z * 0.45;
  void B;
  return { placeholder: true, center: [{ poly: sq(0, 0, 5), y0: -2, y1: 6 }], side: { poly: sq(sx, sz, 4), y0: -2, y1: 6 } };
}

// the paint-grid cells of a zone: every live turf cell whose centre lies inside the outline and within [y0, y1]
function zoneCells(zone) {
  const L = G.level, P = G.paint, cells = [];
  let cx = 0, cz = 0, cy = 0;
  const y0 = zone.y0 ?? -2, y1 = zone.y1 ?? 6;
  const parts = partsOf(zone);
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const p of parts) for (const [x, z] of p) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
  for (const f of L.faces) {
    if (!f.turf || !f.atlas) continue;
    for (let j = 0; j < f.nv; j++) for (let i = 0; i < f.nu; i++) {
      const s = (i + 0.5) * f.cu, t = (j + 0.5) * f.cv;
      const wx = f.origin.x + f.u.x * s + f.v.x * t, wy = f.origin.y + f.u.y * s + f.v.y * t, wz = f.origin.z + f.u.z * s + f.v.z * t;
      if (wx < x0 || wx > x1 || wz < z0 || wz > z1 || wy < y0 || wy > y1) continue;
      if (!parts.some((p) => insidePoly(p, wx, wz))) continue;
      const k = f.grid + j * f.nu + i;
      if (P.dead && P.dead[k]) continue;
      cells.push(k); cx += wx; cy += wy; cz += wz;
    }
  }
  const n = Math.max(1, cells.length);
  const center = [cx / n, cy / n, cz / n];
  // reach: the farthest outline corner from the centre (no point of the zone is farther)
  let reach = 0;
  for (const p of parts) for (const [x, z] of p) reach = Math.max(reach, Math.hypot(x - center[0], z - center[2]));
  const ids = Int32Array.from(cells);
  return { cells: ids, center, reach, region: { cells: ids, polys: parts, y0, y1 } };
}

export class ZoneControl {
  constructor(match) {
    this.match = match;
    const layout = G.level.layout || {};
    const Z = layout.zones || placeholderZones(G.level);
    this.placeholder = !!Z.placeholder;
    // zones: [center…, sideA (home 0), sideB (home 1)]
    const defs = [...Z.center.map((z) => ({ ...z, kind: 'center', home: -1 })),
      { ...Z.side, kind: 'side', home: 0 }, { ...mirrorZone(Z.side), kind: 'side', home: 1 }];
    this.zones = defs.map((d, i) => ({ id: i, def: d, kind: d.kind, home: d.home, owner: -1, share: [0, 0], hold: 0, warnArmed: true, warnT: -99, flood: null, ...zoneCells(d),
      // 丢词大作战：该区域当前"写着"哪句诗（哪一队、哪首诗、第几句）
      poem: [null, null],        // 每队的 { poemId, line } —— 该队在此区域用的是哪句
      poemOf: -1,                // 已成句的一方（-1 = 未成句），成句后才算真正占领
      link: null }));            // 联句结果 { kind, poemId }（仅用于反馈与结算）
    const nc = Z.center.length;
    // objectives: the centre (1 or 2 zones), and one per side zone
    this.objectives = [
      { id: 'center', zones: this.zones.slice(0, nc), home: -1 },
      { id: 'sideA', zones: [this.zones[nc]], home: 0 },
      { id: 'sideB', zones: [this.zones[nc + 1]], home: 1 },
    ];
    this.active = this.objectives[0];
    this.owner = -1;                 // holder of the operational objective (-1 = nobody)
    this.lastOwner = -1;             // last team that held it (survives neutral spells)
    this.neutralT = 0;               // time since the objective last went neutral
    this.count = [ZONES.count, ZONES.count];
    this.penalty = [0, 0];
    this.start = [ZONES.count, ZONES.count];
    this.tieEnd = [null, null];
    this.holdT = [0, 0];             // current unbroken hold, s (UI / stats)
    this.clock = 0;                  // s since the match started playing
    this.final = match.time <= FINAL;   // centre-only from here on (a match this short never rotates)
    this._schedule();
    this.sampleT = 0;
    this.overtime = false; this.overtimeT = 0;
    this.otLosing = -1;              // the team behind when overtime began (-1: level → sudden death)
    this.winner = null; this.reason = null;
    this.log = [];
    this.snapT = 0;
  }

  // online: a guest's copy follows the host's (match.follower; a host migration makes it the rules engine)
  get follower() { return !!this.match.follower; }
  _net(e) { if (!this.follower) G.netm?.recZone?.(e); }

  // count + penalty: how much the team still has to count off to reach 0 (the penalty formula's start / end). NOT the
  // score — who's ahead / wins is the count alone (losing())
  total(t) { return this.count[t] + this.penalty[t]; }
  // the team currently behind (higher count; the penalty doesn't count), or -1 when level
  losing() { const a = this.count[0], b = this.count[1]; return a === b ? -1 : a > b ? 0 : 1; }
  _swapDelay() { return ZONES.rotateMin + Math.random() * (ZONES.rotateMax - ZONES.rotateMin); }
  // the next rotation — none that would land in the last FINAL s (+ a short stint): from the centre there are none left;
  // from a side zone the final lock itself takes the objective back to the centre
  _schedule() {
    const d = this._swapDelay(), left = this.match.time - FINAL;
    this.nextSwap = left - d >= MIN_STINT ? d : this.active === this.objectives[0] ? Infinity : Math.max(0.5, left + 0.5);
  }

  // Zone ink: a capture floods the zone with the taker's ink; a newly operational zone is wiped to bare floor (and
  // can't be taken while the wipe runs). zone.flood tells ZoneMarks where the front is (same radius function).
  _flood(z, team) {
    const fill = team === 0 || team === 1;
    const dur = fill ? FILL_T : WIPE_T, reach = fill ? z.reach + 0.4 : z.reach + 3.5, ease = fill ? 'out' : 'linear';
    z.flood = { team: fill ? team : -1, t0: G.time ?? 0, dur, reach, ease };
    if (!fill) z.hold = this.clock + dur + 0.05;
    G.paint?.flood?.(z.region, fill ? team : -1, { center: [z.center[0], z.center[2]], y: z.center[1], reach, dur, ease });
  }

  // ---- coverage + control of the operational objective's zones
  _sample() {
    const grid = G.paint.grid;
    for (const z of this.active.zones) {
      let a = 0, b = 0;
      const c = z.cells;
      for (let i = 0; i < c.length; i++) { const g = grid[c[i]]; if (g === 1) a++; else if (g === 2) b++; }
      const n = Math.max(1, c.length);
      z.share[0] = a / n; z.share[1] = b / n;
      if (this.follower) { if (z.owner >= 0) this._contest(z); continue; }   // (control is the host's call)
      if (this.clock < z.hold) continue;                 // still being wiped for its turn as the objective
      if (z.owner === -1) {
        const t = z.share[0] >= ZONES.control ? 0 : z.share[1] >= ZONES.control ? 1 : -1;
        // 丢词大作战：墨量够了还要"成句"——该队必须在此区域写下一句诗（选诗界面决定），否则只是涂了地不算占
        if (t >= 0 && z.poem[t]) { z.poemOf = t; this._zoneOwner(z, t); }
        else if (t >= 0) this._needPoem(z, t);          // 墨够了但没立句：提示玩家"落句"
      } else if (z.share[1 - z.owner] >= ZONES.contest) {
        z.poemOf = -1;                                   // 被推回中立：句子随之作废
        this._zoneOwner(z, -1);
      } else this._contest(z);
    }
    if (this.follower) return;
    const o = this.active.zones.every((z) => z.owner === 0) ? 0 : this.active.zones.every((z) => z.owner === 1) ? 1 : -1;
    if (o !== this.owner) { this._setOwner(o); if (o >= 0) this._checkLinks(); }
  }

  // 墨量够但还没立句：每区域每队只提示一次（避免刷屏）
  _needPoem(z, t) {
    if (z.needT === undefined) z.needT = [-99, -99];
    if (this.clock - z.needT[t] < 4) return;
    z.needT[t] = this.clock;
    emit('zones:needPoem', { zone: z, team: t });
  }

  // 一个区域立句（该队在此区域写下某句诗）。poemId/line 由玩家选诗与涂地顺序决定，默认取该队的默认诗首句。
  setZonePoem(zoneId, team, poemId, line = 0) {
    const z = this.zones[zoneId];
    if (!z || team < 0 || team > 1) return null;
    z.poem[team] = { poemId, line };
    this._net(['zq', zoneId, team, poemId, line]);
    emit('zones:poem', { zone: z, team, poemId, line });
    return z.poem[team];
  }

  // 检查相邻区域的组合：同队占据且相邻两句属同一首诗 → 联句
  _checkLinks() {
    for (const obj of this.objectives) {
      const zs = obj.zones;
      if (zs.length < 2) continue;
      for (let i = 0; i < zs.length - 1; i++) {
        const a = zs[i], b = zs[i + 1];
        if (a.poemOf < 0 || a.poemOf !== b.poemOf) continue;
        const t = a.poemOf;
        const r = judgePair(a.poem[t], b.poem[t]);
        a.link = r; b.link = r;
        if (r.kind === 'link') {
          this._net(['zl', a.id, b.id, t, r.poemId]);
          emit('zones:link', { a, b, team: t, poemId: r.poemId, bonus: POEM_SCORE.link });
          this.match?.onPoemLink?.(t, r.poemId, a, b);
        }
      }
    }
  }
  // a zone taken (flooded with the taker's ink) or neutralised
  _zoneOwner(z, t) {
    this._net(['zz', z.id, t]);
    z.owner = t;
    if (t >= 0) { z.warnArmed = true; z.warnT = -99; this._flood(z, t); }
    emit('zones:zone', { zone: z, owner: t });
  }

  // the other team is inking a held zone close to the neutralise line: warn once (re-armed when it's pushed back)
  _contest(z) {
    const o = z.share[1 - z.owner];
    if (o < WARN - 0.08) { z.warnArmed = true; return; }
    if (o < WARN || !z.warnArmed || this.clock - z.warnT < WARN_GAP) return;
    z.warnArmed = false; z.warnT = this.clock;
    emit('zones:contest', { zone: z, holder: z.owner, share: o });
  }

  _setOwner(o) {
    const prev = this.owner;
    this.owner = o;
    if (o === -1) { this.neutralT = 0; }
    else {
      const other = 1 - o;
      // the other team loses the objective to us: its penalty (from its last capture off us to now)
      if (this.lastOwner === other) this._penalise(other);
      // a capture off the other team (not a retake after our own neutral spell) starts our stint
      if (this.lastOwner !== o) { this.start[o] = this.total(o); this.tieEnd[o] = null; }
      this.lastOwner = o;
    }
    this.holdT[0] = this.holdT[1] = 0;
    this._net(['zo', o]);   // (after its penalty record: a follower plays them in the same order)
    emit('zones:control', { owner: o, prev, objective: this.active.id });
  }

  // ROUND(0.75 × (start − end)) + (start = 100 ? 1 : 0), start / end = count + penalty. If the team caught up to the
  // other team's count during its stint (the tie point), progress past that tie isn't penalised: end = the count at the
  // tie (its penalty was already counted off by then).
  _penalise(t) {
    const start = this.start[t];
    const end = this.tieEnd[t] != null ? Math.max(this.tieEnd[t], this.total(t)) : this.total(t);
    const p = Math.max(0, Math.round(ZONES.penaltyK * (start - end))) + (start === ZONES.count ? 1 : 0);
    this._net(['zp', t, p, r3(start), r3(end)]);
    this.penalty[t] += p;
    this.log.push({ t: this.match.duration - this.match.time, team: t, start, end, penalty: p, next: this.total(t) });
    emit('zones:penalty', { team: t, penalty: p, total: this.total(t), start, end });
  }

  _tick(t, dt) {
    const obj = this.active;
    const rate = obj.home < 0 ? ZONES.rateCenter : obj.home === t ? ZONES.rateHome : ZONES.rateAway;
    let d = rate * dt;
    const before = this.count[t], opp = this.count[1 - t];
    const fromPen = Math.min(this.penalty[t], d);
    this.penalty[t] -= fromPen; d -= fromPen;
    this.count[t] = Math.max(0, this.count[t] - d);
    // the tie point: this team (behind) has caught up with the other team's count (the other count can't move during
    // this team's stint, so behind now = behind at the start of it)
    if (this.tieEnd[t] == null && before > opp && this.count[t] <= opp) this.tieEnd[t] = opp;
  }

  // (each client fills its own players' gauges: a remote player's special meter is its owner's)
  _fillSpecials(dt) {
    let team = -1, rate = 0;
    if (this.owner >= 0) { team = 1 - this.owner; rate = ZONES.gaugeHeld; }
    else { team = this.losing(); rate = ZONES.gaugeNeutral; }
    if (team < 0) return;
    for (const a of this.match.actors) {
      if (a.team !== team || !a.alive || a.specialActive || a.remote) continue;
      const was = a.specialReady();
      a.special = Math.min(a.specialCost(), a.special + rate * dt);
      if (!was && a.specialReady()) emit('special:ready', { actor: a });
    }
  }

  // ---- per frame while the match is playing (and through overtime)
  update(dt) {
    if (this.winner != null) return;
    this.clock += dt;
    this.sampleT -= dt;
    if (this.sampleT <= 0) { this.sampleT = 1 / ZONES.sampleHz; this._sample(); }
    if (this.owner >= 0) {
      this._tick(this.owner, dt);   // (a follower predicts it; the host's snapshots correct it)
      this.holdT[this.owner] += dt;
      if (!this.follower && this.count[this.owner] <= 0 && this.penalty[this.owner] <= 0) return this._end(this.owner, 'knockout');
    } else this.neutralT += dt;
    this._fillSpecials(dt);
    if (this.follower) { if (this.overtime) this.overtimeT += dt; else if (!this.final) this.nextSwap -= dt; return; }
    if ((this.snapT -= dt) <= 0) {
      this.snapT = 0.5;
      this._net(['zs', r3(this.count[0]), r3(this.count[1]), r3(this.penalty[0]), r3(this.penalty[1]), Number.isFinite(this.nextSwap) ? r3(this.nextSwap) : -1,
        r3(this.overtimeT), r3(this.neutralT), r3(this.holdT[0]), r3(this.holdT[1])]);
    }
    // rotation: none in overtime, none once the last 30 s have started (this frame's clock tick reaches them → lock)
    if (this.overtime) this._overtime(dt);
    else if (!this.final) {
      if (this.match.time - dt <= FINAL) this._finalLock();
      else { this.nextSwap -= dt; if (this.nextSwap <= 0) this._swap(); }
    }
  }

  _swap(to = null, final = false) {
    const o = this.objectives;
    const next = to || (this.active === o[0] ? (Math.random() < 0.5 ? o[1] : o[2]) : o[0]);
    this._net(['za', o.indexOf(next), final ? 1 : 0]);
    for (const z of this.active.zones) z.owner = -1;
    this.active = next;
    // a new objective starts neutral on bare floor (wiped as it's revealed); control is re-read from the ink after
    for (const z of next.zones) { z.owner = -1; z.warnArmed = true; this._flood(z, -1); }
    if (final) this.nextSwap = 0; else this._schedule();
    if (this.owner !== -1) { this.owner = -1; this.neutralT = 0; emit('zones:control', { owner: -1, prev: this.lastOwner, objective: next.id }); }
    this.sampleT = 0;
    emit('zones:active', { objective: next.id, zones: next.zones.map((z) => z.id), final, moved: true });
  }

  // the last 30 s: the centre only from here to the end (overtime included)
  _finalLock() {
    this.final = true;
    this.nextSwap = 0;
    const C = this.objectives[0];
    if (this.active !== C) this._swap(C, true);
    else { this._net(['zf']); emit('zones:active', { objective: C.id, zones: C.zones.map((z) => z.id), final: true, moved: false }); }
  }

  // ---- time's up. Returns true when the match should end now; false = overtime has begun.
  timeUp() {
    const L = this.losing();
    const grace = this.owner === -1 && this.lastOwner === L && this.neutralT < ZONES.overtimeGrace;
    if (L >= 0 && (this.owner === L || grace)) {
      this.overtime = true; this.overtimeT = 0; this.otLosing = L;
      this._net(['zt', L]);
      emit('zones:overtime', { losing: L });
      return false;
    }
    if (L < 0) {
      // level at the horn: sudden death — play on until someone gets ahead (or the overtime cap)
      this.overtime = true; this.overtimeT = 0;
      this._net(['zt', -1]);
      emit('zones:overtime', { losing: -1 });
      return false;
    }
    this._end(1 - L, 'time');
    return true;
  }

  // Overtime ends when: the losing team's count gets below the winning team's (it wins; its penalty is counted off first); the losing team is off the objective for
  // 10 s (two-zone centre: the winning team holds at least one zone neutral / theirs for 10 s); the winning team takes
  // the objective (both zones on a two-zone centre); or after 5 minutes.
  _overtime(dt) {
    this.overtimeT += dt;
    // the team behind at the horn stays "L" (read live, it would flip the moment L's count passes W's and a comeback
    // would end as a retake); sudden death from a tie: whoever falls behind first
    let L = this.otLosing;
    if (L < 0) {
      L = this.losing();
      if (L < 0) {                                                        // still level
        if (this.overtimeT >= ZONES.overtimeMax) this._end(this._tiebreak(), 'overtime-cap');
        return;
      }
    }
    const W = 1 - L;
    if (this.count[L] < this.count[W]) return this._end(L, 'comeback');
    if (this.owner === W) return this._end(W, 'retake');
    if (this.owner !== L && this.neutralT >= ZONES.overtimeGrace) return this._end(W, 'neutralised');
    if (this.overtimeT >= ZONES.overtimeMax) return this._end(W, 'overtime-cap');
  }

  _tiebreak() {
    const s = [0, 0];
    for (const z of this.active.zones) { s[0] += z.share[0]; s[1] += z.share[1]; }
    return s[0] === s[1] ? (Math.random() < 0.5 ? 0 : 1) : s[0] > s[1] ? 0 : 1;
  }

  _end(winner, reason) {
    if (this.winner != null) return;
    this._net(['ze', winner, reason, r3(this.count[0]), r3(this.count[1]), r3(this.penalty[0]), r3(this.penalty[1])]);   // (the final numbers, exact)
    this.winner = winner; this.reason = reason;
    emit('zones:end', { winner, reason, counts: [...this.count], penalty: [...this.penalty] });
    this.match.endZones?.(winner, reason);
  }

  // ---- online: a follower replays the host's records (netmatch 'z', on the host's event timeline)
  netEvent(e) {
    if (!Array.isArray(e) || !this.follower || this.winner != null) return;
    switch (e[0]) {
      case 'zz': { const z = this.zones[e[1]]; if (z) this._zoneOwner(z, e[2]); break; }
      case 'zo': {
        const o = e[1], prev = this.owner;
        if (o === prev) break;
        this.owner = o;
        if (o === -1) this.neutralT = 0;
        else { if (this.lastOwner !== o) { this.start[o] = this.total(o); this.tieEnd[o] = null; } this.lastOwner = o; }   // (kept for a host migration)
        this.holdT[0] = this.holdT[1] = 0;
        emit('zones:control', { owner: o, prev, objective: this.active.id });
        break;
      }
      case 'zp': {
        const [, t, p, start, end] = e;
        this.penalty[t] += p;
        this.log.push({ t: this.match.duration - this.match.time, team: t, start, end, penalty: p, next: this.total(t) });
        emit('zones:penalty', { team: t, penalty: p, total: this.total(t), start, end });
        break;
      }
      case 'za': { const next = this.objectives[e[1]]; if (!next) break; if (e[2]) { this.final = true; } this._swap(next, !!e[2]); break; }
      // 丢词大作战：某区域立句 / 联句（跟随端重放，保证与主机一致）
      case 'zq': { const z = this.zones[e[1]]; if (z && e[2] >= 0 && e[2] <= 1) { z.poem[e[2]] = { poemId: e[3], line: e[4] }; emit('zones:poem', { zone: z, team: e[2], poemId: e[3], line: e[4] }); } break; }
      case 'zl': {
        const a = this.zones[e[1]], b = this.zones[e[2]];
        if (a && b) { const r = { kind: 'link', poemId: e[4] }; a.link = r; b.link = r; emit('zones:link', { a, b, team: e[3], poemId: e[4], bonus: POEM_SCORE.link }); }
        break;
      }
      case 'zf': {
        this.final = true; this.nextSwap = 0;
        const C = this.objectives[0];
        emit('zones:active', { objective: C.id, zones: C.zones.map((z) => z.id), final: true, moved: false });
        break;
      }
      case 'zt': this.overtime = true; this.overtimeT = 0; this.otLosing = e[1]; emit('zones:overtime', { losing: e[1] }); break;
      case 'zs': {
        const [, c0, c1, p0, p1, ns, ot, nt, h0, h1] = e;
        this.count[0] = c0; this.count[1] = c1; this.penalty[0] = p0; this.penalty[1] = p1;
        this.nextSwap = ns < 0 ? Infinity : ns;
        this.overtimeT = ot; this.neutralT = nt; this.holdT[0] = h0; this.holdT[1] = h1;
        break;
      }
      case 'ze':
        if (e.length > 3) { this.count[0] = e[3]; this.count[1] = e[4]; this.penalty[0] = e[5]; this.penalty[1] = e[6]; }
        this._end(e[1], e[2]);
        break;
    }
  }

  // snapshot for the HUD / results / tests
  state() {
    return {
      active: this.active.id, owner: this.owner, lastOwner: this.lastOwner,
      count: this.count.map((c) => Math.ceil(c)), penalty: [...this.penalty], total: [Math.ceil(this.total(0)), Math.ceil(this.total(1))],
      zones: this.active.zones.map((z) => ({ id: z.id, owner: z.owner, share: z.share.map((s) => +s.toFixed(3)), cells: z.cells.length, center: z.center,
        // 丢词大作战：该区域写着哪句诗、是否成句、是否联句（HUD 用来显示地上那句）
        poem: [z.poem[0], z.poem[1]], poemOf: z.poemOf, link: z.link })),
      nextSwap: this.final || !Number.isFinite(this.nextSwap) ? 0 : +this.nextSwap.toFixed(1), final: this.final, overtime: this.overtime, overtimeT: +this.overtimeT.toFixed(1), neutralT: +this.neutralT.toFixed(1),
      winner: this.winner, reason: this.reason, placeholder: this.placeholder,
    };
  }
}
