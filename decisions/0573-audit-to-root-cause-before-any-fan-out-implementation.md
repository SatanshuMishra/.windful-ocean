---
Status: accepted
Date: 2026-08-18T16:26:43.161Z
Thread-Id: 01KZTEFMENXBW30ZE633YNFJHE
---

# 0573. The next phase is a bounded audit to root cause and a whole solution, never another reviewer loop

## Context

Two live end-to-end runs produced five new defects and no falling discovery rate, and the same two failure families surfaced in both runs: state that dies at a phase or process boundary, and status fields that report success for non-success. The orchestrator proposed an ordered fix schedule starting with a connectivity census. The user ruled on the shape of the next phase instead of on the schedule.

## Options

- Fix the defects one at a time, driven by repeated live runs
- Audit comprehensively to root cause first, decide the whole solution, then fan out once

## Outcome

Audit first, in a FRESH session, with no implementation until the whole solution is settled. The charter has six parts, all of them binding: understand the issues; understand EVERY surface involved; name the root cause or causes; judge whether the system is too fragile and too complex; judge whether it needs simplifying; judge where it departs from best practice. The output is the ENTIRETY of the solution for BOTH families, and only then does implementation fan out. The user explicitly forbade another reviewer loop that never passes, which binds this phase to the existing verification standard: acceptance is a ceiling declared before work starts, a finding above it is filed as a new item rather than folded in, and a gate that cannot be cleared becomes a tracked downgrade rather than another review round.
