// 验证我推荐配置的残余风险——特别是「拼错 provider 名」的失败时机。
// 如果它在加载时不报错、到压缩时才失败，用户会以为配好了，直到会话炸掉才发现。

import { Context } from '@deepseek-ai/cordis'
import { BasicCompactionEngine } from '@deepseek-ai/dsh-compaction-basic'

function construct(config) {
  try {
    const ctx = new Context()
    const engine = new BasicCompactionEngine(ctx, config)
    return { ok: true, engine }
  } catch (e) {
    return { ok: false, err: (e.message || String(e)).split('\n')[0] }
  }
}

console.log('=== 风险1：拼错/不存在的 provider 名，何时失败？ ===\n')
const cases = [
  ['不存在的 provider', { summarizationProvider: 'nonexistent-provider', summarizationModel: 'some-model' }],
  ['不存在的 model', { summarizationProvider: 'deepseek-official', summarizationModel: 'no-such-model-xyz' }],
  ['空串对（=默认行为）', { summarizationProvider: '', summarizationModel: '' }],
]
for (const [label, cfg] of cases) {
  const r = construct(cfg)
  console.log(`  ${label}:`)
  console.log(`    构造阶段 → ${r.ok ? 'PASS（不校验存在性）' : 'FAIL: ' + r.err}`)
}

console.log('\n  → 若构造阶段全部 PASS，说明 provider 存在性只在【首次压缩调用】时才暴露。')
console.log('    这是用户必须知道的风险：配置错误会在会话跑到阈值时才炸。')

console.log('\n=== 风险2：maxTokens 调小会不会引入「摘要截断」这个新失败模式？ ===\n')
console.log('  官方 finishError() 对 max-tokens 的处理：')
console.log('    case "max-tokens": return Error("summarization truncated at the token cap")')
console.log('    → 摘要被截断 = 压缩失败，且写进 compaction/end 的 error')
console.log('')
console.log('  我的推荐 maxTokens=32768（默认是 headroomTokens=65536）')
console.log('  → 摘要输出上限砍半。若真实摘要需要 >32768 token，就会触发截断失败。')
console.log('')
console.log('  实测语料里的摘要规模（来自 doctor.mjs 统计）：')
console.log('    最大 4963 token，中位 4312 token  ← 远低于 32768')
console.log('  → 就本语料而言安全，但这是【单语料观测】，不是保证。')

console.log('\n=== 风险3：thresholdRatio 0.5 的成本影响 ===\n')
const W = 1000000, O = 256000
for (const [label, ratio, hr] of [['默认 0.8', 0.8, 65536], ['推荐 0.5', 0.5, 32768]]) {
  const thr = Math.floor(Math.min(W * ratio, W - O - hr))
  console.log(`  ${label}: 阈值 ${thr.toLocaleString()} token`)
}
console.log('  → 阈值降低 26%，意味着【压缩触发更频繁】= 更多次摘要 LLM 调用 = 更高成本。')
console.log('    每次压缩都是一次完整的模型调用（重放整个被压缩区）。')
console.log('    这是我推荐里的真实代价，之前没写出来。')

console.log('\n=== 风险4：compactionRetries / maxOverflowRetries 调高的代价 ===\n')
console.log('  compactionRetries: 1 → 2：压力仍高于阈值时多试一次 = 多一次模型调用')
console.log('  maxOverflowRetries: 1 → 3：溢出恢复多试两次')
console.log('  → 在【机制A未修复】的前提下，溢出恢复根本不会触发（413 被误分类），')
console.log('    所以 maxOverflowRetries 调高在当前版本下是【无效配置】——')
console.log('    除非同时装了 argszero 的插件把它重新分类。')