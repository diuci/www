// Boss Battle rules: the whole room is one squad (team 0) against HULLBREAKER. Win: its HP hits 0. Lose: the clock
// runs out (turf is shown, but secondary). The boss's HP scales with the squad (humans 1.0, bots 0.6) and difficulty.
// Match.js owns the lifecycle; this owns the boss, the finish conditions and the results. See docs/BOSS.md.
import { G, emit } from '../core/ctx.js';
import { Boss, BOSS } from './boss.js';

export const BOSS_MODE = {
  duration: 240,          // default match length (s)
  intro: 7.2,             // the intro state: sweep over the arena, the burst + roar, then back to the squad
  finishWin: 5.2,         // time on the dying boss before the results
  finishLose: 3.2,
  squad: 8,
};

export function squadUnits(actors) { return actors.reduce((s, a) => s + (a.isBot && !a.isLocal ? 0.6 : 1), 0); }

export class BossMode {
  constructor(match) {
    this.match = match;
    const o = match.opts;
    const units = squadUnits(match.actors.filter((a) => a.team === 0));
    const maxHp = Math.round(BOSS.hpPerUnit * units * (BOSS.hpDiff[o.difficulty] ?? 1));
    this.boss = new Boss(match, { maxHp, difficulty: o.difficulty || 'normal', sim: !match.follower });
    G.boss = this.boss;
    this.won = false;
    this.killT = -1;
    emit('boss:spawn', { boss: this.boss });
  }

  update(dt) {
    const m = this.match, b = this.boss;
    b.update(dt);
    // the sim side calls the finish (online: the host; guests follow its 'st')
    if (!m.follower && b.dead && m.state === 'playing') m.setState('finish');
  }

  onDefeat(by) {
    const m = this.match;
    this.won = true;
    this.killT = m.duration - m.time;
    if (by?.stats) by.stats.bossKill = 1;
  }

  // the judge: the boss fight's result (every client shows the host's)
  result() {
    const m = this.match, b = this.boss;
    const win = b.dead;
    return {
      mode: 'boss', winner: win ? 0 : 1, coverage: G.paint.coverage(),
      boss: { name: BOSS.name, win, time: Math.round((win && this.killT >= 0 ? this.killT : m.duration - m.time) * 10) / 10, hp: Math.round(b.hp), maxHp: b.maxHp, phase: b.phase },
    };
  }

  dispose() { this.boss.dispose(); if (G.boss === this.boss) G.boss = null; }
}
