---
Status: accepted
Date: 2026-08-17T15:24:21.582Z
Thread-Id: 01M04HH9W6HVPQJDPW24WH48GC
---

# 0521. Stack pull requests for blocked MSP chains, with mandatory parent-branch deletion before each child merge

## Context

Wave 3 is a strictly linear chain: U3.1 to U3.2 to U3.3 to U3.4, each unit consuming the previous unit's code. Merging is human-gated and denied to the session at two layers (settings.json deny list and the bash gate), so serializing on merges would stall the whole wave behind four human round-trips, defeating the autonomy the user asked for. This repository has already been burned by stacking once: PR 162 was opened against a feature branch and had to be closed and reopened as PR 167 against main.

## Options

- Serialize on merges: build one unit, wait for the human to merge it, then build the next. Safe but needs four human round-trips per wave.
- Stack the chain: each child branches off its parent and its pull request targets the parent branch, so building continues without waiting for any merge.
- Build the whole chain as a single pull request, abandoning per-unit MSP shipping and its per-unit acceptance.

## Outcome

Stack the chain. Each wave-3 child branches off its parent and targets it as the pull request base, so work continues without waiting for a merge. The merge protocol is mandatory and ordered: merge the parent, delete its branch, CONFIRM the remote ref is gone with git ls-remote, confirm the child retargeted onto main, re-run the child's CI because its base changed and prior green is stale, and only then merge the child. GitHub retargets a child onto the trunk ONLY when the base branch is DELETED; merging a child while its merged parent branch still exists makes it merge into a dead branch, report MERGED, and never reach main. Any worktree holding a stacked branch is removed first, because gh refuses to delete a worktree-held branch and the local delete can fail silently while the remote survives. Wave 2 stays FLAT on main: U2.1 and U2.2 are additive and mutually independent, so stacking them would add the retarget hazard for no gain.
