// 修正：真正实例化 BasicCompactionEngine，让它跑完整的 resolveConfig 校验链。
// 上一次只调 Engine.Config() 只过了 schema 层，没到构造函数的交叉校验。

import { Context } from '@deepseek-ai/cordis'
import { BasicCompactionEngine } from '@deepseek-ai/dsh-compaction-basic'

const CANDIDATES = {
  '推荐的完整配置': {
    thresholdRatio: 0.5, retainRatio: 0.12, headroomTokens: 32768,
    maxTokens: 32768, compactionRetries: 2, maxOverflowRetries: 3,
  },
  '配独立摘要模型': {
    thresholdRatio: 0.5, retainRatio: 0.12, headroomTokens: 32768, maxTokens: 32768,
    summarizationProvider: 'deepseek-official', summarizationModel: 'deepseek-flash',
    compactionRetries: 2, maxOverflowRetries: 3,
  },
  '只配摘要模型（最小改动）': {
    summarizationProvider: 'deepseek-official', summarizationModel: 'deepseek-flash',
  },
  '只调阈值': { thresholdRatio: 0.5 },
  '只调 headroom': { headroomTokens: 32768 },
}

const SHOULD_FAIL = {
  '拼错字段名': { thresoldRatio: 0.5 },
  'retainRatio 与 retainTokens 同用': { retainRatio: 0.12, retainTokens: 2048 },
  'retainRatio >= thresholdRatio': { thresholdRatio: 0.3, retainRatio: 0.5 },
  '只配 provider 不配 model': { summarizationProvider: 'deepseek-official' },
  '只配 model 不配 provider': { summarizationModel: 'deepseek-flash' },
  '负数 headroom': { headroomTokens: -1 },
  'maxTokens 为 0': { maxTokens: 0 },
}

// 真实构造路径：new Engine(ctx, config) → 内部跑 resolveConfig()
function tryConstruct(config) {
  try {
    const ctx = new Context()
    // 只构造，不挂载：构造函数会同步跑 resolveConfig() 校验
    const engine = new BasicCompactionEngine(ctx, config)
    return { ok: true, engine }
  } catch (e) {
    return { ok: false, err: (e.message || String(e)).split('\n')[0] }
  }
}

console.log('=== A. 推荐配置必须能被构造（=通过全部校验）===\n')
for (const [label, cfg] of Object.entries(CANDIDATES)) {
  const r = tryConstruct(cfg)
  console.log(`  ${r.ok ? '[PASS]' : '[FAIL]'} ${label}${r.ok ? '' : '\n          → ' + r.err}`)
}

console.log('\n=== B. 错误配置必须被拒绝 ===\n')
let correctRejects = 0
for (const [label, cfg] of Object.entries(SHOULD_FAIL)) {
  const r = tryConstruct(cfg)
  if (r.ok) console.log(`  [意外通过!] ${label}`)
  else { correctRejects += 1; console.log(`  [正确拒绝] ${label}\n          → ${r.err}`) }
}
console.log(`\n  正确拒绝: ${correctRejects}/${Object.keys(SHOULD_FAIL).length}`)