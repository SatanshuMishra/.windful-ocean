---
Status: accepted
Date: 2026-07-28T20:15:53.725Z
Thread-Id: 01KYJTVMQ06B0NY6ENYKZCRYBP
---

# 0088. The severed preflight was a bad merge resolution, not a deliberate removal, and the fix lands in this thread

## Context

0083 left two questions open and forbade a fix without a user ruling: whether fix/mitosis-boundary-preflight (c59ca79) already restores the wiring, and whether 7e2e7d7 dropped it deliberately or via a bad merge resolution. The user authorized the recommended order on 2026-07-28. Inspection settled both. Local main (cd5c65d) is STALE and predates PR #5 entirely; origin/main (beca874) is the ref the brief measured and it carries the definitions at :24, :127 and the schema at :1357 with no call sites, exactly as 0083 states. c59ca79 is a single unmerged commit holding the original PR #5 content, so it does contain the wiring, but it cannot be cherry-picked: HEAD's reconcile prompt gained manifestRawPages and a reconManifestText computation after PR #5 merged. Provenance is a timeline, not an inference: 457d6fa merged PR #5 at 16:16 on 2026-07-27; 4b971e5 'Merge branch main into feat/centralized-pr-creation' at 22:42:31 already shows definitions surviving at :24/:127/:1357 while step 7, the return-contract field and the gate block are gone; 7e2e7d7 squash-merged that resolution to main 29 seconds later at 22:43:00. A partial survival within one file is the signature of hunk-by-hunk conflict resolution, and 29 seconds is too short for anyone to have re-run the suite.

## Options

- Land the fix in this thread, which diagnosed 0083 and owns criterion 3
- Hand the fix to mitosis-preflight-hardening, which owns the red suite
- Cherry-pick or merge c59ca79 wholesale rather than porting the three hunks
- Make RECONCILE_SCHEMA.boundaryPreflight required so an absent verdict is a schema violation

## Outcome

The loss was a BAD MERGE RESOLUTION at 4b971e5, propagated to main by the squash 29 seconds later. Nothing was deliberately removed, so no design intent argues against restoring it. The fix LANDS IN THIS THREAD: the defect is the activation of the merge boundary, which is this thread's charter and blocks its criterion 3, whereas mitosis-preflight-hardening owns the preflight's own behavior and the no-self-merge-consent test. The 18 red BOUNDARY PREFLIGHT tests are the receipt for THIS defect, so clearing them here discharges red the other thread would otherwise inherit rather than colliding with it. c59ca79 is NOT cherry-picked: the three hunks are ported, taking step 7 byte-identical (sha256 verified equal) while merging the boundaryPreflight field into HEAD's newer return-contract line so manifestRawPages survives. RECONCILE_SCHEMA stays optional and nullable DELIBERATELY, so an absent verdict reaches readBoundaryPreflightVerdict and halts with a diagnostic instead of being rejected upstream as a schema violation. Measured receipt on a worktree cut from beca874: baseline 1540/1520/20, after 1540/1538/2, all 18 BOUNDARY PREFLIGHT names cleared and the diffed failing-name set shows ZERO new failures.
