// Terrace Heights — stage decals / signage for the mural atlas (see src/world/murals.js).
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
// Face frames (level.js): u runs to the viewer's right seen from outside, v up (walls) / toward +z (tops); top faces
// start at the block's max-x / min-z corner (u = −x). Decals clamp at their edges, so every image keeps a
// transparent border. Layout ids (layout.js imports MURAL):
//   4 belvedere prow top: a black-and-white pebble compass rose (7.07 x 7.07 m, one rose per twin's visible half)
//   5 sagrato top: pebble mosaic border + a star medallion before each door (16 x 10 m)
//   6 sagrato long walls: majolica frieze PIAZZETTA SAN VITO with lemons (16 x 1.2 m)
//   7 Case sul Mare upper floor, front: faded painted LIMONCELLO advert (2.6 x 3.0 m)
//   8 Caffè upper floor, west side: painted sundial (2.4 x 2.8 m)
//   9 Largo floor: pebble sun at the foot of the Scalinata (5 x 5 m decal centred on the 4 x 4 m sun slab)
//  10 Zone Control sagrato top (16 x 12 m): border, a compass rose under the tempietto's dome, a ring round its columns
export const MURAL = { rose: 4, sagrato: 5, frieze: 6, ghost: 7, sundial: 8, sun: 9, sagratoZ: 10 };

function rnd(seed) { let a = seed | 0; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const DARK = 'rgba(52,50,48,0.92)', GREYP = 'rgba(128,124,116,0.85)', WHITE = 'rgba(243,239,229,0.95)';
// 招牌文案已中文化：内置 TitanOne/Rubik 只有拉丁子集（无汉字），字体串必须先走系统中文字体
// （与 src/world/poemDecals.js 的约定一致）。
const ZH = '"PingFang SC","Hiragino Sans GB","Microsoft YaHei","Noto Sans SC",sans-serif';

// speckle a clipped shape with pebble-sized dots (light + dark) so flat fills read as set pebbles
function pebbles(g, x0, y0, w, h, S, seed, dens = 1) {
  const r = rnd(seed), n = Math.round((w * h) / (S * S) * 260 * dens);
  for (let i = 0; i < n; i++) {
    const x = x0 + r() * w, y = y0 + r() * h, rr = S * (0.022 + r() * 0.02);
    g.fillStyle = r() < 0.5 ? 'rgba(0,0,0,0.16)' : 'rgba(255,255,255,0.18)';
    g.beginPath(); g.ellipse(x, y, rr, rr * (0.6 + r() * 0.4), r() * Math.PI, 0, Math.PI * 2); g.fill();
  }
}
// compass rose in world units (metres), centred at (cx, cz), radius Rr
function rose(g, cx, cz, Rr, S, seed) {
  g.save();
  g.translate(cx, cz);
  // outer rings
  g.fillStyle = DARK; g.beginPath(); g.arc(0, 0, Rr, 0, Math.PI * 2); g.fill();
  g.fillStyle = WHITE; g.beginPath(); g.arc(0, 0, Rr - 0.22, 0, Math.PI * 2); g.fill();
  g.fillStyle = GREYP; g.beginPath(); g.arc(0, 0, Rr - 0.34, 0, Math.PI * 2); g.fill();
  g.fillStyle = WHITE; g.beginPath(); g.arc(0, 0, Rr - 0.46, 0, Math.PI * 2); g.fill();
  // running wave in the outer band
  g.strokeStyle = DARK; g.lineWidth = 0.07;
  g.beginPath();
  for (let i = 0; i <= 96; i++) { const a = (i / 96) * Math.PI * 2, rr = Rr - 0.4 + 0.05 * Math.sin(i * 1.5); const x = Math.cos(a) * rr, y = Math.sin(a) * rr; if (i) g.lineTo(x, y); else g.moveTo(x, y); }
  g.stroke();
  // 16-point star: long cardinal rays (dark / grey halves), shorter diagonal rays
  const ray = (a, L, w, c1, c2) => {
    const ca = Math.cos(a), sa = Math.sin(a), px = -sa, py = ca;
    g.fillStyle = c1; g.beginPath(); g.moveTo(0, 0); g.lineTo(ca * L, sa * L); g.lineTo(px * w, py * w); g.closePath(); g.fill();
    g.fillStyle = c2; g.beginPath(); g.moveTo(0, 0); g.lineTo(ca * L, sa * L); g.lineTo(-px * w, -py * w); g.closePath(); g.fill();
  };
  for (let k = 0; k < 16; k++) { const a = (k / 16) * Math.PI * 2 + Math.PI / 16; if (k % 2) ray(a, (Rr - 0.6) * 0.55, 0.22, GREYP, 'rgba(200,196,188,0.9)'); }
  for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2 + Math.PI / 8; ray(a, (Rr - 0.6) * (k % 2 ? 0.72 : 0.72), 0.34, GREYP, WHITE); }
  for (let k = 0; k < 4; k++) { const a = (k / 4) * Math.PI * 2; ray(a, Rr - 0.52, 0.45, DARK, 'rgba(150,146,138,0.9)'); }
  // centre: a lemon on a white disc
  g.fillStyle = DARK; g.beginPath(); g.arc(0, 0, 0.48, 0, Math.PI * 2); g.fill();
  g.fillStyle = WHITE; g.beginPath(); g.arc(0, 0, 0.4, 0, Math.PI * 2); g.fill();
  g.fillStyle = 'rgba(214,176,58,0.95)'; g.beginPath(); g.ellipse(0, 0, 0.26, 0.19, 0.5, 0, Math.PI * 2); g.fill();
  g.fillStyle = 'rgba(84,112,58,0.95)'; g.beginPath(); g.ellipse(0.2, -0.2, 0.13, 0.06, -0.7, 0, Math.PI * 2); g.fill();
  g.restore();
}

export function drawMurals(g, R, kit) {
  const out = [];
  // ---------------------------------------------------------------- 4: bastion prow roses (7.07 x 7.07 m at 58 px/m)
  // The prow is a square turned 45° (layout.js); its top face runs u = −local x from the max-x / min-z corner, v = local
  // z. The east prow shows the face's upper-left half (v > u) past the flank slab, its mirrored twin the lower-right
  // half: one rose in each, pointing out to sea (toward the prow tip, the face's top-left / bottom-right corner).
  {
    const F = 7.07, r = { x: R.x, y: R.y, w: 410, h: 410 }, S = r.w / F, k = 1.5 / 3.3;
    g.save();
    g.beginPath(); g.rect(r.x, r.y, r.w, r.h); g.clip();
    for (const [u, v, a] of [[2.4, 4.68, (3 * Math.PI) / 4], [4.68, 2.4, -Math.PI / 4]]) {
      g.setTransform(S, 0, 0, -S, r.x, r.y + F * S);   // face (u, v) metres → canvas (v up)
      g.translate(u, v); g.rotate(a); g.scale(k, k);
      rose(g, 0, 0, 3.3, S * k, 11);
    }
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'source-atop';
    pebbles(g, r.x, r.y, r.w, r.h, S, 5);
    g.restore();
    out.push({ id: 4, ...r, m: [F, F], fx: [1, 0.5] });
  }
  // ---------------------------------------------------------------- 5: sagrato top (16 x 10 m at 48 px/m)
  {
    const r = { x: R.x, y: R.y + 412, w: 768, h: 480 }, S = r.w / 16;
    g.save();
    g.beginPath(); g.rect(r.x, r.y, r.w, r.h); g.clip();
    g.setTransform(-S, 0, 0, -S, r.x + 8 * S, r.y + r.h - 5 * S);
    // border: dark band with a white running wave, 0.5 m in from the edge
    const band = (x0, z0, x1, z1) => { g.fillStyle = DARK; g.fillRect(x0, z0, x1 - x0, z1 - z0); };
    band(-7.55, -4.6, 7.55, -4.2); band(-7.55, 4.2, 7.55, 4.6); band(-7.55, -4.6, -7.15, 4.6); band(7.15, -4.6, 7.55, 4.6);
    g.strokeStyle = WHITE; g.lineWidth = 0.06;
    for (const zc of [-4.4, 4.4]) { g.beginPath(); for (let x = -7.35; x <= 7.35; x += 0.05) { const y = zc + 0.1 * Math.sin((x / 0.4) * Math.PI); if (x === -7.35) g.moveTo(x, y); else g.lineTo(x, y); } g.stroke(); }
    for (const xc of [-7.35, 7.35]) { g.beginPath(); for (let z = -4.2; z <= 4.2; z += 0.05) { const x = xc + 0.1 * Math.sin((z / 0.4) * Math.PI); if (z === -4.2) g.moveTo(x, z); else g.lineTo(x, z); } g.stroke(); }
    // an eight-point star medallion before each door (x = ±6.75)
    for (const s of [1, -1]) {
      g.save(); g.translate(6.4 * s, 0);
      g.fillStyle = DARK; g.beginPath(); g.arc(0, 0, 0.62, 0, Math.PI * 2); g.fill();
      g.fillStyle = WHITE; g.beginPath(); g.arc(0, 0, 0.54, 0, Math.PI * 2); g.fill();
      g.fillStyle = DARK; g.beginPath();
      for (let k = 0; k < 16; k++) { const a = (k / 16) * Math.PI * 2, rr = k % 2 ? 0.2 : 0.5; if (k) g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); else g.moveTo(rr, 0); }
      g.closePath(); g.fill();
      g.fillStyle = WHITE; g.beginPath(); g.arc(0, 0, 0.09, 0, Math.PI * 2); g.fill();
      g.restore();
    }
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'source-atop';
    pebbles(g, r.x, r.y, r.w, r.h, S, 9, 1.2);
    g.restore();
    out.push({ id: 5, ...r, m: [16, 10], fx: [1, 0.5] });
  }
  // ---------------------------------------------------------------- 6: majolica frieze on the sagrato walls (16 x 1.2 m at 80 px/m)
  {
    const r = { x: R.x + 770, y: R.y + 412, w: 1278, h: 96 }, S = r.w / 16;
    g.save();
    g.beginPath(); g.rect(r.x, r.y, r.w, r.h); g.clip();
    g.translate(r.x, r.y);
    // tile band 0.2 m tall ... 0.95 m, leaving the plinth and the coping clear; 0.2 m tiles
    const y0 = (1.2 - 1.0) * S, y1 = (1.2 - 0.3) * S, T = 0.2 * S, x0 = 0.25 * S, x1 = r.w - 0.25 * S;
    g.fillStyle = '#f1ece0'; g.fillRect(x0, y0, x1 - x0, y1 - y0);
    // lemon + leaf motif per tile, cobalt corner quarter-circles (they join into circles across tiles)
    const rr = rnd(21);
    for (let x = x0; x < x1 - 1; x += T) for (let y = y0; y < y1 - 1; y += T) {
      g.fillStyle = '#2f5f9a';
      for (const [cx, cy] of [[x, y], [x + T, y], [x, y + T], [x + T, y + T]]) { g.beginPath(); g.moveTo(cx, cy); g.arc(cx, cy, T * 0.22, 0, Math.PI * 2); g.fill(); }
      g.fillStyle = '#e2b23c'; g.beginPath(); g.ellipse(x + T / 2, y + T / 2, T * 0.2, T * 0.14, rr() - 0.5, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#4b9168'; g.beginPath(); g.ellipse(x + T / 2 + T * 0.16, y + T / 2 - T * 0.14, T * 0.12, T * 0.05, -0.7, 0, Math.PI * 2); g.fill();
      g.strokeStyle = 'rgba(60,70,90,0.25)'; g.lineWidth = 1; g.strokeRect(x + 0.5, y + 0.5, T - 1, T - 1);
    }
    // central name cartouche
    const cw = 7.4 * S, ch = (y1 - y0) - 6, cx = r.w / 2 - cw / 2;
    g.fillStyle = '#f5f1e6'; g.fillRect(cx, y0 + 3, cw, ch);
    g.strokeStyle = '#2f5f9a'; g.lineWidth = 4; g.strokeRect(cx + 4, y0 + 7, cw - 8, ch - 8);
    g.fillStyle = '#2f5f9a'; g.font = kit.fontB(Math.round(ch * 0.62)); g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('圣维托小广场', r.w / 2, y0 + 3 + ch / 2 + 1);
    g.fillStyle = '#2f5f9a'; g.fillRect(x0, y0 - 3, x1 - x0, 3); g.fillRect(x0, y1, x1 - x0, 3);
    g.restore();
    out.push({ id: 6, ...r, m: [16, 1.2], fx: [0.6, 0.5] });
  }
  // ---------------------------------------------------------------- 7: ghost sign LIMONCELLO (3.8 x 3.0 m at 100 px/m)
  {
    const r = { x: R.x + 770, y: R.y + 512, w: 260, h: 300 }, S = 100;
    g.save();
    g.beginPath(); g.rect(r.x, r.y, r.w, r.h); g.clip();
    g.translate(r.x, r.y);
    const bx = 0.2 * S, by = 0.35 * S, bw = 2.2 * S, bh = 2.1 * S;
    g.fillStyle = 'rgba(234,208,120,0.72)'; g.fillRect(bx, by, bw, bh);
    g.strokeStyle = 'rgba(52,84,120,0.75)'; g.lineWidth = 7; g.strokeRect(bx + 8, by + 8, bw - 16, bh - 16);
    // big lemon with leaves
    g.fillStyle = 'rgba(228,186,48,0.9)'; g.beginPath(); g.ellipse(bx + 1.1 * S, by + 0.62 * S, 0.34 * S, 0.24 * S, -0.3, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(214,160,30,0.9)'; g.beginPath(); g.ellipse(bx + 1.02 * S, by + 0.68 * S, 0.18 * S, 0.11 * S, -0.3, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(70,112,64,0.88)'; g.beginPath(); g.ellipse(bx + 1.42 * S, by + 0.4 * S, 0.2 * S, 0.08 * S, -0.8, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.ellipse(bx + 1.32 * S, by + 0.32 * S, 0.16 * S, 0.07 * S, -1.6, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(52,84,120,0.85)'; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
    g.font = kit.font(Math.round(0.34 * S)); g.fillText('柠檬酒', bx + bw / 2, by + 1.28 * S, bw - 0.2 * S);
    g.font = kit.fontB(Math.round(0.18 * S)); g.fillText('圣维托出品', bx + bw / 2, by + 1.58 * S);
    g.fillStyle = 'rgba(160,62,48,0.75)'; g.font = kit.fontB(Math.round(0.13 * S)); g.fillText('始于 1921 · 永远新鲜', bx + bw / 2, by + 1.9 * S, bw - 0.3 * S);
    // weathering: flaking blotches knocked out of the paint
    g.globalCompositeOperation = 'destination-out';
    const rr = rnd(7);
    // flakes cluster toward the bottom and the edges, with a few big bare patches
    for (let i = 0; i < 46; i++) {
      const u = rr(), v = Math.pow(rr(), 0.6), edgeX = u < 0.5 ? u * 0.35 : 1 - (1 - u) * 0.35;
      const px = bx + (rr() < 0.6 ? edgeX : u) * bw, py = by + v * bh;
      g.fillStyle = `rgba(0,0,0,${0.35 + rr() * 0.55})`;
      g.beginPath(); for (let k = 0; k < 7; k++) { const a = (k / 7) * Math.PI * 2, rad = (5 + rr() * 16) * (0.6 + 0.4 * Math.sin(a * 3 + i)); if (k) g.lineTo(px + Math.cos(a) * rad, py + Math.sin(a) * rad * 0.6); else g.moveTo(px + rad, py); } g.closePath(); g.fill();
    }
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 0.25; g.fillStyle = '#efe6cf'; g.fillRect(bx, by, bw, bh); g.globalAlpha = 1;
    g.restore();
    out.push({ id: 7, ...r, m: [2.6, 3.0], fx: [1, 1] });
  }
  // ---------------------------------------------------------------- 8: sundial (5.6 x 2.8 m at 60 px/m; dial centred 1.7 m in, 1.4 m up)
  {
    const r = { x: R.x + 1152, y: R.y + 512, w: 144, h: 168 }, S = 60;
    g.save();
    g.beginPath(); g.rect(r.x, r.y, r.w, r.h); g.clip();
    g.translate(r.x, r.y);
    const cx = 1.2 * S, top = (2.8 - 2.45) * S, w = 2.0 * S, h = 1.9 * S, x0 = cx - w / 2;
    g.fillStyle = 'rgba(238,222,186,0.95)'; g.fillRect(x0, top, w, h);
    g.strokeStyle = 'rgba(166,72,52,0.95)'; g.lineWidth = 7; g.strokeRect(x0 + 4, top + 4, w - 8, h - 8);
    g.strokeStyle = 'rgba(52,84,120,0.9)'; g.lineWidth = 2; g.strokeRect(x0 + 11, top + 11, w - 22, h - 22);
    // hour lines from the gnomon foot (top centre), clipped to the dial field
    const gx = cx, gy = top + 0.3 * S;
    g.save(); g.beginPath(); g.rect(x0 + 13, top + 13, w - 26, h - 26); g.clip();
    g.strokeStyle = 'rgba(60,54,48,0.85)'; g.lineWidth = 2;
    const numerals = ['VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'I', 'II', 'III', 'IV', 'V', 'VI'];
    g.font = `bold ${Math.round(0.14 * S)}px serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = 'rgba(60,54,48,0.9)';
    for (let k = 0; k <= 12; k++) {
      const a = Math.PI * (k / 12), dx = -Math.cos(a), dy = Math.sin(a), L = 1.2 * S;
      g.beginPath(); g.moveTo(gx + dx * 0.2 * S, gy + dy * 0.2 * S); g.lineTo(gx + dx * L, gy + dy * L * 0.95); g.stroke();
      if (k % 2 === 0 && k > 0 && k < 12) g.fillText(numerals[k], gx + dx * L * 0.72, gy + dy * L * 0.72 + 5);
    }
    g.restore();
    // sun face at the foot + motto
    g.fillStyle = 'rgba(226,178,60,0.95)'; g.beginPath(); g.arc(gx, gy, 0.16 * S, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(166,72,52,0.95)'; g.font = `bold ${Math.round(0.13 * S)}px ${ZH}`; g.fillText('无日不辉', cx, top + h - 0.18 * S);
    g.restore();
    out.push({ id: 8, ...r, m: [2.4, 2.8], fx: [0.9, 1] });
  }
  // ---------------------------------------------------------------- 9: pebble sun on the Largo (5 x 5 m at 100 px/m)
  {
    const r = { x: R.x + 1500, y: R.y + 508, w: 500, h: 500 }, S = 100;
    g.save();
    g.beginPath(); g.rect(r.x, r.y, r.w, r.h); g.clip();
    g.setTransform(-S, 0, 0, -S, r.x + 2.5 * S, r.y + r.h - 29 * S);   // world (x, z) → canvas
    g.translate(0, -26.5); g.scale(0.85, 0.85);   // (the Largo's sun slab is 4 x 4 m: the decal is centred on it)
    // wavy rays (alternating ochre / grey), a dark ring, a white disc with a dark sun face ring
    for (let k = 0; k < 16; k++) {
      const a0 = (k / 16) * Math.PI * 2, L = k % 2 ? 1.8 : 2.2, w = 0.3;
      g.fillStyle = k % 2 ? DARK : 'rgba(204,152,48,0.96)';
      g.beginPath();
      for (let i = 0; i <= 12; i++) { const t = i / 12, rr = 1.05 + t * (L - 1.05), off = w * (1 - t) * Math.sin(t * Math.PI * 2.2); const a = a0 + off / rr; if (i) g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); else g.moveTo(Math.cos(a0 - w / 1.05) * 1.05, Math.sin(a0 - w / 1.05) * 1.05); }
      g.lineTo(Math.cos(a0 + w / 1.05) * 1.05, Math.sin(a0 + w / 1.05) * 1.05);
      g.closePath(); g.fill();
    }
    g.fillStyle = DARK; g.beginPath(); g.arc(0, 0, 1.12, 0, Math.PI * 2); g.fill();
    g.fillStyle = WHITE; g.beginPath(); g.arc(0, 0, 1.0, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(206,164,72,0.95)'; g.beginPath(); g.arc(0, 0, 0.72, 0, Math.PI * 2); g.fill();
    g.strokeStyle = DARK; g.lineWidth = 0.06;
    g.beginPath(); g.arc(-0.24, 0.16, 0.08, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.arc(0.24, 0.16, 0.08, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.arc(0, -0.05, 0.36, Math.PI * 1.15, Math.PI * 1.85); g.stroke();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'source-atop';
    pebbles(g, r.x, r.y, r.w, r.h, S, 13, 1.1);
    g.restore();
    out.push({ id: 9, ...r, place: [-0.5, 5, -0.5, 5], fx: [1, 0.5] });
  }
  // ---------------------------------------------------------------- 10: Zone Control sagrato top (16 x 12 m at 34 px/m)
  // The open sagrato round San Vito's tempietto (props.js): the border band of mural 5, a pebble ring just outside the
  // colonnade (columns on a 3.4 m circle, plinths to 3.75 m), a compass rose under the dome, a star before each stair.
  {
    const r = { x: R.x + 414, y: R.y, w: 544, h: 408 }, S = r.w / 16;
    g.save();
    g.beginPath(); g.rect(r.x, r.y, r.w, r.h); g.clip();
    g.setTransform(-S, 0, 0, -S, r.x + 8 * S, r.y + r.h - 6 * S);
    const band = (x0, z0, x1, z1) => { g.fillStyle = DARK; g.fillRect(x0, z0, x1 - x0, z1 - z0); };
    band(-7.55, -5.55, 7.55, -5.15); band(-7.55, 5.15, 7.55, 5.55); band(-7.55, -5.55, -7.15, 5.55); band(7.15, -5.55, 7.55, 5.55);
    g.strokeStyle = WHITE; g.lineWidth = 0.06;
    for (const zc of [-5.35, 5.35]) { g.beginPath(); for (let x = -7.35; x <= 7.35; x += 0.05) { const y = zc + 0.1 * Math.sin((x / 0.4) * Math.PI); if (x === -7.35) g.moveTo(x, y); else g.lineTo(x, y); } g.stroke(); }
    for (const xc of [-7.35, 7.35]) { g.beginPath(); for (let z = -5.15; z <= 5.15; z += 0.05) { const x = xc + 0.1 * Math.sin((z / 0.4) * Math.PI); if (z === -5.15) g.moveTo(x, z); else g.lineTo(x, z); } g.stroke(); }
    // the ring round the colonnade: dark band, white running wave, a grey inner line
    g.fillStyle = DARK; g.beginPath(); g.arc(0, 0, 4.3, 0, Math.PI * 2); g.arc(0, 0, 3.9, 0, Math.PI * 2, true); g.fill();
    g.strokeStyle = WHITE; g.lineWidth = 0.06; g.beginPath();
    for (let i = 0; i <= 160; i++) { const a = (i / 160) * Math.PI * 2, rr = 4.1 + 0.08 * Math.sin(i * 1.25); if (i) g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); else g.moveTo(rr, 0); }
    g.stroke();
    g.strokeStyle = GREYP; g.lineWidth = 0.08; g.beginPath(); g.arc(0, 0, 3.8, 0, Math.PI * 2); g.stroke();
    // the compass rose under the dome (points to the stairs and the piazza's lanes)
    rose(g, 0, 0, 2.95, S, 17);
    // an eight-point star before each stair (x = ±6.0)
    for (const sx of [1, -1]) {
      g.save(); g.translate(6.0 * sx, 0);
      g.fillStyle = DARK; g.beginPath(); g.arc(0, 0, 0.62, 0, Math.PI * 2); g.fill();
      g.fillStyle = WHITE; g.beginPath(); g.arc(0, 0, 0.54, 0, Math.PI * 2); g.fill();
      g.fillStyle = DARK; g.beginPath();
      for (let k = 0; k < 16; k++) { const a = (k / 16) * Math.PI * 2, rr = k % 2 ? 0.2 : 0.5; if (k) g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); else g.moveTo(rr, 0); }
      g.closePath(); g.fill();
      g.fillStyle = WHITE; g.beginPath(); g.arc(0, 0, 0.09, 0, Math.PI * 2); g.fill();
      g.restore();
    }
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'source-atop';
    pebbles(g, r.x, r.y, r.w, r.h, S, 19, 1.2);
    g.restore();
    out.push({ id: 10, ...r, m: [16, 12], fx: [1, 0.5] });
  }
  return out;
}
