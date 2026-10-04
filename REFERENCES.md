**English** | [中文](REFERENCES.zh.md)

# References

> **Citation discipline.** Every factual claim in this repository carries an
> inline marker pointing here. Three classes, distinguished by prefix:
>
> | Prefix | Class | Meaning |
> |---|---|---|
> | `S` | **Source** | A location in pinned upstream source, or an upstream discussion. Reproducible by checking out the commit and reading the line. |
> | `O` | **Observation** | A measurement made in this study. Reproducible by running the tool named in the entry. |
> | `P` | **Prior art** | Third-party software or documentation. Read at source level where marked. |
>
> A claim with no marker is either a definition or a statement about this
> document. Claims that are **inferred** rather than measured are marked
> `[inferred]` at the point of use.

---

## S — Source citations

Upstream revisions analysed. All line numbers are pinned to these commits; they
will drift as the project moves.

| Id | Revision | Commit | Date | Role |
|---|---|---|---|---|
| **S0a** | `0.2.0-rc.2` | `639ed015` | 2026-09-29 | the released build analysed |
| **S0b** | `0.2.1-alpha.1` | `5badb150` | 2026-10-03 | `master` at time of writing |

Repository: <https://github.com/deepseek-ai/deepseek-harness>

Unless stated otherwise, line numbers cite **S0b**; where the two revisions
differ, both are given.

| Id | Location (verified against S0b) | States |
|---|---|---|
| **S1** | `packages/llm/llm-deepseek/src/transport.ts:32` | Error-classification order: the textual context-overflow test is evaluated **before** the `status === 400 \|\| status === 413` branch. |
| **S2** | `packages/llm/llm-deepseek/src/transport.ts:25` | When the response body carries no `error.message`, the adapter synthesizes `DeepSeek Messages request failed (<status>)`. |
| **S3** | `packages/llm/llm/src/error.ts:83` | `isContextWindowExceededError` matches on **text only** — three regexes requiring `context length/window`, `too large for … context`, or an `exceed`/`context` co-occurrence. |
| **S4** | `packages/compaction/compaction-basic/src/index.ts:194` | The overflow-recovery hook returns early unless `failure.code === CONTEXT_WINDOW_EXCEEDED_CODE`. |
| **S5** | `packages/compaction/compaction-basic/src/index.ts:299` | The `context-overflow` path calls `selectCompactableRange(session, measurement, 0)` — a literal `0` retention budget. |
| **S6** | `packages/compaction/compaction-basic/src/summarizer.ts:146` | One `RequestMessage[]` is built as `[...input.messages, <instruction>]`: the whole shadowed region verbatim, with no chunking and no size guard. |
| **S7** | `packages/compaction/compaction-basic/src/summarizer.ts:137` | The summarization target resolves as `configured ?? latest ?? agentTarget`, where `latest` is the conversation's currently routed model. |
| **S8** | `packages/compaction/compaction-basic/src/summarizer.ts:163` | The summarization call goes through a **direct** `ctx.llm.stream()`, not through the agent loop. |
| **S9** | `packages/compaction/compaction-basic/src/region.ts:139` | Retention selection accumulates nodes from the tail until `accumulated >= retainTokens`; with `retainTokens === 0` the first iteration breaks immediately. |
| **S10** | `packages/compaction/compaction-basic/src/config.ts:191` | Trigger arithmetic: `threshold = floor(min(W × thresholdRatio, W − O − headroomTokens))`; defaults `thresholdRatio 0.8`, `headroomTokens 65536`, `retainRatio 0.16`. |
| **S11** | `packages/compaction/compaction-basic/src/index.ts:172` | The `agent/pre-step` listener catches every compaction failure and logs `logger.warn(...); continuing the turn`. No rethrow, no backoff, no counter. |
| **S12** | `packages/llm/llm/src/retry-policy.ts:18` | `DEFAULT_RETRYABLE_CODES` does not include `INVALID_REQUEST`. |
| **S13** | `packages/llm/llm-pi-ai/src/catalog.ts:914` and `src/config.ts:65` | A model absent from the built-in catalog falls back to `defaultContextWindow`; `DEFAULT_CONTEXT_WINDOW = 262_144`. The fallback is silent. |
| **S14** | `packages/compaction/compaction-basic/src/index.ts` (`compactIfNeeded`, pressure branch) | The pressure loop retries up to `compactionRetries` and then throws; the retry counter is local to one call, not session-wide. |

> **Line-number discipline.** These were resolved by pattern-matching against
> `0.2.1-alpha.1` [S0b] with [`verify-refs/check-refs.mjs`](verify-refs/check-refs.mjs),
> not transcribed from memory. An earlier draft mixed `0.2.0-rc.2` line numbers
> with `0.2.1-alpha.1` ones and cited a wrong file for [S13]; both were corrected
> by running the checker. **Re-run it after any revision change** — otherwise a
> reader following a citation lands on the wrong line.

### Upstream discussions

| Id | Reference | State at time of writing |
|---|---|---|
| **S15** | [discussion #7214](https://github.com/deepseek-ai/deepseek-harness/discussions/7214) — *A length stop with one output token escapes overflow detection, so a dead session never recovers and continue is a no-op* | open |
| **S16** | [discussion #7626](https://github.com/deepseek-ai/deepseek-harness/discussions/7626) — *Compaction cannot rescue an oversized session — the summarization request itself exceeds the provider request-size limit (HTTP 413)* | open |
| **S17** | [discussion #7632](https://github.com/deepseek-ai/deepseek-harness/discussions/7632) — usage-based overflow detection misses a refusal delivered as `stopReason: "error"` | referenced by [P1] |

---

## O — Observations made in this study

Each entry names the artifact that reproduces it. All counts are from one user's
session corpus unless stated otherwise; see
[EVIDENCE §8](EVIDENCE.md#8-threats-to-validity) for the implications.

| Id | Observation | Reproduced by |
|---|---|---|
| **O1** | **Corpus scope.** 198 `*.jsonl.zstd` files across 177 session directories (re-measured 2026-10-05; the corpus is live and grows). Format is zstd multi-frame concatenation with magic `28 B5 2F FD`. | `node tools/doctor.mjs <root>` |
| **O2** | **Whole-buffer decode silently truncates.** On `session-5f8b1111/session.v3.jsonl.zstd`, a whole-buffer `zstdDecompressSync` returned **188 bytes**; frame-by-frame decoding returned **25,048,287 bytes across 709 frames = 7,455 events**. No exception was thrown. | `tools/doctor.mjs` decode path |
| **O3** | **Two independent kinds of duplication inflate every total, and fixing one does not fix the other.** (a) *Snapshots*: `session.jsonl.zstd`, `.v3`, `.v4` are overlapping cumulative views, not disjoint segments — counting all files gives 84 starts / 21 summaries / 478 413s. (b) *Fork inheritance*: a session with `parentSession` replays its parent's events byte-identically inside `seedLength`, and because the two live in different directories, one-file-per-session de-duplication cannot see it. One file per session gives **30 starts / 9 summaries / 239 413s**; the naive count was 52 / 10 / 42 because 22 starts, 1 summary and 21 failures were inherited replays. | `--merge` vs default |
| **O4** | **Compaction totals (de-duplicated, fork inheritance excluded).** `compaction/start` 30, `compaction/summary` 9, failed closures 21. Success rate **9/30 = 30.0%**. **Corrected 2026-10-05:** this said 51 / 42 / 17.6%. A forked session replays its parent's compactions inside `seedLength`, and per-directory de-duplication could not see it — 22 starts, 1 summary and 21 failures were counted twice. | default run |
| **O4b** | **Compaction totals (union of snapshots).** 84 / 21 / 63 — success rate 25.0%. | `--merge` |
| **O5** | **Failure taxonomy, by rendered error text** (de-dup / union): `pi-ai detected context overflow for model "…"` **40 / 60**; `DeepSeek request aborted by caller` 2 / 3. Overflow is ~95% of all failures. | default / `--merge` |
| **O6** | **HTTP status → assigned code** (de-dup / union): `413 → INVALID_REQUEST` **239 / 478**; `400 → CONTEXT_WINDOW_EXCEEDED` 9 / 14. **100% of 413s were classified `INVALID_REQUEST`, zero exceptions.** | default / `--merge` |
| **O7** | **Every 413 sample carried an identical fallback string.** All 30 sampled failures read `DeepSeek Messages request failed (413)`; **none** carried a provider-authored `error.message`. | sample dump |
| **O8** | **Controlled comparison — the conversation's route is the sole variable.** Same session `session-5f8b1111`; only the routed model changes, and compaction outcomes track it exactly. On `deepseek-official/deepseek-v4-flash` (declared window **1,000,000**): 1 compaction, **1 succeeded**. After the route switches to `openrouter/stealth/ox-alpha` (declared window **262,144**): **18 consecutive failures**, every one naming `stealth/ox-alpha`. After the route switches back: no further failures. Cross-session: `session-c0acb35e` on a 1,000,000-token route → 7 compactions, **7 succeeded**. | `request/context` declarations interleaved with `compaction/end` |
| **O9** | **The summarization request is unbounded, and it succeeded only because the route happened to have a large window.** The single successful compaction in `session-5f8b1111` had `shadowedTokenCount = 557,896` with `inputTokens = 791,091`, and it ran on `deepseek-official/deepseek-v4-flash` — a **1,000,000**-token route. It did **not** overflow a 262,144 window; there is no size guard at all, so the same request on a smaller route would simply fail. | `compaction/summary` payload (records `provider`, `model`, `usage.inputTokens`) |
| **O10** | **Controlled comparison — HTTP status is the sole variable, within one session.** In `session-c0acb35e` (snapshot `session.jsonl.zstd`), two status-**400** events are each followed by a compaction start at **+25 ms** and **+32 ms**, and both compacted successfully; status **413** overflows triggered compaction **zero times**. Same session, same model, same declared window. A third `+9 ms` pairing exists in a *different snapshot* of the same session (`seq 18444`), not in this file; an earlier version of this entry counted it as a third occurrence in one file, which is the snapshot-duplication error [O3] warns about. | `assistant/chunk` events carrying `status`, interleaved with `compaction/start` |
| **O11** | **No backoff.** In the worst session: **18 consecutive failures inside a single turn** (turn 90); inter-attempt intervals min **76,631 ms**, median **101,173 ms**, max **778,069 ms** — reproduced exactly. The interval **does not increase** with failure count. **Corrected 2026-10-05:** this also published a "total failure span" of **5,391 s**, which reproduces under **no** window we can construct. The burst's own span is **4,022 s** (start-to-start) or **3,966 s** (end-to-end); the file's full span is **615,258 s**. 5,391 s matches none of them and its origin is unknown. The three interval figures — the actual evidence for "no backoff" — are unaffected. | interval histogram; per-turn grouping |
| **O12** | **Handoff is not caused by compaction failure.** The handed-off session had `failedEnds = 0` and zero compactions at the moment of handoff. The chain is: request fails → compaction never triggers → session stalls → **user** runs `/rescue` → handoff. Verified against both records the claim names: the `session/title` event at `seq 15739` carries `time = 1789659712327` with `source.kind = "user"`, and `handoffs.jsonl` records `oldSessionId` = that same session with the same millisecond `at`. Note the value also appears in 11 session logs in total, most of them research sessions that quote it — **presence in a log is not evidence of the pairing; the two named records are.** | `session/title` event + `dsh-session-rescue/handoffs.jsonl` |
| **O13** | **A substring-counting false positive, recorded as a methodology warning.** An early pass counted 248 "overflow hits" by full-text search for `CONTEXT_WINDOW_EXCEEDED`. One session merely *discussing* the constant contributed 66 of them with **zero real error events**. The real figure is [O6]. | — |
| **O14** | **`compaction/end` does not persist error codes.** It stores `error` as a flattened string via `errorChain()`; `code`, `name`, and `cause` are absent. Code distributions are therefore unavailable at that layer and were recovered from `assistant/attempt` stream failures instead, which do carry `failure.code` and `failure.status`. | event schema dump |
| **O15** | **`@argszero/cordis-plugin-length-stop-overflow@0.3.0` works on a `0.2.0-rc.2` host despite a `<0.2.0` peer range.** Verified by resolving `@deepseek-ai/dsh-llm@0.2.0-rc.2` + `@deepseek-ai/cordis@4.0.4` in a scratch package, installing the plugin, and exercising it. Install, all five value-imported codes, the `llm/stream` waterfall, module import, and `ctx.plugin()` mount all succeeded; the exact observed failure shape was reclassified `request-too-large`. | `verify-argszero/verify.mjs` |
| **O16** | **Reverse-case behaviour of the oversize rule: 7 of 8 pass through correctly.** `RATE_LIMIT` 429, malformed 400, `QUOTA` 402, `AUTH` 401, `IMAGE_OFFLOAD_REQUIRED`, `EMPTY_RESPONSE`, and token-cap wording are all left untouched. **The exception**: any failure carrying `status === 413` is reclassified before wording is consulted, so a 413 with unrelated wording — `image is too large: 5MB exceeds 4MB limit` — is also reclassified. | `verify-argszero/behavior2.mjs` |
| **O17** | **The compaction rows live in an agent preset, not the profile layer.** The shipped preset declares `compaction-basic`, `command-compact`, and `tool-result-pruner` inside a `cordis:group` whose `isolate` block carries `compaction: true, toolResultPruner: true`. The preset's own comment states the pruner must share the realm because `compaction-basic` reads it through `ctx.get`. A top-level `- id: compaction-basic` entry also appears in the composed profile, but it is `disabled: true` and carries no configuration. | `--dump-config`; `$DSH_HOME/.agent-presets/<preset>/agent.cordis.yml` |
| **O18** | **A profile-level patch targeting the compaction group is silently discarded.** Applying `- id: compaction …` through `--patch` produces `patch: entry "compaction" not found` and changes nothing; the composed tree is unchanged. Configuration must be edited in the agent preset instead. | `--patch … --dump-config` |
| **O19** | **Schema-level validation alone is insufficient to test a config.** Calling `BasicCompactionEngine.Config(config)` accepted an unknown key (`thresoldRatio`) and the mutually-exclusive `retainRatio`+`retainTokens` pair. The real checks run in `resolveConfig()` at construction, so a test must instantiate the engine. | `verify-config/schema-test.mjs` vs `schema-test2.mjs` |
| **O20** | **Five recommended configuration blocks construct successfully** against `0.2.0-rc.2`: the full recommendation, the recommendation plus an independent summarization pair, the summarization pair alone, a threshold-only change, and a headroom-only change. | `verify-config/schema-test2.mjs` |
| **O21** | **Seven malformed configuration blocks are rejected at construction, 7/7.** Unknown key, `retainRatio`+`retainTokens` together, retention ≥ threshold, provider without model, model without provider, negative headroom, and `maxTokens: 0`. Each produces a specific diagnostic naming the offending field. | `verify-config/schema-test2.mjs` |
| **O22** | **Four residual risks in the recommended settings, measured.** (a) A non-existent `summarizationProvider` or `summarizationModel` **constructs successfully** — the failure surfaces only at the first summarization call, not at load. (b) Lowering `thresholdRatio` 0.8 → 0.5 moves the trigger from 678,464 to 500,000 tokens, i.e. **26% earlier and correspondingly more summarization calls**. (c) Raising `maxOverflowRetries` is inert while Mechanism A is unfixed, because the `agent/request-error` path is never reached. (d) Halving `maxTokens` to 32,768 introduces a truncation failure mode if a summary exceeds it. | `verify-config/risk-test.mjs` |
| **O22a** | **Sub-item (a) of [O22], cited where the failure *timing* is the point**: a mis-typed summarization target is not rejected at load, so a typo is indistinguishable from a working configuration until a session reaches the compaction threshold. | `verify-config/risk-test.mjs` |
| **O23** | **Observed summary sizes in the analysed corpus (re-measured 2026-10-05).** Over 10 recorded summaries from 4 sessions: provider `usage.outputTokens` — min **3,207**, median **4,596**, max **6,585**; summary text — min **10,663** chars, median **13,912**, max **15,880**. **Corrected 2026-10-05:** this said max 4,963 / median 4,312, which matches no measurable quantity, and it cited `tools/doctor.mjs` as the reproduction path while that tool did not compute summary sizes at all. It does now. The maximum comes from the session that was *researching this very defect*, whose summaries are unusually long — treat 6,585 as an upper bound from a skewed sample, not a typical size. This is a single-corpus observation and does not bound other workloads. | `tools/doctor.mjs` (`Summary sizes` block, and `summarySizes` in `--json`) |
| **O24** | **No extension point can suppress a `compaction-basic` attempt — but replacing the backend can.** Within the shipped composition, `compaction-basic` calls `compactIfNeeded` **inside its own `agent/pre-step` listener body** [S14], before its `next()`, so winning the waterfall ordering does not intercept the call. `compaction/summary-error` fires only after a failure; `llm/stream` wraps an invocation but cannot suppress one; a surface rewrite addresses fewer triggers, not a failing retry. **All four enumerated points are correctly ruled out.** The scope is narrower than originally stated, though: these findings are about *observing* a backend, not about *being* one. `CompactionEngine` is abstract with three members and **its constructor registers no listeners** — the listeners are registered by the subclass `BasicCompactionEngine` (`index.ts:158/178/184/190`). A replacement backend **is** that subclass, so a session-scoped breaker is implementable there. | [`verify-feasibility/intervention-points.mjs`](verify-feasibility/intervention-points.mjs); [PLAN §Gap 4](PLAN.md) |
| **O25** | **No orphaned compactions in the corpus.** Across every snapshot, **84 `compaction/start` events paired with 84 `compaction/end` events** — zero unmatched starts, and no compaction span crossing a `session/end-seed`. The lock-release design's failure mode is designed-for but not commonly observed. | session-log scan; `tools/doctor.mjs` reports start/end counts per session |
| **O26** | **A third-party plugin can invoke the tool-result pruner's service directly.** With the dependency chain mounted (`session` → `sessionProjections` → `tokenMeter` → `pruner`), a plugin obtains the service via `ctx.get('toolResultPruner')` and calls `pruneSession()`, which returns a result object. **An earlier test reported the service as unreachable; that was a test-harness artefact** — a bare `Context` lacks the dependency chain, so the service was never registered. Corrected by mounting the full chain. | [`verify-config/pathb-final.mjs`](verify-config/pathb-final.mjs) |

---

## P — Prior art

Compatibility, coverage, and incompatibility claims for these are in
[PRIOR-ART.md](PRIOR-ART.md). Source-level reading is marked; the rest is
metadata-level.

| Id | Project | License | Read at |
|---|---|---|---|
| **P1** | [`argszero/cordis-plugin-length-stop-overflow`](https://github.com/argszero/cordis-plugin-length-stop-overflow) | MIT | source |
| **P2** | [`dsh-hypercompact`](https://github.com/mrbeandev/dsh-hypercompact) | MIT | partial source |
| **P3** | [`bvbhu/dsh-quilt-compact`](https://github.com/bvbhu/dsh-quilt-compact) | MIT | source |
| **P4** | [`huohua-dev/dsh-compaction-policy`](https://github.com/huohua-dev/dsh-compaction-policy) | MIT | source |
| **P5** | [`dsh-agent-compact`](https://github.com/jonah791/dsh-agent-compact) | MIT | source |
| **P6** | [`@treeseed/dsh-chapters`](https://github.com/treeseed-ai/dsh-chapters) | **Apache-2.0** | partial source |
| **P7** | [`@falling-ts/dsh-force-compact`](https://github.com/falling-ts/dsh-force-compact) | MIT | partial source |

### External literature consulted for the design of the recommendations

| Id | Reference | Relevance |
|---|---|---|
| **P8** | Lindenbauer et al., *The Complexity Trap: Simple Observation Masking Is as Efficient as LLM Summarization for Agent Context Management*, arXiv:2508.21433 (2025) | Evidence that reversible observation masking matches LLM summarization at roughly half the cost — a fallback strategy that cannot overflow, relevant to the degradation path in [PLAN](PLAN.md). |
| **P9** | Anthropic, *Effective context engineering for AI agents* | Prior art for treating context maintenance as an explicit, agent-invocable operation rather than a passive failure response. |