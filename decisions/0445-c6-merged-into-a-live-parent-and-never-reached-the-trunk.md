---
Status: accepted
Date: 2026-08-15T20:22:08.118Z
Thread-Id: 01KZTEFMENXBW30ZE633YNFJHE
---

# 0445. C6 merged into a live parent branch and never reached the trunk

## Context

PR #121 (C5b) merged into feat/mitosis-os-process at 20:04:33 on 2026-08-15, moving the base to 812ab2c1. PR #122 (C6) merged ELEVEN SECONDS later, at 20:04:44, into feat/c5b-coupling-parity - its declared base, which had not been deleted. GitHub retargets a child onto the trunk only when the parent branch is DELETED, so no retarget happened. #122 reports MERGED and its merge commit fdf3817b sits on feat/c5b-coupling-parity. The stack base does not contain boundary-gate.mjs and 82a8d2fe is not an ancestor of it. This is the exact trap already recorded against PR #113 and written into receipts.md; the guidance existed and the merge order still defeated it, because the two merges were seconds apart and the delete step sits between them.

## Options

- Merge feat/c5b-coupling-parity into the base to carry C6 along with the already-landed C5b payload
- Open a fresh PR from feat/c6-boundary-program onto feat/mitosis-os-process - chosen
- Cherry-pick C6's twenty commits onto the base by hand

## Outcome

Nothing is lost: feat/c6-boundary-program still holds the full restacked C6 at 82a8d2fe, and C5b's tip 15993c20 is already an ancestor of the base via #121, so a fresh PR from C6 onto the base replays exactly C6's own twenty commits with no duplication. Option 1 is refused because merging an already-landed parent a second time carries a duplicate payload, and option 3 discards the verified restack. The stack base is NOT broken - it is green and simply missing one MSP - so this is a re-land, not a repair. Deleting feat/c5b-coupling-parity is deferred to the human because branch deletion is destructive and that branch currently holds the only record of the #122 merge. The durable lesson is that the delete-then-confirm step must happen BETWEEN a parent merge and a child merge, and cannot be satisfied by merging both in one sitting.
