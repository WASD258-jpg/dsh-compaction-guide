// 实测：argszero 插件能否在 0.2.0-rc.2 上成功加载
// 这不是读源码推断，是真实 import + 真实 Cordis 挂载。

import { createRequire } from 'node:module'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))
const require = createRequire(path.join(here, 'package.json'))

function ok(label, fn) {
  try { const v = fn(); console.log(`  [PASS] ${label}`, v === undefined ? '' : `→ ${v}`) ; return { ok: true, v } }
  catch (e) { console.log(`  [FAIL] ${label} → ${e.code ?? ''} ${e.message.split('\n')[0]}`) ; return { ok: false, e } }
}

console.log('=== 1. 宿主版本核对 ===')
const hostPkg = require('@deepseek-ai/dsh-llm/package.json')
console.log(`  @deepseek-ai/dsh-llm = ${hostPkg.version}`)
const pluginPkg = require('@argszero/cordis-plugin-length-stop-overflow/package.json')
console.log(`  plugin = ${pluginPkg.name}@${pluginPkg.version}`)
console.log(`  plugin peer range = ${pluginPkg.peerDependencies['@deepseek-ai/dsh-llm']}`)

console.log('\n=== 2. 值导入的 5 个常量是否真实存在 ===')
const mod = await import('@deepseek-ai/dsh-llm')
for (const name of [
  'CONTEXT_WINDOW_EXCEEDED_CODE', 'EMPTY_RESPONSE_CODE', 'IMAGE_OFFLOAD_REQUIRED_CODE',
  'INVALID_CREDENTIAL_CODE', 'QUOTA_EXCEEDED_CODE',
]) {
  ok(name, () => mod[name])
}

console.log('\n=== 3. llm/stream waterfall 是否存在于 0.2.0-rc.2 ===')
const src = require('node:fs').readFileSync(
  require.resolve('@deepseek-ai/dsh-llm'), 'utf8')
const hasWaterfall = /waterfall\(this,\s*"llm\/stream"/.test(src)
console.log(`  ${hasWaterfall ? '[PASS]' : '[FAIL]'} dsh-llm 内部注册 "llm/stream" waterfall`)

console.log('\n=== 4. 插件模块本身能否 import ===')
let plugin
try {
  plugin = await import('@argszero/cordis-plugin-length-stop-overflow')
  console.log('  [PASS] module imported')
  console.log(`  exports: ${Object.keys(plugin).join(', ')}`)
  console.log(`  name   = ${plugin.name}`)
  console.log(`  inject = ${JSON.stringify(plugin.inject)}`)
} catch (e) {
  console.log(`  [FAIL] ${e.message.split('\n')[0]}`)
  process.exit(1)
}

console.log('\n=== 5. 用真实 Cordis 挂载插件（关键测试）===')
try {
  const { Context } = await import('@deepseek-ai/cordis')
  const ctx = new Context()
  await ctx.plugin(plugin, {})
  console.log('  [PASS] ctx.plugin(plugin) 挂载成功 — 无 service 冲突、无 inject 缺失报错')
  const listeners = ctx.lifecycle?._hooks?.['llm/stream']
  console.log(`  llm/stream 监听器注册数: ${listeners ? (listeners.length ?? 'n/a') : 'n/a'}`)
} catch (e) {
  console.log(`  [FAIL] ${e.constructor.name}: ${e.message.split('\n')[0]}`)
  console.log('  → 这是真实的加载失败，需要报告')
}