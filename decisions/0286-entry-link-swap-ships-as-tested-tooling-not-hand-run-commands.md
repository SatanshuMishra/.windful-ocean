---
Status: accepted
Date: 2026-08-08T02:28:34.253Z
Thread-Id: 01KZCF28RN4RMR46VDXFKSQZY3
---

# 0286. The entry-link swap ships as a tested cutover verb, bundled with the guard fix and the grant correction, before any live write

## Context

SPEC A section 7 orders the cutover as build-and-validate with zero live change, then "swap every entry link in one pass", then write the receipt. Read as an operational runbook it implies the tooling exists. Measured on 2026-08-07 against main a302e4c: it does not. symlinkSync appears exactly once in scripts/config outside tests, at promote.mjs:54, where it creates current.tmp and renames it onto current; PROMOTED_ENTRIES is consumed only by its own definition in paths.mjs and by validate.mjs's coverage check. Nothing anywhere creates the ten entry links. A cutover run today would build the release, validate it, move the pointer and write a LIVE receipt recording success, while all 38 live symlinks continued resolving into the primary checkout - a receipt asserting a swap that never happened, which is worse than a failure because the receipt is what converge later trusts. Two further facts raise the bar: ~/.claude/hooks and ~/.claude/rules are real directories holding 26 and 2 per-entry symlinks, so the swap replaces two real directories rather than retargeting two links; and SPEC section 9 records that whether a pointer swap reaches an already-running session is UNMEASURED, so the swap is performed under uncertainty about who observes it mid-flight.

## Options

- Build a tested, idempotent, reversible cutover verb and bundle it with the protect-claude-config.sh receipt fix and the ln -sfn grant correction as one PR, then re-rehearse, then swap - ADOPTED
- Perform the swap by hand in the cutover session with ln and rm -rf. Rejected: it is 9 link replacements plus 2 real-directory replacements against live global config, unreviewable, untestable, with no rollback path and no second chance if the session dies mid-pass
- Extend promote.mjs to create the entry links as part of promote. Rejected: it welds a one-time migration into the verb that runs unattended from SessionStart and Stop hooks, so every future converge would carry migration code it must never execute
- Ship the cutover verb alone and defer the guard fix and grant correction. Rejected: SPEC section 9 requires the protect-claude-config.sh fix in the same change, because the cutover is exactly what breaks its worktree discovery

## Outcome

Adopted 2026-08-07. The cutover is gated behind one more shippable unit rather than attempted from the current state.

The unit carries three changes that share a single reason-to-change - they all exist because the entry links move: (1) the cutover verb itself, idempotent and reversible, replacing the 9 depth-1 links and the two real directories in one pass; (2) protect-claude-config.sh repointed at the LIVE receipt's repo_root, since after cutover it realpaths ~/.claude/CLAUDE.md into a release that is not a git worktree and silently falls through to a weaker textual match - SPEC section 9 requires this in the same change; (3) the live Bash(ln -sfn:*) grant corrected, because permissions.allow is unioned at manifest.mjs:28, so promotion PRESERVES the wrong non-atomic form rather than replacing it, and SPEC section 3 names correcting it part of this work.

Two ordering rules this locks in. The 0281 rehearsal re-runs against the sha that will actually ship: the green rehearsal validated 1e84dd1, and main is now a302e4c, so that evidence is stale by 0281's own rule that reasoning about an additive diff is not evidence. And the converge registration in live settings.json, already proven safe by rehearsal B at 28/28 resolved registrations, happens inside the same serialized cutover session rather than being left live and inert in the interval.

What this decision does NOT settle: whether settings.json ends up a promoted symlink or a real live file. That conflict between the guard's test at protect-claude-config.test.mjs:194 and 0270 must be resolved inside the unit.
