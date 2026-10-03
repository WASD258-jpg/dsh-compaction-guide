// 忠实测试：用真实 cordis:group 插件 + 真实 app 启动路径。
// 之前的裸 Context 测试台 ctx.root.props 为空，说明根本没挂上 —— 不忠实。

import { Context } from '@deepseek-ai/cordis'

console.log('=== 诊断：为什么裸 Context 挂载后 props 为空？ ===\n')

const ctx = new Context()
console.log('ctx 构造后:')
console.log(`  ctx.props = ${JSON.stringify(Object.keys(ctx.props ?? {}))}`)
console.log(`  ctx.root === ctx: ${ctx.root === ctx}`)

// 挂一个最简单的 Service
import TokenMeter from '@deepseek-ai/dsh-token-meter'
console.log('\nTokenMeter 的形态:')
console.log(`  typeof: ${typeof TokenMeter}`)
console.log(`  static inject: ${JSON.stringify(TokenMeter.inject ?? null)}`)
console.log(`  static name: ${TokenMeter.name}`)
console.log(`  继承自 Service: ${/extends Service/.test(TokenMeter.toString())}`)

await ctx.plugin(TokenMeter)
console.log('\n挂载 TokenMeter 后:')
console.log(`  ctx.props = ${JSON.stringify(Object.keys(ctx.props ?? {}))}`)
console.log(`  ctx.root.props = ${JSON.stringify(Object.keys(ctx.root?.props ?? {}))}`)
console.log(`  ctx.get('tokenMeter') = ${ctx.get('tokenMeter') !== undefined ? '有值' : 'undefined'}`)

// 关键：Service 可能注册在 fiber 上
console.log('\n=== 检查 fiber 层级 ===')
console.log(`  ctx.fiber 存在: ${ctx.fiber !== undefined}`)
if (ctx.fiber) {
  console.log(`  ctx.fiber.props = ${JSON.stringify(Object.keys(ctx.fiber.props ?? {}))}`)
  console.log(`  ctx.fiber.name = ${ctx.fiber.name}`)
}

console.log('\n=== 用 ctx.inject 走真实依赖解析 ===')
// 真实 app 用 ctx.inject([...], callback) 来保证服务就绪
try {
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve('timeout'), 2000)
    ctx.inject(['tokenMeter'], (c) => {
      clearTimeout(timer)
      console.log(`  inject 回调触发，c.get('tokenMeter') → ${c.get('tokenMeter') !== undefined ? '有值 ✓' : 'undefined'}`)
      resolve('ok')
    })
  }).then(r => console.log(`  inject 结果: ${r}`))
} catch (e) {
  console.log(`  inject 失败: ${e.message.split('\n')[0]}`)
}

console.log('\n=== 结论 ===')
console.log('  若 inject 回调能取到服务，则：')
console.log('    · 服务确实可达，只是必须走 ctx.inject 而非裸 ctx.get')
console.log('    · 路径 B 前提成立')
console.log('  若仍取不到：')
console.log('    · 需要完整 app 启动流程，裸 Context 不构成忠实测试台')