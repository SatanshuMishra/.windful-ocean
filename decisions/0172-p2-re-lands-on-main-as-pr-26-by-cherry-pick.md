---
Status: accepted
Date: 2026-07-31T23:16:23.222Z
Thread-Id: 01KYR405KFXHM15J5XXK5BXTVT
---

# 0172. P2 re-lands on main as PR #26 by cherry-pick onto a fresh branch; the coverage gate does not key on branch name

## Context

P2's nine commits were merged into their base test/mirror-census-closure rather than main, so origin/main (8933c2c) held none of the status-fold MSP. The prior session's hand-off prescribed a fresh branch plus cherry-pick and warned that PRing the old branch into main would delete P0's work. Grounding this session refined that warning: origin/main is byte-identical to the P2 branch point 7b8acd2 on all five files the nine commits touch, and differs only by P0's four paths (.gitignore, two coverage entries, the plan), so the deletion hazard is real for a two-dot cross-branch diff but the fresh-branch path removes it entirely. A second unknown was resolved by reading scripts/invariant-coverage-check.mjs: it validates every coverage entry against the registry id universe and, on pull_request events, requires only that SOME file under docs/invariants/coverage/ changed between base and HEAD. It never derives an entry filename from the branch name.

## Options

- PR the existing fix/m2-monotone-status branch into main and rely on GitHub's three-dot diff
- Cut a fresh branch off origin/main and cherry-pick the nine commits in order
- Force-push the existing branch rebased onto main's tip
- Leave M2 stranded and re-derive its content inside a later MSP

## Outcome

CHERRY-PICK ONTO A FRESH BRANCH, as prescribed. Branch fix/m2-monotone-status-onto-main cut from origin/main 8933c2c; the nine commits cherry-picked in order with zero conflicts. Content identity is receipted two ways: all nine patch-ids are byte-identical to the originals, and a two-dot diff of the old P2 tip against the new tip shows only P0's four paths as additions, nothing deleted. Full suite on the tip: 1813 tests, 1813 pass, 0 fail, exit 0. invariant-coverage-check --event pull_request --base-ref main: ok, exit 0, all 12 registry ids covered. PR #26 opened through pr-create with fresh verification lines, superseding PR #25; every CI check passed, including the sast job that 0141 recorded as a first-push red. Two consequences named rather than fixed: because the branch could not reuse the taken name, the coverage entry keeps the filename fix-m2-monotone-status.json while the branch is fix/m2-monotone-status-onto-main, so the branch-derived filename convention drifts by one entry; and the M1 row's sentence "The branch is still named fix/m2-monotone-status" is now stale on this branch. The gate passes either way, and the reviewed artifact was left byte-identical deliberately rather than edited post-review. Merge stays human-gated.
