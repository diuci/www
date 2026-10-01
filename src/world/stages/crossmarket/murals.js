// Crossroads Market — stage decals / signage for the mural atlas (see src/world/murals.js).
//
// drawMurals(g, R, kit) is called whenever this stage is loaded: draw into the canvas 2D context `g`, inside the
// stage region R = { x, y, w, h } (px; 2048 x 1008) only, and return the table entries for mural ids 4…11:
//   { id, x, y, w, h, m: [faceW, faceH] }                         decal fitted at the face origin, faceW x faceH metres
//   { id, x, y, w, h, place: [x0, xLen, y0, yLen], fx: [weather, chip] }  explicit placement (murals.js header)
// fx defaults to [0.85, 1] (how much the surface's mottling shows through / its chips cut the decal).
//
// Crossroads Market's walls carry old painted advertisements ("ghost signs") on their blank gables, and the hall floor
// has a mosaic threshold band at each Market Street entrance:
//   4  CROSSROADS MARKET · EST 1887 — the tall row's gable facing each spawn (4.5 × 5.8 m face, render)
//   5  FISH · OYSTERS · ICE — the fishmonger's upper wall over Fish Lane (5 × 5.4 m face, ashlar)
//   6  TEA · COFFEE · COCOA — the tall row's gable facing the hall (4.5 × 5.8 m face, render)
//   7  mosaic threshold band across each gable entrance of the (turned) hall floor, in 4.5 m halves
export const MURAL = { market: 4, fish: 5, tea: 6, mosaic: 7 };

export function drawMurals(g, R, kit) {
  const { fontB, font } = kit;
  const X0 = R.x, Y0 = R.y;
  const CREAM = '#efe4c8', RED = '#a8453a', GREEN = '#3f6b55', NAVY = '#2b3a58', GOLD = '#c9a24e', INK = '#3a2e26';
  const out = [];

  // faded paint: draw at partial alpha, then knock holes of "lost paint" through it in a seeded pattern
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  function wear(x, y, w, h, n = 90, maxR = 10) {
    g.save(); g.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < n; i++) { g.globalAlpha = 0.25 + rnd() * 0.5; g.beginPath(); g.ellipse(x + rnd() * w, y + rnd() * h, 2 + rnd() * maxR, 1 + rnd() * maxR * 0.5, rnd() * 3, 0, Math.PI * 2); g.fill(); }
    // vertical rain streaks
    for (let i = 0; i < 26; i++) { g.globalAlpha = 0.12 + rnd() * 0.2; const sx = x + rnd() * w; g.fillRect(sx, y + rnd() * h * 0.3, 2 + rnd() * 4, h * (0.3 + rnd() * 0.6)); }
    g.restore();
  }
  function text(s, cx, cy, px, fill, f = fontB, maxW = 9999, stroke = null, sw = 0) {
    g.font = f(px); let p = px;
    while (g.measureText(s).width > maxW && p > 10) { p -= 2; g.font = f(p); }
    g.textAlign = 'center'; g.textBaseline = 'middle';
    if (stroke) { g.lineJoin = 'round'; g.lineWidth = sw; g.strokeStyle = stroke; g.strokeText(s, cx, cy); }
    g.fillStyle = fill; g.fillText(s, cx, cy);
  }
  function panel(x, y, w, h, bg, border) {
    g.fillStyle = bg; g.fillRect(x, y, w, h);
    g.strokeStyle = border; g.lineWidth = 8; g.strokeRect(x + 10, y + 10, w - 20, h - 20);
    g.lineWidth = 3; g.strokeRect(x + 22, y + 22, w - 44, h - 44);
  }
  function ribbon(cx, cy, w, h, fill) {
    g.fillStyle = fill;
    g.beginPath(); g.moveTo(cx - w / 2, cy - h / 2); g.lineTo(cx + w / 2, cy - h / 2); g.lineTo(cx + w / 2 + h * 0.4, cy); g.lineTo(cx + w / 2, cy + h / 2); g.lineTo(cx - w / 2, cy + h / 2); g.lineTo(cx - w / 2 - h * 0.4, cy); g.closePath(); g.fill();
  }

  // ---- 4: CROSSROADS MARKET (480 × 580 px, 3.8 × 4.6 m)
  {
    const x = X0, y = Y0, w = 480, h = 580;
    g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
    g.globalAlpha = 0.86;
    panel(x, y, w, h, CREAM, RED);
    text('十字路口', x + w / 2, y + 92, 74, RED, fontB, w - 70);
    g.fillStyle = GREEN; g.fillRect(x + 40, y + 140, w - 80, 118);
    text('市场', x + w / 2, y + 200, 104, CREAM, fontB, w - 110);
    ribbon(x + w / 2, y + 305, 250, 50, RED);
    text('始创于 1887', x + w / 2, y + 306, 34, CREAM, fontB, 230);
    // a basket of produce
    g.fillStyle = '#8a5a34'; g.beginPath(); g.moveTo(x + 150, y + 400); g.lineTo(x + 330, y + 400); g.lineTo(x + 305, y + 480); g.lineTo(x + 175, y + 480); g.closePath(); g.fill();
    g.strokeStyle = '#6a4226'; g.lineWidth = 4; for (let i = 0; i < 6; i++) { g.beginPath(); g.moveTo(x + 160 + i * 32, y + 402); g.lineTo(x + 180 + i * 26, y + 478); g.stroke(); }
    for (const [dx, dy, r, c] of [[-60, -18, 26, RED], [-18, -30, 28, '#d98a2e'], [28, -22, 26, '#7a9a4a'], [66, -14, 22, RED], [8, -54, 22, '#e0c050']]) { g.fillStyle = c; g.beginPath(); g.arc(x + 240 + dx, y + 400 + dy, r, 0, Math.PI * 2); g.fill(); }
    g.strokeStyle = '#6a4226'; g.lineWidth = 7; g.beginPath(); g.arc(x + 240, y + 402, 92, Math.PI * 1.08, Math.PI * 1.92); g.stroke();
    text('每日新鲜', x + w / 2, y + 522, 34, GREEN, fontB, w - 90);
    g.globalAlpha = 1;
    wear(x, y, w, h, 120, 12);
    g.restore();
    out.push({ id: MURAL.market, x, y, w, h, place: [0.35, 3.8, 0.55, 4.6], fx: [1, 1] });
  }
  // ---- 5: FISH · OYSTERS · ICE (500 × 520 px, 4.2 × 4.4 m)
  {
    const x = X0 + 500, y = Y0, w = 500, h = 520;
    g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
    g.globalAlpha = 0.84;
    panel(x, y, w, h, '#e9e2cf', NAVY);
    text('珀奇父子', x + w / 2, y + 70, 36, NAVY, fontB, w - 90);
    text('鱼铺', x + w / 2, y + 170, 150, NAVY, fontB, w - 80, CREAM, 10);
    // a big fish
    g.fillStyle = '#5e7f96'; g.beginPath(); g.ellipse(x + 230, y + 320, 150, 52, 0, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.moveTo(x + 360, y + 320); g.lineTo(x + 440, y + 262); g.lineTo(x + 430, y + 378); g.closePath(); g.fill();
    g.fillStyle = '#e9e2cf'; g.beginPath(); g.arc(x + 128, y + 308, 12, 0, Math.PI * 2); g.fill();
    g.fillStyle = NAVY; g.beginPath(); g.arc(x + 128, y + 308, 6, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#3f5c70'; g.lineWidth = 5; for (let i = 0; i < 4; i++) { g.beginPath(); g.arc(x + 190 + i * 40, y + 320, 34, -0.8, 0.8); g.stroke(); }
    g.fillStyle = RED; g.fillRect(x + 40, y + 400, w - 80, 70);
    text('生蚝 · 冰鲜 · 熏制', x + w / 2, y + 436, 36, CREAM, fontB, w - 110);
    g.globalAlpha = 1;
    wear(x, y, w, h, 110, 12);
    g.restore();
    out.push({ id: MURAL.fish, x, y, w, h, place: [0.4, 4.2, 0.7, 4.4], fx: [1, 1] });
  }
  // ---- 6: TEA · COFFEE · COCOA (480 × 580 px, 3.8 × 4.6 m)
  {
    const x = X0 + 1020, y = Y0, w = 480, h = 580;
    g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
    g.globalAlpha = 0.85;
    panel(x, y, w, h, '#f0e6cc', '#5b2230');
    text('中央市场咖啡馆', x + w / 2, y + 72, 40, '#5b2230', fontB, w - 90);
    // teacup + steam
    g.fillStyle = '#5b2230'; g.beginPath(); g.moveTo(x + 150, y + 170); g.lineTo(x + 330, y + 170); g.quadraticCurveTo(x + 320, y + 290, x + 240, y + 300); g.quadraticCurveTo(x + 160, y + 290, x + 150, y + 170); g.fill();
    g.lineWidth = 16; g.strokeStyle = '#5b2230'; g.beginPath(); g.arc(x + 335, y + 215, 34, -1.3, 1.3); g.stroke();
    g.fillStyle = '#5b2230'; g.beginPath(); g.ellipse(x + 240, y + 312, 130, 16, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#a8453a'; g.lineWidth = 8; for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(x + 200 + i * 40, y + 150); g.bezierCurveTo(x + 180 + i * 40, y + 120, x + 225 + i * 40, y + 100, x + 200 + i * 40, y + 70 + 40); g.stroke(); }
    text('茶', x + w / 2, y + 380, 70, '#a8453a', fontB, w - 90);
    text('咖啡 · 可可', x + w / 2, y + 450, 44, '#5b2230', fontB, w - 90);
    g.fillStyle = GOLD; g.fillRect(x + 60, y + 500, w - 120, 8);
    text('全天供应', x + w / 2, y + 532, 28, '#5b2230', fontB, w - 110);
    g.globalAlpha = 1;
    wear(x, y, w, h, 110, 12);
    g.restore();
    out.push({ id: MURAL.tea, x, y, w, h, place: [0.35, 3.8, 0.55, 4.6], fx: [1, 1] });
  }
  // ---- 7: mosaic threshold on the hall floor: a band of tesserae (black / cream / terracotta) — a Greek key border
  // around a row of rosettes, laid across the Market Street entrance (rotationally symmetric; 1024 × 96 px, 9 × 0.85 m)
  {
    const x = X0, y = Y0 + 600, w = 1024, h = 96;
    g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
    g.fillStyle = '#e8dcc2'; g.fillRect(x, y, w, h);
    const t = 8;       // tessera size (px)
    for (let yy = 0; yy < h; yy += t) for (let xx = 0; xx < w; xx += t) { g.fillStyle = `rgba(0,0,0,${0.04 + ((xx * 7 + yy * 13) % 17) / 400})`; g.fillRect(x + xx, y + yy, t - 1, t - 1); }
    g.fillStyle = '#2c2a28'; g.fillRect(x, y, w, t); g.fillRect(x, y + h - t, w, t);
    // Greek key strips top + bottom
    g.fillStyle = '#9c4a36';
    for (let k = 0; k < w; k += 32) { for (const yy of [t + 2, h - t - 18]) { g.fillRect(x + k, yy + y, 24, 4); g.fillRect(x + k + 20, yy + y, 4, 16); g.fillRect(x + k + 8, yy + y + 12, 16, 4); g.fillRect(x + k + 8, yy + y + 6, 4, 10); } }
    // rosettes along the middle
    for (let k = 48; k < w; k += 96) {
      const cx = x + k, cy = y + h / 2;
      g.fillStyle = '#2c2a28'; g.beginPath(); g.arc(cx, cy, 14, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#c9a24e'; for (let p = 0; p < 8; p++) { const a = (p / 8) * Math.PI * 2; g.beginPath(); g.ellipse(cx + Math.cos(a) * 9, cy + Math.sin(a) * 9, 5, 3, a, 0, Math.PI * 2); g.fill(); }
      g.fillStyle = '#9c4a36'; g.beginPath(); g.arc(cx, cy, 4, 0, Math.PI * 2); g.fill();
    }
    g.restore();
    // the hall is turned with the tramway: each gable threshold is two floor pieces 4.5 m long (the entrance halves,
    // face u from the crossing outwards, v from the gable edge), each taking half the band
    out.push({ id: MURAL.mosaic, x, y, w: w / 2, h, place: [0, 4.5, 0.12, 0.85], fx: [0.5, 0.2] });
  }
  return out;
}
