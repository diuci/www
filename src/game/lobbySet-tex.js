// Lobby set canvases + neon glyphs. Everything team-coloured is drawn channel-encoded rather than in colour, so a team
// change is a uniform write, never a redraw:  R = team A paint, G = team B paint, B = white paint, A = coverage (what is
// covered but has no R/G/B is black paint). Decoded in lobbySet-mats.js as teamA*R + teamB*G + white*B.
import * as THREE from 'three';

const FONT = 'LSTitan';
let _fonts = null;
export function loadSetFonts() {
  if (_fonts) return _fonts;
  if (typeof FontFace === 'undefined') return (_fonts = Promise.resolve());
  const f = new FontFace(FONT, `url(${new URL('../../assets/fonts/TitanOne-latin.woff2', import.meta.url)})`);
  const r = new FontFace('LSRubik', `url(${new URL('../../assets/fonts/Rubik-latin.woff2', import.meta.url)})`, { weight: '400 900' });
  return (_fonts = Promise.all([f.load(), r.load()]).then(([a, b]) => { document.fonts.add(a); document.fonts.add(b); }).catch(() => {}));
}
// 招牌文案已中文化：内置的 TitanOne/Rubik 只有拉丁子集，不含汉字，所以字体串必须先走系统中文字体
// （与 src/world/poemDecals.js 的约定一致）。
const ZH = '"PingFang SC","Hiragino Sans GB","Microsoft YaHei","Noto Sans SC",sans-serif';
const titan = (px) => `900 ${px}px ${ZH}`;
const rubik = (px, w = 800) => `${w} ${px}px ${ZH}`;

function mulberry(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function tex(c, srgb = true, mips = true) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = 8; t.generateMipmaps = mips; t.minFilter = mips ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
  return t;
}
// paint encodings
const PA = 'rgb(255,0,0)', PB = 'rgb(0,255,0)', PW = 'rgb(0,0,255)', PK = 'rgb(0,0,0)';
const mixP = (a, b, w) => `rgb(${Math.round(255 * a)},${Math.round(255 * b)},${Math.round(255 * w)})`;

// ------------------------------------------------------------------------------------------------ splat shapes
// An ink splat: lumpy core, radial arms ending in droplets, loose satellite drops, optional drips running down (walls).
function splat(g, cx, cy, r, rnd, { drips = 0, arms = 9, dripLen = 2.2 } = {}) {
  g.beginPath();
  const N = 28;
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * Math.PI * 2, k = 0.78 + rnd() * 0.3 + 0.12 * Math.sin(a * 3 + r);
    const x = cx + Math.cos(a) * r * k, y = cy + Math.sin(a) * r * k;
    i ? g.lineTo(x, y) : g.moveTo(x, y);
  }
  g.fill();
  for (let i = 0; i < arms; i++) {
    const a = rnd() * Math.PI * 2, L = r * (1.1 + rnd() * 0.9), w = r * (0.12 + rnd() * 0.16);
    g.save(); g.translate(cx, cy); g.rotate(a);
    g.beginPath(); g.moveTo(r * 0.5, -w); g.quadraticCurveTo(L * 0.8, -w * 0.3, L, 0); g.quadraticCurveTo(L * 0.8, w * 0.3, r * 0.5, w); g.fill();
    g.beginPath(); g.arc(L, 0, w * 0.9, 0, Math.PI * 2); g.fill();
    g.restore();
  }
  for (let i = 0; i < arms * 1.6; i++) {
    const a = rnd() * Math.PI * 2, d = r * (1.3 + rnd() * 1.4), s = r * (0.03 + rnd() * 0.09);
    g.beginPath(); g.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, s, 0, Math.PI * 2); g.fill();
  }
  for (let i = 0; i < drips; i++) {
    const x = cx + (rnd() - 0.5) * r * 1.4, w = r * (0.07 + rnd() * 0.08), L = r * (0.6 + rnd() * dripLen);
    g.beginPath(); g.moveTo(x - w, cy); g.lineTo(x - w * 0.8, cy + L); g.arc(x, cy + L, w * 0.95, Math.PI, 0, true); g.lineTo(x + w, cy); g.fill();
  }
}

// ------------------------------------------------------------------------------------------------ decal atlas
// 2048 x 2048. Rects are in px (y down); DECAL maps a name to [u0, v0, u1, v1] in texture space (v up, CanvasTexture flipY).
const DA = 2048;
const DRECT = {
  graffiti: [0, 0, 2048, 1152],
  splat0: [0, 1152, 384, 384], splat1: [384, 1152, 384, 384], splat2: [768, 1152, 384, 384], splat3: [1152, 1152, 384, 384],
  poster0: [1536, 1152, 256, 384], poster1: [1792, 1152, 256, 384],
  poster2: [0, 1536, 256, 384], stencil: [256, 1536, 768, 192], tag0: [256, 1728, 384, 192], tag1: [640, 1728, 384, 192],
  arrow: [1024, 1536, 512, 192], nopark: [1024, 1728, 512, 192], throwup: [1536, 1536, 512, 384],
};
export const DECAL = Object.fromEntries(Object.entries(DRECT).map(([k, [x, y, w, h]]) => [k, [x / DA, 1 - (y + h) / DA, (x + w) / DA, 1 - y / DA]]));

// Returns the texture at once (drawn with fallback fonts) and redraws when the set fonts arrive; .userData.ready resolves then.
export function createDecalAtlas() {
  const c = canvas(DA, DA), g = c.getContext('2d');
  const t = tex(c, false);
  const draw = () => { drawDecals(g); t.needsUpdate = true; };
  draw();
  t.userData.ready = loadSetFonts().then(draw);
  return t;
}
function drawDecals(g) {
  g.clearRect(0, 0, DA, DA);
  const rnd = mulberry(77);
  const at = (name, fn) => { const [x, y, w, h] = DRECT[name]; g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip(); g.translate(x, y); fn(w, h); g.restore(); };
  at('graffiti', (w, h) => drawGraffiti(g, w, h, mulberry(5)));
  ['splat0', 'splat1', 'splat2', 'splat3'].forEach((n, i) => at(n, (w, h) => { g.fillStyle = PA; splat(g, w / 2, h * (i < 2 ? 0.42 : 0.5), w * 0.2, mulberry(11 + i), { drips: i < 2 ? 5 : 0, arms: 8 + i * 2 }); }));
  at('poster0', (w, h) => poster(g, w, h, 0, rnd));
  at('poster1', (w, h) => poster(g, w, h, 1, rnd));
  at('poster2', (w, h) => poster(g, w, h, 2, rnd));
  at('stencil', (w, h) => { g.fillStyle = PW; g.font = titan(110); g.textBaseline = 'middle'; g.fillText('装卸码头', 18, h / 2 + 6); stencilBreaks(g, w, h, rnd); });
  at('tag0', (w, h) => tag(g, w, h, 'Rook', PB, rnd));
  at('tag1', (w, h) => tag(g, w, h, 'squidz', PA, rnd));
  at('arrow', (w, h) => { g.fillStyle = PW; g.font = titan(96); g.textBaseline = 'middle'; g.fillText('2 号泊位', 20, h / 2 + 4); g.beginPath(); g.moveTo(380, 50); g.lineTo(470, h / 2); g.lineTo(380, h - 50); g.lineTo(380, h / 2 + 18); g.lineTo(330, h / 2 + 18); g.lineTo(330, h / 2 - 18); g.lineTo(380, h / 2 - 18); g.closePath(); g.fill(); stencilBreaks(g, w, h, rnd); });
  at('nopark', (w, h) => { g.fillStyle = mixP(0.9, 0, 0.9); g.font = titan(88); g.textBaseline = 'middle'; g.fillText('禁止停车', 16, h / 2 + 4); stencilBreaks(g, w, h, rnd); });
  at('throwup', (w, h) => throwup(g, w, h, rnd));
}
function stencilBreaks(g, w, h, rnd) {
  // stencil bridges + spray overspray speckle: cut thin gaps, then dust dots around
  g.save(); g.globalCompositeOperation = 'destination-out';
  for (let x = 30; x < w; x += 44 + rnd() * 30) g.fillRect(x, 0, 5, h);
  g.restore();
  const f = g.fillStyle;
  for (let i = 0; i < 900; i++) { g.globalAlpha = 0.25 * rnd(); g.fillRect(rnd() * w, rnd() * h, 2, 2); }
  g.globalAlpha = 1; g.fillStyle = f;
}
function tag(g, w, h, word, paint, rnd) {
  g.save(); g.translate(20, h * 0.66); g.rotate(-0.12); g.transform(1, 0, -0.35, 1, 0, 0);
  g.font = rubik(92, 900); g.lineJoin = 'round';
  g.strokeStyle = PK; g.lineWidth = 16; g.strokeText(word, 0, 0);
  g.fillStyle = paint; g.fillText(word, 0, 0);
  g.strokeStyle = PW; g.lineWidth = 3; g.beginPath(); g.moveTo(-6, 20); g.bezierCurveTo(90, 40, 220, 8, 300, 26); g.stroke();
  g.restore();
}
function throwup(g, w, h, rnd) {
  // a quick two-letter bubble throw-up "IW": white fill, black outline, team B shadow
  g.save(); g.translate(w * 0.1, h * 0.78); g.rotate(-0.06);
  g.font = titan(250); g.lineJoin = 'round';
  g.fillStyle = PB; g.fillText('IW', 18, 16);
  g.strokeStyle = PK; g.lineWidth = 22; g.strokeText('IW', 0, 0);
  g.fillStyle = PW; g.fillText('IW', 0, 0);
  g.restore();
  g.fillStyle = PK; for (let i = 0; i < 3; i++) { const x = w * (0.2 + i * 0.22); g.fillRect(x, h * 0.8, 8, 30 + rnd() * 50); }
}
function poster(g, w, h, kind, rnd) {
  // wheat-pasted posters; torn edges come from the alpha, weathering from the shader
  g.fillStyle = PW; g.beginPath();
  const edge = (x0, y0, x1, y1, n) => { for (let i = 0; i <= n; i++) { const t = i / n; g.lineTo(x0 + (x1 - x0) * t + (rnd() - 0.5) * 6, y0 + (y1 - y0) * t + (rnd() - 0.5) * 6); } };
  g.moveTo(6, 6); edge(6, 6, w - 6, 6, 12); edge(w - 6, 6, w - 6, h - 6, 16); edge(w - 6, h - 6, 6, h - 6, 12); edge(6, h - 6, 6, 6, 16); g.fill();
  if (kind === 0) {
    g.fillStyle = PK; g.fillRect(14, 14, w - 28, h - 28);
    g.fillStyle = PA; splat(g, w * 0.5, h * 0.4, w * 0.24, mulberry(9), { arms: 10 });
    g.fillStyle = PW; g.font = titan(46); g.textAlign = 'center'; g.fillText('涂地', w / 2, h * 0.76); g.fillText('狂欢', w / 2, h * 0.88);
    g.font = rubik(18); g.fillText('周五 · 晚9点 · 2号泊位', w / 2, h * 0.95);
  } else if (kind === 1) {
    g.fillStyle = PB; g.fillRect(14, 14, w - 28, h * 0.62);
    squidGlyph(g, w / 2, h * 0.36, w * 0.36, PW);
    g.fillStyle = PK; g.font = titan(40); g.textAlign = 'center'; g.fillText('滑板', w / 2, h * 0.76); g.fillText('场地', w / 2, h * 0.87);
    g.fillStyle = PB; g.font = rubik(18); g.fillText('墨与滑板 · 后院', w / 2, h * 0.95);
  } else {
    g.fillStyle = mixP(1, 0, 0.35); g.fillRect(14, 14, w - 28, h - 28);
    g.fillStyle = PK; g.font = titan(54); g.textAlign = 'center';
    for (let i = 0; i < 5; i++) g.fillText('墨', w / 2 + (i % 2 ? 18 : -18), 80 + i * 66);
    g.fillStyle = PW; g.font = rubik(20); g.fillText('浪潮唱片', w / 2, h - 26);
  }
  g.textAlign = 'left';
}
// original squid mark (used by the poster and the neon sign's shape language)
function squidGlyph(g, cx, cy, s, paint) {
  g.save(); g.translate(cx, cy); g.scale(s, s); g.fillStyle = paint;
  g.beginPath(); g.moveTo(0, -0.62); g.quadraticCurveTo(0.3, -0.42, 0.52, -0.2); g.lineTo(0.3, -0.15); g.quadraticCurveTo(0.34, 0.02, 0.26, 0.16);
  g.lineTo(-0.26, 0.16); g.quadraticCurveTo(-0.34, 0.02, -0.3, -0.15); g.lineTo(-0.52, -0.2); g.quadraticCurveTo(-0.3, -0.42, 0, -0.62); g.fill();
  for (let i = 0; i < 4; i++) { const x = -0.2 + i * 0.133; g.beginPath(); g.moveTo(x - 0.05, 0.12); g.quadraticCurveTo(x + 0.06, 0.34, x - 0.02, 0.56); g.lineTo(x + 0.05, 0.56); g.quadraticCurveTo(x + 0.12, 0.32, x + 0.05, 0.12); g.fill(); }
  g.fillStyle = PK; g.beginPath(); g.arc(-0.1, -0.1, 0.06, 0, 7); g.arc(0.1, -0.1, 0.06, 0, 7); g.fill();
  g.restore();
}

// The shutter piece: "INKWAVE" wildstyle-lite over a team-B cloud, black 3-D block, team-A fill fading to a pale top,
// team-B split band, white shines, drips, sparkles, and a signature.
function drawGraffiti(g, W, H, rnd) {
  // cloud backdrop
  g.fillStyle = PB;
  g.beginPath();
  for (let i = 0; i < 22; i++) { const x = W * (0.06 + 0.88 * (i / 21)), y = H * (0.5 + 0.18 * Math.sin(i * 1.7)), r = H * (0.17 + rnd() * 0.12); g.moveTo(x + r, y); g.arc(x, y, r, 0, Math.PI * 2); }
  g.fill();
  g.strokeStyle = PK; g.lineWidth = 10; g.stroke();
  // white bubbles in the cloud
  g.fillStyle = mixP(0, 0.5, 0.6);
  for (let i = 0; i < 26; i++) { g.beginPath(); g.arc(W * (0.05 + rnd() * 0.9), H * (0.25 + rnd() * 0.5), 8 + rnd() * 26, 0, 7); g.fill(); }
  // letters
  const word = '墨浪', size = H * 0.5;
  g.font = titan(size); g.lineJoin = 'round'; g.textBaseline = 'alphabetic';
  const adv = [...word].map((ch) => g.measureText(ch).width * 0.86);
  const total = adv.reduce((a, b) => a + b, 0);
  let x = (W - total) / 2 - W * 0.02;
  const L = [...word].map((ch, i) => { const o = { ch, x, y: H * (0.7 + 0.05 * Math.sin(i * 1.3 + 0.4)), r: (rnd() - 0.5) * 0.18 + (i % 2 ? 0.05 : -0.05), s: 0.92 + rnd() * 0.16 }; x += adv[i]; return o; });
  const each = (fn) => L.forEach((l) => { g.save(); g.translate(l.x + adv[0] * 0.4, l.y); g.rotate(l.r); g.scale(l.s, l.s); g.transform(1, 0, -0.18, 1, 0, 0); g.translate(-adv[0] * 0.4, 0); fn(l); g.restore(); });
  // 3-D block (black), extruded down-right
  g.fillStyle = PK;
  for (let d = 34; d > 0; d -= 2) each((l) => g.fillText(l.ch, d * 0.75, d * 0.62));
  // block edge lines in team B (a thin lit edge)
  each((l) => { g.strokeStyle = mixP(0, 0.7, 0.2); g.lineWidth = 3; g.strokeText(l.ch, 26, 21); });
  // outline + fill
  each((l) => { g.strokeStyle = PK; g.lineWidth = 30; g.strokeText(l.ch, 0, 0); });
  each((l) => { g.strokeStyle = PW; g.lineWidth = 12; g.strokeText(l.ch, 0, 0); });
  each((l) => {
    const gr = g.createLinearGradient(0, -size * 0.75, 0, 0);
    gr.addColorStop(0, mixP(1, 0, 0.55)); gr.addColorStop(0.45, mixP(1, 0, 0.1)); gr.addColorStop(1, PA);
    g.fillStyle = gr; g.fillText(l.ch, 0, 0);
  });
  // split band (team B) through the lower third of every letter, clipped to the glyph with source-atop
  const tmp = canvas(W, H), t = tmp.getContext('2d');
  t.font = g.font; t.lineJoin = 'round';
  L.forEach((l) => { t.save(); t.translate(l.x + adv[0] * 0.4, l.y); t.rotate(l.r); t.scale(l.s, l.s); t.transform(1, 0, -0.18, 1, 0, 0); t.translate(-adv[0] * 0.4, 0); t.fillStyle = '#fff'; t.fillText(l.ch, 0, 0); t.restore(); });
  t.globalCompositeOperation = 'source-in';
  t.fillStyle = PB;
  t.beginPath(); t.moveTo(0, H * 0.6); for (let i = 0; i <= 20; i++) t.lineTo((W * i) / 20, H * (0.585 + 0.03 * Math.sin(i * 1.1))); t.lineTo(W, H * 0.66); for (let i = 20; i >= 0; i--) t.lineTo((W * i) / 20, H * (0.64 + 0.03 * Math.sin(i * 1.1 + 1))); t.fill();
  g.drawImage(tmp, 0, 0);
  // shines
  each((l) => { g.fillStyle = PW; g.beginPath(); g.ellipse(-size * 0.02 + adv[0] * 0.18, -size * 0.52, size * 0.035, size * 0.1, -0.5, 0, 7); g.fill(); g.beginPath(); g.arc(adv[0] * 0.26, -size * 0.36, size * 0.022, 0, 7); g.fill(); });
  // drips from the letter bottoms
  for (let i = 0; i < 9; i++) {
    const l = L[Math.floor(rnd() * L.length)], dx = l.x + rnd() * adv[0] * 0.7, y0 = l.y + 4, len = 40 + rnd() * 150, w = 7 + rnd() * 8;
    g.fillStyle = PK; g.beginPath(); g.roundRect(dx - w - 5, y0 - 10, 2 * w + 10, len + 16, w + 5); g.fill();
    g.fillStyle = PA; g.beginPath(); g.roundRect(dx - w, y0 - 14, 2 * w, len + 8, w); g.fill();
  }
  // sparkles + arrow flourish
  const star = (sx, sy, r) => { g.beginPath(); for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2, rr = k % 2 ? r * 0.22 : r; g.lineTo(sx + Math.cos(a) * rr, sy + Math.sin(a) * rr); } g.fill(); };
  g.fillStyle = PW;
  star(W * 0.12, H * 0.22, 46); star(W * 0.9, H * 0.18, 60); star(W * 0.82, H * 0.86, 30); star(W * 0.2, H * 0.9, 24);
  g.strokeStyle = PK; g.lineWidth = 26; g.lineCap = 'round';
  g.beginPath(); g.moveTo(W * 0.86, H * 0.42); g.bezierCurveTo(W * 0.95, H * 0.3, W * 0.97, H * 0.14, W * 0.93, H * 0.06); g.stroke();
  g.strokeStyle = PA; g.lineWidth = 12; g.stroke();
  g.fillStyle = PK; g.beginPath(); g.moveTo(W * 0.9, H * 0.02); g.lineTo(W * 0.975, H * 0.08); g.lineTo(W * 0.9, H * 0.12); g.fill();
  // signature
  g.save(); g.translate(W * 0.72, H * 0.96); g.rotate(-0.08); g.font = rubik(54, 900); g.fillStyle = PW; g.fillText('墨队 26', 0, 0); g.restore();
}

// ------------------------------------------------------------------------------------------------ ground mask
// RGB only (canvas alpha stays 255 so premultiplication can't eat the data): R = team A ink, G = team B ink,
// B = standing water depth. Covers GROUND_RECT (world x0, z0, x1, z1).
export const GROUND_RECT = [-4, -14, 4, 7];
export function createGroundMask(puddles, splats) {
  const W = 1024, H = 2048, c = canvas(W, H), g = c.getContext('2d');
  const [x0, z0, x1, z1] = GROUND_RECT;
  const px = (x) => ((x - x0) / (x1 - x0)) * W, pz = (z) => ((z - z0) / (z1 - z0)) * H, sc = W / (x1 - x0);
  g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
  // puddles: blobby unions of soft ellipses, blurred so depth ramps up from the rim (additive in blue)
  g.globalCompositeOperation = 'lighter';
  g.filter = 'blur(6px)';
  const rnd = mulberry(31);
  for (const p of puddles) {
    for (let i = 0; i < (p.n || 7); i++) {
      const ox = (rnd() - 0.5) * p.rx * 1.2, oz = (rnd() - 0.5) * p.rz * 1.2;
      const rx = p.rx * (0.45 + rnd() * 0.5), rz = p.rz * (0.45 + rnd() * 0.5);
      g.fillStyle = `rgba(0,0,255,${0.55 * (p.d ?? 1)})`;
      g.beginPath(); g.ellipse(px(p.x + ox), pz(p.z + oz), rx * sc, rz * sc, p.a || rnd() * 3, 0, Math.PI * 2); g.fill();
    }
  }
  g.filter = 'none';
  g.globalCompositeOperation = 'source-over';
  // ink splats (flat, no drips); channels overwrite each other where they overlap (newer ink on top)
  g.globalCompositeOperation = 'lighter';
  for (const s of splats) {
    g.fillStyle = s.team ? 'rgb(0,255,0)' : 'rgb(255,0,0)';
    splat(g, px(s.x), pz(s.z), s.r * sc, mulberry(s.seed || 3), { arms: s.arms || 9 });
  }
  g.globalCompositeOperation = 'source-over';
  const t = tex(c, false);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

// ------------------------------------------------------------------------------------------------ lit atlas (emissive)
// 2048 x 1024 sRGB: vending machine front, shop back-room interior, four window interiors.
const LA = [2048, 1024];
const LRECT = { vending: [0, 0, 512, 1024], door: [512, 0, 512, 1024], win0: [1024, 0, 512, 512], win1: [1536, 0, 512, 512], win2: [1024, 512, 512, 512], win3: [1536, 512, 512, 512] };
export const LIT = Object.fromEntries(Object.entries(LRECT).map(([k, [x, y, w, h]]) => [k, [x / LA[0], 1 - (y + h) / LA[1], (x + w) / LA[0], 1 - y / LA[1]]]));
export function createLitAtlas() {
  const c = canvas(LA[0], LA[1]), g = c.getContext('2d');
  const t = tex(c, true);
  const draw = () => { drawLit(g); t.needsUpdate = true; };
  draw();
  t.userData.ready = loadSetFonts().then(draw);
  return t;
}
function drawLit(g) {
  const at = (name, fn) => { const [x, y, w, h] = LRECT[name]; g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip(); g.translate(x, y); fn(w, h); g.restore(); };
  at('vending', (w, h) => {
    // header: lit logo band; body: five shelves of cans/bottles behind glass, cool white light
    let gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#dff3ff'); gr.addColorStop(1, '#9fc9e8'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = '#16c0d8'; g.fillRect(0, 0, w, 170);
    g.fillStyle = '#ffffff'; g.font = titan(88); g.textAlign = 'center'; g.fillText('浪花', w / 2, 112);
    g.font = rubik(26); g.fillText('冰镇 · 150', w / 2, 152);
    const cols = ['#ff5a3c', '#2fd1ff', '#ffd23c', '#7cff6b', '#ff4fa8', '#ffffff', '#ff8a14', '#6a5bff'];
    for (let r = 0; r < 5; r++) {
      const y = 200 + r * 160;
      g.fillStyle = 'rgba(40,70,100,0.35)'; g.fillRect(16, y + 118, w - 32, 10);
      for (let i = 0; i < 6; i++) {
        const x = 36 + i * 76, col = cols[(r * 3 + i) % cols.length];
        g.fillStyle = col; g.beginPath(); g.roundRect(x, y + 20, 52, 98, 10); g.fill();
        g.fillStyle = 'rgba(255,255,255,0.55)'; g.fillRect(x + 8, y + 26, 8, 84);
        g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x, y + 60, 52, 18);
        g.fillStyle = '#20303c'; g.fillRect(x + 8, y + 134, 36, 14);
        g.fillStyle = '#ff4040'; g.fillRect(x + 12, y + 137, 6, 8);
      }
    }
    g.textAlign = 'left';
  });
  at('door', (w, h) => {
    // warm back room: floor, a wall of skate decks, boxes, a hanging bulb glow
    let gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#6b3a1e'); gr.addColorStop(0.55, '#c9803f'); gr.addColorStop(1, '#8a4e25'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    const rg = g.createRadialGradient(w * 0.55, h * 0.18, 10, w * 0.55, h * 0.2, h * 0.6); rg.addColorStop(0, 'rgba(255,236,190,0.95)'); rg.addColorStop(1, 'rgba(255,200,120,0)'); g.fillStyle = rg; g.fillRect(0, 0, w, h);
    const deck = ['#ff8a14', '#2f5bff', '#f2e312', '#ff3f9e', '#18d48c', '#ffffff', '#8a3cff', '#ff5a1f'];
    for (let i = 0; i < 7; i++) { const x = 30 + i * 66; g.fillStyle = deck[i]; g.beginPath(); g.roundRect(x, 190 + (i % 2) * 14, 48, 330, 24); g.fill(); g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x + 6, 300, 36, 50); }
    g.fillStyle = '#4a2a16'; g.fillRect(0, 540, w, 22);
    for (let i = 0; i < 4; i++) { g.fillStyle = ['#b98552', '#a47244', '#c79a62', '#8f6238'][i]; g.fillRect(40 + i * 110 + (i % 2) * 20, 700 - (i % 2) * 90, 120, 200 + (i % 2) * 90); g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(40 + i * 110 + (i % 2) * 20, 760, 120, 10); }
    g.fillStyle = 'rgba(20,10,5,0.55)'; g.fillRect(0, 900, w, 124);
  });
  const room = (name, base, lamp, kind) => at(name, (w, h) => {
    let gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, base[0]); gr.addColorStop(1, base[1]); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    const rg = g.createRadialGradient(lamp[0] * w, lamp[1] * h, 4, lamp[0] * w, lamp[1] * h, w * 0.7); rg.addColorStop(0, lamp[2]); rg.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = rg; g.fillRect(0, 0, w, h);
    if (kind === 'curtain') { g.fillStyle = 'rgba(120,30,20,0.85)'; g.fillRect(0, 0, w * 0.3, h); g.fillRect(w * 0.78, 0, w * 0.22, h); for (let x = 0; x < w * 0.3; x += 18) { g.fillStyle = 'rgba(0,0,0,0.2)'; g.fillRect(x, 0, 6, h); } }
    if (kind === 'blinds') { for (let y = 0; y < h; y += 22) { g.fillStyle = 'rgba(20,30,40,0.55)'; g.fillRect(0, y, w, 9); } }
    if (kind === 'plant') { g.fillStyle = 'rgba(10,20,10,0.8)'; for (let i = 0; i < 9; i++) { g.beginPath(); g.ellipse(w * 0.25 + Math.sin(i) * 50, h * 0.6 - i * 22, 60, 16, i * 0.7, 0, 7); g.fill(); } g.fillRect(w * 0.2, h * 0.72, 70, 120); }
    if (kind === 'lamp') { g.fillStyle = 'rgba(15,10,8,0.8)'; g.fillRect(w * 0.48, 0, 6, h * 0.3); g.beginPath(); g.moveTo(w * 0.4, h * 0.36); g.lineTo(w * 0.6, h * 0.36); g.lineTo(w * 0.55, h * 0.28); g.lineTo(w * 0.45, h * 0.28); g.fill(); g.fillStyle = 'rgba(30,20,15,0.7)'; g.fillRect(w * 0.1, h * 0.7, w * 0.5, h * 0.3); }
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, h * 0.82, w, h * 0.18);
  });
  room('win0', ['#5a2f1a', '#2a140c'], [0.6, 0.35, 'rgba(255,190,110,1)'], 'curtain');
  room('win1', ['#1b2a3a', '#0d141c'], [0.4, 0.5, 'rgba(140,190,255,0.9)'], 'blinds');
  room('win2', ['#4a3322', '#1f150e'], [0.7, 0.3, 'rgba(255,214,150,1)'], 'plant');
  room('win3', ['#523018', '#24130a'], [0.5, 0.3, 'rgba(255,200,130,1)'], 'lamp');
}

// ------------------------------------------------------------------------------------------------ skyline
// Silhouettes with lit windows; alpha = building. Two strips (near / far) in one 2048 x 1024 texture.
export function createSkyline() {
  const W = 2048, H = 1024, c = canvas(W, H), g = c.getContext('2d'), rnd = mulberry(99);
  g.clearRect(0, 0, W, H);
  for (let band = 0; band < 2; band++) {
    const y0 = band * 512, base = band ? '#0d1322' : '#141a2c';
    let x = 0;
    while (x < W) {
      const bw = 50 + rnd() * 140, bh = 120 + rnd() * (band ? 300 : 360), top = y0 + 512 - bh;
      g.fillStyle = base; g.fillRect(x, top, bw + 1, bh);
      if (rnd() < 0.3) { g.fillRect(x + bw * 0.2, top - 26, bw * 0.3, 26); }
      if (rnd() < 0.25) { g.fillRect(x + bw * 0.5, top - 60 - rnd() * 60, 3, 120); }
      if (rnd() < 0.2) { g.beginPath(); g.moveTo(x, top); g.lineTo(x + bw / 2, top - 40); g.lineTo(x + bw, top); g.fill(); }
      // windows
      const cols = Math.floor(bw / 12), rows = Math.floor(bh / 16);
      for (let r = 1; r < rows; r++) for (let k = 1; k < cols; k++) {
        if (rnd() < (band ? 0.16 : 0.22)) { const warm = rnd() < 0.75; g.fillStyle = warm ? `rgba(255,${190 + rnd() * 40 | 0},120,${0.5 + rnd() * 0.5})` : `rgba(150,200,255,${0.4 + rnd() * 0.4})`; g.fillRect(x + k * 12 - 3, top + r * 16, 5, 7); }
      }
      x += bw + (rnd() < 0.3 ? rnd() * 20 : 0);
    }
  }
  const t = tex(c, true);
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

// ------------------------------------------------------------------------------------------------ neon glyphs
// Single-stroke neon letters in a 1-high em box: arrays of strokes, each { p: [[x, y], ...], smooth } (y up).
// Corners get a small bend radius (real tubes are bent, not mitred); smooth strokes are Catmull-Rom'd.
const GL = {
  I: { w: 0.16, s: [{ p: [[0.08, 0], [0.08, 1]] }] },
  N: { w: 0.62, s: [{ p: [[0.02, 0], [0.02, 1], [0.6, 0], [0.6, 1]] }] },
  K: { w: 0.6, s: [{ p: [[0.04, 0], [0.04, 1]] }, { p: [[0.56, 1], [0.1, 0.46], [0.6, 0]] }] },
  S: { w: 0.6, s: [{ smooth: true, p: [[0.56, 0.86], [0.42, 0.99], [0.16, 0.99], [0.03, 0.83], [0.08, 0.61], [0.3, 0.51], [0.52, 0.41], [0.58, 0.18], [0.44, 0.01], [0.16, 0.01], [0.02, 0.14]] }] },
  A: { w: 0.66, s: [{ p: [[0.02, 0], [0.33, 1], [0.64, 0]] }, { p: [[0.14, 0.36], [0.52, 0.36]] }] },
  T: { w: 0.6, s: [{ p: [[0, 1], [0.6, 1]] }, { p: [[0.3, 1], [0.3, 0]] }] },
  E: { w: 0.54, s: [{ p: [[0.54, 1], [0.03, 1], [0.03, 0], [0.54, 0]] }, { p: [[0.03, 0.5], [0.42, 0.5]] }] },
  '&': { w: 0.66, s: [{ smooth: true, p: [[0.66, 0.02], [0.4, 0.3], [0.14, 0.62], [0.12, 0.84], [0.26, 0.99], [0.44, 0.92], [0.46, 0.74], [0.3, 0.58], [0.06, 0.4], [0.04, 0.16], [0.2, 0.01], [0.42, 0.04], [0.6, 0.3]] }] },
  ' ': { w: 0.3, s: [] },
};
function smoothPts(p, n = 6) {
  const out = [];
  for (let i = 0; i < p.length - 1; i++) {
    const a = p[Math.max(0, i - 1)], b = p[i], c = p[i + 1], d = p[Math.min(p.length - 1, i + 2)];
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      out.push([0.5 * (2 * b[0] + (-a[0] + c[0]) * t + (2 * a[0] - 5 * b[0] + 4 * c[0] - d[0]) * t2 + (-a[0] + 3 * b[0] - 3 * c[0] + d[0]) * t3),
        0.5 * (2 * b[1] + (-a[1] + c[1]) * t + (2 * a[1] - 5 * b[1] + 4 * c[1] - d[1]) * t2 + (-a[1] + 3 * b[1] - 3 * c[1] + d[1]) * t3)]);
    }
  }
  out.push(p[p.length - 1]);
  return out;
}
function bendCorners(p, r) {
  if (p.length < 3) return p;
  const out = [p[0]];
  for (let i = 1; i < p.length - 1; i++) {
    const a = p[i - 1], b = p[i], c = p[i + 1];
    const d1 = [a[0] - b[0], a[1] - b[1]], d2 = [c[0] - b[0], c[1] - b[1]];
    const l1 = Math.hypot(...d1), l2 = Math.hypot(...d2), rr = Math.min(r, l1 * 0.45, l2 * 0.45);
    const p1 = [b[0] + (d1[0] / l1) * rr, b[1] + (d1[1] / l1) * rr], p2 = [b[0] + (d2[0] / l2) * rr, b[1] + (d2[1] / l2) * rr];
    for (let k = 0; k <= 4; k++) { const t = k / 4, u = 1 - t; out.push([u * u * p1[0] + 2 * u * t * b[0] + t * t * p2[0], u * u * p1[1] + 2 * u * t * b[1] + t * t * p2[1]]); }
  }
  out.push(p[p.length - 1]);
  return out;
}
// Text → strokes in metres (baseline at y = 0, left at x = 0). buzz = index of the letter that buzzes.
export function neonText(str, height, gap = 0.16) {
  const strokes = []; let x = 0;
  [...str].forEach((ch, i) => {
    const gl = GL[ch] || GL[' '];
    for (const s of gl.s) {
      const pts = (s.smooth ? smoothPts(s.p) : bendCorners(s.p, 0.07)).map(([u, v]) => [x + u * height, v * height]);
      strokes.push({ pts, letter: i });
    }
    x += (gl.w + gap) * height;
  });
  return { strokes, width: x - gap * height };
}
// The squid sign: mantle + fins (one closed tube), two eye loops, four wavy tentacles. Unit ≈ 1 m tall, centred on x.
export function neonSquid(size = 1) {
  const S = (p) => p.map(([x, y]) => [x * size, y * size]);
  // mantle: pointed crown, two swept fins, body tapering into the tentacle root (one closed tube)
  const half = [[0, 1.08], [0.1, 0.99], [0.2, 0.88], [0.36, 0.8], [0.47, 0.72], [0.36, 0.66], [0.24, 0.62], [0.23, 0.5], [0.2, 0.38], [0.14, 0.33]];
  const mantle = smoothPts([...half, ...half.slice().reverse().map(([x, y]) => [-x, y])], 5);
  const eye = (cx) => { const p = []; for (let i = 0; i <= 14; i++) { const a = (i / 14) * Math.PI * 2; p.push([cx + Math.cos(a) * 0.05, 0.5 + Math.sin(a) * 0.068]); } return p; };
  // tentacles: parallel waves (same phase, so they never cross), the outer pair longer and curling out
  const tent = (x0, len, curl) => smoothPts([[x0, 0.31], [x0 + 0.03, 0.31 - len * 0.33], [x0 - 0.02, 0.31 - len * 0.66], [x0 + 0.02 + curl, 0.31 - len]], 5);
  const strokes = [mantle, eye(-0.085), eye(0.085), tent(-0.105, 0.27, -0.06), tent(-0.035, 0.22, 0), tent(0.035, 0.22, 0), tent(0.105, 0.27, 0.06)].map((p, i) => ({ pts: S(p), letter: i }));
  return { strokes, width: 0.94 * size };
}
// Soft halo for a stroke set (grey in R): blurred thick lines + a tighter inner glow. Returns { texture, rect: [x0, y0, x1, y1] metres }.
export function neonHalo(strokes, pad = 0.35, pxPerM = 180) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const s of strokes) for (const [x, y] of s.pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  x0 -= pad; y0 -= pad; x1 += pad; y1 += pad;
  const W = Math.min(2048, Math.ceil((x1 - x0) * pxPerM)), H = Math.min(1024, Math.ceil((y1 - y0) * pxPerM));
  const c = canvas(W, H), g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
  const P = ([x, y]) => [((x - x0) / (x1 - x0)) * W, (1 - (y - y0) / (y1 - y0)) * H];
  const draw = (lw, blur, a) => {
    g.filter = `blur(${blur}px)`; g.strokeStyle = `rgba(255,255,255,${a})`; g.lineWidth = lw; g.lineCap = g.lineJoin = 'round';
    for (const s of strokes) { g.beginPath(); s.pts.forEach((p, i) => { const [x, y] = P(p); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke(); }
  };
  g.globalCompositeOperation = 'lighter';
  draw(pxPerM * 0.16, pxPerM * 0.16, 0.35);
  draw(pxPerM * 0.06, pxPerM * 0.05, 0.45);
  g.filter = 'none';
  const t = tex(c, false);
  return { texture: t, rect: [x0, y0, x1, y1] };
}
