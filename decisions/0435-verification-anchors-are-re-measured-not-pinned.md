---
Status: accepted
Date: 2026-08-15T01:36:11.695Z
Thread-Id: 01KZTEFMENXBW30ZE633YNFJHE
---

# 0435. A verification anchor is re-measured at the head it guards, never pinned from an earlier measurement

## Context

The main thread authorized the C4 restack with a tree-SHA equality gate and supplied the C4c target as the literal 3426c09e. That value was measured at ce5a40a8, before the fix round that discharged the reviewers' five HIGHs. By the time the restack ran, C4c's real ship-head tree was af115150. The orchestrator refused the pinned value and re-measured. This is the same shape as the cutover-rollback trap that burned three earlier fix rounds: a guard bound to a value that means something other than what the author assumed.

## Options

- Pin the anchor at authorization time, as originally instructed
- Re-measure the anchor at the head actually being rebased, immediately before the rebase
- Drop the tree-equality gate and verify by diff inspection instead

## Outcome

Re-measure. A pinned anchor has two failure modes and the quiet one is worse: it either halts the operation spuriously, or it silently certifies the branch against a pre-fix tree, attesting that fixes which had in fact landed had been dropped -- a green that means the opposite of what it claims. The gate stays; only its target becomes a measurement rather than a literal. Applied to the C4 restack, which then completed with zero conflicts and all three trees byte-equal. Binds every future restack, including the C5a/C5b/C6 lanes.
