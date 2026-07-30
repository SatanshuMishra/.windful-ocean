---
Status: accepted
Date: 2026-07-30T05:47:24.246Z
Thread-Id: 01KYR405KFXHM15J5XXK5BXTVT
---

# 0118. Mitosis pipelines are limited to two work types, fix and feat; refactor, perf, docs and chore are out of scope

## Context

0110 fixed the ordering (fix first, feat second) and 0117 sketched per-work-type gate floors across five types - fix, refactor, feat, perf, docs/chore. The user narrowed the scope directly: for now, limit mitosis pipelines to fix and feat only.

## Options

- Define floors and pipelines for all five work types sketched in 0117
- Limit pipelines to fix and feat, leaving other types unsupported for now
- Ship only fix and defer feat as well

## Outcome

TWO WORK TYPES ONLY - fix and feat. Approved by the user. Refactor, perf, docs and chore are OUT OF SCOPE for the rebuild; their floors sketched in 0117 are recorded as analysis, not as commitments to build. Ordering from 0110 is unchanged: fix ships first because the receipt gives it an objective machine-checkable oracle, feat second. FLOORS THAT REMAIN BINDING: fix requires a runnable test command PLUS an authored receipt, and a repo without a runnable test command gets NO fix pipeline, halting fail-closed with the gap named and pointing at verify-setup; feat requires build/typecheck plus whatever tests exist, and review still carries behaviour for feat because it has no objective oracle - this is exactly the asymmetry 0110 used to sequence the two. CONSEQUENCE FOR SCOPE CONTROL: narrowing to two types shrinks the surface the rebuilt core must validate, which directly serves the 0106 second-system mitigation - fewer pipelines to get right on the first slice. Work that is genuinely a refactor, a perf change, docs or chore does not route through a mitosis pipeline at all for now; it stays with ordinary single-branch work. This decision is a SCOPE limit, not a claim that the other types are unsupportable - reopening any of them is a new decision, and the 0117 floor sketches are the starting point if that happens. Note the standing constraint from git/pull-requests.md that the PR title type vocabulary remains the full conventional-commits set (feat fix refactor docs test chore perf ci); limiting PIPELINES to two types does not narrow the title grammar, and the two must not be conflated.
