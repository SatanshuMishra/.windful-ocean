---
Status: accepted
Date: 2026-07-30T07:01:53.617Z
Thread-Id: 01KYR405KFXHM15J5XXK5BXTVT
---

# 0128. Every spec line citation was measured against the wrong base and is corrected, but the census survives

## Context

The spec's section 15 asserts every line citation was re-verified on 2026-07-30 at mitosis.js 4,851 lines. That measurement was taken against feat/centralized-pr-creation's DIRTY working tree, a different line of work. On origin/main the file is 4,925 lines. Implementers are handed these anchors.

## Options

- Ship the anchors as written and let implementers discover the drift
- Re-derive every anchor against origin/main before any MSP dispatch

## Outcome

Re-derived against origin/main 6d19499. No citation is ABSENT — every construct exists — but nearly all MOVED, in four separate bands rather than one uniform shift: +59 (model policy through Boundary), +73 (Reconcile, Remediate, Shepherd), +78 (Decompose through Parallelize), +74 (Branch, Ship). Unchanged: the :5-17 declaration block, and every anchor in mitosis-git.mjs (:30, :152, :170), derive-edges.mjs (:44, :78), wave-planner.mjs (:14, :26) and receipts.yml (:25). CRITICALLY, the three census numbers SURVIVE the drift unchanged — 13 declarations, 13 phase() call sites, 45 literal `phase:` over the same 13 titles, with Final review declared-but-never-called and Shepherd called-but-undeclared. The drift is pure line shift, not a change in the phase model's shape, so MSP-0's numeric basis holds. Four anchors need more than a line bump: the ship read-back is no longer contiguous (definition at :4692-4712, its merged=true gate 35 lines later at :4747-4757, and an implementer following the spec's single range would edit the definition and miss the gate); the decompose fail-closed block is three checks at :3917-3929, not one; the Parallelize payload transport is the block :4480-4501, not a line; and the :889-899 auto-approve construct is an inferential match — resolvePlanReview's `reReviewed ? 'approve' : 're-review'` at :957 is the closer literal fit, so MSP-3 should confirm the target before acting. The corrected anchor table is the session deliverable and must be attached to any MSP dispatch.
