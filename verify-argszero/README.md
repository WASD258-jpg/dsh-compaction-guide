# Verification — `@argszero/cordis-plugin-length-stop-overflow` on 0.2.0-rc.2

This directory contains the measurement behind [O15] and [O16]. It exists because
the plugin's `peerDependencies` range ends at `<0.2.0`, making 0.2.0-rc.2 an
**unstated** path — and an unstated path should be measured, not assumed.

## What was measured

| Script | Purpose |
|---|---|
| `verify.mjs` | Resolves a real `0.2.0-rc.2` host and checks that the plugin installs, imports, and mounts |
| `behavior2.mjs` | Drives the **real classifier entry point** against one positive and eight negative cases |

## Setup

The scripts expect a sibling scratch package that has resolved the host
dependencies. Reproduce with:

```sh
mkdir verify-argszero && cd verify-argszero
echo '{"name":"verify","private":true,"version":"1.0.0"}' > package.json
pnpm add @deepseek-ai/dsh-llm@0.2.0-rc.2
pnpm add @deepseek-ai/cordis@4.0.4
pnpm add @argszero/cordis-plugin-length-stop-overflow@0.3.0
node verify.mjs
node behavior2.mjs
```

## Results

**`verify.mjs`** — all checks pass:

| Check | Result |
|---|---|
| `pnpm add` under a `0.2.0-rc.2` host | installs; the peer mismatch does **not** block |
| Five value-imported codes exist in `0.2.0-rc.2` | all resolve |
| `llm/stream` waterfall present | yes |
| Module import | 26 named exports |
| `ctx.plugin(plugin)` mount on a real `Context` | no service conflict, no inject error |

**`behavior2.mjs`** — the positive case is reclassified; 7 of 8 negatives pass
through. The exception is documented in [PRIOR-ART §5.2](../PRIOR-ART.md).

## Methodological warning

An earlier version of this test called the low-level `oversizeFailure()` helper
**directly** and concluded that all eight negatives were reclassified — including
rate limits and aborts. **That conclusion was wrong.** The guards live in
`classifyOversizeFailure()`, which the direct call bypassed.

The lesson generalises: **testing a guard means entering through the gate, not
around it.** The incorrect result was nearly published as a finding, and the
correction is recorded in [PRIOR-ART §7](../PRIOR-ART.md).

## Scope

This establishes behaviour for **one plugin on one host version**. It does not
generalise to the other nineteen repositories assessed in
[PRIOR-ART.md](../PRIOR-ART.md), and it does not cover `0.2.1-alpha.1`.
