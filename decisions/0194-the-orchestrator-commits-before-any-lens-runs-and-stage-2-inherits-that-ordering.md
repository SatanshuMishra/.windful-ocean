---
Status: accepted
Date: 2026-08-02T03:16:28.406Z
Thread-Id: 01KYR405KFXHM15J5XXK5BXTVT
---

# 0194. The staged work is committed by the orchestrator BEFORE any verification lens runs, and Stage 2's workflow inherits that ordering rather than repeating the do-not-commit instruction

## Context

0191's durable output was a harness lesson: NEVER place a lens that measures committed state before the phase that commits. The M5 workflow instructed its implementer and both remediation rounds not to commit, then ran the receipt lens in pull_request mode against an empty merge-base..HEAD, got exit 1 for a staged-but-uncommitted receipt, and burned an entire remediation round on a condition it had manufactured itself. The lesson named two fixes: move the receipt lens after Ship, or have the implementer commit. Entering this session the 12 paths were still staged and uncommitted, carrying 3.55M tokens of verified work that any stray checkout, reset, stash or clean would destroy, and the receipt's own M1 row named the commit as an open landing obligation owed by whoever lands the work. A competing consideration pushed the other way: the receipt's M6 row contains a sentence that is false ('the staged set is empty' while 12 paths were staged), so committing meant knowingly committing a false sentence and fixing it in a follow-up commit.

## Options

- Commit the 12 staged paths immediately, before the audit and before any lens runs
- Dispatch a subagent to fix the false M6 sentence first, then commit a complete receipt in one commit
- Leave the work staged through the audit and commit only as part of Stage 2's Ship phase
- Commit only the production change and hold the coverage receipt back until its rows are final

## Outcome

COMMIT FIRST, FIX THE RECEIPT ROWS IN A FOLLOW-UP COMMIT ON THE SAME BRANCH. Landed as ba981cc before either auditor was dispatched. Asset protection dominates on the Quality pillar: a false sentence in a receipt is a defect to be fixed, whereas losing the staged tree is unrecoverable without ~3.5M tokens of rework, and the branch squash-merges so the published history is unaffected by the extra commit. Three things were bought by committing first, each measured rather than predicted. The pre-commit hook ran the full suite and returned 1845 pass / 0 fail, giving this session a FIRST-HAND suite baseline instead of a cited one. invariant-coverage-check --event pull_request --base-ref main went exit 1 to EXIT 0, discharging the M1 row's open landing obligation outright. And 0191's findings 3 and 4 dissolved, which is the harness lesson demonstrated live rather than argued. REJECTED the fix-first option specifically because it inverts the risk: it holds the asset uncommitted across a subagent edit to buy tidiness in a commit that gets squashed anyway. REJECTED holding the receipt back, because the gate cannot see untracked or staged-only paths and the M1 row is explicit that the receipt must land in the SAME commit as the production change - splitting them recreates the exact failure the row warns about. THE RULE STAGE 2 INHERITS, and it is the reason this is a decision rather than a step: the do-not-commit instruction is NOT to be repeated. Stage 2's implementer commits its own work, and any receipt or coverage lens runs AFTER that commit, never before. A workflow that verifies committed state before its own commit phase manufactures its own blockers, and this thread has now paid for that lesson twice.
