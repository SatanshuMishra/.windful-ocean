---
Status: accepted
Date: 2026-08-11T23:19:04.537Z
Thread-Id: 01KZQ2BVF2386ATV5YFD43NQVX
---

# 0352. The supervisor and dispatched orchestrator are cut from scope; the main thread is the orchestrator

## Context

The 2026-08-11 re-architecture put a Node+SDK supervisor process around a dispatched orchestrator agent, so run history and context fill lived outside the main thread and could be rotated at a ceiling. That middle layer is the largest unbuilt part of the design, it is what the cost, rotation and title-tax research existed to serve, and it was blocking the mitosis engine update behind it. The user stopped all agents and cut it, on the ground that too much was being attempted at once.

## Options

- Keep the supervisor process and the dispatched orchestrator agent as designed on 2026-08-11
- Cut both; the Claude Code main thread is the orchestrator and mitosis JS still dispatches and fans out
- Cut the supervisor only and keep a dispatched orchestrator agent below the main thread

## Outcome

Cut both, deferred until after the mitosis engine is updated. The main thread is the orchestrator: every response, clarification and permission request surfaces to the user there, and mitosis JS remains the dispatch and fan-out engine. The cut resolves all three blockers that motivated the SDK host rather than solving them - a workflow cannot ask a human (the main thread is the human interface by construction), the rotation trigger had no sensor (no rotation in scope), and subagent nesting ran out of depth (removing a layer shortens the chain). The accepted cost is that run history and phase output now occupy the main thread's context, which is precisely what the deferred layer would have relieved. It re-opens one question it does not answer: the codegen-decomposition work was dropped as moot because a Node host restores ESM, and cutting the host withdraws that justification, so whether mitosis JS keeps its inline module twins is open. Removing the orchestrator AGENT does not by itself decide where the engine RUNS - those are separable and the SPEC must decide the runtime separately.
