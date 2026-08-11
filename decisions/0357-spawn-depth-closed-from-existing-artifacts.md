---
Status: accepted
Date: 2026-08-11T23:53:59.051Z
Thread-Id: 01KZQ2BVF2386ATV5YFD43NQVX
---

# 0357. Spawn depth is closed from existing artifacts: depth 3 is reachable and the new chain is shorter

## Context

0352's topology depends on the main-thread-to-phase-to-worker chain fitting under CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH, which was never verified. The variable is unset in settings.json and absent from the environment, so only observed behaviour can settle it.

## Options

- Read observed depths from artifacts already on disk - chosen
- Run a nested-workflow probe to find the ceiling
- Carry it forward as an unverified assumption

## Outcome

Closed from existing artifacts, no probe. A census of every subagent meta.json on this machine (5,789 records, 2026-08-11) gives spawnDepth 1 = 5,637, 2 = 73, 3 = 2, unset = 77. Depth 3 is reachable and has been exercised in real runs. Cutting the orchestrator layer SHORTENS the chain rather than lengthening it, so the new topology fits with margin. This is a floor established by observation, not the documented ceiling; it is sufficient to stop the question blocking the SPEC and is not a licence to add layers.
