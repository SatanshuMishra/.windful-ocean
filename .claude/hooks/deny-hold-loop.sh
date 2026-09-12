#!/usr/bin/env bash
set -uo pipefail

input="$(cat)"

verdict="$(printf '%s' "$input" | python3 -c '
import json, re, sys
try:
    d = json.load(sys.stdin)
except Exception:
    print("allow"); raise SystemExit(0)
cmd = (d.get("tool_input") or {}).get("command", "") or ""
has_sleep = re.search(r"\bsleep\b", cmd) is not None
has_loop = re.search(r"\b(while|until|for)\b", cmd) is not None
print("deny" if (has_sleep and has_loop) else "allow")
' 2>/dev/null || echo allow)"

if [ "$verdict" = "deny" ]; then
  printf '%s\n' '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"Hold loops are denied. A subagent result is delivered to you automatically when it completes, and arrives whether you are idle or not. End your turn instead of holding it open."}}'
fi
exit 0
