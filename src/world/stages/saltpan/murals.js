// Saltpan Basin — stage decals / signage for the mural atlas (see src/world/murals.js).
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
// Saltpan's decals (face u runs toward −X on these top faces, v up-slope / toward +Z; canvas v runs up):
//   4  packing-shed roof, the slope facing mid: giant painted SALT (read from the far side → drawn upside down)
//   5  packing-shed roof, the slope facing base: SALTPAN BASIN · SALT CO.
//   6  loading-gallery deck: stencilled LOADING STAGE band + bay ticks along the front edge
//   7  wind-pump staging: painted ring (SALTPAN BASIN · BRINE PUMP No 1 · 1889) and a compass star round the tower
export const MURAL_IDS = { roofMid: 4, roofBase: 5, gallery: 6, staging: 7 };

function paintText(g, s, x, y, px, font, fill, maxW) {
  g.font = font(px);
  let p = px;
  while (g.measureText(s).width > maxW && p > 10) { p -= 4; g.font = font(p); }
  g.fillStyle = fill; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(s, x, y);
}
// brush-worn edges: knock random flecks out of what was just painted in a rect
function wear(g, x, y, w, h, n, seed) {
  let s = seed;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  g.save(); g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < n; i++) { g.globalAlpha = 0.25 + rnd() * 0.6; g.beginPath(); g.ellipse(x + rnd() * w, y + rnd() * h, 2 + rnd() * 9, 1 + rnd() * 4, rnd() * 3, 0, Math.PI * 2); g.fill(); }
  g.restore();
}

export function drawMurals(g, R, kit) {
  const out = [];
  const PAINT = '#efe9dc', RED = '#b8493d';
  // ---- 4: roof slope facing mid (11 x 4.24 m, 100 px/m), drawn rotated 180° so it reads from the mid side
  {
    const r = { x: R.x, y: R.y, w: 1100, h: 424 };
    g.save(); g.translate(r.x + r.w / 2, r.y + r.h / 2); g.rotate(Math.PI);
    g.fillStyle = PAINT; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = kit.font(300); g.fillText('盐', 0, 30);
    g.fillRect(-470, -175, 940, 16); g.fillRect(-470, 172, 940, 16);
    g.restore();
    wear(g, r.x, r.y, r.w, r.h, 420, 7);
    out.push({ id: 4, ...r, m: [11, 4.24], fx: [0.95, 1] });
  }
  // ---- 5: roof slope facing base
  {
    const r = { x: R.x, y: R.y + 440, w: 1100, h: 424 };
    g.save(); g.translate(r.x + r.w / 2, r.y + r.h / 2);
    paintText(g, '盐田盆地', 0, -40, 150, kit.font, PAINT, 1000);
    paintText(g, '盐业公司', 0, 110, 96, kit.font, PAINT, 700);
    g.fillStyle = PAINT; g.fillRect(-420, 42, 840, 10);
    g.restore();
    wear(g, r.x, r.y, r.w, r.h, 380, 11);
    out.push({ id: 5, ...r, m: [11, 4.24], fx: [0.95, 1] });
  }
  // ---- 6: gallery deck band (12 x 0.8 m on the 14 x 6.9 m deck, along the front edge)
  {
    const r = { x: R.x + 1120, y: R.y, w: 920, h: 64 };
    g.save(); g.translate(r.x, r.y);
    g.fillStyle = PAINT;
    for (let i = 0; i <= 12; i++) g.fillRect(i * (r.w / 12) - 2, 6, 4, 14);
    g.fillRect(0, 4, r.w, 3);
    paintText(g, '装运台  ·  1 号', r.w / 2, 42, 34, kit.fontB, PAINT, r.w - 40);
    g.restore();
    wear(g, r.x, r.y, r.w, r.h, 160, 5);
    out.push({ id: 6, ...r, place: [1, 12, 6.0, 0.8], fx: [0.9, 1] });
  }
  // ---- 7: pump staging (7.2 x 7.2 m): ring lettering + compass star round the tower
  {
    const r = { x: R.x + 1120, y: R.y + 90, w: 700, h: 700 };
    const cx = r.x + r.w / 2, cy = r.y + r.h / 2, k = r.w / 7.2;
    g.save(); g.translate(cx, cy);
    g.strokeStyle = PAINT; g.lineWidth = 7;
    for (const rr of [2.75, 2.2]) { g.beginPath(); g.arc(0, 0, rr * k, 0, Math.PI * 2); g.stroke(); }
    const txt = '盐田盆地  ·  1 号卤水泵  ·  1889  ·  ';
    g.font = kit.fontB(34); g.fillStyle = PAINT; g.textAlign = 'center'; g.textBaseline = 'middle';
    const rad = 2.475 * k, per = (Math.PI * 2) / txt.length;
    for (let i = 0; i < txt.length; i++) { g.save(); g.rotate(i * per); g.translate(0, -rad); g.fillText(txt[i], 0, 0); g.restore(); }
    // compass points outside the ring
    for (let i = 0; i < 4; i++) {
      g.save(); g.rotate((i * Math.PI) / 2); g.fillStyle = i === 0 ? RED : PAINT;
      g.beginPath(); g.moveTo(0, -3.35 * k); g.lineTo(0.22 * k, -2.85 * k); g.lineTo(-0.22 * k, -2.85 * k); g.closePath(); g.fill();
      g.restore();
    }
    g.restore();
    wear(g, r.x, r.y, r.w, r.h, 300, 3);
    out.push({ id: 7, ...r, m: [7.2, 7.2], fx: [0.9, 1] });
  }
  return out;
}
