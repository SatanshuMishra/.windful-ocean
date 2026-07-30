---
Status: accepted
Date: 2026-07-30T05:40:12.229Z
Thread-Id: 01KYR405KFXHM15J5XXK5BXTVT
---

# 0113. Worktree cleanup is guaranteed by an engine-external SessionStart reaper; lands as step 0

## Context

User: worktrees are never definitively cleaned up, branches stay open on pivot or session end, cleanup becomes a large manual task. Requirement verbatim - immediate OR deferred to end of feature, but cleanup MUST be guaranteed. Fable audit 2026-07-30 established ground truth.

## Options

- External unconditional sweep, git worktree list as the only registry
- Creation-time registry of owner and disposal rule plus a reaper
- In-run reaper verb plus an engine wind-down phase

## Outcome

EXTERNAL SWEEP, APPROVED. One worktree-reap verb on mitosis-git.mjs plus one unconditional SessionStart hook line; two moving parts. GROUND TRUTH: every removal site lives inside the run's happy sub-path - mitosis.js:1183 fires only if every branch merged cleanly (any task failure halts the wave BEFORE merge, so all siblings survive); :1216 is step 6 of a prompt whose steps 2-5 fail closed; :2371 undoCommandFor worktree-add is DEAD CODE, no such effect is ever registered; the run ends at :4851 with no wind-down; .claude/hooks/ has ZERO worktree grep hits. The per-MSP integration worktree at :1180 has NO REMOVAL SITE ANYWHERE - it leaks once per MSP per run even on total success. MEASURED: 12 leaked worktrees, 78 MB, 0 open PRs, 8 provably dead, 1 (hermetic-guard-test) holding an UNCOMMITTED modified tracked file .claude/hooks/tests/protect-claude-config.test.mjs; 8 merged-but-locally-unmerged squash-artifact branches, ~8 never PR'd, ~12 stale remote. STAKES: a leaked worktree holds its branch CHECKED OUT and git refuses branch -f or rebase on such a branch, which is exactly what relaunch and restack do from the main repo (:4265-4275, :4535-4545, :4653-4663) - the leaks are a live tripwire under step 4, not clutter. WHY EXTERNAL IS THE GUARANTEE: anything in-run inherits the run's mortality, the precise failure that produced the 12 leaks; SessionStart fires however the last run died and completes BEFORE the conversation acts, so it also un-wedges relaunch. Registry rejected - the native EnterWorktree tool cannot write the record and non-engine worktrees are the ENTIRE observed leak. Classification first-match-wins over two reapable roots, all else exempt by path: prunable to prune; dirty to ASK with a ready command; HEAD touched under 60 min to skip; engine root clean to reap; open PR to keep; merged tip to reap worktree only; never-PR'd to keep and report; gh unavailable degrades to keep. NEVER deletes a branch - stale branches surface as ONE git branch -D line that the existing gate at block-destructive-bash.sh:79-80 turns into one human confirm. ~/.claude/projects/ residue OUT OF SCOPE. RESIDUAL HOLES: leaks persist until the next session start; dirty trees are nagged, never auto-removed, so the guarantee is disposition-or-nag; a branch amended post-squash-merge nags forever.
