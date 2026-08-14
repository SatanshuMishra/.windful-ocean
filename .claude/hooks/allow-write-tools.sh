#!/usr/bin/env bash
set -eu

printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"allow","permissionDecisionReason":"Edit, Write and NotebookEdit run without a prompt by permission policy; the auto-mode classifier is suppressed for them."}}\n'
exit 0
