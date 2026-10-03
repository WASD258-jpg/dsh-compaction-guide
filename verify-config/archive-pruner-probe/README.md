**English** | [中文](README.zh.md)

# Archive — five failed attempts to answer one question

**These scripts are kept as evidence, not as working code.** They produced the
wrong answer, and the reason is worth recording.

## The question

*Can a third-party plugin obtain the tool-result pruner's service and call
`pruneSession()`?*

This mattered because it decides whether a plugin can **proactively prune** —
reducing how often compaction fires, and therefore how often it can fail.

## The wrong answer

The first four attempts all concluded **"no, the service is unreachable."**
That conclusion was **false**, and it very nearly shipped.

| File | What went wrong |
|---|---|
| `pruner-service.mjs` | Passed the module namespace object to `ctx.plugin()` instead of the class. Cordis rejected it: *"invalid plugin, expect function or object with an apply method, received object."* |
| `pruner-service2.mjs` | Mounted the class correctly, but queried a **bare `Context`**. The pruner's own `inject = ['tokenMeter']` was unsatisfied, so the service never registered — `ctx.get()` returned `undefined`. |
| `pruner-service3.mjs` | Added `tokenMeter` to the chain. Still incomplete: `TokenMeter.inject = ['sessionProjections']`. |
| `isolation-test.mjs` | Reported "unreachable" from a service that was never registered, and generalised it to *"plugins cannot access other plugins' services"* — a **misleading** conclusion stated far beyond what the harness supported. |
| `realm-test.mjs` | Correctly reproduced an isolate realm, but on the same incomplete harness, so it reproduced the same `undefined`. |

## The actual answer

`depchain-test.mjs` found the cause: **the dependency chain was never mounted.**

```
session → sessionProjections → tokenMeter → pruner
```

A bare `Context` registers nothing. `ctx.get('toolResultPruner')` returns
`undefined`, which is **indistinguishable from "this service is not exposed to
plugins"** unless you check whether anything registered at all.

Mounting the full chain makes the service appear; `pathb-final.mjs` then confirms
it is callable, returning a result object [O26].

## Why this is archived rather than deleted

**The failure mode is not obvious and it recurred three times in this study.**

A test harness that is not faithful reports **the harness's limitations as the
system's**. The symptom — `undefined` — carries no indication of which of the two
it is. In each of the three occurrences, the tempting next step was to publish the
negative finding, and in each case the negative finding was wrong.

The corrected results are in [`../../README.md`](../../README.md); the other two
occurrences are [O19] (schema validation) and
[PRIOR-ART §7](../../PRIOR-ART.md) (the plugin's guards).

**Practical rule, earned the hard way:** before reporting "the system cannot do X,"
verify that the harness can do X's prerequisites.
