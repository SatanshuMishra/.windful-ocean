#!/usr/bin/env bash
set -u
. "$(dirname "$0")/../_assert.sh"
export AGENT_LEDGER_DIR="$(mktemp -d)"
DIR="$(cd "$(dirname "$0")/../../agent-ledger" && pwd)"
mkdir -p "$AGENT_LEDGER_DIR/events"
E="$AGENT_LEDGER_DIR/events/2026-07-01.jsonl"
cat > "$E" <<'EOF'
{"type":"fallback_used","session_id":"a","description":"schema migration","prompt_excerpt":"schema"}
{"type":"fallback_used","session_id":"b","description":"schema migration","prompt_excerpt":"schema"}
{"type":"fallback_used","session_id":"c","description":"schema migration","prompt_excerpt":"schema"}
{"type":"fallback_used","session_id":"a","description":"css layout","prompt_excerpt":"frontend css"}
{"type":"agent_run","agent_type":"debugger","tool_calls_total":10,"duplicate_tool_calls":2,"redundant_reads":1,"tokens":100}
EOF
node "$DIR/agent-ledger-index.mjs"
G="$AGENT_LEDGER_DIR/index/gaps.json"
assert_file_exists "$G" "gaps.json written"
assert_contains "$(jq -r '[.[]|select(.cluster_key=="fallback:schema")][0].status' "$G")" "actionable" "3 distinct sessions -> actionable"
assert_contains "$(jq -r '[.[]|select(.cluster_key=="fallback:frontend")][0].status // [.[]|select(.cluster_key=="fallback:css")][0].status' "$G")" "open" "single-session cluster stays open"
assert_file_exists "$AGENT_LEDGER_DIR/index/agent-baselines.json" "baselines written"
assert_contains "$(jq -r '.debugger.runs' "$AGENT_LEDGER_DIR/index/agent-baselines.json")" "1" "debugger baseline recorded"
finish
