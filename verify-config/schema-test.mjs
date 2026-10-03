// 直接验证：我推荐的 compaction-basic 配置能否通过真实 schema 校验。
// 比 dump-config 更直接——直接实例化 BasicCompactionEngine，让它的 z.object 校验配置。

import { Context } from '@deepseek-ai/cordis'

const CANDIDATES = {
  '推荐的完整配置': {
    thresholdRatio: 0.5,
    retainRatio: 0.12,
    headroomTokens: 32768,
    maxTokens: 32768,
    compactionRetries: 2,
    maxOverflowRetries: 3,
  },
  '配独立摘要模型': {
    thresholdRatio: 0.5,
    retainRatio: 0.12,
    headroomTokens: 32768,
    maxTokens: 32768,
    summarizationProvider: 'deepseek-official',
    summarizationModel: 'deepseek-flash',
    compactionRetries: 2,
    maxOverflowRetries: 3,
  },
  '只配摘要模型（最小改动）': {
    summarizationProvider: 'deepseek-official',
    summarizationModel: 'deepseek-flash',
  },
  '调低阈值': { thresholdRatio: 0.5 },
  '调小 headroom': { headroomTokens: 32768 },
}

// 故意错误的写法，确认校验会拒绝（避免把无效配置推给用户）
const SHOULD_FAIL = {
  '拼错的字段名': { thresoldRatio: 0.5 },
  'retainRatio 与 retainTokens 同用': { retainRatio: 0.12, retainTokens: 2048 },
  'retainRatio >= thresholdRatio': { thresholdRatio: 0.3, retainRatio: 0.5 },
  '只配 provider 不配 model': { summarizationProvider: 'deepseek-official' },
  '负数 headroom': { headroomTokens: -1 },
}

let Engine
try {
  ({ BasicCompactionEngine: Engine } = await import('@deepseek-ai/dsh-compaction-basic'))
  console.log('模块加载: PASS')
} catch (e) {
  console.log('模块加载 FAIL:', e.message.split('\n')[0])
  process.exit(1)
}

console.log('\n=== 校验函数来源 ===')
console.log('Engine.Config 存在:', typeof Engine.Config)

function tryConfig(label, config) {
  try {
    // Config 是 schemastery 的 z.object，直接用它校验
    const parsed = Engine.Config ? Engine.Config(config) : undefined
    return { ok: true, parsed }
  } catch (e) {
    return { ok: false, err: e.message.split('\n')[0] }
  }
}

console.log('\n=== A. 推荐配置必须通过 ===')
for (const [label, cfg] of Object.entries(CANDIDATES)) {
  const r = tryConfig(label, cfg)
  console.log(`  ${r.ok ? '[PASS]' : '[FAIL]'} ${label}${r.ok ? '' : ' → ' + r.err}`)
}

console.log('\n=== B. 错误配置必须被拒绝（否则用户会静默失效）===')
for (const [label, cfg] of Object.entries(SHOULD_FAIL)) {
  const r = tryConfig(label, cfg)
  console.log(`  ${r.ok ? '[意外通过] ' + label : '[正确拒绝] ' + label}`)
}