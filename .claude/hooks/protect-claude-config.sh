#!/usr/bin/env bash
input="$(cat)"
case "$input" in
  *'.claude'*) : ;;
  *) exit 0 ;;
esac

file_path="$(printf '%s' "$input" | python3 -c 'import sys, json
try:
    d = json.load(sys.stdin)
except Exception:
    sys.exit(0)
sys.stdout.write((d.get("tool_input") or {}).get("file_path", "") or "")' 2>/dev/null || true)"
[ -z "$file_path" ] && exit 0

case "$file_path" in
  "$HOME/.claude/settings.json" | \
  "$HOME/.claude/settings.local.json" | \
  "$HOME/.claude/CLAUDE.md" | \
  "$HOME/.claude/keybindings.json" | \
  "$HOME/.claude/hooks/"* | \
  "$HOME/.claude/rules/"*) : ;;
  *) exit 0 ;;
esac

esc="$(FP="$file_path" python3 -c 'import os, json, sys; sys.stdout.write(json.dumps("Modifying Claude Code guardrail file: " + os.environ["FP"] + " - confirm this change is intended."))' 2>/dev/null || printf '%s' '"Modifying a Claude Code guardrail file - confirm this change is intended."')"
printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"ask","permissionDecisionReason":%s}}\n' "$esc"
exit 0
