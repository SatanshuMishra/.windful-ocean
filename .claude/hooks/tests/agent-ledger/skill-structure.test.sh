#!/usr/bin/env bash
set -u
. "$(dirname "$0")/../_assert.sh"
F="$HOME/.claude/skills/agent-gap-audit/SKILL.md"
assert_file_exists "$F" "SKILL.md exists"
assert_contains "$(cat "$F")" "agent-ledger-index.mjs" "references index rebuild"
assert_contains "$(cat "$F")" "AGENT_LEDGER_SUPPRESS" "sets suppress flag for its own spawns"
assert_contains "$(cat "$F")" "agent-roster-gate.mjs" "references anti-sprawl gate"
assert_contains "$(cat "$F")" "report" "renders via report skill"
assert_contains "$(head -6 "$F")" "name: agent-gap-audit" "has skill frontmatter name"
finish
