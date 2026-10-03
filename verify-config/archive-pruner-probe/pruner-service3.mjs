// 最终判定：补上 tokenMeter 依赖后，第三方插件能否取到 pruner 服务？
// 这决定路径 B（主动降触发）是否可行。

import { Context } from '@deepseek-ai/cordis'
import Pruner from '@deepseek-ai/dsh-compaction-tool-result-pruner'
import TokenMeter from '@deepseek-ai/dsh-token-meter'

const ctx = new Context()

console.log('=== 按依赖顺序挂载 ===')
try {
  await ctx.plugin(TokenMeter)
  console.log('  tokenMeter 挂载: 成功')
} catch (e) { console.log('  tokenMeter 失败:', e.message.split('\n')[0]) }

try {
  await ctx.plugin(Pruner, {})
  console.log('  pruner 挂载: 成功')
} catch (e) { console.log('  pruner 失败:', e.message.split('\n')[0]) }

console.log('\n=== 服务可达性 ===')
for (const name of ['tokenMeter', 'toolResultPruner']) {
  const svc = ctx.get(name)
  console.log(`  ctx.get('${name}') → ${svc === undefined ? 'undefined' : '取到 ✓'}`)
  if (svc) {
    const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(svc)).filter(n => n !== 'constructor')
    console.log(`    方法: ${methods.join(', ')}`)
  }
}

console.log('\n=== 模拟插件 C-lite 的接入 ===')
class CompactionObserver {
  static inject = { optional: ['toolResultPruner', 'tokenMeter'] }
  constructor(c) {
    this.ctx = c
    const pruner = c.get('toolResultPruner')
    const meter = c.get('tokenMeter')
    console.log(`  观察者取 pruner → ${pruner ? '✓' : '✗'}`)
    console.log(`  观察者取 meter  → ${meter ? '✓' : '✗'}`)
    if (pruner) {
      console.log(`  pruneSession 可调用: ${typeof pruner.pruneSession === 'function'}`)
      console.log('  → 插件 C-lite 可以主动触发 prune ✓')
    } else {
      console.log('  → 路径 B 前提不成立 ✗')
    }
  }
}
try { await ctx.plugin(CompactionObserver) } catch (e) { console.log('  观察者失败:', e.message.split('\n')[0]) }

console.log('\n=== 结论 ===')
const ok = ctx.get('toolResultPruner') !== undefined
console.log(ok
  ? '  路径 B 可行：插件可独立调用 prune，主动降低压缩触发频率'
  : '  路径 B 不可行：服务不可达')
if (ok) {
  console.log('  ⚠ 但必须诚实标注：这是「减少触发机会」，不是「失败后退避」')
  console.log('  ⚠ 真正的失败重试仍无抑制 —— 半成品属性必须写进 README')
}