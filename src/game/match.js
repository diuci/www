// Match: turf-war rules, lifecycle (intro → countdown → play → time's up → judge → results), team setup.
import * as THREE from 'three';
import { G, emit, on, clamp } from '../core/ctx.js';
import { MATCH, PLAYER, WEAPON_ORDER, SUB_ORDER, SPECIAL_ORDER, BOT_NAMES, TEAM_NAMES, ZONES } from '../config.js';
import { ZoneControl } from './zones.js';
import { assignPoems, judgePair, POEM_SCORE } from './poems/assign.js';
import { PoemQuiz, QUIZ } from './poems/quiz.js';
import { randomStyle } from './character-style.js';
import { Actor } from './actor.js';
import { BotBrain } from './bots.js';
import { PlayerController } from './player.js';
import { BossMode, BOSS_MODE } from '../boss/bossMode.js';

const _v = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);

export class Match {
  constructor(opts) {
    this.opts = opts;          // { duration, difficulty, attract, practice, playerName, weapon, CharacterClass, input, rig, mode }
    this.attract = !!opts.attract;
    this.practice = !!opts.practice;   // solo on an empty stage: no enemies, no teammates, no clock
    // turf | zones (Zone Control) | boss (one squad, team 0, vs HULLBREAKER); attract backdrops and practice are turf
    this.mode = this.attract || this.practice ? 'turf' : opts.mode === 'boss' ? 'boss' : opts.mode === 'zones' ? 'zones' : 'turf';
    this.duration = opts.duration || (this.mode === 'zones' ? ZONES.duration : this.mode === 'boss' ? BOSS_MODE.duration : MATCH.defaultDuration);
    this.zones = null;             // ZoneControl (Zone Control mode)
    this.time = this.duration;
    this.state = 'init';
    this.stateT = 0;
    this.actors = [];
    this.controller = null;
    this.result = null;
    this.paused = false;
    this.lastMinuteFired = false;
    this.lastCount = 99;
    this.events = [];
  }

  playing() { return this.state === 'playing' && !this.paused; }
  canRespawn() { return this.state === 'playing'; }

  setup() {
    const o = this.opts;
    const CharacterClass = o.CharacterClass;
    if (o.roster) { this._setupRoster(o, CharacterClass); return; }
    // weapons: each team gets a balanced mix
    const pickTeam = (first) => {
      const pool = [...WEAPON_ORDER];
      const out = [];
      if (first) { out.push(first); pool.splice(pool.indexOf(first), 1); }
      while (out.length < MATCH.teamSize) {
        if (!pool.length) pool.push(...WEAPON_ORDER);
        out.push(pool.splice((Math.random() * pool.length) | 0, 1)[0]);
      }
      return out;
    };
    const names = shuffle([...BOT_NAMES]);
    let ni = 0;
    const boss = this.mode === 'boss';
    // humans-only stage (config noBots) offline: a match is just you (the ?devstage walk), the attract backdrop nobody
    // (o.mannequins: idle, brainless kids for the render audits)
    const noBots = !!o.noBots;
    for (let team = 0; team < (boss || this.practice ? 1 : 2); team++) {
      const weapons = pickTeam(team === 0 && !this.attract ? o.weapon : null);
      if (boss) weapons.push(...pickTeam(null));   // the whole squad on one side: 8 kids, every weapon kind
      for (let s = 0; s < (this.practice ? 1 : boss ? BOSS_MODE.squad : MATCH.teamSize); s++) {
        const isLocal = team === 0 && s === 0 && !this.attract;
        if (noBots && !isLocal && !(this.attract && o.mannequins)) continue;
        // subs: yours from the loadout; bots carry a random one (about half keep their weapon's default)
        const sub = isLocal ? o.sub : Math.random() < 0.5 ? null : SUB_ORDER[(Math.random() * SUB_ORDER.length) | 0];
        const special = isLocal ? o.special : Math.random() < 0.5 ? null : SPECIAL_ORDER[(Math.random() * SPECIAL_ORDER.length) | 0];
        const a = new Actor({
          team, slot: s, weapon: weapons[s], sub, special, isLocal, isBot: !isLocal,
          name: isLocal ? (o.playerName || 'You') : names[ni++ % names.length],
          // your look from the Locker (an empty style resolves from your name); bots get random looks
          style: isLocal ? { ...(o.style || {}) } : randomStyle(), CharacterClass,
        });
        if (isLocal && o.style) { /* reserved for future customisation */ }
        G.scene.add(a.character.root);
        if ((!isLocal || o.autopilot) && !(noBots && !isLocal)) a.bot = new BotBrain(a, o.difficulty);
        this.actors.push(a);
      }
    }
    G.actors = this.actors;
    this.local = this.actors.find((a) => a.isLocal) || null;
    G.local = this.local;
    if (this.local && !o.autopilot) this.controller = new PlayerController(this.local, o.rig, o.input);
    // initial placement on the spawn decks (standing, no drop)
    for (const a of this.actors) {
      const pad = G.level.spawnPads[a.team];
      const ang = (a.slot / (this.mode === 'boss' ? BOSS_MODE.squad : 4)) * Math.PI * 2 + 0.6, rr = this.mode === 'boss' ? 1.7 : 1.2;
      _v.set(pad.x + Math.cos(ang) * rr, pad.y, pad.z + Math.sin(ang) * rr);
      a.spawnAt(_v, a.team === 0 ? 0 : Math.PI);
      a.invuln = 0;
      if (a.bot) { a.bot.aimYaw = a.yaw; a.bot.aimPitch = 0; }
    }
    this.unsubs = [
      on('splatted', (e) => this._onSplatted(e)),
    ];
    if (this.mode === 'zones') {
      this.zones = new ZoneControl(this);
      this.unsubs.push(on('turf', (e) => this._zoneTurf(e)));
      this._assignTeamPoems();
      // 丢词大作战：接诗玩法（区域控制模式下才出题）
      this.quiz = new PoemQuiz(this);
      this.quizEnabled = this.opts.quiz !== false;   // 设置里的"接诗答题"开关
    }
    if (this.mode === 'boss') { this.bossMode = new BossMode(this); this.boss = this.bossMode.boss; }
  }

  // 接诗判定结果：答对了给全队奖励，并把这两句刻到答题者脚下的地上
  onQuizResult(q, res) {
    const ok = !!res?.ok;
    const who = res?.actor || this.local;
    if (ok && who) {
      // 全队大招能量补给（答对的那一下要有仪式感）
      for (const a of this.actors) {
        if (a.team !== who.team || !a.alive) continue;
        if (!a.specialActive) a.special = Math.min(a.specialCost(), a.special + a.specialCost() * QUIZ.rewardSpecial);
        a.ink = PLAYER.inkMax;
      }
      who.stats.links = (who.stats.links || 0) + 1;
    } else if (res && who) {
      who.ink = Math.min(PLAYER.inkMax, who.ink + PLAYER.inkMax * QUIZ.wrongInk);
    }
    emit('poem:quiz', { q, res, ok, who: who?.name, team: who?.team });
  }

  // 在答题者脚下刻出这两句诗（zone 模式：刻在他所在的区域）
  stampPoemAt(actor, text, team) {
    const Z = this.zones;
    if (!Z || !actor) return false;
    // 找他所在的区域；不在区域里就刻在最近的区域
    const z = Z.zones.find((zz) => inZone(zz.def, actor.pos)) ||
      Z.zones.reduce((best, zz) => {
        const d = Math.hypot(zz.center[0] - actor.pos.x, zz.center[2] - actor.pos.z);
        return !best || d < best.d ? { zz, d } : best;
      }, null)?.zz;
    if (!z || !G.paint?.stampText) return false;
    z.poem[team] = { poemId: null, line: 0, text };
    return G.paint.stampText(z.region, text, team === 0 ? 0 : 1, { gain: 1 });
  }

  // 丢词大作战：给每个队员分一句诗（同队不撞诗），并把它记到该队的"立句"上。
  // 玩家的选择由选诗界面写入 actor.poem；没有选择时按武器给默认诗。
  _assignTeamPoems() {
    if (!this.zones) return;
    const grade = this.opts.grade || 1;
    for (const team of [0, 1]) {
      const members = this.actors.filter((a) => a.team === team);
      const picks = assignPoems(members.map((a) => a.weaponId), grade);
      members.forEach((a, i) => { if (!a.poem) a.poem = picks[i]; });
    }
    // 区域立句：一个区域默认由"该队第一个踏上它的队员"立句，这里先给出初始句，避免开局无句可占。
    // 注意：同一首诗只给一个区域，相邻区域才可能凑成"联句"。
    for (const team of [0, 1]) {
      const members = this.actors.filter((a) => a.team === team);
      if (!members.length) continue;
      this.zones.zones.forEach((z, i) => {
        const who = members[i % members.length];
        if (who?.poem) this.zones.setZonePoem(z.id, team, who.poem.id, 0);
      });
    }
  }

  // 联句达成时的回调（HUD / 音效 / 结算订阅 zones:link，这里只留一个钩子给未来加分）
  onPoemLink(team, poemId, a, b) {
    this.links = this.links || [];
    this.links.push({ team, poemId, zones: [a.id, b.id], t: this.duration - this.time });
  }

  // Online: the host's roster — who owns which squidkid (players their own, the host the bots).
  _setupRoster(o, CharacterClass) {
    const me = o.myId;
    this.follower = !o.host;
    for (const r of o.roster) {
      const mine = r.owner === me;
      const a = new Actor({ team: r.team, slot: r.slot, weapon: r.weapon, sub: r.sub || null, special: r.special || null, isLocal: mine && !r.bot, isBot: r.bot, name: r.name, style: r.style || undefined, CharacterClass });
      a.nid = r.nid; a.owner = r.owner; a.remote = !mine;
      G.scene.add(a.character.root);
      if (mine && (r.bot || o.autopilot)) a.bot = new BotBrain(a, o.difficulty);
      this.actors.push(a);
    }
    G.actors = this.actors;
    this.local = this.actors.find((a) => a.isLocal) || null;
    G.local = this.local;
    if (this.local && !o.autopilot) this.controller = new PlayerController(this.local, o.rig, o.input);
    for (const a of this.actors) {
      const pad = G.level.spawnPads[a.team];
      const ang = (a.slot / (this.mode === 'boss' ? BOSS_MODE.squad : 4)) * Math.PI * 2 + 0.6, rr = this.mode === 'boss' ? 1.7 : 1.2;
      _v.set(pad.x + Math.cos(ang) * rr, pad.y, pad.z + Math.sin(ang) * rr);
      a.spawnAt(_v, a.team === 0 ? 0 : Math.PI);
      a.invuln = 0;
      if (a.bot) { a.bot.aimYaw = a.yaw; a.bot.aimPitch = 0; }
    }
    this.unsubs = [on('splatted', (e) => this._onSplatted(e))];
    if (this.mode === 'zones') {   // Zone Control online: the host runs the rules, guests follow (zones.js netEvent)
      this.zones = new ZoneControl(this);
      this.unsubs.push(on('turf', (e) => this._zoneTurf(e)));
    }
    if (this.mode === 'boss') { this.bossMode = new BossMode(this); this.boss = this.bossMode.boss; }
  }

  // Zone Control: ink laid while standing on (or aiming into) the live zone counts as objective play (results / XP)
  _zoneTurf({ actor, area }) {
    const Z = this.zones;
    if (!Z || this.state !== 'playing' || !actor || !(area > 0)) return;
    const zoneOf = (p) => (p ? Z.active.zones.find((z) => inZone(z.def, p)) : null);
    const z = zoneOf(actor.pos) || zoneOf(actor.aimPoint);
    if (!z) return;
    actor.stats.zoneTurf = (actor.stats.zoneTurf || 0) + area;
    // 丢词大作战：在这块区域上涂地，收益取决于"你写的这句和这块地上已有的句对不对得上"。
    //   同一首诗相邻两句 → 联句（翻倍）；不同诗 → 搭错（减半）；本区域还没句 → 基准
    actor.poemMul = this._poemMulFor(actor, z);
  }

  // 队员 actor 在区域 z 上涂地的收益倍率
  _poemMulFor(actor, z) {
    const mine = actor.poem;
    if (!mine) return POEM_SCORE.solo;
    const other = z.poem[actor.team];
    if (!other || other.poemId === mine.id) return POEM_SCORE.solo;      // 还没句，或与已有句同诗 → 基准
    // 该区域写着另一首诗：看能不能和自己的接上
    const r = judgePair(other, { poemId: mine.id, line: 0 });
    if (r.kind === 'link') return POEM_SCORE.link;
    if (r.kind === 'mismatch') { actor.stats.mismatches++; return POEM_SCORE.mismatch; }
    return POEM_SCORE.solo;
  }

  // Zone Control decided the match (knockout / overtime result): straight to time's up
  endZones(winner, reason) {
    this.zoneResult = { winner, reason };
    if (this.state === 'playing') { this.time = Math.max(0, this.time); this.setState('finish'); }
  }

  start() {
    this.setState(this.attract || this.practice ? 'playing' : 'intro');
  }

  setState(s) {
    this.state = s; this.stateT = 0;
    emit('match:state', { state: s, match: this });
  }

  dispose() {
    this.bossMode?.dispose(); this.bossMode = null; this.boss = null;
    for (const a of this.actors) { G.scene.remove(a.character.root); a.weaponRunner.reset(); a.character.dispose?.(); }
    this.unsubs?.forEach((u) => u());
    G.actors = [];
    G.local = null;
  }

  // Online, humans-only stage (config noBots): a player left, and nobody takes over their squidkid — it bursts into its
  // own ink and is gone. HUD squads, the minimap, specials / weapons and the judge all read this.actors (G.actors is the
  // same array), so dropping it here is all they need.
  removeActor(a) {
    const i = this.actors.indexOf(a);
    if (i < 0) return;
    if (a.alive && a.character.root.visible) {
      _v.copy(a.pos); _v.y += 0.6;
      G.fx?.splatted(_v, a.color);
      G.fx?.burst?.(_v, _up, a.color, { count: 18, speed: 5, size: 0.1 });
      G.audio?.play?.('splat_big', { pos: a.pos, volume: 0.6 });
    }
    this.actors.splice(i, 1);
    if (G.rig?.spectate?.actor === a) G.rig.spectate.actor = null;   // a death cam watching them looks on at the spot
    G.scene.remove(a.character.root); a.weaponRunner.reset(); a.character.dispose?.();
    emit('actor:removed', { actor: a });
  }

  _onSplatted({ victim, attacker, cause }) {
    this.events.push({ t: this.duration - this.time, victim, attacker, cause });
  }

  update(dt) {
    if (this.paused) return;
    this.stateT += dt;
    switch (this.state) {
      case 'intro':
        if (this.stateT > (this.bossMode ? BOSS_MODE.intro : 4.2)) this.setState('playing');
        break;
      case 'playing': {
        if (this.practice) break;   // practice never runs out
        if (this.zones) {
          this.zones.update(dt);
          if (this.state !== 'playing') break;         // knockout / overtime decided it
          if (this.zones.overtime) break;              // the clock stays at 0 through overtime
        }
        this.quiz?.update(dt);      // 丢词大作战：接诗出题（不暂停游戏）
        this.time -= dt;
        if (!this.attract) {
          if (!this.lastMinuteFired && this.time <= 60 && this.duration > 60) { this.lastMinuteFired = true; emit('match:oneminute', {}); }
          const c = Math.ceil(this.time);
          if (this.time <= MATCH.finalCountdown && c !== this.lastCount && c > 0) { this.lastCount = c; emit('match:count', { n: c }); }
        }
        if (this.time <= 0) {
          this.time = 0;
          // Zone Control may go to overtime instead; online, the host calls time
          if (!this.follower && (!this.zones || this.zones.timeUp())) { if (this.state === 'playing') this.setState('finish'); }
        }
        break;
      }
      case 'finish':
        if (this.stateT > (this.bossMode ? (this.bossMode.boss.dead ? BOSS_MODE.finishWin : BOSS_MODE.finishLose) : 2.6) && !this.follower && !this.result) this._judge();
        break;
    }
    // actors (the local controller runs once per rendered frame via updateController)
    const live = this.state === 'playing';
    for (const a of this.actors) {
      if (a.bot) {
        if (live) a.bot.update(dt);
        else { a.intent.move.set(0, 0, 0); a.intent.fire = a.intent.squid = a.intent.sub = a.intent.jump = a.intent.special = false; }
      }
    }
    const nm = G.netm;
    for (const a of this.actors) { if (a.remote && nm) nm.applyRemote(a, dt); else a.update(dt); }
    this.bossMode?.update(dt);
    // soft push between actors
    for (let i = 0; i < this.actors.length; i++) for (let j = i + 1; j < this.actors.length; j++) {
      const a = this.actors[i], b = this.actors[j];
      if (!a.alive || !b.alive) continue;
      const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z, dy = b.pos.y - a.pos.y;
      const d2 = dx * dx + dz * dz;
      const r = PLAYER.radius * 1.7;
      if (d2 < r * r && Math.abs(dy) < 1.2 && d2 > 1e-5) {
        // online: other players' squidkids are where their owners say — only your own side gives way
        const ka = a.remote ? 0 : b.remote ? 1 : 0.5, kb = b.remote ? 0 : a.remote ? 1 : 0.5;
        const d = Math.sqrt(d2), push = (r - d);
        a.pos.x -= (dx / d) * push * ka; a.pos.z -= (dz / d) * push * ka;
        b.pos.x += (dx / d) * push * kb; b.pos.z += (dz / d) * push * kb;
      }
    }
  }

  updateController(dt) {
    if (!this.controller) return;
    this.controller.enabled = this.state === 'playing' && !this.paused && this.local.alive;
    this.controller.update(dt);
  }

  _judge() {
    if (this.zones) {
      const Z = this.zones;
      // 丢词大作战：除涂地占点外，联句次数也计入结算（供 XP 与结果页展示）
      const links = [0, 1].map((t) => this.actors.filter((a) => a.team === t).reduce((s, a) => s + (a.stats.links || 0), 0));
      this.result = { mode: 'zones', coverage: G.paint.coverage(), winner: Z.winner ?? (Math.random() < 0.5 ? 0 : 1), reason: Z.reason,
        counts: [Math.ceil(Z.count[0]), Math.ceil(Z.count[1])], penalty: [...Z.penalty], overtime: Z.overtime, log: Z.log,
        links, poems: this.actors.map((a) => ({ name: a.name, team: a.team, poem: a.poem ? { id: a.poem.id, title: a.poem.title } : null })) };
      G.netm?.sendResult(this.result);        // online: every client shows the host's result
      this.setState('judge');
      return;
    }
    if (this.bossMode) {
      this.result = this.bossMode.result();
      G.netm?.sendResult(this.result);
      this.setState('judge');
      return;
    }
    const cov = G.paint.coverage();
    const win = cov[0] === cov[1] ? (Math.random() < 0.5 ? 0 : 1) : cov[0] > cov[1] ? 0 : 1;
    this.result = { coverage: cov, winner: win };
    G.netm?.sendResult(this.result);        // online: every client shows the host's count
    this.setState('judge');
  }

  teamSummary() {
    return [0, 1].map((t) => ({
      color: G.teamHex[t],
      players: this.actors.filter((a) => a.team === t).map((a) => ({
        name: a.name, weapon: a.weaponId, alive: a.alive, respawn: a.alive ? 0 : Math.max(0, a.respawnTimer), specialReady: a.specialReady(), isSelf: a.isLocal,
      })),
    }));
  }
}

// a point on (or just above) a zone: inside one of its outlines, near its floor heights
function inZone(def, p) {
  if (p.y < (def.y0 ?? -2) - 1 || p.y > (def.y1 ?? 6) + 2.5) return false;
  for (const poly of def.polys || [def.poly]) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, zi] = poly[i], [xj, zj] = poly[j];
      if ((zi > p.z) !== (zj > p.z) && p.x < ((xj - xi) * (p.z - zi)) / (zj - zi) + xi) inside = !inside;
    }
    if (inside) return true;
  }
  return false;
}

function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; }
