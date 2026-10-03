// ARCHIVED FAILED ATTEMPT — see ../README.md.
//
// Wrong answer: "the service is unreachable."
//
// The module namespace object was passed to ctx.plugin() instead of the class.
// Cordis rejected it: "invalid plugin, expect function or object with an apply
// method, received object" — and the service was never registered.

import { Context } from '@deepseek-ai/cordis'
import * as mod from '@deepseek-ai/dsh-compaction-tool-result-pruner'

console.log('=== 1. Exported shape ===')
console.log('  default export type:', typeof mod.default)
console.log('  named exports:', Object.keys(mod).join(', '))

console.log('\n=== 2. Mount attempt (the mistake) ===')
try {
  const ctx = new Context()
  // WRONG: passing the namespace object, which has no apply method.
  await ctx.plugin(mod, {})
  console.log('  mounted (unexpected)')
} catch (e) {
  console.log('  failed:', e.message.split('\n')[0])
  console.log('  -> the namespace object is not a valid plugin')
}

console.log('\n=== 3. Verdict ===')
console.log('  This attempt proves nothing about the system. It fails because the')
console.log('  harness was constructed incorrectly — see ../pathb-final.mjs for the')
console.log('  corrected test, which mounts the class and queries the full chain.')
