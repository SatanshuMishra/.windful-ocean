---
Status: accepted
Date: 2026-08-01T04:33:41.672Z
Thread-Id: 01KYR405KFXHM15J5XXK5BXTVT
---

# 0179. sourcePrefix precedence is declined deliberately, logged but not won

## Context

Review found that published.sourcePrefix is validated as a required field and then never used: resolveRunIdentity rehydrates from the invocation prefix and never compares. sourcePrefix is the ONE identity field logicalRunId does not pin, so a relaunch under a different prefix fails to recognise already-merged integration branches (branchToMspId returns null) and can re-ship shipped work. That is a genuine I3 violation - the published copy neither wins nor is compared.

## Options

- Make published.sourcePrefix win inside resolveRunIdentity
- Reorder the reconcile pipeline so identity resolves before reconcileShippedSet
- Log the disagreement with its operational consequence and decline the win
- Fold sourcePrefix into computeLogicalRunId so it is pinned

## Outcome

DECLINED, deliberately, not deferred by oversight. Making the published prefix win cannot be done inside resolveRunIdentity: mitosis.js calls reconcileShippedSet with the invocation prefix BEFORE identity resolves, so adopting the published prefix there would build a manifest whose integrationBranch names disagree with the already-merged set the engine just computed - a new defect on an unnamed path, which is precisely the failure mode that produced five consecutive regressive fix rounds on this codebase. The full fix requires reordering the reconcile pipeline and making a const mutable across many downstream uses. I3 is restored in its "disagreement is logged" half only: the log names the value in effect AND the operational consequence, pinned green by an I3 envelope test. Recorded as an accepted limitation in the spec 3.5 amendment rather than left silent.
