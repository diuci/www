#!/usr/bin/env node
// check-core.mjs —— 统一核心闸门正本（PLAN-全站统一-v2 §3.1）。
//
// 与 check-ui 同构：正本在 _deploy/core/，各站经 tools/sync-core.mjs 拷贝，
// 本闸门在各站跑，钉三件事：
//   R1 拷贝与正本 sha256 一致（daily/theme/store/tabbar 四件逐件钉）
//   R2 core 自检全过（daily 确定性/冻结、theme 片段、store 响应式——正本带的坏例自检）
//   R3 tabbar.json 结构完整（八站、顺序、href 域名、key/label/paths 齐全）
//
// 各站 config：core.config.json { "core": { "<文件名>": "<sha256>" } }，
// 由 tools/sync-core.mjs 写出——sync 与检查用同一份钉值，不会打自己。
//
// 用法：node tools/check-core.mjs [--selftest]

import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const CORE_FILES = ['daily.mjs', 'theme.mjs', 'store.mjs', 'tabbar.json']

function fail(msg) {
  console.error('[check-core] ' + msg)
  process.exit(1)
}

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex')
}

// 哈希前归一 LF：工作区行尾无关紧要，入库字节（.gitattributes 归一成 LF）才是
// 唯一事实——否则 Windows 本地绿、CI 红（zimi 首次 CI 实抓）。
function sha256Norm(p) {
  return sha256(Buffer.from(fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n'), 'utf8'))
}

function readCfg(dir) {
  const p = path.join(dir, 'tools', 'core.config.json')
  if (!fs.existsSync(p)) fail('没有 tools/core.config.json：先跑 node tools/sync-core.mjs')
  return JSON.parse(fs.readFileSync(p, 'utf8'))
}

// ---- R2：core 自检（直接 import 拷贝件跑——拷的哪份验哪份） ----
async function runCoreSelftests(dir) {
  const daily = await import(pathToFileUrl(path.join(dir, 'core', 'daily.mjs')))
  const theme = await import(pathToFileUrl(path.join(dir, 'core', 'theme.mjs')))
  const problems = [...daily.selftest(), ...theme.selftest()]
  return problems.map((p) => 'core 自检：' + p)
}

function pathToFileUrl(p) {
  return 'file:///' + p.replace(/\\/g, '/').replace(/^\/+/, '')
}

// store.mjs 依赖 vue（node 下 import 会拉 vue 包）；有 node_modules 就验，没有跳过并在 R1 兜底
async function runStoreSelftest(dir) {
  try {
    const store = await import(pathToFileUrl(path.join(dir, 'core', 'store.mjs')))
    return store.selftest().map((p) => 'core 自检：' + p)
  } catch (e) {
    console.log('  store 自检跳过（无 vue 可用）：' + e.message.split('\n')[0])
    return []
  }
}

// ---- R3：tabbar 结构 ----
// 规范八站：顺序 + 域名 + 简体名（与 check-ui R8 八项乐园同源同序）
const WANT_TABS = [
  ['diuci.com', '首页'], ['k12.diuci.com', '学古诗'], ['jiagu.diuci.com', '画甲骨'],
  ['lian.diuci.com', '连词'], ['zimi.diuci.com', '猜谜'], ['handle.diuci.com', '汉兜'],
  ['moon.diuci.com', '月冕'], ['ink.diuci.com', '大作战'],
]

function checkTabbar(tabbar) {
  const problems = []
  const tabs = tabbar.tabs || []
  if (tabs.length !== WANT_TABS.length) problems.push('tabs 是 ' + tabs.length + ' 站，规范八站')
  tabs.forEach((t, i) => {
    const [host, label] = WANT_TABS[i] || ['', '']
    if (!t.href || !t.href.includes(host)) problems.push('第 ' + (i + 1) + ' 项应是 ' + host + '，实得 ' + t.href)
    if (t.label !== label) problems.push('第 ' + (i + 1) + ' 项 label 应为「' + label + '」，实得「' + t.label + '」')
    if (!t.key || !t.key.startsWith('tabbar.')) problems.push('第 ' + (i + 1) + ' 项缺词典 key')
    if (!Array.isArray(t.paths) || !t.paths.length || t.paths.some((d) => typeof d !== 'string' || !d.length)) {
      problems.push('第 ' + (i + 1) + ' 项 SVG paths 缺失或非法')
    }
  })
  return problems
}

function selftest() {
  const problems = []
  // 坏例：R3 的三条毒
  const bad1 = checkTabbar({ tabs: [{ href: 'https://x/', key: 'tabbar.x', label: '首页', paths: ['M0 0'] }] })
  if (!bad1.length) problems.push('坏例：八站缺七站没被抓')
  const bad2 = checkTabbar({
    tabs: WANT_TABS.map((h, i) => ({ href: 'https://' + h[0] + '/', key: 'tabbar.' + i, label: h[1], paths: ['M0 0'] }))
      .map((t, i) => (i === 2 ? { ...t, label: '甲骨猜字' } : t)),
  })
  if (!bad2.length) problems.push('坏例：旧站名（甲骨猜字）没被抓')
  const good = checkTabbar(JSON.parse(fs.readFileSync(path.join(HERE, '..', 'core', 'tabbar.json'), 'utf8')))
  if (good.length) problems.push('好例被误报：' + good[0])
  return problems
}

// ---- R4：入口首帧定色脚本 ----
// 各站 config 的 entries 列出带内联首帧脚本的 html（相对站根）。
// 不比字节（各站 head 结构不同），钉特征三件套：统一 key + 系统偏好判定 + data-theme。
// 缺任一件 = 暗色用户闪白屏（规范 §4）。
function checkEntries(dir, cfg) {
  const problems = []
  for (const rel of cfg.entries || []) {
    const p = path.join(dir, rel)
    if (!fs.existsSync(p)) { problems.push('entries 指向的文件不存在：' + rel); continue }
    const html = fs.readFileSync(p, 'utf8')
    if (!html.includes("'dc-theme'") && !html.includes('"dc-theme"')) {
      problems.push(rel + ' 首帧脚本没用统一主题 key（dc-theme）——换上 core/theme 的 BOOTSTRAP')
    }
    if (!html.includes('matchMedia')) problems.push(rel + ' 首帧脚本丢了系统偏好判定（暗色用户闪白）')
    if (!html.includes('data-theme')) problems.push(rel + ' 首帧脚本没设 data-theme')
  }
  return problems
}

async function run(dir) {
  const cfg = readCfg(dir)
  const problems = []
  // R1
  for (const f of CORE_FILES) {
    const p = path.join(dir, 'core', f)
    if (!fs.existsSync(p)) { problems.push('缺 core/' + f + '：sync 没跑？'); continue }
    const got = sha256Norm(p)
    const want = (cfg.core || {})[f]
    if (!want) { problems.push(f + ' 没钉 sha256（config 是 sync 写的，别手改）'); continue }
    if (got !== want) problems.push('core/' + f + ' 与正本不是同一份字节（got ' + got.slice(0, 10) + '…）——重跑 sync-core')
  }
  // R2
  if (!problems.length) {
    problems.push(...(await runCoreSelftests(dir)))
    problems.push(...(await runStoreSelftest(dir)))
  }
  // R3
  const tb = path.join(dir, 'core', 'tabbar.json')
  if (fs.existsSync(tb)) {
    try { problems.push(...checkTabbar(JSON.parse(fs.readFileSync(tb, 'utf8')))) }
    catch (e) { problems.push('tabbar.json 解析失败：' + e.message) }
  }
  // R4
  problems.push(...checkEntries(dir, cfg))
  if (problems.length) {
    for (const p of problems) console.error('[check-core] ' + p)
    console.error('[check-core] 失败：' + problems.length + ' 处')
    return 1
  }
  console.log('[ok] check-core 通：四件拷贝与正本字节一致，自检全过，tabbar 八站齐，入口首帧定色齐')
  return 0
}

const isEntry = process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('tools/check-core.mjs')
if (isEntry) {
  if (process.argv.includes('--selftest')) {
    process.exit(selftest().length ? (console.error('[check-core] selftest FAILED'), 1) : (console.log('[ok] check-core --selftest 通'), 0))
  } else {
    run(process.cwd()).then((code) => process.exit(code))
  }
}
