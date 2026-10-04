[English](README.md) | **中文**

# 验证 —— 配置块对真实宿主的检验

支撑 [O19]–[O23]、[O26] 以及 [`../config/README.zh.md`](../config/README.zh.md) 中的指引。

## 本节为何存在

配置表是一份**用户必须执行的建议**。若某个字段名写错、或两个字段互相冲突，
代价由用户在启动时承担 —— 要么硬失败，要么更糟：设置被静默忽略。因此
[`../config/`](../config/README.zh.md) 中推荐的每一个配置块，都在发布前
针对真实的 `0.2.0-rc.2` 引擎构造过。

验证有**三**部分，而后面的部分更重要：

1. **正确性** —— 配置能否加载？（`schema-test2.mjs`）
2. **残余风险** —— 代价是什么，以及*何时*失败？（`risk-test.mjs`）
3. **可达性** —— 插件能否真正取得并调用它所需的服务？（`pathb-final.mjs`）

「能加载」是一个很低的标准。一项设置可以加载、花掉真金白银，却依然修不好问题。
三部分的结果如下。

## 文件

| 文件 | 用途 | 状态 |
|---|---|---|
| `schema-test2.mjs` | 正确性，经由真实构造路径 | **结论性** |
| `risk-test.mjs` | 残余风险 [O22] | **结论性** |
| `pathb-final.mjs` | 服务可达性与可调用性 [O26] | **结论性** |
| `depchain-test.mjs` | 诊断早期可达性尝试为何失败 | 支撑性 |
| `fidelity-test.mjs` | 诊断测试台本身 | 支撑性 |
| `schema-test.mjs` | 第一次正确性尝试 —— **不充分**，作为证据保留 [O19] | 归档 |
| `archive-pruner-probe/` | 五次失败的可达性尝试 —— 见下 | 归档 |

### `archive-pruner-probe/` —— 五次尝试为何失败

可达性问题（「插件能否调用 `pruneSession()`？」）花了**五次**尝试，而前四次
都给出了**错误答案** —— 服务不可达。保留它们是因为其失败模式具有启发意义：

| 尝试 | 错在哪里 |
|---|---|
| `pruner-service.mjs` | 传入的是模块命名空间对象，而非类 |
| `pruner-service2.mjs` | 挂载了类，但裸 `Context` 缺少依赖链 —— 服务从未注册 |
| `pruner-service3.mjs` | 加了 `tokenMeter`，仍不是完整链 |
| `isolation-test.mjs` | 从一个未注册的服务得出「不可达」—— 一个**误导性**结论 |
| `realm-test.mjs` | 复现了 isolate realm，但测试台仍不完整 |

**前四次的根因**：`TokenMeter.inject = ['sessionProjections']`，因此链是
`session → sessionProjections → tokenMeter → pruner`。裸 `Context` 什么都不注册，
`ctx.get()` 返回 `undefined` —— 而这看起来与「该服务对插件不可用」完全一样。

**纠正**来自 `depchain-test.mjs`：挂载完整链，服务就出现了。
随后 `pathb-final.mjs` 确认调用可用。

> **这条教训之所以记录，是因为它在本研究中重复出现三次：**
> 一个不忠实的测试台，会把*测试台*的局限报告成*系统*的。
> 从真实路径进入 —— 或者至少验证测试台确实注册了你所查询的东西。

## 结果

**`schema-test.mjs`** —— 第一次尝试 —— **不充分，作为记录保留**。
它调用 `BasicCompactionEngine.Config(config)`，只跑 schemastery 层：

| 用例 | `Config()` 判定 | 正确？ |
|---|---|---|
| `thresoldRatio: 0.5`（拼错） | 接受 | ❌ |
| `retainRatio` + `retainTokens` 同时出现 | 接受 | ❌ |
| `retainRatio ≥ thresholdRatio` | 接受 | ❌ |

三个畸形输入通过了。**schema 校验不是那道门** [O19]；跨字段检查位于
`resolveConfig()`，在**构造**时运行。

**`schema-test2.mjs`** —— 经由真实路径实例化引擎。

*推荐配置块 —— 全部构造成功* [O20]：

| 配置块 | 结果 |
|---|---|
| 完整推荐 | 通过 |
| 推荐 + 独立摘要对 | 通过 |
| 仅摘要对 | 通过 |
| 仅阈值改动 | 通过 |
| 仅 headroom 改动 | 通过 |

*畸形配置块 —— 全部拒绝，7/7* [O21]：

| 输入 | 诊断 |
|---|---|
| `thresoldRatio` | `unknown key "thresoldRatio"` |
| `retainRatio` + `retainTokens` | `must be mutually exclusive` |
| `retainRatio 0.5` 配 `thresholdRatio 0.3` | `retainRatio (0.5) must be less than the resolved thresholdRatio (0.3)` |
| 有 provider 无 model | `must be set together as an empty or non-empty pair` |
| 有 model 无 provider | `must be set together as an empty or non-empty pair` |
| `headroomTokens: -1` | `must be a non-negative integer` |
| `maxTokens: 0` | `must be a positive integer` |

每一次拒绝都指明违规字段。**没有任何畸形配置静默失败。**

## 残余风险 —— `risk-test.mjs`

正确性是必要条件，但不充分。该脚本测量推荐方案的*代价*以及它们*何时*失败 [O22]。

### 拼错的摘要目标在运行时失败，而不是加载时

| 输入 | 能构造？ |
|---|---|
| `summarizationProvider: 'nonexistent-provider'` | **能** |
| `summarizationModel: 'no-such-model-xyz'` | **能** |

构造函数只校验这对字段是*同时*设置的；它不解析任何一个名字 [O22a]。
**因此拼写错误与一个可用配置无法区分，直到某个会话第一次到达压缩阈值** ——
那可能是数小时之后，而用户体验到的是*会话坏了*，而不是*配置拼错了*。
这是推荐方案集中严重性最高的风险。

### 其他已测量的代价

| 风险 | 测量 |
|---|---|
| 把 `thresholdRatio` 从 0.8 降到 0.5 | 触发点从 678,464 移到 500,000 token，即**提前 26%**；每次压缩都是一次完整模型调用，因此**更多调用、真实 token 成本** |
| 把 `maxOverflowRetries` 从 1 提到 3 | 在机制 A 未修复时**不生效** —— `agent/request-error` 路径永远不会被触达 [S4][O6] |
| 把 `maxTokens` 减半到 32,768 | 引入一种截断失败模式；所分析语料中观测到的摘要体积最大 **6,585** output token、中位 **4,596** [O23] —— 尚有余量，但那是单一语料，不构成界 |
| 收益本身 | **推断。** [O8] 是一次观察性对照，不是把这些设置用在失败会话上的试验 |

## 复现

```sh
mkdir verify-config && cd verify-config
echo '{"name":"verify-config","private":true,"version":"1.0.0","type":"module"}' > package.json
pnpm add @deepseek-ai/dsh-compaction-basic@0.2.0-rc.2 @deepseek-ai/cordis@4.0.4
cp <this-dir>/*.mjs .
node schema-test.mjs    # 那不完整的检查 —— 作为证据保留
node schema-test2.mjs   # 正确性，经由真实路径
node risk-test.mjs      # 残余风险
```

## 配置实际放在哪里

验证同时确立：**profile 层 patch 完全无法配置压缩** [O17][O18]：

```
dsh: [<patch>] patch: entry "compaction" not found
```

这些条目位于 **agent preset** 内的一个 `cordis:group` 中。正确位置见
[`../config/README.zh.md` §1](../config/README.zh.md)。

## 范围

针对 `0.2.0-rc.2` 测量。`0.2.1-alpha.1` 上的行为**未**测量。
就所引源码所示，引擎的构造路径在两个版本间是稳定的，但那是推断而非测量。
