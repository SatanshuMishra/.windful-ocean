---
Status: accepted
Date: 2026-08-02T06:59:39.467Z
Thread-Id: 01KYR405KFXHM15J5XXK5BXTVT
---

# 0201. M4's ship gate closed on three FAILs; remediation is audit-and-research first, and the 1839 baseline is corrected to 1830 in CI

## Context

The deterministic all-four-PASS gate closed: foreign-branch-filtering coverage is gone with the third deleted e2e test; BOTH commits fail the required invariant-coverage CI job on the pull_request event because a bare invocation silently takes the weaker push path; and input.buildAheadCap refuses null silently, which JSON.stringify's NaN/Infinity mapping widens into swallowing any computed garbage cap. Three of the four remedies are already drafted and mutation-proven by the lenses. The standing thread memory says fix rounds need invariants, not finding lists — five prior rounds each introduced a new defect on an unnamed path. Separately, two lenses independently measured that 1839 is a main-worktree figure inflated by ~9 tests from a gitignored file; a clean checkout and CI measure 1830.

## Options

- Dispatch the three drafted remedies immediately, since each is already proven red-then-green
- Audit and research each issue's core first with dedicated subagents, then implement
- Ship PR 1 alone now and defer every finding to a follow-up MSP

## Outcome

AUDIT AND RESEARCH FIRST, THEN IMPLEMENT — the user's explicit 2026-08-02 directive, and it overrides the temptation the drafted remedies create. A drafted, mutation-proven fix answers 'does this edit work', never 'is this the right surface' — and every one of the five prior fix rounds failed on the second question, not the first. The invariant-coverage FAIL is the proof: it was invisible to three separate green readings because the gate has two modes and only one was ever exercised, which is a class question no per-finding patch would have surfaced. SHIPPING PR 1 ALONE IS REJECTED: 777617b itself fails the pull_request gate, so it is not independently green and the remedy must be an AMEND to each commit rather than a follow-up. BASELINE CORRECTED: 1830 is the CI figure; every 1839/1846 number in this thread's prior entries is main-worktree-local and must not be quoted as a CI expectation. Nothing was pushed and no PR was opened, so no frozen PR body carries a wrong number.
