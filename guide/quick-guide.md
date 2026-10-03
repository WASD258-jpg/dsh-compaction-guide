# Quick guide — what to do about slow, broken, or dying sessions

> Part of the [dsh-compaction-guide](../README.md). Citations `[S…]`/`[O…]`/`[P…]`
> resolve in [`../REFERENCES.md`](../REFERENCES.md).

This page answers one question: **my session is behaving badly — what do I do?**

Nothing here asks you to trust a claim; every recommendation links to the
measurement behind it. Where a fix has a cost, the cost is stated.

---

## 1. First, find out what is actually happening

Do not guess. The symptom "my session broke" has at least four distinct causes in
DSH, and they need different responses.

Run the diagnostic against your own logs:

```sh
node tools/doctor.mjs "$DSH_HOME/sessions"
```

It reports compaction success rate, failure taxonomy, the HTTP-status → assigned-code
mapping, and whether a retry storm occurred. `--json` for machines, `--merge` to
count overlapping snapshots instead of de-duplicating them [O3].

**What the output tells you:**

| Reading | Likely cause | Go to |
|---|---|---|
| Success rate well below 100% | Summarization request exceeding a budget | [§2](#2-sessions-that-compact-and-fail) |
| Any `413 → INVALID_REQUEST` | Overflow recovery is unreachable | [§3](#3-overflow-that-never-recovers) |
| Consecutive failures with a flat interval | No backoff | [§4](#4-retry-storms) |
| `compaction/start` with no `compaction/end` | A crash mid-compaction | [§5](#5-orphaned-compaction) |
| Nothing at all | Your session never compacted — look elsewhere | [§6](#6-when-compaction-is-not-the-problem) |

---

## 2. Sessions that compact and fail

**Symptom.** Compaction runs, fails, runs again. The session eventually stops
making progress. In the corpus analysed here, success rate was **17.6%** [O4],
and **~95% of failures carried one identical error text** [O5].

**Cause.** The summarization request replays the compacted region verbatim with no
size guard [S6], while the overflow path simultaneously maximises that region by
passing a zero retention budget [S5][S9]. The summarization model defaults to the
**route currently in use** [S7]. When that route has a smaller window than the
history being condensed, the summary request cannot fit.

**Controlled evidence.** Same machine, same plugin stack, window size the only
variable [O8]:

| Summarization route window | Compactions | Succeeded |
|---|---|---|
| 1,000,000 | 7 | **7** |
| 262,144 | 22 | 1 |

**What to do.** Pin an independent large-window summarization route. This is the
highest-impact change available without code. Full instructions, including *where*
the setting lives (a common trap — it is not in your profile patch layer [O17][O18]):

→ [`../config/README.md`](../config/README.md)

**Cost.** A lower `thresholdRatio` makes compaction fire **26% earlier**, which
means **more summarization calls at real token cost** [O22]. If you would rather
not pay that, pin the summarization route alone and leave the threshold at its
default.

**Residual risk.** A mistyped summarization provider or model **passes startup
silently** and fails only when compaction first runs — potentially hours later
[O22a]. Verify the names against your provider block before relying on it.

---

## 3. Overflow that never recovers

**Symptom.** A session hits a hard wall. Every turn fails; the context never
shrinks; nothing you do helps.

**Cause.** An HTTP 413 whose response body carries no provider message is
classified `INVALID_REQUEST` [S1][S2][S3], while the recovery hook requires
`CONTEXT_WINDOW_EXCEEDED` [S4]. **Of 239 observed 413s, 100% were misclassified**
[O6]. A within-session control confirms the mechanism: status **400** triggered
compaction 3 times and **all 3 succeeded**; status **413** triggered it **zero
times** [O10].

**Note on the "handed off" state.** If your UI shows a handoff, that is **not**
compaction failing — the handed-off session had zero compactions at that moment
[O12]. The chain is: request fails → compaction never runs → stall → *you* run
`/rescue` → handoff.

**What to do.** Install a plugin that restores the classification:

```yaml
- insert:
    - id: length-stop-overflow
      name: '@argszero/cordis-plugin-length-stop-overflow'
```

**Verification.** This plugin **was tested** against a real `0.2.0-rc.2` host
despite declaring a narrower peer range: it installs, loads, and reclassifies the
exact failure shape documented here [O15].

**Risk.** Any `status === 413` is rewritten before its wording is consulted [O16],
so an unrelated 413 — an image-size rejection, say — is also reclassified. Impact
is bounded: a wasted compaction, with the original error preserved. Start with
`mode: 'warn'` to see the rate on your own traffic first.

→ [`../PRIOR-ART.md`](../PRIOR-ART.md) for the plugin's full scope and its
incompatibilities.

---

## 4. Retry storms

**Symptom.** The log fills with repeated compaction attempts. The session feels
stuck. Measured in the corpus: **18 consecutive failures inside a single turn**,
intervals min 76.6 s / median 101.2 s / max 778.1 s — **the interval does not grow
with the failure count** [O11].

**Cause.** The failure handler logs and continues [S11]. The `pressure` path has no
session-wide counter [S14].

**What to do — and be clear about the limit.** There is **no plugin that can stop
this**. Breaker behaviour requires skipping an attempt *before* it happens, and
`compaction-basic` performs the call **inside its own `agent/pre-step` listener
body** [O24] — before its `next()` — so no waterfall ordering can intercept it.
The fix needs a guard inside the upstream listener.

**What you can do today:**

1. **Reduce the number of triggers**, so fewer opportunities to fail — see [§7](#7-the-proactive-prune).
2. **Make failures visible.** Today every failure is a bare `logger.warn` [S11];
   nothing tells you compaction is thrashing.
3. **Treat a stuck session as unrecoverable sooner** rather than waiting through
   dozens of retries.

The negative result is published in full because the layout is not apparent from
reading any single extension point: [`../verify-feasibility/`](../verify-feasibility/).

---

## 5. Orphaned compaction

**Symptom.** A `compaction/start` with no matching `compaction/end`.

**Cause.** The design appends `compaction/start` before summarization yields and
releases with `compaction/end`; a crash in between leaves a detectable orphan
deliberately.

**Good news.** In the corpus analysed, **84 starts and 84 ends paired 100%** —
zero orphaned starts, and no compaction span crossing a `session/end-seed` [O25].
This is a designed-for state, not a commonly observed one.

**What to do.** If the diagnostic reports an unmatched start, the session was
interrupted mid-compaction. Resuming the session is normally sufficient; the
orphan is recognised as stale once the process lifecycle advances.

---

## 6. When compaction is not the problem

A diagnostic run that reports **zero compactions** means your session never
reached the threshold — so whatever is wrong, it is not compaction.

**A trap worth knowing.** Searching logs for the text `CONTEXT_WINDOW_EXCEEDED`
produces false positives: a session that merely *discussed* the constant
contributed 66 text hits with **zero real error events** [O13]. This is why the
diagnostic counts by structured event type and payload field, not by substring.

---

## 7. The proactive prune

**Applies when** you want to reduce how often compaction fires.

The tool-result pruner can be invoked independently — verified: a third-party
plugin can obtain the service and call `pruneSession()` successfully.

> **Not yet shipped.** A helper for this is planned; see
> [`../PLAN.md`](../PLAN.md). The mechanism is verified, the packaging is not.

**What it does.** Trims oversized tool outputs *before* the context reaches the
compaction threshold, so compaction is triggered less often.

**What it does not do.** It does **not** add backoff. If a compaction does fail,
retries are still unthrottled [§4](#4-retry-storms). Treat it as reducing the
*number of opportunities* to fail, not as making failure safe.

---

## 8. Choosing between the fixes

| If your priority is… | Do this | Not this |
|---|---|---|
| Stop sessions dying at all | §3 (classification) + §2 (summarization route) | §7 alone — it only delays |
| Keep cost down | §2's summarization route only | Lowering `thresholdRatio` — costs more calls |
| Understand what happened | §1 diagnostic | Guessing from the UI |
| Fix retry storms | Nothing works yet — report upstream | Any plugin — none can [O24] |

**Do not combine two compaction backends.** Five plugins replace the same service
and **fail to boot together**; see [`../PRIOR-ART.md` §2](../PRIOR-ART.md).

---

## 9. What to report upstream

Both relevant discussions are open. If the diagnostic finds something here,
adding your numbers helps:

| Finding | Where |
|---|---|
| 413 classified `INVALID_REQUEST`, no recovery | [#7626](https://github.com/deepseek-ai/deepseek-harness/discussions/7626) [S16] |
| Length stop with a negligible output count | [#7214](https://github.com/deepseek-ai/deepseek-harness/discussions/7214) [S15] |
| Retry storm with no backoff | Not yet filed — the guard belongs in `compaction-basic`'s pre-step listener [O24] |

Include your diagnostic output (`--json`) and the upstream revision you are
running. The counts in this guide are from one corpus [O1] and are explicitly
**not** generalisable [EVIDENCE §8.1](../EVIDENCE.md) — yours may differ, and that
difference is itself useful.
