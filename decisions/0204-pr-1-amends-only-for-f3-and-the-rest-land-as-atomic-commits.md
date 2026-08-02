---
Status: accepted
Date: 2026-08-02T07:32:17.039Z
Thread-Id: 01KYR405KFXHM15J5XXK5BXTVT
---

# 0204. PR 1 amends 777617b only for the validator fix and its message; the coverage file, the restored e2e test and the clamp cleanup land as separate atomic commits

## Context

Decision A fixed PR 1 as feat/m4-fixed-build-ahead-cap carrying 777617b ALONE. After the audits that is no longer achievable: four distinct remedies land on that branch. Audit F2 measured that the invariant-coverage gate diffs the PULL REQUEST against merge-base rather than evaluating each commit, which corrects 0201's stated rationale -- a follow-up commit on the same branch satisfies the gate exactly as well as an amend, so the gate does not force amending. F1 wanted a new commit on top to preserve 777617b's SHA; F3 and F4 wanted an amend. F3 supplied the decisive reason neither other audit could know: 777617b's commit message is wrong in both directions (null is refused but not logged, 9999 is not refused at all) and only an amend can rewrite a message. F1's SHA-preservation argument buys nothing because commit 2 must be rebased under either shape, nothing is pushed and no PR exists. Separately, the project's commit rule requires atomic commits and forbids mixing a behaviour change with a refactor or a test restoration.

## Options

- One amend to 777617b carrying all four changes
- Amend 777617b for the F3 validator fix and its corrected message only, landing the other three as separate atomic commits on the same branch
- Split the four remedies into separate MSPs and PRs

## Outcome

AMEND FOR F3 ONLY; THE REST ARE SEPARATE ATOMIC COMMITS -- user ruling 2026-08-02, and it AMENDS DECISION A, which no longer holds as written. The amend to 777617b carries exactly the buildAheadCap validator move plus a corrected commit message; those two genuinely belong to the commit that created the surface and misdescribed it. F1's restored foreign-branch e2e test, F4's clamp-test cleanup and F2's coverage file feat-m4-fixed-build-ahead-cap.json each land as their own commit on feat/m4-fixed-build-ahead-cap. This satisfies the gate, which is PR-diff-scoped, AND the atomic-commit rule, which one four-way amend would violate badly. Separate MSPs were declined as PR overhead that would delay M4 and force yet more coverage artifacts. TWO COVERAGE FILES REMAIN MANDATORY, proven by F2's executed rebase: a file added on commit 1's branch produces zero diff lines for PR 2 because linear history makes merge-base equal the base, so feat/m4-divergence-instrumentation needs its own feat-m4-divergence-instrumentation.json. Editing commit 1's file from commit 2 works mechanically but was rejected as breaking the file-per-branch traceability all 16 existing coverage artifacts follow.
