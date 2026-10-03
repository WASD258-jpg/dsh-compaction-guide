// 查明 Cordis 服务隔离：为何 ctx.get() 取不到已挂载的服务？
// 这决定插件能否访问其他插件的服务 —— 是路径 B 的最后机会。

import { Context } from '@deepseek-ai/cordis'
import Pruner from '@deepseek-ai/dsh-compaction-tool-result-pruner'
import TokenMeter from '@deepseek-ai/dsh-token-meter'

console.log('=== 实验 1：同层挂载，服务是否可见 ===')
{
  const ctx = new Context()
  await ctx.plugin(TokenMeter)
  await ctx.plugin(Pruner, {})
  console.log(`  同 ctx 挂载后 ctx.get('tokenMeter') → ${ctx.get('tokenMeter') !== undefined ? '可见 ✓' : '不可见 ✗'}`)
  console.log(`  同 ctx 挂载后 ctx.get('toolResultPruner') → ${ctx.get('toolResultPruner') !== undefined ? '可见 ✓' : '不可见 ✗'}`)
}

console.log('\n=== 实验 2：isolate 是否影响可见性 ===')
{
  const ctx = new Context()
  await ctx.plugin(TokenMeter)
  const isolated = ctx.isolate('test')
  await isolated.plugin(Pruner, {})
  console.log(`  isolate 内挂载后，外层 ctx.get('toolResultPruner') → ${ctx.get('toolResultPruner') !== undefined ? '可见' : '不可见'}`)
  console.log(`  isolate 内自己 get('toolResultPruner') → ${isolated.get('toolResultPruner') !== undefined ? '可见' : '不可见'}`)
}

console.log('\n=== 实验 3：Service 子类是否自动 provide ===')
{
  const ctx = new Context()
  await ctx.plugin(TokenMeter)
  await ctx.plugin(Pruner, {})
  // 遍历 root 的 props 看注册了什么
  const root = ctx.root ?? ctx
  const props = root[symbols_props()] ?? root.props ?? {}
  const names = Object.keys(props)
  console.log(`  root.props 中的服务名: ${names.length ? names.join(', ') : '(空)'}`)
}

function symbols_props() {
  return Symbol.for('cordis.props')
}

console.log('\n=== 实验 4：用 ctx.get 的容错形式 ===')
{
  const ctx = new Context()
  await ctx.plugin(TokenMeter)
  await ctx.plugin(Pruner, {})
  // 有的实现要求通过 ctx.root.get 或带 scope
  console.log(`  ctx.get('toolResultPruner')        → ${ctx.get('toolResultPruner') !== undefined}`)
  console.log(`  ctx.root?.get?.('toolResultPruner') → ${ctx.root?.get?.('toolResultPruner') !== undefined}`)
}

console.log('\n=== 结论 ===')
console.log('  若所有路径都不可见，则：')
console.log('    · 插件无法访问其他插件的服务实例')
console.log('    · 路径 B（主动 prune）不可行')
console.log('    · 插件能做的只剩：观测事件 + 写日志')
console.log('')
console.log('  这与「无法阻断压缩」的结论一致 —— 插件层能做的事非常有限。')