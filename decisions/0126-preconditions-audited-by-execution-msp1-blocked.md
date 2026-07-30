---
Status: accepted
Date: 2026-07-30T07:01:19.096Z
Thread-Id: 01KYR405KFXHM15J5XXK5BXTVT
---

# 0126. Spec section 2 preconditions audited by execution: four not-landed, one partial, MSP-1 blocked

## Context

The spec's five hard preconditions (steps 0, 1, 1.5, 2, 3) were carried as ASSUMED landed and never verified. Audited on 2026-07-30 against origin/main 6d19499 by execution, never by file presence, per 0117 and the 0103/0107 lineage.

## Options

- Assume landed and start MSP-0 then MSP-1 as the brief directed
- Verify by execution first and re-sequence on the evidence

## Outcome

Verified. Step 0 NOT-LANDED: `mitosis-git.mjs worktree-reap` returns "unknown verb"; no SessionStart reaper line in settings.json; the 12 leaked worktrees are the predicted consequence. Step 1 NOT-LANDED: frontier-train-e2e.test.mjs:24-26 still rebuilds the engine with `new AsyncFunction` under real Node; no vm/restricted-surface harness exists anywhere; the suite is genuinely green (1568/1568) but that green certifies nothing about the production sandbox. Step 1.5 PARTIAL: `runScheduleStreaming` exists at mitosis.js:2153-2202 and is tested, but `STREAMING_DISPATCH_ENABLED = false` at :2204 and the sole production call site at :4888-4897 passes no streaming key, so production is still the tick barrier; two tests in leases.test.mjs document the gap by name. Step 2 NOT-LANDED: mirror-guard.test.mjs asserts 21 modules plus a models-knob region byte-identical to inline copies in mitosis.js, 22/22 passing, so twinning is intact and actively enforced; the .drift-state.json machinery is plugin-version drift and unrelated. Step 3 NOT-LANDED: verbs are still exactly pr-create, pr-close, compare; no mitosis-gate.mjs or mitosis-intel.mjs exists; .mitosis/run.json carries no timestamp, no dispatch count, no wall-clock and no phase-entry field. CONSEQUENCE: MSP-0 is CLEARED to start (pure source extractor, fixture-tested, touches no precondition, and neither Shepherd nor Final review appears in any twinned module so it incurs no twinning tax). MSP-1 is BLOCKED, exactly its own falsifier: the missing capability is not the verb name, it is the absence of any per-dispatch boundary in the durable record.
