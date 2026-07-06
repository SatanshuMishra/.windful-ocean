#!/usr/bin/env bash
set -u

input="$(cat)"

block_message="Blocked: the bundled deep-research workflow is disabled (unbounded token cost; caused a 3M-token incident). Use the researcher agent per ~/.claude/rules/common/research.md."

tool_name=""
workflow_name=""
skill_name=""

if command -v jq >/dev/null 2>&1; then
  tool_name="$(printf '%s' "$input" | jq -r '.tool_name // ""' 2>/dev/null)"
  workflow_name="$(printf '%s' "$input" | jq -r '.tool_input.name // ""' 2>/dev/null)"
  skill_name="$(printf '%s' "$input" | jq -r '.tool_input.skill // ""' 2>/dev/null)"
else
  tool_name="$(printf '%s' "$input" | grep -oE '"tool_name"[[:space:]]*:[[:space:]]*"[^"]*"' | sed -E 's/.*:[[:space:]]*"([^"]*)"/\1/' | head -n1)"
  workflow_name="$(printf '%s' "$input" | grep -oE '"name"[[:space:]]*:[[:space:]]*"[^"]*"' | sed -E 's/.*:[[:space:]]*"([^"]*)"/\1/' | head -n1)"
  skill_name="$(printf '%s' "$input" | grep -oE '"skill"[[:space:]]*:[[:space:]]*"[^"]*"' | sed -E 's/.*:[[:space:]]*"([^"]*)"/\1/' | head -n1)"
fi

if { [ "$tool_name" = "Workflow" ] && [ "$workflow_name" = "deep-research" ]; } \
  || { [ "$tool_name" = "Skill" ] && [ "$skill_name" = "deep-research" ]; }; then
  printf '%s\n' "$block_message" >&2
  exit 2
fi

exit 0
