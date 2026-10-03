// 穷尽干预点分析：插件 C 真的完全无法影响压缩行为吗？
// 不要因为一个失败就下结论——系统分析所有可能的介入位置。

import fs from 'node:fs'
import path from 'node:path'

const SRC = 'E:\\DSH-Lab\\src\\packages'
const read = (p) => fs.readFileSync(p, 'utf8')

console.log('=== 可能的干预点穷举 ===\n')

const compactionIndex = read(path.join(SRC, 'compaction/compaction-basic/src/index.ts'))

// 干预点 1：llm/stream —— 能影响模型调用
console.log('【1】llm/stream waterfall')
console.log('  作用：包裹每一次模型调用（含摘要调用）')
const llmIndex = read(path.join(SRC, 'llm/llm/src/index.ts'))
const hasStreamHook = /waterfall\(this,\s*['"]llm\/stream['"]/.test(llmIndex)
console.log(`  存在：${hasStreamHook}`)
console.log('  能力：可观测/改写摘要调用本身')
console.log('  能阻断压缩吗：不能，但能——')
console.log('    · 在摘要调用前抛错（会让压缩失败得更快，更糟）')
console.log('    · 改写摘要请求（降级输入体积）← 这才是有效方向')
console.log('')

// 干预点 2：compaction/summary-error —— 官方预留的恢复 waterfall
console.log('【2】compaction/summary-error waterfall')
const hasRecover = /waterfall\(['"]compaction\/summary-error['"]/.test(compactionIndex)
console.log(`  存在：${hasRecover}`)
const m = compactionIndex.match(/recover:[\s\S]{0,300}/)
if (m) {
  console.log('  官方实现片段：')
  m[0].split('\n').slice(0, 6).forEach(l => console.log('    ' + l.trim()))
}
console.log('  能力：摘要失败时请求"恢复输入"并重试')
console.log('  能阻断压缩吗：不能阻断，但能——')
console.log('    · 在失败时介入，改写摘要输入后让官方重试')
console.log('    · 这是官方预留的唯一"失败后介入"点 ★')
console.log('')

// 干预点 3：是否有 session 改写能力
console.log('【3】session surface 改写')
const pruner = read(path.join(SRC, 'compaction/compaction-tool-result-pruner/src/index.ts'))
const canReplace = /replace|surfaceOp/.test(pruner)
console.log(`  pruner 能改写 surface：${canReplace}`)
console.log('  能力：插件可写 session surface（pruner 就是例子）')
console.log('  能阻断压缩吗：不能，但能——')
console.log('    · 主动缩小 context，让压缩不必触发 ← 这是有效方向')
console.log('')

// 干预点 4：agent/pre-step 的顺序问题
console.log('【4】agent/pre-step（已证伪）')
console.log('  compaction-basic 在 L164 同步执行 compactIfNeeded')
console.log('  waterfall 的 next() 在 L175 —— 压缩先于任何下游监听器')
console.log('  → 抢队首无效，因为压缩发生在「它自己的监听器体内」而非 next() 之后')
console.log('')

console.log('=== 综合：两个真正可行的方向 ===\n')
console.log('方向 A：compaction/summary-error 介入（官方预留）')
console.log('  · 摘要失败时，插件改写输入并让官方重试')
console.log('  · 这正是我 documentation 里 Gap 3 说的"摘要溢出无恢复路径"')
console.log('  · 官方 waterfall 已存在，插件是合法消费者')
console.log('')
console.log('方向 B：主动缩小 surface，让压缩不必触发')
console.log('  · 监听 session/event，在接近阈值前主动 prune')
console.log('  · pruner 已证明插件可以改写 surface')
console.log('  · 但这与「熔断」是两回事——治的是"少触发"而非"失败了别重试"')
console.log('')

console.log('=== 对机制 C（退避熔断）的最终判定 ===\n')
console.log('  真正需要的：在第 2 次压缩前就跳过它')
console.log('  可用的点：没有')
console.log('    · pre-step 被 compaction 自己占用（体内执行）')
console.log('    · summary-error 只在「已经失败之后」触发，无法阻止下一次')
console.log('    · llm/stream 能包裹调用，但"不调用"不是它能决定的')
console.log('')
console.log('  结论：机制 C 的正确修复点在 compaction-basic 的 pre-step 监听器内部')
console.log('        需要一个 guard：if (breakerTripped(session)) return next()')
console.log('        这是上游改动，不是插件能做的。')