---
Status: accepted
Date: 2026-08-12T05:10:03.227Z
Thread-Id: 01KZQ2BVF2386ATV5YFD43NQVX
---

# 0369. Focus shifts to an OS-process control loop; the sandboxed toolbox is no longer the presumed design

## Context

Section 14 proposes turning the engine into a toolbox of verbs, each its own Workflow invocation in a fresh sandbox. Pressed on how that works robustly, the design needed three additions the report does not contain: a computed next field so the orchestrator reads its route instead of inferring it, a shared predicate table so router and gate cannot drift, and a version-token check so caller-supplied state is trusted wholesale after one comparison rather than re-verified per verb. Each addition is sound, and each exists only because the sandboxed engine has no capabilities of its own: it cannot read a file, so every fresh invocation pays an agent dispatch just to load state, and every side effect is a dispatched agent that self-reports. The fanout project (a single-file Python CLI, real OS process, no LLM in its control loop) has none of these problems, because it never leaves the process. The decisive observation is that mitosis already owns fanout's deterministic core — derive-edges, wave-planner, derive-clusters and route-planner — but reaches those CLIs sideways, by dispatching an agent to shell out to them and report back through a schema. The difference between the architectures is not capability. It is where the outer loop lives.

## Options

- Continue the toolbox as specified in section 14: N Workflow invocations, one per verb, each rehydrating from the run journal. Keeps agent() and parallel() and the harness resume caching, but pays a rehydration tax the report prices in neither column, and needs three unspecified mechanisms before it is robust.
- Move the control loop into a real OS process that calls the deterministic planners directly and drops to an LLM only at genuine decision points. Removes the rehydration tax, the dispatch-to-write indirection and the trust question outright; must answer how an OS process dispatches agents at all, and what is lost when the Workflow sandbox's determinism contract and resume caching go away.
- Hybrid: deterministic planner as the outer loop, stopping and returning only at genuine decision points, with the model answering and restarting it. The run-to-next-gate chain with its default inverted from stop-everywhere to stop-nowhere-unless-a-decision-exists.
- Keep today's monolith unchanged and drop the re-architecture.

## Outcome

The user directed that the next session shift focus to the OS-process approach. The sandboxed toolbox is no longer the presumed design for SPEC B and is not to be resumed until the OS-process comparison exists. This does not yet adopt the OS-process architecture: it sets what gets evaluated first. The comparison must establish what an OS process gives up that the Workflow sandbox provides — the agent() and parallel() dispatch primitives, the harness resume-from-run-id caching, and the determinism contract that makes that caching sound — and above all how an OS process dispatches agents at all, since that capability is the reason the engine lives inside Workflow today. The four toolbox-internal findings from this session (computed next field, shared predicate table, version-token trust, chaining as rehydration amortization) are retained as analysis: they are the cost of the sandboxed design, and they are the measure the OS-process option must beat.
