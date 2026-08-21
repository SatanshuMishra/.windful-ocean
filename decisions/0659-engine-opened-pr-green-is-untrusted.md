---
Status: accepted
Date: 2026-08-21T05:09:04.538Z
Thread-Id: 01KZTEFMENXBW30ZE633YNFJHE
---

# 0659. An engine-opened pull request's receipts green is read from the run, not from the label

## Context

The receipts enforcer scans pull-request text for the honesty-ladder downgrade tags and short-circuits all eight re-run gates when it finds one, rendering PASS in roughly 129ms. A billed child writes that text itself, so its own rationale can carry a token that disables the gate on its own pull request. The enforcer is not vendored in this repository - it runs in CI from shaheershoaib/receipts/enforcer - so the guard cannot be fixed from here, and c45's criterion requires every pull request the engine opens to be green including receipts.

## Options

- Close the token-injection hole first: fork or pin the enforcer, make the tag guard case-insensitive and anchored, and re-run - blocks the live run behind an external dependency this repository does not own
- Accept in writing that an engine-opened green is untrusted, and verify each pull request by reading its receipts run rather than its verdict label
- Treat the receipts check as out of scope for c45 and pass the lane on the other checks - abandons the criterion as written

## Outcome

Accepted in writing. The live run proceeds. For every pull request the engine opens, the receipts verdict alone is not evidence: the run's own duration and gate output are read, and a PASS returned in seconds on a source-touching diff is recorded as a downgrade pass rather than a cleared gate. The guard fix stays filed against the enforcer, not against this repository, and does not gate c45.
