---
Status: accepted
Date: 2026-08-18T01:53:59.877Z
Thread-Id: 01KZTEFMENXBW30ZE633YNFJHE
---

# 0554. Ship stacks pull requests automatically and retires a merged parent branch only under a three-part proof

## Context

The user requires pull requests stacked by the engine rather than retargeted by hand on GitHub, and requires that merging one of a stack not wedge the ones above it. GitHub retargets a stacked child onto the trunk only when its base branch is DELETED; merge a child while its already-merged parent branch still exists and the child merges into a dead branch, reports MERGED, and its content never reaches the trunk.

## Options

- Flat: every pull request based on the trunk, dependents held until the prerequisite merges
- Stack and publish, but leave the parent-branch deletion to the human
- Stack, publish, restack, and let the engine delete a provably-merged parent branch

## Outcome

The engine stacks and retires. A dependent's base is its prerequisite's integration branch while that branch exists on the remote, and the trunk once it is gone; branch names are unchanged because branchToMspId parses exactly that shape and renaming would silently break resume. Retirement runs at the front of Ship, after a fresh reconcile, and deletes a branch ONLY when all three hold: mergedAt is non-null, mergeCommit is non-null, and the merge commit is an ancestor of the trunk. Under that conjunction the content is provably reachable from the trunk so deletion destroys nothing; weakening the guard makes this option strictly worse than doing nothing. A diamond dependency parks rather than guessing a base, because guessing produces a pull request whose diff silently omits one parent's work. Stated limit that must not be softened anywhere in code or output: this is design plus after-the-fact detection, never prevention. Merge is denied origin-agnostically and the engine never merges, so nothing stops a human merging out of order within one sitting before the next invocation intervenes; the emitted merge order is instruction, not enforcement.
