# dsh-FixCompaction — roadmap

> **Positioning**: this project does **not** re-implement fixes that already
> exist. Root cause A is solved by a maintained plugin; several plugins
> structurally eliminate root cause B. Rebuilding those would add a competing
> wheel, not value.
>
> What this project provides is the thing the ecosystem lacks: **a
> compatibility map, a diagnostic, and the two gaps nobody has filled.**
>
> See [`PRIOR-ART.md`](PRIOR-ART.md) for the evidence behind each decision.

---

## Shipped

| Item | Status | What it does |
|---|---|---|
| [`tools/doctor.mjs`](tools/doctor.mjs) | **done** | Reads session logs, reports compaction success rate, failure taxonomy, HTTP status → code mapping, and retry-storm detection. Reproduces every number in [`EVIDENCE.md`](EVIDENCE.md). |
| [`EVIDENCE.md`](EVIDENCE.md) | **done** | Methodology, raw counts, controlled experiments, reproduction commands. |
| [`PRIOR-ART.md`](PRIOR-ART.md) | **done** | 20-repository coverage matrix, hard incompatibilities, recommended combinations, and the four verified gaps. |
| [`config/`](config/) | **done** | Zero-risk configuration hardening; works with any plugin combination. |

---

## Next — the two real gaps

### ~~Gap 4~~ — a global circuit breaker: **the correct fix is upstream, not a plugin**

**Status: investigated and closed.** This entry originally proposed building a
circuit-breaker plugin. **Feasibility testing showed a plugin cannot implement
it**, so the item is recorded here as an upstream request rather than a plan.

**Why a plugin cannot do it.** Breaker behaviour requires *skipping* a compaction
attempt before it happens. Every extension point was enumerated; none can:

| Point | Why it cannot block |
|---|---|
| `agent/pre-step` | The compaction call runs **inside** `compaction-basic`'s own listener body [S14], not after its `next()`. Winning the waterfall ordering changes nothing. |
| `compaction/summary-error` | Fires only **after** a summarization has already failed; it cannot prevent the next attempt. |
| `llm/stream` | Wraps an invocation; it cannot decide that no invocation happens. |
| `session/event` | Read-only observation. |
| surface rewrite | Treats *fewer triggers*, not *do not retry a failing one*. |

The required change is a guard **inside** the pre-step listener:

```ts
// upstream only — no plugin can insert this
if (breakerTripped(session)) return next()
```

**Why it still matters.** The symptom is real and user-visible: 18 consecutive
failures in one turn with no backoff growth [O11]. A plugin can *report* it —
`tools/doctor.mjs` already detects the pattern — but cannot *prevent* it.

**What is being asked upstream.** A session-scoped attempt counter spanning both
the `pressure` and `context-overflow` paths, with exponential backoff and a
tripped state that skips further attempts until the context materially changes.
[P4] implements the correct backoff shape but only on the pressure path and only
as a subclass; the counter needs to live where both paths can see it.

**Recorded because the negative result is useful**: this layout is not obvious
from reading any single extension point, and a plugin author could reasonably
spend the effort before discovering it.

### ~~Gap 2~~ — byte-bounded summarization

**Status: still vacant, but out of scope for this repository.** Upstream [S16]
recommends it and no implementation exists [PRIOR-ART §4](PRIOR-ART.md). The
pieces are available ([P3] chunking skeleton, [P2] byte estimation).

This is a **core change to `compaction-basic`'s summarizer**, not a plugin: the
summarizer builds its request internally. Recorded here so the vacancy stays
visible, not as a commitment of this project.

---

## Optional — incidental corrections

### Gap 1 — `retainTokens = 0` on the overflow path

A one-line inconsistency: the pressure path computes a real retention budget, the
overflow path passes `0`. Nobody fixes it; every plugin replaces the backend
instead.

**Not a standalone deliverable** — patching a vendor file is overwritten on
upgrade, and the fix belongs upstream. Best carried as an upstream report or as
part of Gap 2.

### Gap 3 — a recovery path for summarization overflow

The summarizer's direct `ctx.llm.stream()` call never dispatches
`agent/request-error`, so overflow recovery cannot see it.

Wrapping this correctly means re-entering the loop, which risks fighting the
mutex set. Revisit only if Gap 2 does not resolve it.

---

## Upstream

Both relevant discussions are **open** as of 2026-10-03:

- [#7214](https://github.com/deepseek-ai/deepseek-harness/discussions/7214) — a
  length stop with one output token escapes overflow detection
- [#7626](https://github.com/deepseek-ai/deepseek-harness/discussions/7626) —
  compaction cannot rescue an oversized session

**Verified against `master` `0.2.1-alpha.1` (`5badb150`): `retainTokens = 0` is
still present.** Contribute findings upstream rather than maintaining a fork.

---

## Non-goals

- **Another compaction backend.** Five exist; they are mutually exclusive
  ([`PRIOR-ART.md` §2.1](PRIOR-ART.md)) and the best one already handles chunking
  [P3].
- **Another 413 classifier.** [P1] covers all three trigger shapes
  ([S15][S16][S17]) and is fail-closed. Depend on it.
- **Modifying files under the DSH installation.** Everything here is a plugin or
  an overlay; nothing patches vendor code.

---

## Design stance

The recommendations above share one premise: **context maintenance should be an
explicit, bounded operation, not a passive response to a failure.** [P9] argues
this directly — treating context as something the agent manages deliberately
rather than something that overflows on its own. [P8] supplies the empirical
case for the cheapest such operation: reversible observation masking matches LLM
summarization at roughly half the cost, and because it removes input rather than
calling a model, **it cannot itself overflow** — which is precisely the failure
mode Mechanism B describes.

Mechanisms A and C are both instances of the opposite stance: a problem is
detected (or would be) and then handled implicitly — a misclassification that
silently skips recovery [S1][S4], and a failure that is logged and immediately
retried [S11].
