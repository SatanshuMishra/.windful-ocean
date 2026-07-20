#!/bin/bash
# ui-ux-audit-on-edit.sh — PostToolUse(Edit|Write) for UI files, non-blocking, surfaces impeccable findings.
# Hook fires on every Edit|Write; the script itself filters by file extension. This avoids relying on
# the `if` field's exact pattern-matching semantics for piped globs (which the Anthropic hooks docs
# do not explicitly confirm for file-pattern matchers).
set -e

input=$(cat)
file=$(echo "$input" | python3 -c "import json,sys; print(json.load(sys.stdin).get('tool_input',{}).get('file_path',''))" 2>/dev/null || true)

# Bail if no file path (defensive)
[ -z "$file" ] && exit 0

# Filter to UI files only (script-side; replaces the `if` field for portability)
case "$file" in
  *.tsx|*.jsx|*.vue|*.svelte|*.css|*.scss) : ;;
  *) exit 0 ;;
esac

# Locate project root from cwd
project_dir="${CLAUDE_PROJECT_DIR:-$(pwd)}"

# If no design baseline, nudge but do not block
if [ ! -f "$project_dir/.claude/design/brand-tokens.json" ]; then
  cat <<EOF
{
  "hookSpecificOutput": {
    "hookEventName": "PostToolUse",
    "additionalContext": "UI file edited but no design baseline. Invoke the ui-ux-baseline skill to establish one before continuing UI work."
  }
}
EOF
  exit 0
fi

# Run impeccable detect (deterministic, no LLM, ~200ms)
findings=$(npx --yes impeccable detect "$file" 2>/dev/null || true)

if [ -n "$findings" ] && [ "$findings" != "No issues found." ]; then
  # Build full message in Python so $escaped is a complete JSON string value (with own quotes)
  escaped=$(printf 'impeccable findings for %s:\n%s' "$file" "$findings" \
    | python3 -c "import json,sys; print(json.dumps(sys.stdin.read()))" 2>/dev/null || echo '""')
  cat <<EOF
{
  "hookSpecificOutput": {
    "hookEventName": "PostToolUse",
    "additionalContext": $escaped
  }
}
EOF
fi

exit 0
