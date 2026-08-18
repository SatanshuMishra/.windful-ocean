---
Status: accepted
Date: 2026-08-18T23:23:32.338Z
Thread-Id: 01KZTEFMENXBW30ZE633YNFJHE
---

# 0602. A unit with two open parents carries the sibling parent by merge commit, never waits for a human merge

## Context

Wave 3 was dispatched on 2026-08-18 while all six wave-1/2 PRs (219-224) were still open and human-gated. M12b-2 depends on M12b-1 (PR 221) and M2 (PR 222), both open against main on separate branches. M12b-2 deletes tests/run-engine.test.mjs, which M12b-1 modifies, so a branch missing M12b-1 from its history merges into a modify/delete conflict. A stacked PR takes one base branch.

## Options

- Wait for the human to merge 221 or 222 before dispatching M12b-2 - blocks the wave on a human action the RUNBOOK says never to wait on
- Branch off M2 (222) with --base feat/mitosis-route-status-writers and merge origin/refactor/mitosis-decouple-source-censuses in as the first commit; PR --risk states the diff narrows once both parents merge; content-check both parents are present
- Rebase 222 onto main after 221 merges - touches another PR's base.sha and re-runs its CI for no gain

## Outcome

Option 2. M12b-2 branches off M2's branch, merges M12b-1's branch by merge commit (the repo merges with merge commits, so this matches its own history shape), opens against M2's branch, and proves both parents by content (0 raw-text reads of run-engine.mjs in coupling-hardening.test.mjs; disposition present in parking.mjs), never by SHA. Enforcer sees the sibling's commits two-dot until both parents land; accepted. M3, M4, M4b stack directly on M2's branch. General rule for the rest of the stack: a second open parent enters by merge commit, and the wave never waits on a human merge.
