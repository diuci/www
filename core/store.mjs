// core/store.mjs —— 状态工厂正本（PLAN-全站统一-v2 §3.1）。
//
// 把 jiagu 实抓的响应式断裂教训固化成唯一的开箱即用形态（2026-10-20）：
//   * state 必须 reactive —— 写入穿代理才触发渲染；readonly(普通对象) 是
//     反模式，写入走裸对象，状态变了 DOM 永不更新（暗伤几个月才发现）
//   * 对外暴露 readonly 视图 —— 组件只读，防手抖改状态
//   * raw —— dev hook / 冒烟测试用：代理对象经浏览器序列化会把数组变成
//     {0:…} 对象，hook 必须给 toRaw 后的裸对象
//
// 用法：
//   const { state, store, raw } = createStore({ answered: false, choices: [] })
//   state.answered = true      // 组件里写：走 reactive 代理，触发渲染
//   store.choices              // 模板里读：readonly 视图
//   window.__dev = { store: raw }  // 冒烟测试 hook：活状态 + 保数组性

import { reactive, readonly, toRaw } from 'vue'

export function createStore(initial) {
  const state = reactive(initial)
  return { state, store: readonly(state), raw: toRaw(state) }
}

export function selftest() {
  const problems = []
  const { state, store, raw } = createStore({
    answered: false,
    choices: ['甲', '乙', '丙'],
  })
  // 写入必须穿 reactive（数组也是响应式的）
  state.answered = true
  state.choices.push('丁')
  if (state.answered !== true) problems.push('reactive state 写入不生效')
  if (state.choices.length !== 3 + 1) problems.push('reactive 数组写入不生效')
  // readonly 视图必须同步可见（同一代理链），且写不进去——
  // Vue 的 readonly 写入是 dev 警告 + 静默失败（不抛异常），所以断言「值不变」
  if (store.answered !== true) problems.push('readonly 视图没同步到写入')
  try { store.answered = false } catch { /* node 下可能不警告，无所谓 */ }
  if (store.answered !== true) problems.push('readonly 视图竟然可写（防手抖失效）')
  // raw 必须是活状态（同一 target）：写入可见，且可 JSON 序列化保数组性
  if (raw.answered !== true) problems.push('raw 不是活状态')
  if (raw.choices.length !== 4) problems.push('raw 数组不同步')
  if (JSON.stringify(raw.choices) !== '["甲","乙","丙","丁"]') problems.push('raw 序列化丢数组性')
  return problems
}
