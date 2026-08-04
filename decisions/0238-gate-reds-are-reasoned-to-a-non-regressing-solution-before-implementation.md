---
Status: accepted
Date: 2026-08-04T18:16:28.022Z
Thread-Id: 01KZ4M2VJHW4W1MNGTM0YGHY98
---

# 0238. Each gate red is reasoned out with its full surface area by a high-reasoning Fable subagent before any fix is written

## Context

The round 6 gate returned SPEC NOT READY with 47 defects across five violated invariants. A stored memory records the failure mode this thread keeps hitting: five earlier rounds each introduced a NEW defect on a path nobody had named, because each round was scoped to the previous round's finding list. 0230 answered that by gating rounds on invariants rather than findings, and this round proved the gating works - I1, I2 and I6 hold, and section 16's band exhaustivity reproduces byte-for-byte. But 0230 also named its own limit, and I4 found that limit realised at a new altitude: the enumeration inside the 0130-0227 band was exhaustive, while the band floor itself was never justified, leaving 114 of 236 records unsearched and producing a live misattribution (BUILD_AHEAD_CAP = 8 credited to 0197, which the band files mark NON-BEARING, when the true user-instructed record is 0086). Separately, 0237 establishes that a repair's unit is the claim and every site of it. Both point the same way: the expensive error is fixing what was named without first mapping what the fix touches. At hand-off the user directed how round 7 executes.

## Options

- Dispatch a repair round scoped to the 47 named defects, as earlier rounds were scoped
- Reason out each issue and its full surface area first, with dedicated high-reasoning subagents, then implement the derived solutions in full
- Ask the user to rule on all reserved questions first, then repair everything in one pass
- Split: mechanically repair the ~32 settled defects now, defer the ~15 reserved ones

## Outcome

REASON OUT THE SURFACE AREA FIRST, THEN IMPLEMENT IN FULL - directed by the user at hand-off, in these terms: dispatch dedicated high-reasoning subagents on the FABLE model to fully reason out the issues and all the surface areas affected, derive the best solution for each such that NO further regression is caused in any related or unrelated area, then implement those solutions in full.

The operative constraints this fixes for round 7:

MODEL AND EFFORT. Subagents run on Fable at high reasoning effort, dedicated per issue or per tightly-coupled issue cluster. This is a deliberate spend against pillar 1 (quality) over pillar 3 (speed): the four preceding rounds were cheap and each left a new defect behind.

SURFACE AREA IS PART OF THE TASK, NOT A PRELUDE TO IT. Each subagent must map every surface its issue touches - both documents, the decision corpus, the anchor table, the band-marking files, and the engine where a claim cites it - before proposing a fix. An issue whose surface is not mapped is not ready to fix. This composes with 0237: the claim's site list IS part of that map.

NO-REGRESSION IS THE ACCEPTANCE BAR, and it is explicitly not limited to the area under repair. "Related or unrelated" is the user's wording and is load-bearing: the recurring failure has been collateral damage on paths nobody named. A proposed solution states what it could break and why it does not.

IMPLEMENT IN FULL. Round 7 does not stop at a plan. The derived solutions are applied.

The first option is the failure mode itself and is rejected by 0230 and the stored memory alike. The fourth was the orchestrator's own proposal at hand-off and the user did not take it: splitting mechanical from reserved would repair 32 defects without mapping their surfaces, which is the first option wearing a smaller scope - and several "mechanical" fixes touch reserved ground (the corpus-count restatement runs into whether the band extends to all 236; the marker reclassifications run into where an [RB] note's scope ends). The third was not chosen either, but it is not foreclosed: the ~15 reserved items still cannot be closed by any subagent, and round 7 must surface them for ruling rather than resolve them. What changed is the ORDER - the reasoning happens first, so the questions reach the user with their full surface already mapped.
