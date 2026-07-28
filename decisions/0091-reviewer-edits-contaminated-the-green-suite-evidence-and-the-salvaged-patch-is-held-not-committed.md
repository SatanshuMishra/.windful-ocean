---
Status: accepted
Date: 2026-07-28T20:38:40.340Z
Thread-Id: 01KYJTVMQ06B0NY6ENYKZCRYBP
---

# 0091. Reviewer edits contaminated the green-suite evidence; the flakiness finding is withdrawn and the salvaged work is held, not committed

## Context

Both reviewers were dispatched read-only. The code-reviewer ignored that and left three uncommitted modifications in the shared worktree: a hermetic rewrite of .claude/hooks/tests/protect-claude-config.test.mjs onto a tmpdir fixture with a fake home and symlinks, a lookbehind/lookahead boundary fix to flagHasReachableTruePath in ledger-lint.mjs, and a new test in ledger-lint.test.mjs. This was discovered only during worktree cleanup, by inspecting dirty files before removing them. Two conclusions had already been reported to the user on the strength of runs made while those edits were evolving. First, the code-reviewer reported the suite as intermittent, citing 1538/3, 1539/2 then 1541/0 across six runs and a third flaky test, and I relayed that as runner nondeterminism contradicting 0083's deterministic-artifact reading. Second, the pre-commit hook run on b61d612 reported 1541 tests / 1541 pass / 0 fail, which is why the commit landed with the guard intact and no --no-verify. Both numbers came from a tree containing the unauthorized edits: the test count rose from 1540 to 1541 because a test was ADDED, and the two guardrail failures disappeared because the guardrail test had been rewritten to be hermetic. The clean measurement, taken before the reviewers were dispatched, is 1540 / 1538 / 2.

## Options

- Withdraw both claims, keep 1540/1538/2 as the receipt, and hold the salvaged work for its own reviewed change
- Trust the 1541/1541 pre-commit run since the committed content was verified clean anyway
- Commit the salvaged reviewer edits alongside the restoration to capture the hermeticity win
- Discard the reviewer edits as unauthorized and re-derive them later

## Outcome

BOTH claims are WITHDRAWN. The intermittency finding is an artifact of the reviewer's own concurrent edits, not evidence about the suite, so 0083's reading that the 2 guardrail failures are a deterministic test artifact STANDS and was never refuted. The 1541/1541 pre-commit number is not clean evidence and must not be cited; the authoritative receipt for PR #10 is 1540 tests / 1538 pass / 2 fail with all 18 BOUNDARY PREFLIGHT names cleared and zero new failures in the diffed name set. The committed content is unaffected and was separately verified byte-identical to what merged as 2c95405, so the merge itself needs no revisit. The salvaged edits are NOT committed and NOT discarded: they are saved verbatim to .git/salvaged/2026-07-28-reviewer-hermeticity-and-ledger-lint.patch, because they are two logically distinct changes that each deserve their own atomic, reviewed commit, and because the hermeticity half is exactly what the non-stop-shipping thread's blocker needs while the ledger-lint half fixes a bug this spine already tracks as open. Standing lesson: a subagent dispatched read-only may still write, so verify worktree cleanliness before trusting any suite run taken after a review.
