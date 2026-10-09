#!/usr/bin/env node
/*
  四站共用的 UI 闸门。正本在 diuci/www 仓 tools/check-ui.mjs，其余三站是字节一样的副本。

  它盯的事（每一条在 --selftest 里都有坏例子）：
    R1 令牌副本必须与正本字节一致（sha256 钉在 config 里）
    R2 本站 CSS 不得重新定义正本里的同名令牌
    R3 本站 CSS 不得把正本里的色值抄成字面量
    R4 顶栏必须同时有繁简钮（.dc-lang-btn）与明暗钮（.dc-theme-btn）
    R5 繁简钮的文案必须是单字「繁」或「简」
    R6 说明类页面（数据来源 / 准确性 / 版权免责）只能在页脚出现
    R7 侧栏不得有自己的滚动条
    R8 六个乐园的名字与顺序，顶栏与页脚必须一致

  规矩：闸门自己也要被试。--selftest 当场数坏例子，一个没抓到就退出。
*/
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

const CFG_PATH = 'tools/check-ui.config.json'

function readCfg(dir) {
  const p = path.join(dir, CFG_PATH)
  if (!fs.existsSync(p)) fail('没有 ' + CFG_PATH + '：闸门不知道本站该查哪些文件')
  return JSON.parse(fs.readFileSync(p, 'utf8'))
}

function fail(msg) {
  console.error('[check-ui] ' + msg)
  process.exit(1)
}

function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

/** 从正本令牌文件里数出「哪些名字、哪些值是正本的」。不写死名单：正本改了这里跟着改。 */
function parseTokens(text) {
  const body = stripComments(text)
  const names = new Map()
  const re = /(--[A-Za-z0-9-]+)\s*:\s*([^;{}]+)/g
  let m
  while ((m = re.exec(body))) {
    const name = m[1]
    const val = m[2].trim().replace(/\s+/g, ' ')
    if (!names.has(name)) names.set(name, new Set())
    names.get(name).add(val)
  }
  return names
}

/** 把 CSS 切成「选择器 + 声明块」。大括号配对，够用；@media 外壳里的块也单独出来。 */
function cssBlocks(text) {
  const src = stripComments(text)
  const out = []
  let i = 0
  while (i < src.length) {
    const open = src.indexOf('{', i)
    if (open < 0) break
    let depth = 1, j = open + 1
    while (j < src.length && depth > 0) {
      if (src[j] === '{') depth++
      else if (src[j] === '}') depth--
      j++
    }
    out.push({ sel: src.slice(i, open).trim(), body: src.slice(open + 1, j - 1) })
    i = j
  }
  return out
}

/** 本站 CSS 的正文：html 文件只取 <style> 里的，css 文件整份都是。 */
function cssText(rel, text) {
  if (/\.html$/i.test(rel) || /\.vue$/i.test(rel)) {
    const parts = []
    const re = /<style[^>]*>([\s\S]*?)<\/style>/gi
    let m
    while ((m = re.exec(text))) parts.push(m[1])
    return parts.join('\n')
  }
  return text
}

function readRegions(dir, spec) {
  const out = []
  for (const item of spec) {
    if (typeof item === 'string') {
      const p = path.join(dir, item)
      if (!fs.existsSync(p)) fail('config 写着本站有 ' + item + '，实际没有')
      out.push({ rel: item, text: fs.readFileSync(p, 'utf8') })
      continue
    }
    const p = path.join(dir, item.file)
    if (!fs.existsSync(p)) fail('config 写着本站有 ' + item.file + '，实际没有')
    const full = fs.readFileSync(p, 'utf8')
    const a = full.indexOf(item.start)
    if (a < 0) fail(item.file + ' 里找不到「' + item.start + '」这一段：config 与文件对不上了')
    const b = full.indexOf(item.end, a + item.start.length)
    if (b < 0) fail(item.file + ' 里「' + item.start + '」这一段没有收尾的「' + item.end + '」')
    out.push({ rel: item.file + ' [' + item.start.trim() + ']', text: full.slice(a, b + item.end.length) })
  }
  return out
}

const RULES = []
function rule(id, title, fn) { RULES.push({ id, title, fn }) }

function tokensOf(cfg, ctx) {
  return parseTokens(ctx.tokensText)
}

rule('R1', '令牌副本必须与正本字节一致', (cfg, files) => {
  const problems = []
  const p = path.join(files.__ctx.dir, cfg.tokens)
  if (!fs.existsSync(p)) { problems.push('本站没有 ' + cfg.tokens); return problems }
  if (!cfg.tokensSha256) { problems.push('config 没钉 tokensSha256：副本对不对得上正本没人知道'); return problems }
  const got = crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')
  if (got !== cfg.tokensSha256) {
    problems.push(cfg.tokens + ' 的 sha256 是 ' + got.slice(0, 12) + '…，config 钉的是 ' + cfg.tokensSha256.slice(0, 12) + '… ——副本与正本不是同一份字节')
  }
  return problems
})

rule('R2', '本站 CSS 不得重新定义正本里的同名令牌', (cfg, files) => {
  const tokens = tokensOf(cfg, files.__ctx)
  const problems = []
  for (const { rel, text } of files.css) {
    const re = /(--[A-Za-z0-9-]+)\s*:/g
    let m
    while ((m = re.exec(stripComments(cssText(rel, text))))) {
      if (tokens.has(m[1])) problems.push(rel + ' 里又定义了一遍正本令牌 ' + m[1] + '：改正本才叫统一，改这里是分叉')
    }
  }
  return problems
})

rule('R3', '本站 CSS 不得把正本里的色值抄成字面量', (cfg, files) => {
  const tokens = tokensOf(cfg, files.__ctx)
  const literals = new Set()
  for (const vals of tokens.values()) {
    for (const v of vals) {
      const hex = v.match(/#[0-9a-fA-F]{3,8}/g)
      if (hex) for (const h of hex) literals.add(h.toLowerCase())
      const rgba = v.match(/rgba?\([^)]*\)/g)
      if (rgba) for (const r of rgba) literals.add(r.replace(/\s+/g, '').toLowerCase())
    }
  }
  const problems = []
  for (const { rel, text } of files.css) {
    const flat = stripComments(cssText(rel, text)).replace(/\s+/g, '').toLowerCase()
    for (const lit of literals) {
      if (flat.includes(lit)) problems.push(rel + ' 里写死了正本色值 ' + lit + '：该用 var() 指过来')
    }
  }
  return problems
})

rule('R4', '顶栏必须同时有繁简钮与明暗钮', (cfg, files) => {
  const problems = []
  for (const cls of [cfg.langBtnClass, cfg.themeBtnClass]) {
    if (!files.nav.some(f => f.text.includes(cls))) {
      problems.push('顶栏里没有 ' + cls + '：两枚圆钮少一枚（繁简钮在明暗钮左边）')
    }
  }
  return problems
})

rule('R5', '繁简钮的文案必须是单字「繁」或「简」', (cfg, files) => {
  const problems = []
  for (const f of files.nav) {
    if (!f.text.includes(cfg.langBtnClass)) continue
    const re = new RegExp('<button[^>]*' + cfg.langBtnClass + '[\\s\\S]{0,400}?</button>', 'g')
    let m, found = 0
    while ((m = re.exec(f.text))) {
      found++
      const inner = m[0].replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
      const ok = inner === '繁' || inner === '简'
        || /\{\{[^}]*'繁'[^}]*'简'[^}]*\}\}/.test(inner)
        || /\{\{[^}]*'简'[^}]*'繁'[^}]*\}\}/.test(inner)
        || /\{\{[^}]*lang\.(toHans|toHant)[^}]*\}\}/.test(inner)
      if (!ok) problems.push(f.rel + ' 的繁简钮文案是「' + inner.slice(0, 24) + '」：该是一个字（简体时「繁」，繁体时「简」）')
    }
    if (!found) problems.push(f.rel + ' 里找不到 ' + cfg.langBtnClass + ' 这个按钮本体')
  }
  return problems
})

rule('R6', '说明类页面只能在页脚出现', (cfg, files) => {
  const problems = []
  for (const link of cfg.legalLinks) {
    if (!files.footer.some(f => f.text.includes(link))) {
      problems.push('页脚里没有 ' + link + '：说明类页面在页脚找不到')
    }
    for (const f of files.nav.concat(files.sidebar)) {
      if (f.text.includes(link)) problems.push(f.rel + ' 里出现了 ' + link + '：说明类页面只许在页脚出现一次')
    }
  }
  return problems
})

rule('R7', '侧栏不得有自己的滚动条', (cfg, files) => {
  const problems = []
  for (const { rel, text } of files.css) {
    for (const b of cssBlocks(cssText(rel, text))) {
      if (!cfg.sidebarSelectors.some(s => b.sel.includes(s))) continue
      const body = b.body.replace(/\s+/g, ' ')
      const own = body.match(/overflow(-y)?\s*:\s*(auto|scroll)/) || body.match(/max-height\s*:\s*(?!none)[^;}]+/)
      if (own) problems.push(rel + ' 的「' + b.sel + '」给了侧栏自己的滚动（' + own[0] + '）：该随页面整体滚')
    }
  }
  return problems
})

rule('R8', '六个乐园的名字与顺序必须一致', (cfg, files) => {
  const problems = []
  const seenKeys = new Set()
  for (const { rel, text } of files.parks) {
    const seq = []
    // 两种写法都要认：HTML 里的 <a>学古诗</a>，和 VitePress 配置里的 { text: '学古诗', link: … }
    const re = /<a\b[^>]*>([^<]{1,40})<\/a>|text:\s*'([^']{1,12})'/g
    let m
    while ((m = re.exec(text))) {
      let label = (m[1] || m[2] || '').trim()
      // 乐园名写在词典里的（{{ t('parks.home') }}）：先按 config 的对照表换成简体，再比顺序
      const key = label.match(/\{\{\s*t\('([^']+)'\)\s*\}\}/)
      if (key) {
        seenKeys.add(key[1])
        const mapped = (cfg.localeLabels || {})[key[1]]
        // 对照表里没有这个键 = 这一条不是乐园名（页脚的「数据来源」正是这类链接），跳过。
        if (!mapped) continue
        label = mapped
      }
      if (cfg.parks.includes(label)) seq.push(label)
    }
    const want = cfg.parks.filter(x => seq.includes(x))
    if (want.length !== seq.length) problems.push(rel + ' 里乐园掺了规范之外的名字：' + seq.join(' / '))
    else if (want.join('|') !== seq.join('|')) problems.push(rel + ' 里乐园顺序是 ' + seq.join(' / ') + '，规范是 ' + want.join(' / '))
    else {
      // 中间缺一个也要说话：只许整头整尾地少（页脚不摆「首页」是规范），不许中间空一格
      const idx = seq.map(x => cfg.parks.indexOf(x))
      for (let i = 1; i < idx.length; i++) {
        if (idx[i] - idx[i - 1] !== 1) problems.push(rel + ' 里「' + cfg.parks[idx[i - 1]] + '」与「' + cfg.parks[idx[i]] + '」中间少了乐园（少了 ' + cfg.parks.slice(idx[i - 1] + 1, idx[i]).join(' / ') + '）')
      }
    }
  }
  // 对照表不许留着页面里找不到的键：那是一张过期的表，下一次改名它就骗过顺序检查。
  // 只在「这一站确实用词典键写乐园名」时查——把名字写死的站没有这张表。
  if (seenKeys.size) {
  for (const k of Object.keys(cfg.localeLabels || {})) {
    if (!seenKeys.has(k)) problems.push('config 的 localeLabels 说词典键 ' + k + ' 是乐园名，可在被检查的区域里找不到它：对照表过期了')
  }
  }
  return problems
})

function runRule(id, cfg, files) {
  const r = RULES.find(x => x.id === id)
  if (!r) fail('没有 ' + id + ' 这条规则')
  return r.fn(cfg, files)
}

function ruleCount() { return RULES.length }

function selftest(dir, cfg, tokensText) {
  const goodNav = [
    '<nav class="dc-nav">',
    '<a href="https://diuci.com/">首页</a><a href="https://k12.diuci.com/">学古诗</a>',
    '<a href="https://lian.diuci.com/">连词成句</a><a href="https://handle.diuci.com/">汉兜</a>',
    '<a href="https://moon.diuci.com/">遗失月冕</a><a href="https://ink.diuci.com/">丢词大作战</a>',
    '<button class="dc-lang-btn" type="button" aria-label="繁简切换" title="繁简切换">繁</button>',
    '<button class="dc-theme-btn" type="button" aria-label="切换深色模式"></button>',
    '</nav>',
  ].join('\n')
  const goodFooter = [
    '<footer>',
    '<a href="https://diuci.com/">首页</a><a href="https://k12.diuci.com/">学古诗</a>',
    '<a href="https://lian.diuci.com/">连词成句</a><a href="https://handle.diuci.com/">汉兜</a>',
    '<a href="https://moon.diuci.com/">遗失月冕</a><a href="https://ink.diuci.com/">丢词大作战</a>',
    '<a href="/sources">数据来源与版权</a><a href="/accuracy">内容准确性</a><a href="/legal">版权与免责</a>',
    '</footer>',
  ].join('\n')
  const goodSidebar = '<aside class="VPSidebar"><a href="/poems/">总览</a><a href="/gaokao">高考默写</a></aside>'
  const goodCss = '.x{color:var(--cinnabar);width:var(--btn-round)}'
  const good = () => ({
    css: [{ rel: 'a.css', text: goodCss }],
    nav: [{ rel: 'nav.html', text: goodNav }],
    footer: [{ rel: 'footer.html', text: goodFooter }],
    sidebar: [{ rel: 'sidebar.html', text: goodSidebar }],
    parks: [{ rel: 'nav.html', text: goodNav }, { rel: 'footer.html', text: goodFooter }],
    __ctx: { dir, tokensText },
  })
  const swap = (files, key, rel, text) => {
    const out = JSON.parse(JSON.stringify({ css: files.css, nav: files.nav, footer: files.footer, sidebar: files.sidebar, parks: files.parks }))
    out[key] = out[key].map(f => f.rel === rel ? { rel, text } : f)
    if (key === 'nav') out.parks = out.parks.map(f => f.rel === 'nav.html' ? { rel: 'nav.html', text } : f)
    if (key === 'footer') out.parks = out.parks.map(f => f.rel === 'footer.html' ? { rel: 'footer.html', text } : f)
    out.__ctx = { dir, tokensText }
    return out
  }

  const cases = []
  const add = (id, why, files, tweak) => cases.push({ id, why, files, tweak })

  const cfgBad1 = JSON.parse(JSON.stringify(cfg)); cfgBad1.tokensSha256 = 'deadbeef'.repeat(8)
  const cfgBad2 = JSON.parse(JSON.stringify(cfg)); delete cfgBad2.tokensSha256
  add('R1', '令牌副本被偷偷改了一个值', good(), () => cfgBad1)
  add('R1', 'config 没钉 tokensSha256', good(), () => cfgBad2)
  add('R2', '本站又定义了一遍 --cinnabar', swap(good(), 'css', 'a.css', '.x{--cinnabar:#ff0000}'))
  add('R2', 'html 的 <style> 里重定义 --paper', swap(good(), 'css', 'a.css', '<style>:root{--paper:#ffffff}</style>'))
  add('R3', '把正本色抄成字面量 #c8442e', swap(good(), 'css', 'a.css', '.x{color:#c8442e}'))
  add('R3', '把正本半透明色抄成字面量', swap(good(), 'css', 'a.css', '.x{background:rgba(255,253,247,.62)}'))
  add('R4', '顶栏少了繁简钮', swap(good(), 'nav', 'nav.html', goodNav.replace('<button class="dc-lang-btn" type="button" aria-label="繁简切换" title="繁简切换">繁</button>', '')))
  add('R4', '顶栏少了明暗钮', swap(good(), 'nav', 'nav.html', goodNav.replace('<button class="dc-theme-btn" type="button" aria-label="切换深色模式"></button>', '')))
  add('R5', '繁简钮写了「繁體」两个字', swap(good(), 'nav', 'nav.html', goodNav.replace('>繁</button>', '>繁體</button>')))
  add('R5', '繁简钮写了「繁简」', swap(good(), 'nav', 'nav.html', goodNav.replace('>繁</button>', '>繁简</button>')))
  add('R5', '繁简钮的 ternary 写成了两个字', swap(good(), 'nav', 'nav.html', goodNav.replace('>繁</button>', "{{ isHant ? '簡體' : '繁體' }}</button>")))
  add('R6', '侧栏里摆了版权页', swap(good(), 'sidebar', 'sidebar.html', '<aside class="VPSidebar"><a href="/legal">版权与免责</a></aside>'))
  add('R6', '页脚里没有准确性页', swap(good(), 'footer', 'footer.html', goodFooter.replace('<a href="/accuracy">内容准确性</a>', '')))
  add('R7', '侧栏给了自己滚动条', swap(good(), 'css', 'a.css', '.VPSidebar{overflow-y:auto}'))
  add('R7', '侧栏给了 max-height（等于给它自己的滚动范围）', swap(good(), 'css', 'a.css', '.VPSidebar{max-height:calc(100vh - 64px)}'))
  add('R8', '六个乐园顺序颠倒', swap(good(), 'nav', 'nav.html', goodNav.replace('学古诗</a>', '学古诗占位</a>').replace('>首页</a>', '>连词成句</a>').replace('>连词成句</a><a href="https://handle', '>首页</a><a href="https://handle')))
  add('R8', '六个乐园少了一个', swap(good(), 'nav', 'nav.html', goodNav.replace('<a href="https://moon.diuci.com/">遗失月冕</a>', '')))
  // 词典键写法的站：坏例子 = 对照表里留着一个页面里根本没有的键
  const Q = "'"
  const dictNav = '<nav class="dc-nav">' + ['parks.home', 'parks.k12', 'parks.lian', 'parks.handle', 'parks.moon', 'parks.ink'].map(k => '<a href="https://x/">{{ t(' + Q + k + Q + ') }}</a>').join('') + '</nav>'
  const cfgBad3 = JSON.parse(JSON.stringify(cfg)); cfgBad3.localeLabels = { 'parks.home': '首页', 'parks.k12': '学古诗', 'parks.lian': '连词成句', 'parks.handle': '汉兜', 'parks.moon': '遗失月冕', 'parks.ink': '丢词大作战', 'parks.gone': '首页' }
  add('R8', '乐园词典对照表里留着一个页面里找不到的键', { ...good(), parks: [{ rel: 'nav.html', text: dictNav }] }, () => cfgBad3)

  let tried = 0, caught = 0
  for (const c of cases) {
    tried++
    const cfg2 = c.tweak ? c.tweak() : cfg
    const probs = runRule(c.id, cfg2, c.files)
    if (probs.length) caught++
    else console.error('  坏例子没抓住：' + c.id + ' ' + c.why)
  }
  // 好例子必须一条都不报，否则闸门是在瞎叫
  for (const r of RULES) {
    const probs = runRule(r.id, cfg, good())
    if (probs.length) { tried++; console.error('  好例子被误报：' + r.id + ' ' + r.title + ' → ' + probs[0]) }
  }
  if (caught !== tried) {
    console.error('[check-ui] --selftest 失败：试了 ' + tried + ' 例，抓住 ' + caught + ' 例')
    process.exit(1)
  }
  console.log('[ok] check-ui --selftest 通（当场数到 ' + tried + ' 个坏例子，全部试到）')
}

const dir = process.cwd()
const cfg = readCfg(dir)
const tokensPath = path.join(dir, cfg.tokens)
if (!fs.existsSync(tokensPath)) fail('本站没有 ' + cfg.tokens)
const tokensText = fs.readFileSync(tokensPath, 'utf8')

if (process.argv.includes('--selftest')) {
  selftest(dir, cfg, tokensText)
  process.exit(0)
}

const files = {
  css: readRegions(dir, cfg.css),
  nav: readRegions(dir, cfg.nav),
  footer: readRegions(dir, cfg.footer),
  sidebar: readRegions(dir, cfg.sidebar || []),
  parks: readRegions(dir, cfg.parkOrder),
  __ctx: { dir, tokensText },
}
let total = 0
for (const r of RULES) {
  const probs = r.fn(cfg, files)
  if (!probs.length) { console.log('  ' + r.id + ' ' + r.title + '：过'); continue }
  total += probs.length
  for (const msg of probs) console.error('  ' + r.id + ' ' + r.title + '：' + msg)
}
if (total) {
  console.error('[check-ui] 失败：' + total + ' 处不合规')
  process.exit(1)
}
console.log('[ok] check-ui 通（' + ruleCount() + ' 条规则）')
