**English** | [中文](README.zh.md)

# dsh-FixCompaction — configuration hardening

Zero-code mitigations. Nothing here modifies any file under the DSH installation.

> Markers `[S…]`/`[O…]` resolve in [`../REFERENCES.md`](../REFERENCES.md).
> Verification: [`../verify-config/`](../verify-config/) — correctness [O20][O21],
> residual risk [O22].

> **Scope.** This addresses **Mechanism B** — the summarization request exceeding
> a budget. It does **not** address Mechanism A (413 misclassification); for that
> see [`../PRIOR-ART.md`](../PRIOR-ART.md).

> **Read §5 before applying anything below.** These settings are verified to
> *load*, not verified to *help*. The costs are real and are stated explicitly.

---

## 1. Where the configuration goes — read this first

**The compaction rows do not live in your profile patch layer.** They live in an
**agent preset** [O17]. A profile patch targeting `compaction-basic` by id is
**not applied** — the loader reports `patch: entry "compaction" not found`, and
the patch is silently discarded [O18].

The shipped preset declares them inside a `cordis:group` [O17]:

```yaml
- id: compaction
  name: cordis:group
  group: true
  isolate:
    compaction: true
    toolResultPruner: true
  config:
    - id: compaction-basic
      name: '@deepseek-ai/dsh-compaction-basic'
    - id: command-compact
      name: '@deepseek-ai/dsh-command-compact'
    - id: tool-result-pruner
      name: '@deepseek-ai/dsh-compaction-tool-result-pruner'
      config:
        thresholdChars: 8192
        headChars: 4096
        tailChars: 1024
```

The preset's own comment states why the rows sit together: `compaction-basic`
reads the pruner through `ctx.get`, so the pruner **must share this realm** rather
than sit outside it [O17].

**To change compaction settings, edit the agent preset you actually use** —
`$DSH_HOME/.agent-presets/<preset>/agent.cordis.yml` — and add a `config` block to
the `compaction-basic` row. A profile-level `--patch` overlay is the wrong layer.

> A top-level `- id: compaction-basic` entry also exists in the composed profile,
> but it is `disabled: true` and carries no configuration [O17]. Editing *that*
> row changes nothing.

---

## 2. Why the defaults make failure likely

The trigger is computed in `packages/compaction/compaction-basic/src/config.ts`
[S10]:

```
threshold = floor(min(W × thresholdRatio, W − O − headroomTokens))
retain    = floor((W − O) × retainRatio)
```

where `W` is the declared `contextWindow` and `O` the route's output reservation
(`maxTokens`). Defaults are `thresholdRatio 0.8`, `headroomTokens 65536`,
`retainRatio 0.16` [S10].

Worked example for a route declaring `contextWindow: 1000000, maxTokens: 256000`:

```
threshold = min(800000, 1000000 − 256000 − 65536) = 678464 tokens
retain    = floor(756000 × 0.16)                   = 119040 tokens
```

**Compaction does not begin until 678,464 tokens are resident.** At that size the
serialized request is several megabytes, and the summarization call — which
replays the compacted region verbatim [S6] — is the request most likely to exceed
a transport limit. The session is at its largest precisely when compaction first
attempts to run.

---

## 3. Recommended settings

Add this `config` block to the `compaction-basic` row **inside the `compaction`
group of your agent preset** (§1):

```yaml
    - id: compaction-basic
      name: '@deepseek-ai/dsh-compaction-basic'
      config:
        # Start compacting earlier: 0.5 × W instead of 0.8 × W.
        thresholdRatio: 0.5
        # Keep a smaller verbatim tail, so more history becomes compactable.
        retainRatio: 0.12
        # Default 65536; a smaller headroom leaves more usable input budget.
        headroomTokens: 32768
        # Cap summary output. Defaults to headroomTokens when unset.
        maxTokens: 32768

        # ↓ Only meaningful if an overflow-recovery plugin is installed. See §5.2.
        compactionRetries: 2
        maxOverflowRetries: 3
```

Every block below constructs successfully against `0.2.0-rc.2` [O20]. **That
states the settings are accepted; it does not state they improve outcomes.**

### 3.1 Pin an independent summarization model — the highest-impact change

By default the summarization target resolves as `configured ?? latest ??
agentTarget` [S7], where `latest` is **the conversation's currently routed
model**. If that route has a small window, the summary request overflows
immediately [O8].

```yaml
        summarizationProvider: '<provider>'
        summarizationModel: '<large-window-model>'
```

These two are **validated as a pair** — setting one without the other rejects the
plugin at load with `summarizationProvider and summarizationModel must be set
together as an empty or non-empty pair` [O21].

In the controlled comparison, pinning the summarizer to a 1,000,000-token route
took compaction from **21 failures out of 22** to **7 successes out of 7** [O8].

> **Do not assume a "smaller/cheaper" model helps.** A small model still has a
> finite window, so it does not remove the overflow — and a different model can
> degrade summary quality when the history mixes tool calls and tool results
> (structured content may be re-encoded differently). Pick a **large window**, not
> a small model.

---

## 4. Per-route overrides

```yaml
      config:
        thresholdRatio: 0.5
        modelPolicies:
          - provider: '<small-window-provider>'
            model: '<small-window-model>'
            thresholdRatio: 0.4
            retainTokens: 16384
```

Load-time validation rejects unknown keys, duplicate per-route overrides,
`retainRatio` together with `retainTokens`, and any retention at or above the
threshold [O21].

---

## 5. Residual risks — read before applying

Verification covered **whether the settings load** [O20]. It did **not** cover
whether they help, and it did **not** cover the costs. Those are stated here.

### 5.1 A mis-typed provider or model fails at runtime, not at load — **high risk**

The constructor does **not** resolve the summarization target; it validates only
that the pair is set together [O22]. Measured: `summarizationProvider:
'nonexistent-provider'` with `summarizationModel: 'some-model'`, and separately a
non-existent model id, **both construct successfully**.

**Consequence.** A typo passes startup silently. The failure surfaces only when a
session first reaches the compaction threshold — which may be hours later, and
which the user will experience as *the session breaking*, not as *a config typo*.

**Mitigation.** After editing, confirm the provider and model ids appear verbatim
in your provider block (§6), or run `/compact` in a disposable session to force a
summarization call immediately and observe the result.

### 5.2 `maxOverflowRetries` is inert until Mechanism A is fixed — **medium risk**

`maxOverflowRetries` governs the `agent/request-error` path [S14], which is gated
on `failure.code === CONTEXT_WINDOW_EXCEEDED` [S4]. With Mechanism A unfixed, an
HTTP 413 is classified `INVALID_REQUEST` and **never reaches that path** [O6].

**Consequence.** Raising `maxOverflowRetries` from 1 to 3 changes nothing on a
stock host. It becomes meaningful only alongside an overflow-reclassification
plugin such as [P1].

### 5.3 Lowering `thresholdRatio` increases cost — **medium risk, quantified**

Every compaction is a full model call replaying the compacted region [S6]. A lower
threshold means more compactions.

| Setting | Trigger point (`W`=1,000,000, `O`=256,000) |
|---|---|
| Default `thresholdRatio: 0.8` | 678,464 tokens |
| Recommended `0.5` | 500,000 tokens |

The recommended setting fires **26% earlier** [O22]. On a long working session
that is **more summarization calls, at real token cost**. The trade is deliberate:
compacting earlier is what keeps the summarization request small enough to
succeed [O8]. If cost matters more than reliability on your workload, leave
`thresholdRatio` at the default and pin the summarization model (§3.1) instead —
that change alone addresses Mechanism B without increasing compaction frequency.

### 5.4 Lowering `maxTokens` introduces a truncation failure mode — **low risk**

`maxTokens` caps summary output. If a summary exceeds it, the harness fails the
compaction with `summarization truncated at the token cap (incomplete
checkpoint)`, which is recorded as a compaction error [S6-derived].

The recommendation halves the default (65,536 → 32,768). **Measured summary sizes
in the analysed corpus: maximum 6,585 output tokens, median 4,596** [O23] — comfortably
below the cap. **This is a single-corpus observation, not a guarantee**: a corpus
with much longer sessions could produce longer summaries.

### 5.5 Verified on one host version only — **unknown risk**

All [O20]/[O21]/[O22] measurements are against `0.2.0-rc.2`. **`0.2.1-alpha.1` was
not tested.** The validation path is unchanged between the two revisions as far as
the cited source shows [S0a][S0b], but that is an inference from source, not a
measurement.

### 5.6 The benefit is inferred, not demonstrated end-to-end — **the largest caveat**

The 1,000,000-token comparison [O8] is an **observational** finding from a
corpus, not a controlled trial of these settings. No measurement here demonstrates
that applying §3 to a session that currently fails will make it succeed. The
mechanism is understood [S5][S6][S7] and the direction of the effect is
established [O8], but **a user applying these settings is making a
reasoned change, not a verified fix.**

---

## 6. Verify the route's declared window

Mechanism B is partly triggered by an **over-optimistic `contextWindow`**. Check
your provider block:

```yaml
- id: llm-pi-ai
  name: '@deepseek-ai/dsh-llm-pi-ai'
  config:
    providers:
      <provider-name>:
        models:
          - id: <model-id>
            contextWindow: <declared>
            maxTokens: <output reservation>
```

- Models **absent** from `@earendil-works/pi-ai`'s built-in catalog fall back to
  `defaultContextWindow`, whose default is **262144** [S13]. The fallback is
  **silent**, so a mistyped or unlisted model id degrades the budget with no
  diagnostic — this is the same class of failure as §5.1.
- A proxy enforcing a **byte** limit can reject a request the token budget
  believes is fine [S16]. Tokens and bytes are both real limits; only one is
  priced ([README §5](../README.md)).

**Set `contextWindow` to a value you have measured, not a value you hope for.**

---

## 7. What this cannot fix

| Defect | Fixed by config? | Risk of assuming otherwise |
|---|---|---|
| Mechanism A — 413 → `INVALID_REQUEST`, recovery skipped | **No** [S1][S3][S4] | §5.2: recovery settings stay inert |
| Mechanism B — summarization request overflows itself | **Mitigated**, not eliminated [S5][S6][S7] | §5.6: benefit is inferred |
| Mechanism C — no backoff / breaker / signal | **No** [S11] | Retry storms continue |
| Single indivisible oversized node | **No** — upstream declares it out of contract | — |

A session that has **already** crossed the transport limit cannot be rescued by
configuration alone: the summarization request will keep failing. Recovery from
that state requires a plugin or a fresh session.

---

## 8. Reverting

Every change above is additive YAML in your own preset. To revert, delete the
`config:` block from the `compaction-basic` row; the defaults documented in §2
apply again. **No file under the DSH installation is touched by any of this**, so
an application update cannot conflict with it.
