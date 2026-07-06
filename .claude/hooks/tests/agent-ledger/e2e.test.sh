#!/usr/bin/env bash
set -u
. "$(dirname "$0")/../_assert.sh"
export AGENT_LEDGER_DIR="$(mktemp -d)"
DIR="$(cd "$(dirname "$0")/../../agent-ledger" && pwd)"
echo '[]' > "$AGENT_LEDGER_DIR/roster-index.json"
for s in a b c; do
  printf '%s' "{\"tool_name\":\"Agent\",\"session_id\":\"$s\",\"cwd\":\"/x\",\"tool_input\":{\"subagent_type\":\"general-purpose\",\"description\":\"schema migration work\",\"prompt\":\"schema migration\"}}" | python3 "$DIR/agent-fallback-capture.py" >/dev/null
done
node "$DIR/agent-ledger-index.mjs"
G="$AGENT_LEDGER_DIR/index/gaps.json"
GID="$(jq -r '.[0].gap_id' "$G")"
assert_contains "$(jq -r '.[0].status' "$G")" "actionable" "3-session fallback cluster is actionable"
node "$DIR/agent-ledger-resolve.mjs" "{\"gap_id\":\"$GID\",\"resolution\":\"create\",\"agent_refs\":[\"schema-specialist\"],\"change_summary\":\"new agent\"}"
node "$DIR/agent-ledger-index.mjs"
assert_contains "$(jq -r '.[0].status' "$G")" "resolved" "gap resolved after resolve + rebuild"
finish
