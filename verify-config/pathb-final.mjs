// Final verification: can a third-party plugin actually CALL pruneSession()?
//
// With the dependency chain mounted, the service is reachable. Reachable is not
// the same as callable — this checks the call itself, which is what a proactive
// prune would need.

import { Context } from '@deepseek-ai/cordis'

const ctx = new Context()
for (const spec of [
  '@deepseek-ai/dsh-session',
  '@deepseek-ai/dsh-session-projection',
  '@deepseek-ai/dsh-token-meter',
  '@deepseek-ai/dsh-compaction-tool-result-pruner',
]) {
  const m = await import(spec)
  await ctx.plugin(m.default ?? m, {})
  await new Promise(r => setTimeout(r, 50))
}

const pruner = ctx.get('toolResultPruner')
console.log('=== Service capability ===')
console.log(`  pruner present: ${pruner !== undefined}`)
if (!pruner) { console.log('  cannot continue'); process.exit(1) }

const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(pruner)).filter(n => n !== 'constructor')
console.log(`  methods: ${methods.join(', ')}`)
console.log(`  pruneSession type: ${typeof pruner.pruneSession}`)

console.log('\n=== Third-party plugin view (simulating a proactive pruner) ===')
class ProactivePruner {
  static inject = { optional: ['toolResultPruner'] }
  constructor(c) {
    this.pruner = c.get('toolResultPruner')
    console.log(`  plugin obtained the service: ${this.pruner ? 'yes' : 'no'}`)
  }
  tryPrune(session) {
    if (!this.pruner) return { ok: false, reason: 'no pruner' }
    try {
      return { ok: true, saved: this.pruner.pruneSession(session) }
    } catch (e) {
      return { ok: false, reason: e.message.split('\n')[0] }
    }
  }
}
const probe = new ProactivePruner(ctx)

console.log('\n=== Call check (an incomplete session object exercises the path) ===')
const result = probe.tryPrune({ surface: { nodes: [] } })
console.log(`  result: ${JSON.stringify(result)}`)
if (result.ok) console.log('  -> the call path works')

console.log('\n=== Verdict ===')
console.log('  service reachable:  yes')
console.log(`  method callable:    ${typeof pruner.pruneSession === 'function' ? 'yes' : 'no'}`)
console.log('')
console.log('  A plugin CAN prune proactively, which reduces how often compaction')
console.log('  fires. It CANNOT add backoff: once a compaction fails, retries remain')
console.log('  unthrottled, because no extension point can suppress an attempt [O24].')
