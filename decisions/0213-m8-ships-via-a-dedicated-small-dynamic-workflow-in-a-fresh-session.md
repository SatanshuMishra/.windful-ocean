---
Status: accepted
Date: 2026-08-02T22:39:14.474Z
Thread-Id: 01KYR405KFXHM15J5XXK5BXTVT
---

# 0213. M8 ships via a dedicated small dynamic workflow in a fresh session, carrying M7's two residuals

## Context

User directive at hand-off on 2026-08-02, immediately after merging PR 36: "In the FRESH session, continue as recommended. Dispatch a DEDICATED small dynamic workflow to complete M8." This reaffirms the shape 0208 set for M7, which delivered: a phased workflow with parallel read-only grounding, an invariant-first plan, a dedicated plan auditor, one implementer in an isolated worktree, fenced adversarial review, a bounded remediation loop and a single ship agent. M8 is the last MSP in the quiescent-advance landing plan (spec section 10 line 310): the CI-to-green loop with all six escalation classes, section 4, depending on M1 and M5 which are both shipped. Its open decision (c) - class-6 granularity - was closed by 0087 in favour of the file-level assertion guard.

## Options

- Repeat the M7 workflow shape verbatim
- Repeat the shape with the M7 lessons folded in as standing fences
- Hand M8 to an ad-hoc subagent loop - rejected; spec-decomposition routes multi-task work through a workflow and the user asked for one

## Outcome

Repeat the M7 shape with its lessons folded in as standing fences, and fold in M7's two open residuals per 0212 so M8's diff owns them. Six fences the M7 run proved are load-bearing: re-derive EVERY anchor at the current HEAD because spec cites are anchored at 450804e and six MSPs have landed since; re-derive the twin surface from MIRROR_CENSUS, never from prose; give the deletion pass a dedicated reviewer lens for tests that pin SURVIVING behavior, which is how M7's only HIGH was found and is spec section 11 line 330's own recorded lesson; fence reviewers with "cite the supplied receipts, re-run nothing" while leaving exactly one agent permitted to execute; carry the 0210 operative green test verbatim so the environment-only failure neither halts the run nor gets restated as green; and instruct any decision-number check to use git show _ledger per 0209. Default to ONE PR per 0208; a genuine split ships the lower unit now and defers the upper, never a same-run stack. The attempt-cap-surviving-a-relaunch test named in spec section 11 is the one M8 must not skip - untested, it is what lets the CI loop become unbounded.
