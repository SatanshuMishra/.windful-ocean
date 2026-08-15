---
Status: accepted
Date: 2026-08-15T19:20:08.141Z
Thread-Id: 01KZTEFMENXBW30ZE633YNFJHE
---

# 0441. The three defects ship as sibling MSPs off one base, with the single conflict foreseen and resolved by merge order

## Context

The three filed defects each needed their own MSP under G0, and the instruction for the run was to complete everything up to but not including the restack. Stacking them would have made each child depend on its parent's SHAs and would have needed a restack the moment any parent was rewritten, which is exactly the excluded work and the trap that burned earlier rounds. Recon established the file sets first: MSP-1 touches determinism-lint.mjs and two other files carrying raw control bytes, MSP-2 touches run-store, generate-run-script, dispatch and pr.mjs, MSP-3 touches mitosis-gate.mjs. On that reading the sets looked disjoint, so all three were cut as siblings off the same base ed5ccbb9. They were not fully disjoint in the end. MSP-3 moved the 805-line body of mitosis-gate.mjs into a new mitosis-gate-core.mjs while MSP-2 changed one line of prose inside that moved block, the first element of EXEC_ALLOWLIST_NOT_ATTESTED, corrected under G15 because the code no longer matched the text.

## Options

- Stack the three MSPs so each child carries its parent, accepting a restack whenever a parent moves
- Cut all three as siblings off one base and discover conflicts at merge time
- Cut all three as siblings, compute the conflict map up front with git merge-tree, and publish a merge order plus the exact resolution
- Drop MSP-2's one-line G15 prose correction so the file sets stay genuinely disjoint

## Outcome

Cut all three as siblings and computed the pairwise conflict map with git merge-tree before opening any pull request, which is read-only and mutates nothing. MSP-1 was clean against both others; MSP-2 and MSP-3 conflicted on mitosis-gate.mjs alone, with the shared test file auto-merging. Rather than restack, the conflict was written up in a MERGE-SEQUENCE artifact naming the order and the exact resolution, and the order was followed: MSP-1, then MSP-2 while the file still held the body, then MSP-3 last. Dropping the G15 correction to dodge the conflict was rejected as trading correctness for convenience. When MSP-3 conflicted as predicted, it was resolved by merging the updated base INTO the branch rather than rebasing, because the pull request was open and no force-push was authorized. The named hazard is that the correction is one line of prose inside an 805-line move, so any wholesale resolution drops it silently and nothing turns red, since the assertion reading it matches on the substring spawn site, which both the stale and the corrected text satisfy. It has to be grepped for explicitly; a green suite is not evidence.
