---
Status: accepted
Date: 2026-07-30T17:20:09.739Z
Thread-Id: 01KYR405KFXHM15J5XXK5BXTVT
---

# 0132. 0131's premise corrected: the capture race is fixed upstream and hand-patched into the live cache; the open defect is the missing re-validation

## Context

0131 framed the defect as a hooksPath capture race in the session-continuity plugin, to be fixed before any precondition work. Three read-only investigations re-derived the ground truth.

REPRODUCTION (600 real concurrent trials against the DEPLOYED code, throwaway repos, real unmodified installer.mjs imported by absolute path): the capture race did NOT reproduce. 300 trials with two distinct managed dirs and 300 with an identical managed dir both produced 0 self-referencing corruptions. The isManagedHooksDir + alreadyInstalled guards held every time. Concurrency instead produced git config lock errors, silently swallowed by session-start.mjs:20-24's bare catch.

WHY IT DID NOT REPRODUCE: the guard is already present in the deployed file. Provenance shows commit 2e91b33 "fix: stop capturing a managed hooks dir as continuity.priorHooksPath" on branch fix/hooks-prior-capture-across-worktrees, pushed to origin at SatanshuMishra/continuity-ledger-plugin.

THE CLOBBER HAZARD, load-bearing: installed_plugins.json records gitCommitSha 0fe1c02 for this install, and 0fe1c02 does not contain isManagedHooksDir at all. The deployed cache file's mtime (2026-07-30 01:57:52) precedes commit 2e91b33's author timestamp (02:00:52) by three minutes. The running file was HAND-PATCHED in place, outside the plugin manager's update flow. Any manager-driven refresh snaps it back to the 0fe1c02 baseline and silently reintroduces the defect. "Healthy right now" is an unversioned hand-patch, not a landed fix.

THE DEFECT THAT DOES REPRODUCE, and which 2e91b33 does NOT fix: continuity.priorHooksPath is validated only on the branch where it is about to be WRITTEN, never on the branch where it is already latched. Once the value self-references, alreadyInstalled === true short-circuits installer.mjs:105-110 on every subsequent SessionStart, forever. Proven end to end: HEALED? false after reinstall, then a real git commit succeeded exit 0 with zero stdout and zero stderr while the npm gate never ran. A false-clean gate indistinguishable from having no hooks at all.

THREE DIVERGENT COPIES, none simultaneously durable, tracked, current and complete. Deployed cache: has 2e91b33, lacks the ff5800b config-scope hardening, hand-patched, drifted from its recorded SHA. Dev repo /Users/satanshumishra/Documents/DevLabs/continuity-ledger-plugin (branch fix/pre-tool-use-guard @ 8529a9d, tracked, clean): has ff5800b, has NEVER fetched 2e91b33, and reproduces the original defect verbatim. Marketplace clone ~/.claude/plugins/marketplaces/continuity-ledger: has both, but is plugin-manager-owned infrastructure being used as a working tree.

None of these files live inside .windful-ocean. ~/.claude is NOT a blanket symlink - only named entries are symlinked, and plugins/ is not among them. The .claude/{hooks,rules,lib,workflows} per-write approval gate is therefore moot for this work.

## Options

- Edit the deployed cache again - rejected: proven to drift from its recorded SHA and to be clobbered by the next refresh; this is what created the current unversioned state
- Edit the marketplace clone - rejected as a durable home: plugin-manager-owned infrastructure sitting beside orphaned temp_git_* scratch clones, though it is the stepping stone that already pushed 2e91b33 to origin
- Pure fail-loud at install time (hard-error when the captured value would self-reference) - rejected as primary: does not touch the reproduced alreadyInstalled gap, and on an already-corrupted machine it is the bootstrap trap, bricking commits outright
- Idempotent re-validation / self-heal outside the alreadyInstalled guard, realpath-based, plus a non-blocking stderr line before the dispatcher's existing exit 0 - additive, never adds a new way to fail a commit, degrades to the empty sentinel

## Outcome

The 0131 framing is superseded. The capture race is NOT the open defect - it is fixed by 2e91b33 and is live only as an unversioned hand-patch that the next plugin refresh will silently revert. Two things are actually open: (1) reconciling the fix into the tracked dev repo so it survives an update, and (2) the reproduced missing re-validation on the alreadyInstalled path, which 2e91b33 does not address, plus the zero-output invisibility of the skip.

Edit surface is /Users/satanshumishra/Documents/DevLabs/continuity-ledger-plugin - a DIFFERENT repository from .windful-ocean, git-tracked, the user's own. Reconcile first (fetch and review fix/hooks-prior-capture-across-worktrees) before authoring anything, to avoid re-deriving 2e91b33 or diverging from it. Never hand-patch the cache again; the cache becomes correct only through a normal update cycle regenerated from source.

Rejected pure fail-loud, resolving 0131's open sub-decision: the bootstrap trap is real and Quality-over-Speed forbids a fix that can make git commit unusable on an already-corrupted machine. Adopt self-heal plus non-blocking visibility.

Sequencing consequence: this work has left .windful-ocean entirely and is cross-repo, so it no longer blocks precondition work the way 0131 assumed.
