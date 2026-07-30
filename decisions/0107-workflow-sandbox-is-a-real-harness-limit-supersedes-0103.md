---
Status: accepted
Date: 2026-07-30T00:41:08.040Z
Thread-Id: 01KYR405KFXHM15J5XXK5BXTVT
---

# 0107. The workflow-script sandbox is a REAL harness limit; prose-as-syscall is forced, not chosen (supersedes 0103)

## Context

0103 reclassified the mitosis no-imports/cannot-execute premise as SELF-IMPOSED POLICY pending one runtime test, and named the execute half as the single highest-leverage open fact. That test is now run. Four invocation paths were probed with throwaway zero-agent Workflow scripts: (1) inline script, (2) on-disk scriptPath, (3) file:// URL import, (4) child workflow dispatched through the in-script workflow() hook, which is the path block-inline-engine.mjs:12-19 MANDATES for the production engine. All four return the identical hard error: "import() is not available in workflow scripts." child_process does not merely fail to execute, it does not resolve. Measured global surface of a workflow script: log, phase, console, budget, setTimeout, clearTimeout, Date, agent, parallel, pipeline, workflow, args. Absent: process, require, Buffer, fetch, XMLHttpRequest, WebAssembly. new Function is blocked ("Code generation from strings disallowed for this context").

## Options

- Uphold 0103: the constraint is self-imposed policy and the rebuild can replace prose-syscalls with real function calls
- Reverse 0103: the constraint is a real harness limit, prose-as-syscall is forced, and the rebuild can only thin the prose layer, never delete it
- Leave 0103 open pending further testing of some untested invocation path

## Outcome

0103 is REVERSED and superseded. The sandbox is a real harness limit. agent(prompt: string) is the orchestrator's ONLY effector — parallel/pipeline/workflow are combinators over it, log/phase write to a progress UI, budget/args are read-only. Therefore prose IS the engine's syscall ABI and the prose-as-syscall layer is FORCED, not chosen. 0103's two citations are accurate as citations; the inference from them fails on two counts, both systemic and both likely to recur: (a) frontier-train-e2e.test.mjs:16-17 reconstructs the engine body with new AsyncFunction(...) in REAL Node, where await import() legitimately works and process/require exist — the suite therefore evaluates the orchestrator in a strictly MORE PERMISSIVE context than production and is structurally incapable of detecting any sandbox constraint; (b) the await import('node:os') at parallel-plan-execution.js:27-28 is dead code on that line — block-inline-engine.mjs:12-19 blocks invoking that file by name AND by scriptPath, mandating the workflow() hook, and the workflow() child path is sandboxed identically, so that import cannot ever have executed under this harness. Presence of code in the tree was read as evidence of successful execution. CONSEQUENCES: the rebuild cannot delete the prose layer, only thin it — reset expectations before seeking approval, alongside 0104. The volume is still chosen even though the layer is forced, and the volume is where 0103's estimated 1-2M tokens per 6-MSP run lives: generalize decision 0017 (deterministic work ships as a mitosis-git.mjs verb) from restack to EVERYTHING, so one agent runs a typed verb instead of 10-14 micro-agents each told a git step in prose. Corollary first law for the rebuild: never encode an invariant in a prompt, encode it in a gate and let the prompt merely describe the gate — prompts are advisory input to a sampler and guarantee nothing. NEW PREREQUISITE, not optional: any rebuilt test harness must reproduce the real global surface, or green tests keep certifying code that cannot run. NOT resolved by this measurement: the 21-module byte-identity twinning tax 0103 attributed to the same premise persists, but the workflow() sub-dispatch escape remains available and may still solve twinning even though it cannot solve prose.
