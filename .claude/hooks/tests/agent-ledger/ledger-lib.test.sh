#!/usr/bin/env bash
set -u
. "$(dirname "$0")/../_assert.sh"
export AGENT_LEDGER_DIR="$(mktemp -d)"
DIR="$(cd "$(dirname "$0")/../../agent-ledger" && pwd)"

python3 -c "import sys; sys.path.insert(0,'$DIR'); import _ledger as L; L.append_event({'type':'t','v':1})"
DAY="$(date -u +%F)"
FILE="$AGENT_LEDGER_DIR/events/$DAY.jsonl"
assert_file_exists "$FILE" "python append created daily events file"
assert_contains "$(cat "$FILE")" '"schema_version":1' "python event has schema_version"

node --input-type=module -e "import {appendEvent} from '$DIR/_ledger.mjs'; appendEvent({type:'t2'})"
assert_contains "$(cat "$FILE")" '"type":"t2"' "node append wrote to same daily file"
finish
