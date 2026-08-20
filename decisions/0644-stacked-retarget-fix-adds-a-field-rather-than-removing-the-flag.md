---
Status: accepted
Date: 2026-08-20T17:08:55.203Z
Thread-Id: 01KZTEFMENXBW30ZE633YNFJHE
---

# 0644. The stacked-retarget fix adds retargetBeforeDelete and keeps deleteAfterMerge unchanged

## Context

ship-plan.mjs:623 set deleteAfterMerge exactly when another entry stacked on this one, which is precisely the case where deleting the branch closes that child. No retarget step existed anywhere in the engine, so the emitted merge order could not be executed without stranding a unit's work.

## Options

- Remove or invert deleteAfterMerge - rejected, because a child merged while its parent branch still exists lands on a dead branch and never reaches the trunk
- Stop emitting stacked bases so the problem cannot arise - rejected, it contradicts decision 0554 and is a design change far above this defect
- Have the engine perform the retarget itself - impossible, the engine is not present at merge time and never merges per decision 0497
- Add the retarget to the emitted data and keep the deletion flag - the hand-off becomes executable without changing what the engine does

## Outcome

Pull request 255 adds retargetBeforeDelete to every merge-order entry another entry stacks on, naming the stacked units and the base each must move to. deleteAfterMerge keeps its name, position and meaning and now equals retargetBeforeDelete.length > 0. The engine emits data only and performs no retarget. The target base resolves transitively, so a three-deep stack never names a branch the same merge order also deletes - the mutation swapping the resolved base for the raw base is the test that pins it. Two mutations initially survived because no fixture had a parent with two children; closing that was treated as inside the acceptance ceiling because multiplicity and ordering were in the contract pinned before work started.
