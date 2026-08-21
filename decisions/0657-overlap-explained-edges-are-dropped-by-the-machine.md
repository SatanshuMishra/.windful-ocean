---
Status: accepted
Date: 2026-08-21T02:50:40.638Z
Thread-Id: 01KZTEFMENXBW30ZE633YNFJHE
---

# 0657. An overlap-explained declared edge is dropped by the machine, not by asking the model

## Context

Cascade parking on a model-declared prereq was reproduced offline at trunk and is unchanged by the overlap-ordering work, which never touched the schedule or park path. It is the mechanism that killed the prior billed run: one unit died on rate limits and its same-file sibling parked as blocked-by-parked-prerequisite without ever being dispatched, after its plan was already paid for. The prompt was changed to ask the model not to declare same-file dependencies, which makes run completion depend on model compliance. Compliance has a second cost: ship-plan's merged-prerequisite probe and held-prerequisite check still read the raw declaration, so a fully compliant run leaves them empty and head retirement stops firing, re-opening the stacked-base trap. The two designs are therefore both broken at the edges, and the codebase sits between them.

## Options

- Drop a declared edge that is fully explained by fileScope overlap at run-document build time, preserving the raw declaration in its own field, and move ship-plan's remaining raw consumers onto the overlap-merged graph
- Keep relying on the prompt and abort the run cheaply after the decomposer whenever the model declares a redundant edge, iterating on the prompt until it complies
- Relax the compliance criterion and run with the declared edge in place, accepting the cascade-parking risk that already killed one run

## Outcome

Drop the overlap-explained edge in the machine and complete the overlap migration in ship-plan. This implements the existing definition of dependsOn rather than contradicting it: the overlap edge already carries the ordering, so a declared edge between two overlapping units adds no semantic content and only contributes cascade parking. Overlap is computed on clean, non-glob edit sets only, so a glob-bearing scope never silently discards a genuine semantic edge. The model's raw declaration is preserved in its own field so the prompt-compliance criterion still measures the model rather than the fix. That criterion also stops terminating the lane: once completion no longer depends on compliance, a non-compliant model is a reported result, not an abort after one billed child.
