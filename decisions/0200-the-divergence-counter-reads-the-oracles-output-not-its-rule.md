---
Status: accepted
Date: 2026-08-02T06:59:21.758Z
Thread-Id: 01KYR405KFXHM15J5XXK5BXTVT
---

# 0200. M4's divergence counter counts invalidations that fired, read from the oracle's output rather than from a re-derivation of its rule

## Context

0198 left open what the per-run divergence count actually counts. Spec line 98 words the purpose as pricing how often divergent invalidation FIRES, so K can become adaptive with data. That is not the same as the count of verdicts equal to 'divergent': descendantsToInvalidate (mitosis.js:2452-2455, parking.mjs:52-55 twin) returns [] iff the verdict is 'clean' and otherwise returns the full transitiveDependents set, so 'missing' and 'indeterminate' invalidate exactly as 'divergent' does — the fail-closed rule reconcile.test.mjs:164-177 pins across nine cases. Counting only 'divergent' would systematically under-report the driver of the number's own subject.

## Options

- Count verdicts equal to 'divergent'
- Count verdicts not equal to 'clean' (re-derive the invalidation rule at the counting site)
- Count parents for which the invalidation oracle returned a non-empty descendant set (read its output)
- Emit a per-verdict breakdown as several fields

## Outcome

COUNT THE ORACLE'S OUTPUT. invalidatingParents increments once per keyed parent for which descendantsToInvalidate returned a non-empty set (invalidated.length > 0), NOT verdict !== 'clean'. The distinction is the point: reading the output means the counter FOLLOWS the oracle if the fail-closed rule ever changes, while re-deriving the rule would make the counter a second authority for it — the exact defect class M4 exists to remove. One integer added to planReconcile's return in BOTH twins; recomputing assembleDivergenceVerdicts at the call site was rejected as a second authority plus a second traversal. Because one integer is ambiguous about which verdicts it covers, the LOG LINE states the coverage in words rather than adding a second field. It counts parents that FIRED, not units parked: a parent can fire and contribute zero parks when its descendants are already done (pinned at reconcile.test.mjs:142), which is why the already-existing rebuild-unit emitter at mitosis.js:3966 is the complementary half and was not duplicated. Proven by mutant, not argued: emits 1 on the :571 two-parent scenario where one parent probed divergent and one clean.
