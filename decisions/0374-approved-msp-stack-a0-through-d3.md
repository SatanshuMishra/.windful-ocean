---
Status: accepted
Date: 2026-08-12T06:09:04.428Z
Thread-Id: 01KZQ2BVF2386ATV5YFD43NQVX
---

# 0374. The SPEC absorbs re-architecture, Part III and the phase collapse, decomposed into stack A0 through D3

## Context

Scope was chosen as re-architecture plus Part III plus the 13-to-8 phase collapse (0338) in ONE MSP-decomposed SPEC, because the three are entangled: the rehost is the enabler, and the phase collapse changes the same call sites, so splitting them guarantees rework. Structural-guarantee replacement was chosen at the strongest setting. The user approved the decomposition presented in chat on 2026-08-12 with "Looks good".

## Options

- Re-architecture only, Part III and phase collapse as separate specs - rejected: three specs touching the same call sites with implicit ordering
- Re-architecture plus Part III plus phase collapse - chosen
- Also re-admit the deferred supervisor and rotation research (0348-0351) - rejected: reopens work 0352 parked

## Outcome

Approved stack of 18 MSPs in four clusters on base branch feat/mitosis-os-process. Cluster A substrate: A0 wave-planner dedicated tests FIRST because it enforces the no-same-wave-file-overlap rule (wave-planner.mjs:50-53) and has no test file, and nothing may change scheduling semantics above untested safety code; A1 dispatch adapter; A2 pool with ready_after DAG; A3 run store; A4 guarantees (deny-by-default exec allowlist, determinism lint, two new mitosis-gate verbs proving both). Cluster B deterministic upgrades: B1 coupling-review, B2 context packs, B3 critical-path ordering. Cluster C port: C1 phase model 13-to-8 (the parity gate is currently self-violating - Resume declared at mitosis.js:15 with no call site), C2 prompt registry, C3 convert the 5 journal dispatches, C4 the 13 shell-out-and-transcribe, C5 parallelize, C6 boundary, C7 the loop where end-to-end capability returns. Cluster D: D1 entry point, D2 delete mitosis.js and the 35 sandbox tests, D3 measured comparison with falsifier at 10 dispatches per shipped MSP. C7 exceeds the 200-400 LOC target and cannot be split; the tick loop is one unit.
