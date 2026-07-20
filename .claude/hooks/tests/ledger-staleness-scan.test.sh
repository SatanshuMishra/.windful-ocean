#!/usr/bin/env bash
set -u
HERE="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
. "$HERE/_assert.sh"
HOOK="$HERE/../ledger-staleness-scan.sh"

TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
L="$TMP/proj/ledger"; mkdir -p "$L/threads"
printf '# p\n' > "$L/PROJECT.md"
TP="$L/sess.jsonl"
NOW=1782433491

mkthread() { cat > "$L/threads/$1.md" <<EOF
---
thread: $1
status: $2
updated: $3
---
## Status
x
EOF
}
mkthread zombie active 2026-06-20
mkthread fresh paused 2026-06-19
mkthread oldpause paused 2026-01-01
mkthread freshblock blocked 2026-06-01
mkthread oldblock blocked 2025-12-01

run() { printf '{"source":"%s","cwd":"/nope","transcript_path":"%s"}' "$1" "$TP" | LEDGER_NOW_EPOCH="$NOW" bash "$HOOK"; }

out="$(run startup)"
assert_contains "$out" "zombie" "active thread flagged"
assert_contains "$out" "oldpause" "paused >30d flagged"
assert_contains "$out" "oldblock" "blocked >90d flagged"
case "$out" in *fresh*) :;; esac
case "$out" in *"- fresh"*|*"fresh:"*) printf 'FAIL - fresh paused must not flag\n'; ASSERT_FAILS=$((ASSERT_FAILS+1));; *) printf 'ok   - fresh paused not flagged\n';; esac
case "$out" in *freshblock*) printf 'FAIL - fresh blocked must not flag\n'; ASSERT_FAILS=$((ASSERT_FAILS+1));; *) printf 'ok   - fresh blocked not flagged\n';; esac
assert_contains "$out" "SessionStart" "emits SessionStart hookEventName"

out_compact="$(run compact)"
assert_empty "$out_compact" "compact source is silent (other hook handles it)"

finish
