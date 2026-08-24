---
Status: accepted
Date: 2026-08-24T04:47:24.670Z
Thread-Id: 01M0RZP75VCZJPP2R127YBFK3Z
---

# 0703. The trunk is greened before the import is cut, not after

## Context

The import takes its tree from the host repository's default branch. That branch went red when a change introduced a bare clock read into the engine, which the engine's own determinism lint bans; the assertion fires in two separate test files. The first unit's acceptance criterion does not test the suite and its declared unproven field already says the suite does not pass, so the unit could import a red tree and still meet its ceiling. The question was whether it should. A separate finding removed one apparent blocker: a second workflow that also looked red was proven non-deterministic by two runs over a byte-identical tree, one failing and one passing, so only the determinism violation is a real defect.

## Options

- Fix the trunk first, then cut the import from a green default branch
- Cut the import now from the red default branch and let the decoupling units absorb the violation
- Cut the import from the last commit whose checks passed, bypassing the default branch

## Outcome

Fix the trunk first. The violation is a real defect that would otherwise be frozen into the new repository's root commit, and the later units inherit their baseline from it: the vacuity guard's criterion is that a mutation makes the lane exit non-zero, which proves nothing against a lane that was already failing. Importing from the last passing commit was rejected because it deviates from the binding rule to import from the default branch and would silently drop a worktree-reclaim fix from the extracted engine. The trunk needs fixing whether or not the extraction happens, so the cost is a scheduling delay of about one continuous-integration cycle rather than added work.
