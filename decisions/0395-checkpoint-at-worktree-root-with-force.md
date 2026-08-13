---
Status: accepted
Date: 2026-08-13T18:47:49.232Z
Thread-Id: 01KZY5ARMRK0S390J8Y25X8Z72
---

# 0395. The D6 checkpoint runs at the worktree root and requires --force

## Context

The SPEC rejected git stash create because it cannot capture untracked files, and specified a temp-index checkpoint instead. Measurement on 2026-08-13 found the temp-index form has its own defects. Run at the superrepo root it captures nested repositories as empty gitlinks, so the eight worktrees holding the actual parallel agent work are captured not at all, at a median of 795ms. Separately, plain git add -A against a fresh temp index silently drops tracked files matching .gitignore, because in a fresh index every path is new so ignore rules apply; this was reproduced on a controlled scratch repository.

## Options

- Superrepo-root temp-index checkpoint as the SPEC specifies
- Per-worktree temp-index checkpoint run from inside each worktree
- Abandon the checkpoint and gate destructive local operations instead

## Outcome

Checkpoint at the worktree root, using --force. Measured at 259ms median capturing 1731 blobs and 31.3 MiB with zero gitlinks, against the superrepo variant's 795ms that captures the same worktree as an empty gitlink - three times faster and the only one of the two that captures the work at all. --force is a correctness requirement rather than an option for including ignored content, because without it tracked-but-ignored files are silently lost. Expect occasional multi-hundred-millisecond spikes against that median. Both the 19ms figure and the superrepo variant are dead.
