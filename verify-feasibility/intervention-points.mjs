// Enumerate every extension point that a plugin could use to influence
// compaction, and determine whether any can *suppress* an attempt.
//
// Do not conclude from a single failure — check every plausible position.
//
// Usage:
//   node intervention-points.mjs [path-to-upstream-checkout]
//   DSH_SRC=/path/to/deepseek-harness node intervention-points.mjs

import fs from 'node:fs'
import path from 'node:path'

const root = process.argv[2] ?? process.env.DSH_SRC
if (!root) {
  console.error('Usage: node intervention-points.mjs <path-to-upstream-checkout>')
  console.error('   or: DSH_SRC=<path> node intervention-points.mjs')
  process.exit(2)
}

const SRC = path.join(root, 'packages')
const read = (p) => fs.readFileSync(p, 'utf8')

const required = [
  'compaction/compaction-basic/src/index.ts',
  'llm/llm/src/index.ts',
  'compaction/compaction-tool-result-pruner/src/index.ts',
]
for (const rel of required) {
  if (!fs.existsSync(path.join(SRC, rel))) {
    console.error(`not found: ${path.join(SRC, rel)}`)
    console.error('Pass the root of a deepseek-harness checkout.')
    process.exit(2)
  }
}

console.log('=== Enumerating intervention points ===\n')

const compactionIndex = read(path.join(SRC, 'compaction/compaction-basic/src/index.ts'))

console.log('[1] llm/stream waterfall')
console.log('    Wraps every model call, including the summarization call.')
const llmIndex = read(path.join(SRC, 'llm/llm/src/index.ts'))
const hasStreamHook = /waterfall\(this,\s*['"]llm\/stream['"]/.test(llmIndex)
console.log(`    Present: ${hasStreamHook}`)
console.log('    Can it block an attempt: no.')
console.log('    It could rewrite a summarization request (a valid direction),')
console.log('    but it cannot decide that no request happens.')
console.log('')

console.log('[2] compaction/summary-error waterfall')
const hasRecover = /waterfall\(['"]compaction\/summary-error['"]/.test(compactionIndex)
console.log(`    Present: ${hasRecover}`)
console.log('    Fires only AFTER a summarization has already failed.')
console.log('    Can it block an attempt: no — but it is the one failure-recovery')
console.log('    point the core reserves for extensions.')
console.log('')

console.log('[3] session surface rewrite')
const pruner = read(path.join(SRC, 'compaction/compaction-tool-result-pruner/src/index.ts'))
const canReplace = /replace|surfaceOp/.test(pruner)
console.log(`    The pruner rewrites the surface: ${canReplace}`)
console.log('    Can it block an attempt: no — it addresses FEWER TRIGGERS,')
console.log('    not DO NOT RETRY A FAILING ONE. A different goal.')
console.log('')

console.log('[4] agent/pre-step (ruled out)')
console.log('    compaction-basic runs compactIfNeeded INSIDE its own listener body,')
console.log('    before its next() — so the compaction happens before any downstream')
console.log('    listener runs. Winning the waterfall ordering changes nothing.')
console.log('')

console.log('=== Conclusion ===')
console.log('  Needed for a breaker: skip an attempt BEFORE it happens.')
console.log('  Available: none.')
console.log('')
console.log('  The fix requires a guard inside the upstream pre-step listener:')
console.log('    if (breakerTripped(session)) return next()')
console.log('  That is an upstream change, not a plugin.')
