#!/usr/bin/env bash
set -u
. "$(dirname "$0")/../_assert.sh"
export AGENT_LEDGER_DIR="$(mktemp -d)"
DIR="$(cd "$(dirname "$0")/../../agent-ledger" && pwd)"
TR="$AGENT_LEDGER_DIR/tr.jsonl"
cat > "$TR" <<'EOF'
{"message":{"content":[{"type":"tool_use","name":"Read","input":{"file_path":"/a.txt"}}],"usage":{"input_tokens":10,"output_tokens":5}}}
{"message":{"content":[{"type":"tool_use","name":"Read","input":{"file_path":"/a.txt"}}]}}
{"message":{"content":[{"type":"text","text":"CAPABILITY-BLOCKED: needed=Write task=create migration file"}]}}
EOF
FILE="$AGENT_LEDGER_DIR/events/$(date -u +%F).jsonl"
printf '%s' "{\"transcript_path\":\"$TR\",\"agent_type\":\"data-engineer\",\"session_id\":\"s1\",\"cwd\":\"/x\"}" | node "$DIR/agent-run-analyzer.mjs"
assert_contains "$(cat "$FILE")" '"type":"agent_run"' "agent_run logged"
assert_contains "$(cat "$FILE")" '"duplicate_tool_calls":1' "exact-duplicate Read counted"
assert_contains "$(cat "$FILE")" '"redundant_reads":1' "redundant read counted"
assert_contains "$(cat "$FILE")" '"tokens":15' "tokens summed from usage"
assert_contains "$(cat "$FILE")" '"type":"capability_blocked"' "capability_blocked logged"
assert_contains "$(cat "$FILE")" '"needed":"Write"' "needed capability parsed"
finish
