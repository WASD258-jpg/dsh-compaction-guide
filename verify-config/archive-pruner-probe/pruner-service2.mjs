// ARCHIVED FAILED ATTEMPT — see ../README.md.
//
// Wrong answer: "the service is unreachable."
//
// The class was mounted correctly this time, but the query ran against a BARE
// Context. The pruner declares inject = ['tokenMeter'], which was unsatisfied,
// so the service never registered and ctx.get() returned undefined.
//
// That undefined is indistinguishable from "not exposed to plugins" — which is
// how the wrong answer survived this far.

import { Context } from '@deepseek-ai/cordis'
import mod from '@deepseek-ai/dsh-compaction-tool-result-pruner'

console.log('=== 1. Correct mount form ===')
console.log('  imported type:', typeof mod)
console.log('  is class:', typeof mod === 'function')
console.log('  static inject:', JSON.stringify(mod.inject ?? '(none)'))

console.log('\n=== 2. Mount and query ===')
const ctx = new Context()
try {
  await ctx.plugin(mod, {})
  const svc = ctx.get('toolResultPruner')
  console.log('  mounted:', 'yes')
  console.log('  ctx.get("toolResultPruner") ->', svc === undefined ? 'undefined' : 'obtained')
} catch (e) {
  console.log('  mount failed:', e.message.split('\n')[0])
}

console.log('\n=== 3. Why undefined here is NOT the real answer ===')
console.log('  inject = ["tokenMeter"] was never satisfied. Until a service\'s own')
console.log('  dependencies are mounted, it is not provided — and ctx.get() returns')
console.log('  undefined for a service that does not exist yet.')
console.log('')
console.log('  Corrected test: ../depchain-test.mjs (builds the chain) and')
console.log('  ../pathb-final.mjs (confirms the call) [O26].')
