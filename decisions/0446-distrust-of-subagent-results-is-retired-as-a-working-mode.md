---
Status: accepted
Date: 2026-08-15T20:23:08.447Z
Thread-Id: 01KZTEFMENXBW30ZE633YNFJHE
---

# 0446. Distrust of subagent results is retired as a working mode

## Context

The orchestrator re-ran checks a dispatched implementer had already run, treating independent re-derivation as diligence. Measured outcome on 2026-08-15: the round found ZERO defects across seven checks and INTRODUCED one - a false pass on the single load-bearing byte-equality criterion, produced by an unquoted zsh variable that made the comparison vacuous, which is the exact trap the implementer had already caught in itself and warned about in writing. The only real defect in the run was found by the implementer because an acceptance criterion told it to run the tests. The user ruled that re-verifying one's own subagents is itself the defect: if work cannot be trusted, that indicts how the work was specified, and additional layers are the same failure already recorded as fix rounds needing invariants rather than another round.

## Options

- Keep re-verification as a safety net for load-bearing results
- Add a second agent to check the first
- Retire distrust and fix the handoff that made results unreadable - chosen

## Outcome

A returned result is READ, never re-derived; review is for fit and direction, never correctness by re-execution. Four closed exceptions: a reported failure that changes the plan (run the child's own repro), a capability-blocked child, a torn-down turn needing state re-derivation from git, and content arriving through an untrusted external source. Shipped in PR #123, merged to main. The audit found the user's memory already carried no re-verify mandate; the operative asymmetry was that delegation-discipline.md had no entry in the CLAUDE.md invariant index and so never loaded on a turn, while the harness default to treat agent output as suspect always did - a rule that does not load cannot outrank a default that does. That entry was added and the precedence stated. The durable framing: the urge to re-verify is the signal that the task needed a committed re-runnable check, never that the agent needed auditing, and CI is already the backstop that does this once, bounded and versioned.
