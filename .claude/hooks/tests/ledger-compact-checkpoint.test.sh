#!/usr/bin/env bash
set -u
HERE="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
. "$HERE/_assert.sh"
HOOK="$HERE/../ledger-compact-checkpoint.sh"

TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
L="$TMP/proj/ledger"; mkdir -p "$L/threads"
printf '# p\n' > "$L/PROJECT.md"
TP="$L/sess.jsonl"
SENT="$L/.compact-sentinel-S1.json"
printf '{"session_id":"S1","thread_slug":"cur","transcript_path":"%s","trigger":"auto","ts":"2026-06-20T00:00:00Z"}' "$TP" > "$SENT"

out="$(printf '{"source":"compact","session_id":"S1","cwd":"/nope","transcript_path":"%s"}' "$TP" | bash "$HOOK")"
assert_contains "$out" "compacted" "re-injection mentions compaction"
assert_contains "$out" "cur" "re-injection names the thread"
assert_contains "$out" "mid-session checkpoint" "re-injection names the mid-session checkpoint mode"
assert_contains "$out" "SessionStart" "emits SessionStart hookEventName"
assert_file_absent "$SENT" "sentinel deleted after consumption"

out_nostart="$(printf '{"source":"startup","session_id":"S1","cwd":"/nope","transcript_path":"%s"}' "$TP" | bash "$HOOK")"
assert_empty "$out_nostart" "non-compact source is silent"

out_nosent="$(printf '{"source":"compact","session_id":"NOPE","cwd":"/nope","transcript_path":"%s"}' "$TP" | bash "$HOOK")"
assert_empty "$out_nosent" "absent sentinel is silent"

RL="$TMP/reap/ledger"; mkdir -p "$RL"
printf '# r\n' > "$RL/PROJECT.md"
RTP="$RL/sess.jsonl"
STALE_SENT="$RL/.compact-sentinel-STALE.json"
printf '{"session_id":"STALE","thread_slug":"old","transcript_path":"%s","trigger":"auto","ts":"2025-01-01T00:00:00Z"}' "$RTP" > "$STALE_SENT"
touch -t 202501010000 "$STALE_SENT"
out_reap="$(printf '{"source":"compact","session_id":"LIVE","cwd":"/nope","transcript_path":"%s"}' "$RTP" | bash "$HOOK")"
assert_file_absent "$STALE_SENT" "ok-reap stale sentinel reaped after 1440-min expiry"
assert_empty "$out_reap" "ok-reap reap exits cleanly with no output"

ML="$TMP/malformed/ledger"; mkdir -p "$ML"
printf '# m\n' > "$ML/PROJECT.md"
MTP="$ML/sess.jsonl"
MSENT="$ML/.compact-sentinel-M1.json"
printf 'not-json' > "$MSENT"
out_malformed="$(printf '{"source":"compact","session_id":"M1","cwd":"/nope","transcript_path":"%s"}' "$MTP" | bash "$HOOK")"
assert_empty "$out_malformed" "ok-malformed corrupt sentinel injects nothing"
assert_file_absent "$MSENT" "ok-malformed corrupt sentinel deleted"

GL="$TMP/guardchar/ledger"; mkdir -p "$GL"
printf '# g\n' > "$GL/PROJECT.md"
GTP="$GL/sess.jsonl"
GSENT="$GL/.compact-sentinel-evil.id.json"
printf '{"session_id":"evil.id","thread_slug":"cur","transcript_path":"%s","trigger":"auto","ts":"2026-06-20T00:00:00Z"}' "$GTP" > "$GSENT"
out_guard="$(printf '{"source":"compact","session_id":"evil.id","cwd":"/nope","transcript_path":"%s"}' "$GTP" | bash "$HOOK")"
assert_empty "$out_guard" "ok-guard forbidden-char session_id injects nothing (line-12 char guard)"
assert_file_exists "$GSENT" "ok-guard plantable sentinel left intact (guard exits before reaching delete)"

VL="$TMP/defaults/ledger"; mkdir -p "$VL"
printf '# d\n' > "$VL/PROJECT.md"
VTP="$VL/sess.jsonl"
VSENT="$VL/.compact-sentinel-D1.json"
printf '{"session_id":"D1"}' > "$VSENT"
out_defaults="$(printf '{"source":"compact","session_id":"D1","cwd":"/nope","transcript_path":"%s"}' "$VTP" | bash "$HOOK")"
assert_contains "$out_defaults" "SessionStart" "ok-defaults valid sentinel with missing fields still injects"
assert_file_absent "$VSENT" "ok-defaults sentinel consumed after injection"

finish
