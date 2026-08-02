---
Status: accepted
Date: 2026-08-02T04:21:24.278Z
Thread-Id: 01KYR405KFXHM15J5XXK5BXTVT
---

# 0195. The leaked-worktree reaping criterion is uncommitted content, not unmerged commits

## Context

The 12-leaked-worktrees item had been fenced out of scope for this thread; the user lifted that fence and directed a cleanup after M5 merged. Inventory found 13 worktrees under .claude/worktrees plus 3 session-continuity plugin worktrees and the main one. The obvious safety signal is wrong here: git log origin/main..HEAD reports unique commits for a branch even when its content landed, because this repo integrates by SQUASH-merge, so a non-zero count is not evidence of unlanded work and a zero count is not required for safety. The actual mechanic that decides recoverability is different: git worktree remove deletes only the working directory and the admin record, and every branch ref survives, so for a CLEAN worktree nothing committed can be lost. The only irrecoverable loss is uncommitted content, and git worktree remove already refuses a dirty worktree without --force.

## Options

- Remove all 13 leaked worktrees, forcing past dirty ones
- Remove only worktrees with zero unique commits against origin/main
- Remove only worktrees with no uncommitted content, regardless of commit count
- Remove none and keep deferring the reaping
- Delete the branches alongside the worktrees

## Outcome

REAP ON DIRTINESS, NEVER ON MERGED-NESS. 9 of 13 removed - boundary-preflight, boundary-residuals, ci-retarget-rerun, drift-state, msp2-d6d7, msp2-engine-fixes, msp3-low-folds, semgrep-pin, sweet-kapitsa-6d4d09 - including four that carried 1 to 3 unique commits, because those commits remain reachable on their branch refs (verified surviving after removal). 4 HELD, all dirty, because removal would destroy uncommitted content: frontier-default (dirty, 125 unique), hermetic-guard-test (dirty, 0 unique), mitosis-frontier-train (dirty, 77 unique), mitosis-opt-stage1 (dirty, 89 unique). REJECTED the zero-unique-commits rule specifically because squash-merge makes it both over- and under-restrictive - it would have spared clean worktrees whose work fully landed while telling us nothing about the dirty ones, which are the only genuinely risky case. REJECTED forcing past dirty worktrees: that is the one irreversible outcome available here. REJECTED deleting branches, which was never asked for and is separately destructive; the branch ref is precisely what makes the worktree disposable. The two detached-HEAD worktrees were checked to be ancestors of origin/main before removal, since a detached commit off no branch WOULD have become unreachable. The 3 plugin worktrees are ledger infrastructure and are not leaks. The two parked stashes are untouched and remain out of scope.
