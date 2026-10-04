[English](README.md) | **中文**

# dsh-FixCompaction —— 配置加固

零代码缓解措施。此处没有任何内容修改 DSH 安装目录下的任何文件。

> 标记 `[S…]`/`[O…]` 解析于 [`../REFERENCES.md`](../REFERENCES.zh.md)。
> 验证：[`../verify-config/`](../verify-config/) —— 正确性 [O20][O21]，
> 残余风险 [O22]。

> **范围。** 本文件针对**机制 B** —— 摘要请求超出预算。它**不**针对机制 A
>（413 误判）；那部分见 [`../PRIOR-ART.md`](../PRIOR-ART.zh.md)。

> **在应用下面任何内容之前先读 §5。** 这些设置被验证的是能*加载*，
> 而不是被验证为*有帮助*。代价是真实的，并且被明确写明。

---

## 1. 配置放在哪里 —— 先读这一节

**压缩相关条目不在你的 profile patch 层里。** 它们在一个 **agent preset** 中 [O17]。
按 id 针对 `compaction-basic` 的 profile patch **不会生效** —— 加载器报告
`patch: entry "compaction" not found`，该 patch 被静默丢弃 [O18]。

已发布的 preset 在 `cordis:group` 内声明它们 [O17]：

```yaml
- id: compaction
  name: cordis:group
  group: true
  isolate:
    compaction: true
    toolResultPruner: true
  config:
    - id: compaction-basic
      name: '@deepseek-ai/dsh-compaction-basic'
    - id: command-compact
      name: '@deepseek-ai/dsh-command-compact'
    - id: tool-result-pruner
      name: '@deepseek-ai/dsh-compaction-tool-result-pruner'
      config:
        thresholdChars: 8192
        headChars: 4096
        tailChars: 1024
```

preset 自己的注释说明了这些条目为何放在一起：`compaction-basic` 通过 `ctx.get`
读取裁剪器，所以裁剪器**必须共享这个 realm**，而不是位于其外 [O17]。

**要改变压缩设置，就编辑你实际使用的那个 agent preset** ——
`$DSH_HOME/.agent-presets/<preset>/agent.cordis.yml` —— 并给 `compaction-basic` 条目
添加一个 `config` 块。profile 级的 `--patch` 覆盖层是错误的层级。

> 组合后的 profile 中还存在一个顶层 `- id: compaction-basic` 条目，
> 但它是 `disabled: true` 且不带任何配置 [O17]。编辑*那个*条目什么都不会改变。

---

## 2. 为什么默认值让失败变得很可能

触发点计算于 `packages/compaction/compaction-basic/src/config.ts` [S10]：

```
threshold = floor(min(W × thresholdRatio, W − O − headroomTokens))
retain    = floor((W − O) × retainRatio)
```

其中 `W` 是声明的 `contextWindow`，`O` 是该路由的输出预留量（`maxTokens`）。
默认值为 `thresholdRatio 0.8`、`headroomTokens 65536`、`retainRatio 0.16` [S10]。

对一个声明 `contextWindow: 1000000, maxTokens: 256000` 的路由的演算示例：

```
threshold = min(800000, 1000000 − 256000 − 65536) = 678464 tokens
retain    = floor(756000 × 0.16)                   = 119040 tokens
```

**在驻留 678,464 token 之前，压缩不会开始。** 在那个规模上，序列化后的请求有好几兆字节，
而摘要调用 —— 它逐字重放被压缩区 [S6] —— 是最可能超出传输限制的请求。
会话恰好在压缩首次尝试运行时处于其最大状态。

---

## 3. 推荐设置

把这个 `config` 块添加到 **你的 agent preset 的 `compaction` 组内**的
`compaction-basic` 条目上（§1）：

```yaml
    - id: compaction-basic
      name: '@deepseek-ai/dsh-compaction-basic'
      config:
        # Start compacting earlier: 0.5 × W instead of 0.8 × W.
        thresholdRatio: 0.5
        # Keep a smaller verbatim tail, so more history becomes compactable.
        retainRatio: 0.12
        # Default 65536; a smaller headroom leaves more usable input budget.
        headroomTokens: 32768
        # Cap summary output. Defaults to headroomTokens when unset.
        maxTokens: 32768

        # ↓ Only meaningful if an overflow-recovery plugin is installed. See §5.2.
        compactionRetries: 2
        maxOverflowRetries: 3
```

下面每一个块都能针对 `0.2.0-rc.2` 成功构造 [O20]。**那只说明这些设置被接受；
并不说明它们改善结果。**

### 3.1 固定一个独立的摘要模型 —— 影响最大的改变

默认情况下，摘要目标解析为 `configured ?? latest ?? agentTarget` [S7]，
其中 `latest` 是**该对话当前路由的模型**。如果那条路由窗口很小，
摘要请求会立刻溢出 [O8]。

```yaml
        summarizationProvider: '<provider>'
        summarizationModel: '<large-window-model>'
```

这两项**作为一对来校验** —— 只设置其中一个会在加载时被拒绝，报错为
`summarizationProvider and summarizationModel must be set together as an empty or non-empty pair` [O21]。

在对照实验中，把摘要器固定到 1,000,000 token 的路由，把压缩从
**22 次中 21 次失败**变成**7 次中 7 次成功** [O8]。

> **不要以为「更小/更便宜」的模型会有帮助。** 小模型仍然有有限的窗口，
> 因此它并不消除溢出 —— 而且当历史混合了工具调用与工具结果时，换模型可能降低摘要质量
>（结构化内容可能被以不同方式重新编码）。要选**大窗口**，而不是小模型。

---

## 4. 按路由的覆盖

```yaml
      config:
        thresholdRatio: 0.5
        modelPolicies:
          - provider: '<small-window-provider>'
            model: '<small-window-model>'
            thresholdRatio: 0.4
            retainTokens: 16384
```

加载时校验会拒绝未知键、重复的按路由覆盖、`retainRatio` 与 `retainTokens` 同时出现，
以及任何达到或超过阈值的保留量 [O21]。

---

## 5. 残余风险 —— 应用前先读

验证覆盖的是**这些设置能否加载** [O20]。它**没有**覆盖它们是否有帮助，
也**没有**覆盖代价。那些写在这里。

### 5.1 拼错的提供方或模型在运行时失败，而非加载时 —— **高风险**

构造函数**不**解析摘要目标；它只校验这一对是一起设置的 [O22]。实测：
`summarizationProvider: 'nonexistent-provider'` 配 `summarizationModel: 'some-model'`，
以及另一个不存在的模型 id，**两者都成功构造**。

**后果。** 一个拼写错误会静默通过启动。失败只在某个会话首次达到压缩阈值时浮现
—— 那可能是数小时之后，而用户会把它体验为*会话坏了*，而不是*配置拼错了*。

**缓解。** 编辑之后，确认提供方与模型 id 原样出现在你的 provider 块中（§6），
或者在一个一次性会话中运行 `/compact`，立刻强制一次摘要调用并观察结果。

### 5.2 在机制 A 被修复之前，`maxOverflowRetries` 不生效 —— **中风险**

`maxOverflowRetries` 管控 `agent/request-error` 路径 [S14]，
该路径以 `failure.code === CONTEXT_WINDOW_EXCEEDED` 为门槛 [S4]。在机制 A 未修复时，
HTTP 413 被归类为 `INVALID_REQUEST`，**永远不会到达那条路径** [O6]。

**后果。** 在原版宿主上，把 `maxOverflowRetries` 从 1 提到 3 什么都不会改变。
只有在配合一个溢出重分类插件（如 [P1]）时它才变得有意义。

### 5.3 降低 `thresholdRatio` 会增加成本 —— **中风险，已量化**

每次压缩都是一次完整模型调用，重放被压缩区 [S6]。更低的阈值意味着更多次压缩。

| 设置 | 触发点（`W`=1,000,000、`O`=256,000） |
|---|---|
| 默认 `thresholdRatio: 0.8` | 678,464 tokens |
| 推荐的 `0.5` | 500,000 tokens |

推荐设置**提前 26%** 触发 [O22]。在长时间工作的会话上，那意味着
**更多摘要调用，按真实 token 计费**。这个取舍是刻意的：
提前压缩正是让摘要请求小到足以成功的做法 [O8]。如果你的工作负载上成本比可靠性更重要，
就把 `thresholdRatio` 留在默认值，改为固定摘要模型（§3.1）——
仅那一项改变就能应对机制 B，而不增加压缩频率。

### 5.4 降低 `maxTokens` 引入一种截断失败模式 —— **低风险**

`maxTokens` 限制摘要输出。如果某个摘要超出它，harness 会让这次压缩失败，报错为
`summarization truncated at the token cap (incomplete checkpoint)`，
并被记录为一次压缩错误 [S6-derived]。

该建议把默认值减半（65,536 → 32,768）。**在分析的语料中实测的摘要大小：最大 6,585 output token，
中位数 4,596** [O23] —— 舒适地低于上限。**这是单语料观测，不是保证**：
会话长得多的语料可能产生更长的摘要。

### 5.5 仅在一个宿主版本上验证过 —— **未知风险**

所有 [O20]/[O21]/[O22] 测量都是针对 `0.2.0-rc.2`。**`0.2.1-alpha.1` 未被测试。**
就所引源码所示，两个修订版之间的校验路径没有变化 [S0a][S0b]，
但那是从源码得出的推断，不是测量。

### 5.6 收益是推断的，未经端到端证明 —— **最大的 caveat**

1,000,000 token 的对照 [O8] 是来自一个语料的**观测性**发现，
不是对这些设置的对照试验。此处没有任何测量证明把 §3 应用到一个当前失败的会话
就能让它成功。机制已被理解 [S5][S6][S7]，效应的方向已被确立 [O8]，
但**应用这些设置的用户是在做一个有依据的改动，而不是一个已验证的修复。**

---

## 6. 核对路由声明的窗口

机制 B 部分由一个**过于乐观的 `contextWindow`** 触发。检查你的 provider 块：

```yaml
- id: llm-pi-ai
  name: '@deepseek-ai/dsh-llm-pi-ai'
  config:
    providers:
      <provider-name>:
        models:
          - id: <model-id>
            contextWindow: <declared>
            maxTokens: <output reservation>
```

- **不在** `@earendil-works/pi-ai` 内置目录中的模型会回退到 `defaultContextWindow`，
  其默认值为 **262144** [S13]。该回退是**静默的**，所以一个拼错或未列出的模型 id
  会在没有任何诊断的情况下降低预算 —— 这与 §5.1 是同一类失败。
- 一个以**字节**为单位施加限制的代理，可以拒绝一个 token 预算认为没问题的请求 [S16]。
  token 与字节都是真实限制；只有其中一种被计费（[README §5](../README.zh.md)）。

**把 `contextWindow` 设为你测量过的值，而不是你希望的值。**

---

## 7. 这修不了什么

| 缺陷 | 能靠配置修复吗？ | 误以为能的风险 |
|---|---|---|
| 机制 A —— 413 → `INVALID_REQUEST`，恢复被跳过 | **不能** [S1][S3][S4] | §5.2：恢复类设置始终不生效 |
| 机制 B —— 摘要请求溢出自身 | **被缓解**，未被消除 [S5][S6][S7] | §5.6：收益是推断的 |
| 机制 C —— 没有退避 / 熔断器 / 信号 | **不能** [S11] | 重试风暴继续 |
| 单个不可分割的超大节点 | **不能** —— 上游声明它超出契约 | —— |

一个**已经**越过传输限制的会话，单靠配置救不回来：摘要请求会持续失败。
从该状态恢复需要一个插件或一个全新的会话。

---

## 8. 回滚

上面的每一项改动都是你自己 preset 中的增量 YAML。要回滚，就从 `compaction-basic` 条目
删掉那个 `config:` 块；§2 记录的默认值重新生效。
**这其中的任何操作都不触及 DSH 安装目录下的任何文件**，
因此应用更新不会与它冲突。
