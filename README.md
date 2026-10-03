**English** | [中文](README.zh.md)

# dsh-compaction-guide

**A guide to DeepSeek Harness automatic compaction: why long sessions break, what
has already been fixed, and what remains unfixable.**

> **This is a guide, not a package.** There is nothing to install. The repository's
> body is documentation; the diagnostic tool and the verification scripts exist to
> make the claims checkable, not as products.
>
> **Citation convention.** Factual claims carry inline markers — `[S…]` pinned
> source, `[O…]` measurements made in this study, `[P…]` prior art — resolved in
> [`REFERENCES.md`](REFERENCES.md). Claims that are **inferred rather than
> measured** are marked `[inferred]`. Where a number appears in two forms they are
> labelled *de-duplicated* and *union* [O3].

---

## Start here

| If you want to… | Read |
|---|---|
| Fix a session that is misbehaving now | [`guide/quick-guide.md`](guide/quick-guide.md) |
| Understand the three failure mechanisms | [§2–§4 below](#2-mechanism-a--overflow-recovery-is-unreachable) |
| Know which plugins already exist and which conflict | [`PRIOR-ART.md`](PRIOR-ART.md) |
| Check your own logs | [`tools/doctor.mjs`](tools/doctor.mjs) |
| See how every number was obtained | [`EVIDENCE.md`](EVIDENCE.md) |
| Know what is still broken | [`PLAN.md`](PLAN.md) |

---

## Abstract

Automatic compaction in DeepSeek Harness 0.2.0-rc.2 succeeds in a minority of
attempts on a long-running session corpus: **9 successes out of 51 starts
(17.6%)** [O4]. Failures are not spread across causes — **~95% carry a single
error text**, `pi-ai detected context overflow for model "…"` [O5].

Three independent mechanisms are identified, each isolated by a controlled
comparison:

1. **A request-classification defect makes overflow recovery unreachable.** An
   HTTP 413 whose body carries no provider message is classified
   `INVALID_REQUEST`, while the recovery hook requires
   `CONTEXT_WINDOW_EXCEEDED` [S1][S3][S4]. Of 239 observed 413s, **100%** were
   misclassified [O6].
2. **The summarization request is unbounded.** It replays the compacted region
   verbatim [S6], while the overflow path maximises that region by passing a zero
   retention budget [S5][S9]. Holding everything but window size fixed:
   **7/7 successes at 1,000,000 tokens versus 1/22 at 262,144** [O8].
3. **No backoff, no breaker, no user-visible signal.** Eighteen consecutive
   failures were recorded in one turn with **no growth in inter-attempt interval**
   [O11][S11].

A prior-art review of 20 repositories finds mechanism 1 **already solved** by a
maintained plugin [P1] — verified working on this host [O15] — and mechanism 2
**structurally eliminated** by two others [P2][P5]. Mechanism 3 has **no
implementation, and cannot have one**: feasibility testing shows no extension
point can suppress a compaction attempt [O24].

**This guide therefore documents, verifies, and points at existing fixes rather
than shipping a competing one.**

---

## 1. Measurement basis

All counts derive from **158 session-log files across 137 session directories**
[O1], decoded frame-by-frame with Node's native zstd support.

Three methodological hazards are reported because each materially changes the
numbers:

**1.1 A whole-buffer zstd decode silently returns only the first frame.** On one
log, a whole-buffer `zstdDecompressSync` returned **188 bytes** where frame-by-frame
decoding returned **25,048,287 bytes across 709 frames (7,455 events)**, with no
exception raised [O2]. Any statistic computed that way under-reports and does not
fail loudly.

**1.2 Session snapshots overlap, and counting them all inflates every total.**
A session directory retains `session.jsonl.zstd`, `session.v3.jsonl.zstd`, and
`session.v4.jsonl.zstd` as **cumulative views of one session**, not disjoint
segments [O3]. Every figure is given in both forms:

| Quantity | De-duplicated | Union of snapshots |
|---|---|---|
| `compaction/start` | **51** | 84 |
| `compaction/summary` (succeeded) | **9** | 21 |
| Failed closures | **42** | 63 |
| Success rate | **17.6%** | 25.0% |
| `413 → INVALID_REQUEST` | **239** | 478 |

The de-duplicated column is the rate a user experiences; the union column counts
one session once per stored snapshot. The inflation is directly visible: the union
run lists `session-5f8b1111` once per snapshot with an identical `starts = 22` each
time [O3].

**1.3 Counting by substring produces false positives.** An early pass counted 248
"overflow hits" by searching for `CONTEXT_WINDOW_EXCEEDED`. One session that merely
*discussed* the constant contributed 66 of them with **zero real error events**
[O13]. This is why the diagnostic counts by structured event type and payload
field.

A fourth limitation concerns classification rather than counting:
**`compaction/end` does not persist error codes** — it stores `error` as a string
flattened by `errorChain()`, with `code`, `name`, and `cause` absent [O14]. Code
distributions were therefore recovered from `assistant/attempt` stream failures,
which do carry `failure.code` and `failure.status`.

---

## 2. Mechanism A — overflow recovery is unreachable

### 2.1 The classification path

The adapter classifies a failed request in this order [S1]:

```ts
else if (isContextWindowExceededError(detail)) code = 'CONTEXT_WINDOW_EXCEEDED'
else if (status === 400 || status === 413 || type === 'invalid_request_error') code = 'INVALID_REQUEST'
```

**The order is correct**: the textual test precedes the status test. The defect
lies upstream of it. When the response body carries no `error.message`, the
adapter synthesizes a fallback string [S2]:

```
DeepSeek Messages request failed (413)
```

That string names no context bound, so all three regexes in
`isContextWindowExceededError` miss [S3], and the error falls through to the
`status === 413` branch.

The recovery hook is gated on precisely the code that was not assigned [S4]:

```ts
if (failure.code !== CONTEXT_WINDOW_EXCEEDED_CODE) return next()
```

**The adapter's own fallback message defeats the classifier it feeds.**

### 2.2 Evidence

**Distribution.** Of 239 observed 413s, **239 (100%)** were classified
`INVALID_REQUEST`, with zero exceptions [O6]. Every sampled 413 carried the
identical fallback text, and **none carried a provider-authored
`error.message`** [O7].

**Controlled comparison.** Within a single session, same model and same declared
window, the only variable is the HTTP status [O10]:

| Status | Assigned code | Triggered compaction | Outcome |
|---|---|---|---|
| **400** | `CONTEXT_WINDOW_EXCEEDED` | **3 times**, at +9 ms / +25 ms / +32 ms | **all succeeded** |
| **413** | `INVALID_REQUEST` | **never** | failed |

This rules out "the compaction logic is broken": the logic succeeds whenever it is
reached.

### 2.3 Consequence

`INVALID_REQUEST` is also absent from the retryable-code set [S12]. The sequence
is: request refused → compaction never invoked → context never reclaimed → the
session cannot progress.

The user-visible *handoff* state is **not** caused by compaction failing [O12].
The handed-off session had `failedEnds = 0` and zero compactions at the moment of
handoff; the chain is request failure → no compaction → stall → **the user runs
`/rescue`** → handoff, with `session/title` and `handoffs.jsonl.at` sharing the
identical millisecond `1789659712327` and the originating event's `source.kind`
being `"user"` [O12].

**What to do**: [`guide/quick-guide.md` §3](guide/quick-guide.md).

---

## 3. Mechanism B — the summarization request overflows itself

### 3.1 Three interacting lines

**Unbounded input.** The summarizer builds one request containing the entire
shadowed region verbatim, with no chunking and no size guard [S6].

**Maximised region.** The overflow path passes a literal `0` as the retention
budget [S5]. Retention selection accumulates nodes from the tail until the budget
is met [S9]; with a budget of `0` the first iteration satisfies the condition
immediately, so the retained tail is a single node and the compacted region
expands to nearly the entire surface.

**Unpinned target.** The summarization model resolves as
`configured ?? latest ?? agentTarget` [S7], where `latest` is the conversation's
**currently routed model**. With the configuration pair unset — its default — the
summarizer inherits whatever window the conversation happens to be using.

The conjunction: **the largest possible input is sent to the smallest available
window, at the moment that window is already full.**

### 3.2 Evidence

**Controlled comparison, window size as the sole variable** [O8]. Same machine,
same plugin stack, same period:

| Summarization route window | Compactions | Succeeded | Failed |
|---|---|---|---|
| 1,000,000 | 7 | **7** | 0 |
| 262,144 | 22 | 1 | **21** |

**Physical record.** The single successful compaction in the failing session
carried `shadowedTokenCount = 557,896` with `inputTokens = 791,091` [O9] — **557K
tokens of history sent to a 262K window.**

### 3.3 Why the failure cannot self-heal

The summarization call is a **direct** `ctx.llm.stream()` invocation [S8]; it does
not pass through the agent loop. The only overflow-recovery entry point is the
`agent/request-error` waterfall, which the loop dispatches. A direct call
therefore never dispatches that event, so **a summarization overflow has no
recovery path**.

The secondary hook, `compaction/summary-error`, does not close this: in the
shipped composition its only listener handles `IMAGE_OFFLOAD_REQUIRED_CODE` and
returns `false` for every other code.

**What to do**: [`config/README.md`](config/README.md) — including where the
setting lives, which is not where most people look [O17][O18].

---

## 4. Mechanism C — no backoff, no breaker, no signal

The `agent/pre-step` listener catches every compaction failure and logs it [S11]:

```ts
ctx.logger.warn(`step compaction failed: ${message}; continuing the turn`)
```

The turn continues, the context is still full, and the next step triggers
compaction again. The `maxOverflowRetries` budget is counted only on the
`agent/request-error` path; the `pressure` path has no session-wide counter, and
the pressure loop's own retry counter is local to one call [S14].

**Measured cadence** [O11], from the worst session:

| Quantity | Value |
|---|---|
| Consecutive failures within one turn | **18** |
| Minimum interval | 76,631 ms |
| Median interval | 101,173 ms |
| Maximum interval | 778,069 ms |
| Total failure span | 5,391 s (89.9 min) |

A backoff would produce increasing intervals. The observed distribution is flat:
**the interval does not grow with failure count** [O11].

### 4.1 This one cannot be fixed by a plugin

Breaker behaviour requires **skipping an attempt before it happens**. Every
extension point was enumerated; none can [O24]:

| Point | Why it cannot block |
|---|---|
| `agent/pre-step` | The call runs **inside** `compaction-basic`'s own listener body [S14], not after its `next()` — so winning the waterfall ordering changes nothing |
| `compaction/summary-error` | Fires only *after* a failure; cannot prevent the next |
| `llm/stream` | Wraps an invocation; cannot decide that no invocation happens |
| `session/event` | Read-only observation |
| surface rewrite | Addresses *fewer triggers*, not *do not retry a failing one* |

The required change is a guard **inside** the upstream listener:

```ts
// upstream only — no plugin can insert this
if (breakerTripped(session)) return next()
```

**The negative result is published in full**, because this layout is not apparent
from reading any single extension point, and a plugin author could reasonably
spend the effort before discovering it. Evidence:
[`verify-feasibility/`](verify-feasibility/).

**What you can do today**: reduce the number of triggers
([`guide/quick-guide.md` §7](guide/quick-guide.md)), and report upstream.

---

## 5. A byte-versus-token discrepancy

The trigger is computed from tokens [S10]:

```
threshold = floor(min(W × thresholdRatio, W − O − headroomTokens))
```

For a route declaring `contextWindow: 1000000, maxTokens: 256000`, this yields
`min(800000, 1000000 − 256000 − 65536) = 678,464` tokens. The token budget
therefore reports headroom, while the serialized request at that size is several
megabytes.

A transport or proxy enforcing a **byte** limit is not priced anywhere in this
computation — no byte bound exists in the LLM layer for text requests.

**`[inferred]`** The inference that byte-limit rejection is what produces the
observed 413s is consistent with the status code, the empty body [O7], and the
arithmetic above, but the harness cannot observe the provider's byte threshold and
the exact limit is unpublished. The alternative — that the provider genuinely
rejected a malformed request — is not excluded by the available evidence. This
distinction does not affect Mechanisms A or B, both established by direct
measurement [O8][O10]; it affects only the proposed remedy in
[`PLAN.md`](PLAN.md).

This scenario is also the subject of upstream [S16].

---

## 6. Upstream status

| Discussion | Subject | State |
|---|---|---|
| [S15] #7214 | a length stop with one output token escapes overflow detection | **open** |
| [S16] #7626 | compaction cannot rescue an oversized session | **open** |

Verified against `master` `0.2.1-alpha.1` (`5badb150`, 2026-10-03): the zero
retention budget on the overflow path [S5] is **still present** [S0b].

**Do not wait for upstream to resolve this.**

---

## 7. What this repository contains

### 7.1 [`guide/`](guide/) — the guide proper

| Page | Covers |
|---|---|
| [`quick-guide.md`](guide/quick-guide.md) | Symptom → cause → action, with costs and residual risks |

### 7.2 [`tools/doctor.mjs`](tools/doctor.mjs) — diagnostic

Reads a session corpus and reports the quantities in [O4]–[O6] and [O11]:
compaction totals, success rate, failure taxonomy, HTTP status → assigned code
mapping, and retry-storm detection. `--json` for machines, `--merge` for
union-of-snapshots semantics [O3].

**It is the reproduction path for every number in this guide** — not a product.

### 7.3 [`PRIOR-ART.md`](PRIOR-ART.md) — compatibility map

Twenty repositories assessed, with a coverage matrix, **hard incompatibilities**,
and recommended combinations. This exists because the ecosystem's conflicts are
not discoverable from individual READMEs: five plugins replace the same service
and **fail to boot together**, and one refuses to load on newer hosts by hash gate.

**One plugin's version gate was measured rather than assumed** [O15], and one
caveat was found and reported rather than omitted [O16].

### 7.4 [`config/`](config/) — hardening

Where the settings live (an agent preset, **not** a profile patch layer [O17][O18]),
what to change, and **what it costs** [O22]. Every recommended block was
constructed against a real `0.2.0-rc.2` engine [O20]; seven malformed variants
were confirmed rejected rather than failing silently [O21].

### 7.5 [`EVIDENCE.md`](EVIDENCE.md) and [`REFERENCES.md`](REFERENCES.md)

Full methodology, raw counts, controlled experiments, and nine stated threats to
validity. Citations resolve by pattern-matching against a pinned revision, not by
transcription — [`verify-refs/check-refs.mjs`](verify-refs/check-refs.mjs).

### 7.6 [`PLAN.md`](PLAN.md)

What remains broken, and one closure: Gap 4 (circuit breaker) is recorded as an
**upstream request**, not a plan, because a plugin cannot implement it [O24].

---

## 8. Threats to validity

**Single-corpus scope.** All counts derive from one user's session logs [O1]. The
*frequencies* — 17.6%, 239/239, 18 consecutive — describe that corpus and **do not
generalise**. The *mechanisms* are established against pinned upstream source
[S1]–[S14] and are not corpus-specific.

**Persistence-layer limitation.** `compaction/end` omits error codes [O14], so the
failure taxonomy [O5] is by rendered text.

**Unobservable provider behaviour.** The byte threshold in §5 is provider-side and
unpublished; that finding is `[inferred]`.

**Snapshot-selection sensitivity.** Totals depend on which snapshot is selected per
session [O3]; both forms are reported.

**Prior-art assessment is static.** Compatibility and coverage claims are
source-level reading, not execution. **With one exception** — [P1] was installed
and exercised against a real host [O15]. Eight of the twenty repositories were
assessed from metadata only.

**Recommendations were verified on one host version.** All configuration findings
are against `0.2.0-rc.2` [O20][O21][O22]. **`0.2.1-alpha.1` was not tested.**

**No end-to-end validation exists.** Nothing here demonstrates that applying the
recommended settings to a currently-failing session makes it succeed. The
mechanisms are understood and the direction of the effect is established [O8], but
a reader applying them is making a **reasoned change, not a verified fix**.

**A test can pass through the wrong gate.** Three verification attempts in this
study were initially wrong in the same way — they exercised a low-level helper or
an incomplete harness and reported its behaviour as the system's. Each was
corrected by entering through the real path; the corrected runs are the ones
reported, and the failed attempts are kept in `verify-*/` as evidence [O19][O26].

---

## 9. Reproducing this guide

```sh
# de-duplicated counts — the user-facing rates
node tools/doctor.mjs "$DSH_HOME/sessions"

# union of all snapshots — reproduces the inflated totals in §1.2
node tools/doctor.mjs "$DSH_HOME/sessions" --merge

# machine-readable
node tools/doctor.mjs "$DSH_HOME/sessions" --json
```

Source claims are verifiable by checking out the pinned commits [S0a][S0b] and
reading the cited lines. Line numbers are resolved by
[`verify-refs/check-refs.mjs`](verify-refs/check-refs.mjs) rather than
transcribed — **re-run it after any revision change**.

---

## License

MIT
