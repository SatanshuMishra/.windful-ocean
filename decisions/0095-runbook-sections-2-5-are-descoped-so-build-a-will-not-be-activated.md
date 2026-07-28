---
Status: accepted
Date: 2026-07-28T21:03:03.843Z
Thread-Id: 01KYJTVMQ06B0NY6ENYKZCRYBP
---

# 0095. Runbook Sections 2-5 are descoped by user ruling, so Build A will not be activated and two completion criteria become unachievable

## Context

User ruling on 2026-07-28: the human-applied runbook Sections 2-5 (machine user, fine-grained PAT, branch ruleset, merge-strategy decision) will NOT be performed, and are removed as blockers. This is a scope decision, not a deferral. Two of this thread's five completion criteria were written against that work and are now unachievable as stated: criterion 2 ("Runbook Sections 2-5 applied by the human ... each invariant confirmed against Section 7") and criterion 3 ("Build A is LIVE, not inert: a real mitosis run clears the merge-boundary preflight end-to-end instead of halting on it"). Criteria 1, 4 and 5 are done. Consequence for the merge boundary: with no machine user and no ruleset (live check confirms rulesets=0 and the engine authenticating as the repo owner with admin=true), the server-side boundary does not exist, so the preflight can never pass and the engine's authoritative layer-1 gate will refuse to dispatch. The control remains correct and fail-closed; it is simply never satisfiable in this deployment.

## Options

- Retroactively edit or delete criteria 2 and 3 (forbidden: the ledger's DoD gate requires criteria fixed at thread CREATION and never rewritten)
- Falsely check criteria 2 and 3 so the DoD gate passes
- Leave 2 and 3 permanently unchecked and close the thread by explicit user ruling that overrides the structural gate
- Move the residual engineering work to a successor thread and dispose of this one against the criteria that were actually in scope

## Outcome

Descope ACCEPTED and recorded. Criteria 2 and 3 stay UNCHECKED and are NOT rewritten - the DoD gate is structural and the criteria are write-once, so falsely checking them or editing them retroactively is refused. This means the thread cannot reach `done` through the normal gate; closing it requires an explicit user ruling, which is the disposition to settle in the next session. The residual live engineering work (0092 provisioning, 0093 gate relocation, 0094 worktree guard gap) is NOT covered by any existing criterion and belongs to a successor thread rather than to this one. Note 0092 changes character under this ruling: the engine halting at reconcile is no longer a temporary blocker awaiting Sections 2-5 - it is now the permanent steady state unless the preflight requirement itself is revisited.
