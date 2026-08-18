---
Status: accepted
Date: 2026-08-18T04:59:39.479Z
Thread-Id: 01M04HH9W6HVPQJDPW24WH48GC
---

# 0560. Waves 4 and 5 recovered as one integration pull request after four merged into a live base

## Context

The stacked-merge trap fired exactly as the runbook warned. PR 204 merged into main at 02:58:24. PRs 205, 206, 207 and 208 were merged 10 to 52 seconds later, while feat/agent-generator-substrate still existed. GitHub retargets a stacked child onto the trunk ONLY when its base branch is deleted, so all four merged into the just-orphaned base, reported MERGED, and none of their content reached main - confirmed by git merge-base --is-ancestor, which puts 204 on main and the other four off it. A second fault sat underneath: 205 and 206 merged at their stale heads 58001480 and 58b25266, because GitHub never registered the final pushes onto those PR records, so the two pointer-scoping commits f4699710 and a0d112bd existed only on their own branches. Landing the substrate as it stood would have turned main red, since executing-agent-specs.test.mjs and lead-agents.test.mjs resolve plugin pointers through a manifest no runner has. Nothing was lost: all thirteen agents and thirteen specs sat on the substrate branch at 9312e1ea, one merge from main, and both missing commits merged cleanly on a dry run.

## Options

- One integration PR from the substrate branch to main carrying all four units
- Four new PRs, one per wave branch, retargeted to main and merged in the declared order
- Cherry-pick the two missing commits onto main directly
- Reset the substrate branch and rebuild the stack

## Outcome

One integration pull request, PR 210, from feat/agent-generator-substrate to main, after merging the two missing pointer fixes into that branch first. The per-unit record survives: PRs 205 through 208 are merged, and their Merge pull request commits remain ancestors in history, so the MSP decomposition is preserved in the graph rather than erased. Atomic landing also satisfies the green-branch invariant MORE strongly than the original sequential plan: main never sees an intermediate state where U4.2's Leads exist without U4.1's executing agents, which was the entire reason the merge order was declared. Four fresh PRs were rejected as four more CI rounds that reintroduce the ordering hazard while leaving the substrate branch divergent and needing disposal anyway. Cherry-picking was rejected because it would duplicate commits already reachable from the branch and leave two versions of the same change in history. The implementer asserted both fixes present with merge-base rather than inferring it from a silent merge, and proved they are load-bearing by restoring both test files to their pre-fix parents and watching each exit 1 under a manifest-less HOME. One measurement to carry forward: the retirement census run from a linked worktree resolved through git commondir and censused the PRIMARY checkout, so its exit 41 is not a verdict on any branch - the same commondir hazard that makes three gate verbs worktree-blind.
