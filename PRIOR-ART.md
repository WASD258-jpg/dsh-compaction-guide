**English** | [中文](PRIOR-ART.zh.md)

# PRIOR-ART — what already exists, and what does not

> **Why this document exists.** DSH's compaction-fix ecosystem grew quickly and is
> now **mutually exclusive in non-obvious ways**: several plugins replace the same
> service and will fail to boot together, one silently shadows another, and two of
> the most relevant are not on npm at all. Choosing a combination by reading
> individual READMEs is not possible — each one describes only itself.
>
> This is a compatibility map. It is the reason this repository exists.
>
> **Citation convention**: markers `[P…]` resolve in [`REFERENCES.md`](REFERENCES.md).
> Claims marked `[unverified]` were assessed from metadata only.

**Investigation method**: source-level reading of every repository below via
`raw.githubusercontent.com` — implementation files, not README summaries. **No
repository was cloned and no plugin was executed** [EVIDENCE §8.5](EVIDENCE.md).
See [§6 Limitations](#6-limitations) for exactly what was and was not verified.

---

## 1. Coverage matrix

Legend: ✅ complete · 🔶 partial · ❌ absent · ➖ not applicable

| Repository | A<br>413 misclassified | B<br>summarizer unbounded | C<br>no backoff / no breaker | Distribution |
|---|---|---|---|---|
| [`@argszero/cordis-plugin-length-stop-overflow`](https://github.com/argszero/cordis-plugin-length-stop-overflow) | ✅ **the only complete fix** | ❌ explicitly declines | ❌ | npm |
| [`dsh-hypercompact`](https://github.com/mrbeandev/dsh-hypercompact) | ✅ incidental | ✅ **structurally eliminated** (zero LLM) | 🔶 retry counter | npm |
| [`bvbhu/dsh-quilt-compact`](https://github.com/bvbhu/dsh-quilt-compact) | ❌ | ✅ **real chunking** (token budget) | 🔶 route health only | GitHub |
| [`huohua-dev/dsh-compaction-policy`](https://github.com/huohua-dev/dsh-compaction-policy) | ❌ | 🔶 parameters only | ✅ **the only real backoff** | GitHub |
| [`dsh-agent-compact`](https://github.com/jonah791/dsh-agent-compact) | ❌ | ✅ **structurally eliminated** | ➖ | npm |
| [`@treeseed/dsh-chapters`](https://github.com/treeseed-ai/dsh-chapters) | ❌ | ✅ **structurally eliminated** (deterministic TOC) | ➖ | npm |
| [`@falling-ts/dsh-force-compact`](https://github.com/falling-ts/dsh-force-compact) | ❌ | 🔶 | 🔶 round cap + wall clock | npm |

**Read the A column carefully**: exactly one plugin fixes root cause A. Everything
else either ignores it or inherits the misclassification.

---

## 2. Hard incompatibilities

### 2.1 Replacing the compaction backend — pick exactly one

Every plugin that supplies its own `compaction` service registers against the
**same service name**. Registering two fails at boot:

```
service "compaction" has been registered at <BasicCompactionEngine>
```

(This is recorded in `treeseed-ai/dsh-chapters`' own compatibility notes.)

**Mutually exclusive set** — choose at most one:

- `dsh-hypercompact`
- `bvbhu/dsh-quilt-compact`
- `dsh-agent-compact`
- `@treeseed/dsh-chapters`
- `@falling-ts/dsh-force-compact`

### 2.2 `@argszero/cordis-plugin-length-stop-overflow` is orthogonal

It hooks the `llm/stream` waterfall, **not** the compaction service. It therefore
composes with any single backend above. This is the one plugin that can always be
added.

### 2.3 `huohua-dev/dsh-compaction-policy` conflicts with 2.1

It **extends** `BasicCompactionEngine` rather than replacing it, so it cannot
coexist with any plugin in the mutex set.

It also pins its host exactly and **verifies five method hashes at load**:

```json
"@deepseek-ai/dsh-compaction-basic": "0.2.0-rc.2"
```

On a newer host it **refuses to load** rather than degrading. Its own README calls
these "deliberate safety gates, not a promise of forward compatibility." **If you
run 0.2.1-alpha.1, this plugin will not load.**

### 2.4 Two plugins writing `compaction-basic` config will fight

Loader patch entries **replace** a config block rather than deep-merging it. Two
patch rows targeting `compaction-basic` means the later one wins wholesale —
`thresholdRatio`, `retainRatio`, and `modelPolicies` from the earlier row are
discarded silently.

---

## 3. Recommended combinations

> **Every combination below carries risks, and they are stated.** These
> recommendations rest on static source analysis of nineteen repositories [§6]
> and on one executed plugin [O15][O16]. **None of them has been run
> end-to-end.** Treat them as reasoned starting points, not verified fixes.

### 3.1 Conservative — keep the LLM summarizer

```yaml
- insert:
    - id: length-stop-overflow
      name: '@argszero/cordis-plugin-length-stop-overflow'
```

Plus backend **one of**: [P2] *(its README marks 0.2.0-rc.2 as tested)* or [P3]
*(token-based chunking, keeps summary quality)*.

**Covers**: A + B. **Leaves open**: C — a retry storm is still possible [O11].

**Risks**:

| Risk | Severity | Detail |
|---|---|---|
| A 413 with unrelated wording is also reclassified | medium | Any `status === 413` is rewritten before wording is consulted [O16], so an image-size rejection would be treated as an overflow. Impact is bounded — a wasted compaction, with the original error preserved [PRIOR-ART §5.2]. |
| The replacement backend is unverified here | unknown | [P2] and [P3] were **not** executed in this study. Their own documentation is the only evidence for their behaviour. |
| The backend choice is irreversible in practice | low | Backends are mutually exclusive [§2.1], so switching later means re-validating from scratch. |
| Observation ≠ correction | low | Start with `mode: 'warn'` [P1] to confirm the reclassification rate on your own traffic before letting it change behaviour. |

### 3.2 Add configuration hardening

Apply [`config/`](config/) on top of either combination. Pinning an independent
large-window summarization model is the single highest-impact change, and it is
orthogonal to every plugin here.

**Risks**: see [`config/README.md` §5](config/README.md) — a mistyped summarization
provider fails at runtime rather than load [O22a], and the benefit of these
settings is **inferred rather than demonstrated** [§5.6].

### 3.3 What is *not* recommended

- **Do not stack two backends.** Boot failure [§2.1], quoted from [P6] rather than
  reproduced here.
- **Do not use [P4] on 0.2.1-alpha.1.** Its hash gate refuses to load [§2.3].
- **Do not assume a "cheaper" summarization model helps.** A small model still has
  a finite window, so it does not fix the overflow — and a different model can
  degrade summary quality when the history mixes tool calls and tool results.
- **Do not apply these changes to a session you cannot afford to lose.** Nothing
  here has been validated against a session that is currently failing.

---

## 4. The gaps — what nobody has built

Verified against source, not READMEs. **These are the vacancies this project
targets.**

### Gap 1 — the `retainTokens = 0` line has never been fixed

The overflow path passes `0`, expanding the compacted region to nearly the whole
surface exactly when the window is full. Nobody repairs it; everyone replaces the
whole backend instead.

The clearest evidence is [`bvbhu/dsh-quilt-compact`](https://github.com/bvbhu/dsh-quilt-compact)
computing the **correct** value on one path while hard-coding `0` on the other —
in the same file. The author knew the right answer and still wrote `0` for the
overflow path.

`@argszero/…` states its refusal plainly in its own README:

> *"It does not bound the summarization request by bytes. That is a core change…
> no plugin can chunk that region without losing content."*

### Gap 2 — byte-bounded summarization **is genuinely vacant**

Upstream [#7626](https://github.com/deepseek-ai/deepseek-harness/discussions/7626)
suggests bounding the summarization request by **bytes**. Nobody has.

The ecosystem sits at two opposite ends:

| Approach | Example | Bound by |
|---|---|---|
| Chunk it | `bvbhu/dsh-quilt-compact` | **tokens** (real tokenizer, overlap, sentence-snapped cuts) |
| Don't call an LLM | `dsh-hypercompact` | **bytes** (but no summarization request exists at all) |

**The intersection — keep the LLM summarizer *and* bound its request in bytes —
is empty.** This matters because a token budget and a transport byte limit are
different limits, and only one of them is priced by the harness.

### Gap 3 — no recovery path for a *summarization* overflow

The summarizer streams through a direct `ctx.llm.stream()` call, so it never
dispatches `agent/request-error` — and overflow recovery is gated on exactly that
event. Once you keep the LLM-summarization route, this hole remains.

Three plugins avoid it by removing the summarization call entirely
(`dsh-agent-compact`, `dsh-chapters`, `dsh-hypercompact`). One partially mitigates
it (`bvbhu` retries retryable codes) but its own source notes the limit:

> *"DSH's retryPolicy executor itself only acts on agent-loop request failures."*

**Positive fix — re-dispatching a summarization failure through the loop — has
zero implementations.**

### Gap 4 — no global circuit breaker (the largest gap)

The user-visible symptom recorded in [`EVIDENCE.md`](EVIDENCE.md): **18
consecutive failures, median interval 101 s, and the interval does not grow with
failure count.** Nothing in the ecosystem treats this.

The only genuine backoff is `huohua-dev`'s `2 ** (count - 1)` (60 s → 600 s,
count capped at 32, with a material-change probe). But its scope is narrow:
the `context-overflow` branch does not increment the counter, any success resets
it, and state lives in a `WeakMap` that is lost on restart.

Every other "C" is a different axis:

- `bvbhu`'s cooldown is **fixed at one hour** and cools **route health**, not
  compaction attempts.
- `falling-ts` caps **rounds** (8) and wall clock (90 s).

And the original lesion is still copied forward: `bvbhu` re-implements the
upstream `catch` that does nothing but `logger.warn`.

**No cross-trigger, cross-path breaker with user-visible state exists.**

---

## 5. Plugin-by-plugin notes

### `@argszero/cordis-plugin-length-stop-overflow` — the root-cause-A fix

Three independent triggers, each togglable, each corresponding to a different
upstream discussion [P1]:

| Rule | Detects | Upstream |
|---|---|---|
| length stop | a `length` stop with ≤2 output tokens (`DEFAULT_AT_MOST_OUTPUT_TOKENS = 2`) | [S15] |
| oversize failure | `INVALID_REQUEST` + 413, or a size-and-request wording match | [S16] |
| saturated failure | provider usage ≥ `DEFAULT_SATURATION_RATIO = 0.99` of the advertised window | [S17] |

It imports `CONTEXT_WINDOW_EXCEEDED_CODE` **by value** from the harness [P1], so
its classification cannot drift from the core's. `mode: 'warn'` allows
observation without rewriting.

#### 5.1 Verification performed

The plugin's `peerDependencies` range ends at `<0.2.0`, so running it on
0.2.0-rc.2 was **an unverified path**. It has now been measured rather than
assumed. Method: a scratch package resolved `@deepseek-ai/dsh-llm@0.2.0-rc.2` and
`@deepseek-ai/cordis@4.0.4`, then installed and exercised the plugin.

| Check | Result |
|---|---|
| `pnpm add` under a 0.2.0-rc.2 host | **installs** — peer mismatch does not block |
| All five value-imported codes exist in 0.2.0-rc.2 | **pass** — each resolves to its expected string |
| `llm/stream` waterfall present in 0.2.0-rc.2 | **pass** |
| Module import | **pass** — 26 named exports |
| `ctx.plugin(plugin)` mount on a real `Context` | **pass** — no service conflict, no inject error |
| Positive case: the exact observed failure (`INVALID_REQUEST` + `status: 413` + the adapter fallback string) | **reclassified** as `request-too-large`, `matched: 'status'` |
| `kind: 'aborted'` / `kind: 'max-tokens'` | **not rewritten** |
| Reverse cases: `RATE_LIMIT` 429, malformed 400, `QUOTA` 402, `AUTH` 401, `IMAGE_OFFLOAD_REQUIRED`, `EMPTY_RESPONSE`, token-cap wording | **all correctly passed through** (7 of 8) |

**Conclusion: the version gate is a packaging artifact, not a functional
barrier.** On 0.2.0-rc.2 the plugin installs, loads, and reclassifies the exact
failure mode this repository documents.

#### 5.2 One measured caveat

The reverse-case set has **one** exception. `isRequestTooLargeFailure` returns
`true` for **any** failure carrying `status === 413` before consulting any
wording [P1]:

```js
export function isRequestTooLargeFailure(failure) {
    if (failure.status === 413)
        return true
    ...
}
```

A 413 arising from something other than overall request size — image-size
rejection being the plausible case — would therefore also be reclassified as
`CONTEXT_WINDOW_EXCEEDED`. Measured against the plugin's own classifier: the
string `image is too large: 5MB exceeds 4MB limit` **is** reclassified.

The `RECOVERY_OWNED_CODES` guard does not cover this, because it protects codes
(`IMAGE_OFFLOAD_REQUIRED`, `CONTEXT_WINDOW_EXCEEDED`), not messages.

**Impact assessment**: `[inferred]` The practical exposure depends on whether the
provider returns image-size rejections as 413 on this route, which was **not**
measured. In the corpus analysed here, every observed 413 was a size refusal of
the whole request [O6][O16]. The failure mode is bounded in any case: a
misclassified image rejection would trigger a compaction that reclaims no space,
after which the original error is preserved.

**Recommendation**: enable all three rules, and start with `mode: 'warn'` to
confirm the reclassification rate on real traffic before letting it change
behaviour — which is what the plugin's own documentation suggests.

### `dsh-hypercompact` — zero-LLM, byte-budgeted

The only plugin with a real byte budget:

```
maxRequestBytes / targetRequestBytes / retainBytes
```

It eliminates root cause B **structurally**: there is no summarization request to
overflow. Its README marks 0.2.0-rc.2 as tested.

### `bvbhu/dsh-quilt-compact` — the serious chunker

The most technically substantial LLM-based option:

- a **real tokenizer** (bundled `deepseek-v4-tokenizer.json.gz`), with a comment
  that names the problem directly — a `chars/4` heuristic is CJK-blind and
  under-counts real sessions by **2×–2.4×**
- overlapping chunks with cuts snapped to sentence-ending lines; **lines are
  atomic**, so code lines are never split
- three-stage budget subtraction (15% output + 512 prompt overhead + 512 safety)
- a normalized per-chunk quota ensuring `Σcapᵢ ≤ usable input`

**But it is token-only, and its session-model fallback path is explicitly
unbounded** — its own comment: *"The fallback is one call over the whole region."*

### `huohua-dev/dsh-compaction-policy` — the only real backoff

`RetryGuard` implements genuine exponential backoff plus a **material-change
probe**: a retry is allowed early only if the context actually changed by at least
`retryAfterTokens`, compared by seq + hash. This is the right shape — it prevents
re-attempting an unchanged, still-doomed compaction.

**But it will not load on 0.2.1-alpha.1** (§2.3), and it does not count
`context-overflow` attempts.

### `@treeseed/dsh-chapters` — lossless by construction

Fork instead of rewrite: a deterministic table-of-contents, **zero inference
tokens**. **Apache-2.0** — the only non-MIT license in this set; retain its NOTICE
if you redistribute.

### `dsh-agent-compact` — the agent summarizes itself

`compactIfNeeded` returns `null` permanently; summaries come from the agent's own
checkpoint output. Removes the separate summarization request entirely.

### `@falling-ts/dsh-force-compact` — local-model aggressive compaction

A dual-engine facade (upstream realm / self-built) [P7]. Its mitigations are a
round cap (8) and a 90-second wall clock rather than backoff, so a stuck session
terminates rather than recovering.

---

## 5a. Not reusable

Two repositories surfaced during the search carry **no license declaration**.
Their ideas may inform a design, but their code is not reusable:

- `Yunado/dsh-compaction-fix`
- `oldflag2333333/*`

A third relevant artifact is a discussion rather than software:
[discussion #7632][S17] documents a usage-based overflow detection gap that [P1]
addresses as its third trigger rule.

---

## 6. Limitations

**Verified**: every repository above was read at source level via
`raw.githubusercontent.com` — implementation files, not README prose. The
`retainTokens = 0` findings [P3][P4], the mutex behaviour [P6], the hash gate
[P4], and the backoff formula [P4] were all confirmed in code.

**Not verified** [EVIDENCE §8.5](EVIDENCE.md):

- **No repository was cloned and no plugin was executed, with one exception.**
  [P1] was installed and exercised against a real `0.2.0-rc.2` host
  [PRIOR-ART §5.1](PRIOR-ART.md) [O15]. Every other compatibility claim here is
  static analysis. The boot-failure citation is quoted from
  `@treeseed/dsh-chapters`' own compatibility notes [P6], not reproduced.
- **Eight repositories were assessed from metadata only** (marked `[unverified]`
  in the detailed report). Those cells are README-derived inference and **must not
  be treated as final**.
- **One unresolved conflict**: `huohua-dev`'s README states defaults
  (`thresholdRatio: 0.9`, `outputReserveCap: 0`) that disagree with its source
  `DEFAULTS` (`0.85`, `20000`) [P4]. Both were read; neither could be confirmed as
  current. Treat its numbers as unverified.
- **License caution**: `Yunado/dsh-compaction-fix` and `oldflag2333333/*` carry
  **no license declaration**. Their *ideas* may inform, but their *code* is not
  reusable.
- **Verification covers one host version.** [O15] was measured against
  `0.2.0-rc.2`. It does **not** establish behaviour on `0.2.1-alpha.1`, nor for
  any other plugin.

Star counts and version numbers were captured at the time of writing and drift.

---

## 7. Verification artifacts

The [O15]/[O16] measurements are reproducible:

| File | What it does |
|---|---|
| `verify-argszero/verify.mjs` | Resolves a `0.2.0-rc.2` host, checks the five value imports, the `llm/stream` waterfall, module import, and `ctx.plugin()` mount |
| `verify-argszero/behavior2.mjs` | Drives the real classifier entry point against one positive and eight negative cases |

> **Methodological note.** An earlier attempt called the low-level
> `oversizeFailure()` helper directly and appeared to reclassify all eight
> negatives — including rate limits and aborts. That was a **test error**: the
> guards live in `classifyOversizeFailure()`, which the direct call bypassed.
> Calling the real entry point shows 7 of 8 negatives passing through. Recorded
> here because the incorrect result was nearly published as a finding.