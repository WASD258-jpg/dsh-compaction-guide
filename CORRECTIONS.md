**English** | [中文](CORRECTIONS.zh.md)

# Corrections

Every figure in this guide was wrong at least once, and some stayed wrong through
several correction rounds. This page records what changed and why, so a reader who
saw an earlier version knows which numbers to distrust.

**The current figures are pinned to 2026-10-05.** See
[`REPRODUCING.md`](REPRODUCING.md) for how to re-measure.

---

## 1. The corpus baseline: 51 / 42 / 17.6% → 30 / 21 / 30.0%

**This was the worst one, because the whole guide rested on it.**

A forked session (`session-085190f3`) declares `parentSession = session-5f8b1111` and
`seedLength = 826443`. Inside that seed it replays the parent's entire history
**byte-identically** — all 70 of its compaction events match the parent's on
`type + seq + time + payload hash`, and the two sessions' `compaction/start` seq sets
are **equal as sets**. It performed **none** of them itself.

De-duplication was **per directory**. The fork lives in a different directory from its
parent, so it could not see this. 22 starts, 1 summary and 21 failures were counted
twice.

| Figure | Published before | Corrected |
|---|---|---|
| `compaction/start` | 51 | **30** |
| `compaction/summary` | 9 | **9** |
| Failed closures | 42 | **21** |
| Success rate | 17.6% | **30.0%** |
| 413 misclassifications | 239 | **239** (unaffected) |

### Why it survived three correction rounds

The old table's arithmetic **closed exactly**: `22 + 22 + 7 = 51` and `51 − 9 = 42`.
That closure was cited in this repository as evidence the counting was sound.

**It was the opposite.** The duplicate `22` is *what made* the arithmetic close.

> Duplicate counting produced exact closure. Exact closure was read as proof of
> correctness.

The only check that would have caught it — comparing the fork's events against its
parent's — was in no probe's coverage. Every check that *was* covered passed.

**The closer lesson:** `RECHECK-INTAKE` recorded that the frozen baseline reproduced
to the digit, and treated that as confirmation. It was confirmation of *stability*
only — the same wrong denominator on both runs.

---

## 2. Two figures were deleted, not corrected

### The "total failure span" of 5,391 s

`[O11]` published a total failure span of 5,391 s alongside 18 consecutive failures in
one turn. It reproduces under **no** window we can construct:

| Window | Value |
|---|---|
| The 18-failure burst, start-to-start | **4,022 s** |
| The 18-failure burst, end-to-end | 3,966 s |
| The whole file | 615,258 s |
| **Published 5,391 s** | **matches none of them** |

Because the table's heading says "from the worst session" while the 18-failure row is
scoped to one turn, a reader would reasonably read 5,391 s as *that burst*. Rather than
keep a number of unknown origin, it is gone. The three intervals — the actual evidence
for "no backoff" — are exact.

### The summary sizes of 4,963 / 4,312

`[O23]` published max 4,963 / median 4,312 tokens. Neither matches any measurable
quantity, **and `[O23]` cited `tools/doctor.mjs` as its reproduction path while that
tool did not compute summary sizes at all** — an empty reproduction path.

Re-measured over 10 summaries from 4 sessions:

| Measure | min | median | max |
|---|---|---|---|
| provider `usage.outputTokens` | 3,207 | **4,596** | **6,585** |
| summary text (chars) | 10,663 | 13,912 | 15,880 |

`doctor.mjs` now computes these. Note the maximum comes from the session that was
*researching this very defect*, whose summaries are unusually long — treat 6,585 as a
skewed-sample upper bound.

---

## 3. An over-correction: a correct number was deleted

The 400-to-compaction pairing count went `3 → 2 → 3`.

The middle step was **wrong**, and it is worth recording because it presented itself as
diligence. It argued the `+9 ms` pairing lived in "a different snapshot". That
inference came from reading `session.jsonl.zstd` — which is a **truncated residue** in
that directory, the very hazard this guide documents.

| Snapshot | `compaction/start` | 400 → start pairings |
|---|---|---|
| `session.jsonl.zstd` | 5 | 2 (+25, +32) |
| `session.v3.jsonl.zstd` | 6 | **3 (+9, +25, +32)** |
| `session.v4.jsonl.zstd` | 7 | **3 (+9, +25, +32)** |

Three is correct. The original figure was deleted on the strength of an
unrepresentative file, and the correction note that did it read as careful.

---

## 4. Smaller corrections

| What | Was | Now |
|---|---|---|
| Success rate in summaries | 17.6% | **30.0%** |
| Corpus scope | 158 files / 137 dirs | **198 / 177**, with a measurement date |
| Scripts in this repository | "20" | **22** (plus one `.sh`) |
| CI jobs | "4" | **5** |
| `index.ts` line for `prune.pruneSession` | 297 | **296** |
| `region.ts` / `region.js` size | "566 / 389 lines" | **566 / 389 non-blank** (600 / 405 total) |
| `[P3]`'s execution status | "not executed in this study" | **executed in full** — see [`PRIOR-ART.md`](PRIOR-ART.md) §risks |

The `index.ts:297` error is notable for a different reason: this repository ships a
citation checker, and it hard-coded one document (`FEASIBILITY.md`) to check. It never
looked at `PLAN.md`, so `PLAN.md`'s line numbers drifted unnoticed. **The checker now
scans documents instead of holding a fixed list.**

---

## 5. Why the reproducibility claim no longer asserts present tense

`README` used to say the corpus figures "were confirmed to reproduce". On a **live**
corpus — the directory the tool measures, which grows every time a session is used —
that assertion expires on its own. Re-running `doctor.mjs` while writing this page
returned `31 / 10 / 21` where the page says `30 / 9 / 21`, because the session doing
the measuring performed a compaction.

The figures are now pinned to a date, and you are asked to compare against the date
rather than the number alone.

---

## 6. What to check if you find a discrepancy

1. **Re-run [`tools/doctor.mjs`](tools/doctor.mjs)** and note the date.
2. **Check for forks.** The tool now reports inherited events separately. If it prints
   a "Fork inheritance excluded" block, your corpus has the duplication described in §1.
3. **Check which snapshot you read.** `session.jsonl.zstd` can be a truncated residue
   in a directory that also holds `.v3` / `.v4`. Never measure from a single named file.
4. **Open an issue.** Every correction on this page was found by someone checking a
   claim rather than trusting it — including the ones found by an adversarial audit of
   this repository's own work.

---

## 7. A package was begun and deleted

**Nothing was published, so there is nothing to uninstall.** Recorded because the claim
appeared in this repository's working notes and in `[O15]`, and a reader following either
would have drawn the wrong conclusion.

**What was claimed.** That `@argszero/cordis-plugin-length-stop-overflow` cannot be used on
DSH 0.2.x, because its `peerDependencies` on `@deepseek-ai/dsh-llm` exclude every 0.2.x
release — and worse, that a plain install would silently pull a *second* copy of `dsh-llm`
at 0.1.6-alpha.2 and wire the plugin to a harness version that is not the one running. A
wrapper package was started to fix that.

**What was actually true.** Both observations came from a **scratch package** that
deliberately resolved `0.2.0-rc.2`, which is not how a profile resolves anything. Walking
Node's resolution upward from a real profile directory shows a different picture:

| Level | What is there |
|---|---|
| `~/.dsh/profiles/web/node_modules/@deepseek-ai/dsh-llm` | absent — the profile has no `@deepseek-ai` of its own |
| `~/.dsh/profiles/node_modules/@deepseek-ai/dsh-llm` | a **symlink** to the machine's global install |
| that target | **0.1.6-alpha.1** |

`0.1.6-alpha.1` is inside the plugin's declared range (`>=0.1.6-alpha.1 <0.2.0`). The same
walk from `desktop`, `tui` and `default` reaches the same copy. **So in a normal profile the
peer range is not an obstacle, no override is needed, and no wrapper is needed.**

**Why the two differ, and what it cost.** A scratch package resolves from an empty
`node_modules`, so the only thing that can satisfy a peer is a registry fetch — which is
exactly what produced the 0.1.6-alpha.2 copy. A profile resolves from a shared layer that
already holds the harness packages. **The defect was an artefact of the test environment, and
it looked convincing because it was measured rather than assumed.**

The mistake is the one this project has now recorded several times: **verifying in one
context and reporting about another.** It cost a package that had to be thrown away, and it
was caught only because the question "does the real profile agree?" was asked before
publishing rather than after.

**[O15]** now carries a scope note, **[O27]** records the profile measurement, and the README
cites the profile result rather than the scratch one.
