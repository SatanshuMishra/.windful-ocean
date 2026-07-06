#!/usr/bin/env bash
set -u
HERE="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
. "$HERE/_assert.sh"
HOOK="$HERE/../ledger-precompact-checkpoint.sh"

TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
L="$TMP/proj/ledger"; mkdir -p "$L/threads"
printf '# p\n' > "$L/PROJECT.md"
TP="$L/sess.jsonl"
cat > "$L/threads/cur.md" <<'EOF'
---
thread: cur
status: active
updated: 2026-06-20
---
## Status
working
EOF

printf '{"session_id":"S1","cwd":"/nope","transcript_path":"%s","trigger":"auto"}' "$TP" | bash "$HOOK"
SENT="$L/.compact-sentinel-S1.json"
assert_file_exists "$SENT" "sentinel written"
assert_contains "$(jq -r '.thread_slug' "$SENT")" "cur" "sentinel captures active thread"
assert_contains "$(jq -r '.trigger' "$SENT")" "auto" "sentinel captures trigger"
assert_contains "$(jq -r '.session_id' "$SENT")" "S1" "sentinel captures session id"
assert_contains "$(jq -r '.transcript_path' "$SENT")" "$TP" "sentinel captures transcript path"

L2="$TMP/proj2/ledger"; mkdir -p "$L2/threads"
printf '# p\n' > "$L2/PROJECT.md"
TP2="$L2/sess2.jsonl"
cat > "$L2/threads/paused.md" <<'EOF'
---
thread: paused
status: paused
updated: 2026-06-20
---
## Status
on hold
EOF

printf '{"session_id":"S2","cwd":"/nope","transcript_path":"%s","trigger":"manual"}' "$TP2" | bash "$HOOK"
SENT2="$L2/.compact-sentinel-S2.json"
assert_file_exists "$SENT2" "sentinel written for no-active-thread case"
assert_contains "$(jq -r '.thread_slug' "$SENT2")" "-" "sentinel defaults thread_slug to dash when no active thread"

G="$TMP/guard"; mkdir -p "$G"

printf '' | bash "$HOOK"; rc=$?
assert_empty "$([ "$rc" -ne 0 ] && echo "$rc")" "ok-empty-stdin-exit-zero"
assert_empty "$(find "$G" -name '.compact-sentinel-*.json' 2>/dev/null)" "ok-empty-stdin-no-sentinel"

printf 'not json at all }{' | bash "$HOOK"; rc=$?
assert_empty "$([ "$rc" -ne 0 ] && echo "$rc")" "ok-garbage-json-exit-zero"
assert_empty "$(find "$G" -name '.compact-sentinel-*.json' 2>/dev/null)" "ok-garbage-json-no-sentinel"

NOLEDGER="$TMP/noledger"; mkdir -p "$NOLEDGER"
printf '{"session_id":"S3","cwd":"%s","transcript_path":"%s/x.jsonl","trigger":"auto"}' "$NOLEDGER" "$NOLEDGER" | bash "$HOOK"; rc=$?
assert_empty "$([ "$rc" -ne 0 ] && echo "$rc")" "ok-no-ledger-exit-zero"
assert_empty "$(find "$NOLEDGER" -name '.compact-sentinel-*.json' 2>/dev/null)" "ok-no-ledger-no-sentinel"

finish
