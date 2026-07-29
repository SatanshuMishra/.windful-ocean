---
Status: accepted
Date: 2026-07-29T23:44:12.570Z
Thread-Id: 01KYR405KFXHM15J5XXK5BXTVT
---

# 0103. The mitosis no-imports / cannot-execute constraint is self-imposed policy, not a harness limit

## Context

The entire mitosis architecture rests on the premise that a Claude Code Workflow script cannot import modules, spawn processes, or touch the filesystem — which is why every git and gh operation is English prose inside an agent prompt, executed by a subagent that transcribes results back as chunked JSON. That premise produced the two worst properties of the engine: the prose-as-syscall layer (est. 1-2M tokens per 6-MSP run on ~10-14 micro-agents per MSP running deterministic git ops, and the #1 fragility source) and the 21-module byte-identity twinning tax that makes every fix land twice. The 2026-07-29 run-readiness-repair spec section 1.5 states the premise as fact: "mitosis.js is a Workflow script with zero imports, zero child_process, no filesystem, no clock, no randomness."

## Options

- Accept the premise as a genuine harness limit and keep optimizing within the prose-as-syscall design (the status quo, and what every prior spec assumed)
- Treat the premise as unverified and test it, since the sibling workflow script appears to contradict it
- Assume imports work and rebuild on that basis without testing

## Outcome

Reclassified as SELF-IMPOSED POLICY, pending one runtime test. Evidence: the script body is evaluated as an async function body — the test harness reconstructs it exactly as new AsyncFunction('args','agent','parallel','log','phase','workflow', mitosisBody) at .claude/lib/superpowers-parallel/tests/frontier-train-e2e.test.mjs:15-17. Inside a function body, STATIC import is a SyntaxError, so that part of the constraint is real. But dynamic await import() is legal there, and the sibling Workflow script uses it IN PRODUCTION: .claude/workflows/parallel-plan-execution.js:27-28 loads node:os and run-engine.mjs by file:// URL, from the same directory, dispatched by the same Workflow tool, on the blessed engine path (a hook exists solely to route its invocation, .claude/hooks/block-inline-engine.mjs:14-19). Therefore await import('node:child_process') should resolve identically. Corroborating: the harness injects a workflow() callable that mitosis.js never uses — it inlined runEngine instead of sub-dispatching, and that is what created the twin set. OUTSTANDING: nobody has confirmed child_process actually EXECUTES at runtime rather than merely resolving. This is a ~30-second test and it is the single highest-leverage remaining fact — it is the one thing that could rehabilitate the prose layer as forced rather than chosen, and it must be settled before any rebuild is committed to. Do not re-derive the resolve-vs-execute distinction; only the execute half is open.
