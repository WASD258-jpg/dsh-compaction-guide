// ARCHIVED FAILED ATTEMPT — see archive-pruner-probe/README.md.
//
// This attempt produced a MISLEADING conclusion: it reported "unreachable" for a
// service that had never been registered, then generalised that to "plugins
// cannot access other plugins' services" — a claim the harness could not support.
//
// Kept because the failure mode is instructive and it recurred three times in
// this study.

import { Context } from '@deepseek-ai/cordis'
import Pruner from '@deepseek-ai/dsh-compaction-tool-result-pruner'
import TokenMeter from '@deepseek-ai/dsh-token-meter'

console.log('=== Experiment 1: same-layer mount, is the service visible? ===')
{
  const ctx = new Context()
  await ctx.plugin(TokenMeter)
  await ctx.plugin(Pruner, {})
  console.log(`  ctx.get('tokenMeter')       -> ${ctx.get('tokenMeter') !== undefined ? 'visible' : 'NOT visible'}`)
  console.log(`  ctx.get('toolResultPruner') -> ${ctx.get('toolResultPruner') !== undefined ? 'visible' : 'NOT visible'}`)
}

console.log('\n=== Experiment 2: does isolate affect visibility? ===')
{
  const ctx = new Context()
  await ctx.plugin(TokenMeter)
  const isolated = ctx.isolate('test')
  await isolated.plugin(Pruner, {})
  console.log(`  outer ctx.get('toolResultPruner') -> ${ctx.get('toolResultPruner') !== undefined ? 'visible' : 'NOT visible'}`)
  console.log(`  inner get('toolResultPruner')     -> ${isolated.get('toolResultPruner') !== undefined ? 'visible' : 'NOT visible'}`)
}

console.log('\n=== Experiment 3: does a Service subclass auto-provide? ===')
{
  const ctx = new Context()
  await ctx.plugin(TokenMeter)
  await ctx.plugin(Pruner, {})
  const root = ctx.root ?? ctx
  const names = Object.keys(root.props ?? {})
  console.log(`  root.props service names: ${names.length ? names.join(', ') : '(empty)'}`)
}

console.log('\n=== Experiment 4: alternative access forms ===')
{
  const ctx = new Context()
  await ctx.plugin(TokenMeter)
  await ctx.plugin(Pruner, {})
  console.log(`  ctx.get('toolResultPruner')         -> ${ctx.get('toolResultPruner') !== undefined}`)
  console.log(`  ctx.root?.get?.('toolResultPruner') -> ${ctx.root?.get?.('toolResultPruner') !== undefined}`)
}

console.log('\n=== Conclusion ===')
console.log('  Nothing is visible — but that is because NOTHING REGISTERED.')
console.log('  Each plugin declares its own inject, and a bare Context satisfies none')
console.log('  of them, so no service is ever provided.')
console.log('')
console.log('  This script states its finding far too broadly. The corrected result is')
console.log('  in ../depchain-test.mjs and ../pathb-final.mjs: with the full chain')
console.log('  mounted, the service IS reachable and callable [O26].')
