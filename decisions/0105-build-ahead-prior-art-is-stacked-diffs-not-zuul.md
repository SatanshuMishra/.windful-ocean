---
Status: accepted
Date: 2026-07-29T23:44:36.104Z
Thread-Id: 01KYR405KFXHM15J5XXK5BXTVT
---

# 0105. Speculative build-ahead is stacked-diff practice, not merge-queue speculation; the AIMD control loop is misapplied

## Context

The frontier-train design (2026-07-16-mitosis-frontier-train-design.md:106-110, 149-153) grounded mitosis's speculative build-ahead and its AIMD window (additive-increase/multiplicative-decrease: floor 3, +1 on approve/merge, halve on changes-requested, ceiling 8) in Zuul, on the basis that Zuul ships the same window shape for the same problem class. Build-ahead itself — the built | awaiting | done states relaxing readiness so dependents need not wait for a merge — was correctly identified as the remedy for the real bottleneck and is the enabled default. The question was whether its cited prior art actually supports the design.

## Options

- Keep Zuul as the prior art and the AIMD window as designed
- Keep build-ahead but re-ground it in stacked-diff practice and replace the AIMD control loop
- Abandon speculative build-ahead as unsupported by prior art

## Outcome

KEEP build-ahead — it is the single best decision in the current engine and reverting to strict merge-gated readiness would be worse than today. But its prior art is MISATTRIBUTED and its control loop is wrong. Zuul and GitHub's merge queue speculate over changes ALREADY APPROVED AND ENQUEUED FOR MERGE, where the only remaining uncertainty is CI; mitosis speculates over units whose PRs a human may reject or rewrite. Zuul's window SHAPE matches, its signal POPULATION does not. The correct lineage is STACKED DIFFS (Gerrit, Phabricator, Graphite, Sapling), whose central value is cheap mechanical propagation of parent changes into children — and mitosis adopted the speculation WITHOUT the restack half, so a changes-requested parent has no automated path to propagate into its already-built dependents. That is unmanaged rework by construction, and supplying the missing restack is a rebuild requirement. On AIMD: the control law is fine, the PLANT is wrong. The signal is a human review outcome, and "changes requested" means this content is wrong, not you are speculating too deep; halving the window does not make the next review likelier to pass, and widening on approvals does not mean review capacity grew. This is cargo-cult control theory. Replace with a plain bounded speculation depth reduced for a SPECIFIC SUBTREE when its own parent gets changes-requested — a targeted causal response rather than a global feedback loop over human behavior. Note also that the loop was never validated: the ceiling 8 landed in commit 44f9a62 with no derivation from the design's own "~6-8" range, was re-confirmed by ledger decision 0086 only on "not a new number" grounds, and the signal was independently found incoherent (a persistent APPROVED re-counted every poll with no dedup, inflating 3 to 8 off one approval). Finally, because speculation failures here cost tokens and un-automated rework rather than machine time, default depth should be SHALLOWER than CI systems use.
