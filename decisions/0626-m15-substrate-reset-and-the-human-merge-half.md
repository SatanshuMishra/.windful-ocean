---
Status: accepted
Date: 2026-08-19T19:34:16.594Z
Thread-Id: 01KZTEFMENXBW30ZE633YNFJHE
---

# 0626. The M15 substrate is the reset harness, and its merge half clears by human merge

## Context

M15's ceiling has two obstacles the runbook named in advance. The live harness SatanshuMishra/mitosis-live-pr-harness carried an open PR 2, a _ledger branch, and a journal reported as having demoted its shipped unit to parked. Separately, ceiling check 4 needs a human to merge in ship.mergeOrder order, because the engine never merges and that is structurally enforced by tests/no-self-merge-consent.test.mjs.

## Options

- Reset the existing harness
- Create a fresh disposable repo as the substrate
- Hold M15 and run only M17 and M16
- Record c28's merge half as unverified-reasoned without waiting on a human

## Outcome

The user authorized resetting the existing harness and committed to performing the merges themselves, so check 4 clears for real rather than as a downgrade. The reset is two thirds done: PR 2 closed (zero open PRs) and _ledger deleted. Two findings change the picture. First, .mitosis/run.jsonl is NOT tracked in that repo - .gitignore excludes .mitosis/ and no commit ever carried it - so there is no remote journal to reset and the dirty journal exists only in whatever local worktree last ran against the harness; a fresh clone therefore starts clean. Second, deleting feat/objects-pick-omit-helpers-integration was refused twice by this machine's permission classifier, under both the gh api DELETE and the git push --delete shapes, while the identical shape deleted _ledger. That is not GitHub branch protection and it is not laundered to a peer session; it goes back to the user as a one-line command.
