[English](EVIDENCE.md) | **中文**

# EVIDENCE —— 测量、复现、有效性

> **与 [`README.md`](README.md) 的关系。** README 陈述结论；本文档记录每一项结论
> 是如何取得的。标记 `[S…]`/`[O…]`/`[P…]` 解析于
> [`REFERENCES.md`](REFERENCES.md)。此处的每一个数字都由
> `tools/doctor.mjs` 重新生成。

---

## 1. 测量基础

### 1.1 会话日志

| 项目 | 值 |
|---|---|
| 位置 | `$DSH_HOME/sessions/<encoded-cwd>/<session-id>/session.v4.jsonl.zstd` |
| 扫描文件数 | **158** 个，分布于 **137** 个会话目录 [O1] |
| 格式 | zstd **多帧**拼接，magic `28 B5 2F FD` |
| 解码器 | Node.js v22.22.3 原生 `node:zlib.zstdDecompressSync` |

> **危害 [O2] —— 整缓冲区调用一次 `zstdDecompressSync` 会静默地只返回第一帧。**
> 在 `session-5f8b1111/session.v3.jsonl.zstd` 上实测：整缓冲区调用产出
> **188 字节**，而逐帧解码产出
> **25,048,287 字节、跨 709 帧（7,455 事件）**。不会抛出任何异常。
> 以那种方式算出的统计会低报而不报错。要按 magic 扫描，再逐帧解压。

### 1.2 官方源码

| 修订 | 提交 | 日期 | 角色 |
|---|---|---|---|
| `0.2.0-rc.2` | `639ed015` | 2026-09-29 | 被分析的发行构建 [S0a] |
| `0.2.1-alpha.1` | `5badb150` | 2026-10-03 | 撰写之时的 `master` [S0b] |

仓库：<https://github.com/deepseek-ai/deepseek-harness>

---

## 2. 语料级计数

> **在引用下文任何数字之前，先读这一段。** 一个会话目录保留着**同一会话的重叠快照**
> —— `session.jsonl.zstd`、`session.v3.jsonl.zstd`、`session.v4.jsonl.zstd` ——
> 它们是累积视图，不是互不重叠的片段。对每个文件计数会抬高每一个总数。
> 两种计数都会给出；去重后的那一个才是诚实的比率。

| 事件类型 | 每会话（去重） | 全部快照（合并） |
|---|---|---|
| `compaction/start` | **51** | 84 |
| `compaction/end` | **51** | 84 |
| **`compaction/summary`**（成功） | **9** | **21** |
| `compaction/prune` | — | 129 |
| **失败收尾**（携带 `error` 的 `compaction/end`） | **42** | **63** |

**成功率 9/51 = 17.6%**（去重），或跨全部快照 21/84 = 25.0%。
两种情况下算术都恰好闭合 —— 每一次 `start` 要么产出了 `summary`，要么以错误收尾。

膨胀直接可见：合并口径把 `session-5f8b1111` 按每个已存快照各列一次，
每次都是相同的 `starts = 22`。去重口径只列它一次。
曾发生压缩的三个会话，其每会话总数合计为 `22 + 22 + 7 = 51`，
与去重后的 `start` 计数完全一致。

> **选择快照是一个真实的取舍，不是细节。** 快照之间并非嵌套关系：
> 较晚的快照可能把事件压缩掉，于是它的事件总数可能*下降*，而最新时间戳*上升*。
> 在测试中，仅按事件数选择会静默地丢掉近期证据 —— 一个目录报告 5 次压缩而非 7 次，
> 且 413 失败完全消失。`tools/doctor.mjs` 以**时间新旧优先、体量其次**打分；
> `--merge` 则给出合并语义。

### 2.1 错误文本分布

`compaction/end` 把 `error` 持久化为由 `errorChain()` 产生的**扁平化字符串**。
`code`、`name` 与 `cause` 字段**不会被持久化** —— 因此「错误码分布」在这一层
物理上不可得，计数只能按渲染出来的文本取得。

| 计数（去重 / 合并） | 错误文本 |
|---|---|
| **40 / 60** | `pi-ai detected context overflow for model "<model>"` |
| 2 / 3 | `DeepSeek request aborted by caller` |

**溢出占全部压缩失败的 95%。** 这是结构性缺陷，不是偶发的不稳定。

### 2.2 HTTP 状态分布

| 状态 | 被赋予的 code | 去重 | 合并 |
|---|---|---|---|
| 413 | `INVALID_REQUEST` | **239** | 478 |
| 400 | `CONTEXT_WINDOW_EXCEEDED` | 9 | 14 |

**每一次 413 —— 100% —— 都被归类为 `INVALID_REQUEST`，零例外。**
每个样本都携带相同的兜底文本
`DeepSeek Messages request failed (413)`；**没有任何一个携带提供方撰写的
`error.message`**。

### 2.3 一个值得记录的假阳性

早期一轮通过全文搜索 `CONTEXT_WINDOW_EXCEEDED` 数出 **248 个「溢出命中」** [O13]。
那个数字**是错的**。有一个会话仅仅*讨论*了这个常量（读 `error.d.ts`、对它推理、
在提示词里引用它），就贡献了 66 个命中，而**真正的错误事件为零**。

> **方法论规则**：绝不要跨整个事件按子串计数。要按
> **结构化事件类型加负载字段**计数。全文匹配无法区分「发生了错误」与「提到了错误」。

同一危害也适用于 §2 中的快照问题：合并总数 [O4b]
是可复现的，但它们回答的是与去重总数 [O4] 不同的问题。两者都给出，
以免任何一个被误当成另一个。

---

## 3. 根因 A —— 413 误判

### 3.1 代码路径

`packages/llm/llm-deepseek/src/transport.ts:31-33`

```ts
else if (isContextWindowExceededError(detail)) code = 'CONTEXT_WINDOW_EXCEEDED'
else if (status === 400 || status === 413 || type === 'invalid_request_error') code = 'INVALID_REQUEST'
```

**顺序是正确的** —— 文本分类器先于状态码被查询。缺陷在它上游：当响应体不携带
`error.message` 时，适配器在 `transport.ts` 合成一条兜底信息，读作

```
DeepSeek Messages request failed (413)
```

其中不含任何 `context` 关键词。`isContextWindowExceededError`
（`packages/llm/llm/src/error.ts:58`）中的三条正则全部不命中，于是错误落到
`status === 413` 分支。

恢复钩子正是以该 code 为门控 ——
`packages/compaction/compaction-basic/src/index.ts:180`：

```ts
if (failure.code !== CONTEXT_WINDOW_EXCEEDED_CODE) return next()
```

**适配器自己的兜底字符串，击穿了它所喂给的分类器。**

### 3.2 后果链

```
provider returns 413 with an empty body
  → adapter synthesizes "DeepSeek Messages request failed (413)"   (no context keyword)
  → isContextWindowExceededError misses on all three regexes
  → status === 413  →  INVALID_REQUEST
  → compaction-basic:180 gate does not match  →  return next()
  → overflow recovery never runs
  → context is never reclaimed
  → session stalls
  → user runs /rescue  →  UI shows "已交接"
```

### 3.3 对照实验 —— 同一会话、同一模型、同一窗口

可得的证据中最干净的一条。在单个会话内，两种状态都出现了：

| 状态 | 被归类为 | 触发压缩？ | 结果 |
|---|---|---|---|
| **400** | `CONTEXT_WINDOW_EXCEEDED` | **3 次**，间隔 **+9 ms / +25 ms / +32 ms** | **全部成功** |
| **413** | `INVALID_REQUEST` | **从未** | 失败 |

**同一会话、同一模型、同一申报窗口。唯一的变量是 HTTP 状态码。**
这排除了「压缩逻辑本身坏了」—— 只要逻辑被走到，它就是有效的。

### 3.4 「已交接」的因果方向

交接**不是**压缩失败的后果。被交接的那个会话 `failedEnds = 0`，
且在交接时刻**压缩次数为零**。
链条是：请求失败 → 压缩从未触发 → 会话停滞 → **用户**运行 `/rescue` → 交接。
时间戳证实了这点：`session/title` 与 `handoffs.jsonl.at` 共享同一个毫秒值
`1789659712327`，而发起事件的 `source.kind` 是 `"user"`。

---

## 4. 根因 B —— 摘要请求无界

### 4.1 三行相互作用的代码

`summarizer.ts:145-155` —— 一个请求逐字携带整个区域：

```ts
const messages: RequestMessage[] = [
  ...input.messages,
  deepFreeze({ role: 'user', content: [{ type: 'text', text: COMPACTION_INSTRUCTION }] }),
]
```

`index.ts:299` —— 溢出路径传入 `retainTokens = 0`：

```ts
const range = selectCompactableRange(agent.session, measurement, 0)
```

在 `retainTokens = 0` 下，`selectCompactableRange`（`region.ts`）在第一次迭代
就跳出累加循环（`accumulated >= 0` 立即为真），于是 `keepFromIdx` 落在
`length − 1` —— **被保留的尾部只有单个节点，而压缩区域扩张到几乎整个表面。**

`summarizer.ts:137` —— 摘要目标回落到实时路由：

```ts
const target = configured ?? latest ?? agentTarget
```

`configured` 是（默认为空的）`summarizationProvider`/`summarizationModel` 组合；
`latest` 是**该会话当前路由到的模型**。

**结果是：整个被压缩区被原样送出去，没有任何体积守卫，且用的就是会话当前所在的路由。**
这个请求是否装得下，并不由摘要器决定 —— 它由会话在那一刻恰好所在的
路由窗口决定。

### 4.2 对照实验 —— 唯一的变量是会话所在的路由

本节早期版本把这个对照呈现为「窗口大小」，并把 `5f8b1111` 标注为在
`stealth/ox-alpha` 上跑摘要。**那是对数据的误读，此处更正。**

实测的 `compaction/summary` 载荷记录了摘要器自己的 `provider` 与 `model`。
在 `5f8b1111` 中，该次摘要在 `deepseek-official/deepseek-v4-flash` 上运行
—— 一条 **1,000,000** token 的路由 —— 并且**成功了**。整个会话中真正变化的是
**会话所在的路由**，而失败与它精确同步：

| 当时生效的路由（声明的 `contextWindow`） | 压缩次数 | 成功 | 失败 |
|---|---|---|---|
| `deepseek-official/deepseek-v4-flash`（**1,000,000**） | 1 | **1** | 0 |
| `openrouter/stealth/ox-alpha`（**262,144**） | 18 | 0 | **18** |
| 切回 `deepseek-v4-flash`（**1,000,000**） | — | — | 无 |

每一次失败都带着它失败时所用的模型名：

```
pi-ai detected context overflow for model "stealth/ox-alpha"
```

跨会话同样成立：`c0acb35e` 运行在 1,000,000 token 路由上，压缩 **7/7** 成功。

**物证，正确地读。** 失败会话中那唯一一次成功携带 `shadowedTokenCount` =
**557,896**、`inputTokens` = **791,091**。由于载荷同时记录了
`provider: deepseek-official` 与 `model: deepseek-v4-flash`，那次请求送进的是
一个 **1,000,000** token 的窗口 —— 因此它并未溢出，而把它描述成
「557K token 被推进 262K 窗口」是错的。

本节所记录的缺陷是真实的，但它是**缺少守卫**，不是窗口太小：
同一个 791,091 token 的请求落在 262,144 token 的路由上就会失败，
而摘要器里没有任何东西会阻止它。

### 4.3 为什么摘要失败无法自愈

`summarizer.ts:162` 通过**直接**的 `ctx.llm.stream()` 调用发出请求 ——
它**不**经过 agent 循环。唯一的溢出恢复入口是 `agent/request-error`
瀑布流，由该循环派发（`packages/core/agent-loop/src/...`）。因此一次直接调用
**永远不会派发 `agent/request-error`**，它的溢出也就永远到不了恢复路径。

次级钩子 `compaction/summary-error` 在已发布的组合中只有一个监听者 ——
`compaction-image-offload` —— 而它只处理
`IMAGE_OFFLOAD_REQUIRED_CODE`，对其他一切都返回 `false`。

**净效果：摘要溢出完全没有恢复路径。**

---

## 5. 根因 C —— 无退避、无熔断器、无可见性

`index.ts`（`agent/pre-step` 监听者）捕获每一个失败并记录它：

```ts
catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  ctx.logger.warn(`step compaction failed: ${message}; continuing the turn`)
}
```

回合继续，上下文依旧满的，下一步再次触发压缩。`maxOverflowRetries`（默认 1）
**仅**在 `agent/request-error` 路径上计数；`pressure` 路径**没有全局重试计数器**。

### 5.1 实测重试间隔

来自最糟的会话（22 次启动）：

| 指标 | 值 |
|---|---|
| 单个回合内的连续失败 | **18** |
| 最小间隔 | 76,631 ms |
| 中位间隔 | 101,173 ms |
| 最大间隔 | 778,069 ms |
| 总失败跨度 | 5,391 s（**89.9 分钟**） |

**间隔不随失败次数增长。** 退避会显示递增的空隙；这里显示的是平坦分布 ——
重试是无条件的。

---

## 6. 跨版本状态

将 `0.1.6-alpha.1` 与 `0.2.0-rc.2` 对比：

| 项目 | 状态 |
|---|---|
| 阈值计算（输出预留） | **已修复** —— `resolveCompactSpec` 增加了 `reservedCompletionTokens` |
| 溢出路径上的 `selectCompactableRange(..., 0)` | **未变** —— 旧 `L899`、新 `L932`，逐字节相同 |
| `pre-step` catch 中静默的 `logger.warn` | **未变** |
| pressure 路径上没有全局重试计数器 | **未变** |
| `buildSummarizationInput` 中整区域重放 | **未变** |

针对 `master` `0.2.1-alpha.1`（`5badb150`，2026-10-03）再次核实：
**`selectCompactableRange(agent.session, measurement, 0)` 仍然存在。**

---

## 7. 复现

### 7.1 逐帧解码会话日志

```js
import fs from 'node:fs'
import zlib from 'node:zlib'

const MAGIC = [0x28, 0xb5, 0x2f, 0xfd]

function decode(file) {
  const buf = fs.readFileSync(file)
  const offsets = []
  for (let i = 0; i + 4 <= buf.length; i += 1) {
    if (buf[i] === MAGIC[0] && buf[i + 1] === MAGIC[1]
      && buf[i + 2] === MAGIC[2] && buf[i + 3] === MAGIC[3]) offsets.push(i)
  }
  const parts = []
  for (let i = 0; i < offsets.length; i += 1) {
    const slice = buf.subarray(offsets[i], i + 1 < offsets.length ? offsets[i + 1] : buf.length)
    try { parts.push(zlib.zstdDecompressSync(slice)) } catch { /* incomplete tail frame */ }
  }
  return Buffer.concat(parts).toString('utf8')
}

const events = decode(process.argv[2]).split('\n')
  .filter(Boolean)
  .flatMap(line => { try { return [JSON.parse(line)] } catch { return [] } })

const counts = {}
for (const e of events) counts[e.type] = (counts[e.type] ?? 0) + 1
console.log(counts)
```

### 7.2 按结构化负载计数失败，而不是按子串

```js
const ends = events.filter(e => e.type === 'compaction/end')
const failed = ends.filter(e => e.data?.error !== undefined)
const byText = {}
for (const e of failed) byText[e.data.error] = (byText[e.data.error] ?? 0) + 1
console.table(byText)
```

### 7.3 在没有真实提供方的情况下复现分类缺陷

```js
// Mirrors llm/src/error.ts:58
const STRUCTURED = /(?:^|[^a-z0-9])context[\s_-](?:length|window)[\s_-](?:exceed(?:ed|s)?|overflow(?:ed)?|limit[\s_-]exceeded)(?:$|[^a-z0-9])/i
const TOO_LARGE = /\b(?:request|prompt|input|messages?)\s+(?:is\s+|are\s+)?too\s+(?:large|long)\s+for\s+(?:(?:this|the)\s+)?(?:model(?:'s)?\s+)?context(?:\s+window)?\b/i
const EXCEEDS = /\b(?:input|prompt|request|messages?)\b.{0,40}\b(?:exceed(?:s|ed)?|overflows?|is\s+larger\s+than)\b.{0,40}\b(?:the\s+)?(?:model(?:'s)?\s+)?context(?:\s+(?:length|window))?\b/i

const fallback = 'DeepSeek Messages request failed (413)'
console.log(STRUCTURED.test(fallback), TOO_LARGE.test(fallback), EXCEEDS.test(fallback))
// => false false false    all three miss, so the 413 becomes INVALID_REQUEST
```

---

## 8. 对有效性的威胁

明确列出，因为 [PLAN.md](PLAN.md) 中的建议正建立其上。

**8.1 单一语料范围。** 所有计数都来自一个用户的会话日志 [O1]。
那些*频率* —— 17.6% 成功率、239/239 误判、18 次连续失败
—— 描述的是该语料，**不能推广**到其他安装。而*机制*是对着锁定版本的上游源码
[S1]–[S14] 确立的，不是语料特有的。凡结论依赖于频率之处，都表述为关于本语料的
观测，而不是表述为一个比率。

**8.2 持久化层的局限。** `compaction/end` 不记录错误码 [O14]，
因此失败分类 [O5] 依据的是渲染文本而非代码。两个不同的 code 若渲染出相同文本，
在此处无法区分。413 分布 [O6] 不受这一局限影响 —— 它是从
`assistant/attempt` 流失败中恢复出来的，后者确实携带 `failure.code` 与
`failure.status`。

**8.3 不可观测的提供方行为。** 提供方究竟是发了一个被适配器丢弃的响应体，
还是真的发了空响应体，仅凭持久化日志无法区分 [O7]。两种情况都一样：
合成的兜底字符串才是抵达分类器的东西，所以机制 A 不受影响。
[README §5](README.md) 中「字节对 token」的发现之所以标 `[inferred]`，正是出于此：
字节阈值在提供方一侧且未公开，而另一种解释 —— 请求确实畸形 ——
并未被现有证据排除。

**8.4 快照选择的敏感性。** 因为快照互相重叠且非嵌套，所报告的总数取决于每个会话
选中了哪个文件 [O3]。每个数字都给出两种口径。只按事件数选择已被测试，并
**静默地丢掉了近期证据** —— 一个目录报告 5 次压缩而非 7 次，且 413 失败完全消失 ——
因此该工具按时间新旧优先、体量其次打分。

**8.5 静态的先行工作分析，只有一个例外。** [PRIOR-ART.md](PRIOR-ART.md) 中的兼容性
与覆盖度结论大多来自源码级阅读而非执行，且唯一一条启动失败的引用转引自第三方自己的
记录 [P6]，并非在此复现。二十个仓库中有八个仅凭元数据评估，并已如此标注。

**那个例外是 [P1]**，其版本门控曾是一项已声明的风险，如今是一条实测结果 [O15][O16]：
它在 `0.2.0-rc.2` 宿主上可安装、可加载、可正确重分类，附带一条注意事项报告于
[PRIOR-ART §5.2](PRIOR-ART.md)。该测量覆盖的是**一个宿主版本上的一个插件**；
它不推广到另外十九个仓库，也不覆盖 `0.2.1-alpha.1`。

**8.6 一处尚未解决的先行工作源码冲突。** `huohua-dev` 的 README 声明的默认值
（`thresholdRatio: 0.9`、`outputReserveCap: 0`）与其源码 `DEFAULTS`
（`0.85`、`20000`）不一致 [P4]。两者都读过；都无法确认为当前值。
因此其数值默认值被视为未验证。

**8.7 图像拒绝的注意事项是推断，而非实测。** [O16] 确立了该插件会重分类任何
`status === 413`，不论措辞。而提供方在这条路由上是否真的把图像尺寸拒绝返回为 413，
**并未测量**；因此实际暴露面取决于一个未验证的前提。
本语料中观测到的每一次 413 都是整请求尺寸拒绝 [O6]，但语料里没有任何图像拒绝的 413
可充当反例。

**8.8 建议仅在一个宿主版本上验证。** 发布在 [`config/`](config/README.md) 的每一个
配置块都是针对 `0.2.0-rc.2` 构造的 [O20]，并有七个畸形变体被确认拒绝 [O21]。
**`0.2.1-alpha.1` 未被测试。** 就所引源码所示，引擎的校验路径在两个修订之间没有变化
[S0a][S0b]，但那是从源码得出的推断，不是测量。

**8.9 一项测试可能从错误的门通过。** 本研究中有两次验证最初以同一种方式出错 ——
它们调用了低层辅助函数，并把它的行为当作系统的行为来报告：

- 该插件的反向用例测试最初直接调用 `oversizeFailure()`，
  绕过了 `classifyOversizeFailure()` 中的守卫，于是看起来把八个反例全部重分类
  [PRIOR-ART §7](PRIOR-ART.md)。
- 配置测试最初调用 `BasicCompactionEngine.Config()`，那只跑 schema 层；
  于是三个畸形配置块看起来被接受了 [O19]。

两者都通过走真实路径得以纠正。**测试一个守卫，意味着从门进入，而不是绕过它** ——
此处报告的正是纠正之后的运行结果。
