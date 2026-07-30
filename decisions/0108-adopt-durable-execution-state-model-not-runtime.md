---
Status: accepted
Date: 2026-07-30T04:33:19.541Z
Thread-Id: 01KYR405KFXHM15J5XXK5BXTVT
---

# 0108. Adopt the durable-execution state model natively; no off-the-shelf runtime

## Context

0106 offered "rebuild against the durable-execution pattern" and "adopt an off-the-shelf runtime wholesale" as separate options and left the choice open. 0107 then measured the orchestrator's real capability surface, which resolves it. The workflow script has no import(), no fetch, no process, and no code generation from strings, so no Temporal/Restate/DBOS SDK can run at the orchestrator layer. Placing a runtime outside and treating the sandbox as its client makes every journal write an agent() prose syscall on the hottest path in the system, so the durability layer would itself become a token cost centre. Separately, the enumerable global surface (log, phase, console, budget, setTimeout, clearTimeout, Date, agent, parallel, pipeline, workflow, args) contains no signal, suspend, or external-event primitive, so orchestrator-level parking on a human signal is not expressible at all. A further structural fact from 0107: agent() exists only inside the sandbox and I/O exists only outside it, so the two capabilities are in disjoint compartments and prose is the only bridge in either direction.

## Options

- Adopt an off-the-shelf durable-execution runtime wholesale (Temporal, Restate, DBOS, Azure Durable Functions)
- Adopt the durable-execution STATE MODEL natively - journaled idempotent steps, replayable deterministic orchestrator, content-keyed shared store - with no new runtime dependency
- Keep the current machine-local built-MSP durability and accept the measured crash-loss

## Outcome

STATE MODEL ONLY, no runtime. Confidence HIGH. The decisive argument is not the sandbox but that every win 0106 attributes to durable execution is a property of the state model rather than of any runtime: 0106 diagnoses durability at the wrong granularity (whole built MSP), in the wrong place (machine-local, gitignored, self-overwriting) and under the wrong key (spec file path rather than content), and the fixes for all three are step-level journaling, a shared readable store, and a content hash. A runtime would supply those plus a cluster to operate plus a second failure domain, for capabilities 0107 shows are unreachable - Optimization and Speed bought at the cost of Quality, against the pillar order, and straight into the second-system risk 0106 names as the primary danger. THREE BINDING SPECIFICS: (1) the prompt text hash is part of the journal key, since replaying a cached result against an edited prompt is a silent replay bug; (2) the orchestrator CANNOT read its own journal - a relaunched workflow script starts with only args - so resumption is either a launcher passing prior state via args or exactly one bootstrap agent() call paid once per run, and this must be designed rather than discovered; (3) the harness already ships a partial journal in the Workflow tool's resumeFromRunId, which replays the longest unchanged prefix of agent() calls, but its contract is same-session only, so it is a legitimate in-session fast path and never the cross-session durability story. CONSEQUENCE for free waiting, which 0104 identifies as the only architectural lever: because there is no suspend primitive, free waiting must be implemented as END-AND-RELAUNCH - the run terminates and an external trigger relaunches it with journal state - rather than as an orchestrator that sleeps. That strengthens this decision rather than reopening it, since end-and-relaunch is exactly what a content-keyed step journal enables. The probe proposed earlier before locking this decision is therefore unnecessary: the absence of any signal primitive is already established by 0107's enumeration of the global surface. FALSIFIER that would reopen it: a harness capability that can resume a specific workflow run across sessions from an external event, which would make orchestrator-level parking expressible after all.
