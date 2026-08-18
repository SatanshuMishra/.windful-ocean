---
Status: accepted
Date: 2026-08-18T06:31:18.507Z
Thread-Id: 01KZTEFMENXBW30ZE633YNFJHE
---

# 0571. Re-running the same run document rewrites the journal and forgets that a unit shipped

## Context

Second live run, byte-identical run document, same run-id c28e0001, lock clear beforehand. Run 1 had left a five-line journal: genesis, built for objects-pick-omit-helpers, park for predicates-value-guards, quiescent-exit, ship. Mid-run 2 the journal held exactly one line, its genesis, and it ended with four lines of entirely new content: genesis, park, park, quiescent-exit. The ship delta recording pull request 2 is permanently gone. The summary reported restarted false while also reporting both units pending and shipped empty, and the unit that had genuinely shipped a real pull request came back parked. Exit 3, ship status partial, nothing opened. No duplicate pull request was created, so the done-oracle did hold.

## Options

- Read restarted false as evidence the run resumed
- Treat the journal rewrite as proof resume cannot work across invocations

## Outcome

Filed as a blocking defect for c29. Three faces of one fault: the journal is truncated and rewritten at run start so the prior run's deltas are destroyed; restarted false is a false negative, contradicting the pending and shipped fields printed beside it; and a unit that shipped a real pull request regresses to parked on re-run. c29 asks for a journal that proves a run resumed rather than restarted, and at this commit the journal is structurally incapable of proving it, so c29 cannot be met before this is fixed. Also answered: a NeedsHuman park does NOT redispatch through remediation on a plain re-run.
