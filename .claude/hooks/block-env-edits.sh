#!/usr/bin/env bash
# block-env-edits.sh — PreToolUse hook that blocks Edit/Write on .env* files.
# Receives JSON: { tool_input: { file_path: "..." }, ... }
# Exit 1 to block the tool call. Block message goes to stderr.

set -u

input="$(cat)"
file_path="$(printf '%s' "$input" | python3 -c 'import sys, json; d=json.load(sys.stdin); print((d.get("tool_input") or {}).get("file_path",""))' 2>/dev/null || true)"

if [ -z "$file_path" ]; then
  exit 0
fi

# Match `.env` or `.env.<anything>` as the basename.
basename_only="$(basename "$file_path")"
case "$basename_only" in
  .env|.env.*)
    cat >&2 <<EOF
[hook:block-env-edits] BLOCKED: $basename_only
.env files contain secrets and must be edited by the human only.
See ~/.claude/rules/common/security.md.
If a project legitimately requires Claude to update .env.example automatically,
override per-project in that project's .claude/settings.local.json.
EOF
    exit 1
    ;;
esac

exit 0
