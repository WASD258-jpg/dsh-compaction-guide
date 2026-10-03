// Diagnose whether the test harness itself is faithful.
//
// An earlier attempt mounted a Service subclass on a bare Context and found
// ctx.props empty afterwards — meaning nothing registered, so every subsequent
// ctx.get() was meaningless. This script establishes that, so the harness's
// limitations are not mistaken for the system's.

import { Context } from '@deepseek-ai/cordis'
import TokenMeter from '@deepseek-ai/dsh-token-meter'

console.log('=== Why does a bare Context register nothing? ===\n')

const ctx = new Context()
console.log('immediately after construction:')
console.log(`  ctx.props keys: ${JSON.stringify(Object.keys(ctx.props ?? {}))}`)
console.log(`  ctx.root === ctx: ${ctx.root === ctx}`)

console.log('\nTokenMeter shape:')
console.log(`  typeof: ${typeof TokenMeter}`)
console.log(`  static inject: ${JSON.stringify(TokenMeter.inject ?? null)}`)
console.log(`  extends Service: ${/extends Service/.test(TokenMeter.toString())}`)

await ctx.plugin(TokenMeter)
console.log('\nafter mounting TokenMeter:')
console.log(`  ctx.props keys: ${JSON.stringify(Object.keys(ctx.props ?? {}))}`)
console.log(`  ctx.fiber exists: ${ctx.fiber !== undefined}`)
if (ctx.fiber) console.log(`  ctx.fiber.name: ${ctx.fiber.name}`)

console.log('\n=== The decisive detail: TokenMeter has its own dependency ===')
console.log(`  TokenMeter.inject = ${JSON.stringify(TokenMeter.inject)}`)
console.log('  Until that dependency is satisfied, the service is not provided,')
console.log('  so ctx.get("tokenMeter") returns undefined — which looks exactly')
console.log('  like "not exposed to plugins".')

console.log('\n=== Verdict ===')
console.log('  A bare Context is NOT a faithful harness for service-reachability')
console.log('  questions. Mount the full dependency chain first — see')
console.log('  depchain-test.mjs and pathb-final.mjs for the corrected result.')
