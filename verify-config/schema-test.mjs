// First correctness attempt — INSUFFICIENT, kept as evidence.
//
// This called BasicCompactionEngine.Config(config), which runs only the
// schemastery layer. Three malformed inputs passed, which is why schema
// validation is not the gate [O19]: the cross-field checks live in
// resolveConfig(), which runs at construction.
//
// See schema-test2.mjs for the result that counts.

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
  'summarizer pair only': {
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
  'negative headroom': { headroomTokens: -1 },
}

function tryConfig(label, config) {
  try {
    const parsed = BasicCompactionEngine.Config ? BasicCompactionEngine.Config(config) : undefined
    return { ok: true, parsed }
  } catch (e) {
    return { ok: false, err: e.message.split('\n')[0] }
  }
}

console.log('=== A. recommended blocks ===')
for (const [label, cfg] of Object.entries(CANDIDATES)) {
  const r = tryConfig(label, cfg)
  console.log(`  ${r.ok ? '[PASS]' : '[FAIL]'} ${label}${r.ok ? '' : ' -> ' + r.err}`)
}

console.log('\n=== B. malformed blocks (this is where the check falls short) ===')
for (const [label, cfg] of Object.entries(SHOULD_FAIL)) {
  const r = tryConfig(label, cfg)
  console.log(`  ${r.ok ? '[WRONGLY ACCEPTED] ' + label : '[correctly rejected] ' + label}`)
}

console.log('\n=> Schema validation alone accepts three malformed inputs.')
console.log('   Use schema-test2.mjs, which constructs the engine and runs resolveConfig().')
