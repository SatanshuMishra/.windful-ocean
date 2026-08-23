---
Status: accepted
Date: 2026-08-23T18:38:28.778Z
Thread-Id: 01M0QTN4YG3SWPQ1EMFT85M1K3
---

# 0688. Honest inertness wording downgraded the receipts gate again; the downgrade is accepted, not re-litigated

## Context

Pull request 287 shows a green receipts check that cleared in twelve seconds. The log reads PASS - honest downgrade 'reverted' present - tracked, not claimed as verified. The word reverted, required by the inertness-mutation evidence the testing rules demand, matches a ladder tag and short-circuits all eight re-run gates including G14, the mutation referee. So the green badge is a downgrade pass, not a cleared gate. This is the second confirmed occurrence of a known collision: the pull request honesty rule forces wording that disables the very gates meant to referee it. The body cannot be corrected, because title and body are fixed at creation and every edit path is denied at the gate.

## Options

- Close 287 and reopen with wording that avoids the ladder tag
- Accept the tracked downgrade and proceed
- Treat the green badge as a cleared gate

## Outcome

Accept the tracked downgrade and proceed. Treating the badge as a cleared gate is refused outright, and reopening the pull request to earn a greener badge does not move the engine toward a completed live run, which is the standing filter for this thread. The substance G14 would referee was already produced directly and quoted: the change was proven red on the parent commit, and each half was independently mutated until the corresponding assertion turned red. The ladder behaved exactly as specified, surfacing a tracked status rather than a silent pass. Filed, not fixed here: the wording collision is systemic and will recur on every mitosis pull request that ships honest mutation evidence.
