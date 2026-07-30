---
Status: accepted
Date: 2026-07-30T04:33:42.104Z
Thread-Id: 01KYR405KFXHM15J5XXK5BXTVT
---

# 0109. Speculation depth is derived from restack capability, not tuned; default 2, ceiling 3, first pipeline at 1

## Context

0105 kept speculative build-ahead (built | awaiting | done) as the single best decision in the current engine but refuted its prior art and its control loop: Zuul and GitHub merge queues speculate over changes already approved and enqueued where only CI is uncertain, whereas mitosis speculates over PRs a human may reject or rewrite. The correct lineage is stacked diffs, whose central value is cheap mechanical propagation of a parent change into its children, and mitosis adopted the speculation without the restack half - unmanaged rework by construction. 0105 directed that the AIMD window (floor 3, +1 on approve/merge, halve on changes-requested, ceiling 8) be replaced by a plain bounded depth reduced for a specific subtree, and that the default be shallower than CI systems use because failures here cost tokens and un-automated rework rather than machine time. It left the number open. The loop was also never validated: ceiling 8 landed in 44f9a62 with no derivation from the design's own "~6-8" range, and a persistent APPROVED was re-counted every poll with no dedup, inflating 3 to 8 off a single approval.

## Options

- Keep a global adaptive window and only retune its bounds
- Pick a fixed default depth as a tuned constant
- Derive permissible depth from whether automated restack exists for that work type, with a fixed low ceiling and subtree-local pruning

## Outcome

DERIVE depth from restack capability. Depth is only safe to the extent that unwinding is mechanical, so the capability that makes unwinding cheap is what licenses depth - not a tuned number. RULE: depth 1 where no automated restack exists for that work type; default 2 once restack is proven for it; hard ceiling 3; never a global feedback window. The first pipeline ships at depth 1. On changes-requested at node N, prune and restack within N's subtree ONLY, leaving sibling subtrees untouched - the targeted causal response 0105 asked for instead of a global feedback loop over human behaviour. SUPPORTING ARITHMETIC: a chain of depth d survives with probability p^d, where p is the chance a PR is approved without changes. At p=0.7 that is 49% at depth 2, 34% at depth 3, and 6% at depth 8; at p=0.85 it is 72%, 61% and 27%. The old ceiling of 8 wasted nearly every deep speculation. Choosing a static bound also DELETES the APPROVED double-count failure mode outright rather than fixing it, because there is no longer a signal to miscount. PREREQUISITE: restack must exist as a deterministic activity - a mitosis-git.mjs verb, generalizing decision 0017 from the restack driver specifically to the pattern - before default depth rises above 1. FALSIFIER: if measured p on machine-authored PRs under this reviewer proves materially higher than 0.85, depth 3 as a default becomes defensible and the ceiling can be revisited; p should be measured from real review outcomes rather than assumed.
