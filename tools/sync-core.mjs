#!/usr/bin/env node
// sync-core.mjs —— 统一核心分发脚本正本（PLAN-全站统一-v2 §3.1）。
//
// 与 tokens/check-ui 的模式相同：正本住 _deploy/core/，各站住拷贝。
// 本脚本只在本地跑（_deploy 与各站平级检出时）；CI 不跑 sync，只跑
// check-core.mjs 钉「拷贝 = 上次 sync 时的正本字节」。
//
// 用法（在各站根目录）：
//   node tools/sync-core.mjs           # 拷贝四件 + 重写 tools/core.config.json
//   node tools/sync-core.mjs --check   # 只验证不写（CI 外的本地自检）

import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..')
const DEPLOY = process.env.DEPLOY_ROOT || path.resolve(ROOT, '..', '_deploy')
const SRC = path.join(DEPLOY, 'core')
const DST = path.join(ROOT, 'core')
const CORE_FILES = ['daily.mjs', 'theme.mjs', 'store.mjs', 'tabbar.json', 'parks.json', 'chrome.css']

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex')
}

if (!fs.existsSync(path.join(SRC, 'daily.mjs'))) {
  console.error('[sync-core] 找不到正本：' + SRC + '（_deploy 与本站须平级检出，或设 DEPLOY_ROOT）')
  process.exit(1)
}

if (process.argv.includes('--check')) {
  const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'core.config.json'), 'utf8'))
  const bad = []
  for (const f of CORE_FILES) {
    const got = sha256(fs.readFileSync(path.join(DST, f)))
    if (got !== (cfg.core || {})[f]) bad.push(f)
  }
  if (bad.length) { console.error('[sync-core] 拷贝与钉值不一致：' + bad.join(',')); process.exit(1) }
  console.log('[ok] sync-core --check：四件与钉值一致')
  process.exit(0)
}

fs.mkdirSync(DST, { recursive: true })
const cfg = { core: {} }
// 写拷贝与算哈希都用归一后的 LF 字节：Windows 工作区可能是 CRLF，git 入库按
// .gitattributes 归一成 LF——不归一的话本地钉的是 CRLF 哈希，CI checkout 出
// LF 版，R1 必红（zimi 首次 CI 实抓）。
const norm = (buf) => Buffer.from(buf.toString('utf8').replace(/\r\n/g, '\n'), 'utf8')
for (const f of CORE_FILES) {
  const buf = norm(fs.readFileSync(path.join(SRC, f)))
  fs.writeFileSync(path.join(DST, f), buf)
  cfg.core[f] = sha256(buf)
  console.log('[sync-core] ' + f + ' → core/（' + sha256(buf).slice(0, 10) + '…）')
}
// entries 是站特有配置（各站自己的入口 html 列表），sync 不得覆盖——重写时沿用
const cfgPath = path.join(ROOT, 'tools', 'core.config.json')
if (fs.existsSync(cfgPath)) {
  const prev = JSON.parse(fs.readFileSync(cfgPath, 'utf8'))
  if (Array.isArray(prev.entries)) cfg.entries = prev.entries
}
fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2) + '\n', 'utf8')
console.log('[ok] 已写 ' + path.relative(ROOT, cfgPath) + (cfg.entries ? '（entries 沿用 ' + cfg.entries.length + ' 项）' : ''))
