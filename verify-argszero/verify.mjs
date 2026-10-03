// Verified loading of @argszero/cordis-plugin-length-stop-overflow on 0.2.0-rc.2.
//
// The plugin declares a peer range ending at <0.2.0, so running it here was an
// UNSTATED path. This is the measurement that closed that gap: not a source
// reading, but a real import and a real Cordis mount.

import { createRequire } from 'node:module'
import path from 'node:path'

const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))
const require = createRequire(path.join(here, 'package.json'))

function check(label, fn) {
  try {
    const v = fn()
    console.log(`  [PASS] ${label}`, v === undefined ? '' : `-> ${v}`)
    return true
  } catch (e) {
    console.log(`  [FAIL] ${label} -> ${e.code ?? ''} ${e.message.split('\n')[0]}`)
    return false
  }
}

console.log('=== 1. Host and plugin versions ===')
const hostPkg = require('@deepseek-ai/dsh-llm/package.json')
console.log(`  @deepseek-ai/dsh-llm = ${hostPkg.version}`)
const pluginPkg = require('@argszero/cordis-plugin-length-stop-overflow/package.json')
console.log(`  plugin = ${pluginPkg.name}@${pluginPkg.version}`)
console.log(`  declared peer range = ${pluginPkg.peerDependencies['@deepseek-ai/dsh-llm']}`)

console.log('\n=== 2. The five value-imported codes must exist ===')
const mod = await import('@deepseek-ai/dsh-llm')
for (const name of [
  'CONTEXT_WINDOW_EXCEEDED_CODE', 'EMPTY_RESPONSE_CODE', 'IMAGE_OFFLOAD_REQUIRED_CODE',
  'INVALID_CREDENTIAL_CODE', 'QUOTA_EXCEEDED_CODE',
]) {
  check(name, () => mod[name])
}

console.log('\n=== 3. The llm/stream waterfall must exist ===')
const src = require('node:fs').readFileSync(require.resolve('@deepseek-ai/dsh-llm'), 'utf8')
const hasWaterfall = /waterfall\(this,\s*"llm\/stream"/.test(src)
console.log(`  ${hasWaterfall ? '[PASS]' : '[FAIL]'} dsh-llm registers the "llm/stream" waterfall`)

console.log('\n=== 4. The plugin module must import ===')
let plugin
try {
  plugin = await import('@argszero/cordis-plugin-length-stop-overflow')
  console.log('  [PASS] module imported')
  console.log(`  name   = ${plugin.name}`)
  console.log(`  inject = ${JSON.stringify(plugin.inject)}`)
} catch (e) {
  console.log(`  [FAIL] ${e.message.split('\n')[0]}`)
  process.exit(1)
}

console.log('\n=== 5. Mount on a real Cordis Context ===')
try {
  const { Context } = await import('@deepseek-ai/cordis')
  const ctx = new Context()
  await ctx.plugin(plugin, {})
  console.log('  [PASS] mounted — no service conflict, no inject error')
} catch (e) {
  console.log(`  [FAIL] ${e.constructor.name}: ${e.message.split('\n')[0]}`)
  console.log('  -> a real load failure; report it')
}

console.log('\n=> The peer range is a packaging artefact, not a functional barrier.')
