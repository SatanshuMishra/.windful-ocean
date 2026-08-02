---
Status: accepted
Date: 2026-08-02T22:38:10.740Z
Thread-Id: 01KYR405KFXHM15J5XXK5BXTVT
---

# 0209. The live ledger is the _ledger git ref; plugin-data copies are stale and produced a false BLOCKING finding

## Context

During M7 the plan-audit agent raised its single BLOCKING finding: that the plan had fabricated a citation to Decision 0207, because "the ledger runs 0001 through 0206 only". It had read .claude/plugins/data/session-continuity-inline/.../ledger-worktree/decisions/, a stale checkout left by an older plugin. The live ledger is a git ref: git ls-tree -r _ledger --name-only lists 0205, 0206, 0207 and 0208, and git show _ledger:decisions/0207-m4-relands-on-main-by-cherry-pick-after-a-split-merge.md returns the accepted record. The plan's citation was CORRECT. Had the finding been actioned, the ship agent would have rewritten a correct citation into a wrong one (0172 is P2's re-land, a different event) and shipped it in a PR body that freezes at creation. Decision 0202 already fixed the READ PATH; what was missing was that stale copies exist on disk and an agent will find them.

## Options

- Treat the audit's finding as authoritative and correct the citation to 0172 - would have shipped a fabricated citation in a frozen PR body
- Refute by direct measurement against the _ledger ref and record the stale-copy hazard as a standing risk
- Delete the stale plugin-data ledger worktrees - out of scope and a destructive operation requiring explicit confirmation

## Outcome

REFUTED by measurement. The _ledger git ref is the ONLY authority for decision records; any decisions/ directory under .claude/plugins/data/ is a stale copy and must never be read. Both the fix agent and the ship agent re-verified this independently rather than accepting the orchestrator's assertion, and the fix agent additionally observed that 0207's own Options section cites 0172 as the prior pattern it reaffirms, proving they are two distinct events rather than one mis-numbered one. Standing consequence for every future dispatch: any subagent asked to check a decision number must be told to use git show _ledger:decisions/FILE and git ls-tree -r _ledger, and an agent claim that a decision "does not exist" is to be treated as a stale-copy read until proven otherwise. The stale worktrees were NOT deleted.
