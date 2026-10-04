[English](PRIOR-ART.md) | **中文**

# PRIOR-ART —— 已有什么，以及还没有什么

> **本文档为何存在。** DSH 的压缩修复生态增长很快，如今**以并不显眼的方式互相排斥**：
> 多个插件替换同一个服务，放在一起会启动失败；一个静默地遮蔽另一个；
> 而其中最相关的两个根本不在 npm 上。仅靠分别阅读各自的 README 来选择组合是不可能的
> —— 每一份 README 只描述它自己。
>
> 这是一张兼容性地图。它正是本仓库存在的理由。
>
> **引用约定**：标记 `[P…]` 解析于 [`REFERENCES.md`](REFERENCES.md)。
> 标为 `[unverified]` 的结论仅凭元数据评估。

**调查方法**：通过 `raw.githubusercontent.com` 对下列每个仓库做源码级阅读 ——
读实现文件，而非 README 摘要。**没有克隆任何仓库，也没有执行任何插件**
[EVIDENCE §8.5](EVIDENCE.md)。关于究竟验证了什么、没有验证什么，
见 [§6 局限](#6-局限)。

---

## 1. 覆盖矩阵

图例：✅ 完整 · 🔶 部分 · ❌ 缺失 · ➖ 不适用

| 仓库 | A<br>413 误判 | B<br>摘要器无界 | C<br>无退避 / 无熔断器 | 分发渠道 |
|---|---|---|---|---|
| [`@argszero/cordis-plugin-length-stop-overflow`](https://github.com/argszero/cordis-plugin-length-stop-overflow) | ✅ **唯一完整的修复** | ❌ 明确拒绝 | ❌ | npm |
| [`dsh-hypercompact`](https://github.com/mrbeandev/dsh-hypercompact) | ✅ 附带 | ✅ **结构性消除**（零 LLM） | 🔶 重试计数 | npm |
| [`bvbhu/dsh-quilt-compact`](https://github.com/bvbhu/dsh-quilt-compact) | ❌ | ✅ **真正的分块**（token 预算） | 🔶 仅路由健康 | GitHub |
| [`huohua-dev/dsh-compaction-policy`](https://github.com/huohua-dev/dsh-compaction-policy) | ❌ | 🔶 仅参数 | ✅ **唯一真正的退避** | GitHub |
| [`dsh-agent-compact`](https://github.com/jonah791/dsh-agent-compact) | ❌ | ✅ **结构性消除** | ➖ | npm |
| [`@treeseed/dsh-chapters`](https://github.com/treeseed-ai/dsh-chapters) | ❌ | ✅ **结构性消除**（确定性 TOC） | ➖ | npm |
| [`@falling-ts/dsh-force-compact`](https://github.com/falling-ts/dsh-force-compact) | ❌ | 🔶 | 🔶 轮次上限 + 墙钟 | npm |

**仔细看 A 列**：恰好有一个插件修复了根因 A。其余要么忽略它，要么继承那次误判。

---

## 2. 硬性不兼容

### 2.1 替换压缩后端 —— 只能选一个

每一个自带 `compaction` 服务的插件都注册到**同一个服务名**上。
注册两个会在启动时失败：

```
service "compaction" has been registered at <BasicCompactionEngine>
```

（这记录在 `treeseed-ai/dsh-chapters` 自己的兼容性说明中。）

**互斥集合** —— 至多选一个：

- `dsh-hypercompact`
- `bvbhu/dsh-quilt-compact`
- `dsh-agent-compact`
- `@treeseed/dsh-chapters`
- `@falling-ts/dsh-force-compact`

### 2.2 `@argszero/cordis-plugin-length-stop-overflow` 是正交的

它挂在 `llm/stream` 瀑布流上，**不是**接在压缩服务上。因此它可以与上述任意单一后端组合。
这是唯一一个总能加入的插件。

### 2.3 `huohua-dev/dsh-compaction-policy` 与 2.1 冲突

它**扩展** `BasicCompactionEngine` 而不是替换它，所以无法与互斥集合中的任何插件共存。

它还精确锁定宿主版本，并**在加载时校验五个方法哈希**：

```json
"@deepseek-ai/dsh-compaction-basic": "0.2.0-rc.2"
```

在更新的宿主上它会**拒绝加载**，而不是降级运行。它自己的 README 把这类机制称为
「deliberate safety gates, not a promise of forward compatibility」。
**如果你运行 0.2.1-alpha.1，这个插件将不会加载。**

### 2.4 两个插件同时写 `compaction-basic` 配置会互相冲突

加载器补丁条目是**替换**配置块，而不是深合并。两行补丁同时指向 `compaction-basic`
意味着后一行整体胜出 —— 前一行的 `thresholdRatio`、`retainRatio` 与 `modelPolicies`
被静默丢弃。

---

## 3. 推荐组合

> **下列每一个组合都带风险，且风险已被列出。** 这些建议建立在十九个仓库的静态源码分析
> [§6] 以及一个实际执行过的插件 [O15][O16] 之上。**它们没有一个跑过端到端。**
> 请把它们当作有依据的起点，而不是已验证的修复。

### 3.1 保守方案 —— 保留 LLM 摘要器

```yaml
- insert:
    - id: length-stop-overflow
      name: '@argszero/cordis-plugin-length-stop-overflow'
```

外加后端**二选一**：[P2] *（其 README 标注 0.2.0-rc.2 已测试）* 或 [P3]
*（基于 token 的分块，保住摘要质量）*。

**覆盖**：A + B。**仍敞开**：C —— 重试风暴仍可能发生 [O11]。

**风险**：

| 风险 | 严重度 | 细节 |
|---|---|---|
| 措辞无关的 413 也会被重分类 | 中 | 任何 `status === 413` 都会在措辞被查询之前被改写 [O16]，因此图像尺寸拒绝会被当作溢出处理。影响有界 —— 浪费一次压缩，原始错误会被保留 [PRIOR-ART §5.2]。 |
| 替换用的后端在此处未验证 | 未知 | [P2] 与 [P3] **没有**在本研究中被执行。关于它们行为的唯一证据是它们自己的文档。 |
| 后端选择在实践中不可逆 | 低 | 后端互斥 [§2.1]，因此日后更换意味着从零重新验证。 |
| 观测 ≠ 纠正 | 低 | 先用 `mode: 'warn'` [P1] 在你自己的流量上确证重分类率，再让它改变行为。 |

### 3.2 叠加配置加固

在任一组合之上应用 [`config/`](config/)。锁定一个独立的大窗口摘要模型是影响最大的单项改动，
且它与这里所有插件都正交。

**风险**：见 [`config/README.md` §5](config/README.md) —— 摘要提供方拼写错误会在运行时
而非加载时失败 [O22a]，并且这些设置的好处是**推断的而非实证的** [§5.6]。

### 3.3 不推荐的做法

- **不要叠加两个后端。** 启动失败 [§2.1]，此条引自 [P6]，并非在此复现。
- **不要在 0.2.1-alpha.1 上使用 [P4]。** 它的哈希门会拒绝加载 [§2.3]。
- **不要以为「更便宜」的摘要模型会有帮助。** 小模型仍有有限窗口，所以它并不解决溢出 ——
  而且当历史混有工具调用与工具结果时，换模型会降低摘要质量。
- **不要把这些改动应用到任何你承受不起丢失的会话上。** 此处没有任何东西针对一个
  当前正在失败的会话做过验证。

---

## 4. 缺口 —— 没有人做出来的东西

对着源码核实，不是对着 README。**这些就是本项目瞄准的空位。**

### 缺口 1 —— `retainTokens = 0` 那一行从未被修复

溢出路径传入 `0`，把压缩区域扩张到几乎整个表面，而恰恰是在窗口已满的时候。
没有人修复它；所有人反而替换整个后端。

最清楚的证据是 [`bvbhu/dsh-quilt-compact`](https://github.com/bvbhu/dsh-quilt-compact)
在一条路径上算出**正确**的值，却在另一条路径上硬编码 `0` —— 而且是在同一个文件里。
作者知道正确答案，仍然为溢出路径写了 `0`。

`@argszero/…` 在自己的 README 里直白地写出它的拒绝：

> *"It does not bound the summarization request by bytes. That is a core change…
> no plugin can chunk that region without losing content."*
>
> 中译：*「它不按字节约束摘要请求。那是核心改动……没有任何插件能在不丢内容的前提下
> 切分那个区域。」*

### 缺口 2 —— 按字节约束的摘要**确实空着**

上游 [#7626](https://github.com/deepseek-ai/deepseek-harness/discussions/7626)
建议按**字节**约束摘要请求。没有人做。

生态站在两个相反的端点：

| 做法 | 例子 | 受限于 |
|---|---|---|
| 切块 | `bvbhu/dsh-quilt-compact` | **token**（真实分词器、重叠、按句子切边） |
| 不调用 LLM | `dsh-hypercompact` | **字节**（但根本不存在摘要请求） |

**两者的交集 —— 既保留 LLM 摘要器*又*按字节约束其请求 —— 是空的。**
这一点重要，因为 token 预算与传输字节上限是两种不同的限制，
而其中只有一种被 harness 计价。

### 缺口 3 —— *摘要*溢出的恢复路径不存在

摘要器通过直接的 `ctx.llm.stream()` 调用发起流式请求，因此它永远不派发
`agent/request-error` —— 而溢出恢复正是以该事件为门控。一旦你保留 LLM 摘要路线，
这个洞就还在。

有三个插件通过彻底移除摘要调用绕开了它
（`dsh-agent-compact`、`dsh-chapters`、`dsh-hypercompact`）。有一个部分缓解了它
（`bvbhu` 会重试可重试的错误码），但它自己的源码指出了局限：

> *"DSH's retryPolicy executor itself only acts on agent-loop request failures."*
>
> 中译：*「DSH 的 retryPolicy 执行器本身只对 agent 循环的请求失败起作用。」*

**正向修复 —— 把摘要失败重新经由循环派发 —— 实现数为零。**

### 缺口 4 —— 没有全局熔断器（最大的缺口）

记录在 [`EVIDENCE.md`](EVIDENCE.md) 中的用户可见症状：**18 次连续失败，
中位间隔 101 s，且间隔不随失败次数增长。** 生态中没有任何东西处理它。

唯一真正的退避是 `huohua-dev` 的 `2 ** (count - 1)`（60 s → 600 s，
计数上限 32，带一个实质变化探测）。但它的范围很窄：
`context-overflow` 分支不递增计数器，任何成功都会重置它，
状态存在重启即失的 `WeakMap` 里。

其他每一个「C」都是不同的轴：

- `bvbhu` 的冷却**固定为一小时**，冷却的是**路由健康**，不是压缩尝试。
- `falling-ts` 限制的是**轮次**（8）与墙钟时间（90 s）。

而最初的病灶仍然被原样复制下去：`bvbhu` 重新实现了上游那个除了 `logger.warn`
什么都不做的 `catch`。

**不存在跨触发、跨路径、且带用户可见状态的熔断器。**

---

## 5. 逐插件说明

### `@argszero/cordis-plugin-length-stop-overflow` —— 根因 A 的修复

三个独立触发条件，各可单独开关，各自对应一个不同的上游讨论 [P1]：

| 规则 | 检测 | 上游 |
|---|---|---|
| length stop | 一个 `length` 停止且输出 ≤2 token（`DEFAULT_AT_MOST_OUTPUT_TOKENS = 2`） | [S15] |
| oversize failure | `INVALID_REQUEST` + 413，或尺寸与请求的措辞匹配 | [S16] |
| saturated failure | 提供方用量 ≥ 申报窗口的 `DEFAULT_SATURATION_RATIO = 0.99` | [S17] |

它**按值**从 harness 导入 `CONTEXT_WINDOW_EXCEEDED_CODE` [P1]，因此它的分类不会与核心漂移。
`mode: 'warn'` 允许只观测、不改写。

#### 5.1 已执行的验证

该插件的 `peerDependencies` 范围截止于 `<0.2.0`，所以在 0.2.0-rc.2 上运行它曾是一条
**未验证的路径**。现在它是被测量过的，而不是被假设的。方法：一个临时包解析出
`@deepseek-ai/dsh-llm@0.2.0-rc.2` 与 `@deepseek-ai/cordis@4.0.4`，
然后安装并实际驱动该插件。

| 检查项 | 结果 |
|---|---|
| 在 0.2.0-rc.2 宿主下 `pnpm add` | **可安装** —— peer 不匹配并不阻断 |
| 五个按值导入的 code 都存在于 0.2.0-rc.2 | **通过** —— 各自解析到预期字符串 |
| 0.2.0-rc.2 中存在 `llm/stream` 瀑布流 | **通过** |
| 模块导入 | **通过** —— 26 个具名导出 |
| 在真实 `Context` 上 `ctx.plugin(plugin)` 挂载 | **通过** —— 无服务冲突、无注入错误 |
| 正例：观测到的那个确切失败（`INVALID_REQUEST` + `status: 413` + 适配器兜底字符串） | **被重分类**为 `request-too-large`，`matched: 'status'` |
| `kind: 'aborted'` / `kind: 'max-tokens'` | **未被改写** |
| 反例：`RATE_LIMIT` 429、畸形 400、`QUOTA` 402、`AUTH` 401、`IMAGE_OFFLOAD_REQUIRED`、`EMPTY_RESPONSE`、token 上限措辞 | **全部正确直通**（8 个中的 7 个） |

**结论：版本门控是打包产物，不是功能屏障。** 在 0.2.0-rc.2 上，该插件可以安装、
加载，并重分类本仓库记录的那个确切失败模式。

#### 5.2 一条实测出的注意事项

反例集合有**一个**例外。`isRequestTooLargeFailure` 在查询任何措辞之前，
对**任何**携带 `status === 413` 的失败都返回 `true` [P1]：

```js
export function isRequestTooLargeFailure(failure) {
    if (failure.status === 413)
        return true
    ...
}
```

因此一个并非源于整体请求尺寸的 413 —— 图像尺寸拒绝是其中合理的例子 —— 也会被重分类为
`CONTEXT_WINDOW_EXCEEDED`。对着该插件自己的分类器实测：字符串
`image is too large: 5MB exceeds 4MB limit` **确实**会被重分类。

`RECOVERY_OWNED_CODES` 守卫覆盖不到这一点，因为它保护的是 code
（`IMAGE_OFFLOAD_REQUIRED`、`CONTEXT_WINDOW_EXCEEDED`），不是消息。

**影响评估**：`[inferred]` 实际暴露面取决于提供方在这条路由上是否把图像尺寸拒绝返回为 413，
而这一点**未**被测量。在此处分析的语料中，每一次观测到的 413 都是整请求尺寸拒绝
[O6][O16]。无论如何该失败模式是有界的：一次被误判的图像拒绝会触发一次收不回空间的压缩，
之后原始错误仍被保留。

**建议**：启用全部三条规则，并先用 `mode: 'warn'` 在真实流量上确证重分类率，
再让它改变行为 —— 这也正是该插件自己文档所建议的做法。

### `dsh-hypercompact` —— 零 LLM、按字节预算

唯一带真实字节预算的插件：

```
maxRequestBytes / targetRequestBytes / retainBytes
```

它**结构性地**消除了根因 B：根本不存在会溢出的摘要请求。其 README 标注 0.2.0-rc.2 已测试。

### `bvbhu/dsh-quilt-compact` —— 严肃的分块器

技术上最有分量的基于 LLM 的选项：

- 一个**真实分词器**（内置 `deepseek-v4-tokenizer.json.gz`），并附有一条直指问题本身的
  注释 —— `chars/4` 启发式对 CJK 视而不见，会把真实会话**少算 2×–2.4×**
- 重叠分块，切边吸附到句子结尾的行；**行是原子的**，因此代码行永不被切开
- 三阶段预算扣减（15% 输出 + 512 提示词开销 + 512 安全）
- 归一化的每块配额，保证 `Σcapᵢ ≤ usable input`

**但它只按 token，且它的会话模型回退路径明确无界** —— 它自己的注释：
*"The fallback is one call over the whole region."*（中译：回退是对整个区域的一次调用。）

### `huohua-dev/dsh-compaction-policy` —— 唯一真正的退避

`RetryGuard` 实现了真正的指数退避外加一个**实质变化探测**：只有当上下文按
`retryAfterTokens` 真正变化过（以 seq + hash 比较）时，才允许提前重试。
这是正确的形状 —— 它避免了重试一次未变化、仍然注定失败的压缩。

**但它在 0.2.1-alpha.1 上不会加载**（§2.3），而且它不计数 `context-overflow` 尝试。

### `@treeseed/dsh-chapters` —— 构造上无损

分支而非重写：一个确定性的目录，**零推理 token**。**Apache-2.0** ——
本集合中唯一的非 MIT 许可证；若再分发须保留其 NOTICE。

### `dsh-agent-compact` —— 让 agent 自己摘要

`compactIfNeeded` 永久返回 `null`；摘要来自 agent 自身的检查点输出。
它彻底移除了那个独立的摘要请求。

### `@falling-ts/dsh-force-compact` —— 本地模型激进压缩

一个双引擎外观（上游 realm / 自研）[P7]。它的缓解手段是轮次上限（8）与 90 秒墙钟，
而不是退避，因此一个卡住的会话是被终止，而不是被救回。

---

## 5a. 不可复用

搜索过程中浮现的两个仓库**没有任何许可证声明**。它们的想法可以启发设计，
但它们的代码不可复用：

- `Yunado/dsh-compaction-fix`
- `oldflag2333333/*`

第三件相关产物是一场讨论而非软件：
[discussion #7632][S17] 记录了一个基于用量的溢出检测缺口，而 [P1] 把该缺口作为
它的第三条触发规则来处理。

---

## 6. 局限

**已验证**：上述每个仓库都以源码级方式通过 `raw.githubusercontent.com` 读过 ——
读的是实现文件，不是 README 的文字。`retainTokens = 0` 的结论 [P3][P4]、
互斥行为 [P6]、哈希门 [P4] 以及退避公式 [P4] 都在代码中得到确认。

**未验证** [EVIDENCE §8.5](EVIDENCE.md)：

- **没有克隆任何仓库，也没有执行任何插件，只有一个例外。**
  [P1] 被安装并在真实的 `0.2.0-rc.2` 宿主上实际驱动过
  [PRIOR-ART §5.1](PRIOR-ART.md) [O15]。此处其他每一条兼容性结论都是静态分析。
  启动失败的引用转引自 `@treeseed/dsh-chapters` 自己的兼容性说明 [P6]，并非复现。
- **八个仓库仅凭元数据评估**（在详细报告中标为 `[unverified]`）。
  那些单元格是源自 README 的推断，**不得当作最终结论**。
- **一处尚未解决的冲突**：`huohua-dev` 的 README 声明的默认值
  （`thresholdRatio: 0.9`、`outputReserveCap: 0`）与其源码 `DEFAULTS`
  （`0.85`、`20000`）不一致 [P4]。两者都读过；都无法确认为当前值。
  把它的数字视为未验证。
- **许可证警示**：`Yunado/dsh-compaction-fix` 与 `oldflag2333333/*` **没有任何许可证声明**。
  它们的*想法*可供参考，但它们的*代码*不可复用。
- **验证只覆盖一个宿主版本。** [O15] 是在 `0.2.0-rc.2` 上测的。它**不**确立
  在 `0.2.1-alpha.1` 上的行为，也不确立任何其他插件的行为。

Star 数与版本号是撰写时抓取的，会漂移。

---

## 7. 验证产物

[O15]/[O16] 的测量可复现：

| 文件 | 它做什么 |
|---|---|
| `verify-argszero/verify.mjs` | 解析一个 `0.2.0-rc.2` 宿主，检查五个按值导入、`llm/stream` 瀑布流、模块导入，以及 `ctx.plugin()` 挂载 |
| `verify-argszero/behavior2.mjs` | 驱动真实的分类器入口点跑一个正例与八个反例 |

> **方法论备注。** 一次更早的尝试直接调用低层的
> `oversizeFailure()` 辅助函数，于是看起来把八个反例全部重分类 —— 包括限流与中止。
> 那是一次**测试错误**：守卫住在 `classifyOversizeFailure()` 里，而直接调用绕过了它。
> 调用真实入口点显示八个反例中有七个直通。之所以记录在此，
> 是因为那个错误结果当时几乎被当作一项发现发布出去。
