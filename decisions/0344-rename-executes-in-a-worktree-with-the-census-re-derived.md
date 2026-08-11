---
Status: accepted
Date: 2026-08-11T19:07:55.804Z
Thread-Id: 01KZS3HZHY8T9JTPQS3CGH29T9
---

# 0344. The rename executes now in a child thread and a worktree, with the blast radius re-derived rather than trusted

## Context

0340 decided the rename and enumerated its blast radius as 17 load-bearing path strings across 12 files, but scoped execution to a branch outside the SPEC B thread, whose criteria forbid implementation. The user sequenced the reorganization FIRST, as the stated prerequisite to updating mitosis, and asked for a dedicated orchestrator subagent to carry it. Two standing constraints govern how it may run. The primary checkout must never switch branches, because live config entries resolve through ~/.claude/current into a release directory rather than the working tree, so a branch switch in place is the one move that can desynchronize live config from the repository. And this repository's own testing rule forbids a pinned count standing in for a census - re-using 0340's 17 as a worklist is exactly the change-detector-in-a-census-costume that rule names, since the tree has moved since the audit ran.

## Options

- Execute now in a child thread and a git worktree, re-deriving the census from the current tree - chosen
- Execute inside the SPEC B thread
- Apply 0340's 17-site enumeration directly as the worklist
- Defer the rename until after the SPEC is written

## Outcome

A child thread of SPEC B owns the execution, so SPEC B's no-implementation criterion stays intact and this work carries its own definition of done. The work runs in a git worktree; the primary checkout stays on main for the duration. 0340's 17 sites become a CROSS-CHECK, never the worklist: the orchestrator re-derives the census over the current tree, halts on anything it cannot classify, and explains every difference from 17 rather than absorbing it - a site that has appeared since the audit is the exact failure this ordering exists to catch. The rename stays a pure move with zero behavioural change, all path strings changing in the same commit, because a release that ships with a dangling path breaks the moment cutover flips. Phase 2 - subdividing lib/mitosis into engine, recovery, git and gates - remains deferred per 0340, since 0325's Node host makes several of those files moot and renaming files scheduled for deletion is waste. Verification is by execution, not inspection, and anything not actually run is disclosed as not run on the pull request.
