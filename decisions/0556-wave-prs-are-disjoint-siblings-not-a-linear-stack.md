---
Status: accepted
Date: 2026-08-18T02:01:16.616Z
Thread-Id: 01M04HH9W6HVPQJDPW24WH48GC
---

# 0556. The four wave PRs are file-disjoint siblings on the substrate, landed after one parent-branch deletion

## Context

The resume brief declared the merge order PR 204, then U4.1, U4.2, U5.1, U5.2, and carried the stacked-PR hazard as a watch-out, which reads as a four-deep chain each needing its own parent-branch deletion. Measurement contradicts the chain. All four wave branches were cut from the same substrate commit 91eac3d2 and their own commits touch pairwise disjoint file sets: U4.1 adds four agents plus four specs, U4.2 three, U5.1 modifies five existing agents plus five specs, U5.2 one agent plus one spec plus research.md. A uniq -c over the union of all four returns no file touched twice. Their copies of agent-spec-store.mjs are byte-identical to the substrate tip, so nothing has diverged. Two repository facts settle the rest: delete_branch_on_merge is false, so no deletion happens automatically, and the recent comparable landings (PRs 200, 202, 203) are two-parent merge commits rather than squashes.

## Options

- Linear four-deep stack, each wave PR based on the previous, four sequential parent-branch deletions
- Four sibling PRs all based on feat/agent-generator-substrate, one parent deletion retargeting all four
- Four PRs based on main directly, no retarget needed
- One combined PR for all four units

## Outcome

Four sibling PRs, all based on feat/agent-generator-substrate. One deletion of that branch retargets all four to main at once, so the stacked-merge trap is faced once rather than four times, and the disjoint file sets mean no child needs rebasing when a sibling lands. Basing on main was rejected for the opposite reason to the obvious one: it needs no retarget, but it also removes the only structural thing forcing the substrate to land first, and a child merged early would carry the substrate content into main through the wrong unit. Basing on the parent keeps the order enforced by topology instead of by memory. The linear stack was rejected as ceremony the file evidence does not justify. Combining was rejected because the four are separately declared MSPs with separate acceptance criteria. Two consequences bind the runbook. PR 204 must land as a MERGE COMMIT, never a squash: all four children carry its commits as real ancestors, and squashing rewrites them into one new SHA that git then has to reconcile against the children's unchanged history. And the substrate worktree at .claude/worktrees/agent-generator-substrate must be removed before the branch can be deleted, because gh refuses to delete a worktree-held branch. The declared merge ORDER survives all of this untouched: it is a green-branch-invariant obligation, not a file-conflict one. U4.2's Leads route to U4.1's executing agents, and U5.x modifies agents wave 4 establishes, so landing them out of order merges references to agents that do not yet exist.
