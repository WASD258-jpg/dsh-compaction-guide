// 忠实测试：用真实 dsh 配置引导完整依赖链，再检查插件能否访问服务。
// 裸 Context 缺依赖链，之前的否定结论无效。

import { Context } from '@deepseek-ai/cordis'
import Pruner from '@deepseek-ai/dsh-compaction-tool-result-pruner'
import TokenMeter from '@deepseek-ai/dsh-token-meter'

// 依赖链（从两者 static inject 反推）：
//   TokenMeter.inject = ['sessionProjections']
//   Pruner.inject     = ['tokenMeter']

console.log('=== 逐步构建依赖链 ===\n')

const ctx = new Context()

// 第 1 层：sessionProjections 的提供者
let SessionProjection
try {
  SessionProjection = (await import('@deepseek-ai/dsh-session-projection')).default
  console.log('  session-projection 可用:', typeof SessionProjection)
  console.log('  其 inject:', JSON.stringify(SessionProjection.inject ?? null))
} catch (e) {
  console.log('  session-projection 不可用:', e.message.split('\n')[0])
}

// 尝试按依赖顺序挂载
const order = [
  ['session', () => import('@deepseek-ai/dsh-session').then(m => m.default ?? m)],
  ['session-projection', () => import('@deepseek-ai/dsh-session-projection').then(m => m.default ?? m)],
  ['token-meter', () => import('@deepseek-ai/dsh-token-meter').then(m => m.default ?? m)],
  ['pruner', () => import('@deepseek-ai/dsh-compaction-tool-result-pruner').then(m => m.default ?? m)],
]

for (const [label, load] of order) {
  try {
    const plugin = await load()
    if (typeof plugin !== 'function') { console.log(`  ${label}: 非函数导出，跳过`); continue }
    await ctx.plugin(plugin, {})
    // 给 effect 一点时间
    await new Promise(r => setTimeout(r, 50))
    const props = Object.keys(ctx.props ?? {})
    console.log(`  ${label}: 挂载成功 | props 现在有: ${props.join(', ') || '(空)'}`)
  } catch (e) {
    console.log(`  ${label}: 失败 → ${e.message.split('\n')[0]}`)
  }
}

console.log('\n=== 最终服务可见性 ===')
for (const name of ['tokenMeter', 'toolResultPruner', 'sessionProjections']) {
  const v = ctx.get(name)
  console.log(`  ctx.get('${name}') → ${v !== undefined ? '可见 ✓' : 'undefined'}`)
}

console.log('\n=== 判定 ===')
const anyVisible = ['tokenMeter', 'toolResultPruner'].some(n => ctx.get(n) !== undefined)
if (anyVisible) {
  console.log('  ✓ 服务可达 —— 路径 B 前提成立')
  console.log('  前一轮的「不可达」结论是我测试台不忠实造成的（缺依赖链）')
} else {
  console.log('  ✗ 依赖链仍不完整，无法判定')
  console.log('  → 结论必须标注为「未定论」，不能声称插件做不到')
}