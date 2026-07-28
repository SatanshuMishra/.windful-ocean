---
Status: accepted
Date: 2026-07-28T20:16:48.284Z
Thread-Id: 01KYKS3C7VP16PXMP7D9G0TMHW
---

# 0090. Stop hook stands down on stop_hook_active, and syncs on the re-entry pass

## Context

hooks/lib/stop.mjs returned exit 2 whenever the active-thread pointer was non-empty and never read stop_hook_active, the field Claude Code sets when the session is already continuing BECAUSE a stop hook blocked it. The result was an unbounded loop: the session could not end while any thread stayed active, no matter what the agent did. It fired on every turn of this session, including turns with nothing pending. The ledger's own prior note that the hook "exits 2 unconditionally" was imprecise and is corrected here: it blocked only when a thread was active. The hook was in effect leaning on Claude Code's CLAUDE_CODE_STOP_HOOK_BLOCK_CAP rather than the intended control. Semantics were verified against the shipped Claude Code binary (v2.1.220), whose own guidance string instructs hook authors to return success while stop_hook_active is true; network docs were unreachable from the sandbox.

## Options

- Make the block conditional on stop_hook_active, letting the reminder fire once
- Leave it and accept the message every turn
- Read stop_hook_active with a strict === true comparison instead of truthiness
- Keep sync skipped on the re-entry pass, preserving today's exact behavior

## Outcome

Block is now conditional on stop_hook_active, so the reminder fires exactly once and then lets the session end; a guard test asserts it still blocks on the first pass, so the protection is bounded rather than deleted. Two sub-calls: (1) the field is read as a TRUTHINESS check, not === true, because the failure mode on a malformed payload should be a missed reminder rather than a wedged session - the defect being fixed is an unbounded block loop. (2) ledger sync now RUNS on the re-entry pass. Today's skip was incidental, falling out of the early return rather than any guard: session-start already syncs without reading the active-thread pointer, runSync is thread-state agnostic, and no test, doc or skill asserts sync must be skipped while a thread is active. This means a genuinely-ending session publishes the ref even with a thread left active, which is the crash-shaped case where publishing matters most. Shipped as PR #22 off main; separate from PR #21 because a PR body is fixed at creation and #21's body does not describe this change.
