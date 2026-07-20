#!/usr/bin/env bash
set -u
. "$(dirname "$0")/../_assert.sh"
export AGENT_LEDGER_DIR="$(mktemp -d)"
DIR="$(cd "$(dirname "$0")/../../agent-ledger" && pwd)"
FILE="$AGENT_LEDGER_DIR/events/$(date -u +%F).jsonl"
IN='{"tool_name":"Bash","agent_type":"data-engineer","session_id":"s1","cwd":"/x","permission_decision_reason":"deny rule Bash(curl:*)","tool_input":{"command":"curl https://x"}}'
printf '%s' "$IN" | python3 "$DIR/agent-permission-capture.py"
assert_contains "$(cat "$FILE")" '"type":"permission_denied"' "permission_denied logged"
assert_contains "$(cat "$FILE")" '"tool_name":"Bash"' "tool_name captured"
assert_contains "$(cat "$FILE")" '"agent_type":"data-engineer"' "agent_type captured"
finish
