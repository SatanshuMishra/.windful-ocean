#!/bin/bash
# dep-audit.sh — SessionStart, non-blocking, surfaces high/critical vulns.
set -e

project_dir="${CLAUDE_PROJECT_DIR:-$(pwd)}"

if [ ! -f "$project_dir/package.json" ]; then
  exit 0
fi

cd "$project_dir"
audit=$(npm audit --audit-level=high --json 2>/dev/null || true)

if [ -z "$audit" ]; then
  exit 0
fi

# Extract count of high/critical
summary=$(echo "$audit" | python3 -c "
import json, sys
try:
    data = json.load(sys.stdin)
    metadata = data.get('metadata', {})
    vulns = metadata.get('vulnerabilities', {})
    high = vulns.get('high', 0)
    crit = vulns.get('critical', 0)
    if high + crit == 0:
        print('')
    else:
        print(f'{crit} critical, {high} high npm audit findings. Run \`npm audit\` for details.')
except Exception:
    print('')
" 2>/dev/null)

if [ -n "$summary" ]; then
  escaped=$(echo "$summary" | python3 -c "import json,sys; print(json.dumps(sys.stdin.read()))" || true)
  cat <<EOF
{
  "hookSpecificOutput": {
    "hookEventName": "SessionStart",
    "additionalContext": $escaped
  }
}
EOF
fi

exit 0
