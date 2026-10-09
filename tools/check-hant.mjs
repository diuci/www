#!/usr/bin/env node
/*
  主站繁简字典的闸门（正本在 diuci/www 仓 tools/check-hant.mjs）。

  盯的事（每条在 --selftest 里都有坏例子）：
    H1 页面上每一段中文文案，字典里必须有译法——漏一段就是切到繁体时半繁半简
    H2 字典里不许留着页面上找不到的键——留着就是字典与页面已经分家
    H3 繁体侧不许留着只有简体才用的字形
    H4 值不许是空的；键里有该换的字而值原封不动，就是漏译
    H5 allow 里每一条必须写清为什么放行
    H6 盯的字与放行的字不许重叠、不许重复、放行的必须是单字

  字典 ui/hant.json 是主站文案唯一的繁体来源；运行时缺译会在控制台当场说话。
*/
import fs from 'node:fs'
import path from 'node:path'

const CFG_PATH = 'tools/check-hant.config.json'

function fail(msg) { console.error('[check-hant] ' + msg); process.exit(1) }

function readCfg(dir) {
  const p = path.join(dir, CFG_PATH)
  if (!fs.existsSync(p)) fail('没有 ' + CFG_PATH)
  return JSON.parse(fs.readFileSync(p, 'utf8'))
}

/** 页面上的中文文案：文本节点 + title/aria-label + description。style/script 里的中文不是文案。 */
function extractRuns(html) {
  const body = html.replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<noscript[\s\S]*?<\/noscript>/gi, '')
  const runs = []
  const cjk = /[\u4e00-\u9fff]/
  for (const m of body.matchAll(/>([^<]+)</g)) {
    const t = m[1].trim()
    if (t && cjk.test(t)) runs.push(t)
  }
  for (const m of html.matchAll(/(?:title|aria-label)="([^"]*[\u4e00-\u9fff][^"]*)"/g)) runs.push(m[1].trim())
  for (const m of html.matchAll(/<meta[^>]*name="description"[^>]*content="([^"]*[\u4e00-\u9fff][^"]*)"/g)) runs.push(m[1].trim())
  for (const m of html.matchAll(/<meta[^>]*property="og:description"[^>]*content="([^"]*[\u4e00-\u9fff][^"]*)"/g)) runs.push(m[1].trim())
  return Array.from(new Set(runs))
}

const RULES = []
function rule(id, title, fn) { RULES.push({ id, title, fn }) }

rule('H1', '页面上每一段中文文案都得有译法', (cfg, data) => {
  const problems = []
  for (const run of data.runs) {
    if (!(run in data.dict)) problems.push('字典里没有这段的译法：' + JSON.stringify(run.slice(0, 40)))
  }
  return problems
})

rule('H2', '字典里不许留着页面上找不到的键', (cfg, data) => {
  const problems = []
  const known = new Set(data.runs.concat(cfg.runtimeStrings || []))
  for (const k of Object.keys(data.dict)) {
    if (!known.has(k)) problems.push('字典里的键在页面上找不到：' + JSON.stringify(k.slice(0, 40)))
  }
  return problems
})

rule('H3', '繁体侧不许留着只有简体才用的字形', (cfg, data) => {
  const problems = []
  const chars = Array.from(data.chars)
  for (const [k, v] of Object.entries(data.dict)) {
    for (const c of chars) {
      if (v.includes(c)) problems.push('「' + k.slice(0, 24) + '」的繁体写作「' + v.slice(0, 24) + '」，里面还留着简体字「' + c + '」')
    }
  }
  return problems
})

rule('H4', '值不许为空，键里有该换的字就不许原封不动', (cfg, data) => {
  const problems = []
  const chars = Array.from(data.chars)
  for (const [k, v] of Object.entries(data.dict)) {
    if (typeof v !== 'string' || !v.trim()) { problems.push('「' + k.slice(0, 24) + '」的译法是空的'); continue }
    const mustChange = chars.some(c => k.includes(c))
    if (mustChange && v === k) problems.push('「' + k.slice(0, 24) + '」里有该换的字，译法却与原文一模一样——这是没译')
  }
  return problems
})

rule('H5', 'allow 里每一条都得写清为什么放行', (cfg, data) => {
  const problems = []
  for (const [c, why] of Object.entries(data.allow)) {
    if (typeof why !== 'string' || why.trim().length < 4) problems.push('allow 里的「' + c + '」没写为什么放行')
  }
  return problems
})

rule('H6', '盯的字与放行的字不许打架', (cfg, data) => {
  const problems = []
  const seen = new Set()
  for (const c of Array.from(data.charsStr)) {
    if (seen.has(c)) problems.push('盯的字里「' + c + '」出现了两次')
    seen.add(c)
    if (c in data.allow) problems.push('「' + c + '」既在盯的字里又在 allow 里：到底管不管？')
    if (Array.from(c).length !== 1) problems.push('盯的字里「' + c + '」不是一个字')
  }
  for (const c of Object.keys(data.allow)) {
    if (Array.from(c).length !== 1) problems.push('allow 里的键「' + c + '」不是一个字')
  }
  return problems
})

function runAll(cfg, data) {
  let total = 0
  for (const r of RULES) {
    const probs = r.fn(cfg, data)
    if (probs.length) { total += probs.length; for (const m of probs) console.error('  ' + r.id + ' ' + r.title + '：' + m) }
  }
  return total
}

function selftest(dir, cfg) {
  const chars = fs.readFileSync(path.join(dir, cfg.chars), 'utf8')
  const charsJson = JSON.parse(chars)
  const baseHtml = [
    '<html><head><title>学古诗</title><meta name="description" content="给孩子的古诗文"></head>',
    '<body><nav><a href="/">首页</a><a href="/poems/">学古诗</a></nav>',
    '<footer><a href="/legal">版权与免责</a></footer>',
    '<style>/* 学 不是文案 */ .x{content:"诗"}</style>',
    '<script>/* 语 不是文案 */ var s="语";</script>',
    '</body></html>',
  ].join('\n')
  const baseDict = { '学古诗': '學古詩', '首页': '首頁', '给孩子的古诗文': '給孩子的古詩文', '版权与免责': '版權與免責' }
  const baseAllow = { 里: '裁定表：里巷、处所义作「里」' }
  const mk = (html, dict, allow, charStr) => ({
    runs: extractRuns(html),
    dict: dict || { ...baseDict },
    allow: allow || { ...baseAllow },
    chars: new Set(Array.from(charStr === undefined ? charsJson.chars : charStr)),
    charsStr: charStr === undefined ? charsJson.chars : charStr,
  })
  const cases = []
  cases.push({ id: 'H1', why: '页面上多了一段，字典没跟上', data: mk(baseHtml + '<p>连词成句</p>') })
  cases.push({ id: 'H2', why: '字典里留着页面上没有的键', data: mk(baseHtml, { ...baseDict, '遗失月冕': '遺失月冕' }) })
  cases.push({ id: 'H3', why: '繁体侧留着简体字「学」', data: mk(baseHtml, { ...baseDict, '学古诗': '學古詩', '首页': '首頁', '给孩子的古诗文': '給孩子的古詩文', '版权与免责': '版權與免責', '学': '学' }) })
  cases.push({ id: 'H4', why: '译法与原文一模一样', data: mk(baseHtml, { ...baseDict, '学古诗': '学古诗' }) })
  cases.push({ id: 'H4b', why: '译法是空的', data: mk(baseHtml, { ...baseDict, '学古诗': '' }) })
  cases.push({ id: 'H5', why: 'allow 没写为什么放行', data: mk(baseHtml, baseDict, { 里: '' }) })
  cases.push({ id: 'H6', why: '同一个字既盯又放行', data: mk(baseHtml, baseDict, { 学: '乱放的' }, '学') })
  cases.push({ id: 'H6b', why: '盯的字里重复', data: mk(baseHtml, baseDict, baseAllow, '学学') })
  cases.push({ id: 'H6c', why: 'allow 的键不是一个字', data: mk(baseHtml, baseDict, { 里: '裁定表：里巷义作「里」', 学古: '两个字算一个键' }, '诗') })
  let tried = 0, caught = 0
  for (const c of cases) {
    tried++
    const n = runAll(cfg, c.data)
    if (n) caught++
    else console.error('  坏例子没抓住：' + c.id + ' ' + c.why)
  }
  const good = mk(baseHtml)
  const falseAlarm = runAll(cfg, good)
  if (falseAlarm) { tried++; console.error('  好例子被误报：' + falseAlarm + ' 处') }
  if (caught !== tried) {
    console.error('[check-hant] --selftest 失败：试了 ' + tried + ' 例，抓住 ' + caught + ' 例')
    process.exit(1)
  }
  console.log('[ok] check-hant --selftest 通（当场数到 ' + tried + ' 个坏例子，全部试到）')
}

const dir = process.cwd()
const cfg = readCfg(dir)
if (process.argv.includes('--selftest')) { selftest(dir, cfg); process.exit(0) }

const html = fs.readFileSync(path.join(dir, cfg.page), 'utf8')
const dict = JSON.parse(fs.readFileSync(path.join(dir, cfg.dict), 'utf8'))
const meta = JSON.parse(fs.readFileSync(path.join(dir, cfg.chars), 'utf8'))
const data = { runs: extractRuns(html), dict, allow: meta.allow || {}, chars: new Set(Array.from(meta.chars)), charsStr: meta.chars }
let total = 0
for (const r of RULES) {
  const probs = r.fn(cfg, data)
  if (!probs.length) { console.log('  ' + r.id + ' ' + r.title + '：过'); continue }
  total += probs.length
  for (const m of probs) console.error('  ' + r.id + ' ' + r.title + '：' + m)
}
if (total) { console.error('[check-hant] 失败：' + total + ' 处'); process.exit(1) }
console.log('[ok] check-hant 通（页面 ' + data.runs.length + ' 段文案，字典 ' + Object.keys(dict).length + ' 条，盯 ' + data.chars.size + ' 个字）')
