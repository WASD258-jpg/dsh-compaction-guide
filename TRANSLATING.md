# Translation glossary — 翻译术语表

Every Chinese document in this repository follows this table. Terminology drift
across a bilingual set is a correctness problem, not a style one: if
`compaction` is 压缩 in one file and 紧凑化 in another, a reader cannot tell
whether two documents are discussing the same mechanism.

每一份中文文档都遵循此表。双语文档之间的术语漂移是**正确性问题**而非风格问题：
如果 `compaction` 在一处译作「压缩」、另一处译作「紧凑化」，读者将无法判断
两份文档讨论的是不是同一个机制。

---

## Core mechanism terms — 核心机制术语

| English | 中文 | Note |
|---|---|---|
| compaction | 压缩 | The feature. Never 紧凑化 / 压缩化. |
| automatic compaction | 自动压缩 | |
| summarization | 摘要 | The LLM call that produces a checkpoint. |
| summarizer | 摘要器 | |
| checkpoint | 检查点 | The summary stored back into the session. |
| tool result | 工具结果 | |
| tool-result pruner | 工具结果裁剪器 | |
| prune / pruning | 裁剪 | |
| session | 会话 | |
| surface | 表面 / surface | Keep `surface` in code contexts; 表面 in prose. |
| context window | 上下文窗口 | |
| token budget | token 预算 | Keep `token` untranslated. |
| threshold | 阈值 | |
| retention | 保留 | |
| retention budget | 保留预算 | |
| overflow | 溢出 | |
| overflow recovery | 溢出恢复 | |
| classification | 分类 | |
| misclassification | 误判 | |
| circuit breaker | 熔断器 | |
| backoff | 退避 | |
| retry storm | 重试风暴 | |
| cooldown | 冷却 | |
| trigger | 触发 | |
| defect | 缺陷 | |
| mechanism | 机制 | |
| root cause | 根因 | |
| guard | 守卫 | |

## Measurement terms — 测量术语

| English | 中文 | Note |
|---|---|---|
| corpus | 语料 | |
| de-duplicated | 去重 | One file per session. |
| union | 合并 | All snapshots counted. |
| snapshot | 快照 | |
| frame | 帧 | zstd frames. |
| event | 事件 | |
| measurement | 测量 | |
| controlled comparison | 对照实验 | |
| reproduced / reproducible | 复现 / 可复现 | |
| verified | 已验证 | |
| unverified | 未验证 | |
| inferred | 推断 | Keep the `[inferred]` marker untranslated. |
| threat to validity | 对有效性的威胁 | |

## Document and evidence terms — 文档与证据术语

| English | 中文 | Note |
|---|---|---|
| citation | 引用 | |
| source claim | 源码声明 | |
| observation | 观测 | `[O…]` markers. |
| prior art | 先行工作 | Never 先前技术. |
| evidence | 证据 | |
| diagnostic | 诊断 | |
| verification script | 验证脚本 | |
| test harness | 测试台 | |
| faithful harness | 忠实的测试台 | |
| upstream | 上游 | |
| downstream | 下游 | |
| shipped | 已发布 | |
| partial measure | 部分措施 | |

## Status words — 状态词

| English | 中文 |
|---|---|
| pass | 通过 |
| fail | 失败 |
| rejected | 拒绝 |
| accepted | 接受 |
| inert | 不生效 |
| inert by design | 设计上不生效 |
| not yet verified | 尚未验证 |

---

## Rules — 规则

**1. Marker identifiers are never translated.** `[S1]`, `[O15]`, `[P1]`,
`[inferred]` appear verbatim in Chinese text. A reader must be able to compare
them against `REFERENCES.md` without conversion.

**标记标识符一律不翻译。** `[S1]`、`[O15]`、`[P1]`、`[inferred]` 在中文文本中
原样出现。读者必须能不经转换地与 `REFERENCES.md` 对照。

**2. Code, paths, commands, and identifiers stay in English.** Inline code,
fenced blocks, file paths, package names, CLI flags, log lines, and error
messages are never translated. Translating an error message makes it
ungreppable, which defeats the purpose of quoting it.

**代码、路径、命令与标识符保持英文。** 行内代码、代码块、文件路径、包名、
命令行参数、日志行与错误信息一律不翻译。翻译错误信息会让它无法被检索，
这恰恰违背了引用它的目的。

**3. Numbers are identical across languages.** `51`, `17.6%`, `239/239`,
`678,464` — unchanged. If a number differs between the two versions, one of
them is wrong, and that is a defect to fix rather than a translation choice.

**数字在两种语言中完全一致。** `51`、`17.6%`、`239/239`、`678,464` —— 不变。
若两个版本的某个数字不同，则其中一个是错的，那是需要修复的缺陷，
而不是翻译选择。

**4. Section structure mirrors.** Headings map one-to-one in order and depth, so
a reader can switch languages mid-document and keep their place. The
`language-pairs` CI job enforces the heading count.

**章节结构镜像对应。** 标题按顺序与层级一一对应，使读者能在文档中途切换语言
而保持位置。CI 的 `language-pairs` job 会强制检查标题数量。

**5. Tone matches the English.** The English is deliberately plain and states
limits explicitly. The Chinese must not soften them: 「无法用插件修复」 stays
「无法用插件修复」, not 「较难通过插件解决」.

**语气与英文一致。** 英文刻意平实并明示局限。中文不得弱化：「无法用插件修复」
就保持「无法用插件修复」，而非「较难通过插件解决」。

**6. Residual risk is never omitted.** Where the English says a recommendation
was verified on one host version only, or that a mechanism is unverified, the
Chinese says the same. Omitting a caveat in translation would make the Chinese
version more confident than the evidence supports — the exact failure this
repository documents.

**残余风险绝不省略。** 英文说某项建议仅在单一宿主版本上验证、或某机制尚未验证时，
中文作同样表述。翻译中省略 caveat 会让中文版比证据所支持的更自信 ——
这正是本仓库所记录的失败模式。

---

## Adding a language pair — 新增语言对

A bilingual document is `NAME.md` plus `NAME.zh.md` in the same directory, each
carrying a language switcher on line 1:

双语文档是同目录下的 `NAME.md` 与 `NAME.zh.md`，各自在第 1 行带语言切换链接：

```markdown
**English** | [中文](NAME.zh.md)
```

```markdown
[English](NAME.md) | **中文**
```

`verify-refs/check-language-pairs.mjs` verifies that every translated document
has its counterpart, that the switcher is present and points both ways, and that
the heading counts match.
