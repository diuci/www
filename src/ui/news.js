// INKWAVE — "What's New" launch pop-ups. Shown ONCE per update, the first time the player reaches the main menu
// (never over the title screen, never mid-match). Two sticker cards behind a splat wipe:
//   1. INTRODUCING THE MULTIPLAYER EXPANSION  → CONTINUE ▶ · Skip
//   2. INTRODUCING HULLBREAKER (Boss Battle · public beta) → TRY IT (Play › Boss Battle) · LATER
// Seen state: localStorage['inkwave.news'] = NEWS_ID (bump NEWS_ID for the next update's cards).
// Test flows never see it: ?skipTitle / ?netmock / ?autostart / ?autopilot skip it. ?news=1 re-enables the normal
// once-only logic on those URLs, ?news=force shows it regardless of the seen state, ?news=0 turns it off.
//
// Lives inside the menus: the overlay is the menus' modal (focus trap, pad/keyboard/mouse nav, cursor ring for free),
// hosted in the main screen's element. Hooks in menus.js: constructor, _swap (main mounted → maybeShow), _back (Esc).
import { h, clamp, splatSVG, restartAnim, prefersReducedMotion, easeOutCubic, easeInOutCubic, safeCall } from './ui-util.js';
import { GLYPHS, SQUID } from './ui-icons.js';
import { splatClip, splatCover, inkBurst } from './menu-art.js';
import { BOSS_NAME, bossSilhouette } from './boss-art.js';
import { G } from '../core/ctx.js';

export const NEWS_ID = 'mp-expansion-1';
const KEY = 'inkwave.news';
const art = (f) => new URL(`../../assets/${f}`, import.meta.url).href;
const CONFETTI = ['var(--nc)', 'var(--nc-light)', '#ffd23f', '#fff', 'var(--a)', 'var(--b)'];

export function newsSeen() { try { return localStorage.getItem(KEY) === NEWS_ID; } catch (e) { return false; } }
function markSeen() { try { localStorage.setItem(KEY, NEWS_ID); } catch (e) { /* private mode: it just shows again next time */ } }
/** false · true (normal once-only) · 'force' (ignore the seen state) */
function gate() {
  const q = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
  const p = q.get('news');
  if (p === '0') return false;
  if (p === 'force') return 'force';
  if (p === '1') return true;
  for (const k of ['skipTitle', 'netmock', 'autostart', 'autopilot']) if (q.has(k)) return false;
  return true;
}

const PAGES = [
  {
    id: 'mp', tone: 'a', kicker: '隆重推出', title: ['多人联机', '资料片'], img: 'news/lobby.webp',
    stamp: { text: '新内容！', cls: 'is-new' },
    lede: '叫上你的队友——港口一下子热闹起来了！',
    bullets: [
      [GLYPHS.key, '私人房间', '分享房间码，最多 8 个好友组队开黑'],
      [GLYPHS.smile, '大厅', '看队友陆续进场，做动作，点准备'],
      [GLYPHS.map, '货运码头', '全新地图，仅限联机模式', 'stages/cargo-day-sm.webp'],
    ],
  },
  {
    id: 'boss', tone: 'b', kicker: '隆重推出', title: [BOSS_NAME], img: 'news/boss.webp', fallback: () => bossSilhouette(),
    tape: '斗诗会 · 公开测试',
    lede: '一只巨型寄居蟹搬进了生锈的集装箱——它想要霸占整个港口。',
    bullets: [
      [GLYPHS.users, '合作对决', '你们整支小队 VS 一只巨无霸寄居蟹'],
      [GLYPHS.target, '三个阶段乱斗', '躲开预警，打碎蟹壳，轰爆发光的弱点'],
      [GLYPHS.sparkle, '公开测试', '它还在磨爪子——告诉我们你的想法！'],
    ],
  },
];

export class WhatsNew {
  constructor(menus) {
    this.M = menus;
    this.el = null;
    this.page = 0;
    this._t = 0;
    this._tweens = [];
    this._raf = 0;
    this._busy = false;
  }

  get open() { return !!this.el; }

  /** menus.js: the main screen just mounted. Opens once the menu's own wipe has settled. */
  maybeShow() {
    if (this.el) return;
    const g = gate();
    if (!g || (g !== 'force' && newsSeen())) return;
    if (g === 'force' && this._shownForce) return;
    clearTimeout(this._t);
    // fetch both hero renders now: the card waits (briefly) for its image instead of opening on an empty frame
    if (!this._pre) this._pre = PAGES.map((P) => { const im = new Image(); im.decoding = 'async'; im.src = art(P.img); return im; });
    this._waitFrom = performance.now();
    this._t = setTimeout(() => this._tryOpen(0), 700);
  }
  _tryOpen(n) {
    const M = this.M;
    if (this.el || M.current !== 'main' || !M._scr || G.mode === 'match') return;
    if (M._modal || (M.wipe && M.wipe.busy) || M._starting) {
      if (n < 60) this._t = setTimeout(() => this._tryOpen(n + 1), 150);
      return;
    }
    const hero = this._pre && this._pre[0];
    if (hero && !hero.complete && performance.now() - this._waitFrom < 4000) { this._t = setTimeout(() => this._tryOpen(n), 150); return; }
    this.show();
  }

  // ================================================================ build
  show() {
    const M = this.M;
    if (this.el || !M._scr) return;
    if (gate() === 'force') this._shownForce = true;
    markSeen();   // shown once: even a reload mid-sequence won't bring it back
    this.reduced = prefersReducedMotion();
    this.page = 0;
    this.inkHost = h('div', { class: 'iw-news__inks' });
    this.card = h('div', { class: 'iw-news__card' });
    this.confetti = h('div', { class: 'iw-news__confetti' });
    const el = this.el = h('div', { class: 'iw-news' + (this.reduced ? ' is-reduced' : ''), role: 'dialog', 'aria-modal': 'true', 'aria-label': '更新公告' },
      h('div', { class: 'iw-news__dim' }), this.inkHost, this.confetti, h('div', { class: 'iw-news__stage' }, this.card));
    el._onBack = () => this.close('back');
    el.dataset.keys = '1';
    M._scr.el.appendChild(el);
    M._modalPrev = M._focus;
    M._modal = el;
    M._sfx('splat_big');
    this._render(0, true);
    const r = el.getBoundingClientRect();
    this._ink(PAGES[0].tone, r.width * 0.5, r.height * 0.52, 0.62, false);
  }

  _render(i, first) {
    const M = this.M, P = PAGES[i];
    this.page = i;
    this.el.dataset.page = P.id;
    this.el.style.setProperty('--nc', `var(--${P.tone})`);
    this.el.style.setProperty('--nc-light', `var(--${P.tone}-light)`);
    this.el.style.setProperty('--nc-dark', `var(--${P.tone}-dark)`);
    this.el.style.setProperty('--nc-ink', `var(--${P.tone}-ink)`);
    this.el.style.setProperty('--nc-rgb', `var(--${P.tone}-rgb)`);
    // hero: the render, framed like a ticket, taped to the card
    const img = h('img', { class: 'iw-news__img', alt: '', draggable: 'false' });
    const frame = h('div', { class: 'iw-news__frame' }, img, h('i', { class: 'iw-news__glare' }));
    img.addEventListener('load', () => frame.classList.add('is-loaded'), { once: true });
    img.addEventListener('error', () => {
      img.remove();
      frame.classList.add('is-loaded', 'is-fallback');
      frame.prepend(h('div', { class: 'iw-news__fb', html: P.fallback ? P.fallback() : `<span class="iw-news__fbsquid">${SQUID}</span>` }));
    }, { once: true });
    img.src = art(P.img);
    const hero = h('div', { class: 'iw-news__hero' },
      h('span', { class: 'iw-news__herosplat', html: splatSVG({ seed: 17 + i * 11, fill: 'var(--nc)', r: 58, arms: 9, drops: 5 }) }),
      frame,
      h('i', { class: 'iw-news__tapebit is-tl' }), h('i', { class: 'iw-news__tapebit is-br' }),
      P.stamp ? h('span', { class: `iw-news__stamp ${P.stamp.cls}` }, P.stamp.text) : null,
      P.tape ? h('span', { class: 'iw-news__tape' }, h('span', null, P.tape)) : null);
    // body
    const list = h('ul', { class: 'iw-news__list' }, P.bullets.map(([ic, b, t, thumb], k) => {
      const li = h('li', { style: { '--i': k } }, h('i', { class: 'iw-news__bico', html: ic }), h('span', null, h('b', null, b), ` — ${t}`));
      if (thumb) {
        const im = h('img', { class: 'iw-news__thumb', alt: '', draggable: 'false' });
        im.addEventListener('error', () => im.remove(), { once: true });
        im.src = art(thumb);
        li.appendChild(im);
      }
      return li;
    }));
    const btns = [];
    if (i === 0) {
      const go = M._btn({ id: 'news-continue', label: '继续', cls: 'iw-btn--primary iw-btn--wide iw-news__go', sound: 'ui_confirm', accept: () => this.next() });
      go.append(h('span', { class: 'iw-news__chev', html: GLYPHS.next }));
      const skip = M._btn({ id: 'news-skip', label: '跳过', cls: 'iw-btn--small iw-btn--ghost iw-news__skip', sound: 'ui_back', accept: () => this.close('skip') });
      skip.appendChild(h('span', { class: 'iw-news__skipkey' }, M._hint('Esc', 'B')));
      btns.push(go, skip);
    } else {
      const go = M._btn({ id: 'news-try', label: '去试试', icon: GLYPHS.play, cls: 'iw-btn--primary iw-btn--wide iw-news__go', sound: 'ui_confirm', accept: () => this.close('try') });
      const later = M._btn({ id: 'news-later', label: '以后再说', cls: 'iw-btn--wide iw-btn--ghost iw-news__later', sound: 'ui_back', accept: () => this.close('later') });
      btns.push(go, later);
    }
    btns[0].appendChild(h('span', { class: 'iw-news__key' }, M._hint('Enter', 'A')));
    const dots = h('span', { class: 'iw-news__dots' }, PAGES.map((_, k) => h('i', { class: k === i ? 'is-on' : '' })));
    const body = h('div', { class: 'iw-news__body' },
      h('div', { class: 'iw-news__kicker' }, h('i', { html: GLYPHS.sparkle }), P.kicker),
      h('div', { class: 'iw-news__title iw-display' + (P.title.length === 1 ? ' is-one' : '') }, P.title.map((t, k) => h('span', { style: { '--i': k } }, t))),
      h('p', { class: 'iw-news__lede' }, P.lede),
      list,
      h('div', { class: 'iw-news__btns' }, btns),
      h('div', { class: 'iw-news__foot' }, dots, h('span', { class: 'iw-news__count' }, `${i + 1} / ${PAGES.length}`)));
    this.card.innerHTML = '';
    this.card.append(hero, body);
    restartAnim(this.card, first ? 'is-in' : 'is-swap');
    M._setFocus(btns[0], { snap: true });
    if (!this.reduced) {
      this._confetti();
      setTimeout(() => { if (this.el && this.el.isConnected) inkBurst(this.M._scr.el, { ...this._center(body.querySelector('.iw-news__title')), color: 'var(--nc)', count: 14, dist: 12, size: 1.5, ring: true }); }, first ? 520 : 260);
    }
  }
  _center(node) {
    if (!node) return { x: innerWidth / 2, y: innerHeight / 2 };
    const r = node.getBoundingClientRect();
    return { x: r.left + r.width * 0.35, y: r.top + r.height / 2 };
  }

  _confetti() {
    const host = this.confetti;
    host.innerHTML = '';
    for (let i = 0; i < 34; i++) {
      const x = ((i * 0.618034 + 0.07) % 1) * 100;
      host.appendChild(h('i', { style: {
        left: `${x.toFixed(1)}%`, '--c': CONFETTI[i % CONFETTI.length], '--d': `${(0.05 + ((i * 0.37) % 1) * 0.5).toFixed(2)}s`,
        '--t': `${(1.5 + ((i * 0.53) % 1) * 1.1).toFixed(2)}s`, '--r': `${Math.round(((i * 0.71) % 1) * 720 - 360)}deg`,
        '--x': `${(((i * 0.29) % 1) - 0.5) * 12}vw`, '--w': `${(0.5 + ((i * 0.43) % 1) * 0.7).toFixed(2)}`, '--k': i % 3 ? '0' : '1',
      } }));
    }
    restartAnim(host, 'is-on');
  }

  // ================================================================ ink wipes (splat clip-path grown by JS)
  /** A full-screen layer of `tone` ink revealed by a splat growing from (x, y). */
  _ink(tone, x, y, dur, fromPrev) {
    const layer = h('div', { class: `iw-news__ink is-${tone}` }, h('i', { class: 'iw-news__halftone' }));
    this.inkHost.appendChild(layer);
    const W = this.el.clientWidth || innerWidth, H = this.el.clientHeight || innerHeight;
    const R = splatCover(x, y, W, H), seed = 7 + this.inkHost.childElementCount * 13;
    if (this.reduced) { layer.style.clipPath = ''; layer.classList.add('is-fade'); this._pruneInks(layer); return layer; }
    layer.style.clipPath = splatClip(x, y, 0.01, seed);
    this._tween(dur, (k) => { layer.style.clipPath = splatClip(x, y, R * easeOutCubic(k), seed); }, () => { layer.style.clipPath = ''; if (fromPrev) this._pruneInks(layer); });
    layer._splat = { x, y, R, seed };
    return layer;
  }
  _pruneInks(keep) { for (const n of [...this.inkHost.children]) if (n !== keep) n.remove(); }

  _tween(dur, step, done) {
    const o = { t: 0, dur: Math.max(0.01, dur), step, done };
    this._tweens.push(o);
    step(0);
    if (!this._raf) { this._last = performance.now(); this._raf = requestAnimationFrame((t) => this._tick(t)); }
    return o;
  }
  _tick(t) {
    const dt = Math.min(0.1, (t - this._last) / 1000) * (this.M.timeScale ?? 1);   // slow frames still finish the wipe on time
    this._last = t;
    for (let i = this._tweens.length - 1; i >= 0; i--) {
      const o = this._tweens[i];
      o.t += dt;
      const k = clamp(o.t / o.dur);
      safeCall(o.step, k);
      if (k >= 1) { this._tweens.splice(i, 1); if (o.done) safeCall(o.done); }
    }
    this._raf = this._tweens.length ? requestAnimationFrame((tt) => this._tick(tt)) : 0;
  }

  // ================================================================ flow
  next() {
    if (!this.el || this._busy || this.page >= PAGES.length - 1) return;
    this._busy = true;
    const btn = this.card.querySelector('.iw-news__go');
    const c = btn ? this._center(btn) : { x: innerWidth * 0.7, y: innerHeight * 0.7 };
    const r = this.el.getBoundingClientRect();
    this.card.classList.add('is-out');
    this.M._sfx('splat_big', 0.05);
    this._ink(PAGES[1].tone, c.x - r.left, c.y - r.top, this.reduced ? 0.01 : 0.55, true);
    setTimeout(() => { if (!this.el) return; this.card.classList.remove('is-out'); this._render(1, false); this._busy = false; }, this.reduced ? 0 : 300);
  }

  /** how: 'skip' | 'later' | 'back' | 'try' */
  close(how = 'later') {
    const M = this.M, el = this.el;
    if (!el || el._closing) return;
    el._closing = true;
    clearTimeout(this._t);
    if (M._modal === el) M._modal = null;
    el.classList.add('is-leaving');
    this.card.classList.add('is-out');
    if (how === 'back') M._sfx('ui_back');
    const finish = () => { el.remove(); if (this.el === el) this.el = null; };
    if (how === 'try') { finish(); this._tryBoss(); return; }
    // the splat drains back into the card's centre, the menu underneath comes back
    const last = this.inkHost.lastElementChild;
    if (!this.reduced && last && last._splat) {
      const s = last._splat, r = el.getBoundingClientRect(), cr = this.card.getBoundingClientRect();
      const x = cr.left + cr.width / 2 - r.left, y = cr.top + cr.height / 2 - r.top, R = splatCover(x, y, r.width, r.height);
      this._pruneInks(last);
      this._tween(0.5, (k) => { last.style.clipPath = splatClip(x, y, Math.max(0.01, R * (1 - easeInOutCubic(k))), s.seed + 1); }, finish);
    } else setTimeout(finish, this.reduced ? 200 : 450);
    const prev = M._modalPrev;
    if (prev && prev.isConnected) M._setFocus(prev, { snap: true });
  }

  /** TRY IT: Play › Boss Battle stage select, with Back leading to the mode cards (boss focused). */
  _tryBoss() {
    const M = this.M;
    const st = M._setup || (M._setup = { times: {} });
    st.mode = 'boss';
    M._setSetting('lastMode', 'boss');
    M._stack = ['main', 'mode'];
    M.show('setup', { push: true });
  }

  dispose() { clearTimeout(this._t); cancelAnimationFrame(this._raf); this._raf = 0; if (this.el) this.el.remove(); this.el = null; }
}
