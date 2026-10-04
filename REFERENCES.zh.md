[English](REFERENCES.md) | **中文**

# 引用

> **引用纪律。** 本仓库中每一项事实性陈述都带一个行内标记指向此处。按前缀分三类：
>
> | 前缀 | 类别 | 含义 |
> |---|---|---|
> | `S` | **源码** | 固定版本上游源码中的位置，或上游讨论。可通过检出该提交并阅读该行复现。 |
> | `O` | **观测** | 本研究中做出的测量。可通过运行条目中所列的脚本复现。 |
> | `P` | **先行工作** | 第三方软件或文档。标注为「源码」者按源码级别阅读。 |
>
> 无标记的陈述要么是定义，要么是关于本文档本身的陈述。**推断**而非实测的结论，
> 在使用处标 `[inferred]`。

---

## S —— 源码引用

分析的上游版本。所有行号固定到这些提交；随着项目推进它们会漂移。

| Id | 版本 | 提交 | 日期 | 作用 |
|---|---|---|---|---|
| **S0a** | `0.2.0-rc.2` | `639ed015` | 2026-09-29 | 被分析的已发布构建 |
| **S0b** | `0.2.1-alpha.1` | `5badb150` | 2026-10-03 | 撰写时的 `master` |

仓库：<https://github.com/deepseek-ai/deepseek-harness>

除另有说明外，行号引用 **S0b**；两个版本有差异处，两者都给出。

| Id | 位置（已对 S0b 验证） | 陈述内容 |
|---|---|---|
| **S1** | `packages/llm/llm-deepseek/src/transport.ts:32` | 错误分类顺序：上下文溢出的**文本**判定在 `status === 400 \|\| status === 413` 分支**之前**求值。 |
| **S2** | `packages/llm/llm-deepseek/src/transport.ts:25` | 当响应体不含 `error.message` 时，适配器合成 `DeepSeek Messages request failed (<status>)`。 |
| **S3** | `packages/llm/llm/src/error.ts:83` | `isContextWindowExceededError` **仅按文本**匹配 —— 三条正则，分别要求 `context length/window`、`too large for … context`，或 `exceed` 与 `context` 共现。 |
| **S4** | `packages/compaction/compaction-basic/src/index.ts:194` | 除非 `failure.code === CONTEXT_WINDOW_EXCEEDED_CODE`，溢出恢复钩子提前返回。 |
| **S5** | `packages/compaction/compaction-basic/src/index.ts:299` | `context-overflow` 路径调用 `selectCompactableRange(session, measurement, 0)` —— 字面量 `0` 作为保留预算。 |
| **S6** | `packages/compaction/compaction-basic/src/summarizer.ts:146` | 构建单个 `RequestMessage[]` 为 `[...input.messages, <instruction>]`：整个被遮蔽区域逐字包含，无分块、无体积守卫。 |
| **S7** | `packages/compaction/compaction-basic/src/summarizer.ts:137` | 摘要目标解析为 `configured ?? latest ?? agentTarget`，其中 `latest` 是会话**当前路由到的模型**。 |
| **S8** | `packages/compaction/compaction-basic/src/summarizer.ts:163` | 摘要调用走**直连**的 `ctx.llm.stream()`，不经过 agent loop。 |
| **S9** | `packages/compaction/compaction-basic/src/region.ts:139` | 保留区选择从尾部累积节点直到 `accumulated >= retainTokens`；当 `retainTokens === 0` 时第一次迭代立即中断。 |
| **S10** | `packages/compaction/compaction-basic/src/config.ts:191` | 触发算术：`threshold = floor(min(W × thresholdRatio, W − O − headroomTokens))`；默认 `thresholdRatio 0.8`、`headroomTokens 65536`、`retainRatio 0.16`。 |
| **S11** | `packages/compaction/compaction-basic/src/index.ts:172` | `agent/pre-step` 监听器捕获每一次压缩失败并记录 `logger.warn(...); continuing the turn`。无重新抛出、无退避、无计数器。 |
| **S12** | `packages/llm/llm/src/retry-policy.ts:18` | `DEFAULT_RETRYABLE_CODES` 不包含 `INVALID_REQUEST`。 |
| **S13** | `packages/llm/llm-pi-ai/src/catalog.ts:914` 与 `src/config.ts:65` | 不在内置目录中的模型回落到 `defaultContextWindow`；`DEFAULT_CONTEXT_WINDOW = 262_144`。该回落是静默的。 |
| **S14** | `packages/compaction/compaction-basic/src/index.ts`（`compactIfNeeded`，pressure 分支） | pressure 循环最多重试 `compactionRetries` 次然后抛出；重试计数器是单次调用局部的，不是会话级的。 |

> **行号纪律。** 这些行号是用 [`verify-refs/check-refs.mjs`](verify-refs/check-refs.mjs)
> 对 `0.2.1-alpha.1` [S0b] **模式匹配**解析得到的，不是凭记忆誊写。早期草稿把
> `0.2.0-rc.2` 的行号与 `0.2.1-alpha.1` 混用，并为 [S13] 引用了错误的文件；
> 两者都由运行该检查器纠正。**版本变更后请重跑它** —— 否则跟随引用的读者会落到错误的行。

### 上游讨论

| Id | 引用 | 撰写时状态 |
|---|---|---|
| **S15** | [discussion #7214](https://github.com/deepseek-ai/deepseek-harness/discussions/7214) —— *A length stop with one output token escapes overflow detection, so a dead session never recovers and continue is a no-op* | open |
| **S16** | [discussion #7626](https://github.com/deepseek-ai/deepseek-harness/discussions/7626) —— *Compaction cannot rescue an oversized session — the summarization request itself exceeds the provider request-size limit (HTTP 413)* | open |
| **S17** | [discussion #7632](https://github.com/deepseek-ai/deepseek-harness/discussions/7632) —— usage-based overflow detection misses a refusal delivered as `stopReason: "error"` | 被 [P1] 引用 |

---

## O —— 本研究做出的观测

每条列出复现它的产物。除另有说明外，全部计数来自单一用户的会话语料；
其影响见 [EVIDENCE §8](EVIDENCE.zh.md#8-对有效性的威胁)。

| Id | 观测 | 复现方式 |
|---|---|---|
| **O1** | **语料范围。** 177 个会话目录下的 198 个 `*.jsonl.zstd` 文件（2026-10-05 重测；语料是活的，会增长）。格式为 zstd 多帧拼接，魔数 `28 B5 2F FD`。 | `node tools/doctor.mjs <root>` |
| **O2** | **整块解码会静默截断。** 在 `session-5f8b1111/session.v3.jsonl.zstd` 上，整块 `zstdDecompressSync` 返回 **188 字节**；逐帧解码返回 **25,048,287 字节 / 709 帧 = 7,455 事件**。**未抛任何异常。** | `tools/doctor.mjs` 解码路径 |
| **O3** | **两种互相独立的重复都会抬高总数，而修好其中一种并不能修好另一种。**（a）*快照*：`session.jsonl.zstd`、`.v3`、`.v4` 是**重叠的累积视图**，不是互不重叠的分段 —— 计入全部文件：84 次启动 / 21 次摘要 / 478 次 413。（b）*分叉继承*：带 `parentSession` 的会话在 `seedLength` 区间内**逐字节重放**父会话的事件，而两者位于不同目录，因此「每会话一份文件」的去重看不见它。每会话一份文件：**30 次启动 / 9 次摘要 / 239 次 413**；朴素计数是 52 / 10 / 42，因为其中 22 次启动、1 次摘要、21 次失败是继承重放。 | `--merge` 对比默认 |
| **O4** | **压缩总数（去重，已剔除分叉继承）。** `compaction/start` 30、`compaction/summary` 9、失败闭合 21。成功率 **9/30 = 30.0%**。**2026-10-05 更正：** 本项原写 51 / 42 / 17.6%。一个分叉会话在 `seedLength` 区间内重放了父会话的压缩，而按目录去重看不见它 —— 22 次 start、1 次 summary、21 次失败被计了两遍。 | 默认运行 |
| **O4b** | **压缩总数（快照合并）。** 84 / 21 / 63 —— 成功率 25.0%。 | `--merge` |
| **O5** | **失败分类，按渲染后的错误文本**（去重 / 合并）：`pi-ai detected context overflow for model "…"` **40 / 60**；`DeepSeek request aborted by caller` 2 / 3。溢出约占全部失败的 95%。 | 默认 / `--merge` |
| **O6** | **HTTP 状态 → 赋予的码**（去重 / 合并）：`413 → INVALID_REQUEST` **239 / 478**；`400 → CONTEXT_WINDOW_EXCEEDED` 9 / 14。**413 中 100% 被判为 `INVALID_REQUEST`，零例外。** | 默认 / `--merge` |
| **O7** | **每个 413 抽样都携带同一条兜底串。** 全部 30 个抽样失败读作 `DeepSeek Messages request failed (413)`；**没有一个**携带提供方撰写的 `error.message`。 | 抽样转储 |
| **O8** | **对照实验 —— 会话所在路由是唯一变量。** 同一会话 `session-5f8b1111`，只有被路由的模型变化，压缩成败与之完全同步。在 `deepseek-official/deepseek-v4-flash`（声明窗口 **1,000,000**）上：1 次压缩，**1 次成功**。路由切到 `openrouter/stealth/ox-alpha`（声明窗口 **262,144**）后：**18 次连续失败**，每一次都点名 `stealth/ox-alpha`。路由切回后：不再失败。跨会话：`session-c0acb35e` 在 1,000,000 token 路由上 → 7 次压缩，**7 次成功**。 | `request/context` 声明与 `compaction/end` 交错的时间线 |
| **O9** | **摘要请求无界；它之所以成功，只是因为当时的路由恰好窗口很大。** `session-5f8b1111` 中唯一一次成功的压缩携带 `shadowedTokenCount = 557,896` 与 `inputTokens = 791,091`，运行在 `deepseek-official/deepseek-v4-flash` —— 一条 **1,000,000** token 的路由上。它**并未**溢出 262,144 窗口；根本不存在体积守卫，因此同一个请求落在更小的路由上就会直接失败。 | `compaction/summary` 载荷（记录 `provider`、`model`、`usage.inputTokens`） |
| **O10** | **对照实验 —— HTTP 状态是唯一变量，在同一会话内。** 在 `session-c0acb35e`（快照 `session.jsonl.zstd`）中，两次状态 **400** 事件各自后接一次压缩启动，分别在 **+25 ms** 与 **+32 ms**，且两次都成功；状态 **413** 溢出触发压缩 **零次**。同一会话、同一模型、同一声明窗口。存在第三组 `+9 ms` 配对，但它在**同一会话的另一份快照**里（`seq 18444`），不在该文件中；本条目早期版本把它计为同一文件内的第三次，那正是 [O3] 警告过的快照重复计数错误。 | 携带 `status` 的 `assistant/chunk` 事件，与 `compaction/start` 交错比对 |
| **O11** | **无退避。** 最差会话中：**单个回合内 18 次连续失败**（turn 90）；重试间隔最小 **76,631 ms**、中位 **101,173 ms**、最大 **778,069 ms** —— 逐位复现。间隔**不随**失败次数增长。**2026-10-05 更正：** 本项还发布了「失败总跨度 **5,391 秒**」，而该值在我们能构造的**任何**窗口下都复现不出来。那次连败自身的跨度是 **4,022 秒**（start 到 start）或 **3,966 秒**（end 到 end）；整文件跨度是 **615,258 秒**。5,391 秒与它们都不符，其来源不明。「无退避」的实际证据 —— 那三个间隔数字 —— 不受影响。 | 间隔直方图；按回合分组 |
| **O12** | **交接不是由压缩失败导致的。** 被交接的会话在交接当下 `failedEnds = 0` 且压缩次数为零。链条是：请求失败 → 压缩从未触发 → 会话卡死 → **用户**运行 `/rescue` → 交接。已对本条目所称的两条记录分别核对：`session/title` 事件（`seq 15739`）携带 `time = 1789659712327` 且 `source.kind = "user"`，而 `handoffs.jsonl` 记录的 `oldSessionId` 正是该会话、`at` 为同一毫秒。注意该值总共出现在 11 个会话日志中，其中多数是引用它的分析会话 —— **在日志里出现不构成配对的证据；被点名的这两条记录才是。** | `session/title` 事件 + `dsh-session-rescue/handoffs.jsonl` |
| **O13** | **一次按子串计数的假阳性，作为方法学警告记录。** 早期一遍用全文搜索 `CONTEXT_WINDOW_EXCEEDED` 得到 248 次「溢出命中」。其中一个**仅仅讨论过**该常量的会话贡献了 66 次，而**真实错误事件为零**。真实数字见 [O6]。 | — |
| **O14** | **`compaction/end` 不持久化错误码。** 它把 `error` 存为经 `errorChain()` 展平的字符串；`code`、`name`、`cause` 均缺失。错误码分布因此在那一层不可得，改为从 `assistant/attempt` 流式失败中恢复 —— 后者确实携带 `failure.code` 与 `failure.status`。 | 事件 schema 转储 |
| **O15** | **`@argszero/cordis-plugin-length-stop-overflow@0.3.0` 在 `0.2.0-rc.2` 宿主上可用，尽管其 peer 范围为 `<0.2.0`。** 通过在临时包中解析 `@deepseek-ai/dsh-llm@0.2.0-rc.2` + `@deepseek-ai/cordis@4.0.4`、安装该插件并驱动它来验证。安装、五个值导入常量、`llm/stream` waterfall、模块导入与 `ctx.plugin()` 挂载全部成功；观测到的确切失败形态被重分类为 `request-too-large`。 | `verify-argszero/verify.mjs` |
| **O16** | **oversize 规则的反向用例行为：8 个中 7 个正确透传。** `RATE_LIMIT` 429、畸形 400、`QUOTA` 402、`AUTH` 401、`IMAGE_OFFLOAD_REQUIRED`、`EMPTY_RESPONSE` 与 token 上限措辞均未被触碰。**例外**：任何携带 `status === 413` 的失败在措辞被读取之前就被重分类，因此一个措辞无关的 413 —— `image is too large: 5MB exceeds 4MB limit` —— 也会被重分类。 | `verify-argszero/behavior2.mjs` |
| **O17** | **压缩相关条目位于 agent preset，而非 profile 层。** 已发布的 preset 在一个 `cordis:group` 内声明 `compaction-basic`、`command-compact` 与 `tool-result-pruner`，该 group 的 `isolate` 块携带 `compaction: true, toolResultPruner: true`。preset 自身的注释说明裁剪器必须共享该 realm，因为 `compaction-basic` 通过 `ctx.get` 读取它。合成后的 profile 中也出现一个顶层 `- id: compaction-basic` 条目，但它是 `disabled: true` 且不携带配置。 | `--dump-config`；`$DSH_HOME/.agent-presets/<preset>/agent.cordis.yml` |
| **O18** | **针对压缩 group 的 profile 层 patch 会被静默丢弃。** 通过 `--patch` 应用 `- id: compaction …` 会产生 `patch: entry "compaction" not found` 且不改变任何东西；合成后的树不变。配置必须在 agent preset 中编辑。 | `--patch … --dump-config` |
| **O19** | **仅靠 schema 层校验不足以测试一份配置。** 调用 `BasicCompactionEngine.Config(config)` 接受了一个未知键（`thresoldRatio`）以及互斥的 `retainRatio`+`retainTokens` 组合。真正的检查在构造时由 `resolveConfig()` 执行，因此测试必须实例化该引擎。 | `verify-config/schema-test.mjs` 对比 `schema-test2.mjs` |
| **O20** | **五个推荐配置块对 `0.2.0-rc.2` 构造成功**：完整推荐、推荐加独立摘要对、仅摘要对、仅阈值改动、仅 headroom 改动。 | `verify-config/schema-test2.mjs` |
| **O21** | **七个畸形配置块在构造时被拒绝，7/7。** 未知键、`retainRatio`+`retainTokens` 同时出现、保留 ≥ 阈值、有 provider 无 model、有 model 无 provider、负 headroom、`maxTokens: 0`。每一个都产出指明违规字段的具体诊断。 | `verify-config/schema-test2.mjs` |
| **O22** | **推荐设置中的四项残余风险，已测量。** (a) 不存在的 `summarizationProvider` 或 `summarizationModel` **构造成功** —— 失败只在第一次摘要调用时浮现，不在加载时。(b) 把 `thresholdRatio` 从 0.8 降到 0.5 会把触发点从 678,464 移到 500,000 token，即**提前 26%，相应地更多摘要调用**。(c) 在机制 A 未修复时提高 `maxOverflowRetries` 是不生效的，因为 `agent/request-error` 路径永远不会被触达。(d) 把 `maxTokens` 减半到 32,768 引入一种截断失败模式：若摘要超过该值。 | `verify-config/risk-test.mjs` |
| **O22a** | **[O22] 的子项 (a)，在失败*时机*本身是重点处引用**：拼错的摘要目标不会在加载时被拒绝，因此拼写错误与可用配置无法区分，直到某个会话到达压缩阈值。 | `verify-config/risk-test.mjs` |
| **O23** | **所分析语料中观测到的摘要体积（2026-10-05 重测）。** 来自 4 个会话的 10 条已记录摘要：供应商 `usage.outputTokens` —— 最小 **3,207**、中位 **4,596**、最大 **6,585**；摘要正文 —— 最小 **10,663** 字符、中位 **13,912**、最大 **15,880**。**2026-10-05 更正：** 本项原写最大 4,963 / 中位 4,312，与任何可测量的量都对不上，且它把 `tools/doctor.mjs` 标为复现路径，而该工具当时根本不统计摘要体积。现在会统计了。最大值来自那个**正在研究此缺陷本身**的会话，其摘要异常地长 —— 应把 6,585 视为一个偏斜样本的上界，而非典型体积。这是单一语料的观测，不构成对其他工作负载的界。 | `tools/doctor.mjs`（`Summary sizes` 段，以及 `--json` 中的 `summarySizes`）|
| **O24** | **没有任何扩展点能抑制 `compaction-basic` 的一次尝试 —— 但替换后端可以。** 在已发布的组合中，`compaction-basic` 在**它自己的 `agent/pre-step` 监听器体内**调用 `compactIfNeeded` [S14]，早于其 `next()`，因此赢得 waterfall 排序并不能拦截该调用。`compaction/summary-error` 只在失败之后触发；`llm/stream` 包裹一次调用但无法抑制调用发生；surface 改写治的是更少触发，不是失败重试。**这四个点被排除是正确的。** 但适用范围比原先写的窄：这些发现讲的是*观察*一个后端，不是*成为*一个后端。`CompactionEngine` 是 abstract、三个成员，且**其构造函数不注册任何监听器** —— 监听器由子类 `BasicCompactionEngine` 注册（`index.ts:158/178/184/190`）。替换后端**就是那个子类**，因此会话级熔断在它内部是可实现的。 | [`verify-feasibility/intervention-points.mjs`](verify-feasibility/intervention-points.mjs)；[PLAN §Gap 4](PLAN.zh.md) |
| **O25** | **语料中没有孤立压缩。** 跨每一个快照，**84 个 `compaction/start` 事件与 84 个 `compaction/end` 事件配对** —— 零未配对启动，也没有跨越 `session/end-seed` 的压缩区间。锁释放设计的失败模式是被设计防范的，但并不常见。 | 会话日志扫描；`tools/doctor.mjs` 报告每会话的 start/end 计数 |
| **O26** | **第三方插件可以直接调用工具结果裁剪器的服务。** 挂载依赖链（`session` → `sessionProjections` → `tokenMeter` → `pruner`）后，插件通过 `ctx.get('toolResultPruner')` 取得服务并调用 `pruneSession()`，返回一个结果对象。**早期一次测试报告该服务不可达；那是测试台产物** —— 裸 `Context` 缺少依赖链，服务从未注册。通过挂载完整链纠正。 | [`verify-config/pathb-final.mjs`](verify-config/pathb-final.mjs) |

---

## P —— 先行工作

关于这些的兼容性、覆盖范围与不兼容性主张见 [PRIOR-ART.zh.md](PRIOR-ART.zh.md)。
标注为源码级阅读者已读源码；其余为元数据级。

| Id | 项目 | 许可证 | 阅读深度 |
|---|---|---|---|
| **P1** | [`argszero/cordis-plugin-length-stop-overflow`](https://github.com/argszero/cordis-plugin-length-stop-overflow) | MIT | 源码 |
| **P2** | [`dsh-hypercompact`](https://github.com/mrbeandev/dsh-hypercompact) | MIT | 部分源码 |
| **P3** | [`bvbhu/dsh-quilt-compact`](https://github.com/bvbhu/dsh-quilt-compact) | MIT | 源码 |
| **P4** | [`huohua-dev/dsh-compaction-policy`](https://github.com/huohua-dev/dsh-compaction-policy) | MIT | 源码 |
| **P5** | [`dsh-agent-compact`](https://github.com/jonah791/dsh-agent-compact) | MIT | 源码 |
| **P6** | [`@treeseed/dsh-chapters`](https://github.com/treeseed-ai/dsh-chapters) | **Apache-2.0** | 部分源码 |
| **P7** | [`@falling-ts/dsh-force-compact`](https://github.com/falling-ts/dsh-force-compact) | MIT | 部分源码 |

### 为推荐方案设计而查阅的外部文献

| Id | 引用 | 相关性 |
|---|---|---|
| **P8** | Lindenbauer et al., *The Complexity Trap: Simple Observation Masking Is as Efficient as LLM Summarization for Agent Context Management*, arXiv:2508.21433 (2025) | 证据表明可逆的观测遮蔽以大约一半的成本达到 LLM 摘要的效果 —— 一种不会溢出的兜底策略，与 [PLAN](PLAN.zh.md) 中的降级路径相关。 |
| **P9** | Anthropic, *Effective context engineering for AI agents* | 把上下文维护视为一项显式的、agent 可调用的操作、而非被动的失败响应的先行工作。 |
