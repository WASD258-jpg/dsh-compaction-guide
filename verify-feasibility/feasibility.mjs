// Determine where compaction-basic registers its pre-step listener, and whether
// any ordering advantage could let another plugin intercept the call.
//
// Usage:
//   node feasibility.mjs <path-to-upstream-checkout>
//   DSH_SRC=/path/to/deepseek-harness node feasibility.mjs

import fs from 'node:fs'
import path from 'node:path'

const root = process.argv[2] ?? process.env.DSH_SRC
if (!root) {
  console.error('Usage: node feasibility.mjs <path-to-upstream-checkout>')
  console.error('   or: DSH_SRC=<path> node feasibility.mjs')
  process.exit(2)
}

const SRC = path.join(root, 'packages', 'compaction', 'compaction-basic', 'src', 'index.ts')
if (!fs.existsSync(SRC)) {
  console.error(`not found: ${SRC}`)
  console.error('Pass the root of a deepseek-harness checkout.')
  process.exit(2)
}
const text = fs.readFileSync(SRC, 'utf8')

console.log('=== 1. Where compaction-basic registers on agent/pre-step ===\n')
const lines = text.split('\n')
const idx = lines.findIndex(l => l.includes("ctx.on('agent/pre-step'"))
if (idx === -1) { console.log('  not found'); process.exit(1) }
for (let i = idx; i < Math.min(idx + 20, lines.length); i++) {
  console.log(`  L${i + 1}: ${lines[i]}`)
}

console.log('\n=== 2. The decisive question: is next() called before or after the work? ===\n')
console.log('  Waterfall semantics (cordis/lib/index.js:317-325):')
console.log('    cbs.shift() runs listeners in registration order')
console.log('    prepend: true unshifts to the front')
console.log('')
const block = lines.slice(idx, idx + 20).join('\n')
const callsNext = /\bnext\(\)/.test(block)
const bodyBeforeNext = block.indexOf('compactIfNeeded') < block.lastIndexOf('next()')
console.log(`  listener calls next(): ${callsNext ? 'yes' : 'no'}`)
console.log(`  compactIfNeeded runs BEFORE next(): ${bodyBeforeNext ? 'yes' : 'no'}`)

console.log('\n=== 3. Consequence ===\n')
if (bodyBeforeNext) {
  console.log('  The compaction call executes inside the listener body, before next().')
  console.log('  Another plugin can only run EARLIER in the waterfall — but the call')
  console.log('  happens in a listener that comes later, so ordering does not help.')
  console.log('')
  console.log('  -> A plugin cannot intercept or block the compaction attempt.')
} else {
  console.log('  The call appears to run after next(); re-examine before concluding.')
}

console.log('\n=== 4. What remains reachable ===')
console.log('  (a) observe failures and count them     yes (session/event)')
console.log('  (b) surface a user-visible warning      yes (ctx.logger)')
console.log('  (c) block a compaction attempt          no  <- the breaker needs this')
