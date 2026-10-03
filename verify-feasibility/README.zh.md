[English](README.md) | **中文**

# 可行性 —— 为什么熔断器插件做不出来

支撑 [O24] 与 [`../PLAN.zh.md`](../PLAN.zh.md) 中 Gap 4 的结案。

## 本节为何存在

`PLAN.md` 最初提议做一个熔断器插件来应对机制 C —— 18 次连续压缩失败且退避不增长 [O11]。
该提议看似合理：计数失败、退避、停止重试。

**可行性测试表明插件无法实现它。** 本目录保留那次测试，因为
**一个能替别人省下同样功夫的否定性结论值得发表** —— 这一布局无法从任何单一扩展点看出来。

## 结论

熔断行为要求**在一次压缩尝试运行之前跳过它**。真正的障碍在于调用实际发生的位置：

```ts
// packages/compaction/compaction-basic/src/index.ts:158-176
ctx.on('agent/pre-step', async ({ agent, signal }, next) => {
  if (!signal.aborted) {
    try {
      const result = await this.compactIfNeeded(agent, 'pressure', signal)  // ← L164: runs HERE
      ...
    } catch (error) { /* logs and continues */ }
  }
  return next()                                                             // ← L175: only now
})
```

`compactIfNeeded` **在监听器自己的函数体内**执行，早于 `next()`。
waterfall 按注册顺序运行监听器，而 `prepend` 只改变该顺序 —— 它不会把调用移出监听器。
**因此赢得排序毫无收益：压缩已经跑完了。**

## 全部扩展点枚举

| 扩展点 | 能否阻断一次尝试 | 原因 |
|---|---|---|
| `agent/pre-step` | **否** | 调用在监听器函数体内，不在其 `next()` 之后 |
| `compaction/summary-error` | **否** | 只在失败**之后**触发；无法阻止下一次 |
| `llm/stream` | **否** | 包裹一次调用；无法决定不发生调用 |
| `session/event` | **否** | 只读观测 |
| surface 改写 | **否** | 治的是*更少触发*，不是*失败了别重试* |

## 修复实际需要什么

上游监听器内部的一个守卫：

```ts
// upstream only — no plugin can insert this
if (breakerTripped(session)) return next()
```

这需要一个跨 `pressure` 与 `context-overflow` 两条路径的会话级计数器、指数退避，
以及一个仅在上下文实质变化时才清除的熔断状态。[P4] 实现了正确的退避形态，
但只在 pressure 路径上、且只是作为子类 —— 计数器必须放在两条路径都能看到的地方。

## 插件*仍然*能做什么

列出这些，是为了不让否定性结论被夸大：

- **检测并报告该模式。** [`../tools/doctor.mjs`](../tools/doctor.mjs) 已能从会话日志中
  识别重试风暴 [O11]。
- **经 `session/event` 观测单次失败**，并给出用户可见的警告 —— 这本身就值得做，
  因为目前每次失败都只是一句裸的 `logger.warn` [S11]。
- **在失败之后介入**，经 `compaction/summary-error` waterfall —— 核心为扩展保留的
  唯一一个失败恢复点。

这些**没有一个能阻止**一次尝试，而阻止正是熔断器的用途。

## 文件

| 文件 | 用途 |
|---|---|
| `assess.mjs` | 核心逻辑原型（观测 → 计数 → 退避 → 熔断） |
| `feasibility.mjs` | 检查 `pre-step` 监听器是否调用 `next()` |
| `intervention-points.mjs` | 枚举每一个扩展点及其阻断能力 |

> **关于 `assess.mjs` 的说明。** 它「18 次调用减到 5 次」的结果假设熔断器能抑制尝试。
> **该假设是错误的**，因此这个数字说明的是*机制*，不是一个可达成的结果。
> 保留它是因为它展示了算术；不要把它当作收益来引用。

## 复现

```sh
node assess.mjs                # 核心逻辑，以及那个误导性的缩减数字
node feasibility.mjs <checkout>  # 展示函数体内的调用
node intervention-points.mjs <checkout>  # 枚举全部扩展点
```

需要一份上游源码检出，路径由参数或 `DSH_SRC` 传入：

```sh
git clone https://github.com/deepseek-ai/deepseek-harness.git /tmp/dsh
node feasibility.mjs /tmp/dsh
DSH_SRC=/tmp/dsh node intervention-points.mjs
```
