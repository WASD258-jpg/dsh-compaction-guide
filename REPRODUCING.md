# Reproducing the verification scripts

> Every claim in this repository names the script that produced it. This page
> explains how to actually run them.

## Two kinds of script

| Kind | Needs the upstream checkout? | Needs npm packages? |
|---|---|---|
| **Citation resolution** (`verify-refs/`) | yes | no |
| **Feasibility analysis** (`verify-feasibility/`) | yes | no |
| **Behavioural verification** (`verify-config/`, `verify-argszero/`) | no | yes |
| **Diagnostic** (`tools/doctor.mjs`) | no | no |

Nothing here is needed to *read* the guide — only to check its claims.

---

## 1. Scripts with no prerequisites

`tools/doctor.mjs` and `tools/privacy-check.mjs` run on a stock Node 22+ install.

```sh
# diagnostic against your own sessions
node tools/doctor.mjs "$DSH_HOME/sessions"
node tools/doctor.mjs "$DSH_HOME/sessions" --json
node tools/doctor.mjs "$DSH_HOME/sessions" --merge

# privacy gate — takes a repository root
node tools/privacy-check.mjs .
```

**`doctor.mjs` needs a sessions directory that exists.** With no argument it uses
`$DSH_HOME/sessions` and **exits 2 if that path is absent** — which is what happens
on a machine that has never run the harness. Pass an explicit path, or an empty
directory if you only want to confirm the script runs:

```sh
mkdir -p /tmp/empty-sessions
node tools/doctor.mjs /tmp/empty-sessions
```

---

## 2. Scripts that need the upstream checkout

`verify-refs/check-refs.mjs`, `verify-refs/lang-audit.mjs`,
`verify-feasibility/feasibility.mjs`, and
`verify-feasibility/intervention-points.mjs` read upstream source directly. They
take the checkout path as an argument or from `DSH_SRC`:

```sh
git clone https://github.com/deepseek-ai/deepseek-harness.git /tmp/dsh

node verify-refs/check-refs.mjs /tmp/dsh
DSH_SRC=/tmp/dsh node verify-feasibility/feasibility.mjs
```

**Pin the revision.** The citation line numbers in `REFERENCES.md` were resolved
against `0.2.1-alpha.1` (`5badb150`). On a later `master` the lines will have
moved, and the checker will report which:

```sh
git -C /tmp/dsh checkout 5badb150
```

A resolution failure is not a bug in the checker — it means the citation no longer
matches the revision you checked out. `check-refs.mjs` prints the corrected line
numbers so `REFERENCES.md` can be updated.

---

## 3. Scripts that need npm packages

`verify-config/` and `verify-argszero/` mount real Cordis contexts and construct
real engines, so they need the harness packages installed. This repository
declares them as `devDependencies`:

```sh
pnpm install
```

**Use pnpm, not npm** — and the reason is one of this guide's own findings.

`@argszero/cordis-plugin-length-stop-overflow@0.3.0` declares a peer range of
`>=0.1.3-alpha.2 <0.1.4 || >=0.1.5-alpha.1 <0.2.0`, which **excludes 0.2.x** — the
version it was measured working on [O15]. npm enforces peer ranges strictly and
refuses to install:

```
npm error ERESOLVE unable to resolve dependency tree
npm error peer @deepseek-ai/dsh-llm@">=0.1.3-alpha.2 <0.1.4 || ... <0.2.0"
          from @argszero/cordis-plugin-length-stop-overflow@0.3.0
```

pnpm tolerates the mismatch. The peer range is a **packaging defect, not a
functional barrier** — the plugin was imported and mounted successfully on
`0.2.0-rc.2`, and `verify-argszero/` reproduces that. If you prefer npm:

```sh
npm install --legacy-peer-deps
```

Installed versions are pinned to `0.2.0-rc.2` — the revision the measurements were
taken against. A different host version may change results; that is information,
not noise.

Then:

```sh
node verify-config/schema-test2.mjs       # configuration correctness
node verify-config/risk-test.mjs          # residual risks
node verify-config/pathb-final.mjs        # service reachability
node verify-argszero/verify.mjs           # plugin loading on 0.2.0-rc.2
node verify-argszero/behavior2.mjs        # reclassification behaviour
```

Or via the package scripts:

```sh
pnpm verify:config
pnpm verify:risk
pnpm verify:reachability
pnpm verify:argszero
```

### `verify-argszero/` additionally needs a third-party plugin

`@argszero/cordis-plugin-length-stop-overflow@0.3.0` is declared as an optional
dependency because it is the subject of the measurement, not a dependency of this
guide:

```sh
pnpm install   # installs it if reachable
```

If it cannot be fetched, `verify-argszero/` will fail at import — which is
expected, and does not affect any other script.

---

## 4. Archived scripts

`verify-config/archive-pruner-probe/` contains five **failed** attempts. They are
run deliberately to be wrong: each one reproduces the mistake it is named for.

```sh
node verify-config/archive-pruner-probe/isolation-test.mjs
```

They exit 0 because a script that demonstrates a mistake succeeds at demonstrating
it. Their value is in the header comments and in
[`archive-pruner-probe/README.md`](verify-config/archive-pruner-probe/README.md).

---

## 5. Expected output

If the environment matches what the guide describes, you should see the numbers it
quotes. Two examples, reproducible without any session data of your own:

```sh
$ node verify-config/schema-test2.mjs
  [PASS] full recommendation
  [PASS] recommendation + independent summarizer
  [PASS] summarizer pair only (smallest change)
  [PASS] threshold only
  [PASS] headroom only
  ...
  rejected: 7/7
```

```sh
$ DSH_SRC=/tmp/dsh node verify-feasibility/feasibility.mjs
  ...
  compactIfNeeded runs BEFORE next(): yes
```

The corpus figures — 51 starts, 9 summaries, 42 failures, 239 misclassified 413s
— require session logs. **They will not match**, and should not: they describe one
user's corpus, not a universal rate [EVIDENCE §8.1](EVIDENCE.md). What should match
is the *shape*: a success rate well below 100% and a large `413 →
INVALID_REQUEST` count, if your host has the same defect.

---

## 6. If a script fails

| Symptom | Cause |
|---|---|
| `ERR_MODULE_NOT_FOUND: @deepseek-ai/...` | `pnpm install` not run |
| `not found: <path>/packages` | wrong checkout path passed |
| `[pattern miss]` from `check-refs.mjs` | you checked out a different revision |
| `Usage: node ... <path>` | the script needs the checkout argument |

**A failing script is a finding, not an inconvenience.** Three verification
attempts in this study were wrong the first time because the harness was
unfaithful; the corrected versions are the ones shipped. If something here does
not reproduce, that is worth reporting.
