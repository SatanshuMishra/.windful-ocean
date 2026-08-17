---
Status: accepted
Date: 2026-08-17T05:42:31.456Z
Thread-Id: 01M04HH9W6HVPQJDPW24WH48GC
---

# 0508. Strike the unidentifiable backup profiles from c4, and correct the stale worktree count in the same clause

## Context

Criterion c4 names two figures in its coupling-surface clause: "405 worktree copies, four backup profiles". Neither survives measurement. An exhaustive search for the backup profiles covered the repository, all decision records on this thread, the round-4 audit explainer, every session log, and ~/.claude/backups/ itself; no definition exists anywhere. The closest filesystem candidate is three dated snapshot directories under ~/.claude/backups/, none of which contains a backup of the agent roster - so it is neither four, nor profiles, nor roster-related. Separately, 405 worktree copies could not be traced to any computation either; measured today the figure is 18 worktrees carrying 15 roster files each, or 270 copies.

## Options

- Define what the four backup profiles are - rejected, no surviving artifact supports a definition and inventing one would fabricate a criterion
- Leave both figures in place - rejected, an unidentifiable criterion item can be neither satisfied nor refuted, which makes c4 unclosable by construction
- Rewrite c4's clause: strike the backup profiles, correct the count to what was measured

## Outcome

The backup-profiles item is struck from c4 by user ruling on 2026-08-17, and the stale worktree figure is corrected in the same clause because the rewrite touches that exact sentence and preserving a number known to be false would be a deliberate defect.

The mechanism is a REWRITE of c4, not a strike of c4. The tool's strike operation removes an entire criterion; striking c4 would delete the whole teardown-and-rebuild criterion, which is the opposite of the intent. c4 survives with its coupling-surface clause corrected.

Why an unidentifiable item had to go rather than sit harmlessly: a completion criterion is the definition of done for a unit of work, and G0 requires that definition to be pinned observably before the work starts. An item nobody can identify cannot be observed, so it cannot be satisfied - and equally cannot be shown not to apply. Its presence alone made c4 unclosable regardless of how well the rebuild went. That is a worse failure than omitting it, because it converts a real criterion into one that can never terminate.

What is NOT struck, and remains in c4: rules and skills naming agents by string, which is the genuine coupling surface and is fully inventoried; the worktree copies, now correctly counted; and derived residuals. If the backup profiles are later identified they are filed as a new item against the standard, never folded back into c4 retroactively.
