// Prototype of the core circuit-breaker logic, kept for the arithmetic.
//
// WARNING — the headline number in this script is MISLEADING.
//
// It reports that with backoff, 18 compaction attempts would reduce to 5. That
// assumes the breaker can SUPPRESS attempts. It cannot: compaction-basic performs
// the call inside its own agent/pre-step listener body, before its next(), so no
// extension point can intercept it [O24].
//
// The script is retained because it shows the backoff arithmetic and the shape of
// the guard that upstream would need. Do not cite its reduction figure as an
// achievable benefit. See README.md in this directory.

console.log('=== Core mechanism prototype ===\n')

const state = new Map()

function observeCompactionEnd(session, event, now, policy) {
  if (event.type !== 'compaction/end') return null
  const s = state.get(session) ?? { failures: 0, cooldownUntil: 0 }

  if (event.data?.error !== undefined) {
    s.failures = Math.min(s.failures + 1, policy.maxCount)
    const backoff = Math.min(policy.maxCooldownMs, policy.baseCooldownMs * 2 ** (s.failures - 1))
    s.cooldownUntil = now + backoff
    state.set(session, s)
    return { action: 'cooldown', failures: s.failures, backoffMs: backoff }
  }
  state.set(session, { failures: 0, cooldownUntil: 0 })
  return { action: 'reset' }
}

function shouldSkipCompaction(session, now, policy) {
  const s = state.get(session)
  if (!s) return { skip: false }
  if (s.failures >= policy.tripAfter) {
    return { skip: true, reason: `tripped after ${s.failures} failures`, until: s.cooldownUntil }
  }
  if (now < s.cooldownUntil) {
    return { skip: true, reason: 'cooling down', until: s.cooldownUntil }
  }
  return { skip: false }
}

const policy = { baseCooldownMs: 60_000, maxCooldownMs: 600_000, maxCount: 32, tripAfter: 5 }

console.log('--- Simulating the observed pattern: 18 consecutive failures, ~101s apart ---')
let now = 0
for (let i = 1; i <= 18; i++) {
  now = i * 101_000
  const r = observeCompactionEnd('sess-A', { type: 'compaction/end', data: { error: 'context overflow' } }, now, policy)
  const skip = shouldSkipCompaction('sess-A', now + 101_000, policy)
  if (i <= 6 || i === 18) {
    console.log(`  failure #${String(i).padStart(2)}  backoff=${String(Math.round(r.backoffMs / 1000)).padStart(3)}s  ` +
      `next skipped=${skip.skip ? 'yes (' + skip.reason + ')' : 'no'}`)
  }
}

console.log('\n--- Attempt reduction, IF the breaker could suppress attempts ---')
now = 0
state.clear()
let calls = 0
for (let i = 1; i <= 18; i++) {
  const t = i * 101_000
  if (shouldSkipCompaction('sess-A', t, policy).skip) continue
  calls += 1
  observeCompactionEnd('sess-A', { type: 'compaction/end', data: { error: 'overflow' } }, t, policy)
}
console.log(`  without backoff: 18 attempts`)
console.log(`  with backoff:    ${calls} attempts`)
console.log('')
console.log('  ^ This figure assumes suppression, which is NOT available [O24].')
console.log('    It shows what upstream enforcement would buy, not what a plugin can do.')

console.log('\n=== The guard upstream would need ===')
console.log('  // inside compaction-basic\'s agent/pre-step listener, before compactIfNeeded')
console.log('  if (breakerTripped(session)) return next()')
