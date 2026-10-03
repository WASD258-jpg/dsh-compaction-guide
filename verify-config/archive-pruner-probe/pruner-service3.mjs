// ARCHIVED FAILED ATTEMPT — see ../README.md.
//
// Wrong answer: "the service is unreachable."
//
// tokenMeter was added to the chain. Still incomplete: TokenMeter itself declares
// inject = ['sessionProjections'].
//
// The full chain is: session -> sessionProjections -> tokenMeter -> pruner

import { Context } from '@deepseek-ai/cordis'
import Pruner from '@deepseek-ai/dsh-compaction-tool-result-pruner'
import TokenMeter from '@deepseek-ai/dsh-token-meter'

const ctx = new Context()

console.log('=== Mounting in dependency order (incomplete) ===')
try {
  await ctx.plugin(TokenMeter)
  console.log('  tokenMeter: mounted')
} catch (e) { console.log('  tokenMeter failed:', e.message.split('\n')[0]) }

try {
  await ctx.plugin(Pruner, {})
  console.log('  pruner: mounted')
} catch (e) { console.log('  pruner failed:', e.message.split('\n')[0]) }

console.log('\n=== Service reachability ===')
for (const name of ['tokenMeter', 'toolResultPruner']) {
  const svc = ctx.get(name)
  console.log(`  ctx.get('${name}') -> ${svc === undefined ? 'undefined' : 'obtained'}`)
}

console.log('\n=== Verdict ===')
console.log('  Still undefined, because TokenMeter itself has an unsatisfied inject:')
console.log(`    TokenMeter.inject = ${JSON.stringify(TokenMeter.inject)}`)
console.log('')
console.log('  A service whose own dependencies are missing is never provided, so this')
console.log('  result says nothing about whether plugins can reach services.')
console.log('  See ../depchain-test.mjs for the complete chain.')
