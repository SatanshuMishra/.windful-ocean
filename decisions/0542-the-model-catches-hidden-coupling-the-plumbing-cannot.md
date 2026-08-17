---
Status: accepted
Date: 2026-08-17T18:48:43.426Z
Thread-Id: 01KZTEFMENXBW30ZE633YNFJHE
---

# 0542. The model caught an undeclared dependency the plumbing cannot see, and review caught the hazard it then created

## Context

The tier-2 hidden-coupling probe put two changes that look independent, and would carry disjoint fileScope, into genuine collision through a shared guard. Since deriveEdges, reviewCoupling and graphify are all off the engine path, the only mechanism that could catch it was the model's own dependsOn. It caught it: set-stock-level-route declared dependsOn on reject-zero-quantity in the correct direction. The collision was then demonstrated rather than predicted, on isolated branches from the pinned baseline: branch A alone 139 pass, branch B alone 142 pass, both merged 142 pass and one fail, with the exact pinned symptom of 400 against an asserted 200 and validation_failed from requireQuantity. Three qualifications: the decomposer emitted four MSPs rather than three, inventing a unit whose fileScope touches a file both original items declared out of scope; the run stalled with that invented unit parked NeedsHuman and both coupled units blocked behind it; and pass 1 ran 41 minutes reaching zero Execute dispatches.

## Options

- Read the pass on dependsOn as evidence the coupling problem is handled
- Record the split verdict: model judgment is strong, the surrounding machinery is what fails, and review is load-bearing
- Discount the result because the run never shipped

## Outcome

Record the split verdict. The intelligence layer performed well and is not the problem: it found a dependency no static mechanism in this engine could have found, since none of them run. The failures around it are mechanical, being Inflation past the declared scope boundaries, a stall at Prep, and no ship. The strongest positive of the audit sits here too and must not be lost: the plan reviewer rejected the invented unit twice and escalated to NeedsHuman rather than approving, citing a false coverage claim and a real parallel-safety hazard where sibling tasks mutate a shared guard outside declared scope and revert with git checkout. The review layer caught a hazard the decomposer created, which means review is load-bearing rather than ceremonial and should be preserved in any simplification.
