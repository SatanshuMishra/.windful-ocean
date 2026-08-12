---
Status: accepted
Date: 2026-08-12T23:16:30.141Z
Thread-Id: 01KZTEFMENXBW30ZE633YNFJHE
---

# 0385. A deterministic Workflow script drives each MSP lane, replacing the nested orchestrator subagent

## Context

0378 chose a dedicated orchestrator subagent using plain Agent-tool dispatch, and rejected main-thread orchestration as a delegation-discipline violation that would exhaust one context before C7. The last session then rejected the nested orchestrator in practice — a dispatching agent ends its turn narrating that it is holding while nothing ran — leaving "drive workers directly from the main thread" as the standing instruction, which is the option 0378 had already rejected. The user resolved the impasse by instructing that a dedicated small dynamic workflow plan, implement and ship each MSP.

## Options

- Nested orchestrator subagent per 0378 - rejected in practice: it returns believing it waited while nothing ran
- Main thread dispatches every worker directly - rejected by 0378: violates delegation-discipline and exhausts one context long before C7
- Mitosis skill as the engine - prohibited by 0378: D2 deletes the engine mid-run
- Deterministic Workflow script, one lane per MSP, launched from the main thread - chosen

## Outcome

Each batch of MSPs ships through a Workflow script authored by the main thread. The script is deterministic JavaScript, so control flow is not model-driven and cannot narrate a wait it did not perform; agent() is awaited, which satisfies 0378's run_in_background-false constraint by construction. Work stays delegated to subagents, so the main thread keeps its context. Mitosis, mitosis-execute and plan-to-task-graph remain prohibited as the engine — the Workflow tool is a separate harness and is not the subject of the SPEC. The first run covers A2, A3 and B1 in five phases: one shared ruling, then per-MSP plan, implement, split-role review and ship. This supersedes 0378's choice of engine only; every other constraint 0378 set still binds.
