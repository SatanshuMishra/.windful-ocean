---
Status: accepted
Date: 2026-08-02T19:23:20.295Z
Thread-Id: 01KYR405KFXHM15J5XXK5BXTVT
---

# 0207. M4 re-lands on main by cherry-pick after PR 34 merged into its feature base

## Context

M4 shipped as two stacked PRs. PR 33 (fixed build-ahead cap) squash-merged to main as 6a83b1d. PR 34 (divergence instrumentation) merged into its declared base feat/m4-fixed-build-ahead-cap, not main, so half of M4 never reached main: origin/main lacked invalidatingParents, and neither b5c34c0 nor 63e6f1b was reachable from it. PR 33's squash had also reset the merge-base to 9ea75d6, so any PR from the surviving branches would have displayed 8 commits instead of 3.

## Options

- Retarget the branch to main: no force-push, but the squash-reset merge-base shows the reviewer an 8-commit diff instead of 3
- Rebase onto the new main and force-push: clean 3-commit diff, but a destructive history rewrite
- Cherry-pick the three divergence commits onto a fresh branch cut from main and open one PR: the pattern 0172 used for P2

## Outcome

Cherry-pick, reaffirming 0172. feat/m4-divergence-reland was cut from 6a83b1d and b8c3542, 74962a6, b5c34c0 picked onto it. Proven conflict-free BEFORE any mutation, because tree(origin/main) already equalled tree(58cb6ea), making the 3-commit delta an exact apply. Result was content-identical to the reviewed work: tree(reland) == tree(b5c34c0) == tree(63e6f1b) == 05da3cd. Shipped as PR 35, squash-merged as a618338; tree(origin/main) is now 05da3cd, so all of M4 is on main. All three feat/m4-* branches and both anchor tags were then deleted, each having an empty residual diff against main. Standing lesson: a stacked PR merges into its DECLARED base, so the second PR of a stack lands on a feature branch, not main, unless retargeted first.
