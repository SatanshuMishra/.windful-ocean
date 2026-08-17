#!/usr/bin/env bash
set -u
. "$(dirname "$0")/../_assert.sh"
S="$HOME/.claude/settings.json"
assert_contains "$(jq -e '.hooks.PreToolUse[] | select(.matcher=="Agent")' "$S" 2>/dev/null && echo ok)" "ok" "PreToolUse Agent matcher present"
assert_contains "$(jq -r '.hooks.PermissionDenied[0].hooks[0].command' "$S")" "agent-permission-capture.py" "PermissionDenied wired"
assert_contains "$(jq -r '[.hooks.SubagentStop[].hooks[].command] | join(" ")' "$S")" "observer/subagent-observer.mjs" "SubagentStop wired to the observer"
assert_contains "$(jq -r '[.hooks.SubagentStart[]?.hooks[]?.command] | join(" ")' "$S")" "observer/subagent-observer.mjs" "SubagentStart wired to the observer"
assert_contains "$(jq -r '[.hooks[]?[]?.hooks[]?.command] | map(select(contains("agent-run-analyzer"))) | length' "$S")" "0" "retired analyzer named by no global registration"
assert_contains "$(jq -r '.hooks.SessionStart[].hooks[].command' "$S")" "roster-index-gen.py" "roster generator wired at SessionStart"
finish
