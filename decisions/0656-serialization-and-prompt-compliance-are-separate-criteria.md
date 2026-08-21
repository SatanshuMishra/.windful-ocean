---
Status: accepted
Date: 2026-08-21T02:07:04.561Z
Thread-Id: 01KZTEFMENXBW30ZE633YNFJHE
---

# 0656. Serialization and prompt compliance become separate pass criteria

## Context

The declared criterion fileScopeCollisionSerializedByClustering asserted that two units sharing an edited file are serialized, and additionally required the model to have declared no prereqs between them. Since the merge order became machine-derived from fileScope overlap, serialization holds regardless of what the model declares, so the prereq clause now asserts prompt compliance rather than serialization. Run against the real decomposer output the combined criterion returns false, because add-pad-to-strings carries a prereq on add-truncate-to-strings; that output predates the prompt change telling the model same-file units are already serialized. Whether the current decomposer complies is model output and cannot be settled without spending.

## Options

- Split into one criterion asserting serialization from the overlap-derived merge order and a second asserting prompt compliance
- Leave the two properties conflated in one criterion and accept a decompose-stage abort when the model declares a redundant dependency
- Drop the prereq clause entirely and assert serialization only

## Outcome

Split into two criteria. Neither property is dropped and no bar is lowered: serialization is asserted against deterministic machine-derived evidence, and prompt compliance is asserted on its own, so a non-compliant model fails the compliance check while the serialization claim stands. The conflated form could not distinguish an engine defect from a model that ignored its prompt, which is the distinction the measurement run exists to make.
