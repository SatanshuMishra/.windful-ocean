---
Status: accepted
Date: 2026-07-26T08:26:58.673Z
Thread-Id: 01KYERGSD9QA9XC6QD4XPM8R37
---

# 0001. v1 ledger moved to ledger-archive-v1 and frozen read-only

## Context

The v1 file ledger at .claude/ledger/ had to be retired without being migrated or deleted. The move was held until the v2 store existed; that precondition was satisfied on 2026-07-26. A dry-run digest from 2026-07-25 was stale because the live ledger kept changing. A further hazard was found at execution time: the graphify Stop hook fires at the end of every turn, so a digest taken in one turn and verified in the next could be corrupted by an interleaved write into .claude/ledger/graphify-out/.

## Options

- Take the before-digest and perform the move in a single uninterrupted turn so no Stop hook can interleave
- Re-use the 2026-07-25 dry-run digest
- Exclude graphify-out/ from the archive to stop the hook writing into a frozen tree
- Delete the v1 ledger once the backup was verified

## Outcome

Took the digest and the move in one uninterrupted turn. Fresh digest recorded 540 files, 5 dirs, 0 symlinks, 2,385,442 bytes; .claude/ledger/ was moved to .claude/ledger-archive-v1/ and frozen with chmod -R a-w. Verified byte-identical both immediately after the move and again after the freeze. Negative controls: a touch probe into the archive returned Permission denied with no file created and the count still 540; git status --porcelain stayed byte-identical to the pre-move snapshot, proving the move was invisible to git; git check-ignore confirmed .claude/.gitignore:42 covers the new path; ledger_locate now returns empty so the v1 hooks exit 0 rather than recreating the directory. graphify-out/ was kept inside the archive because the criterion requires contents byte-unchanged, and the Stop hook skips it anyway since it has no graph.json. The backup tarball is retained outside the repo. Criterion 2 is MET.
