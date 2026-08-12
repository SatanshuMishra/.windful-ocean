---
Status: accepted
Date: 2026-08-12T16:36:36.501Z
Thread-Id: 01KZTEFMENXBW30ZE633YNFJHE
---

# 0378. Mitosis is prohibited as the engine of its own replacement; the stack ships by plain subagent dispatch

## Context

The predecessor thread left this as an open watch-out to settle BEFORE dispatching anything. rules/common/spec-decomposition.md routes any approved SPEC into the mitosis skill, but SPEC D2 deletes mitosis.js — the very engine that would be running the work. A mitosis-driven run saws off the branch it sits on. The user's instruction to dispatch a dedicated orchestrator subagent that itself dispatches workers resolved it by construction.

## Options

- Run the stack through the mitosis skill per spec-decomposition.md - rejected: D2 deletes the engine mid-run, and the engine cannot be trusted to supervise its own deletion
- Dedicated orchestrator subagent using plain Agent-tool dispatch, with spec-decomposition.md explicitly overridden - chosen
- Main thread orchestrates the eighteen MSPs directly - rejected: violates delegation-discipline and would exhaust one context long before C7

## Outcome

A dedicated orchestrator subagent drives the stack with plain Agent-tool dispatch. spec-decomposition.md is explicitly overridden for this run; the user's direct instruction outranks the rule. mitosis.js and .claude/lib/mitosis/*.mjs are read as the SUBJECT of the work and never run as its engine — mitosis, mitosis-execute and plan-to-task-graph are all prohibited. Two hard supporting constraints came out of the same reasoning: every child is dispatched with run_in_background false, because a background child returns only an id and the parent then ends its turn believing it waited while nothing ran; and a durable docket outside the repo is the run's state of record, because no single orchestrator context survives eighteen MSPs.
