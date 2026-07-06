#!/usr/bin/env bash
set -u
. "$(dirname "$0")/../_assert.sh"
export AGENT_LEDGER_DIR="$(mktemp -d)"
FAKE_HOME="$(mktemp -d)"; mkdir -p "$FAKE_HOME/.claude/agents"
cat > "$FAKE_HOME/.claude/agents/debugger.md" <<'EOF'
---
name: debugger
description: Debugging specialist for bugs, test failures, and unexpected behavior.
tools: Read, Edit, Bash
---
body
EOF
DIR="$(cd "$(dirname "$0")/../../agent-ledger" && pwd)"
HOME="$FAKE_HOME" python3 "$DIR/roster-index-gen.py"
OUT="$AGENT_LEDGER_DIR/roster-index.json"
assert_file_exists "$OUT" "roster-index.json created"
assert_contains "$(cat "$OUT")" '"name": "debugger"' "roster contains debugger"
assert_contains "$(cat "$OUT")" 'debugging' "scope_keywords extracted from description"
finish
