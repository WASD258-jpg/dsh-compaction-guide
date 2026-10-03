[English](README.md) | **中文**

# 归档 —— 五次失败的尝试，只为回答一个问题

**这些脚本是作为证据保留的，不是可用代码。** 它们给出了错误答案，而其原因值得记录。

## 问题

*第三方插件能否取得工具结果裁剪器的服务并调用 `pruneSession()`？*

这件事重要，是因为它决定了插件能否**主动裁剪** —— 降低压缩触发频率，
从而降低它失败的次数。

## 错误答案

前四次尝试都得出**「不能，服务不可达」**。该结论是**错误的**，而且它差点被发布出去。

| 文件 | 错在哪里 |
|---|---|
| `pruner-service.mjs` | 传给 `ctx.plugin()` 的是模块命名空间对象而非类。Cordis 拒绝：*"invalid plugin, expect function or object with an apply method, received object."* |
| `pruner-service2.mjs` | 正确地挂载了类，但查询的是**裸 `Context`**。裁剪器自身的 `inject = ['tokenMeter']` 未被满足，因此服务从未注册 —— `ctx.get()` 返回 `undefined`。 |
| `pruner-service3.mjs` | 把 `tokenMeter` 加进了链。仍不完整：`TokenMeter.inject = ['sessionProjections']`。 |
| `isolation-test.mjs` | 从一个从未注册的服务得出「不可达」，并把它推广成*「插件无法访问其他插件的服务」* —— 一个**误导性**结论，其表述远远超出测试台所能支撑的范围。 |
| `realm-test.mjs` | 正确复现了 isolate realm，但跑在同一个不完整的测试台上，于是复现出同一个 `undefined`。 |

## 真正的答案

`depchain-test.mjs` 找到了原因：**依赖链从未被挂载。**

```
session → sessionProjections → tokenMeter → pruner
```

裸 `Context` 什么都不注册。`ctx.get('toolResultPruner')` 返回 `undefined`，
而它**与「该服务不向插件暴露」无法区分** —— 除非你去检查到底有没有东西注册过。

挂载完整链后服务便出现了；随后 `pathb-final.mjs` 确认它可调用，返回一个结果对象 [O26]。

## 为什么归档而不是删除

**这个失败模式并不显眼，而且它在本研究中重复了三次。**

一个不忠实的测试台，会把**测试台的局限报告成系统的局限**。症状 —— `undefined` ——
完全不指示它属于哪一种。在三次发生中，每一步诱人的做法都是把那个否定性发现发表出去，
而每一次那个否定性发现都是错的。

纠正后的结果见 [`../../README.zh.md`](../../README.zh.md)；另外两次发生是
[O19]（schema 校验）与 [PRIOR-ART §7](../../PRIOR-ART.zh.md)（该插件的守卫）。

**一条用血换来的实用规则：** 在报告「系统做不到 X」之前，
先验证测试台能做到 X 的前提条件。
