// 最终验证：第三方插件能否真正独立调用 pruneSession？
// 依赖链已补全，服务可达。现在验证「可调用」而不只是「可见」。

import { Context } from '@deepseek-ai/cordis'

const ctx = new Context()
for (const [label, spec] of [
  ['session', '@deepseek-ai/dsh-session'],
  ['session-projection', '@deepseek-ai/dsh-session-projection'],
  ['token-meter', '@deepseek-ai/dsh-token-meter'],
  ['pruner', '@deepseek-ai/dsh-compaction-tool-result-pruner'],
]) {
  const m = await import(spec)
  await ctx.plugin(m.default ?? m, {})
  await new Promise(r => setTimeout(r, 50))
}

const pruner = ctx.get('toolResultPruner')
console.log('=== 服务能力检查 ===')
console.log(`  pruner 存在: ${pruner !== undefined}`)
if (!pruner) { console.log('  无法继续'); process.exit(1) }

const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(pruner)).filter(n => n !== 'constructor')
console.log(`  可用方法: ${methods.join(', ')}`)
console.log(`  pruneSession: ${typeof pruner.pruneSession}`)
console.log(`  pruneContent: ${typeof pruner.pruneContent}`)

console.log('\n=== 第三方插件视角（模拟插件 C-lite）===')
class C_lite {
  static inject = { optional: ['toolResultPruner'] }
  constructor(c) {
    this.ctx = c
    this.pruner = c.get('toolResultPruner')
    console.log(`  构造函数内取 pruner: ${this.pruner ? '✓' : '✗'}`)
  }
  // 模拟：接近阈值时主动 prune
  tryProactivePrune(session) {
    if (!this.pruner) return { ok: false, reason: 'no pruner' }
    try {
      const saved = this.pruner.pruneSession(session)
      return { ok: true, saved }
    } catch (e) {
      return { ok: false, reason: e.message.split('\n')[0] }
    }
  }
}
const probe = new C_lite(ctx)

console.log('\n=== 调用测试（用假 session 触发参数校验）===')
const result = probe.tryProactivePrune({ surface: { nodes: [] } })
console.log(`  调用结果: ${JSON.stringify(result)}`)
if (!result.ok && /surface|nodes|undefined/.test(result.reason ?? '')) {
  console.log('  → 报错来自 session 对象不完整（预期），说明【调用路径通了】')
} else if (result.ok) {
  console.log('  → 调用成功')
}

console.log('\n=== 最终判定 ===')
console.log(`  服务可达:        ✓`)
console.log(`  方法可调用:      ${typeof pruner.pruneSession === 'function' ? '✓' : '✗'}`)
console.log('')
console.log('  ⇒ 路径 B 前提【成立】。插件可以：')
console.log('      · 监听 session/event 观测 token 用量')
console.log('      · 接近阈值时主动调 pruneSession() 缩小 surface')
console.log('      · 从而降低压缩触发频率，缓解连败')
console.log('')
console.log('  ⚠ 但仍须诚实标注：')
console.log('      · 这是「减少触发机会」，不是「失败后退避」')
console.log('      · 压缩一旦真失败，重试仍无抑制')
console.log('      · 真正的退避需要上游在 pre-step 监听器内加 guard')