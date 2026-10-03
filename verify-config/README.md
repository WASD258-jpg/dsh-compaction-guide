**English** | [中文](README.zh.md)

# Verification — configuration blocks against a real host

Backs [O19]–[O23], [O26] and the guidance in [`../config/README.md`](../config/README.md).

## Why this exists

A configuration table is a **recommendation the user must execute**. If a field
name is wrong or two fields conflict, the user pays for it at startup — either a
hard failure or, worse, a silently ignored setting. So every block recommended in
[`../config/`](../config/README.md) is constructed against a real `0.2.0-rc.2`
engine before being published.

Verification has **three** parts, and the later ones matter more:

1. **Correctness** — does the configuration load? (`schema-test2.mjs`)
2. **Residual risk** — what does it cost, and *when* does it fail? (`risk-test.mjs`)
3. **Reachability** — can a plugin actually obtain and call the service it needs?
   (`pathb-final.mjs`)

Loading successfully is a low bar. A setting can load, cost real money, and still
not fix the problem. All three parts are reported below.

## Files

| File | Purpose | Status |
|---|---|---|
| `schema-test2.mjs` | Correctness, through the real construction path | **conclusive** |
| `risk-test.mjs` | Residual risks [O22] | **conclusive** |
| `pathb-final.mjs` | Service reachability and callability [O26] | **conclusive** |
| `depchain-test.mjs` | Diagnoses why the earlier reachability attempts failed | supporting |
| `fidelity-test.mjs` | Diagnoses the harness itself | supporting |
| `schema-test.mjs` | First correctness attempt — **insufficient**, kept as evidence [O19] | archival |
| `archive-pruner-probe/` | Five failed reachability attempts — see below | archival |

### `archive-pruner-probe/` — why five attempts failed

The reachability question ("can a plugin call `pruneSession()`?") took **five**
attempts, and the first four all produced the **wrong answer** — that the service
was unreachable. They are kept because the failure mode is instructive:

| Attempt | What was wrong |
|---|---|
| `pruner-service.mjs` | Passed the module namespace object instead of the class |
| `pruner-service2.mjs` | Mounted the class, but a bare `Context` lacks the dependency chain — the service never registered |
| `pruner-service3.mjs` | Added `tokenMeter`, still not the full chain |
| `isolation-test.mjs` | Reported "unreachable" from an unregistered service — a **misleading** conclusion |
| `realm-test.mjs` | Reproduced an isolate realm, but the harness was still incomplete |

**The root cause of all four**: `TokenMeter.inject = ['sessionProjections']`, so
the chain is `session → sessionProjections → tokenMeter → pruner`. A bare
`Context` registers nothing, and `ctx.get()` returns `undefined` — which looks
exactly like "the service is not available to plugins."

**The correction** is `depchain-test.mjs`: mount the full chain, and the service
appears. `pathb-final.mjs` then confirms the call works.

> **The lesson, recorded because it recurred three times in this study:** a test
> harness that is not faithful reports the *harness's* limitations as the
> *system's*. Enter through the real path — or at least verify the harness
> registers what you are querying.

## Results

**`schema-test.mjs`** — the first attempt — **was insufficient and is kept as a
record of why**. It called `BasicCompactionEngine.Config(config)`, which runs only
the schemastery layer:

| Case | `Config()` verdict | Correct? |
|---|---|---|
| `thresoldRatio: 0.5` (typo) | accepted | ❌ |
| `retainRatio` + `retainTokens` together | accepted | ❌ |
| `retainRatio ≥ thresholdRatio` | accepted | ❌ |

Three malformed inputs passed. **Schema validation is not the gate** [O19]; the
cross-field checks live in `resolveConfig()`, which runs at **construction**.

**`schema-test2.mjs`** — instantiates the engine through the real path.

*Recommended blocks — all construct* [O20]:

| Block | Result |
|---|---|
| Full recommendation | PASS |
| Recommendation + independent summarization pair | PASS |
| Summarization pair alone | PASS |
| Threshold-only change | PASS |
| Headroom-only change | PASS |

*Malformed blocks — all rejected, 7/7* [O21]:

| Input | Diagnostic |
|---|---|
| `thresoldRatio` | `unknown key "thresoldRatio"` |
| `retainRatio` + `retainTokens` | `must be mutually exclusive` |
| `retainRatio 0.5` with `thresholdRatio 0.3` | `retainRatio (0.5) must be less than the resolved thresholdRatio (0.3)` |
| provider without model | `must be set together as an empty or non-empty pair` |
| model without provider | `must be set together as an empty or non-empty pair` |
| `headroomTokens: -1` | `must be a non-negative integer` |
| `maxTokens: 0` | `must be a positive integer` |

Every rejection names the offending field. **No malformed block fails silently.**

## Residual risk — `risk-test.mjs`

Correctness is necessary but not sufficient. This script measures what the
recommendations *cost* and *when* they fail [O22].

### A mis-typed summarization target fails at runtime, not at load

| Input | Constructs? |
|---|---|
| `summarizationProvider: 'nonexistent-provider'` | **yes** |
| `summarizationModel: 'no-such-model-xyz'` | **yes** |

The constructor validates only that the pair is set *together*; it does not
resolve either name [O22a]. **A typo is therefore indistinguishable from a working
configuration until a session first reaches the compaction threshold** — which may
be hours later, and which the user experiences as *the session breaking* rather
than *a config typo*. This is the highest-severity risk in the recommendation set.

### Other measured costs

| Risk | Measurement |
|---|---|
| Lowering `thresholdRatio` 0.8 → 0.5 | Trigger moves 678,464 → 500,000 tokens, i.e. **26% earlier**; every compaction is a full model call, so **more calls at real token cost** |
| Raising `maxOverflowRetries` 1 → 3 | **Inert** while Mechanism A is unfixed — the `agent/request-error` path is never reached [S4][O6] |
| Halving `maxTokens` to 32,768 | Introduces a truncation failure mode; observed summary sizes in the analysed corpus are max **4,963** tokens, median **4,312** [O23] — comfortable, but that is one corpus, not a bound |
| The benefit itself | **Inferred.** [O8] is an observational comparison, not a trial of these settings on a failing session |

## Reproduce

```sh
mkdir verify-config && cd verify-config
echo '{"name":"verify-config","private":true,"version":"1.0.0","type":"module"}' > package.json
pnpm add @deepseek-ai/dsh-compaction-basic@0.2.0-rc.2 @deepseek-ai/cordis@4.0.4
cp <this-dir>/*.mjs .
node schema-test.mjs    # the incomplete check — kept as evidence
node schema-test2.mjs   # correctness, through the real path
node risk-test.mjs      # residual risk
```

## Where the configuration actually goes

Verification also established that **a profile-level patch cannot configure
compaction at all** [O17][O18]:

```
dsh: [<patch>] patch: entry "compaction" not found
```

The rows live inside a `cordis:group` in an **agent preset**. See
[`../config/README.md` §1](../config/README.md) for the correct location.

## Scope

Measured against `0.2.0-rc.2`. Behaviour on `0.2.1-alpha.1` was **not** measured.
The engine's constructor path is stable across the two revisions as far as the
cited source shows, but that is an inference, not a measurement.
