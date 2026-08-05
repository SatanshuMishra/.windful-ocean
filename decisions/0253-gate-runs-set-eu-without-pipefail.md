---
Status: accepted
Date: 2026-08-05T23:24:38.292Z
Thread-Id: 01KZ98CT0FT1SYQRH4D7TXH0Z5
---

# 0253. The gate runs set -eu deliberately WITHOUT pipefail

## Context

The c3 fail-closed harness adds set -eu. Adding pipefail alongside it looks like the obvious completion of the idiom and a reviewer will read its absence as an oversight. It is not. Every matcher is printf '%s' "$cmd" | grep -Eq RE. grep -q exits the instant it matches, closing the pipe, so for a command larger than the pipe buffer printf dies of SIGPIPE with status 141. Under pipefail the pipeline status is the rightmost NON-ZERO status, which is printf's 141 even though grep matched, so a genuine match would read as a matcher error. Because c3 escalates an unevaluable matcher to ask, that turns a deny into an ask on large inputs - a loosening, and exactly the kind of size-dependent differential this redesign exists to remove.

## Options

- set -euo pipefail, the conventional idiom, accepting that a large matched command downgrades deny to ask
- set -eu without pipefail, taking the pipeline status from the last command so grep's own exit code survives as the tri-state signal
- Keep pipefail and rewrite every matcher to avoid pipes, e.g. grep against a here-string

## Outcome

Chose set -eu without pipefail. The pipeline status is then grep's own, which match_status reads as a tri-state: 0 match, 1 no match, >1 matcher error escalating to ask. Verified with 400KB commands that the old and new gates return identical deny/ask verdicts. Do NOT add pipefail to this file without first rewriting every matcher off pipes; adding it alone reintroduces a silent loosening on large commands.
