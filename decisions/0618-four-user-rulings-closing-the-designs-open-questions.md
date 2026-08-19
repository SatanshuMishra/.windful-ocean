---
Status: accepted
Date: 2026-08-19T02:57:42.296Z
Thread-Id: 01KZTEFMENXBW30ZE633YNFJHE
---

# 0618. Four user rulings close the design's open questions; the remaining two are filed, not asked

## Context

The approved design ended with six items marked as needing the user. Under the ceiling ruling recorded at 0615 that section is retired as a scope surface, but four of the six genuinely gated implementation and were put to the user before the fresh session starts, so that no unit stalls mid-run waiting on a decision.

## Options

- Leave the six open and resolve each as its unit is reached
- Rule the four that gate implementation now, and file the remaining two

## Outcome

Four rulings, all binding. ONE - the end-to-end test becomes a REQUIRED status check on the trunk. This is the change that converts a green suite into a claim about the application, and it is the enforcement half of 0616; without it a red run merges on one click. It is a repository-settings change, applied by the human, and it is applied only once M16 exists, since requiring a check that does not yet exist blocks every merge. TWO - nothing outside this repository parses the run summary, so M6 performs a clean rename with no deprecation window and no dual-key emission; risk 4 in the design is closed, not mitigated. THREE - the operator override on a needs-human park is IN, exactly as the design already specified, with no further deliberation; this was never an open question and is recorded only to close it. FOUR - user-ratified ceiling move: a run whose CI was never watched no longer reports as shipped. This REVERSES committed intent that carried a written rationale, and it is the user's call as owner of the ceiling, not a review finding. Its delta is pinned here so it cannot grow: it lands inside M6's already-owned files, gating one status word on a count the design already surfaces, and is bounded at roughly 20-40 lines. If it is found to exceed that, the excess is filed as a new item rather than absorbed into M6. The two remaining items are FILED, not asked: the legacy vocabulary in generate-run-script.mjs and outcome.mjs sits above the declared ceiling and stays filed as the design already ruled.
