// INKWAVE — offline stand-in for `G.net` (contract: docs/NET.md) so the online UI can be built, demoed and audited
// without the relay. menus.js installs it when the page URL carries ?netmock=1 (it then replaces any real session for
// that page load); the real src/net/session.js is used otherwise.
//
// Simulated room life: squidkids join / leave / ready up / swap weapons and looks / emote on timers, pings jitter,
// a simulated host starts the match once everyone is ready (when you are a guest), matches "run" for a few seconds
// and everyone comes back to the lobby.
//
// Magic codes for join():  ZZZZZ → 'Room not found' · FULLY → 'Room is full' · BUZYY → 'Match in progress' ·
// NETXX → 'Could not connect'. Any other valid code joins someone else's room as a guest.
//
// URL knobs: ?mockauto=0 (timeline paused: nothing happens on its own) · ?mockfill=N (N others already in the room on
// create / join) · ?mocklat=ms (connect latency, default 700) · ?mockmatch=s (match length, default 6).
// Debug handle (G.net.mock): auto(on) · add({ name, team, weapon, style, ready }) → id · drop(id) · ready(id, v) ·
// emote(id, name) · swap(id, { weapon, style }) · fill(n) · clear() · host(id) · startMatch() · endMatch() · lose(msg)
import { G } from '../core/ctx.js';
import { WEAPON_ORDER, MAPS, TEAM_PALETTES, mapNoBots, mapBossOk, bossFallbackMap, noBotsStartBlock } from '../config.js';
import * as LOOK from '../game/character-style.js';

const q = new URLSearchParams(typeof location !== 'undefined' ? location.search : '');
const NAMES = ['Mako', 'Tentakool', 'inkjet', 'Wavebreaker', 'Tidal Tia', 'Blot', 'Pixel', 'Kraken Kai', 'sploosh', 'Lulu',
  'Squee', 'Dashi', 'Juniper', 'Rin', 'Otto', 'Beanie', 'Glub', 'Zippy', 'Nibbles', 'Coraline', 'Seafoam', 'Momo'];
const EMOTES = ['booyah', 'wave', 'dance', 'flex'];
const CODE_ABC = 'BCEFGHJKLMNPQRTUVXYZ23456789'; // no O/0, I/1, W/A/S/D (as session.js)
const FAIL = { ZZZZZ: 'Room not found', FULLY: 'Room is full', BUZYY: 'Match in progress', NETXX: 'Could not connect' };
const clone = (o) => JSON.parse(JSON.stringify(o));
const rnd = Math.random;
const pick = (a) => a[(rnd() * a.length) | 0];

export class MockNet {
  constructor() {
    this.state = 'offline';
    this.code = null;
    this.myId = null;
    this.hostId = null;
    this.error = null;
    this.lobby = null;
    this.startAt = 0;          // performance.now() when the match launches (state 'starting' → 'match')
    this.isMock = true;
    this._ls = new Map();
    this._timers = new Set();
    this._seq = 0;
    this._auto = q.get('mockauto') !== '0';
    this._lat = Math.max(0, +(q.get('mocklat') ?? 700) || 0);
    this._fill = q.has('mockfill') ? Math.max(0, Math.min(7, +q.get('mockfill') | 0)) : null;
    this._matchS = Math.max(1, +(q.get('mockmatch') ?? 6) || 6);
    this._pending = 0;
    this.mock = {
      auto: (on = true) => { this._auto = !!on; if (on) this._schedule(); },
      add: (o) => this._add(o || {}),
      drop: (id) => this._drop(id, 'left'),
      ready: (id, v) => this._patch(id, { ready: v == null ? !this._p(id)?.ready : !!v }),
      emote: (id, name) => { if (this._p(id)) this._emit('emote', { id, name: name || pick(EMOTES) }); },
      swap: (id, o) => this._patch(id, o || { weapon: pick(WEAPON_ORDER), style: LOOK.randomStyle(rnd) }),
      fill: (n = 7) => { const others = () => (this.lobby ? this.lobby.players.length - 1 : 0); while (this.lobby && others() < Math.min(7, n)) this._add({}); },
      clear: () => { if (!this.lobby) return; for (const p of this.lobby.players.slice()) if (!p.you) this._drop(p.id, 'left'); },
      host: (id) => this._migrate(id),
      startMatch: () => this._launch(),
      endMatch: () => this._endMatch(),
      lose: (msg = 'Connection lost') => this._lose(msg),
    };
  }

  // ------------------------------------------------------------------ contract
  get isHost() { return !!this.myId && this.myId === this.hostId; }

  on(ev, fn) {
    if (!this._ls.has(ev)) this._ls.set(ev, new Set());
    this._ls.get(ev).add(fn);
    return () => this._ls.get(ev)?.delete(fn);
  }

  async create(name) {
    if (this.state !== 'offline' && this.state !== 'error') return this.code;
    this._reset();
    this._setState('connecting');
    const tok = ++this._pending;
    await this._sleep(this._lat * (0.8 + rnd() * 0.5));
    if (tok !== this._pending || this.state !== 'connecting') throw new Error('Cancelled');
    this.code = Array.from({ length: 5 }, () => pick(CODE_ABC)).join('');
    this.myId = this._id();
    this.hostId = this.myId;
    const s = G.settings || {};
    this.lobby = {
      map: MAPS.some((m) => m.id === s.lastStage) ? s.lastStage : MAPS[0].id,
      time: (s.stageTimes && s.stageTimes[s.lastStage]) === 'dusk' ? 'dusk' : 'day',
      duration: s.matchLength === 90 ? 90 : 180, bots: true, difficulty: s.difficulty || 'normal',
      palette: G.game && G.game.paletteIndex ? G.game.paletteIndex() : 0,
      players: [this._me(name, 0, true)], maxPlayers: 8,
    };
    this._botsPref = true;
    if (mapNoBots(this.lobby.map)) this.lobby.bots = false;
    this._setState('lobby');
    this._emit('lobby', { lobby: this.lobby });
    const n = this._fill ?? 0;
    for (let i = 0; i < n; i++) this._later(900 + i * 700, () => this._add({}));
    this._schedule();
    return this.code;
  }

  async join(code, name) {
    code = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (this.state !== 'offline' && this.state !== 'error') throw new Error('Already in a room');
    this._reset();
    this._setState('connecting');
    const tok = ++this._pending;
    await this._sleep(this._lat * (0.9 + rnd() * 0.6) + (code === 'NETXX' ? 1800 : 0));
    if (tok !== this._pending || this.state !== 'connecting') throw new Error('Cancelled');
    const fail = code.length < 4 ? 'Room not found' : FAIL[code];
    if (fail) {
      this.error = fail;
      this._setState('error');          // like the real session: a failed connect leaves state 'error' + G.net.error
      this._emit('error', { message: fail });
      throw new Error(fail);
    }
    this.code = code;
    const hostId = this._id();
    const host = this._bot({ id: hostId, team: 0, host: true, ready: true });
    this.lobby = {
      map: pick(MAPS).id, time: rnd() < 0.4 ? 'dusk' : 'day', duration: rnd() < 0.3 ? 90 : 180, bots: rnd() < 0.8,
      difficulty: pick(['easy', 'normal', 'normal', 'hard']), palette: (rnd() * TEAM_PALETTES.length) | 0, players: [host], maxPlayers: 8,
    };
    if (mapNoBots(this.lobby.map)) this.lobby.bots = false;   // (the stage rules, as a real host applies them)
    const others = this._fill ?? (2 + ((rnd() * 3) | 0));
    for (let i = 1; i < others; i++) this.lobby.players.push(this._bot({ team: this._teamFor(), ready: rnd() < 0.45 }));
    this.hostId = hostId;
    this.myId = this._id();
    this.lobby.players.push(this._me(name, this._teamFor(), false));
    this._setState('lobby');
    this._emit('lobby', { lobby: this.lobby });
    this._schedule();
    return this.code;
  }

  leave() {
    this._pending++;
    this._reset();
    if (this.state !== 'offline') this._setState('offline');
  }

  setMe(o = {}) {
    const me = this._p(this.myId);
    if (!me || !this.lobby) return;
    const patch = {};
    if (o.name != null) patch.name = String(o.name).slice(0, 16) || me.name;
    if (o.weapon != null) patch.weapon = o.weapon;
    if (o.style != null) patch.style = { ...o.style };
    if (o.ready != null && this.state === 'lobby' && !me.host) patch.ready = !!o.ready;
    if (o.team != null) {
      const want = o.team === 'auto' ? this._teamFor(me.id) : (o.team ? 1 : 0);
      const n = this.lobby.players.filter((p) => p.team === want && p.id !== me.id).length;
      if (want !== me.team) {
        if (n >= 4) { this._later(this._rtt(), () => this._emit('error', { message: `Team ${want ? 'Bravo' : 'Alpha'} is full` })); }
        else { patch.team = want; patch.ready = false; }
      }
    }
    this._later(this._rtt(), () => this._patch(me.id, patch));
  }

  setSettings(o = {}) {
    if (!this.isHost || !this.lobby || this.state !== 'lobby') return;
    const L = this.lobby, wasMap = L.map;
    if (o.map && MAPS.some((m) => m.id === o.map)) L.map = o.map;
    if (o.time === 'day' || o.time === 'dusk') L.time = o.time;
    if (o.duration) L.duration = +o.duration;
    if (o.bots != null) this._botsPref = !!o.bots;
    if (o.difficulty) L.difficulty = o.difficulty;
    if (o.mode === 'turf' || o.mode === 'boss') L.mode = o.mode;   // Boss Battle lobby setting (UI testing)
    if (Number.isInteger(o.palette) && TEAM_PALETTES[o.palette]) L.palette = o.palette;
    // stage rules, exactly as session.js applies them (no Boss Battle on a noBoss stage, no bots on a noBots one)
    if (L.mode === 'boss' && !mapBossOk(L.map)) L.map = bossFallbackMap(wasMap);
    L.bots = mapNoBots(L.map) ? false : (this._botsPref ?? L.bots);
    this._emit('lobby', { lobby: this.lobby });
  }

  canStart() {
    if (!this.isHost || !this.lobby || this.state !== 'lobby') return false;
    return !this.startBlock() && this.lobby.players.every((p) => p.host || p.ready);
  }
  startBlock() { return noBotsStartBlock(this.lobby); }

  start() {
    if (!this.canStart()) return;
    this._launch();
  }

  emote(name) {
    if (!this.lobby || !EMOTES.includes(name)) return;
    this._emit('emote', { id: this.myId, name });
  }

  // ------------------------------------------------------------------ simulation
  // Same beat the real session is asked to honour (docs/NET.md → Requests): state 'starting', let the lobby play its
  // countdown + launch (menus.launchLobby() resolves when the screen can be taken over), then the match.
  async _launch() {
    if (!this.lobby || this.state !== 'lobby') return;
    const L = this.lobby;
    this.startAt = performance.now() + 3600;
    this._setState('starting');
    this._emit('match', { phase: 'start' });
    const beat = G.menus && G.menus.launchLobby ? G.menus.launchLobby() : null;
    await Promise.race([beat || this._sleep(3600), this._sleep(8000)]);
    if (this.state !== 'starting' || this.lobby !== L) return;
    this._setState('match');
    this._later(this._matchS * 1000, () => this._endMatch());
  }

  /** main.js calls this when the results are done (real session: back to the lobby, room stays). */
  endMatch() { this._endMatch(true); }

  _endMatch(now = false) {
    if (this.state !== 'match' && this.state !== 'starting') return;
    this._emit('match', { phase: 'end' });
    this._later(now ? 0 : 1200, () => {
      if (!this.lobby) return;
      for (const p of this.lobby.players) p.ready = !!p.host;
      this._setState('lobby');
      this._emit('lobby', { lobby: this.lobby });
      this._schedule();
    });
  }

  _lose(msg) {
    if (this.state === 'offline') return;
    this._reset();
    this.error = msg;
    this._setState('error');
    this._emit('error', { message: msg });
  }

  _schedule() {
    if (this._tick || !this._auto) return;
    const step = () => {
      this._tick = null;
      if (!this._auto || !this.lobby) return;
      if (this.state === 'lobby') this._act();
      this._pings();
      this._tick = this._later(900 + rnd() * 1900, step);
    };
    this._tick = this._later(1600, step);
  }

  _act() {
    const L = this.lobby, others = L.players.filter((p) => !p.you);
    // guest: the simulated host launches once everybody (you included) is ready
    if (!this.isHost && L.players.every((p) => p.host || p.ready)) {
      if (!this._hostGo) this._hostGo = this._later(1800, () => { this._hostGo = null; if (this.lobby === L && L.players.every((p) => p.host || p.ready)) this._launch(); });
      return;
    }
    const r = rnd();
    if (L.players.length < 6 && r < 0.3) { this._add({}); return; }
    const guests = others.filter((p) => !p.host);
    if (guests.length > 2 && r < 0.36) { this._drop(pick(guests).id, 'left'); return; }
    if (!others.length) return;
    const p = pick(others);
    if (r < 0.62 && !p.host) { this._patch(p.id, { ready: !p.ready || rnd() < 0.15 ? !p.ready : p.ready }); return; }
    if (r < 0.8) { this._emit('emote', { id: p.id, name: pick(EMOTES) }); return; }
    if (r < 0.9) { this._patch(p.id, { weapon: pick(WEAPON_ORDER.filter((w) => w !== p.weapon)) }); return; }
    this._patch(p.id, { style: LOOK.randomStyle(rnd) });
  }

  _pings() {
    if (!this.lobby) return;
    for (const p of this.lobby.players) {
      const base = p._base || (p._base = p.you ? 22 : 16 + rnd() * (rnd() < 0.15 ? 190 : 90));
      p.ping = Math.max(4, Math.round(base + (rnd() - 0.5) * base * 0.3));
    }
    this._emit('lobby', { lobby: this.lobby });
  }

  _add(o) {
    const L = this.lobby;
    if (!L || L.players.length >= L.maxPlayers) return null;
    const p = this._bot({ ...o, team: o.team ?? this._teamFor() });
    L.players.push(p);
    this._emit('join', { player: clone(p) });
    this._emit('lobby', { lobby: L });
    return p.id;
  }

  _drop(id, reason = 'left') {
    const L = this.lobby;
    if (!L) return;
    const i = L.players.findIndex((p) => p.id === id && !p.you);
    if (i < 0) return;
    const [p] = L.players.splice(i, 1);
    if (p.host) this._migrate(null);
    this._emit('leave', { player: clone(p), reason });
    this._emit('lobby', { lobby: L });
  }

  _migrate(id) {
    const L = this.lobby;
    if (!L) return;
    const next = (id && L.players.find((p) => p.id === id)) || L.players[0];
    if (!next) return;
    for (const p of L.players) p.host = p === next;
    next.ready = true;
    this.hostId = next.id;
    this._emit('host', { hostId: next.id });
    this._emit('lobby', { lobby: L });
  }

  _patch(id, patch) {
    const p = this._p(id);
    if (!p || !patch || !Object.keys(patch).length) return;
    Object.assign(p, patch);
    if (patch.team != null && !p.you) p.ready = false;
    this._emit('lobby', { lobby: this.lobby });
  }

  _teamFor(except) {
    const ps = (this.lobby ? this.lobby.players : []).filter((p) => p.id !== except);
    const a = ps.filter((p) => p.team === 0).length, b = ps.length - a;
    return a <= b ? 0 : 1;
  }

  _me(name, team, host) {
    const prof = (G.game && G.game.profile) || {};
    return {
      id: this.myId || (this.myId = this._id()), name: String(name || prof.name || 'Player').slice(0, 16), team,
      weapon: prof.weapon || 'shooter', style: prof.style ? { ...prof.style } : LOOK.randomStyle(rnd),
      ready: !!host, host: !!host, you: true, ping: 22,
    };
  }

  _bot(o = {}) {
    const used = new Set((this.lobby ? this.lobby.players : []).map((p) => p.name));
    const free = NAMES.filter((n) => !used.has(n));
    return {
      id: o.id || this._id(), name: o.name || pick(free.length ? free : NAMES), team: o.team ?? 0,
      weapon: o.weapon || pick(WEAPON_ORDER), style: o.style || LOOK.randomStyle(rnd),
      ready: !!(o.ready ?? rnd() < 0.3), host: !!o.host, you: false, ping: 20 + ((rnd() * 80) | 0),
    };
  }

  _p(id) { return this.lobby ? this.lobby.players.find((p) => p.id === id) : null; }
  _id() { return 'p' + (++this._seq).toString(36) + ((rnd() * 1e6) | 0).toString(36); }
  _rtt() { return 60 + rnd() * 70; }

  _setState(s) {
    if (this.state === s) return;
    this.state = s;
    if (s !== 'error' && s !== 'offline') this.error = null;
    this._emit('state', { state: s });
  }

  _emit(ev, data) {
    // main.js keeps the room's palette in sync for the real session (its 'lobby' hook); mirror that for the mock
    if (ev === 'lobby' && this.lobby && G.game && G.game._roomPalette) { try { G.game._roomPalette(this.lobby); } catch (e) { /* optional */ } }
    const set = this._ls.get(ev);
    if (!set) return;
    const payload = ev === 'lobby' ? { lobby: data.lobby ? clone(data.lobby) : null } : data;
    for (const fn of [...set]) { try { fn(payload); } catch (e) { console.error('[netmock]', ev, e); } }
  }

  _later(ms, fn) {
    const t = setTimeout(() => { this._timers.delete(t); fn(); }, ms);
    this._timers.add(t);
    return t;
  }
  _sleep(ms) { return new Promise((r) => setTimeout(r, ms)); } // untracked: a leave() mid-connect must still settle

  _reset() {
    for (const t of this._timers) clearTimeout(t);
    this._timers.clear();
    this._tick = null; this._hostGo = null;
    this.code = null; this.myId = null; this.hostId = null; this.lobby = null; this.startAt = 0;
  }
}

/** Install the mock as G.net (idempotent). Returns the session. */
export function installMockNet() {
  if (G.net && G.net.isMock) return G.net;
  G.net = new MockNet();
  console.info('[netmock] G.net is the offline mock (?netmock=1)');
  return G.net;
}
