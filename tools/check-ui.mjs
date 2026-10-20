#!/usr/bin/env node
/*
  六站共用的 UI 闸门。正本在 _deploy 仓 tools/check-ui.mjs，其余站是字节一样的副本。

  它盯的事（每一条在 --selftest 里都有坏例子）：
    R1 令牌副本必须与正本字节一致（sha256 钉在 config 里）
    R2 本站 CSS 不得重新定义正本里的同名令牌
    R3 本站 CSS 不得把正本里的色值抄成字面量
    R4 顶栏必须有明暗钮（.dc-theme-btn）
    R6 说明类页面（数据来源 / 准确性 / 版权免责）只能在页脚出现
    R7 侧栏不得有自己的滚动条
    R8 八项乐园的名字与顺序，顶栏与页脚必须一致
 R9 底部标签栏：六项齐、顺序对、无旧名（v4.1 起 6 项，月冕/大作战只在顶部菜单）
 R11 顶部菜单契约：菜单钮 + 八站面板（含月冕/大作战）
    R10 chrome 契约（v3）：六站互链禁新窗口；chrome 单源特征在位；旧形禁回流

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

rule('R4', '顶栏必须有明暗钮', (cfg, files) => {
  const problems = []
  // v4 起全站仅简体，繁简钮已从六站顶栏退场——R4 只查明暗钮这一枚。
  // nav 可能由多个片段组成（VitePress 站是 config 菜单 + 组件文件），任一片段含钮即过。
  if (!files.nav.some(f => f.text.includes(cfg.themeBtnClass))) {
    problems.push('顶栏里没有 ' + cfg.themeBtnClass + '：明暗钮是六站顶栏的必备件')
  }
  return problems
})

rule('R6', '版权与免责页必须在页脚出现', (cfg, files) => {
  const problems = []
  // v4 页脚单行化：页脚只挂 /legal 一个说明入口（sources/accuracy 从 legal 页互链）。
  for (const link of cfg.legalLinks) {
    if (!files.footer.some(f => f.text.includes(link))) {
      problems.push('页脚里没有 ' + link + '：版权与免责在页脚找不到')
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

rule('R8', '八项乐园的名字与顺序必须一致', (cfg, files) => {
  const problems = []
  const seenKeys = new Set()
  for (const { rel, text } of files.parks) {
    // v4.1：顶部菜单面板里也有八站链接——先把 dc-menu 块剥掉再抽序列，
    // 否则「乐园排 + 菜单面板」两轮八站会在顺序检查里自己打自己。
    const bare = text.replace(/<nav[^>]*dc-menu[^>]*>[\s\S]*?<\/nav>/g, '')
    const seq = []
    // 两种写法都要认：HTML 里的 <a>学古诗</a>，和 VitePress 配置里的 { text: '学古诗', link: … }
    const re = /<a\b[^>]*>([^<]{1,40})<\/a>|text:\s*'([^']{1,12})'/g
    let m
    while ((m = re.exec(bare))) {
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

rule('R9', '底部标签栏：六项齐、顺序对、无旧名', (cfg, files) => {
  const problems = []
  // 五个子站按八项乐园顺序（首页 href='/' 不含域名，主站不查它）；
  // v4.1 起底栏只有六项——月冕/大作战是全屏游戏，只从顶部菜单进（R11 查它们在菜单里）。
  // 旧名是历史包袱：连句/月光/对战/甲骨猜字 在任何 tabbar 文件里都不许再出现。
  const HOSTS = ['k12.diuci.com/', 'jiagu.diuci.com/', 'lian.diuci.com/', 'zimi.diuci.com/', 'handle.diuci.com/']
  const OLD = ['连句', '月光', '对战', '甲骨猜字']
  // v4.1：这两站只在顶部菜单（R11），底栏出现即回流
  const GONE = ['moon.diuci.com/', 'ink.diuci.com/']
  for (const { rel, text } of files.tabbar) {
    // v4.1：菜单面板也在 nav 文件里、也含 moon/ink 链接——只圈 tabbar 块本身来查。
    // 数据驱动的组件（TABS 数组在 script 里）块内没有字面量域名——那种回退全文。
    const m = text.match(/<nav[^>]*dc-tabbar[^>]*>[\s\S]*?<\/nav>/)
    const tb = (m && HOSTS.some(h => m[0].includes(h))) ? m[0] : text
    for (const g of GONE) {
      if (tb.includes(g)) problems.push(rel + ' 底栏出现了 ' + g + '（v4.1：月冕/大作战只在顶部菜单，底栏六项）')
    }
    let pos = -1
    for (const h of HOSTS) {
      const i = tb.indexOf(h, pos + 1)
      if (i < 0) { problems.push(rel + ' 缺 ' + h + ' 或顺序不对'); break }
      pos = i
    }
    // 「床前明月光」是诗原文——先剥掉再查旧名，别让李白替旧口径背锅
    const stripped = tb.replace(/明月光/g, '')
    for (const o of OLD) {
      if (stripped.includes(o)) problems.push(rel + ' 出现旧站名「' + o + '」——数据口径以 core/tabbar.json 为准')
    }
  }
  return problems
})

// R11：顶部菜单契约（PLAN-移动端导航 v4.1）。
//   小屏（≤768px）顶栏右侧一枚 dc-menu-btn，点开 dc-menu 面板——八站全在、顺序同乐园。
//   月冕/大作战是全屏游戏，底栏不摆（R9 只查六项），这个面板是它们唯一的移动端入口，
//   缺了 = 手机用户永远进不了这两站。some 语义：多 region 的站只要有一处带齐就算过
//   （VitePress 的菜单块 region 不含按钮——R4 的教训：逐 region 循环必误报）。
rule('R11', '顶部菜单契约：菜单钮 + 八站面板在位（含月冕/大作战，顺序对）', (cfg, files) => {
  const problems = []
  const LABELS = ['首页', '学古诗', '画甲骨', '连词', '猜谜', '汉兜', '月冕', '大作战']
  const inOrder = (text) => {
    let pos = -1
    for (const l of LABELS) {
      const i = text.indexOf(l, pos + 1)
      if (i < 0) return false
      pos = i
    }
    return true
  }
  const withBtn = files.nav.filter(f => f.text.includes('dc-menu-btn'))
  if (!withBtn.length) return ['nav 区没有任何文件带 dc-menu-btn（v4.1 顶部菜单契约）']
  const errs = []
  for (const { rel, text } of withBtn) {
    const m = text.match(/<nav[^>]*dc-menu[^>]*>[\s\S]*?<\/nav>/)
    if (!m) { errs.push(rel + ' 有菜单钮但没有 <nav class="dc-menu"> 面板'); continue }
    // 数据驱动的面板（v-for + {{ label }}）块内没有字面量站名——那种拿全文（MENU 数组在 script 里）验；
    // 字面量面板只验面板本身（全文里乐园排是正序，拿全文验会把乱序面板放过去）。
    // v-for 渲染的站（jiagu/lian 的 TopNav/App）根本没有字面量站名——顺序由 core/parks.json
    // 单源保证（check-core R3 钉八站有序），面板带 v-for 就算合规。
    const panelHasLabel = LABELS.some(l => m[0].includes(l))
    const dataDriven = /v-for/.test(m[0]) || /v-for/.test(text)
    if (panelHasLabel ? inOrder(m[0]) : (dataDriven || inOrder(text))) return problems
    errs.push(rel + ' 菜单面板缺站或顺序不对（应为 ' + LABELS.join('/') + '）')
  }
  return errs.length ? errs : ['nav 区找不到合规的菜单面板']
})

// R10：chrome 契约（PLAN-全站统一-v3）。
//   noBlankLinks —— 这些文件里「站内链接」不得 target="_blank"：六站互链一律当前页跳转，
//                   新开窗口 = 打断「站内切换」的手感。站内 = href 以 / 开头或含 diuci.com；
//                   GitHub 等真外链保留新窗口，不受此管。
//   mustContain —— chrome 单源的特征针：顶栏 dc-nav-in / 品牌副标 dc-brand-s /
//                   chrome.css 引用 / TabBar 接入……缺一条 = 本站又自绘了一套 chrome。
//   forbid —— 旧形状禁回流（如 B 族 30px 印章）：改值请改 core/chrome.css。
// needle 可以是字符串或字符串数组；三段都从 config 读，正本不写死任何站的文件名。
rule('R10', 'chrome 契约：互链禁新窗口、单源特征在位、旧形不回流', (cfg, files) => {
  const problems = []
  const ch = cfg.chrome || {}
  const cf = files.chromeFiles || {}
  const isInternal = (href) => /^\/(?!\/)/.test(href || '') || /diuci\.com/.test(href || '')
  for (const rel of ch.noBlankLinks || []) {
    const text = cf[rel]
    if (text == null) { problems.push('chrome.noBlankLinks 指向不存在的文件：' + rel); continue }
    const tagRe = /<a\b[^>]*>/gi
    let m
    while ((m = tagRe.exec(text))) {
      if (!/target\s*=\s*["']?_blank/i.test(m[0])) continue
      const href = (m[0].match(/href\s*=\s*["']([^"']*)["']/i) || [])[1] || ''
      if (isInternal(href)) problems.push(rel + ' 里站内链接（' + href.slice(0, 40) + '）带了 target="_blank"：六站互链一律当前页跳转（v3 站内切换手感）')
    }
  }
  for (const item of ch.mustContain || []) {
    const text = cf[item.file]
    if (text == null) { problems.push('chrome.mustContain 指向不存在的文件：' + item.file); continue }
    for (const n of [].concat(item.needle)) {
      if (!text.includes(n)) problems.push(item.file + ' 里找不到「' + n + '」：chrome 单源特征缺失')
    }
  }
  for (const item of ch.forbid || []) {
    const text = cf[item.file]
    if (text == null) { problems.push('chrome.forbid 指向不存在的文件：' + item.file); continue }
    for (const n of [].concat(item.needle)) {
      if (text.includes(n)) problems.push(item.file + ' 里出现了「' + n + '」：' + (item.why || '旧形状禁回流，改 core/chrome.css'))
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
  // v4.1：菜单面板夹具——八站顺序、顺序可换，坏例从这里造
  const MENU_HREF = { '首页': 'https://diuci.com/', '学古诗': 'https://k12.diuci.com/', '画甲骨': 'https://jiagu.diuci.com/', '连词': 'https://lian.diuci.com/', '猜谜': 'https://zimi.diuci.com/', '汉兜': 'https://handle.diuci.com/', '月冕': 'https://moon.diuci.com/', '大作战': 'https://ink.diuci.com/' }
  const menuPanel = (labels) =>
    '<nav class="dc-menu" hidden><div class="dc-menu-in">' +
    labels.map(l => '<a href="' + MENU_HREF[l] + '">' + l + '</a>').join('') +
    '</div></nav>'
  const PARK8 = ['首页', '学古诗', '画甲骨', '连词', '猜谜', '汉兜', '月冕', '大作战']
  const navLinks =
    '<a href="https://diuci.com/">首页</a><a href="https://k12.diuci.com/">学古诗</a>' +
    '<a href="https://jiagu.diuci.com/">画甲骨</a>' +
    '<a href="https://lian.diuci.com/">连词</a><a href="https://zimi.diuci.com/">猜谜</a>' +
    '<a href="https://handle.diuci.com/">汉兜</a>' +
    '<a href="https://moon.diuci.com/">月冕</a><a href="https://ink.diuci.com/">大作战</a>'
  const goodNav = [
    '<nav class="dc-nav">',
    navLinks,
    '<button class="dc-menu-btn" type="button" aria-expanded="false" aria-label="全部乐园"></button>',
    '<button class="dc-theme-btn" type="button" aria-label="切换深色模式"></button>',
    menuPanel(PARK8),
    '</nav>',
  ].join('\n')
  const goodFooter = [
    '<footer>',
    '<a href="https://diuci.com/">首页</a><a href="https://k12.diuci.com/">学古诗</a>',
    '<a href="https://jiagu.diuci.com/">画甲骨</a>',
    '<a href="https://lian.diuci.com/">连词</a><a href="https://zimi.diuci.com/">猜谜</a>',
    '<a href="https://handle.diuci.com/">汉兜</a>',
    '<a href="https://moon.diuci.com/">月冕</a><a href="https://ink.diuci.com/">大作战</a>',
    '<a href="/sources">数据来源与版权</a><a href="/accuracy">内容准确性</a><a href="/legal">版权与免责</a>',
    '</footer>',
  ].join('\n')
  const goodSidebar = '<aside class="VPSidebar"><a href="/poems/">总览</a><a href="/gaokao">高考默写</a></aside>'
  const goodCss = '.x{color:var(--cinnabar);width:var(--btn-round)}'
  // R9 的好文本：五个子站按乐园顺序（v4.1 底栏六项，首页 href='/' 不含域名不查）
  const goodTabbar = ['学古诗 k12.diuci.com/', '画甲骨 jiagu.diuci.com/', '连词 lian.diuci.com/', '猜谜 zimi.diuci.com/', '汉兜 handle.diuci.com/'].join('\n')
  const good = () => ({
    css: [{ rel: 'a.css', text: goodCss }],
    nav: [{ rel: 'nav.html', text: goodNav }],
    footer: [{ rel: 'footer.html', text: goodFooter }],
    sidebar: [{ rel: 'sidebar.html', text: goodSidebar }],
    parks: [{ rel: 'nav.html', text: goodNav }, { rel: 'footer.html', text: goodFooter }],
    tabbar: [{ rel: 'tabbar.txt', text: goodTabbar }],
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
  add('R4', '顶栏少了明暗钮', swap(good(), 'nav', 'nav.html', goodNav.replace('<button class="dc-theme-btn" type="button" aria-label="切换深色模式"></button>', '')))
  add('R6', '侧栏里摆了版权页', swap(good(), 'sidebar', 'sidebar.html', '<aside class="VPSidebar"><a href="/legal">版权与免责</a></aside>'))
  add('R6', '页脚里没有版权与免责入口', swap(good(), 'footer', 'footer.html', goodFooter.replace('<a href="/legal">版权与免责</a>', '')))
  add('R7', '侧栏给了自己滚动条', swap(good(), 'css', 'a.css', '.VPSidebar{overflow-y:auto}'))
  add('R7', '侧栏给了 max-height（等于给它自己的滚动范围）', swap(good(), 'css', 'a.css', '.VPSidebar{max-height:calc(100vh - 64px)}'))
  add('R8', '八项乐园顺序颠倒', swap(good(), 'nav', 'nav.html', goodNav.replace('学古诗</a>', '学古诗占位</a>').replace('>首页</a>', '>连词</a>').replace('>连词</a><a href="https://handle', '>首页</a><a href="https://handle')))
  add('R8', '八项乐园少了一个', swap(good(), 'nav', 'nav.html', goodNav.replace('<a href="https://moon.diuci.com/">月冕</a>', '')))
  // 词典键写法的站：坏例子 = 对照表里留着一个页面里根本没有的键
  const Q = "'"
  const dictNav = '<nav class="dc-nav">' + ['parks.home', 'parks.k12', 'parks.jiagu', 'parks.lian', 'parks.zimi', 'parks.handle', 'parks.moon', 'parks.ink'].map(k => '<a href="https://x/">{{ t(' + Q + k + Q + ') }}</a>').join('') + '</nav>'
  const cfgBad3 = JSON.parse(JSON.stringify(cfg)); cfgBad3.localeLabels = { 'parks.home': '首页', 'parks.k12': '学古诗', 'parks.jiagu': '画甲骨', 'parks.lian': '连词', 'parks.zimi': '猜谜', 'parks.handle': '汉兜', 'parks.moon': '月冕', 'parks.ink': '大作战', 'parks.gone': '首页' }
  add('R8', '乐园词典对照表里留着一个页面里找不到的键', { ...good(), parks: [{ rel: 'nav.html', text: dictNav }] }, () => cfgBad3)
  // R9 坏例：旧站名 / 缺子站 / 顺序颠倒
  add('R9', 'tabbar 出现旧站名「连句」', { ...good(), tabbar: [{ rel: 'tabbar.txt', text: goodTabbar.replace('连词 lian.diuci.com/', '连句 lian.diuci.com/') }] })
  add('R9', 'tabbar 缺 jiagu 与 zimi', { ...good(), tabbar: [{ rel: 'tabbar.txt', text: goodTabbar.split('\n').filter(l => !l.includes('jiagu') && !l.includes('zimi')).join('\n') }] })
  add('R9', 'tabbar 顺序颠倒', { ...good(), tabbar: [{ rel: 'tabbar.txt', text: goodTabbar.replace('画甲骨 jiagu.diuci.com/\n', '').replace('汉兜 handle.diuci.com/', '画甲骨 jiagu.diuci.com/\n汉兜 handle.diuci.com/') }] })
  add('R9', '底栏摆回月冕（v4.1 只许在顶部菜单）', { ...good(), tabbar: [{ rel: 'tabbar.txt', text: goodTabbar + '\n月冕 moon.diuci.com/' }] })
  // R11 坏例：菜单钮缺席 / 面板缺月冕与大作战 / 面板顺序不对
  add('R11', '顶栏没有菜单钮', swap(good(), 'nav', 'nav.html', goodNav.replace(/<button class="dc-menu-btn"[\s\S]*?<\/button>\n/, '')))
  add('R11', '菜单面板缺月冕与大作战', swap(good(), 'nav', 'nav.html', goodNav.replace(menuPanel(PARK8), menuPanel(PARK8.slice(0, 6)))))
  add('R11', '菜单面板顺序颠倒', swap(good(), 'nav', 'nav.html', goodNav.replace(menuPanel(PARK8), menuPanel(['猜谜', '汉兜', '月冕', '大作战', '首页', '学古诗', '画甲骨', '连词']))))
  // R10 坏例：新窗口回流 / 特征缺失 / 旧形回流 / config 指空文件
  add('R10', '互链带了 target="_blank"', { ...good(), chromeFiles: { 'nav.vue': '<a href="https://k12.diuci.com/" target="_blank">学古诗</a>' } }, () => ({ ...cfg, chrome: { noBlankLinks: ['nav.vue'] } }))
  add('R10', '顶栏缺 dc-nav-in 特征', { ...good(), chromeFiles: { 'nav.vue': '<nav class="dc-nav"></nav>' } }, () => ({ ...cfg, chrome: { mustContain: [{ file: 'nav.vue', needle: 'dc-nav-in' }] } }))
  add('R10', '旧 B 族印章 30px 回流', { ...good(), chromeFiles: { 'nav.vue': '.dc-seal{width:30px}' } }, () => ({ ...cfg, chrome: { forbid: [{ file: 'nav.vue', needle: 'width:30px', why: '印章尺寸以 chrome.css 为准' }] } }))
  add('R10', 'chrome.mustContain 指向不存在的文件', good(), () => ({ ...cfg, chrome: { mustContain: [{ file: 'nope.vue', needle: 'x' }] } }))

  let tried = 0, caught = 0
  for (const c of cases) {
    tried++
    const cfg2 = c.tweak ? c.tweak() : cfg
    const probs = runRule(c.id, cfg2, c.files)
    if (probs.length) caught++
    else console.error('  坏例子没抓住：' + c.id + ' ' + c.why)
  }
  // R10 豁免口径也要被试到：GitHub 外链带 _blank 是合法的，不许报
  const extProbs = runRule('R10', { ...cfg, chrome: { noBlankLinks: ['ext.vue'] } },
    { ...good(), chromeFiles: { 'ext.vue': '<a href="https://github.com/diuci/x" target="_blank">GitHub</a>' } })
  if (extProbs.length) { tried++; console.error('  好例子被误报：R10 外链 _blank 不该报 → ' + extProbs[0]) }
  // 好例子必须一条都不报，否则闸门是在瞎叫。
  // R10 读的是磁盘上的 chrome 契约文件（不走 good() 夹具）——好例跑真实文件；
  // 本站真的缺特征时这里会如实报出来，那正是闸门该叫的时候。
  const chCfg = cfg.chrome || {}
  const chromeRels = new Set(chCfg.noBlankLinks || [])
  for (const x of chCfg.mustContain || []) chromeRels.add(x.file)
  for (const x of chCfg.forbid || []) chromeRels.add(x.file)
  const realChrome = {}
  for (const rel of chromeRels) {
    const p = path.join(dir, rel)
    realChrome[rel] = fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null
  }
  for (const r of RULES) {
    const fixture = good()
    if (r.id === 'R10') fixture.chromeFiles = realChrome
    const probs = runRule(r.id, cfg, fixture)
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
  tabbar: (cfg.tabbarFiles || []).map((rel) => {
    const p = path.join(dir, rel)
    if (!fs.existsSync(p)) fail('config 的 tabbarFiles 指向不存在的文件：' + rel)
    return { rel, text: fs.readFileSync(p, 'utf8') }
  }),
  __ctx: { dir, tokensText },
}
// R10 的 chrome 契约文件：按 config 收集，缺文件记 null（规则里报「指向不存在」）
{
  const ch = cfg.chrome || {}
  const rels = new Set(ch.noBlankLinks || [])
  for (const x of ch.mustContain || []) rels.add(x.file)
  for (const x of ch.forbid || []) rels.add(x.file)
  files.chromeFiles = {}
  for (const rel of rels) {
    const p = path.join(dir, rel)
    files.chromeFiles[rel] = fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null
  }
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
