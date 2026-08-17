---
Status: accepted
Date: 2026-08-17T05:34:41.065Z
Thread-Id: 01M04HH9W6HVPQJDPW24WH48GC
---

# 0506. Update plugins first then clean; reclaim 110 MB and accept 27 MB pinned by a dead worktree

## Context

Report Open 7 recorded plugin cache bloat without proposing a fix. Measurement found 243 MB total under ~/.claude/plugins, of which 137.6 MB is stale version directories - logbook holds six versions at 130 MB, superpowers four, security-guidance and warp two each. No built-in prune exists for this: `claude plugin prune` removes unused transitive dependencies, a different concept, and updates simply leave the prior version directory behind permanently.

## Options

- Clean first, then update - rejected, the update immediately creates a new stale version and a second pass is needed
- Update all plugins first, then clean once
- Leave it - rejected, nothing reclaims these directories and they accumulate on every upgrade

## Outcome

Update first, then clean, in one pass. Reclaim the 110.4 MB that carries zero references. ACCEPT the remaining 27.1 MB: security-guidance 2.0.6 and logbook 0.2.4 are pinned in Claude Code's own installed_plugins.json under a project scope for a worktree that no longer exists on disk. The pins are already inert - nothing can resolve that project path - and hand-editing a state file we do not own to recover 27 MB is a bad trade against the first pillar.

Two operational constraints, both of which would cause damage if missed. Eight ledger worktrees under plugins/data/ are REAL git worktrees of this repository; two are orphaned but still registered, and a raw rm -rf on those leaves dangling admin entries and corrupts repo state. They go through `git worktree remove` then `git worktree prune`, never a delete. Separately, updating plugins changes superpowers, which is the package whose skill-preload behaviour this architecture depends on - so record which version any preload measurement was taken against.

A finding that outlives the cleanup entirely, and matters more than the disk: claude-plugins-official is a GCS snapshot rather than a git repository, and the SessionStart drift detector skips any marketplace whose git rev-parse fails. Ten of the fifteen enabled plugins are therefore permanently invisible to it. It reports no updates available because it never looked - the third instance in this thread of a check that cannot distinguish "nothing wrong" from "did not look".
