#!/usr/bin/env node
/*
  跨仓令牌比对（只在本地跑）：四仓的 tokens.css 必须与正本字节一致。

  为什么各站自己的 check-ui 不够：那道闸门比的是「本站副本 vs 本站 config 里钉的 sha256」。
  如果正本改了、四仓的钉值还停在旧哈希，四道闸门照样全绿——四站一起停在旧配色上，
  谁都不报错。这一条比的是文件本身，正本一变它就说话。

  CI 里跑不了：主站的 CI 只 clone 主站，看不见别的仓。跑不了就别假装跑过——它挂在本地链条里。
*/
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

const CANON = 'ui/tokens.css'
const SIBLINGS = [
  ['学古诗 k12-site', '../k12-site/site/.vitepress/theme/tokens.css'],
  ['汉兜 handle-site', '../handle-site/src/styles/tokens.css'],
  ['连词成句 lian-site', '../lian-site/src/styles/tokens.css'],
]
function sha(buf) { return crypto.createHash('sha256').update(buf).digest('hex') }

function compare(canonicalText, copies) {
  const problems = []
  const want = sha(Buffer.from(canonicalText, 'utf8'))
  for (const [name, rel, text] of copies) {
    if (text === null) { problems.push(name + ' 没有令牌副本（' + rel + '）：四站共用一套令牌，少一站就是分叉'); continue }
    const got = sha(Buffer.from(text, 'utf8'))
    if (got !== want) {
      problems.push(name + ' 的 tokens.css 与正本不是同一份字节：正本 ' + want.slice(0, 12) + ' / 本站 ' + got.slice(0, 12))
      const a = canonicalText.split('\n'), b = text.split('\n')
      let shown = 0
      for (let i = 0; i < Math.max(a.length, b.length) && shown < 3; i++) {
        if (a[i] !== b[i]) { problems.push('    第 ' + (i + 1) + ' 行：正本「' + (a[i] ?? '').trim() + '」/ 本站「' + (b[i] ?? '').trim() + '」'); shown++ }
      }
    }
  }
  return problems
}

function selftest() {
  const good = ':root{--cinnabar:#c8442e}\n'
  const cases = [
    ['副本被改了一个色值', [ ['学古诗', 'a', ':root{--cinnabar:#ff0000}\n'], ['汉兜', 'b', good], ['连句', 'c', good] ]],
    ['副本少了一行', [ ['学古诗', 'a', ''], ['汉兜', 'b', good], ['连句', 'c', good] ]],
    ['副本干脆没有', [ ['学古诗', 'a', null], ['汉兜', 'b', good], ['连句', 'c', good] ]],
    ['副本多了本站私货', [ ['学古诗', 'a', good + '.x{--cinnabar:#000}\n'], ['汉兜', 'b', good], ['连句', 'c', good] ]],
  ]
  let tried = 0, caught = 0
  for (const [why, copies] of cases) {
    tried++
    const probs = compare(good, copies)
    if (probs.length) caught++
    else console.error('  坏例子没抓住：' + why)
  }
  const goodProbs = compare(good, [['学古诗', 'a', good], ['汉兜', 'b', good], ['连句', 'c', good]])
  if (goodProbs.length) { tried++; console.error('  好例子被误报 → ' + goodProbs[0]) }
  if (caught !== tried) { console.error('[check-tokens-sync] --selftest 失败：试了 ' + tried + ' 例，抓住 ' + caught + ' 例'); process.exit(1) }
  console.log('[ok] check-tokens-sync --selftest 通（当场数到 ' + tried + ' 个坏例子，全部试到）')
}

if (process.argv.includes('--selftest')) { selftest(); process.exit(0) }

const canonPath = path.resolve(CANON)
if (!fs.existsSync(canonPath)) { console.error('[check-tokens-sync] 找不到正本 ' + CANON); process.exit(1) }
const canonicalText = fs.readFileSync(canonPath, 'utf8')
const copies = SIBLINGS.map(([name, rel]) => {
  const abs = path.resolve(rel)
  return [name, rel, fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : null]
})
const missing = copies.filter(c => c[2] === null)
if (missing.length === copies.length) {
  console.error('[check-tokens-sync] 三个兄弟仓都读不到——这一条只在四仓并排的本地工作区跑（CI 里没有兄弟仓）')
  console.error('  找过：' + copies.map(c => path.resolve(c[1])).join(' ; '))
  process.exit(1)
}
const problems = compare(canonicalText, copies)
console.log('正本 ' + sha(Buffer.from(canonicalText, 'utf8')).slice(0, 12) + '（' + Buffer.byteLength(canonicalText) + ' 字节）')
for (const [name, rel, text] of copies) {
  if (text === null) { console.log('  ' + name + '：没有副本'); continue }
  console.log('  ' + name + '：' + sha(Buffer.from(text, 'utf8')).slice(0, 12) + (sha(Buffer.from(text, 'utf8')) === sha(Buffer.from(canonicalText, 'utf8')) ? ' 一致' : ' 不一致'))
}
if (problems.length) {
  for (const p of problems) console.error('  ' + p)
  console.error('[check-tokens-sync] 失败：' + problems.length + ' 处不一致')
  process.exit(1)
}
console.log('[ok] check-tokens-sync 通：四站令牌是同一份字节')
