---
Status: accepted
Date: 2026-08-17T06:00:22.336Z
Thread-Id: 01M04HH9W6HVPQJDPW24WH48GC
---

# 0509. Execute waves 0 to 3 by direct per-unit dispatch, not through the mitosis skill

## Context

The spec-decomposition rule routes approved SPEC work into the mitosis skill rather than ad-hoc subagent dispatch. Waves 0 to 3 of the agent roster rebuild appear to qualify. Three facts cut against it. The SPEC is already the decomposition: 17 units, wave order, per-unit acceptance and one pull request per unit are ratified, so the engine would re-derive a settled artifact. U1.1 is a defect in the mitosis gate's own agent-directory resolver, and the engine fans out into worktrees, which is exactly the environment where that resolver returns a frozen roster, so running the fix through the broken mechanism is the unfalsifiable-check trap SPEC section 4 names. And SPEC section 5a records the engine as still in flight on a feature branch, off main, on a thread whose own spine says it failed its stated goal.

## Options

- Route waves 0 to 3 through the mitosis skill as spec-decomposition prescribes
- Dispatch one subagent per SPEC unit in wave order, each in its own worktree, one pull request per unit
- Wait for the mitosis engine to land on main before starting any wave

## Outcome

Dispatch one subagent per SPEC unit in wave order. Each unit gets its own git worktree so the primary checkout stays on main and the live configuration is never mid-flight, and each opens one human-merged pull request through the centralized pr-create tool. Waves 0 to 3 touch only the observer, the check mechanisms and the skills, none of which depend on the engine, so waiting on it would stall work section 5a explicitly clears. This is a scoped deviation from spec-decomposition for waves 0 to 3 only; waves 4 to 7 are re-evaluated once the engine is on main.
