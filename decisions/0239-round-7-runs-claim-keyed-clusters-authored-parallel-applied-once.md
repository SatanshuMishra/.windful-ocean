---
Status: accepted
Date: 2026-08-04T19:36:37.979Z
Thread-Id: 01KZ4M2VJHW4W1MNGTM0YGHY98
---

# 0239. A repair round partitions by claim, authors read-only in parallel, and folds through one applier on a higher tier

## Context

0238 directed that each gate red be reasoned out with its full surface area by a dedicated high-reasoning Fable subagent before any fix is written, and 0235 requires a many-record two-document fold to be authored as matched-pair patches and applied by a single agent. Neither says how to PARTITION the work, and the partition is where the method could fail: 47 defects across two documents whose claims are mirrored, so a document-keyed or invariant-keyed split would have put both halves of a mirrored claim in different agents' hands, reproducing exactly the half-landing 0237 exists to prevent. A second problem is concurrency: ten agents editing two shared files would corrupt them regardless of how well each reasoned. At dispatch the user directed the applier specifically: apply using Opus, not Fable.

## Options

- Partition by document (SPEC agents, DOCKET agents)
- Partition by gate invariant (one agent per I3/I4/I5/I7/I8)
- Partition by CLAIM, read-only authors in parallel, single applier on a higher model tier
- One agent sequentially over all 47 defects

## Outcome

PARTITION BY CLAIM; AUTHORS READ-ONLY IN PARALLEL; ONE APPLIER, HIGHER TIER. Eleven clusters were keyed so that every site of a mirrored claim sat inside one owner, with a published site-ownership map and an instruction to declare any cross-cluster collision rather than resolve it. Reasoners were hard-fenced read-only on both documents and wrote only their own patch file; a single applier folded all eleven. Model tiers were split by the shape of the work: reasoners on Fable derive fixes across a wide surface in parallel, while the applier is the only agent that sees every patch at once and must hold eleven authors' intents in one head, which the user directed be Opus.

Measured result: 122 of 126 edits applied, 0 failed anchors, 0 unlanded pairs, and a byte-for-byte replay onto the untouched snapshots proving zero collateral change. The partition also paid where it was designed to: nine previously-unlogged sites of the gate's OWN claims surfaced, every one byte-identical to .pre-round5 - that is, they survived a round 6 gate specifically hunting that shape. Three gate errata surfaced the same way (0197 appears nowhere in either document; the corpus is 238 not 236; I3-5's cited DOCKET:146 is an empty line). Round 7 closed 43 of 47 defects on the patches' own accounting, unverified by any gate.

Document-keyed partition is rejected outright: it splits mirrored claims by construction. Invariant-keyed is rejected for the same reason one level up - round 6's four half-landed pairs were each found by a DIFFERENT invariant's verifier, so the invariants cut across claims rather than along them. The sequential single agent is rejected on capacity, not principle: 47 defects each requiring full surface mapping across two documents, the decision corpus, the anchor table and the engine exceeds what one context can hold at the depth 0238 demands.
