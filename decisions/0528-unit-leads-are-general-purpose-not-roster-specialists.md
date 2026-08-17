---
Status: accepted
Date: 2026-08-17T16:23:56.278Z
Thread-Id: 01M04HH9W6HVPQJDPW24WH48GC
---

# 0528. Unit leads are general-purpose agents, because no roster specialist holds the Agent tool needed to fan out

## Context

The user requires a fan-out dispatch architecture in which Opus leads plan a unit and then dispatch Sonnet workers for the mechanical parts. The PreToolUse hook suggests roster specialists on every dispatch - implementer, solution-architect, test-engineer, mechanical-editor. None of those specialists is granted the Agent tool in its definition, so a specialist lead physically cannot dispatch a Sonnet worker. Only general-purpose and claude hold it.

## Options

- Use the suggested roster specialists as unit leads, abandoning fan-out because they cannot dispatch.
- Use general-purpose as the unit lead so it can fan out, and prefix its description with FALLBACK-RATIONALE per the agent roster governance rule.
- Have the main thread dispatch every Sonnet worker itself, making the orchestrator the fan-out point instead of the lead.

## Outcome

Unit leads are general-purpose agents on Opus, each carrying the unit's full brief, and every such dispatch is prefixed FALLBACK-RATIONALE naming the missing capability, per the observation convention in the agent roster rule. This is a capability gap in the roster, not a preference: the target architecture in decision 0501 grants the Agent tool to the four Lead-band agents precisely so this stops being necessary, and until those Leads ship at U4.2 the fallback stands. Recorded so the next session does not re-litigate it on every dispatch, and so the gap is visible when the Lead band is built.
