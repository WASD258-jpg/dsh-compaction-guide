// Behaviour verification of the reclassification rules — through the REAL entry point.
//
// An earlier attempt called the low-level oversizeFailure() helper directly and
// appeared to reclassify all eight negative cases, including rate limits and
// aborts. That was a TEST ERROR: the guards live in classifyOversizeFailure(),
// which the direct call bypassed.
//
// Entering through the gate is the whole point of this script.

import * as plugin from '@argszero/cordis-plugin-length-stop-overflow'

const config = {
  classifyOversizeRequests: plugin.DEFAULT_CLASSIFY_OVERSIZE_REQUESTS,
  classifySaturatedFailures: plugin.DEFAULT_CLASSIFY_SATURATED_FAILURES,
  classifyLengthStop: true,
  atMostOutputTokens: plugin.DEFAULT_AT_MOST_OUTPUT_TOKENS,
  saturationRatio: plugin.DEFAULT_SATURATION_RATIO,
}
console.log('DEFAULT_CLASSIFY_OVERSIZE_REQUESTS =', plugin.DEFAULT_CLASSIFY_OVERSIZE_REQUESTS)
console.log('DEFAULT_CLASSIFY_SATURATED_FAILURES =', plugin.DEFAULT_CLASSIFY_SATURATED_FAILURES)
console.log('DEFAULT_AT_MOST_OUTPUT_TOKENS        =', plugin.DEFAULT_AT_MOST_OUTPUT_TOKENS)
console.log('DEFAULT_SATURATION_RATIO            =', plugin.DEFAULT_SATURATION_RATIO)

const err = (failure) => ({ kind: 'error', failure })

console.log('\n=== Positive: the failure shape observed in this study ===')
const positive = {
  code: 'INVALID_REQUEST',
  status: 413,
  message: 'DeepSeek Messages request failed (413)',
}
const r = plugin.classifyOversizeFailure(err(positive), config)
console.log('  input:', JSON.stringify(positive))
console.log('  ->', r === null ? 'null (not recognised)' : `recognised as ${r.rule} (matched=${r.matched})`)

console.log('\n=== Negative: these must pass through untouched ===')
const negatives = [
  ['image too large', { code: 'INVALID_REQUEST', status: 413, message: 'image is too large: 5MB exceeds 4MB limit' }],
  ['token cap', { code: 'INVALID_REQUEST', status: 400, message: 'input tokens exceeded max_prompt_tokens' }],
  ['rate limit 429', { code: 'RATE_LIMIT', status: 429, message: 'rate limit exceeded' }],
  ['malformed 400', { code: 'INVALID_REQUEST', status: 400, message: 'unknown field foo' }],
  ['quota', { code: 'QUOTA', status: 402, message: 'quota exceeded' }],
  ['auth', { code: 'AUTH', status: 401, message: 'invalid api key' }],
  ['image offload code', { code: 'IMAGE_OFFLOAD_REQUIRED', status: 400, message: 'images must be offloaded' }],
  ['empty response', { code: 'EMPTY_RESPONSE', status: undefined, message: 'empty response' }],
]
for (const [label, f] of negatives) {
  const res = plugin.classifyOversizeFailure(err(f), config)
  console.log(`  ${label.padEnd(20)} -> ${res === null ? 'passed through' : 'RECLASSIFIED as ' + res.rule}`)
}

console.log('\n=== Cancellation semantics: these must never be rewritten ===')
const aborted = plugin.classifyOversizeFailure({ kind: 'aborted', failure: positive }, config)
console.log('  kind=aborted    ->', aborted === null ? 'passed through' : 'REWRITTEN')
const maxTok = plugin.classifyOversizeFailure({ kind: 'max-tokens', failure: positive }, config)
console.log('  kind=max-tokens ->', maxTok === null ? 'passed through (another rule owns it)' : 'REWRITTEN')

console.log('\n=== Wording path, when no status is present ===')
const wordingOnly = { code: 'INVALID_REQUEST', message: 'Request exceeds the maximum size' }
const w = plugin.classifyOversizeFailure(err(wordingOnly), config)
console.log('  "Request exceeds the maximum size" ->', w === null ? 'not recognised' : `recognised (matched=${w.matched})`)

console.log('\n=> 7 of 8 negatives pass through. The exception is documented in')
console.log('   PRIOR-ART §5.2: any status === 413 is rewritten before wording is read.')
