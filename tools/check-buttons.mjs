#!/usr/bin/env node
/*
  四站圆钮实测闸门（规范 §2 §3）：真的开浏览器量顶栏那两枚钮。

  静态闸门（check-ui.mjs R4/R5）盯的是「类名在不在、文案是不是单字」；
  这一条盯的是摆出来的样子：繁简钮在明暗钮左边、两枚同尺寸、正圆、
  桌面 38px、窄屏 34px。用户点名的就是「放在明暗切换边上，同样类似的样子」。

  只在本地跑：CI 里没有 Chrome，也没有兄弟仓。跑不了就别假装跑过。
  每个规则都配坏例子（--selftest）；空过的检查比没有检查更危险。
*/
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'

const SITES = [
  ['主站 diuci.com', '.', 18792],
  ['学古诗 k12.diuci.com', '../k12-site/site/.vitepress/dist', 18791],
  ['汉兜 handle.diuci.com', '../handle-site/dist', 18793],
  ['连词成句 lian.diuci.com', '../lian-site/dist', 18794],
]
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.txt': 'text/plain' }
const VIEWPORTS = [{ width: 1180, height: 900, want: 38 }, { width: 390, height: 780, want: 34 }]

/* 纯函数：判定不依赖浏览器，坏例子直接喂进来 */
export function buttonProblems(geo, want) {
  const problems = []
  if (!geo) { problems.push('顶栏没有量到圆钮'); return problems }
  if (!geo.lang) problems.push('顶栏没有繁简钮 .dc-lang-btn')
  if (!geo.theme) problems.push('顶栏没有明暗钮 .dc-theme-btn')
  if (geo.lang && geo.theme) {
    if (geo.lang.x >= geo.theme.x)
      problems.push('繁简钮不在明暗钮左边：繁简 x=' + Math.round(geo.lang.x) + ' / 明暗 x=' + Math.round(geo.theme.x))
    if (Math.abs(geo.lang.w - geo.theme.w) > 0.5 || Math.abs(geo.lang.h - geo.theme.h) > 0.5)
      problems.push('两枚圆钮尺寸不同：繁简 ' + geo.lang.w + '×' + geo.lang.h + ' / 明暗 ' + geo.theme.w + '×' + geo.theme.h)
  }
  for (const [name, b] of [['繁简钮', geo.lang], ['明暗钮', geo.theme]]) {
    if (!b) continue
    if (Math.abs(b.w - want) > 0.5 || Math.abs(b.h - want) > 0.5)
      problems.push(name + '不是 ' + want + 'px 见方：实测 ' + b.w + '×' + b.h)
    if (b.radius === null) problems.push(name + '读不到 border-radius')
    else if (b.radius !== '50%' && Math.abs(parseFloat(b.radius) - want / 2) > 1)
      problems.push(name + '不是正圆：border-radius=' + b.radius)
  }
  const label = ((geo.lang && geo.lang.text) || '').trim()
  if (geo.lang && label !== '繁' && label !== '简')
    problems.push('繁简钮的文案必须是单字「繁」或「简」，现在是「' + label + '」')
  return problems
}

function selftest() {
  const good = { lang: { x: 900, w: 38, h: 38, radius: '50%', text: '繁' }, theme: { x: 940, w: 38, h: 38, radius: '50%', text: '' } }
  // 每一例自己说清「这一例该按哪一档尺寸要求」：窄屏那一例的期望是 34px
  const cases = [
    ['繁简钮跑到明暗钮右边', { lang: { x: 980, w: 38, h: 38, radius: '50%', text: '繁' }, theme: { x: 940, w: 38, h: 38, radius: '50%', text: '' } }, 38],
    ['两枚钮尺寸不一样', { lang: { x: 900, w: 30, h: 30, radius: '50%', text: '繁' }, theme: { x: 940, w: 38, h: 38, radius: '50%', text: '' } }, 38],
    ['窄屏没缩到 34px', { lang: { x: 300, w: 38, h: 38, radius: '50%', text: '繁' }, theme: { x: 340, w: 38, h: 38, radius: '50%', text: '' } }, 34],
    ['钮不是正圆（圆角被改成方的）', { lang: { x: 900, w: 38, h: 38, radius: '6px', text: '繁' }, theme: { x: 940, w: 38, h: 38, radius: '50%', text: '' } }, 38],
    ['文案写成「繁體」两个字', { lang: { x: 900, w: 38, h: 38, radius: '50%', text: '繁體' }, theme: { x: 940, w: 38, h: 38, radius: '50%', text: '' } }, 38],
    ['繁简钮干脆没有', { theme: { x: 940, w: 38, h: 38, radius: '50%', text: '' } }, 38],
    ['明暗钮干脆没有', { lang: { x: 900, w: 38, h: 38, radius: '50%', text: '繁' } }, 38],
  ]
  let tried = 0, caught = 0
  for (const [why, geo, want] of cases) {
    tried++
    const probs = buttonProblems(geo, want)
    if (probs.length) caught++
    else console.error('  坏例子没抓住：' + why)
  }
  const goodProbs = buttonProblems(good, 38)
  if (goodProbs.length) { tried++; console.error('  好例子被误报 → ' + goodProbs[0]) }
  const goodNarrow = buttonProblems({ lang: { x: 300, w: 34, h: 34, radius: '50%', text: '简' }, theme: { x: 340, w: 34, h: 34, radius: '50%', text: '' } }, 34)
  if (goodNarrow.length) { tried++; console.error('  窄屏好例子被误报 → ' + goodNarrow[0]) }
  if (caught !== tried) { console.error('[check-buttons] --selftest 失败：试了 ' + tried + ' 例，抓住 ' + caught + ' 例'); process.exit(1) }
  console.log('[ok] check-buttons --selftest 通（当场数到 ' + tried + ' 个坏例子，全部试到）')
}

if (process.argv.includes('--selftest')) { selftest(); process.exit(0) }

function serve(dir, port) {
  const root = path.resolve(dir)
  if (!fs.existsSync(root)) return null
  const s = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0])
    if (p.endsWith('/')) p += 'index.html'
    const f = path.join(root, p)
    if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('nope'); return }
    res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' })
    res.end(fs.readFileSync(f))
  })
  return new Promise(r => s.listen(port, '127.0.0.1', () => r(s)))
}

let puppeteer
try { puppeteer = (await import('puppeteer-core')).default }
catch { console.error('[check-buttons] 主站没有 puppeteer-core：npm i -D puppeteer-core'); process.exit(1) }
const CHROME = ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'].find(c => fs.existsSync(c))
if (!CHROME) { console.error('[check-buttons] 找不到 Chrome/Edge'); process.exit(1) }

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage'] })
const problems = []
let measured = 0
for (const [name, dir, port] of SITES) {
  const server = await serve(dir, port)
  if (!server) { problems.push(name + ' 没有构建产物（' + path.resolve(dir) + '）：先构建再跑这条闸门'); continue }
  for (const vp of VIEWPORTS) {
    const page = await browser.newPage()
    await page.setRequestInterception(true)
    page.on('request', r => (/fonts\.(googleapis|gstatic)\.com/.test(r.url()) ? r.abort() : r.continue()))
    await page.setViewport({ width: vp.width, height: vp.height })
    const resp = await page.goto('http://127.0.0.1:' + port + '/', { waitUntil: 'domcontentloaded', timeout: 30000 })
    if (resp.status() !== 200) { problems.push(name + '（' + vp.width + 'px）首页 HTTP ' + resp.status()); await page.close(); continue }
    await new Promise(r => setTimeout(r, 900))
    const geo = {}
    for (const [key, sel] of [['lang', '.dc-lang-btn'], ['theme', '.dc-theme-btn']]) {
      const el = await page.$(sel)
      if (!el) continue
      const box = await el.boundingBox()
      if (!box) continue
      geo[key] = {
        x: box.x, w: box.width, h: box.height,
        radius: await el.evaluate(n => getComputedStyle(n).borderRadius),
        text: (await el.evaluate(n => n.textContent)) || '',
      }
    }
    measured++
    for (const p of buttonProblems(geo, vp.want)) problems.push(name + '（' + vp.width + 'px）：' + p)
    await page.close()
  }
  server.close()
}
await browser.close()
console.log('（量了 ' + measured + ' 次顶栏）')
if (problems.length) {
  for (const p of problems) console.error('  ' + p)
  console.error('[check-buttons] 失败：' + problems.length + ' 处不合规')
  process.exit(1)
}
console.log('[ok] check-buttons 通：四站顶栏两枚圆钮同尺寸、正圆、繁简在明暗左边')
