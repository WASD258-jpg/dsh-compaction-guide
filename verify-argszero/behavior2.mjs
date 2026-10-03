// 修正版行为验证：走正确的入口 classifyOversizeFailure，
// 它内部有 RECOVERY_OWNED_CODES / reason.kind 等守卫，直接调 oversizeFailure 会绕过它们。

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

console.log('\n=== 正向：我们日志里确证的真实失败必须被识别 ===')
const positive = {
  code: 'INVALID_REQUEST',
  status: 413,
  message: 'DeepSeek Messages request failed (413)',
}
const r = plugin.classifyOversizeFailure(err(positive), config)
console.log('  输入:', JSON.stringify(positive))
console.log('  →', r === null ? 'null（未识别）✗' : '识别为 ' + r.rule + ' (matched=' + r.matched + ') ✓')

console.log('\n=== 反向：不该识别的必须放过（走真实入口）===')
const negatives = [
  ['图片过大',        { code: 'INVALID_REQUEST', status: 413, message: 'image is too large: 5MB exceeds 4MB limit' }],
  ['token 上界',      { code: 'INVALID_REQUEST', status: 400, message: 'input tokens exceeded max_prompt_tokens' }],
  ['限流 429',        { code: 'RATE_LIMIT', status: 429, message: 'rate limit exceeded' }],
  ['普通畸形 400',    { code: 'INVALID_REQUEST', status: 400, message: 'unknown field foo' }],
  ['配额耗尽',        { code: 'QUOTA', status: 402, message: 'quota exceeded' }],
  ['认证失败',        { code: 'AUTH', status: 401, message: 'invalid api key' }],
  ['图片卸载专用码',  { code: 'IMAGE_OFFLOAD_REQUIRED', status: 400, message: 'images must be offloaded' }],
  ['空响应',          { code: 'EMPTY_RESPONSE', status: undefined, message: 'empty response' }],
]
for (const [label, f] of negatives) {
  const res = plugin.classifyOversizeFailure(err(f), config)
  console.log(`  ${label.padEnd(18)} → ${res === null ? '放过 ✓' : '误判 ✗ ' + res.rule}`)
}

console.log('\n=== 取消语义：kind=aborted 绝不能改写 ===')
const aborted = plugin.classifyOversizeFailure({ kind: 'aborted', failure: positive }, config)
console.log('  kind=aborted       →', aborted === null ? '放过 ✓' : '误判 ✗')
const maxTok = plugin.classifyOversizeFailure({ kind: 'max-tokens', failure: positive }, config)
console.log('  kind=max-tokens    →', maxTok === null ? '放过 ✓（由另一条规则处理）' : '误判 ✗')

console.log('\n=== 430/413 with size wording（无 status 时的措辞路径）===')
const wordingOnly = { code: 'INVALID_REQUEST', message: 'Request exceeds the maximum size' }
const w = plugin.classifyOversizeFailure(err(wordingOnly), config)
console.log('  "Request exceeds the maximum size" →', w === null ? '未识别' : `识别 ${w.rule} (matched=${w.matched})`)