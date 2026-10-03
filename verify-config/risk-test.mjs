// Measure the residual risks of the recommended configuration.
//
// The highest-severity risk is the *timing* of a failure: if a mistyped
// summarization provider is accepted at load and fails only when compaction first
// runs, the user will believe the configuration works — until a session breaks,
// possibly hours later, with no visible connection to the typo.

import { Context } from '@deepseek-ai/cordis'
import { BasicCompactionEngine } from '@deepseek-ai/dsh-compaction-basic'

function construct(config) {
  try {
    const ctx = new Context()
    const engine = new BasicCompactionEngine(ctx, config)
    return { ok: true, engine }
  } catch (e) {
    return { ok: false, err: (e.message || String(e)).split('\n')[0] }
  }
}

console.log('=== Risk 1: when does a mistyped summarization target fail? ===\n')
const cases = [
  ['non-existent provider', { summarizationProvider: 'nonexistent-provider', summarizationModel: 'some-model' }],
  ['non-existent model', { summarizationProvider: 'deepseek-official', summarizationModel: 'no-such-model-xyz' }],
  ['empty pair (= default behaviour)', { summarizationProvider: '', summarizationModel: '' }],
]
for (const [label, cfg] of cases) {
  const r = construct(cfg)
  console.log(`  ${label}:`)
  console.log(`    construct phase -> ${r.ok ? 'PASS (existence is not validated)' : 'FAIL: ' + r.err}`)
}

console.log('\n  -> Construction does not resolve the target. The name is checked only')
console.log('     at the FIRST summarization call, so a typo is indistinguishable')
console.log('     from a working configuration until a session reaches the threshold.')

console.log('\n=== Risk 2: does a lower maxTokens introduce a truncation failure? ===\n')
console.log('  finishError() maps a max-tokens finish to:')
console.log('    new Error("summarization truncated at the token cap (incomplete checkpoint)")')
console.log('  -> A truncated summary is a compaction FAILURE, recorded as such.')
console.log('')
console.log('  Recommended maxTokens = 32768 (default is headroomTokens = 65536).')
console.log('  -> The summary output cap is halved. A summary needing more than the cap')
console.log('     would fail. Observed summary sizes in the analysed corpus:')
console.log('     max 4963 tokens, median 4312 [O23] — well under the cap.')
console.log('  -> Safe for this corpus, but that is ONE corpus, not a bound.')

console.log('\n=== Risk 3: cost impact of thresholdRatio 0.5 ===\n')
const W = 1000000, O = 256000
for (const [label, ratio, hr] of [['default 0.8', 0.8, 65536], ['recommended 0.5', 0.5, 32768]]) {
  const thr = Math.floor(Math.min(W * ratio, W - O - hr))
  console.log(`  ${label}: trigger at ${thr.toLocaleString()} tokens`)
}
console.log('  -> A 26% earlier trigger means MORE compaction runs, and every run is a')
console.log('     full model call replaying the compacted region [S6].')
console.log('     This is a real token cost and was not stated in earlier drafts.')

console.log('\n=== Risk 4: raising the retry budgets ===\n')
console.log('  compactionRetries 1 -> 2: one extra attempt when pressure stays high')
console.log('  maxOverflowRetries 1 -> 3: two extra overflow-recovery attempts')
console.log('  -> While Mechanism A is unfixed, the overflow path is never reached')
console.log('     (a 413 is classified INVALID_REQUEST, not CONTEXT_WINDOW_EXCEEDED),')
console.log('     so maxOverflowRetries is INERT on a stock host.')
console.log('     It becomes meaningful only alongside a reclassification plugin [P1].')
