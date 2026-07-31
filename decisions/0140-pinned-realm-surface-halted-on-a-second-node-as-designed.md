---
Status: accepted
Date: 2026-07-31T00:14:49.257Z
Thread-Id: 01KYR405KFXHM15J5XXK5BXTVT
---

# 0140. The pinned realm surface has now been exercised on a second Node and it halted, as designed, on Temporal

## Context

The brief carried the risk that ALWAYS_DENIED is PINNED to the node v26.4.0 realm surface, that a Node upgrade adding a global would HALT sandbox construction until classified, and that this was fail-closed by design but NEVER exercised on a second Node. It has now been exercised. Local node is v26.4.0 where "Temporal" in globalThis is false. CI resolves node-version 26.x to v26.5.1, where the vm realm global carries Temporal. Commit 3e59d05 made the census total, and the very next CI run (30591117430) failed with "the realm global carries names no policy list classifies: Temporal" thrown from prunePlan via createSandboxContext. The suite was green locally at 1741/1741 on 26.4.0 and red on CI at the same commit; both measurements are true, on different realm surfaces.

## Options

- Classify Temporal in ALWAYS_DENIED and keep node-version 26.x floating, so each new Node global halts until classified
- Classify Temporal and additionally pin CI to an exact Node patch so the realm surface stops floating
- Relax the totality requirement so unclassified names pass

## Outcome

Classify Temporal in ALWAYS_DENIED; that is the minimal fix and it is both forward and backward compatible, because prunePlan only requires retained and bound names to be present on the realm and merely filters denied names that are absent. The floating 26.x pin is left as-is for now: halting on an arbitrary later PR is poor ergonomics but is exactly the stated fail-closed intent, and pinning an exact patch would hide genuine realm divergence until an explicit bump. The gate worked - the totality commit caught a real divergence on its first exposure, which is the outcome the design wanted. Exact-pin remains available if the halts prove disruptive.
