---
Status: accepted
Date: 2026-08-23T17:55:52.127Z
Thread-Id: 01M0QTN4YG3SWPQ1EMFT85M1K3
---

# 0682. Park on a collection refusal rather than dispatching a child with nowhere to stand

## Context

The last billed run recorded a dispatch failing in 63 milliseconds with a message identical to the one Node emits for a missing binary, which framed it as a path problem. It is not. The binary resolved and spawned successfully seven times in the same run under the same environment. Node emits the same string when the WORKING DIRECTORY does not exist, and that is what happened: the boundary gate could not collect the sides it compares, so no worktree was ever created, yet the engine still dispatched a boundary-fix child into the head worktree path. An early-park guard exists but matches only the not-comparable classifier, while a collection refusal carries a different one, so the code falls through. The unit parked, the ship phase received an empty set, and no pull request opened. The upstream trigger was the harness kill landing inside a git worktree add, leaving a worktree locked as initializing that the engine's reclaim refuses to lift on the false premise that the run never locks a worktree.

## Options

- Check that the working directory exists before dispatching the fix child
- Extend the early-park guard to catch a collection refusal and park with the refusal text
- Repair the worktree reclaim so it can lift a lock that git set during an interrupted add

## Outcome

Extend the guard. A collection refusal means the gate produced no findings and built no tree, so there is nothing for a fix child to repair and nowhere for it to run; dispatching one is unconditionally wrong on that path, and it converts a clear refusal into a misleading spawn failure while spending a real billed child. Checking directory existence is rejected as treating the symptom while still hiding why the gate refused. Repairing the reclaim is rejected for this unit of work, not on the merits: it is a genuine defect with a wider blast radius, and it would not prevent the bad dispatch on the other collection-refusal paths such as a disk error or a stale-head clearing failure. It is filed rather than folded in. Note the interaction with the crash-point fix: once the harness stops killing a quiesced engine, the gate completes and this defect goes latent rather than firing, so this change is insurance against a misdiagnosed run rather than the thing that unblocks shipping.
