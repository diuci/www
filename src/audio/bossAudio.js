// INKWAVE — boss-mode audio director (docs/BOSS.md). Listens to the boss:* events and plays the procedural HULLBREAKER
// sounds (src/audio/audio.js "Boss" group) positioned at the boss / its sockets, plus the phase-escalating boss music
// ('boss' → 'boss_2' → 'boss_3', one tempo so each change lands on a bar line with a riser).
//   installBossAudio()   idempotent; the HUD installs it at boot. Nothing here runs outside boss matches.
// While a boss match is live it sets G.music.remap so main.js's generic 'battle' / 'battle_final' requests resolve to
// the current boss track (no stray battle theme, no restart at one minute left).
import { on, G } from '../core/ctx.js';

const TRACK = { 1: 'boss', 2: 'boss_2', 3: 'boss_3' };
let installed = false;

export function installBossAudio() {
  if (installed) return;
  installed = true;
  const st = { active: false, boss: null, phase: 1, dead: false, track: null, loops: new Map(), timers: new Set(), hitT: 0, critT: 0, footT: 0, sawImpact: false, sawFoot: false, posT: 0 };
  const A = () => G.audio, M = () => G.music;
  const now = () => performance.now() / 1000;
  const bossOf = (e) => (e && e.boss) || st.boss || (G.match && G.match.boss) || null;
  const later = (s, fn) => { const id = setTimeout(() => { st.timers.delete(id); if (st.active) fn(); }, s * 1000); st.timers.add(id); };
  // world position of a socket (fresh plain object — audio copies it), else the body
  const pos = (name, e) => {
    const b = bossOf(e);
    if (!b || !b.pos) return undefined;
    const m = b.model;
    if (name && m && m.getSocket && b.pos.constructor && b.pos.constructor.prototype.applyMatrix4) {
      try { const v = m.getSocket(name, new b.pos.constructor()); if (Number.isFinite(v.x) && (v.x || v.y || v.z)) return { x: v.x, y: v.y, z: v.z }; } catch (err) { /* model not ready */ }
    }
    return { x: b.pos.x, y: b.pos.y + 3, z: b.pos.z };
  };
  const play = (n, o) => { if (!st.active) return; try { A()?.play(n, o); } catch (e) { /* audio not up */ } };
  const stopLoop = (key, fade = 0.25) => { const h = st.loops.get(key); if (h) { st.loops.delete(key); try { h.stop(fade); } catch (e) { /* */ } } };
  const loop = (key, n, o, maxDur = 4, sock = null) => {
    stopLoop(key, 0.08);
    if (!st.active) return;
    let h = null;
    try { h = A()?.loop?.(n, o); } catch (e) { h = null; }
    if (!h) return;
    h._sock = sock;
    st.loops.set(key, h);
    later(maxDur, () => { if (st.loops.get(key) === h) stopLoop(key, 0.4); });
    follow();
  };
  // loops ride along with the boss (charge / frenzy / sweep move it)
  let followId = 0;
  const follow = () => {
    if (followId) return;
    followId = setInterval(() => {
      if (!st.loops.size || !st.active) { clearInterval(followId); followId = 0; return; }
      for (const h of st.loops.values()) { const p = pos(h._sock); if (p) try { h.set({ pos: p }); } catch (e) { /* */ } }
    }, 90);
  };
  const stopAll = (fade = 0.3) => { for (const k of [...st.loops.keys()]) stopLoop(k, fade); for (const id of st.timers) clearTimeout(id); st.timers.clear(); };
  const music = (track, fade = 1.0) => { st.track = track; try { M()?.play(track, { fade }); } catch (e) { /* not initialised */ } };
  const phaseTrack = () => TRACK[Math.min(3, Math.max(1, st.phase | 0))];
  const setRemap = (onoff) => {
    const mus = M();
    if (!mus) return;
    if (onoff) mus.remap = (t) => (t === 'battle' || t === 'battle_final') && st.active && !st.dead ? (st.track || phaseTrack()) : undefined;
    else if (mus.remap && mus.remap._boss) mus.remap = null;
    if (onoff) mus.remap._boss = true;
  };
  const begin = (boss) => {
    if (!st.active) { st.active = true; st.phase = 1; st.dead = false; st.track = null; st.sawImpact = false; st.sawFoot = false; }
    if (boss) st.boss = boss;
    setRemap(true);
  };
  const end = () => { stopAll(0.4); st.active = false; st.boss = null; st.track = null; setRemap(false); };

  on('match:state', ({ state, match }) => {
    if (!match || match.attract) return;
    if (state === 'intro' || state === 'init') { stopAll(0.2); if (match.mode === 'boss') begin(match.boss || null); else if (st.active) end(); }
    if (!st.active) return;
    if (state === 'playing' && !st.dead) music(phaseTrack());
    if (state === 'finish') { stopAll(0.3); if (!st.dead) music(null, 0.6); }
    if (state === 'results' || state === 'judge') { stopAll(0.3); setRemap(false); }
  });
  on('boss:spawn', (e) => begin(e && e.boss));
  on('boss:intro', (e) => {
    begin(e && e.boss);
    play('boss_title');
    later(0.35, () => play('boss_roar', { pos: pos('mouth', e), volume: 1 }));
    later(0.1, () => play('boss_slam', { pos: pos(null, e), volume: 0.55, pitch: 0.8 }));     // it bursts up through the deck
  });
  on('boss:move', (e) => {
    if (!e || !st.active || st.dead) return;
    const { id, phase } = e, dur = +e.dur || 0;
    const key = `${id}:${phase}`;
    switch (key) {
      case 'slam:tele': play('boss_tele', { pos: pos('clawL', e) }); break;
      case 'slam:act': if (!st.sawImpact) later(0.12, () => play('boss_slam', { pos: pos('clawL', e) })); break;
      case 'barrage:tele': play('boss_tele', { pos: pos('shellTop', e), pitch: 1.12 }); break;
      case 'barrage:act': {
        const n = 3 + ((Math.random() * 3) | 0);
        for (let i = 0; i < n; i++) {
          later(i * 0.2, () => play('boss_whistle', { pos: pos('shellTop', e), pitch: 0.9 + Math.random() * 0.25 }));
          later(0.95 + i * 0.2, () => { const b = bossOf(e), m = b && b.move && b.move.p && b.move.p.b; const bb = m && m[i]; play('boss_barrel', bb ? { pos: { x: bb[0], y: bb[1], z: bb[2] } } : { volume: 0.55 }); });
        }
        break;
      }
      case 'sweep:tele': play('boss_cannon_charge', { pos: pos('cannon', e) }); break;
      case 'sweep:act': loop('sweep', 'boss_cannon_sweep', { pos: pos('cannon', e) }, Math.max(1, dur || 2.5) + 0.2, 'cannon'); break;
      case 'sweep:rec': stopLoop('sweep', 0.35); break;
      case 'charge:tele': play('boss_tele', { pos: pos('mouth', e), pitch: 0.82 }); later(0.2, () => play('boss_roar', { pos: pos('mouth', e), volume: 0.45, pitch: 1.25 })); break;
      case 'charge:act': loop('gallop', 'boss_gallop', { pos: pos(null, e) }, Math.max(1, dur || 2) + 0.3); break;
      case 'charge:rec': stopLoop('gallop', 0.2); break;
      case 'crablets:tele': play('boss_tele', { pos: pos('hatch', e), pitch: 1.25 }); break;
      case 'crablets:act': play('crablet_chitter', { pos: pos('hatch', e), volume: 1 }); later(0.3, () => play('crablet_chitter', { pos: pos('hatch', e), pitch: 1.15 })); break;
      case 'frenzy:tele': play('boss_roar', { pos: pos('mouth', e), volume: 0.7, pitch: 1.15 }); break;
      case 'frenzy:act': loop('frenzy', 'boss_frenzy', { pos: pos(null, e) }, Math.max(1, dur || 3) + 0.3); break;
      case 'frenzy:rec': stopLoop('frenzy', 0.4); break;
      default: break;
    }
  });
  on('boss:hit', (e) => {
    if (!e || !st.active || st.dead || e.crab || e.blocked) return;
    const t = now();
    const mine = !!(e.attacker && (e.attacker.isLocal || e.attacker === G.match?.local));
    if (mine) {
      if (e.weak) { if (t - st.critT > 0.07) { st.critT = t; play('boss_crit'); } }
      else if (t - st.hitT > 0.06) { st.hitT = t; play('boss_hit'); }
    } else if (e.weak && t - st.critT > 0.3) { st.critT = t; play('boss_crit', { pos: e.pos || pos('eyeL', e), volume: 0.5 }); }
  });
  on('boss:stun', (e) => {
    if (!st.active || st.dead) return;
    stopLoop('gallop', 0.05);
    play('boss_crash', { pos: pos('shellTop', e) });
    later(0.35, () => loop('dizzy', 'boss_dizzy', { pos: pos('eyeL', e) }, Math.max(0.6, (+e.dur || 3) - 0.3), 'eyeL'));
  });
  on('boss:phase', (e) => {
    if (!st.active || !e) return;
    const ph = Math.min(3, Math.max(1, e.phase | 0));
    if (ph <= st.phase) return;
    st.phase = ph;
    stopAll(0.2);
    play('boss_phase');
    later(0.3, () => play('boss_roar', { pos: pos('mouth', e), volume: 1, pitch: ph >= 3 ? 0.88 : 0.95 }));
    if (G.match && G.match.state === 'playing') music(phaseTrack());
  });
  on('boss:defeat', (e) => {
    if (!st.active || st.dead) return;
    st.dead = true;
    stopAll(0.15);
    music(null, 0.5);
    try { A()?.duck?.(0.7, 3); } catch (err) { /* */ }
    play('boss_defeat', { pos: pos(null, e) });
    later(1.35, () => play('boss_sunk'));
  });
  on('boss:foot', (e) => {
    if (!st.active || st.dead || !e || !e.pos) return;
    st.sawFoot = true;
    const t = now();
    if (t - st.footT < 0.06) return;
    st.footT = t;
    const s = Math.max(0, Math.min(1, e.strength ?? 0.6));
    play('boss_step', { pos: e.pos, volume: 0.35 + 0.65 * s, pitch: 0.9 + Math.random() * 0.2 });
  });
  on('boss:impact', (e) => {
    if (!st.active || !e || !e.pos) return;
    st.sawImpact = true;
    const s = Math.max(0.2, Math.min(1, e.strength ?? 1));
    if (/claw/.test(e.socket || '')) play('boss_slam', { pos: e.pos, volume: s });
    else if (!st.dead) play('boss_step', { pos: e.pos, volume: 1, pitch: 0.75 });
  });
  on('boss:fx', (e) => {
    if (!st.active || !e) return;
    const d = e.data || {};
    const p = d.pos && Number.isFinite(d.pos.x) ? { x: d.pos.x, y: d.pos.y, z: d.pos.z } : undefined;
    if (e.name === 'bonk' && !st.dead) play('boss_crash', { pos: p || pos('shellTop'), volume: 0.7 });
    else if (e.name === 'hatch') play('crablet_chitter', { pos: p || pos('hatch') });
  });
  on('boss:crablet', (e) => {
    if (!st.active || !e || !e.pos) return;
    const p = { x: e.pos.x, y: e.pos.y, z: e.pos.z };
    if (e.phase === 'spawn') play('crablet_chitter', { pos: p });
    else play('crablet_pop', { pos: p, pitch: e.killed ? 1.1 : 0.85 });
  });
}
