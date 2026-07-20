#!/usr/bin/env bash
set -u
. "$(dirname "$0")/../_assert.sh"
export AGENT_LEDGER_DIR="$(mktemp -d)"
DIR="$(cd "$(dirname "$0")/../../agent-ledger" && pwd)"
mkdir -p "$AGENT_LEDGER_DIR/index"
echo '[{"gap_id":"gap-abc","cluster_key":"perm:Bash","status":"actionable"}]' > "$AGENT_LEDGER_DIR/index/gaps.json"
node "$DIR/agent-ledger-resolve.mjs" '{"gap_id":"gap-abc","resolution":"modify","agent_refs":["data-engineer"],"change_summary":"added Bash tool"}'
FILE="$AGENT_LEDGER_DIR/events/$(date -u +%F).jsonl"
assert_contains "$(cat "$FILE")" '"type":"agent_modified"' "agent_modified event appended"
assert_contains "$(cat "$FILE")" '"type":"gap_resolved"' "gap_resolved event appended"
assert_contains "$(jq -r '.[0].status' "$AGENT_LEDGER_DIR/index/gaps.json")" "resolved" "gap status flipped"
assert_file_exists "$AGENT_LEDGER_DIR/gaps/gap-abc.md" "gap markdown written"
finish
