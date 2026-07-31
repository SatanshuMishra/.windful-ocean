---
Status: accepted
Date: 2026-07-31T19:22:19.787Z
Thread-Id: 01KYR405KFXHM15J5XXK5BXTVT
---

# 0159. H-C is refuted, not deferred: the journal-shipped union into done is correct and must not be narrowed

## Context

H-C was carried as an open hole: reconciledDoneIds at mitosis.js:4058-4061 unions journal-shipped ids into done with no merged-PR re-check at the read site. The plan carried a P2 receipt for it but section 1 states the anchors were re-derived while the rulings were not re-litigated, so the in-or-out ruling was genuinely owed. Two rounds of investigation were run. Round one argued refutation from a sole-writer chain, claiming applyShipTransition is invoked only from the fold at mitosis.js:3781 where the id is already a member of reconciledMergedIds. The orchestrator verified that claim by grep and found it incomplete: applyShipTransition has a SECOND caller at mitosis.js:562, inside applyRunDelta, which is journal replay rather than a live merged observation, and that is exactly the path the H-C framing named. Round two traced the second path to its producer. Findings, verified: the only constructor of a kind-ship record is shipDelta at mitosis.js:539-541; its only call site is persistShipCheckpoint at mitosis.js:4240-4259 (write at :4242); persistShipCheckpoint has exactly one caller, mitosis.js:3019, inside a loop over newlyMergedIds; newlyMergedIds at :3778 derives from reconciledMergedIds at :3777, which derives from reconciledShipped at :3760, which is built from this run's live gh pr list --state merged read. Exhaustive grep found no second, optimistic producer. Independently confirmed by the orchestrator: HIGH-C at frontier-train-e2e.test.mjs:860 exists verbatim and sets its fixture to mergedPRs equal to the empty array specifically to prove a manifest-shipped unit must be trusted WITHOUT live re-corroboration; the --limit 200 truncation is real at mitosis.js:3718; applyShipTransition at :470 is the sole writer of status shipped (writes at :473 and :485, every other hit is a read).

## Options

- Include H-C in MSP M2 and gate the done-union on a live merged-PR fact already in scope (reconciledShipped is bound at top level and reachable at :4058)
- Defer H-C to a later MSP as a named, explicit deferral
- Refute H-C: rule it not a defect, ship no change, and remove its receipt from the P2 plan
- Ship a non-narrowing audit-only log when a manifest-shipped id has no live corroboration

## Outcome

Refute H-C. It is not a defect, it is not deferred, and MSP M2 ships no change at mitosis.js:4058-4061. The receipt row for the done-union fact gate is struck from plan section 9. Gating the union on reconciledShipped is mechanically possible (that binding IS in scope at :4058, unlike liveSignals which is block-scoped to :3819-3863) but is the wrong fix twice over. First, it re-introduces the truncated-listing regression HIGH-C at frontier-train-e2e.test.mjs:860 was written to prevent: the live merged read is capped at --limit 200, and this thread's own risk register already holds that absence from that listing is not evidence of non-merge (0154). Second, both routes to status shipped are provably downstream of a live merged observation, the journal route merely deferring it across a relaunch, so there is no version of require-re-confirmation that distinguishes a legitimately journal-replayed shipped from a truncated-listing false negative. Narrowing done would also break three consumers: the already-shipped skip gate at :4321, restack selection at :4571, and parentsDone at :4687, where a merged parent outside the listing horizon would leave its descendant stuck indefinitely, a liveness regression and not only a correctness one. The audit-only log option was considered and refused as mechanism without a decision behind it. One residual is recorded and NOT closed: .mitosis/run.json is a plain file the codebase itself documents as operator-hand-editable at mitosis.js:4410, so a hand-injected shipped status is reachable; that is a tamper surface, not a derivation hole, and no in-code path writes an unconfirmed record. Method note for the next fix round: round one's refutation rested on a sole-caller claim that a two-second grep falsified, and the conclusion survived only because the second path was traced to its producer. Trace producers, never assert sole callers.
