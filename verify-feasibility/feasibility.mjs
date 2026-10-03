// 决定性前提验证：插件 C 能否真正「阻止」压缩尝试？
// 这是整个方案的成立基础——如果只能观测而不能干预，那它就不是熔断器，
// 只是个日志增强，价值大打折扣。
//
// 关键问题：agent/pre-step 是 waterfall，插件能否在 compaction-basic 之前
// 拦截并短路？

const fs = await import('node:fs')

const SRC = 'E:\\DSH-Lab\\src\\packages\\compaction\\compaction-basic\\src\\index.ts'
const text = fs.readFileSync(SRC, 'utf8')

console.log('=== 1. compaction-basic 在 agent/pre-step 上的注册 ===\n')
const lines = text.split('\n')
const idx = lines.findIndex(l => l.includes("ctx.on('agent/pre-step'"))
if (idx === -1) { console.log('  未找到'); process.exit(1) }
for (let i = idx; i < Math.min(idx + 16, lines.length); i++) {
  console.log(`  L${i + 1}: ${lines[i]}`)
}

console.log('\n=== 2. 关键判定：waterfall 的短路语义 ===\n')
console.log('  已确认（Cordis 源码 cordis/lib/index.js:317-325）：')
console.log('    waterfall(...) { const cbs = dispatch(...); const next = () => (cbs.shift() ?? inner)(...args)')
console.log('    → cbs.shift() 按注册顺序，先注册先跑')
console.log('    → prepend: true 走 unshift 插队首')
console.log('')
console.log('  但关键问题是：pre-step 监听器能否「阻止后续监听器运行」？')
console.log('  看 compaction-basic 自己的实现——它调用了 next() 吗？')

const block = lines.slice(idx, idx + 16).join('\n')
const callsNext = /\bnext\(\)/.test(block)
console.log(`\n  compaction-basic 的 pre-step 监听器是否调用 next(): ${callsNext ? '是' : '否'}`)

console.log('\n=== 3. 若它总是调用 next()，则插件无法阻断它 ===\n')
console.log('  这意味着：')
console.log('    ✗ 插件 C 不能「阻止 compaction 运行」')
console.log('    ✓ 插件 C 只能「观测 + 建议 + 通过其他手段干预」')
console.log('')
console.log('  需要找其他干预点。候选：')

// 找有没有可用的干预点
const candidates = [
  ['agent/pre-step', 'before 钩子，但 compaction 已注册，顺序竞争'],
  ['agent/status', '状态变化通知，只读'],
  ['session/event', '事件流观测，只读'],
  ['compaction/*', '压缩自身事件，观测用'],
]
for (const [name, note] of candidates) {
  const found = text.includes(name)
  console.log(`    ${found ? '○' : '×'} ${name.padEnd(18)} ${note}`)
}

console.log('\n=== 4. 结论 ===')
console.log('  插件 C 的可达目标：')
console.log('    (a) 观测失败并计数           ✓ 可行（session/event）')
console.log('    (b) 在 UI/日志给出可见告警   ✓ 可行（ctx.logger + 事件）')
console.log('    (c) 真正阻断压缩尝试         ? 取决于能否抢到 pre-step 且短路')
console.log('')
console.log('  (c) 需实测验证 —— 这是决定工程量的分水岭。')