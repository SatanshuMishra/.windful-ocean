#!/usr/bin/env bash
set -uo pipefail

input="$(cat)"

verdict="$(printf '%s' "$input" | python3 -c '
import json, re, sys
try:
    d = json.load(sys.stdin)
except Exception:
    print("allow"); raise SystemExit(0)
p = (d.get("tool_input") or {}).get("file_path", "") or ""
print("deny" if re.search(r"/tasks/[^/]*\.output$", p) else "allow")
' 2>/dev/null || echo allow)"

if [ "$verdict" = "deny" ]; then
  printf '%s\n' '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"Task output files are not read directly. A completed task delivers its result to you; re-reading the output file re-pays its full token cost. Wait for the completion notice instead."}}'
fi
exit 0
