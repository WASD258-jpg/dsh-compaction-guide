// 插件 C 工程量评估：用最小原型验证核心逻辑可行性。
// 目标不是做出成品，而是测出「核心机制」到底需要多少代码。

console.log('=== 插件 C 核心机制的最小原型 ===\n')

// ---- 核心 1：从 session/event 观测压缩失败，做全局计数 ----
const state = new Map() // session -> { failures, lastFailureAt, cooldownUntil }

function observeCompactionEnd(session, event, now, policy) {
  if (event.type !== 'compaction/end') return null
  const key = session
  const s = state.get(key) ?? { failures: 0, cooldownUntil: 0 }

  if (event.data?.error !== undefined) {
    s.failures = Math.min(s.failures + 1, policy.maxCount)
    const backoff = Math.min(policy.maxCooldownMs, policy.baseCooldownMs * 2 ** (s.failures - 1))
    s.cooldownUntil = now + backoff
    state.set(key, s)
    return { action: 'cooldown', failures: s.failures, backoffMs: backoff }
  }
  // 成功即重置
  state.set(key, { failures: 0, cooldownUntil: 0 })
  return { action: 'reset' }
}

// ---- 核心 2：在 pre-step 前判断是否应跳过压缩 ----
function shouldSkipCompaction(session, now, policy) {
  const s = state.get(session)
  if (!s) return { skip: false }
  if (s.failures >= policy.tripAfter) {
    return { skip: true, reason: `tripped after ${s.failures} failures`, until: s.cooldownUntil }
  }
  if (now < s.cooldownUntil) {
    return { skip: true, reason: `cooling down`, until: s.cooldownUntil }
  }
  return { skip: false }
}

const policy = { baseCooldownMs: 60_000, maxCooldownMs: 600_000, maxCount: 32, tripAfter: 5 }

console.log('--- 模拟：真实语料中的 18 次连败（间隔中位 101s）---')
let now = 0
const t0 = 0
for (let i = 1; i <= 18; i++) {
  now = t0 + i * 101_000
  const r = observeCompactionEnd('sess-A', { type: 'compaction/end', data: { error: 'pi-ai detected context overflow' } }, now, policy)
  const skip = shouldSkipCompaction('sess-A', now + 101_000, policy)
  if (i <= 6 || i === 18) {
    console.log(`  失败#${String(i).padStart(2)}  退避=${String(Math.round(r.backoffMs/1000)).padStart(3)}s  ` +
      `下次是否跳过=${skip.skip ? 'YES (' + skip.reason + ')' : 'no'}`)
  }
}

console.log('\n--- 对照：如果做退避，18 次连败会变成几次调用？---')
now = 0
state.clear()
let calls = 0
for (let i = 1; i <= 18; i++) {
  const t = t0 + i * 101_000
  const s = shouldSkipCompaction('sess-A', t, policy)
  if (s.skip) continue
  calls += 1
  observeCompactionEnd('sess-A', { type: 'compaction/end', data: { error: 'overflow' } }, t, policy)
}
console.log(`  无退避: 18 次压缩调用`)
console.log(`  有退避: ${calls} 次压缩调用`)
console.log(`  节省: ${18 - calls} 次模型调用`)

console.log('\n=== 代码量实测 ===')
const fs = await import('node:fs')
const self = fs.readFileSync(new URL(import.meta.url), 'utf8')
const logicLines = self.split('\n').filter(l =>
  l.trim() && !l.trim().startsWith('//') && !l.trim().startsWith('console') && !l.includes('import ')).length
console.log(`  上述核心逻辑（观测 + 计数 + 退避 + 熔断判定）：约 ${logicLines} 行`)
console.log('  → 不含：配置 schema、测试、README、Cordis 接线、持久化')

console.log('\n=== 需要额外工程的部分 ===')
console.log('  1. Cordis 插件外壳（apply/inject/name/Config）      ~50 行')
console.log('  2. 配置 schema（对齐官方 z.object 风格）             ~40 行')
console.log('  3. 挂载 session/event + agent/pre-step 钩子          ~30 行')
console.log('  4. 用户可见性（日志/事件/UI 提示）                  ~60 行')
console.log('  5. 持久化（可选，跨重启保留状态）                   ~80 行')
console.log('  6. 测试（单元 + 真实组合，对齐官方测试标准）        ~400 行')
console.log('  7. README 双语 + 引用体系                           ~200 行')
console.log('  ────────────────────────────────────────────────')
console.log('  合计约 860 行 + 核心 60 行 ≈ 920 行')