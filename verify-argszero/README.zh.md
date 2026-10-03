[English](README.md) | **中文**

# 验证 —— `@argszero/cordis-plugin-length-stop-overflow` 在 0.2.0-rc.2 上

本目录包含 [O15] 与 [O16] 背后的测量。它之所以存在，是因为该插件的
`peerDependencies` 范围止于 `<0.2.0`，使 0.2.0-rc.2 成为一条**未经声明**的路径
—— 而未经声明的路径应当被测量，而不是被假设。

## 测量了什么

| 脚本 | 用途 |
|---|---|
| `verify.mjs` | 解析真实的 `0.2.0-rc.2` 宿主，并检查插件能否安装、导入与挂载 |
| `behavior2.mjs` | 驱动**真实分类器入口**，针对一个正向和八个负向用例 |

## 环境准备

脚本期望有一个已解析宿主依赖的同级临时包。复现方式：

```sh
mkdir verify-argszero && cd verify-argszero
echo '{"name":"verify","private":true,"version":"1.0.0"}' > package.json
pnpm add @deepseek-ai/dsh-llm@0.2.0-rc.2
pnpm add @deepseek-ai/cordis@4.0.4
pnpm add @argszero/cordis-plugin-length-stop-overflow@0.3.0
node verify.mjs
node behavior2.mjs
```

> **用 pnpm，不要用 npm。** 该插件的 peer 范围排除了 0.2.x，因此 npm 会以
> `ERESOLVE` 拒绝安装。这是该插件的打包瑕疵而非功能障碍 —— 见
> [`../REPRODUCING.zh.md`](../REPRODUCING.zh.md)。

## 结果

**`verify.mjs`** —— 全部检查通过：

| 检查 | 结果 |
|---|---|
| 在 `0.2.0-rc.2` 宿主下 `pnpm add` | 安装成功；peer 不匹配**不**构成阻碍 |
| 五个值导入常量在 `0.2.0-rc.2` 中存在 | 全部解析成功 |
| `llm/stream` waterfall 存在 | 是 |
| 模块导入 | 26 个具名导出 |
| 在真实 `Context` 上 `ctx.plugin(plugin)` 挂载 | 无服务冲突、无 inject 错误 |

**`behavior2.mjs`** —— 正向用例被重分类；8 个负向用例中 7 个透传。
例外记录于 [PRIOR-ART §5.2](../PRIOR-ART.zh.md)。

## 方法学警告

本测试的早期版本**直接**调用了低层 `oversizeFailure()` 辅助函数，并据此得出
全部八个负向用例都被重分类的结论 —— 包括速率限制与中止。**该结论是错误的。**
守卫位于 `classifyOversizeFailure()` 中，直接调用绕过了它们。

这一教训具有普遍性：**测试一个守卫，意味着从门进去，而非绕过去。**
那个错误结果差点作为发现被发表，纠正记录见 [PRIOR-ART §7](../PRIOR-ART.zh.md)。

## 范围

本目录确立的是**单一插件在单一宿主版本上**的行为。它不推广到
[PRIOR-ART.md](../PRIOR-ART.zh.md) 中评估的另外十九个仓库，
也不覆盖 `0.2.1-alpha.1`。
