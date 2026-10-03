// Translate remaining Chinese comments in verification scripts to English.
// Documentation stays bilingual (README.md + README.zh.md); only code comments
// are unified, since a public repository's scripts are read by contributors.

import fs from 'node:fs'
import path from 'node:path'

const root = process.argv[2] ?? process.cwd()

const TARGETS = [
  'tools/doctor.mjs',
  'verify-argszero/behavior2.mjs',
  'verify-argszero/verify.mjs',
  'verify-config/depchain-test.mjs',
  'verify-config/fidelity-test.mjs',
  'verify-config/pathb-final.mjs',
  'verify-config/risk-test.mjs',
  'verify-config/schema-test.mjs',
  'verify-config/schema-test2.mjs',
  'verify-config/archive-pruner-probe/isolation-test.mjs',
  'verify-config/archive-pruner-probe/pruner-service.mjs',
  'verify-config/archive-pruner-probe/pruner-service2.mjs',
  'verify-config/archive-pruner-probe/pruner-service3.mjs',
  'verify-config/archive-pruner-probe/realm-test.mjs',
  'verify-feasibility/assess.mjs',
]

console.log('Files containing Chinese comments:\n')
for (const rel of TARGETS) {
  const full = path.join(root, rel)
  if (!fs.existsSync(full)) { console.log(`  missing: ${rel}`); continue }
  const text = fs.readFileSync(full, 'utf8')
  const cn = text.split('\n').filter(l => /[\u4e00-\u9fff]/.test(l))
  console.log(`  ${rel}: ${cn.length} line(s)`)
  for (const l of cn.slice(0, 3)) console.log(`      ${l.trim().slice(0, 70)}`)
}

console.log('\nRewriting is done per-file by hand; this script only reports scope.')
