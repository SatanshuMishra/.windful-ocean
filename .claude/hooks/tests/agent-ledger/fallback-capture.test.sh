#!/usr/bin/env bash
set -u
. "$(dirname "$0")/../_assert.sh"
export AGENT_LEDGER_DIR="$(mktemp -d)"
DIR="$(cd "$(dirname "$0")/../../agent-ledger" && pwd)"
cat > "$AGENT_LEDGER_DIR/roster-index.json" <<'EOF'
[{"name":"debugger","description":"d","tools":["Read"],"scope_keywords":["debugging","failures"]}]
EOF
FILE="$AGENT_LEDGER_DIR/events/$(date -u +%F).jsonl"

IN_GP='{"tool_name":"Agent","session_id":"s1","cwd":"/x/proj","tool_input":{"subagent_type":"general-purpose","description":"FALLBACK-RATIONALE: none fit","prompt":"investigate test failures and debugging"}}'
OUT="$(printf '%s' "$IN_GP" | python3 "$DIR/agent-fallback-capture.py")"
assert_contains "$(cat "$FILE")" '"type":"fallback_used"' "fallback_used logged"
assert_contains "$(cat "$FILE")" '"rationale":"none fit"' "rationale parsed"
assert_contains "$OUT" 'additionalContext' "nudge emitted"
assert_contains "$OUT" 'debugger' "nudge names the matching specialist"

IN_SPEC='{"tool_name":"Agent","session_id":"s2","cwd":"/x","tool_input":{"subagent_type":"implementer","description":"d","prompt":"p"}}'
OUT2="$(printf '%s' "$IN_SPEC" | python3 "$DIR/agent-fallback-capture.py")"
assert_empty "$OUT2" "specialist spawn produces no nudge"
assert_contains "$(grep -c fallback_used "$FILE")" "1" "specialist spawn logged no event"
finish
