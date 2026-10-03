**English** | [中文](README.zh.md)

# Feasibility — why a circuit-breaker plugin cannot be built

Backs [O24] and the closure of Gap 4 in [`../PLAN.md`](../PLAN.md).

## Why this exists

`PLAN.md` originally proposed a circuit-breaker plugin to address Mechanism C —
18 consecutive compaction failures with no backoff growth [O11]. The proposal was
plausible: count failures, back off, stop retrying.

**Feasibility testing showed a plugin cannot implement it.** This directory holds
that test, because **a negative result that saves someone else the same effort is
worth publishing** — the layout is not obvious from reading any single extension
point.

## The finding

Breaker behaviour requires **skipping a compaction attempt before it runs**. The
blocking obstacle is where the call actually happens:

```ts
// packages/compaction/compaction-basic/src/index.ts:158-176
ctx.on('agent/pre-step', async ({ agent, signal }, next) => {
  if (!signal.aborted) {
    try {
      const result = await this.compactIfNeeded(agent, 'pressure', signal)  // ← L164: runs HERE
      ...
    } catch (error) { /* logs and continues */ }
  }
  return next()                                                             // ← L175: only now
})
```

`compactIfNeeded` executes **inside the listener's own body**, before `next()`.
A waterfall runs listeners in registration order and `prepend` only changes that
order — it does not move the call out of the listener. **So winning the ordering
gains nothing: the compaction has already run.**

## All extension points enumerated

| Point | Can it block an attempt? | Why |
|---|---|---|
| `agent/pre-step` | **No** | The call is inside the listener body, not after its `next()` |
| `compaction/summary-error` | **No** | Fires only *after* a failure; cannot prevent the next |
| `llm/stream` | **No** | Wraps an invocation; cannot decide no invocation happens |
| `session/event` | **No** | Read-only observation |
| surface rewrite | **No** | Addresses *fewer triggers*, not *do not retry a failing one* |

## What the fix actually requires

A guard inside the upstream listener:

```ts
// upstream only — no plugin can insert this
if (breakerTripped(session)) return next()
```

That needs a session-scoped counter spanning both the `pressure` and
`context-overflow` paths, exponential backoff, and a tripped state cleared only
when the context materially changes. [P4] implements the correct backoff shape but
only on the pressure path and only as a subclass — the counter must live where
both paths can see it.

## What a plugin *can* still do

Stated so the negative result is not overstated:

- **Detect and report the pattern.** [`../tools/doctor.mjs`](../tools/doctor.mjs)
  already identifies retry storms from session logs [O11].
- **Observe individual failures** via `session/event`, and surface a user-visible
  warning — arguably worth doing on its own, since every failure is currently a
  bare `logger.warn` [S11].
- **Intervene after a failure** via the `compaction/summary-error` waterfall, the
  one failure-recovery point the core reserves for extensions.

None of these *prevents* an attempt, which is what a breaker is for.

## Files

| File | Purpose |
|---|---|
| `assess.mjs` | Prototype of the core logic (observe → count → backoff → trip) |
| `feasibility.mjs` | Checks whether the `pre-step` listener calls `next()` |
| `intervention-points.mjs` | Enumerates every extension point and its blocking capability |

> **Note on `assess.mjs`.** Its "18 calls reduced to 5" result assumes the
> breaker can suppress attempts. **That assumption is false**, so the number is
> illustrative of the *mechanism*, not of an achievable outcome. Kept because it
> shows the arithmetic; do not cite it as a benefit.

## Reproduce

```sh
node assess.mjs                # core logic, and the misleading reduction figure
node feasibility.mjs <checkout>  # shows the in-body call
node intervention-points.mjs <checkout>  # enumerates all points
```

The two source-reading scripts take an upstream checkout path, as an argument or
via `DSH_SRC`:

```sh
git clone https://github.com/deepseek-ai/deepseek-harness.git /tmp/dsh
node feasibility.mjs /tmp/dsh
DSH_SRC=/tmp/dsh node intervention-points.mjs
```
