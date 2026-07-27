---
Status: accepted
Date: 2026-07-27T22:35:45.497Z
Thread-Id: 01KYJTVMQ06B0NY6ENYKZCRYBP
---

# 0047. The stacked train integrates via merge commit with head-branch deletion enabled

## Context

Runbook Section 5 leaves the merge strategy to the human. Live repo state added a second half to that choice: SatanshuMishra/.windful-ocean has `delete_branch_on_merge: false`, and Section 5 (line 107) establishes that GitHub's auto-retarget fires on DELETION of the merged head branch, not on the merge, so the retarget cascade currently never fires here at all. All three merge methods are enabled repo-side, so the choice was unconstrained by config. Observed practice on this repo has been squash-merge, which the runbook's own table ranks worst for a stacked train.

## Options

- Merge commit + enable delete_branch_on_merge (CHOSEN)
- Squash + enable delete_branch_on_merge, matching current repo practice
- Leave delete_branch_on_merge off and defer the retarget question entirely
- Hold the decision until Sections 2-4 are applied and the ruleset is live

## Outcome

USER-LOCKED (2026-07-27): merge commit, with `delete_branch_on_merge` enabled. Rationale per the runbook's Section 5 table -- merge commit is the only strategy that preserves the parent PR's commit SHAs, so once GitHub retargets a child, the child's history already contains exactly what is now on the new base and its diff and merge-base stay clean. Zero restack cost. Accepted price: non-linear history on the base branch. Load-bearing consequence: this KEEPS Build B / the restack verb cut per decision 0027 -- squash or rebase would have made it mandatory, since both discard the parent SHAs and force every child down the train to be explicitly rebased. Two human actions follow, neither agent-performable: flip `delete_branch_on_merge` to true in repo settings, and merge train PRs with the merge-commit method. Standing caveat carried from the runbook: multi-hop retarget cascade through a stack deeper than one parent-to-child hop is `[unverified]` -- GitHub's docs are silent on it across every page checked.
