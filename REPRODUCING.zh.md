[English](REPRODUCING.md) | **中文**

# 复现验证脚本

> 本仓库中的每一项主张都指名了产出它的脚本。本页说明如何真正运行它们。

## 两类脚本

| 类型 | 需要上游检出？ | 需要 npm 包？ |
|---|---|---|
| **引用解析**（`verify-refs/`） | 是 | 否 |
| **可行性分析**（`verify-feasibility/`） | 是 | 否 |
| **行为验证**（`verify-config/`、`verify-argszero/`） | 否 | 是 |
| **诊断**（`tools/doctor.mjs`） | 否 | 否 |

阅读本指南不需要这里的任何东西 —— 只有核查它的主张才需要。

---

## 1. 没有前置条件的脚本

`tools/doctor.mjs` 与 `tools/privacy-check.mjs` 在原版 Node 22+ 安装上即可运行。

```sh
# diagnostic against your own sessions
node tools/doctor.mjs "$DSH_HOME/sessions"
node tools/doctor.mjs "$DSH_HOME/sessions" --json
node tools/doctor.mjs "$DSH_HOME/sessions" --merge

# privacy gate — takes a repository root
node tools/privacy-check.mjs .
```

**`doctor.mjs` 需要一个存在的 sessions 目录。** 不带参数时它使用 `$DSH_HOME/sessions`，
并且**若该路径不存在则以退出码 2 退出** —— 在一台从未运行过 harness 的机器上就是如此。
传入一个显式路径，或者如果你只想确认脚本能跑，就传一个空目录：

```sh
mkdir -p /tmp/empty-sessions
node tools/doctor.mjs /tmp/empty-sessions
```

---

## 2. 需要上游检出的脚本

`verify-refs/check-refs.mjs`、`verify-refs/lang-audit.mjs`、
`verify-feasibility/feasibility.mjs` 与 `verify-feasibility/intervention-points.mjs`
直接读取上游源码。它们从参数或从 `DSH_SRC` 取得检出路径：

```sh
git clone https://github.com/deepseek-ai/deepseek-harness.git /tmp/dsh

node verify-refs/check-refs.mjs /tmp/dsh
DSH_SRC=/tmp/dsh node verify-feasibility/feasibility.mjs
```

**固定修订版。** `REFERENCES.md` 中的引用行号是针对 `0.2.1-alpha.1`（`5badb150`）解析的。
在之后的 `master` 上这些行会移动，检查器会报告移动到了哪里：

```sh
git -C /tmp/dsh checkout 5badb150
```

解析失败不是检查器的 bug —— 它意味着该引用不再匹配你检出的那个修订版。
`check-refs.mjs` 会打印修正后的行号，以便更新 `REFERENCES.md`。

---

## 3. 需要 npm 包的脚本

`verify-config/` 与 `verify-argszero/` 会挂载真实的 Cordis 上下文并构造真实引擎，
因此需要安装 harness 包。本仓库把它们声明为 `devDependencies`：

```sh
pnpm install
```

**用 pnpm，不要用 npm** —— 而原因正是本指南自己的发现之一。

`@argszero/cordis-plugin-length-stop-overflow@0.3.0` 声明了 peer 范围
`>=0.1.3-alpha.2 <0.1.4 || >=0.1.5-alpha.1 <0.2.0`，该范围**排除 0.2.x** ——
即实测它能工作的那个版本 [O15]。npm 严格执行 peer 范围并拒绝安装：

```
npm error ERESOLVE unable to resolve dependency tree
npm error peer @deepseek-ai/dsh-llm@">=0.1.3-alpha.2 <0.1.4 || ... <0.2.0"
          from @argszero/cordis-plugin-length-stop-overflow@0.3.0
```

pnpm 容忍这种不匹配。该 peer 范围是一个**打包缺陷，而非功能屏障** ——
该插件在 `0.2.0-rc.2` 上被成功导入并挂载，`verify-argszero/` 复现了这一点。
如果你更想用 npm：

```sh
npm install --legacy-peer-deps
```

已安装的版本固定为 `0.2.0-rc.2` —— 测量所针对的那个修订版。
不同的宿主版本可能改变结果；那是信息，不是噪声。

然后：

```sh
node verify-config/schema-test2.mjs       # configuration correctness
node verify-config/risk-test.mjs          # residual risks
node verify-config/pathb-final.mjs        # service reachability
node verify-argszero/verify.mjs           # plugin loading on 0.2.0-rc.2
node verify-argszero/behavior2.mjs        # reclassification behaviour
```

或通过包脚本：

```sh
pnpm verify:config
pnpm verify:risk
pnpm verify:reachability
pnpm verify:argszero
```

### `verify-argszero/` 额外需要一个第三方插件

`@argszero/cordis-plugin-length-stop-overflow@0.3.0` 被声明为可选依赖，
因为它是测量的对象，而不是本指南的依赖：

```sh
pnpm install   # installs it if reachable
```

如果它无法被拉取，`verify-argszero/` 会在 import 时失败 —— 这是预期内的，
且不影响任何其他脚本。

---

## 4. 归档脚本

`verify-config/archive-pruner-probe/` 包含五次**失败**的尝试。
它们被刻意以错误的方式运行：每一个都复现了它因之得名的那个错误。

```sh
node verify-config/archive-pruner-probe/isolation-test.mjs
```

它们以退出码 0 结束，因为一个演示错误的脚本在演示该错误这件事上是成功的。
它们的价值在于文件头注释，以及
[`archive-pruner-probe/README.md`](verify-config/archive-pruner-probe/README.md)。

---

## 5. 预期输出

如果环境与指南描述的一致，你应该看到它所引用的那些数字。
两个例子，无需你自己的任何会话数据即可复现：

```sh
$ node verify-config/schema-test2.mjs
  [PASS] full recommendation
  [PASS] recommendation + independent summarizer
  [PASS] summarizer pair only (smallest change)
  [PASS] threshold only
  [PASS] headroom only
  ...
  rejected: 7/7
```

```sh
$ DSH_SRC=/tmp/dsh node verify-feasibility/feasibility.mjs
  ...
  compactIfNeeded runs BEFORE next(): yes
```

语料数字 —— 51 次启动、9 次摘要、42 次失败、239 次误判的 413 —— 需要会话日志。
**它们不会吻合**，也不该吻合：它们描述的是一个用户的语料，而不是普适比率
[EVIDENCE §8.1](EVIDENCE.md)。应该吻合的是*形状*：成功率远低于 100%，
以及大量的 `413 → INVALID_REQUEST`，如果你的宿主有同样的缺陷。

---

## 6. 如果脚本失败

| 症状 | 原因 |
|---|---|
| `ERR_MODULE_NOT_FOUND: @deepseek-ai/...` | 未运行 `pnpm install` |
| `not found: <path>/packages` | 传入的检出路径错误 |
| 来自 `check-refs.mjs` 的 `[pattern miss]` | 你检出了不同的修订版 |
| `Usage: node ... <path>` | 该脚本需要检出路径参数 |

**一个失败的脚本是一项发现，而不是一桩不便。** 本研究中三次验证尝试第一次都是错的，
因为测试台不忠实；已发布的正是修正后的版本。
如果这里的某样东西无法复现，那值得报告。
