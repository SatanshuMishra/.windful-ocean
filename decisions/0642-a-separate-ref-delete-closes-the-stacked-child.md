---
Status: accepted
Date: 2026-08-20T07:01:20.013Z
Thread-Id: 01KZTEFMENXBW30ZE633YNFJHE
---

# 0642. Deleting a merged parent branch as a separate step closes the stacked child instead of retargeting it

## Context

The engine emitted a correct serialized merge order, with the third unit based on the first unit's head and the parent flagged deleteAfterMerge. Executing that hand-off, the parent was squash-merged and its branch then deleted through a separate api ref delete, exactly as the runbook's step 7 worded it. The child pull request would not merge afterwards.

## Options

- Treat the CONFLICTING verdict as real and resolve the conflict by hand
- Reopen the closed child - impossible, its base no longer exists
- Open a fresh pull request from the same head against the trunk through pr-create with --supersedes

## Outcome

The child was not conflicted, it was CLOSED: its timeline carries base_ref_deleted and closed at the same second, its base still names the deleted branch, and merged is false. Retarget happens only when the deletion rides along with merging the parent's own pull request, so the runbook's separate-deletion wording is the defect and is now corrected in place. The CONFLICTING verdict was a phantom computed against the dead base - git merge-tree returned a clean tree, the real merge exited 0 and the trunk stayed green at 38 tests. Recovery was a fresh pull request from the same head against the trunk, opened through pr-create with --supersedes. This is a hand-off wording defect, not an engine defect; the engine's merge order was correct.
