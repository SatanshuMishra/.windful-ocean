#!/usr/bin/env bash
set -u
. "$(dirname "$0")/../_assert.sh"
DIR="$(cd "$(dirname "$0")/../../agent-ledger" && pwd)"
assert_contains "$(node "$DIR/agent-roster-gate.mjs" '{"recurrenceCount":2,"distinctReasonToChange":true,"clearerRouting":true}')" "reject" "below Rule-of-Three -> reject"
assert_contains "$(node "$DIR/agent-roster-gate.mjs" '{"recurrenceCount":5,"distinctReasonToChange":true,"clearerRouting":true}')" "create" "distinct + clearer -> create"
assert_contains "$(node "$DIR/agent-roster-gate.mjs" '{"recurrenceCount":5,"distinctReasonToChange":false,"clearerRouting":true}')" "extend" "not distinct -> extend"
finish
