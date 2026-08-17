---
Status: accepted
Date: 2026-08-17T17:13:16.778Z
Thread-Id: 01KZTEFMENXBW30ZE633YNFJHE
---

# 0535. An engine run carries no machine-derived dependency truth, so parallel-safety rests on the model's dependsOn

## Context

Pinning the tier-2 hidden-coupling expectations established that deriveEdges and reviewCoupling have no production caller: every reference outside derive-edges.mjs sits under tests, and the live decompose path is deriveClusters alone at decompose-emit.mjs:335 with discoveredEdges hard-coded to an empty array and the audit discarded. This joins the separately confirmed finding that no engine module calls graphify anywhere across 8373 files. What actually decides parallel-safety is the model's own dependsOn plus a string-prefix overlap over fileScope.edit that never consults read. The derivation machinery is real and tested but reachable only through the plan-to-task-graph prose step an agent performs, never from the engine entry point, which inverts that skill's stated separation of declared intent from machine-derived structure.

## Options

- Treat the existence of derive-edges and coupling-review as evidence undeclared dependencies get caught
- Record that the engine path carries no derived edges and grade the hidden-coupling probe on dependsOn alone
- Wire derive-edges into decompose-emit now so the probe can pass

## Outcome

Record it and grade against what the engine actually runs. The hidden-coupling probe therefore tests exactly one proposition: whether the model declares a dependsOn for a collision the SPEC never states. Nothing else on the live path can catch it, so a miss must never be attributed to a detector that never executed. Wiring derive-edges in would be a code change above the acceptance ceiling for a test and would destroy the measurement by altering the system mid-probe. The substrate was additionally built so no path segment matches the risk-marker or migration-dir detectors, keeping those provably inert so the probe measures the decomposer rather than an accidental marker collision.
