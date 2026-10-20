// core/theme.mjs —— 明暗切换机械件正本（PLAN-全站统一-v2 §3.1）。
//
// 与 tokens.css 的 data-theme / .dark 约定配套：
//   - localStorage key「dc-theme」存 'light' | 'dark'
//   - html 元素挂 data-theme 属性 + dark/light class（dark: 变体用）
//   - meta theme-color 同步（暗 #17140f / 亮 #f4ede0）
//
// 两件东西：
//   1. THEME_BOOTSTRAP —— 首帧内联脚本（index.html 里用）。必须在 CSS 之前
//      执行：暗色用户不闪白屏（规范 §4）。以前这段每站手抄一份，现在唯一来源。
//   2. initTheme()/setTheme()/toggleTheme() —— 运行时切换（顶栏按钮用）。

export const THEME_KEY = 'dc-theme'
export const THEME_COLORS = { dark: '#17140f', light: '#f4ede0' }
// v4：主题存 cookie（domain=.diuci.com）——子站与主站共享，切一次全站跟着变。
// localStorage 子域不共享，只读一次作迁移：老用户已选的主题迁进 cookie 后即弃。
export const THEME_COOKIE = 'dc-theme'

export function readCookie(name) {
  const hit = document.cookie.split(/;\s*/).find(c => c.startsWith(name + '='))
  return hit ? decodeURIComponent(hit.slice(name.length + 1)) : null
}

export function writeCookie(mode) {
  document.cookie = THEME_COOKIE + '=' + mode + ';domain=.diuci.com;path=/;max-age=31536000;SameSite=Lax'
}

/** 三级判定：cookie > localStorage（迁移一次） > 系统偏好。 */
export function detectTheme() {
  let mode = null
  try { mode = readCookie(THEME_COOKIE) } catch (e) {}
  if (mode !== 'dark' && mode !== 'light') {
    try { mode = localStorage.getItem(THEME_KEY) } catch (e) {}
    if (mode === 'dark' || mode === 'light') { try { writeCookie(mode) } catch (e) {} }
    else mode = null
  }
  if (mode !== 'dark' && mode !== 'light')
    mode = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  return mode
}

/** 首帧内联脚本：构建时插进 index.html（<head> 里、样式表之前）。必须在 CSS 之前
 *  执行：暗色用户不闪白屏（规范 §4）。以前这段每站手抄一份，现在唯一来源。
 *  含 MutationObserver：任何代码切主题（改 data-theme）都同步地址栏色。 */
export const THEME_BOOTSTRAP = `;(function () {
  var t = document.documentElement
  var m = document.querySelector('meta[name="theme-color"]')
  function rc(n) { var h = document.cookie.split(/;\\s*/).find(function(c){return c.indexOf(n+'=')===0}); return h ? h.slice(n.length+1) : null }
  function wc(v) { document.cookie = '${THEME_COOKIE}=' + v + ';domain=.diuci.com;path=/;max-age=31536000;SameSite=Lax' }
  var mode = rc('${THEME_COOKIE}')
  if (mode !== 'dark' && mode !== 'light') {
    try { mode = localStorage.getItem('${THEME_KEY}') } catch (e) {}
    if (mode === 'dark' || mode === 'light') { try { wc(mode) } catch (e) {} }
    else mode = null
  }
  if (mode !== 'dark' && mode !== 'light')
    mode = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  t.setAttribute('data-theme', mode)
  t.classList.toggle('dark', mode === 'dark')
  t.classList.toggle('light', mode === 'light')
  var sync = function () { if (m) m.setAttribute('content', t.getAttribute('data-theme') === 'dark' ? '${THEME_COLORS.dark}' : '${THEME_COLORS.light}') }
  sync()
  if (m && window.MutationObserver) new MutationObserver(sync).observe(t, { attributes: true, attributeFilter: ['data-theme'] })
})();`

function apply(mode) {
  const t = document.documentElement
  t.setAttribute('data-theme', mode)
  t.classList.toggle('dark', mode === 'dark')
  t.classList.toggle('light', mode === 'light')
  const m = document.querySelector('meta[name="theme-color"]')
  if (m) m.setAttribute('content', THEME_COLORS[mode] || THEME_COLORS.light)
}

/** 运行时初始化：与首帧脚本同一判定（cookie > localStorage 迁移 > 系统偏好）。 */
export function initTheme() {
  const mode = detectTheme()
  apply(mode)
  return mode
}

export function currentTheme() {
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'
}

export function setTheme(mode) {
  if (mode !== 'dark' && mode !== 'light') return currentTheme()
  try { writeCookie(mode) } catch (e) {}
  apply(mode)
  return mode
}

export function toggleTheme() {
  return setTheme(currentTheme() === 'dark' ? 'light' : 'dark')
}

/** 自检：BOOTSTRAP 里不能出现反引号嵌套问题；函数在无 DOM 环境不炸（node 下跳过 DOM 断言）。 */
export function selftest() {
  const problems = []
  if (THEME_BOOTSTRAP.includes('`')) problems.push('BOOTSTRAP 里出现反引号：插进 index.html 会碎')
  if (!THEME_BOOTSTRAP.includes(THEME_KEY)) problems.push('BOOTSTRAP 没用统一 key')
  if (!THEME_BOOTSTRAP.includes('matchMedia')) problems.push('BOOTSTRAP 丢了系统偏好判定（暗色用户会闪白）')
  return problems
}
