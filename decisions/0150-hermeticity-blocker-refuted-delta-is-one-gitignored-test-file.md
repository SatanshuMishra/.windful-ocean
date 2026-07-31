---
Status: accepted
Date: 2026-07-31T07:23:53.584Z
Thread-Id: 01KYR405KFXHM15J5XXK5BXTVT
---

# 0150. The hermeticity blocker is refuted; the 9-test delta is one gitignored test file, and M0 is unblocked

## Context

0149 gated M0 on one check: a worktree at 11421ef, full suite, pass count compared against 1761. Executed. Worktree (.claude/worktrees/hermeticity-check, detached 11421ef): 1752 tests, 1752 pass, 0 fail, exit 0. Primary working directory at the same commit: 1761 tests, 1761 pass, 0 fail, exit 0. The blocker's actual claim - main 1520/1540 with a worktree failing 2 MORE at the same commit - is refuted on both halves: nothing fails anywhere, and 1520/1540 is stale. The 9-test delta was localized by diffing the two runs' test-name sets: all 9 belong to one file, .claude/hooks/tests/session-config-drift-check.test.mjs, which is UNTRACKED because .gitignore:18's `*session*` pattern matches its filename. A clean worktree checkout therefore cannot contain it. Zero tests differ in any other direction.

## Options

- Treat 1752 != 1761 as unequal per 0149's literal rule and keep M0 blocked
- Localize the delta, and clear the blocker if the cause is benign and fully accounted for
- Re-open the broad two-track hermeticity investigation

## Outcome

Blocker CLEARED and M0 started. The counts are unequal but 0149's literal equality rule was a proxy for its stated intent, a trustworthy suite signal for M0's red-then-green proof, and that intent is decisively met: both environments are 100 percent green and the entire delta is one file that is not in git at all and touches no mitosis engine code. The ledger's 1520/1540 figure is replaced by the measured pair 1752/1752 worktree and 1761/1761 primary. Two consequences recorded rather than acted on here: the `*session*` gitignore pattern is silently swallowing a real tracked-worthy test file, which is the same spec-loss class 0148 addressed and belongs to the SessionStart-freshness work in the boundary-residuals thread, not to M0; and any future worktree-vs-primary comparison must diff test-name SETS, never counts alone, because a count match could hide an offsetting pair.
