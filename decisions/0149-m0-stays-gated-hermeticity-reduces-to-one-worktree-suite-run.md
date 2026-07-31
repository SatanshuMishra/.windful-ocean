---
Status: accepted
Date: 2026-07-31T07:05:21.550Z
Thread-Id: 01KYR405KFXHM15J5XXK5BXTVT
---

# 0149. M0 stays gated; the hermeticity blocker reduces to one worktree suite run

## Context

0085 authorizes M0 as a standalone atomic commit but adds a sequencing caveat: M0 sits behind the hermeticity blocker because its red-then-green proof needs a trustworthy suite signal. The thread recorded that blocker as main being 1520/1540 with a worktree failing 2 more at the same commit. New evidence this session: the full suite is 1761/1761 in the PRIMARY working directory, run twice via the pre-commit hook at both a60e411 and 9832a2f, so the recorded 1520/1540 is stale rather than red - the suite grew. The worktree half of the claim was never re-tested; no worktree was created this session.

## Options

- Start M0's red test now on the primary-worktree signal
- Run one worktree suite at the merge commit first and start M0 only if it matches
- Re-run the whole two-track hermeticity investigation from scratch

## Outcome

M0 was NOT started. Next session runs exactly one check first: create a worktree at 11421ef, run the full suite, compare the pass count against 1761. Equal clears the blocker and M0 begins immediately with its red test per spec section 11; unequal localizes the leak to the worktree environment and names the failing tests, which is a strictly smaller problem than the one the ledger describes. Either way the ledger's 1520/1540 figure gets replaced with a measured number. This deliberately declines to re-open the broad hermeticity investigation: the blocker's own claim is narrow and one run tests it.
