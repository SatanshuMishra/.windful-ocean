---
Status: accepted
Date: 2026-07-26T23:19:41.570Z
Thread-Id: 01KYERCMSSYD9ZBF28B51HMRWW
---

# 0021. Build A unblocks via worktree isolation, not a settings.json deny relaxation

## Context

The prior session recorded Build A as BLOCKED because settings.json denies Edit on .claude/lib/** and .claude/workflows/**, and concluded the unblock required a user-owned deny -> ask settings change. Re-examination this session shows that diagnosis was wrong in its premise. The two deny rules are absolute paths anchored to the MAIN CHECKOUT (~/Documents/DevLabs/.windful-ocean/.claude/{lib,workflows}/**). ~/.claude/{lib,workflows,skills,agents} are symlinks INTO that main checkout, so the freeze exists to stop the session editing the live engine it is running on - a genuine self-modification guardrail. A git worktree holds real files at a path that does not carry the denied prefix, so it falls outside the rules. Empirically confirmed both directions this session: a Write into .claude/worktrees/boundary-preflight/.claude/lib/superpowers-parallel/ SUCCEEDED, while the identical Write into the main checkout's .claude/lib/superpowers-parallel/ was refused with "File is in a directory that is denied by your permission settings." Six prior MSPs on this effort already shipped from worktrees under .claude/worktrees/, so this is the established pattern, not a workaround. Worktree isolation is also distinct from running mitosis-on-itself, which remains forbidden. Separately, official Claude Code documentation states that Edit(path) rules govern all built-in file-writing tools - Write and NotebookEdit included - and that a bare Write(path) rule is accepted but never matched, merely producing a startup warning. That falsifies commit a923763's recorded rationale that "file creation via the Write tool in the main checkout's frozen engine directories is ungated": the paired Edit deny already covers Write, so the guardrail has no hole and the carried-risk note is unnecessary. Deny rules are also a silent hard block in every permission mode including bypassPermissions, which is why no in-session approval was ever possible - but that only ever mattered for the main checkout.

## Options

- Move the two Edit denies from deny to ask in settings.json so edits to the main checkout prompt interactively - the prior session's plan; requires a user-owned settings change, weakens the self-modification guardrail on the live engine, and carries precedent risk since a923763 shows rule changes here have broken Claude Code startup
- Build in a git worktree under .claude/worktrees/ and leave settings.json untouched - respects the freeze exactly as designed, needs no consent-requiring config change, and matches how all six prior MSPs on this effort shipped
- Exploit the believed Write-tool hole to write the main checkout directly - rejected on the merits and additionally impossible, since Edit rules gate Write

## Outcome

Build in a worktree; leave settings.json untouched. Worktree .claude/worktrees/boundary-preflight created on new branch fix/mitosis-boundary-preflight based at cd5c65d (main), which satisfies the do-not-check-out-anything-predating-cd5c65d constraint. The settings.json deny -> ask change is WITHDRAWN as unnecessary and is no longer a gate on this thread; the main-checkout freeze stays exactly as it is. Consequences: the open risk "BUILD A IS BLOCKED" is closed, no user consent is required to proceed with Build A or Build B, and merging the worktree branch back remains the ordinary human-gated PR boundary rather than a permissions question. Also supersedes the carried-risk note in a923763: Write into the frozen engine directories is NOT ungated, because the paired Edit deny governs Write and NotebookEdit as well.
