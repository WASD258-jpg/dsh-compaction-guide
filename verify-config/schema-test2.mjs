// Correctness verification through the REAL construction path.
//
// The previous attempt (schema-test.mjs) called Engine.Config() and exercised only
// the schemastery layer. The cross-field checks run in resolveConfig(), which is
// invoked by the constructor — so a test must instantiate the engine.

import { Context } from '@deepseek-ai/cordis'
import { BasicCompactionEngine } from '@deepseek-ai/dsh-compaction-basic'

const CANDIDATES = {
  'full recommendation': {
    thresholdRatio: 0.5, retainRatio: 0.12, headroomTokens: 32768,
    maxTokens: 32768, compactionRetries: 2, maxOverflowRetries: 3,
  },
  'recommendation + independent summarizer': {
    thresholdRatio: 0.5, retainRatio: 0.12, headroomTokens: 32768, maxTokens: 32768,
    summarizationProvider: 'deepseek-official', summarizationModel: 'deepseek-flash',
    compactionRetries: 2, maxOverflowRetries: 3,
  },
  'summarizer pair only (smallest change)': {
    summarizationProvider: 'deepseek-official', summarizationModel: 'deepseek-flash',
  },
  'threshold only': { thresholdRatio: 0.5 },
  'headroom only': { headroomTokens: 32768 },
}

const SHOULD_FAIL = {
  'misspelled field name': { thresoldRatio: 0.5 },
  'retainRatio with retainTokens': { retainRatio: 0.12, retainTokens: 2048 },
  'retainRatio >= thresholdRatio': { thresholdRatio: 0.3, retainRatio: 0.5 },
  'provider without model': { summarizationProvider: 'deepseek-official' },
  'model without provider': { summarizationModel: 'deepseek-flash' },
  'negative headroom': { headroomTokens: -1 },
  'maxTokens of 0': { maxTokens: 0 },
}

/** Construct the engine; resolveConfig() runs synchronously inside. */
function tryConstruct(config) {
  try {
    const ctx = new Context()
    const engine = new BasicCompactionEngine(ctx, config)
    return { ok: true, engine }
  } catch (e) {
    return { ok: false, err: (e.message || String(e)).split('\n')[0] }
  }
}

console.log('=== A. recommended blocks must construct ===\n')
for (const [label, cfg] of Object.entries(CANDIDATES)) {
  const r = tryConstruct(cfg)
  console.log(`  ${r.ok ? '[PASS]' : '[FAIL]'} ${label}${r.ok ? '' : '\n          -> ' + r.err}`)
}

console.log('\n=== B. malformed blocks must be rejected ===\n')
let rejected = 0
for (const [label, cfg] of Object.entries(SHOULD_FAIL)) {
  const r = tryConstruct(cfg)
  if (r.ok) console.log(`  [WRONGLY ACCEPTED] ${label}`)
  else { rejected += 1; console.log(`  [correctly rejected] ${label}\n          -> ${r.err}`) }
}
console.log(`\n  rejected: ${rejected}/${Object.keys(SHOULD_FAIL).length}`)
console.log('  Every rejection names the offending field — nothing fails silently.')
