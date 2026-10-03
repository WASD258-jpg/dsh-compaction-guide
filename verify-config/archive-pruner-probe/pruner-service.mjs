// 实测：插件能否真正取到 toolResultPruner 服务并调用它？
// 这是路径 B 成立与否的分水岭 —— 必须实测，不能读源码推断。

import { Context } from '@deepseek-ai/cordis'
import ToolResultPruner from '@deepseek-ai/dsh-compaction-tool-result-pruner'

console.log('=== 1. pruner 插件的导出形态 ===')
console.log('  默认导出类型:', typeof ToolResultPruner)
console.log('  具名导出:', Object.keys(await import('@deepseek-ai/dsh-compaction-tool-result-pruner')).join(', '))

const mod = await import('@deepseek-ai/dsh-compaction-tool-result-pruner')
console.log('  name:', mod.name)
console.log('  inject:', JSON.stringify(mod.inject))
console.log('  Config 存在:', typeof mod.Config)

console.log('\n=== 2. 挂载后能否通过 ctx.get 取到服务 ===')
try {
  const ctx = new Context()
  await ctx.plugin(mod)
  const svc = ctx.get('toolResultPruner')
  console.log('  ctx.get("toolResultPruner") →', svc === undefined ? 'undefined ✗' : '取到服务 ✓')
  if (svc !== undefined) {
    console.log('  服务方法:', Object.getOwnPropertyNames(Object.getPrototypeOf(svc)).join(', '))
    console.log('  pruneSession 可调用:', typeof svc.pruneSession === 'function')
  }
} catch (e) {
  console.log('  挂载失败:', e.message.split('\n')[0])
  console.log('  （可能缺少依赖服务，属正常）')
}

console.log('\n=== 3. 判定 ===')
console.log('  若上面成功取到服务 → 插件 C-lite 可行：')
console.log('    · 监听 session/event，估算 token 用量')
console.log('    · 接近阈值时主动调 pruneSession()')
console.log('    · 降低压缩触发频率 → 缓解连败')
console.log('  ⚠ 但它不解决「失败后无退避」，只是「减少失败机会」')