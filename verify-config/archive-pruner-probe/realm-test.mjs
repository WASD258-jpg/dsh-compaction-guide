// 关键：我上一个测试可能不忠实。
// 生产环境用 cordis:group + isolate 让插件共享 realm，
// compaction-basic 才能 ctx.get('toolResultPruner')。
// 必须复现那个结构再判定，否则结论是错的。

import { Context } from '@deepseek-ai/cordis'
import Pruner from '@deepseek-ai/dsh-compaction-tool-result-pruner'
import TokenMeter from '@deepseek-ai/dsh-token-meter'

console.log('=== 复现生产结构：isolate 共享 realm ===\n')

// 生产 preset 的结构（standard.patch.yml L63-79）：
//   - id: compaction
//     name: cordis:group
//     isolate: { compaction: true, toolResultPruner: true }
//     config: [pruner, compaction-basic, ...]
//
// 即：用 isolate 声明共享名，让组内插件通过 ctx.get 互相访问。

const ctx = new Context()
await ctx.plugin(TokenMeter)

// 用 isolate 声明共享的 realm key
const iso = ctx.isolate('compactionRealm')
console.log('  创建 isolate realm: compactionRealm')

await iso.plugin(Pruner, {})
console.log('  在 realm 内挂载 pruner')

console.log('\n--- 可见性检查 ---')
console.log(`  iso.get('toolResultPruner')  → ${iso.get('toolResultPruner') !== undefined ? '可见 ✓' : '不可见'}`)
console.log(`  ctx.get('toolResultPruner')  → ${ctx.get('toolResultPruner') !== undefined ? '可见 ✓' : '不可见'}`)

console.log('\n=== 另一种可能：服务需要异步就绪 ===')
// Cordis 的服务可能需要在 effect 里异步 provide
await new Promise(r => setTimeout(r, 100))
console.log(`  等待 100ms 后 iso.get('toolResultPruner') → ${iso.get('toolResultPruner') !== undefined ? '可见 ✓' : '不可见'}`)

console.log('\n=== 直接检查 service 是否注册在 root ===')
const rootProps = ctx.root?.props ?? {}
console.log(`  ctx.root.props keys: ${Object.keys(rootProps).join(', ') || '(空)'}`)
const isoProps = iso.props ?? {}
console.log(`  iso.props keys: ${Object.keys(isoProps).join(', ') || '(空)'}`)

console.log('\n=== 判定 ===')
const visible = iso.get('toolResultPruner') !== undefined || ctx.get('toolResultPruner') !== undefined
if (visible) {
  console.log('  ✓ 服务可达 —— 路径 B 前提成立')
  console.log('    （我上一个测试台未复现 isolate 结构，结论作废）')
} else {
  console.log('  仍不可见。但请注意：生产代码确实这么用了，')
  console.log('  所以差异可能来自：')
  console.log('    · 需要完整的 app 启动流程（而非裸 Context）')
  console.log('    · 需要 cordis:group 插件而非裸 isolate 调用')
  console.log('  → 结论应标注为「未定论」，不能断言不可行')
}