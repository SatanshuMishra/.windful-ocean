---
Status: accepted
Date: 2026-08-20T01:52:44.681Z
Thread-Id: 01KZTEFMENXBW30ZE633YNFJHE
---

# 0634. M16's inertness red was vacuous by unreachability, and the lib symlink blocks making the check required

## Context

M16's ceiling predicted the end-to-end ship-cycle test would stay GREEN under an inert shipIntegrated stub, and named turning it red as the unit's whole contribution. Measured against the pinned engine, it already exited 1 under the stub, which would have read as the criterion already satisfied.

## Options

- Accept the pre-existing red as satisfying the criterion and ship nothing
- Treat the red as vacuous and make a Ship-facing assertion reachable under inertness
- Report the unit not implementable because the ceiling's premise is false

## Outcome

The pre-existing red was VACUOUS and the unit shipped the real fix. Under the stub the only assertion that fired was the generic clean-exit proxy assert.equal(cycle.status, 0) at e2e-ship-cycle.test.mjs:113; node:assert throws, so the body aborted there and every Ship-facing assertion was unreachable. That proxy fires identically for any engine error unrelated to Ship, so the red carried no information about Ship. The gap was reachability, not greenness. The fix hoists the per-MSP pr-create argv assertion above the clean-exit check, one file, plus 8 minus 2. Under the same stub the fired assertion is now Ship-facing and pins an exact count: it received 0, expected 2. PR 250 is open with 17 of 17 CI checks green at head 36f65462, awaiting a human merge. Two tracked downgrades, kept out of the PR body: local full-suite green is unverified-reasoned, and the G14 mutation gate did not run because a tests-only diff gives it no source to sample. A separate finding BLOCKS ruling 1 of 0618: every local npm test on this machine carries one phantom failure, because the mitosis gate resolves engine source through the ~/.claude/lib symlink into the primary checkout's working tree, so its value tracks whatever branch that checkout sits on. The same commit is red locally and green in CI. The end-to-end test cannot be made a REQUIRED status check while that is true, so c41 stays blocked on fixing the symlink resolution first.
