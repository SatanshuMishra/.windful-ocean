---
Status: accepted
Date: 2026-08-18T23:43:59.799Z
Thread-Id: 01KZTEFMENXBW30ZE633YNFJHE
---

# 0603. M4 ships without parked-not-in-specs, which moves to M9; the four test-side readers A8 missed are updated

## Context

M4's lead returned blocked on 2026-08-18: its ceiling tests were green but npm test showed 6 failures outside M4's file list. Four (run-log.test.mjs, phase-driver.test.mjs x3) pin the pre-fix behaviour that a shipped-but-unmerged unit stays in specs; A8's reader-side sweep ran with --exclude-dir=tests and never swept test readers. One (e2e-substrate.test.mjs:291) is a real regression: nothing in production consumes plan.parked for dispatch (phase-driver.mjs:197 dispatches from resumed.specs alone), so removing parked units from specs makes them unretryable until M9 lands remediate-plan.mjs in wave 5.

## Options

- Ship M4 with all four criteria and update the e2e test to expect no dispatch - buys green by deleting a true failure signal
- Fold M9 into M4 - breaks the 24-unit freeze and merges waves 3 and 5
- Amend M4's file list with the four pinned tests as a declared ratified reversal (the M3 pattern at whole-solution.md:375), and move the parked-not-in-specs criterion into M9's ceiling where its consumer lands; M4 ships criteria 1, 3, 4, 5

## Outcome

Option 3. Freeze intact: no unit added, one criterion moves between existing units. M9's ceiling gains: a parked unit appears in parked and not in specs, with remediate-plan as the consumer, red on M9's parent. M4's PR body names the deferral in --what/--risk (plain words, no ladder tag); the parked-routing assertion is not shipped skipped or weakened, it is simply not in M4. The test-side reversal is stated in the PR body. Standing lesson filed to backlog: A8-style sweeps must include tests/.
