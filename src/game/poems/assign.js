// 丢词大作战 — 武器↔诗句绑定 与 联句判定
//
// 设计要点：
//   * 每把武器绑定一首诗，武器特性决定诗句长短（滚筒铺得广 → 五言；狙击打得远 → 七言）
//   * 没有"武器专属诗"这回事：绑定表只决定**首局默认**，玩家可在选诗界面自由更换
//   * 判定是纯函数，不碰渲染与网络，便于测试与调参
//
// 判定规则（第一版，刻意保持简单——复杂语义玩家理解不了）：
//   成句  同一队把区域的墨量占比推到 control 以上，且该队在此区域用的是同一首诗
//   联句  两个相邻区域由同一队占据，且分别是同一首诗的第 i 句 与 第 i+1 句
//   搭错  同队占据相邻区域，但两句不属于同一首诗
import { POEMS, poemById } from './poems.js';

// 武器 → 默认诗（按武器手感挑：连发/近距离给短句，远程/蓄力给长句）
// 只影响首局默认值与 AI，玩家可改
export const WEAPON_POEM = {
  shooter: 'chunxiao',        // 喷雾枪：新手武器，配最耳熟的
  twins: 'xiaochi',           // 双枪：灵活，配轻快的
  brolly: 'hua',              // 折伞：防守，配静的
  blaster: 'minnong2',        // 爆破：厚重，配沉的
  spinner: 'dengguanquelou',  // 旋转枪：蓄力，配上进的
  charger: 'wanglushanpubu',  // 狙击：远程，配气势大的
  bow: 'shanxing',            // 弓：远且带弧，配行旅
  roller: 'yongliu',          // 滚筒：大面积，配铺展的
  brush: 'yonge',             // 笔刷：细密，配最简单的
  blade: 'jiangxue',          // 刀：近战，配孤冷的
  mitts: 'suojian',           // 拳套：近身，配童趣的
  bucket: 'cunju',            // 桶：抛物线，配田园的
};

/** 取某把武器的默认诗（找不到时回退到第一首） */
export function defaultPoemFor(weaponId) {
  return poemById(WEAPON_POEM[weaponId]) || POEMS[0];
}

/** 组队模式下按队伍规模分配诗句，保证同队不撞诗 */
export function assignPoems(weaponIds, grade = 1) {
  const pool = POEMS.filter((p) => p.grade === grade);
  const use = pool.length ? pool : POEMS;
  const taken = new Set();
  const out = [];
  for (let i = 0; i < weaponIds.length; i++) {
    let p = defaultPoemFor(weaponIds[i]);
    if (taken.has(p.id)) p = use.find((q) => !taken.has(q.id)) || p;   // 同队不重复
    taken.add(p.id);
    out.push(p);
  }
  return out;
}

/**
 * 两句（同一首诗的行下标 i、j）能否联句。
 * 联句 = 同一首诗里**相邻的两句**（上句接下一句）。顺序无所谓。
 */
export function canLink(poemA, i, poemB, j) {
  if (!poemA || !poemB || poemA.id !== poemB.id) return false;
  if (!poemA.lines[i] || !poemA.lines[j]) return false;
  return Math.abs(i - j) === 1;
}

/** 一句诗所属的诗与行号（用于记录"某区域是哪首诗的第几句"） */
export function lineRef(poem, lineIndex) {
  if (!poem) return null;
  return { poemId: poem.id, line: lineIndex, text: poem.lines[lineIndex] || '' };
}

/**
 * 判定两个相邻区域的组合结果。
 * @param {{poemId:string,line:number}|null} a
 * @param {{poemId:string,line:number}|null} b
 * @returns {{kind:'link'|'mismatch'|'none', poemId:string|null}}
 *   link     同一首诗相邻两句 → 联句，大幅加成
 *   mismatch 两句不同诗 → 能占，无加成
 *   none     有一方缺句 → 不判定
 */
export function judgePair(a, b) {
  if (!a || !b) return { kind: 'none', poemId: null };
  const pa = poemById(a.poemId), pb = poemById(b.poemId);
  if (!pa || !pb) return { kind: 'none', poemId: null };
  if (pa.id !== pb.id) return { kind: 'mismatch', poemId: null };
  return canLink(pa, a.line, pb, b.line) ? { kind: 'link', poemId: pa.id } : { kind: 'mismatch', poemId: pa.id };
}

// 收益系数（供 actor.addTurf 与结算使用；调平衡改这里，不用改逻辑）
export const POEM_SCORE = {
  solo: 1.0,        // 单独涂满：基准
  link: 2.0,        // 联句：翻倍
  mismatch: 0.5,    // 搭错：减半
  linesToClaim: 1,  // 成句所需的最少句数（第一版 1 句；将来可提高到整首）
};
