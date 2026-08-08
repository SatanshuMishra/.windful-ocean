---
Status: accepted
Date: 2026-08-08T23:54:27.823Z
Thread-Id: 01KZCF28RN4RMR46VDXFKSQZY3
---

# 0296. A hook's output channel follows its exit code rather than its event, because only the success path was being discarded

## Context

converge.mjs is registered as both a SessionStart and a Stop hook. Its SessionStart path was confirmed working, emitting the drift report as hookSpecificOutput.additionalContext. Its Stop path wrote to stderr with exit 0, and the shipped Claude Code 2.1.224 hook schema states that a Stop hook exiting 0 has BOTH stdout and stderr discarded, so a successful promotion - a real mutation of live global config - was reported to neither the model nor the user. Both premises were verified against the binary's own schema rather than taken from the dispatch brief, which also confirmed that Stop does support additionalContext, contradicting the repo's own protocol note at .claude/docs/superpowers/plans/2026-06-30-continuity-v2-04-hooks-and-trailer.md:37, which documents Stop as exit-2-only and is stale. The obvious fix - route Stop through additionalContext the way SessionStart does - was measured against the whole exit-code space before being applied, and that measurement changed it. exitCodeFor returns exit 1 for a refused, errored or rejected Stop, and exit 1 shows stderr to the user, so the failure path was never silent. Only the exit-0 success path vanished.

## Options

- Route the output channel by EXIT CODE - exit 0 to hookSpecificOutput.additionalContext, non-zero to stderr - ADOPTED. Route by EVENT, sending everything from a Stop event to additionalContext - rejected on measurement, because it would have moved the exit-1 failure path out of the visible stderr channel and into a channel the user does not see, trading one silent path for another while appearing to fix the bug. Leave Stop on stderr and document the limitation - rejected, because a silent live-config mutation is the failure this criterion exists to prevent.

## Outcome

Adopted. emitReport takes the exit code and dispatches on it, using the identical hookSpecificOutput mechanism SessionStart already used with hookEventName taken from the event. exitCodeFor is unchanged, so SessionStart remains unconditionally exit 0 and therefore unconditionally routed to additionalContext, bit-identical to before. The general lesson, and the reason this is a record rather than a code change alone: a hook's visible channel is a function of its exit code, not of its event name, so a fix stated at the granularity of the event is the wrong shape even when it repairs the reported symptom. The reported symptom was one cell of a two-by-two, and repairing it by event would have broken the cell that already worked. Two consequences beyond this thread. The repo's protocol note is stale against the shipped binary and any hook written from it may report into a discarded channel; that audit is filed as separate work rather than pulled into this branch. And silence remains the correct output for a converged or uninitialised machine, so the fix is guarded by a recursive tree snapshot asserting zero writes and empty streams in both of those states - a change that made Stop chatty would be a regression wearing the shape of a fix.
