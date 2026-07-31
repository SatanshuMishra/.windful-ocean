---
Status: accepted
Date: 2026-07-31T18:56:49.863Z
Thread-Id: 01KYR405KFXHM15J5XXK5BXTVT
---

# 0157. Gap 1 extracts only what a named milestone is about to touch, not everything un-mirrored

## Context

47.5% of mitosis.js has no lib twin. A blanket extraction would be a large, mechanical, low-value diff that burns the reviewability budget on code nobody is about to change, and it loses on binding decision 0065, which scores a solution on mechanism count and prefers the one that reaches the behavior with less. The orchestrator's original justification for sequencing this work before M3 - that M3 would otherwise be deleting untested un-mirrored logic - was PARTLY REFUTED by measurement: M3's named deletion targets (the streaming path, STREAMING_DISPATCH_ENABLED, maxSteps, progressPossible) are mirrored in leases.mjs and already unit-tested. The real exposure is narrower: M3's consolidation target runReconcileOnlyAdvance at mitosis.js:2977-3120, 144 un-mirrored lines, is the second advance implementation that "one advance loop" must absorb.

## Options

- Extract all un-mirrored logic into policed twins
- Extract only what a named milestone (M2, M6, M3, M4, M5, M7, M8) is about to touch, that has a dependency-injection seam, and is under ~150 lines
- Extract by abstract risk ranking - decision-making logic high, prompt assembly low
- Extract nothing; rely on the closed census to catch future twins only

## Outcome

Admission criterion: a region is extracted only if a NAMED milestone is about to touch it, it has a dependency-injection seam (precedent: runEngine(engineArgs, ctx) at run-engine.mjs:296), and it is under roughly 150 lines. Applied, this admits 409 lines across 7 items and REFUSES 1,937, each refusal reasoned in the plan. Prompt-string assembly and other stable regions stay where they are. Ranking by abstract risk is rejected in favour of ranking by what M3 through M8 will actually modify - extract what is about to be changed, leave the rest. The corrected M3 rationale is recorded rather than quietly dropped: the before-M3 gate holds on runReconcileOnlyAdvance alone, not on M3's named deletions.
