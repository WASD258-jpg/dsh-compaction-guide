// ARCHIVED — reproduced an isolate realm on an incomplete harness.
//
// The realm structure was built correctly, but the harness still lacked the
// dependency chain, so it reproduced the same undefined as the earlier attempts.
//
// A faithful structure on an unfaithful harness yields the same wrong answer.
// Reachability is established in ../pathb-final.mjs [O26].

import { Context } from '@deepseek-ai/cordis'
import Pruner from '@deepseek-ai/dsh-compaction-tool-result-pruner'
import TokenMeter from '@deepseek-ai/dsh-token-meter'

console.log('=== Reproducing the production isolate structure ===\n')
console.log('  The shipped preset declares:')
console.log('    - id: compaction')
console.log('      name: cordis:group')
console.log('      isolate: { compaction: true, toolResultPruner: true }')
console.log('')

const ctx = new Context()
await ctx.plugin(TokenMeter)

const iso = ctx.isolate('compactionRealm')
console.log('  created isolate realm: compactionRealm')
await iso.plugin(Pruner, {})
console.log('  mounted pruner inside the realm')

console.log('\n=== Visibility check ===')
console.log(`  iso.get('toolResultPruner') -> ${iso.get('toolResultPruner') !== undefined ? 'visible' : 'NOT visible'}`)
console.log(`  ctx.get('toolResultPruner') -> ${ctx.get('toolResultPruner') !== undefined ? 'visible' : 'NOT visible'}`)

await new Promise(r => setTimeout(r, 100))
console.log(`  after 100ms: iso.get('toolResultPruner') -> ${iso.get('toolResultPruner') !== undefined ? 'visible' : 'NOT visible'}`)

console.log('\n=== Verdict ===')
console.log('  Still not visible — but note WHY. The pruner declares')
console.log(`    inject = ${JSON.stringify(Pruner.inject ?? [])}`)
console.log('  and querying this incomplete harness cannot satisfy it, so nothing is')
console.log('  provided regardless of the realm structure.')
console.log('')
console.log('  This is the fourth attempt to give the wrong answer for the same reason:')
console.log('  an unfaithful harness reports its own limits as the system\'s.')
console.log('  Corrected: ../depchain-test.mjs, ../pathb-final.mjs.')
