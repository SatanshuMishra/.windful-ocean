#!/usr/bin/env bash
set -u

HERE="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
. "$HERE/_assert.sh"
. "$HERE/../lib/ledger-common.sh"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

mkdir -p "$TMP/repo/.claude/ledger/threads"
printf '# x\n' > "$TMP/repo/.claude/ledger/PROJECT.md"
mkdir -p "$TMP/proj/ledger/threads"
printf '# y\n' > "$TMP/proj/ledger/PROJECT.md"
mkdir -p "$TMP/produp/ledger"
printf '# z\n' > "$TMP/produp/ledger/PROJECT.md"
T="$TMP/proj/ledger/threads/demo.md"
cat > "$T" <<'EOF'
---
thread: demo
status: paused
updated: 2026-01-02
next_step: do the next thing
---

## Status
work is half done

## Next Step
do the next thing
EOF

loc1="$(ledger_locate "$TMP/repo" "")"
assert_contains "$loc1" "$TMP/repo/.claude/ledger" "repo-local ledger wins"

loc2="$(ledger_locate "$TMP/none" "$TMP/proj/ledger/sess.jsonl")"
assert_contains "$loc2" "$TMP/proj/ledger" "global fallback via transcript dir"

T_PROD="$TMP/produp/sess.jsonl"
loc3="$(ledger_locate "$TMP/none" "$T_PROD")"
assert_contains "$loc3" "$TMP/produp/ledger" "production layout transcript sibling of ledger dir"

if ledger_locate "$TMP/none" "$TMP/none/x.jsonl" >/dev/null 2>&1; then
  printf 'FAIL - missing ledger should return non-zero\n'; ASSERT_FAILS=$((ASSERT_FAILS+1))
else
  printf 'ok   - missing ledger returns non-zero\n'
fi

assert_contains "$(ledger_field "$T" status)" "paused" "field status"
assert_contains "$(ledger_field "$T" thread)" "demo" "field thread"
assert_contains "$(ledger_field "$T" next_step)" "do the next thing" "field next_step"
assert_empty "$(ledger_field "$T" nonesuch)" "missing field empty"
assert_contains "$(ledger_section_line "$T" '## Status')" "work is half done" "section line"

finish
