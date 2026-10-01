// Tidewater Plaza — stage decals / signage for the mural atlas (see src/world/murals.js).
//
// drawMurals(g, R, kit) is called whenever this stage is loaded: draw into the canvas 2D context `g`, inside the
// stage region R = { x, y, w, h } (px; 2048 x 1008) only, and return the table entries for mural ids 4…11:
//   { id, x, y, w, h, m: [faceW, faceH] }                         decal fitted at the face origin, faceW x faceH metres
//   { id, x, y, w, h, place: [x0, xLen, y0, yLen], fx: [weather, chip] }  explicit placement (murals.js header)
// fx defaults to [0.85, 1] (how much the surface's mottling shows through / its chips cut the decal).
// A layout face shows a mural with `mural: [{ n: [nx, ny, nz], id }]` on a box (the face whose outward normal
// matches n). Ids 0–3 are the shared tileable strips (INKWAVE banner, chevrons, shop fronts, shipping line).
// kit: { font(px), fontB(px), NAVY, CORAL, TEAL, MUSTARD, CREAM, SKY, squid(g, x, y, s, color, eye), blob(g, x, y, r, seed, color) }
//
// Tidewater's decals (face frames: top faces u = -x, v = +z; walls u = to the right as you face them, v = up):
//   4  the borough crest mosaic round each fountain (square's fountain band, 10 m, centred on the fountain)
//   5  the Jubilee ring mosaic round the clock tower (the tower's square dais, 8 m)
//   6  JUBILEE TERRACE carved + inlaid in the terrace's front / back retaining walls
//   7  a faded railway poster (TIDEWATER — FOR SUN, SEA & BANDS) on the colonnade's end wall
//   8  the ice-cream kiosk's painted panels (stripes, a giant 99, ICES)
//   9  a ghost sign (TIDEWATER ROCK) on the colonnade shops' gable toward mid
//   10 TIDEWATER cut into the terrace's jumpable kerb sides
//   11 the pier booths' toll boards (PIER TOLL 2d, OPEN 9 TILL DUSK)
const NAVY = '#27304d', CREAM = '#f3ead6', CORAL = '#d9735f', TEAL = '#3f8f86', SEA = '#4f8fa0', GOLD = '#c9a453',
  MUST = '#e3b54c', INK = '#1f2533', ROSE = '#e98aa6', STONE = '#d8d0c0';
// 招牌文案已中文化：内置 TitanOne/Rubik 只有拉丁子集（无汉字），字体串必须先走系统中文字体
// （与 src/world/poemDecals.js 的约定一致）。
const ZH = '"PingFang SC","Hiragino Sans GB","Microsoft YaHei","Noto Sans SC",sans-serif';

function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// text set round an arc (centre cx, cy, radius r, starting angle a0 going clockwise), letters upright to the centre
function arcText(g, str, cx, cy, r, a0, spread, font, fill) {
  g.save(); g.font = font; g.fillStyle = fill; g.textAlign = 'center'; g.textBaseline = 'middle';
  const n = str.length;
  for (let i = 0; i < n; i++) {
    const a = a0 + (i + 0.5) / n * spread;
    g.save(); g.translate(cx + Math.cos(a) * r, cy + Math.sin(a) * r); g.rotate(a + Math.PI / 2); g.fillText(str[i], 0, 0); g.restore();
  }
  g.restore();
}
// mosaic tesserae: a fine grid of darker grout lines + per-tile tone jitter, clipped to what is already drawn
function tesserae(g, x, y, w, h, step, seed) {
  const R = rng(seed);
  g.save();
  g.globalCompositeOperation = 'source-atop';
  for (let ty = y; ty < y + h; ty += step) for (let tx = x + ((ty / step) % 2 ? step / 2 : 0) - step; tx < x + w; tx += step) {
    const k = R();
    g.fillStyle = k < 0.5 ? `rgba(0,0,0,${0.06 * k})` : `rgba(255,255,255,${0.1 * (k - 0.5)})`;
    g.fillRect(tx, ty, step, step);
  }
  g.strokeStyle = 'rgba(40,30,20,0.28)'; g.lineWidth = 1;
  g.beginPath();
  for (let ty = y; ty <= y + h; ty += step) { g.moveTo(x, ty); g.lineTo(x + w, ty); }
  for (let ty = y; ty < y + h; ty += step) for (let tx = x + ((ty / step) % 2 ? step / 2 : 0); tx <= x + w; tx += step) { g.moveTo(tx, ty); g.lineTo(tx, ty + step); }
  g.stroke();
  g.restore();
}
// Greek wave ("running dog") band round a circle between r0 and r1
function waveRing(g, cx, cy, r0, r1, n, col, bg) {
  g.fillStyle = bg; g.beginPath(); g.arc(cx, cy, r1, 0, Math.PI * 2); g.arc(cx, cy, r0, 0, Math.PI * 2, true); g.fill();
  g.fillStyle = col;
  const rm = (r0 + r1) / 2, hw = (r1 - r0) / 2;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2, da = (Math.PI * 2) / n;
    g.beginPath();
    for (let k = 0; k <= 12; k++) {
      const t = k / 12, aa = a + t * da * 0.95;
      const rr = rm - hw * 0.85 + hw * 1.7 * Math.pow(Math.sin(t * Math.PI * 0.5), 1.5) * (t < 0.75 ? 1 : 1 - (t - 0.75) * 2.4);
      const px = cx + Math.cos(aa) * rr, py = cy + Math.sin(aa) * rr;
      if (k === 0) g.moveTo(px, py); else g.lineTo(px, py);
    }
    g.lineTo(cx + Math.cos(a + da * 0.95) * (rm - hw * 0.85), cy + Math.sin(a + da * 0.95) * (rm - hw * 0.85));
    g.closePath(); g.fill();
  }
}
function star(g, cx, cy, n, rOut, rIn, a0, fillA, fillB) {
  for (let i = 0; i < n; i++) {
    const a = a0 + (i / n) * Math.PI * 2, da = Math.PI / n;
    // two-tone points: lit half + shaded half
    g.fillStyle = fillA; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * rOut, cy + Math.sin(a) * rOut); g.lineTo(cx + Math.cos(a + da) * rIn, cy + Math.sin(a + da) * rIn); g.closePath(); g.fill();
    g.fillStyle = fillB; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * rOut, cy + Math.sin(a) * rOut); g.lineTo(cx + Math.cos(a - da) * rIn, cy + Math.sin(a - da) * rIn); g.closePath(); g.fill();
  }
}
// soft weathering: erase flecks + a few fade blotches (destination-out inside a rect)
function weather(g, x, y, w, h, n, seed, amt = 0.5) {
  const R = rng(seed);
  g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
  g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < n; i++) { g.fillStyle = `rgba(0,0,0,${amt * (0.3 + 0.7 * R())})`; const r = 0.6 + R() * R() * 3; g.beginPath(); g.ellipse(x + R() * w, y + R() * h, r * (0.6 + R()), r * (0.6 + R()), R() * 3, 0, Math.PI * 2); g.fill(); }
  for (let i = 0; i < 8; i++) { const gr = g.createRadialGradient(0, 0, 0, 0, 0, 1); gr.addColorStop(0, `rgba(0,0,0,${0.25 * amt})`); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.save(); g.translate(x + R() * w, y + R() * h); g.scale(20 + R() * 60, 12 + R() * 40); g.fillStyle = gr; g.beginPath(); g.arc(0, 0, 1, 0, Math.PI * 2); g.fill(); g.restore(); }
  g.restore();
}
function sign(g, x, y, w, h, fill, stroke, lw, r = 10) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  if (fill) { g.fillStyle = fill; g.fill(); }
  if (stroke) { g.lineWidth = lw; g.strokeStyle = stroke; g.stroke(); }
}
function fitFont(g, str, maxW, px, fontFn) { let p = px; g.font = fontFn(p); while (g.measureText(str).width > maxW && p > 8) { p -= 2; g.font = fontFn(p); } return p; }

export function drawMurals(g, R, kit) {
  const { font, fontB } = kit;
  const X = R.x, Y = R.y;
  const out = [];

  // ---------------------------------------------------------------- 4: borough crest mosaic (512 px = 10 m)
  {
    const r = { x: X, y: Y, w: 512, h: 512 }, cx = r.x + 256, cy = r.y + 256, s = 256 / 5;   // px per metre ≈ 51
    g.save();
    // outer border: cream band with a navy key line, the borough legend in navy
    g.fillStyle = CREAM; g.beginPath(); g.arc(cx, cy, 4.95 * s, 0, Math.PI * 2); g.fill();
    g.strokeStyle = NAVY; g.lineWidth = 0.1 * s; g.beginPath(); g.arc(cx, cy, 4.85 * s, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.arc(cx, cy, 4.05 * s, 0, Math.PI * 2); g.stroke();
    arcText(g, '· 潮水自治市 · 海是良药 ', cx, cy, 4.45 * s, -Math.PI / 2 - 1.3, Math.PI * 2 - 0.1, `800 ${Math.round(0.5 * s)}px ${ZH}`, NAVY);
    // wave band
    waveRing(g, cx, cy, 3.35 * s, 3.95 * s, 22, CORAL, CREAM);
    g.strokeStyle = NAVY; g.lineWidth = 0.06 * s; g.beginPath(); g.arc(cx, cy, 3.3 * s, 0, Math.PI * 2); g.stroke();
    // field: sea-green, the compass star over it
    g.fillStyle = TEAL; g.beginPath(); g.arc(cx, cy, 3.28 * s, 0, Math.PI * 2); g.fill();
    star(g, cx, cy, 8, 3.25 * s, 1.0 * s, -Math.PI / 2, MUST, '#c79a36');
    star(g, cx, cy, 4, 3.25 * s, 0.9 * s, -Math.PI / 2, CREAM, '#d9ccb2');
    // cardinal letters just outside the star tips' base
    g.font = font(Math.round(0.55 * s)); g.fillStyle = NAVY; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (const [t, a] of [['北', -Math.PI / 2], ['东', 0], ['南', Math.PI / 2], ['西', Math.PI]]) { g.save(); g.translate(cx + Math.cos(a) * 3.62 * s, cy + Math.sin(a) * 3.62 * s); g.rotate(a + Math.PI / 2); g.fillStyle = CORAL; g.fillText(t, 0, 0); g.restore(); }
    // centre (under the fountain basin): plain navy
    g.fillStyle = NAVY; g.beginPath(); g.arc(cx, cy, 2.55 * s, 0, Math.PI * 2); g.fill();
    tesserae(g, r.x, r.y, r.w, r.h, 5, 41);
    weather(g, r.x, r.y, r.w, r.h, 900, 43, 0.35);
    g.restore();
    out.push({ id: 4, ...r, place: [10, 10, 1, 10], fx: [0.55, 0.25] });
  }

  // ---------------------------------------------------------------- 5: Jubilee ring round the clock tower (384 px = 8 m)
  {
    const r = { x: X + 512, y: Y, w: 384, h: 384 }, cx = r.x + 192, cy = r.y + 192, s = 192 / 4;
    g.save();
    g.fillStyle = NAVY; g.beginPath(); g.arc(cx, cy, 3.95 * s, 0, Math.PI * 2); g.arc(cx, cy, 2.55 * s, 0, Math.PI * 2, true); g.fill();
    g.strokeStyle = GOLD; g.lineWidth = 0.07 * s; for (const rr of [3.85, 2.65]) { g.beginPath(); g.arc(cx, cy, rr * s, 0, Math.PI * 2); g.stroke(); }
    arcText(g, '禧年台 · MDCCCLXXXVII · ', cx, cy, 3.25 * s, -Math.PI / 2 - 0.9, Math.PI * 2 - 0.05, `800 ${Math.round(0.46 * s)}px ${ZH}`, CREAM);
    // four rosettes on the diagonals
    for (let k = 0; k < 4; k++) { const a = Math.PI / 4 + (k * Math.PI) / 2, x = cx + Math.cos(a) * 3.25 * s, y = cy + Math.sin(a) * 3.25 * s; g.fillStyle = CORAL; for (let p = 0; p < 6; p++) { const b = (p / 6) * Math.PI * 2; g.beginPath(); g.ellipse(x + Math.cos(b) * 0.14 * s, y + Math.sin(b) * 0.14 * s, 0.12 * s, 0.07 * s, b, 0, Math.PI * 2); g.fill(); } g.fillStyle = MUST; g.beginPath(); g.arc(x, y, 0.08 * s, 0, Math.PI * 2); g.fill(); }
    tesserae(g, r.x, r.y, r.w, r.h, 5, 51);
    weather(g, r.x, r.y, r.w, r.h, 600, 53, 0.3);
    g.restore();
    out.push({ id: 5, ...r, place: [1.8, 8, 1.8, 8], fx: [0.55, 0.25] });   // centred on the tower's dais (11.6 m square)
  }

  // ---------------------------------------------------------------- 6: JUBILEE TERRACE inscription (1024 × 116 = 7.8 × 0.88 m)
  {
    const r = { x: X + 896, y: Y, w: 1024, h: 116 };
    g.save();
    sign(g, r.x + 6, r.y + 8, r.w - 12, r.h - 16, 'rgba(236,228,210,0.95)', 'rgba(120,108,90,0.9)', 5, 6);
    g.font = font(70); g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = 'rgba(255,255,255,0.7)'; g.fillText('禧 年 台', r.x + r.w / 2 + 2, r.y + r.h / 2 + 5);
    g.fillStyle = '#34405c'; g.fillText('禧 年 台', r.x + r.w / 2, r.y + r.h / 2 + 2);
    for (const x of [r.x + 60, r.x + r.w - 60]) { g.fillStyle = CORAL; g.beginPath(); g.arc(x, r.y + r.h / 2, 22, 0, Math.PI * 2); g.fill(); g.fillStyle = '#34405c'; g.beginPath(); g.arc(x, r.y + r.h / 2, 10, 0, Math.PI * 2); g.fill(); }
    weather(g, r.x, r.y, r.w, r.h, 500, 61, 0.4);
    g.restore();
    out.push({ id: 6, ...r, place: [8.6, 7.8, 0.2, 0.8], fx: [0.7, 0.5] });
  }

  // ---------------------------------------------------------------- 7: railway poster on the colonnade end wall (448 × 314 = 4.5 × 3.15 m)
  {
    const r = { x: X + 896, y: Y + 128, w: 448, h: 314 };
    const px = r.x + 70, py = r.y + 26, pw = r.w - 140, ph = r.h - 40;
    g.save();
    // paper, sky gradient, sun + rays, sea bands, the pier + pavilion, the clock tower silhouette
    g.fillStyle = '#f4ead2'; g.fillRect(px - 8, py - 8, pw + 16, ph + 16);
    g.save(); g.beginPath(); g.rect(px, py, pw, ph); g.clip();
    const sky = g.createLinearGradient(0, py, 0, py + ph * 0.6); sky.addColorStop(0, '#f2b879'); sky.addColorStop(1, '#fbe3b0'); g.fillStyle = sky; g.fillRect(px, py, pw, ph);
    g.fillStyle = 'rgba(255,240,200,0.8)'; for (let i = 0; i < 12; i++) { const a = Math.PI + (i / 11) * Math.PI; g.beginPath(); g.moveTo(px + pw * 0.5, py + ph * 0.56); g.lineTo(px + pw * 0.5 + Math.cos(a - 0.05) * 400, py + ph * 0.56 + Math.sin(a - 0.05) * 400); g.lineTo(px + pw * 0.5 + Math.cos(a + 0.05) * 400, py + ph * 0.56 + Math.sin(a + 0.05) * 400); g.fill(); }
    g.fillStyle = '#f7d27a'; g.beginPath(); g.arc(px + pw * 0.5, py + ph * 0.56, 34, 0, Math.PI * 2); g.fill();
    for (let i = 0; i < 5; i++) { g.fillStyle = ['#3f8fa0', '#4f9fb0', '#357f92', '#2f6f86', '#27607a'][i]; g.fillRect(px, py + ph * 0.56 + i * 18, pw, 18); }
    // pier + pavilion
    g.fillStyle = '#2c3346'; g.fillRect(px + 20, py + ph * 0.52, 150, 5); for (let x = px + 24; x < px + 170; x += 12) g.fillRect(x, py + ph * 0.52, 2, 18);
    g.beginPath(); g.moveTo(px + 20, py + ph * 0.52); g.lineTo(px + 20, py + ph * 0.42); g.quadraticCurveTo(px + 45, py + ph * 0.3, px + 70, py + ph * 0.42); g.lineTo(px + 70, py + ph * 0.52); g.fill();
    // clock tower
    g.fillRect(px + pw - 70, py + ph * 0.2, 24, ph * 0.4); g.beginPath(); g.moveTo(px + pw - 74, py + ph * 0.2); g.quadraticCurveTo(px + pw - 58, py + ph * 0.05, px + pw - 42, py + ph * 0.2); g.fill();
    g.fillStyle = '#f4ead2'; g.beginPath(); g.arc(px + pw - 58, py + ph * 0.26, 7, 0, Math.PI * 2); g.fill();
    // bathers' parasols on the sand strip
    g.fillStyle = '#f0d9a8'; g.fillRect(px, py + ph * 0.86, pw, ph * 0.14);
    for (let i = 0; i < 5; i++) { const x = px + 30 + i * 55; g.fillStyle = i % 2 ? CORAL : NAVY; g.beginPath(); g.arc(x, py + ph * 0.86, 16, Math.PI, 0); g.fill(); g.fillStyle = '#2c3346'; g.fillRect(x - 1, py + ph * 0.86, 2, 14); }
    g.restore();
    // title band + strap
    g.fillStyle = NAVY; g.fillRect(px, py, pw, 56);
    fitFont(g, '潮水', pw - 30, 44, font); g.fillStyle = CREAM; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('潮水', px + pw / 2, py + 30);
    g.fillStyle = NAVY; g.fillRect(px, py + ph - 34, pw, 34);
    g.font = fontB(17); g.fillStyle = MUST; g.fillText('阳光 · 大海 · 乐队  坐火车更快', px + pw / 2, py + ph - 17);
    weather(g, px - 8, py - 8, pw + 16, ph + 16, 1400, 71, 0.55);
    g.restore();
    out.push({ id: 7, ...r, m: [4.5, 3.15], fx: [0.8, 0.9] });
  }

  // ---------------------------------------------------------------- 8: ice-cream kiosk panels (256 × 246 = 2.6 × 2.5 m)
  {
    const r = { x: X + 1344, y: Y + 128, w: 256, h: 246 };
    g.save();
    // candy stripes low down, a scalloped band, the cone
    for (let i = 0; i < 13; i++) { g.fillStyle = i % 2 ? '#fbf3e4' : ROSE; g.fillRect(r.x + i * 20, r.y + r.h - 70, 20, 60); }
    g.fillStyle = '#fbf3e4'; for (let i = 0; i < 13; i++) { g.beginPath(); g.arc(r.x + 10 + i * 20, r.y + r.h - 70, 10, Math.PI, 0); g.fill(); }
    const cx = r.x + 128, cy = r.y + 120;
    g.fillStyle = '#d9a55c'; g.beginPath(); g.moveTo(cx - 34, cy - 10); g.lineTo(cx + 34, cy - 10); g.lineTo(cx, cy + 70); g.closePath(); g.fill();
    g.strokeStyle = '#b98543'; g.lineWidth = 3; for (let i = -3; i <= 3; i++) { g.beginPath(); g.moveTo(cx + i * 11 - 20, cy - 10); g.lineTo(cx + i * 11 + 16, cy + 50); g.stroke(); }
    g.fillStyle = '#fbf3df'; for (const [dx, dy, rr] of [[0, -22, 36], [-20, -40, 22], [18, -44, 24], [0, -62, 18]]) { g.beginPath(); g.arc(cx + dx, cy + dy, rr, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = '#5a3522'; g.save(); g.translate(cx + 16, cy - 70); g.rotate(0.4); g.fillRect(-5, -30, 10, 34); g.restore();
    g.fillStyle = '#e25a6d'; g.beginPath(); g.arc(cx - 16, cy - 58, 8, 0, Math.PI * 2); g.fill();
    g.font = font(34); g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 6; g.strokeStyle = '#fbf3e4'; g.strokeText('冰品', cx, r.y + 30); g.fillStyle = '#b83a5e'; g.fillText('冰品', cx, r.y + 30);
    g.font = fontB(16); g.fillStyle = NAVY; g.fillText('软冰淇淋  ·  99便士  ·  棒棒糖', cx, r.y + r.h - 88);
    weather(g, r.x, r.y, r.w, r.h, 500, 81, 0.35);
    g.restore();
    out.push({ id: 8, ...r, m: [2.6, 2.5], fx: [0.8, 0.9] });
  }

  // ---------------------------------------------------------------- 9: ghost sign on the colonnade shops' gable (224 × 261 = 3 × 3.5 m)
  {
    const r = { x: X + 1600, y: Y + 128, w: 224, h: 261 };
    g.save();
    g.globalAlpha = 0.82;
    sign(g, r.x + 10, r.y + 16, r.w - 20, r.h - 60, '#7a2f45', null, 0, 4);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = fontB(26); g.fillStyle = '#f1e4c8'; g.fillText('潮水', r.x + r.w / 2, r.y + 48);
    g.font = font(76); g.fillStyle = '#f7d9e0'; g.fillText('石店', r.x + r.w / 2, r.y + 112);
    g.fillStyle = '#f1e4c8'; g.fillRect(r.x + 30, r.y + 150, r.w - 60, 4);
    g.font = fontB(17); g.fillText('全手工绘制', r.x + r.w / 2, r.y + 172);
    g.font = font(28); g.fillStyle = MUST; g.fillText('1d', r.x + r.w / 2, r.y + 202);
    g.globalAlpha = 1;
    weather(g, r.x, r.y, r.w, r.h, 1600, 91, 0.7);
    g.restore();
    out.push({ id: 9, ...r, m: [3, 3.5], fx: [0.9, 1] });
  }

  // ---------------------------------------------------------------- 10: TIDEWATER cut into the terrace kerb sides (1024 × 116 = 7 × 0.8 m)
  {
    const r = { x: X, y: Y + 520, w: 1024, h: 116 };
    g.save();
    g.font = font(78); g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = 'rgba(255,255,255,0.6)'; g.fillText('潮  水', r.x + r.w / 2 + 2, r.y + r.h / 2 + 5);
    g.fillStyle = '#3e4a63'; g.fillText('潮  水', r.x + r.w / 2, r.y + r.h / 2 + 2);
    weather(g, r.x, r.y, r.w, r.h, 400, 101, 0.4);
    g.restore();
    out.push({ id: 10, ...r, place: [5.5, 7, 0.2, 0.8], fx: [0.7, 0.5] });
  }

  // ---------------------------------------------------------------- 11: pier toll boards on the booths (300 × 260 = 3 × 2.6 m)
  {
    const r = { x: X + 1024, y: Y + 520, w: 300, h: 260 };
    const bx = r.x + 60, by = r.y + 40, bw = 180, bh = 130;
    g.save();
    sign(g, bx, by, bw, bh, NAVY, GOLD, 6, 12);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = font(30); g.fillStyle = CREAM; g.fillText('码头通行费', bx + bw / 2, by + 32);
    g.font = font(44); g.fillStyle = MUST; g.fillText('2d', bx + bw / 2, by + 74);
    g.font = fontB(14); g.fillStyle = CREAM; g.fillText('营业至黄昏', bx + bw / 2, by + 110);
    // pointing hand arrow under the board
    g.fillStyle = CORAL; g.beginPath(); g.moveTo(bx + 30, by + bh + 30); g.lineTo(bx + 130, by + bh + 30); g.lineTo(bx + 130, by + bh + 16); g.lineTo(bx + 160, by + bh + 38); g.lineTo(bx + 130, by + bh + 60); g.lineTo(bx + 130, by + bh + 46); g.lineTo(bx + 30, by + bh + 46); g.closePath(); g.fill();
    g.font = fontB(13); g.fillStyle = CREAM; g.fillText('往码头', bx + 80, by + bh + 38);
    weather(g, r.x, r.y, r.w, r.h, 500, 111, 0.4);
    g.restore();
    out.push({ id: 11, ...r, m: [3, 2.6], fx: [0.8, 0.9] });
  }
  return out;
}
