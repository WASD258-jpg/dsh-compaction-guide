#!/usr/bin/env bash
# Local preflight for the CI "Every .mjs executes" job.
# Mirrors the workflow body so the logic can be run before pushing.

set -u
mkdir -p /tmp/empty-sessions

fail=0
run() {
  local f="$1"; shift
  local out code
  out=$(DSH_HOME=/tmp/nonexistent-dsh-home node "$f" "$@" 2>&1) && code=0 || code=$?
  if [ "$code" -eq 0 ]; then
    echo "ok    $f $*"
  elif echo "$out" | grep -q '^Usage:'; then
    echo "usage $f (needs an argument; correct behaviour)"
  else
    echo "FAIL  $f (exit $code)"
    echo "$out" | head -5 | sed 's/^/        /'
    fail=1
  fi
}

for f in $(find verify-config verify-argszero -name '*.mjs' | sort) \
         verify-feasibility/assess.mjs; do
  run "$f"
done

# Scripts that accept an optional path; give them the repo root.
run verify-refs/lang-audit.mjs .
run verify-refs/check-language-pairs.mjs .
run verify-refs/check-links.mjs .

mkdir -p /tmp/empty-sessions
run tools/doctor.mjs /tmp/empty-sessions
run tools/privacy-check.mjs .

for f in verify-refs/check-refs.mjs \
         verify-feasibility/feasibility.mjs \
         verify-feasibility/intervention-points.mjs; do
  run "$f"
done

echo ""
if [ "$fail" -eq 0 ]; then
  echo "PREFLIGHT PASS — the CI job body is correct"
else
  echo "PREFLIGHT FAIL"
fi
exit $fail
