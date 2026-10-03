// Resolve every source citation in REFERENCES.md against a pinned upstream
// checkout, and report the real line numbers.
//
// A citation-based repository lives or dies on this: a reader who follows a
// citation to the wrong line loses trust in every other claim. Line numbers are
// resolved by pattern-matching, never transcribed by hand.
//
// Usage:
//   node check-refs.mjs [path-to-upstream-checkout]
//   DSH_SRC=/path/to/deepseek-harness node check-refs.mjs

import fs from 'node:fs'
import path from 'node:path'

const root = process.argv[2] ?? process.env.DSH_SRC
if (!root) {
  console.error('Usage: node check-refs.mjs <path-to-upstream-checkout>')
  console.error('   or: DSH_SRC=<path> node check-refs.mjs')
  process.exit(2)
}

const PKG = path.join(root, 'packages')
if (!fs.existsSync(PKG)) {
  console.error(`not found: ${PKG}`)
  console.error('Pass the root of a deepseek-harness checkout.')
  process.exit(2)
}

/** Each claim: citation id, path relative to packages/, unique locating pattern, description. */
const CLAIMS = [
  ['S1',  'llm/llm-deepseek/src/transport.ts',             'isContextWindowExceededError(detail)',          'classification order'],
  ['S2',  'llm/llm-deepseek/src/transport.ts',             'request failed (${',                            'fallback message'],
  ['S3',  'llm/llm/src/error.ts',                          'function isContextWindowExceededError',         'text-only regexes'],
  ['S4',  'compaction/compaction-basic/src/index.ts',      'failure.code !== CONTEXT_WINDOW_EXCEEDED_CODE', 'recovery gate'],
  ['S5',  'compaction/compaction-basic/src/index.ts',      'measurement, 0)',                               'zero retention budget'],
  ['S6',  'compaction/compaction-basic/src/summarizer.ts', '...input.messages,',                            'whole-region replay'],
  ['S7',  'compaction/compaction-basic/src/summarizer.ts', 'configured ?? latest',                          'target fallback'],
  ['S8',  'compaction/compaction-basic/src/summarizer.ts', 'ctx.llm.stream(options)',                       'direct call'],
  ['S9',  'compaction/compaction-basic/src/region.ts',     'accumulated >= retainTokens',                   'retention accumulation'],
  ['S10', 'compaction/compaction-basic/src/config.ts',     'thresholdTokens = Math.floor',                  'threshold formula'],
  ['S11', 'compaction/compaction-basic/src/index.ts',      'step compaction failed',                        'silent catch'],
  ['S12', 'llm/llm/src/retry-policy.ts',                   'DEFAULT_RETRYABLE_CODES',                       'retryable code set'],
  ['S13', 'llm/llm-pi-ai/src/catalog.ts',                  'defaultContextWindow',                          'context window fallback'],
]

console.log('Citation resolution\n')
console.log('ID    file:line')
console.log('---   ---------')

const results = []
for (const [id, rel, pattern, desc] of CLAIMS) {
  const full = path.join(PKG, rel.split('/').join(path.sep))
  if (!fs.existsSync(full)) {
    console.log(`${id.padEnd(5)} [file missing]  ${desc}`)
    results.push({ id, ok: false })
    continue
  }
  const lines = fs.readFileSync(full, 'utf8').split('\n')
  const hits = []
  lines.forEach((line, i) => { if (line.includes(pattern)) hits.push(i + 1) })
  if (hits.length === 0) {
    console.log(`${id.padEnd(5)} [pattern miss]  ${desc}`)
    results.push({ id, ok: false })
  } else {
    const name = path.basename(rel)
    console.log(`${id.padEnd(5)} ${name}:${hits[0]}`.padEnd(30) + desc)
    results.push({ id, ok: true, file: rel, line: hits[0], allHits: hits })
  }
}

const ok = results.filter(r => r.ok).length
console.log(`\nResolved: ${ok}/${results.length}`)

const bad = results.filter(r => !r.ok)
if (bad.length) {
  console.log('Unresolved: ' + bad.map(r => r.id).join(', '))
  console.log('\nA citation that does not resolve means REFERENCES.md is wrong for')
  console.log('this revision. Either fix the pattern or pin a different commit.')
  process.exit(1)
}

console.log('\nAll citations resolve against this checkout.')
console.log('Update REFERENCES.md if any line number has moved:')
for (const r of results) {
  const note = r.allHits.length > 1 ? `  (all hits: ${r.allHits.join(', ')})` : ''
  console.log(`  ${r.id}: ${r.file}:${r.line}${note}`)
}
