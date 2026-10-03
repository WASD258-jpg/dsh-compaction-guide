// 修正版：pruner 是 Service class，用 `default` 导出挂载。
// 上一次传了模块命名空间对象（含 default/name/inject），Cordis 拒绝了。

import { Context } from '@deepseek-ai/cordis'
import mod from '@deepseek-ai/dsh-compaction-tool-result-pruner'

console.log('=== 1. 正确的挂载形态 ===')
console.log('  导入内容类型:', typeof mod)
console.log('  是 class:', /^class/.test(mod.toString().slice(0, 20)) || typeof mod === 'function')
console.log('  static inject:', JSON.stringify(mod.inject ?? '(无)'))
console.log('  static Config:', typeof mod.Config)

console.log('\n=== 2. 挂载并取服务 ===')
const ctx = new Context()
try {
  await ctx.plugin(mod, {})
  const svc = ctx.get('toolResultPruner')
  console.log('  挂载: 成功')
  console.log('  ctx.get("toolResultPruner") →', svc === undefined ? 'undefined' : '取到 ✓')
  if (svc) {
    const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(svc)).filter(n => n !== 'constructor')
    console.log('  服务方法:', methods.join(', '))
    console.log('  pruneSession 存在:', typeof svc.pruneSession === 'function')
    console.log('  pruneContent 存在:', typeof svc.pruneContent === 'function')
  }
} catch (e) {
  console.log('  挂载失败:', e.message.split('\n')[0])
}

console.log('\n=== 3. 第三方插件能否同样取到（模拟插件 C-lite）===')
const observer = class {
  static inject = { optional: ['toolResultPruner'] }
  constructor(c) {
    this.c = c
    const svc = c.get('toolResultPruner')
    console.log(`  插件 C-lite 视角: ctx.get("toolResultPruner") → ${svc ? '取到 ✓' : 'undefined ✗'}`)
    if (svc) {
      console.log(`  可调用的方法: ${Object.getOwnPropertyNames(Object.getPrototypeOf(svc)).filter(n => n !== 'constructor').join(', ')}`)
    }
  }
}
const ctx2 = new Context()
await ctx2.plugin(mod, {})
try { await ctx2.plugin(observer) } catch (e) { console.log('  观察者挂载失败:', e.message.split('\n')[0]) }

console.log('\n=== 4. 判定 ===')
console.log('  路径 B 的核心前提是「插件能独立调用 pruneSession」。')
console.log('  若上面显示「取到 ✓」，则该前提成立。')