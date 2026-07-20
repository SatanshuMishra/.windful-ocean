#!/usr/bin/env bash
set -u
HERE="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
. "$HERE/_assert.sh"
HOOK="$HERE/../ledger-resume-roster.sh"

TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
L="$TMP/proj/ledger"; mkdir -p "$L/threads"
printf '# p\n' > "$L/PROJECT.md"
cat > "$L/threads/alpha.md" <<'EOF'
---
thread: alpha
status: paused
updated: 2026-02-01
next_step: finish alpha
---
## Status
midway
EOF
cat > "$L/threads/beta.md" <<'EOF'
---
thread: beta
status: done
updated: 2026-02-01
next_step: nothing
---
## Status
closed
EOF
TP="$L/sess.jsonl"

mkjson() { printf '{"prompt":"%s","cwd":"/nope","transcript_path":"%s"}' "$1" "$TP"; }

out_resume="$(mkjson 'continue' | bash "$HOOK")"
assert_contains "$out_resume" "alpha" "resume intent lists paused thread"
case "$out_resume" in *beta*) printf 'FAIL - done thread must not appear\n'; ASSERT_FAILS=$((ASSERT_FAILS+1));; *) printf 'ok   - done thread excluded\n';; esac
assert_contains "$out_resume" "UserPromptSubmit" "emits correct hookEventName"

out_noise="$(mkjson 'please refactor the parser' | bash "$HOOK")"
assert_empty "$out_noise" "non-resume prompt is silent"

out_noledger="$(printf '{"prompt":"resume","cwd":"/nope","transcript_path":"/nope/x.jsonl"}' | bash "$HOOK")"
assert_empty "$out_noledger" "no ledger is silent"

finish
