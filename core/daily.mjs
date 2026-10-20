// core/daily.mjs —— 每日题机械件正本（PLAN-全站统一-v2 §3.1）。
//
// 定位：只提供「日期 → 确定性种子 → 池内确定性选取 → 冻结回放」的机械件。
// **不含任何题库概念，不做跨站同题**（用户拍板 2026-10-20：同一天全网同题
// 会让答案被传播剧透）。选题策略（谜种轮转 / 字类轮转 / 按篇）由各站注入：
//   - 各站把池子构造好，调 pickFromPool(pool, day, salt) 取题；
//   - salt 各站自定（如 'zimi-daily' / 'jiagu-daily'），同池同日也不同题。
//
// 冻结回放：已经发出去的日子必须钉死在记录里，词库怎么变都按记录走——
// 「玩家上周玩过的那一题，这周回放变成另一题」不叫回放，叫换题。
// 记录形态（各站共用）：{ days: [{day, id}], ghosts: {id: 字对象} }。
//
// 客户端与 tools/ 共用这一份：正本在 _deploy/core/，各站经 sync 拷贝，
// 闸门（check-core.mjs）钉 sha256。

export const DAY_MS = 86400000

/** 本地日期 → YYYY-MM-DD。「今天」按玩家所在的日子算。 */
export function dayKey(d = new Date()) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return y + '-' + m + '-' + day
}

/** YYYY-MM-DD → 本地 Date；非法返回 null。 */
export function parseDayKey(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''))
  if (!m) return null
  const y = Number(m[1])
  const mo = Number(m[2])
  const day = Number(m[3])
  if (mo < 1 || mo > 12 || day < 1 || day > 31) return null
  const dt = new Date(y, mo - 1, day)
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== day) return null
  return dt
}

/** djb2 字符串哈希 → 32 位无符号整数。确定性、跨语言可复现。 */
export function djb2(str) {
  let h = 5381
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h + str.charCodeAt(i)) >>> 0
  }
  return h
}

/** mulberry32：由 32 位种子生成确定性伪随机序列。 */
export function mulberry32(seed) {
  const a = seed >>> 0
  return function () {
    let t = (a + 0x6d2b79f5) | 0
    t = Math.imul(t ^ (t >>> 15), 1 | t)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 池内确定性取一个：日期 + salt 定种子，人不能挑，挑了就不是「今天这一题」。
 *  池为空抛错——空池是数据事故，静默返回 undefined 会把事故藏进随机数里。 */
export function pickFromPool(pool, day, salt) {
  if (!Array.isArray(pool) || !pool.length) throw new Error('每日题池是空的（' + salt + ' ' + day + '）')
  const rng = mulberry32(djb2(salt + ':' + day))
  return pool[Math.floor(rng() * pool.length)]
}

/** 这一天冻在记录里吗？冻着就必须按记录的那一字出，不许重新摇。
 *  history: {days: [{day, id}], ghosts: {id: 字对象}}（可为 null）
 *  getChar: id → 字对象（各站从自己的词库里找；找不到返回 undefined）
 *  返回 {char, frozen: true} 或 null。记录钉了 id 却两头都找不到 = 数据事故，抛错。 */
export function frozenFor(history, day, getChar) {
  if (!history || !Array.isArray(history.days)) return null
  const hit = history.days.find((x) => x.day === day)
  if (!hit) return null
  const cur = getChar(hit.id)
  if (cur) return { char: cur, frozen: true }
  const ghost = (history.ghosts || {})[hit.id]
  if (ghost) return { char: Object.assign({ ghost: true }, ghost), frozen: true }
  throw new Error(day + ' 冻在记录里，指向「' + hit.id + '」，可词库与幽灵记录里都没有这个字')
}

/** 自检：机械件自己证明自己是确定性的、冻结是铁的。各站 --selftest 里调用。 */
export function selftest() {
  const problems = []
  // 同参必同果
  const pool = ['a', 'b', 'c', 'd', 'e']
  const p1 = pickFromPool(pool, '2026-10-20', 's1')
  const p2 = pickFromPool(pool, '2026-10-20', 's1')
  if (p1 !== p2) problems.push('同池同日同 salt 取到了不同的题')
  // 换 salt 换分布（不要求必不同，但 20 个 salt 里至少出现 2 种结果——全同即 salt 失效）
  const results = new Set()
  for (let i = 0; i < 20; i++) results.add(pickFromPool(pool, '2026-10-20', 'salt' + i))
  if (results.size < 2) problems.push('salt 不起作用：20 个 salt 全取到同一个')
  // 空池要抛
  let threw = false
  try { pickFromPool([], '2026-10-20', 's') } catch { threw = true }
  if (!threw) problems.push('空池没有抛错')
  // 冻结：记录钉了就按记录走
  const frozen = frozenFor({ days: [{ day: '2026-10-19', id: 'x' }] }, '2026-10-19', (id) => (id === 'x' ? { char: '回' } : undefined))
  if (!frozen || frozen.char.char !== '回' || !frozen.frozen) problems.push('冻结日没按记录走')
  // 冻结悬空 id 要抛
  let threw2 = false
  try { frozenFor({ days: [{ day: '2026-10-19', id: 'gone' }] }, '2026-10-19', () => undefined) } catch { threw2 = true }
  if (!threw2) problems.push('冻结指向悬空 id 没有抛错')
  // 未冻结的日子返回 null
  if (frozenFor({ days: [{ day: '2026-10-19', id: 'x' }] }, '2026-10-20', () => undefined) !== null) {
    problems.push('未冻结的日子不该有结果')
  }
  return problems
}
