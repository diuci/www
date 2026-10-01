// Lockgate Canals — stage decals / signage for the mural atlas (see src/world/murals.js).
//
// drawMurals(g, R, kit) is called whenever this stage is loaded: draw into the canvas 2D context `g`, inside the
// stage region R = { x, y, w, h } (px; 2048 x 1008) only, and return the table entries for mural ids 4…11:
//   { id, x, y, w, h, m: [faceW, faceH] }                         decal fitted at the face origin, faceW x faceH metres
//   { id, x, y, w, h, place: [x0, xLen, y0, yLen], fx: [weather, chip] }  explicit placement (murals.js header)
// fx defaults to [0.85, 1] (how much the surface's paint mottling shows through / its chips cut the decal).
// A layout face shows a mural with `mural: [{ n: [nx, ny, nz], id }]` on a box (the face whose outward normal
// matches n). Ids 0–3 are the shared tileable strips (INKWAVE banner, chevrons, shop fronts, shipping line).
//
//   4  narrowboat PERSEVERANCE: traditional cabin-side livery (green, coach-lined red panel, shaded name, roses)
//   5  transit shed ghost sign: J. BARGE & SONS · CANAL CARRIERS (faded paint on brick)
//   6  the back yard's notch wall: old painted advert for SQUIDLEY'S INKS
//   7  the east yard wall: CANAL CARRYING Co. — COAL · CORN · TIMBER
export const MURAL_IDS = { livery: 4, shedSign: 5, westAd: 6, eastAd: 7 };

const CREAM = '#efe3c2', GREEN = '#2f4a3c', RED = '#8e2f2a', YELLOW = '#e2b54b', BLACK = '#1f2226';

function rr(g, x, y, w, h, r) { g.beginPath(); g.roundRect(x, y, w, h, r); }
function fitFont(g, s, maxW, px, fontFn) { let p = px; g.font = fontFn(p); while (g.measureText(s).width > maxW && p > 8) { p -= 2; g.font = fontFn(p); } return p; }
// sign-writer's shaded letters: drop shade down-right, a thin outline, then the face
function shaded(g, s, x, y, px, fontFn, face, shade, outline, maxW) {
  const p = fitFont(g, s, maxW, px, fontFn);
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
  const d = Math.max(2, p * 0.07);
  g.fillStyle = shade; g.fillText(s, x + d, y + d);
  if (outline) { g.lineWidth = Math.max(2, p * 0.06); g.strokeStyle = outline; g.strokeText(s, x, y); }
  g.fillStyle = face; g.fillText(s, x, y);
}
function rose(g, x, y, r, c) {
  g.fillStyle = c;
  for (let k = 0; k < 5; k++) { const a = (k / 5) * Math.PI * 2; g.beginPath(); g.arc(x + Math.cos(a) * r * 0.55, y + Math.sin(a) * r * 0.55, r * 0.55, 0, Math.PI * 2); g.fill(); }
  g.fillStyle = 'rgba(255,255,255,0.35)'; g.beginPath(); g.arc(x - r * 0.2, y - r * 0.25, r * 0.35, 0, Math.PI * 2); g.fill();
  g.fillStyle = YELLOW; g.beginPath(); g.arc(x, y, r * 0.28, 0, Math.PI * 2); g.fill();
}
function leaf(g, x, y, r, a) { g.save(); g.translate(x, y); g.rotate(a); g.fillStyle = '#4f7a3a'; g.beginPath(); g.ellipse(0, 0, r, r * 0.45, 0, 0, Math.PI * 2); g.fill(); g.restore(); }
// weather a painted area: pale speckle, scrubbed streaks (ghost signs lose paint in vertical runs)
function weather(g, x, y, w, h, seed, amount) {
  let s = seed * 9301 + 49297;
  const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  g.save(); g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < w * h * 0.0009 * amount; i++) { g.fillStyle = `rgba(0,0,0,${0.3 + rnd() * 0.6})`; g.fillRect(x + rnd() * w, y + rnd() * h, 2 + rnd() * 7, 2 + rnd() * 5); }
  for (let i = 0; i < w * 0.02 * amount; i++) { g.fillStyle = `rgba(0,0,0,${0.08 + rnd() * 0.18})`; const xx = x + rnd() * w; g.fillRect(xx, y + rnd() * h * 0.3, 3 + rnd() * 10, h * (0.3 + rnd() * 0.7)); }
  g.restore();
}

export function drawMurals(g, R, kit) {
  const out = [];
  const font = kit.font, fontB = kit.fontB;
  // ---- 4: PERSEVERANCE cabin side, 5.8 x 0.95 m (u runs bow → stern) at 240 px/m
  {
    const x = R.x, y = R.y, w = 1392, h = 228, ppm = 240;
    g.fillStyle = GREEN; g.fillRect(x, y, w, h);
    g.fillStyle = RED; g.fillRect(x, y, w, 0.07 * ppm);                       // red top band under the roof edge
    g.fillStyle = YELLOW; g.fillRect(x, y + 0.07 * ppm, w, 4);
    // coach-lined name panel at the stern end (u 3.3 … 5.6 m)
    const px = x + 3.3 * ppm, pw = 2.3 * ppm, py = y + 0.2 * ppm, ph = 0.62 * ppm;
    rr(g, px, py, pw, ph, 18); g.fillStyle = RED; g.fill();
    g.lineWidth = 5; g.strokeStyle = YELLOW; rr(g, px + 8, py + 8, pw - 16, ph - 16, 14); g.stroke();
    g.lineWidth = 2; g.strokeStyle = CREAM; rr(g, px + 16, py + 16, pw - 32, ph - 32, 10); g.stroke();
    shaded(g, '坚毅号', px + pw / 2, py + ph * 0.42, 64, (p) => font(p), CREAM, BLACK, null, pw - 70);
    shaded(g, '闸门镇', px + pw / 2, py + ph * 0.8, 26, (p) => fontB(p), YELLOW, BLACK, null, pw * 0.5);
    // roses + leaves either end of the panel, a diamond at the fore end
    for (const [rx, ry, r, c] of [[px - 26, py + ph / 2, 18, '#c94f5c'], [px - 52, py + ph / 2 + 10, 12, '#f2eee6'], [px + pw + 26, py + ph / 2, 18, '#c94f5c'], [px + pw + 50, py + ph / 2 - 8, 12, YELLOW]]) { leaf(g, rx + 6, ry + 14, 12, 0.6); rose(g, rx, ry, r, c); }
    g.save(); g.translate(x + 0.25 * ppm, y + h * 0.55); g.rotate(Math.PI / 4); g.fillStyle = RED; g.fillRect(-26, -26, 52, 52); g.strokeStyle = YELLOW; g.lineWidth = 4; g.strokeRect(-20, -20, 40, 40); g.restore();
    // coach lines along the bottom edge, a thin one under the windows
    g.fillStyle = YELLOW; g.fillRect(x, y + h - 0.1 * ppm, w, 4); g.fillStyle = RED; g.fillRect(x, y + h - 0.08 * ppm, w, 0.08 * ppm);
    out.push({ id: 4, x, y, w, h, m: [5.8, 0.95], fx: [0.35, 0.3] });
  }
  // ---- 5: J. BARGE & SONS ghost sign on the transit shed's yard end (sign band 9.4 x 0.9 m, placed on the face)
  {
    const X = R.x, Y = R.y + 240, Wd = 1520, Hd = 160, x = X + 8, y = Y + 8, w = Wd - 16, h = Hd - 16;
    g.fillStyle = 'rgba(40,52,44,0.82)'; g.fillRect(x, y, w, h);
    g.strokeStyle = 'rgba(232,220,190,0.85)'; g.lineWidth = 5; g.strokeRect(x + 10, y + 10, w - 20, h - 20);
    shaded(g, '巴奇父子  ·  运河承运', x + w / 2, y + h * 0.54, 92, (p) => font(p), CREAM, 'rgba(20,20,20,0.55)', null, w - 70);
    weather(g, x, y, w, h, 5, 1.2);
    out.push({ id: 5, x: X, y: Y, w: Wd, h: Hd, place: [0.2, 9.6, 3.66, 1.0], fx: [1, 1] });
  }
  // ---- 6: SQUIDLEY'S INKS advert on the notch wall of the back yard (6.8 x 2.4 m)
  {
    const X = R.x + 1030, Y = R.y + 410, Wd = 1016, Hd = 374, x = X + 8, y = Y + 8, w = Wd - 16, h = Hd - 16;
    g.fillStyle = 'rgba(232,222,196,0.9)'; g.fillRect(x, y, w, h);
    g.fillStyle = 'rgba(46,58,86,0.95)'; g.fillRect(x + 14, y + 14, w - 28, h - 28);
    kit.squid(g, x + 120, y + h * 0.5, 1.3, CREAM, 'rgba(46,58,86,1)');
    shaded(g, '鱿利记', x + w / 2 + 80, y + h * 0.3, 118, (p) => font(p), CREAM, 'rgba(0,0,0,0.4)', null, w - 300);
    shaded(g, '墨行', x + w / 2 + 80, y + h * 0.58, 104, (p) => font(p), YELLOW, 'rgba(0,0,0,0.4)', null, w - 300);
    shaded(g, '快干  ·  不褪色', x + w / 2 + 80, y + h * 0.84, 34, (p) => fontB(p), CREAM, 'rgba(0,0,0,0.35)', null, w - 300);
    weather(g, x, y, w, h, 11, 1.6);
    out.push({ id: 6, x: X, y: Y, w: Wd, h: Hd, place: [0.3, 6.8, 1.3, 2.5], fx: [1, 1] });
  }
  // ---- 7: CANAL CARRYING Co. on the east boundary wall (13 x 2.2 m)
  {
    const X = R.x, Y = R.y + 700, Wd = 1016, Hd = 190, x = X + 8, y = Y + 8, w = Wd - 16, h = Hd - 16;
    g.fillStyle = 'rgba(120,34,30,0.9)'; g.fillRect(x, y, w, h);
    g.fillStyle = 'rgba(232,222,196,0.9)'; g.fillRect(x, y + h * 0.62, w, 6);
    shaded(g, '运河运输公司', x + w / 2, y + h * 0.33, 104, (p) => font(p), CREAM, 'rgba(0,0,0,0.45)', null, w - 60);
    shaded(g, '煤  ·  谷  ·  木  ·  盐  ·  每日发往盐田', x + w / 2, y + h * 0.8, 40, (p) => fontB(p), CREAM, 'rgba(0,0,0,0.35)', null, w - 80);
    weather(g, x, y, w, h, 23, 1.5);
    out.push({ id: 7, x: X, y: Y, w: Wd, h: Hd, place: [2.7, 13.2, 1.65, 2.35], fx: [1, 1] });
  }
  return out;
}
