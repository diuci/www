// 丢词大作战 — 地面诗句贴花
//
// 为什么走贴花而不是涂地图集：
//   涂地图集密度是 30 px/m（low/medium 画质只有 18），一个 1.2 米的汉字只有 36 px，
//   笔画约 3.6 px——低画质下糊成一团。而 murals 贴花是 64~96 px/m，笔画 6~8 px，清晰可辨，
//   而且它本来就是 Canvas2D 绘制（能直接 fillText 写中文），levelMaterial 也已在采样它（uMural）。
//
// 用法：
//   const decals = new PoemDecals();                 // 建一张独立的贴花画布
//   decals.place(zone, poem, team, { color });       // 在某区域"写下"一句诗
//   decals.fade(dt);                                 // 每帧推进淡出
//   decals.texture;                                  // 交给 levelMaterial 采样
//
// 排版按区域尺寸自适应：宽区域横排大字，窄区域竖排，极小区域只画一个印记。
import * as THREE from 'three';
import { poemById } from '../game/poems/poems.js';

const TEX = 2048;          // 与 murals 同规格
const PX_PER_M = 64;       // 每米像素（与 murals 的甲板贴花一致）
const MAX_DECALS = 12;

// 区域尺寸（米）→ 排版策略。注意：贴花条带高度 = TEX / MAX_DECALS = 170 px，
// 而字号 px = size × PX_PER_M，所以 size 上限必须 ≤ (条带高 × 0.72) / PX_PER_M，否则字会被切。
const BAND = TEX / MAX_DECALS;
const MAX_SIZE_M = (BAND * 0.72) / PX_PER_M;    // ≈ 1.9 米

function layoutFor(w, h, count) {
  const maxSide = Math.max(w, h);
  const perChar = maxSide / Math.max(1, count);          // 每个字分到多少米
  const cap = (v) => Math.min(v, MAX_SIZE_M);
  if (perChar >= 1.5) return { mode: 'row', size: cap(perChar * 0.82) };        // 横排大字
  if (perChar >= 0.9) return { mode: 'row', size: cap(perChar * 0.8) };         // 横排小字
  if (h / count >= 0.9) return { mode: 'col', size: cap((h / count) * 0.8) };   // 竖排
  return { mode: 'mark', size: cap(Math.max(0.9, maxSide * 0.4)) };             // 只画印记
}

export class PoemDecals {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.canvas.height = TEX;
    this.g = this.canvas.getContext('2d');
    this.g.clearRect(0, 0, TEX, TEX);
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 8;
    // 每个贴花占一格：纵向切成 MAX_DECALS 条，每条一个区域
    this.slotH = Math.floor(TEX / MAX_DECALS);
    this.slots = new Array(MAX_DECALS).fill(null);   // { poemId, team, t, life }
    this._next = 0;
  }

  // 在某区域写下诗句。zone 需带 center [x,y,z] 与 reach（zones.js 的 zoneCells 已算好）
  place(zone, poem, team, { color = '#ffffff', life = 6 } = {}) {
    if (!poem || !poem.lines?.length) return null;
    const slot = this._next++ % MAX_DECALS;
    return this.placeAt(slot, zone, poem, team, { color, life });
  }

  // 写到指定槽位（区域 i 固定用槽 i，便于每帧无脑同步）
  placeAt(slot, zone, poem, team, { color = '#ffffff', life = 6 } = {}) {
    if (!poem || !poem.lines?.length || slot < 0 || slot >= MAX_DECALS) return null;
    this.slots[slot] = { poemId: poem.id, team, t: 0, life };
    this._draw(slot, poem, team, color, zone);
    return slot;
  }

  _draw(slot, poem, team, color, zone) {
    const g = this.g;
    const y0 = slot * this.slotH;
    g.clearRect(0, y0, TEX, this.slotH);

    // 区域尺寸：用 reach 估直径，字形按此自适应
    const diam = Math.max(3, (zone?.reach || 4) * 2);
    const line = poem.lines[0] || '';
    const count = Math.max(1, line.length);
    const lay = layoutFor(diam, diam, count);

    g.save();
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    // 笔画加粗：描边而非填充，把最小区域的 3.6px 笔画撑到可辨
    g.lineJoin = 'round';
    g.lineCap = 'round';

    const px = Math.max(24, lay.size * PX_PER_M);
    const cx = TEX / 2, cy = y0 + this.slotH / 2;

    if (lay.mode === 'mark') {
      // 区域太小：只画一个"句"字印记 + 深色圆底
      g.font = `900 ${Math.round(px)}px "PingFang SC","Hiragino Sans GB","Microsoft YaHei","Noto Sans SC",sans-serif`;
      g.fillStyle = 'rgba(0,0,0,.35)';
      g.beginPath(); g.arc(cx, cy, px * 0.62, 0, Math.PI * 2); g.fill();
      g.strokeStyle = color; g.lineWidth = px * 0.14;
      g.strokeText('句', cx, cy);
      g.fillStyle = color; g.fillText('句', cx, cy);
    } else {
      const font = `900 ${Math.round(px)}px "PingFang SC","Hiragino Sans GB","Microsoft YaHei","Noto Sans SC",sans-serif`;
      g.font = font;
      const chars = [...line];
      // 横向也要放得下：5 个字 × 字宽 1.08 ≤ 画布宽 × 0.9
      const gapMax = (TEX * 0.9) / Math.max(1, chars.length);
      const gap = Math.min(px * 1.08, gapMax);
      const total = (chars.length - 1) * gap;
      const startX = cx - total / 2;
      const startY = cy - (lay.mode === 'col' ? total / 2 : 0);
      chars.forEach((ch, i) => {
        const x = lay.mode === 'col' ? cx : startX + i * gap;
        const y = lay.mode === 'col' ? startY + i * gap : cy;
        // 深色描边打底，保证在任何队色/地面色上都能读
        g.strokeStyle = 'rgba(10,8,16,.72)';
        g.lineWidth = px * 0.13;
        g.strokeText(ch, x, y);
        g.strokeStyle = color;
        g.lineWidth = px * 0.055;
        g.strokeText(ch, x, y);
        g.fillStyle = color;
        g.fillText(ch, x, y);
      });
    }
    g.restore();
    this.texture.needsUpdate = true;
  }

  // 淡出：超时的贴花擦掉（画布上直接清该条）。life 为 Infinity 的永久保留。
  fade(dt) {
    let dirty = false;
    for (let i = 0; i < MAX_DECALS; i++) {
      const s = this.slots[i];
      if (!s || !Number.isFinite(s.life)) continue;
      s.t += dt;
      if (s.t >= s.life) { this.slots[i] = null; this.g.clearRect(0, i * this.slotH, TEX, this.slotH); dirty = true; }
    }
    if (dirty) this.texture.needsUpdate = true;
  }

  clear() {
    this.slots.fill(null);
    this.g.clearRect(0, 0, TEX, TEX);
    this.texture.needsUpdate = true;
  }

  dispose() { this.texture.dispose(); }
}

export const POEM_DECAL_PX_PER_M = PX_PER_M;
