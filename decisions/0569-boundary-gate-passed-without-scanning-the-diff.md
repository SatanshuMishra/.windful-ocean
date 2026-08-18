---
Status: accepted
Date: 2026-08-18T05:57:19.586Z
Thread-Id: 01KZTEFMENXBW30ZE633YNFJHE
---

# 0569. The boundary gate reported clean while producing no per-unit census

## Context

Predicted before the run from a reading of the call chain: nothing moves the repository's own checkout between Execute and Integrate, and the gate base never advances for a first-pass unit, so the gate compares the base branch against itself. The live run is consistent with that prediction. Integrate reported the shipped unit integrated with boundaryFixes zero, and the boundary directory was created at .mitosis/boundary/c28e0001 but holds no per-unit census artifacts at all.

## Options

- Read a green Integrate as proof the change cleared a real boundary scan
- Treat the green as proof only that the gate executed

## Outcome

Filed. A green Integrate at this commit is evidence the gate ran, not that it scanned the diff, so it must not be cited as verification of a change. Confirming this properly needs a deliberate lint violation introduced into a unit to see whether boundaryFixes or the parked count moves; that experiment was not run here and the finding stays at that confidence.
