// INKWAVE UI — HULLBREAKER art (boss mode): original sticker illustrations as SVG markup strings, shared by the HUD
// (boss bar emblem, move callouts, title card) and the menus (mode card, lobby, results).
//   bossEmblem({ cracked })   front view head-and-shell badge (100×100)
//   bossSilhouette()          side view full body, facing left (360×240) — the mode-select card art
//   MOVE_ICONS[id]            64×64 move glyphs (currentColor) for callouts: slam barrage sweep charge crablets frenzy open
//   BOSS_GLYPH                small monochrome crab-in-a-box glyph (currentColor) for chips / pips
// Colours come from CSS custom properties so the same art follows the match palette:
//   --boss (the boss's corrupt ink = team 1), --weak (weak-point glow = the squad's ink). Both have fallbacks.

const K = '#15121c';
const INK = 'var(--boss, var(--enemy, #2f5bff))';
const WEAK = 'var(--weak, var(--self, #ff8a14))';
const SHELL = '#23706b', SHELL_D = '#174c4a', SHELL_L = '#3c9a90';
const RUST = '#c2602c', RUST_D = '#8e3d1b';
const CARA = '#a8283f', CARA_D = '#6c1628', CARA_L = '#dc4d61';
const CLAW = '#c5354c', CLAW_L = '#f07a82';
const BELLY = '#f1c9a6';

export const BOSS_NAME = '铁壳诗怪';
export const BOSS_EPITHET = '锈甲之惧';
export const BOSS_BLURB = '一只住在锈蚀集装箱里的巨寄居蟹。全房间的人要联手在时间走完前放倒它。';
export const MOVE_LABELS = {
  slam: '砸下！', barrage: '来袭！', sweep: '横扫！', charge: '冲撞！', crablets: '产卵！', frenzy: '狂暴！', open: '破绽！',
};

// ------------------------------------------------------------------ bits
const eye = (x, y, r, lidRot = 0) => `
  <circle cx="${x}" cy="${y}" r="${r * 1.9}" fill="${WEAK}" opacity=".32" class="bx-glow"/>
  <circle cx="${x}" cy="${y}" r="${r}" fill="${K}"/>
  <circle cx="${x}" cy="${y}" r="${r * 0.62}" fill="${WEAK}" class="bx-eye"/>
  <circle cx="${x - r * 0.25}" cy="${y - r * 0.28}" r="${r * 0.2}" fill="#fff"/>
  <path d="M${x - r * 1.08} ${y - r * 0.05} A${r * 1.08} ${r * 1.08} 0 0 1 ${x + r * 1.08} ${y - r * 0.05} Z" fill="${CARA_D}" stroke="${K}" stroke-width="${r * 0.32}" stroke-linejoin="round" transform="rotate(${lidRot} ${x} ${y})"/>`;
const stalk = (x0, y0, x1, y1, w) => `<path d="M${x0} ${y0} Q${(x0 + x1) / 2 + (x1 - x0) * 0.35} ${(y0 + y1) / 2} ${x1} ${y1}" fill="none" stroke="${K}" stroke-width="${w + 5}" stroke-linecap="round"/>
  <path d="M${x0} ${y0} Q${(x0 + x1) / 2 + (x1 - x0) * 0.35} ${(y0 + y1) / 2} ${x1} ${y1}" fill="none" stroke="${CARA}" stroke-width="${w}" stroke-linecap="round"/>`;
const seg = (a, b, wa, wb) => {
  const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
  const f = (v) => v.toFixed(1);
  return `M${f(a[0] + nx * wa)} ${f(a[1] + ny * wa)} L${f(b[0] + nx * wb)} ${f(b[1] + ny * wb)} L${f(b[0] - nx * wb)} ${f(b[1] - ny * wb)} L${f(a[0] - nx * wa)} ${f(a[1] - ny * wa)} Z`;
};
// jointed walking leg: thick upper segment, tapering to a pointed dark tip
const leg = ([a, k, t], w, col) => {
  const m = [k[0] + (t[0] - k[0]) * 0.72, k[1] + (t[1] - k[1]) * 0.72];
  return `<g stroke="${K}" stroke-width="5" stroke-linejoin="round" paint-order="stroke">
      <path d="${seg(a, k, w * 0.62, w * 0.5)}" fill="${col}"/>
      <path d="${seg(k, m, w * 0.46, w * 0.3)}" fill="${col}"/>
      <path d="${seg(m, t, w * 0.3, 0.6)}" fill="${K}"/>
      <circle cx="${k[0]}" cy="${k[1]}" r="${w * 0.52}" fill="${col}"/>
    </g>
    <path d="M${a[0]} ${a[1]} L${k[0]} ${k[1]}" stroke="${CARA_L}" stroke-width="${w * 0.22}" stroke-linecap="round" opacity=".55" transform="translate(${-w * 0.16} ${-w * 0.12})"/>`;
};
const CLAW_D = 'M90 134 C76 120 44 118 26 130 C16 137 9 144 5 152 C16 150 27 150 37 153 C27 159 17 167 10 177 C25 185 48 189 67 185 C86 181 99 168 99 154 C99 144 96 138 90 134 Z';

// ------------------------------------------------------------------ emblem (front view)
/** Head + container badge. cracked = phase 3 (split shell, hot eyes). */
export function bossEmblem({ cracked = false } = {}) {
  const ribs = Array.from({ length: 9 }, (_, i) => `<path d="M${21 + i * 7.3} 19 V51" stroke="${SHELL_D}" stroke-width="2.2" opacity=".75"/>`).join('');
  const crack = cracked
    ? `<path d="M52 13 L47 24 L55 29 L46 41 L52 47" fill="none" stroke="${K}" stroke-width="5" stroke-linejoin="round" stroke-linecap="round"/>
       <path d="M52 13 L47 24 L55 29 L46 41 L52 47" fill="none" stroke="${WEAK}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>`
    : '';
  return `<svg class="bx bx-emblem${cracked ? ' is-cracked' : ''}" viewBox="0 0 100 100" aria-hidden="true">
    <g transform="rotate(-4 50 40)">
      <rect x="13" y="12" width="74" height="42" rx="4" fill="${SHELL}" stroke="${K}" stroke-width="4.5"/>
      ${ribs}
      <rect x="13" y="12" width="74" height="7" rx="3" fill="${SHELL_L}" stroke="${K}" stroke-width="3"/>
      <path d="M17 44 Q24 40 30 45 Q27 51 19 51 Z M66 21 Q74 19 80 24 Q77 30 70 28 Z" fill="${RUST}" opacity=".9"/>
      <path d="M24 54 L24 60 Q24 63 27 63 Q30 63 30 60 L30 54 Z M71 54 L71 58 Q71 61 73.5 61 Q76 61 76 58 L76 54 Z" fill="${INK}" stroke="${K}" stroke-width="2.4"/>
      ${crack}
    </g>
    ${stalk(42, 50, 36, 27, 5)}${stalk(58, 50, 64, 27, 5)}
    <path d="M22 62 C22 49 36 44 50 44 C64 44 78 49 78 62 C78 76 65 86 50 86 C35 86 22 76 22 62 Z" fill="${CARA}" stroke="${K}" stroke-width="4.5"/>
    <path d="M30 56 Q40 49 52 49" fill="none" stroke="${CARA_L}" stroke-width="3.4" stroke-linecap="round"/>
    <path d="M38 73 L42 70 L46 74 L50 70 L54 74 L58 70 L62 73" fill="none" stroke="${K}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>
    <path d="M81 58 C93 54 99 64 96 74 C94 80 88 84 82 83 L86 76 C80 78 74 76 72 72 C70 64 74 60 81 58 Z" fill="${CLAW}" stroke="${K}" stroke-width="4" stroke-linejoin="round"/>
    <path d="M18 64 C10 62 5 69 7 75 L12 72 L11 79 C16 81 22 77 23 72 Z" fill="${CLAW}" stroke="${K}" stroke-width="3.6" stroke-linejoin="round"/>
    ${eye(36, 25, 7.4, -24)}${eye(64, 25, 7.4, 24)}
  </svg>`;
}

// ------------------------------------------------------------------ full-body side view (menus)
export function bossSilhouette() {
  const ribs = Array.from({ length: 13 }, (_, i) => `<path d="M${166 + i * 13} 46 V138" stroke="${SHELL_D}" stroke-width="3.2" opacity=".7"/>`).join('');
  const drips = [[176, 1.2], [205, 0.7], [238, 1.5], [270, 0.9], [300, 1.25]].map(([x, k]) => `<path d="M${x - 7} 140 L${x + 7} 140 L${x + 5} ${140 + 18 * k} Q${x} ${150 + 18 * k} ${x - 5} ${140 + 18 * k} Z" fill="${INK}" stroke="${K}" stroke-width="3.4" stroke-linejoin="round"/>`).join('');
  const barn = [[172, 132], [186, 136], [258, 134], [316, 128], [292, 136]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="3.6" fill="#e9e2cf" stroke="${K}" stroke-width="2"/>`).join('');
  return `<svg class="bx bx-side" viewBox="0 0 360 240" aria-hidden="true">
    <ellipse cx="192" cy="222" rx="158" ry="13" fill="${INK}" opacity=".85"/>
    <ellipse cx="192" cy="222" rx="158" ry="13" fill="${K}" opacity=".35"/>
    <!-- far legs -->
    ${leg([[186, 156], [160, 128], [140, 212]], 22, CARA_D)}${leg([[208, 158], [214, 124], [206, 214]], 22, CARA_D)}${leg([[228, 154], [258, 128], [272, 210]], 22, CARA_D)}
    <!-- container shell (tilted up to the back) -->
    <g transform="rotate(-8 250 96)">
      <rect x="152" y="36" width="190" height="108" rx="7" fill="${SHELL}" stroke="${K}" stroke-width="6"/>
      ${ribs}
      <rect x="152" y="36" width="190" height="12" rx="5" fill="${SHELL_L}" stroke="${K}" stroke-width="4"/>
      <path d="M322 50 V136 M332 50 V136" stroke="${K}" stroke-width="4.5"/>
      <rect x="317" y="80" width="20" height="9" rx="2" fill="${RUST}" stroke="${K}" stroke-width="3"/>
      <path d="M160 100 Q176 92 190 104 Q184 118 164 116 Z M236 58 Q256 54 266 66 Q256 76 240 72 Z M288 112 Q302 104 312 116 Q304 128 290 124 Z" fill="${RUST}" opacity=".95"/>
      <path d="M170 110 Q180 106 186 112 M246 64 Q254 62 258 67" stroke="${RUST_D}" stroke-width="3" fill="none" stroke-linecap="round"/>
      <path d="M200 70 H282" stroke="#fff" stroke-width="9" stroke-linecap="round" opacity=".22"/>
      <path d="M200 70 H232" stroke="#fff" stroke-width="9" stroke-linecap="round" opacity=".35"/>
      ${drips}${barn}
      <path d="M270 44 C286 40 296 52 290 62 C300 64 304 76 294 80 C284 84 276 74 280 66 C268 68 262 54 270 44 Z" fill="${INK}" opacity=".95"/>
    </g>
    <!-- body emerging from the container mouth -->
    <path d="M100 150 C96 120 124 102 160 102 L196 106 C212 112 214 142 204 160 C190 176 150 178 124 172 C108 168 101 162 100 150 Z" fill="${CARA}" stroke="${K}" stroke-width="6" stroke-linejoin="round"/>
    <path d="M114 128 Q132 110 164 112" fill="none" stroke="${CARA_L}" stroke-width="5" stroke-linecap="round"/>
    <path d="M150 150 C160 162 184 164 196 154" fill="none" stroke="${BELLY}" stroke-width="7" stroke-linecap="round"/>
    <!-- near legs (over the body side: they arch up from the underside, then stab down) -->
    ${leg([[150, 166], [126, 124], [104, 216]], 24, CLAW)}${leg([[174, 170], [180, 120], [168, 220]], 24, CLAW)}${leg([[196, 166], [228, 124], [244, 216]], 24, CLAW)}
    <!-- antennae -->
    <path d="M112 124 C90 100 70 96 46 100 M118 120 C104 92 88 78 66 70" fill="none" stroke="${K}" stroke-width="3.6" stroke-linecap="round"/>
    <!-- ink cannon snout -->
    <path d="M100 136 L82 132 Q76 132 76 138 L76 144 Q76 150 82 150 L100 148 Z" fill="#3d3a4a" stroke="${K}" stroke-width="5" stroke-linejoin="round"/>
    <ellipse cx="78" cy="141" rx="4.5" ry="7" fill="${INK}" stroke="${K}" stroke-width="2.6"/>
    <!-- mouthparts -->
    <path d="M104 156 L110 160 L106 166 L114 168" fill="none" stroke="${K}" stroke-width="3.6" stroke-linejoin="round" stroke-linecap="round"/>
    <!-- quick pincer (tucked, far side) -->
    <path d="M132 118 L106 108" stroke="${K}" stroke-width="15" stroke-linecap="round"/><path d="M132 118 L106 108" stroke="${CARA_D}" stroke-width="8" stroke-linecap="round"/>
    <g transform="translate(62 70) rotate(-12 50 150) scale(.52)"><path d="${CLAW_D}" fill="${CARA_D}" stroke="${K}" stroke-width="9" stroke-linejoin="round"/></g>
    <!-- eye stalks -->
    ${stalk(128, 110, 114, 60, 8)}${stalk(142, 108, 148, 56, 8)}
    ${eye(114, 58, 11, -26)}${eye(148, 54, 11, 18)}
    <!-- the crusher (big claw) -->
    <path d="M128 156 L92 164" stroke="${K}" stroke-width="24" stroke-linecap="round"/><path d="M128 156 L92 164" stroke="${CLAW}" stroke-width="15" stroke-linecap="round"/>
    <path d="${CLAW_D}" fill="${CLAW}" stroke="${K}" stroke-width="6" stroke-linejoin="round"/>
    <path d="M36 153 L30 150 L25 154 L19 151" fill="none" stroke="${K}" stroke-width="3" stroke-linejoin="round"/>
    <path d="M40 132 Q62 124 82 134" fill="none" stroke="${CLAW_L}" stroke-width="5.5" stroke-linecap="round"/>
    <path d="M58 170 Q72 172 84 164" fill="none" stroke="${CARA_D}" stroke-width="4" stroke-linecap="round" opacity=".6"/>
    <circle cx="56" cy="142" r="3.4" fill="#fff" opacity=".55"/>
  </svg>`;
}

// ------------------------------------------------------------------ move glyphs (64×64, currentColor + outline)
const svg = (body) => `<svg class="iw-ico" viewBox="0 0 64 64" aria-hidden="true">${body}</svg>`;
const OL = `stroke="${K}" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"`;
export const MOVE_ICONS = {
  slam: svg(`<path d="M20 6 C12 6 8 14 10 22 L16 20 L14 30 C22 34 34 32 38 24 C42 14 32 6 20 6 Z" fill="currentColor" ${OL}/>
    <path d="M26 34 L26 44" ${OL} fill="none"/><path d="M8 52 H56" stroke="currentColor" stroke-width="6" stroke-linecap="round"/>
    <path d="M14 44 L8 38 M50 44 L56 38 M32 46 L32 40" stroke="currentColor" stroke-width="4.5" stroke-linecap="round"/>
    <path d="M6 58 H58" stroke="${K}" stroke-width="3" stroke-linecap="round" opacity=".5"/>`),
  barrage: svg(`<rect x="18" y="26" width="28" height="32" rx="6" fill="currentColor" ${OL}/>
    <path d="M18 36 H46 M18 48 H46" stroke="${K}" stroke-width="3.4"/>
    <path d="M10 22 C14 8 36 2 50 12" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-dasharray="1 8"/>
    <path d="M46 6 L54 14 L44 16 Z" fill="currentColor" ${OL}/>`),
  sweep: svg(`<path d="M10 54 L54 14 A50 50 0 0 1 58 44 Z" fill="currentColor" ${OL}/>
    <path d="M18 50 L50 22" stroke="#fff" stroke-width="3.4" stroke-linecap="round" opacity=".7"/>
    <circle cx="10" cy="54" r="7" fill="${K}"/>`),
  charge: svg(`<path d="M6 24 H34 V12 L58 32 L34 52 V40 H6 Z" fill="currentColor" ${OL}/><path d="M12 30 H30" stroke="#fff" stroke-width="3.4" stroke-linecap="round" opacity=".7"/>`),
  crablets: svg(`<path d="M14 40 C14 28 22 24 32 24 C42 24 50 28 50 40 C50 48 42 52 32 52 C22 52 14 48 14 40 Z" fill="currentColor" ${OL}/>
    <path d="M14 42 L4 50 M16 48 L8 58 M50 42 L60 50 M48 48 L56 58" ${OL} fill="none"/>
    <path d="M20 26 L14 12 M44 26 L50 12" ${OL} fill="none"/><circle cx="14" cy="11" r="4.5" fill="#fff" ${OL}/><circle cx="50" cy="11" r="4.5" fill="#fff" ${OL}/>`),
  frenzy: svg(`<path d="M32 8 A24 24 0 1 1 10 40" fill="none" stroke="${K}" stroke-width="12" stroke-linecap="round"/>
    <path d="M32 8 A24 24 0 1 1 10 40" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round"/>
    <path d="M2 34 L12 46 L20 34 Z" fill="currentColor" ${OL}/><circle cx="32" cy="32" r="7" fill="currentColor" ${OL}/>`),
  open: svg(`<path d="M32 4 L38 20 L55 20 L41 30 L47 47 L32 37 L17 47 L23 30 L9 20 L26 20 Z" fill="currentColor" ${OL}/>
    <path d="M22 56 Q32 50 42 56" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round"/>`),
};
export const BOSS_GLYPH = svg(`<rect x="10" y="8" width="44" height="24" rx="3" fill="currentColor"/>
  <path d="M16 12 V28 M24 12 V28 M32 12 V28 M40 12 V28 M48 12 V28" stroke="${K}" stroke-width="2.4" opacity=".45"/>
  <path d="M14 42 C14 34 22 30 32 30 C42 30 50 34 50 42 C50 50 42 56 32 56 C22 56 14 50 14 42 Z" fill="currentColor"/>
  <path d="M26 30 L22 20 M38 30 L42 20" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>
  <path d="M6 44 C2 40 4 34 10 34 L14 40 Z M58 44 C62 40 60 34 54 34 L50 40 Z" fill="currentColor"/>
  <circle cx="26" cy="42" r="3.4" fill="${K}"/><circle cx="38" cy="42" r="3.4" fill="${K}"/>`);
