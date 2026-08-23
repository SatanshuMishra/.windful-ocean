---
Status: accepted
Date: 2026-08-23T18:32:02.429Z
Thread-Id: 01M0QTN4YG3SWPQ1EMFT85M1K3
---

# 0686. The two engine defects red on the trunk are fixed before the billed run, not filed

## Context

Pull request 286 merged with two failing checks because the repository has no required status checks: branch protection returns 404 and the single active ruleset requires only a pull request with zero approving reviews. The trunk therefore now carries two real reds. planWaves throws a raw TypeError reading id at wave-planner.mjs:46 instead of a diagnosed error, and the wave planner runs in every mitosis run, so that is an undiagnosed crash point. unit-verdict-sha.test.mjs:236 asserts six spawned children where seven are expected, which is a cost and correctness question for a billed run. Neither blocks the live lane, which runs one file in its own workflow.

## Options

- File both as discovered above the ceiling and let the billed run proceed
- Fix only the wave-planner crash point
- Fix both before the billed run

## Outcome

Fix both before the billed run, on explicit user approval. The receipts ceiling rule would ordinarily file these as new items, and the user was asked precisely because they sit above this thread's declared criterion. The reason to fix rather than file is that each billed run has historically bought exactly one defect and then stopped, so shipping a known crash point into a paid run reproduces the exact failure mode this thread exists to end. The spawned-child count is diagnosed first, because a real regression and a stale expectation demand opposite fixes.
