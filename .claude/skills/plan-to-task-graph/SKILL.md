---
name: plan-to-task-graph
description: Internal callable of the mitosis skill. Converts ONE approved implementation plan into a hardened, parallel-safe task graph (.graph.json) by separating the decomposer's declared intent from machine-derived dependency ground truth. NOT a user-facing entry point — the mitosis flow invokes it per MSP. Do not invoke directly for ad-hoc work.
---

# plan-to-task-graph

Convert an approved plan into a hardened `<plan>.graph.json` the wave planner and run-script generator consume unchanged. Two layers, separated by who owns them.

## Layer 1 — INTENT (the decomposer's judgment, authored by the Mitosis AI)

For each plan task emit one task object with the v2 contract fields:

- `id` — stable, derived from the plan task number/name.
- `title` — the task title.
- `fullText` — the ENTIRE task body verbatim (steps + code). Never summarize.
- `fileScope` — every file the task creates or modifies. Exhaustive; prefer exact paths over globs.
- `dependsOn` — the ids this task declares it needs. An edge `{from,to}` means `from` depends on `to`.
- `risk` — `high` for contract pairs, auth, migrations, concurrency, or public API shape; else `low`. Drives review scaling.
- `agentType` — omit or `implementer` for features/fixes/refactors; `test-engineer` for test-only tasks. Fold rote single-file edits into an `implementer` task; never emit `mechanical-editor` (engine tasks require a worktree, tests, and a commit, which that agent type cannot perform).
- `validation` — `scoped` for code tasks; `none` for graph-included tasks with nothing runnable.

Contract pairs (an emitter and its consumer) MUST be edged emitter-before-consumer and MUST NOT land in the same wave. Shared-fixture / registry tests are boundary-only — never a per-task scoped check. Non-code tasks (pure docs, config without behavior) are excluded from the graph entirely.

This layer is authored by the AI from full plan context. There is no human review gate (D2): plan-to-task-graph is an internal callable of the mitosis flow.

## Layer 2 — STRUCTURE (machine-owned, deterministic ground truth)

The decomposer is fallible: AI judgment over a large plan can drop a real dependency edge. The structure layer is a MONOTONIC, add-only safety net that can only make the graph SAFER (more serialized), never less.

1. Semantic discovery (you run this): for each task's `fileScope` symbols, query the native LSP call hierarchy (the dependency ORACLE per rules/common/tool-routing.md) for caller/callee edges that cross task boundaries; query the Graphify map for file / import / inheritance edges. Corroborate the seams the oracle cannot see (dynamic dispatch, DI, FFI, SQL, codegen) with targeted reads. Emit each cross-task edge as `{ "from": "<dependent task id>", "to": "<prerequisite task id>", "reason": "lsp-call" | "graphify-import" | "contract-pair" }` into a discovered-edges JSON array.
2. Hardening (deterministic, automated, no human): run
   `node ~/.claude/lib/superpowers-parallel/derive-edges.mjs <plan>.graph.json <plan>.discovered-edges.json --out <plan>.graph.json --audit <plan>.edges-audit.json`
   `derive-edges` unions the declared edges with the discovered edges AND with pure fileScope-overlap edges it computes itself. It ADDS any edge you missed (logged to the audit file) and NEVER removes a declared edge.
3. The ONLY halt is a contradiction the monotonic add cannot resolve — a newly-implied dependency cycle, meaning the decomposition itself is wrong. `derive-edges` throws `dependency cycle detected among: ...` and exits non-zero, mirroring the wave planner. Fix the plan's task boundaries and re-run. No human approves the lint; the run proceeds automatically on the safer graph whenever no cycle exists.

## Output and preview

Write the hardened graph to `<plan>.graph.json` (in place, v2 contract) and the audit to `<plan>.edges-audit.json`. Preview the wave layout with:
`node ~/.claude/lib/superpowers-parallel/wave-planner.mjs <plan>.graph.json`
A clean run proves the graph is acyclic and that no two fileScope-overlapping tasks share a wave. Return the hardened graph path and the audit to the calling mitosis flow.
