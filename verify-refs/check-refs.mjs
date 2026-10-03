// 核准 REFERENCES.md 中每条源码引用的行号，基于 0.2.1-alpha.1 (E:\DSH-Lab\src)
// 论文式仓库的行号必须可解析，混用两个版本的行号是硬伤。

import fs from 'node:fs'
import path from 'node:path'

const ROOT = 'E:\\DSH-Lab\\src\\packages'

// 每条：id → 相对路径 + 用于定位的唯一模式
const CLAIMS = [
  ['S1',  'llm/llm-deepseek/src/transport.ts',        'isContextWindowExceededError(detail)',              '分类顺序'],
  ['S2',  'llm/llm-deepseek/src/transport.ts',        'request failed (${',                                '兜底报文'],
  ['S3',  'llm/llm/src/error.ts',                     'function isContextWindowExceededError',             '文本正则'],
  ['S4',  'compaction/compaction-basic/src/index.ts', 'failure.code !== CONTEXT_WINDOW_EXCEEDED_CODE',     '恢复门'],
  ['S5',  'compaction/compaction-basic/src/index.ts', 'measurement, 0)',                                   'retainTokens=0'],
  ['S6',  'compaction/compaction-basic/src/summarizer.ts', '...input.messages,',                           '全量重放'],
  ['S7',  'compaction/compaction-basic/src/summarizer.ts', 'configured ?? latest',                         '摘要目标回落'],
  ['S8',  'compaction/compaction-basic/src/summarizer.ts', 'ctx.llm.stream(options)',                      '直连调用'],
  ['S9',  'compaction/compaction-basic/src/region.ts', 'accumulated >= retainTokens',                      '保留区累积'],
  ['S10', 'compaction/compaction-basic/src/config.ts', 'thresholdTokens = Math.floor',                     '阈值公式'],
  ['S11', 'compaction/compaction-basic/src/index.ts',  'step compaction failed',                           '静默 catch'],
  ['S12', 'llm/llm/src/retry-policy.ts',               'DEFAULT_RETRYABLE_CODES',                          '可重试码集'],
  ['S13', 'llm/llm-pi-ai/src/adapter.ts',              'defaultContextWindow',                             '窗口兜底'],
]

console.log('引用核准 — 基准: 0.2.1-alpha.1\n')
console.log('ID   文件:行   说明')
console.log('---  --------  ---------------------------')

const results = []
for (const [id, rel, pattern, desc] of CLAIMS) {
  const full = path.join(ROOT, rel.replace(/\//g, path.sep))
  if (!fs.existsSync(full)) {
    console.log(`${id.padEnd(4)} [缺文件]  ${desc}  (${rel})`)
    results.push({ id, ok: false, reason: 'file missing' })
    continue
  }
  const lines = fs.readFileSync(full, 'utf8').split('\n')
  const hits = []
  lines.forEach((line, i) => { if (line.includes(pattern)) hits.push(i + 1) })
  if (hits.length === 0) {
    console.log(`${id.padEnd(4)} [未命中]  ${desc}  (${rel})`)
    results.push({ id, ok: false, reason: 'pattern miss' })
  } else {
    console.log(`${id.padEnd(4)} ${path.basename(rel)}:${hits[0]}`.padEnd(14) + `  ${desc}`)
    results.push({ id, ok: true, file: rel, line: hits[0], allHits: hits })
  }
}

console.log('\n=== 汇总 ===')
const ok = results.filter(r => r.ok).length
console.log(`可解析: ${ok}/${results.length}`)
const bad = results.filter(r => !r.ok)
if (bad.length) console.log('问题项: ' + bad.map(r => r.id).join(', '))

console.log('\n=== 供 REFERENCES.md 更新的行号表 ===')
for (const r of results) {
  if (r.ok) console.log(`  ${r.id}: ${r.file}:${r.line}${r.allHits.length > 1 ? `   (全部命中: ${r.allHits.join(', ')})` : ''}`)
}