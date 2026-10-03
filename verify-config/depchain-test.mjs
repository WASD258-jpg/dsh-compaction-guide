// Build the dependency chain, then check whether a plugin can reach the services.
//
// An earlier attempt used a bare Context and reported the pruner service as
// unreachable. That conclusion was wrong: the chain is
//
//   session -> sessionProjections -> tokenMeter -> pruner
//
// and a bare Context registers none of it, so ctx.get() returned undefined. That
// is indistinguishable from "the service is not exposed to plugins" unless you
// check whether anything registered at all.

import { Context } from '@deepseek-ai/cordis'

console.log('=== Building the dependency chain step by step ===\n')

const ctx = new Context()

const order = [
  ['session', () => import('@deepseek-ai/dsh-session').then(m => m.default ?? m)],
  ['session-projection', () => import('@deepseek-ai/dsh-session-projection').then(m => m.default ?? m)],
  ['token-meter', () => import('@deepseek-ai/dsh-token-meter').then(m => m.default ?? m)],
  ['pruner', () => import('@deepseek-ai/dsh-compaction-tool-result-pruner').then(m => m.default ?? m)],
]

for (const [label, load] of order) {
  try {
    const plugin = await load()
    if (typeof plugin !== 'function') { console.log(`  ${label}: not a function export, skipped`); continue }
    await ctx.plugin(plugin, {})
    await new Promise(r => setTimeout(r, 50))
    console.log(`  ${label}: mounted`)
  } catch (e) {
    console.log(`  ${label}: failed -> ${e.message.split('\n')[0]}`)
  }
}

console.log('\n=== Service visibility after the full chain ===')
for (const name of ['tokenMeter', 'toolResultPruner', 'sessionProjections']) {
  const v = ctx.get(name)
  console.log(`  ctx.get('${name}') -> ${v !== undefined ? 'visible' : 'undefined'}`)
}

console.log('\n=== Verdict ===')
const visible = ['tokenMeter', 'toolResultPruner'].some(n => ctx.get(n) !== undefined)
if (visible) {
  console.log('  Services ARE reachable. The earlier "unreachable" result was a')
  console.log('  test-harness artefact, not a property of the system.')
} else {
  console.log('  Chain still incomplete — the question is UNRESOLVED, not answered.')
  console.log('  Do not report "plugins cannot reach services" from this.')
}
