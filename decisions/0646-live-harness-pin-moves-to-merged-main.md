---
Status: accepted
Date: 2026-08-20T17:36:52.178Z
Thread-Id: 01KZTEFMENXBW30ZE633YNFJHE
---

# 0646. The live harness pin moves to the merged main tip, and the merge-order shape declaration gains the retarget key

## Context

Pull request 255 merged and its content is on main, verified by reading ship-plan.mjs at origin/main rather than by the MERGED label: retargetBeforeDelete is emitted there. The live harness was still pinned to b70536fc, which predates the fix, so a run at that pin could not exercise the retarget emission at all. c43's own criterion made the shape declaration update conditional on the pin moving, and the pin has now moved.

## Options

- Leave the pin at b70536fc and accept that the live run never exercises the merged fix
- Move the pin to the fix commit fad831c4 rather than the merge commit
- Move the pin to origin/main's tip b55025dc and update the declared merge-order element shape in the same change

## Outcome

The pin moves to b55025dc, main's tip, so the run exercises exactly what ships rather than an isolated fix commit. declared-terminal-states.json's mergeOrderElementShape gains retargetBeforeDelete, because the comparator compares the sorted key set exactly and the engine emits that key unconditionally on every entry, holding an empty array when a unit has no stacked child. The comparator does not look inside the key, so the retarget content is read from the run output as evidence rather than declared as a new gate. A read-only blast-radius pass established that cli.mjs and run-store.mjs are byte-identical across the pin move, so no argv, run-key, lock or .mitosis layout drift exists, and that the live dispatch path still spawns the real billed binary because the recent test-side dispatch binding never reaches production code.
