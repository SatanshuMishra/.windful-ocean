---
Status: accepted
Date: 2026-08-16T18:43:03.764Z
Thread-Id: 01KZTEFMENXBW30ZE633YNFJHE
---

# 0475. Shipped means checkpointed and green, because this build's engine cannot reach Ship

## Context

The release gate's falsifier counts dispatches per SHIPPED MSP. Import and call reachability from cli.mjs's main() settles what shipping can mean in this build: the transitive closure is 22 modules, and git-commands.mjs and node-commands.mjs are outside it, their only importers being each other and the disconnected legacy cluster. SHIP's rebase and push, CI_PUBLISH's forward-merge and push, BRANCH_COMPOSE's rebase --onto, the checkpoint and manifest ref pushes, and NODE_SITE_COMMANDS open-pr are therefore all unreachable from a cli.mjs run. The live path touches the network exactly once, read-only, at engine.mjs:204 with a fixed gh pr view argv and a single call site; the checkpoint ref it does write is a local git update-ref at cli.mjs:194. A unit's terminal state in this build is a checkpointed sha that went green, and the run then reaches quiescence. Nothing in the engine can open a pull request or push. The one place real network write-intent can still enter is the run document: cli.mjs composes no prompt of its own and hands specs[].request.prompt verbatim to a real claude child holding its own Bash tool, so blast radius is a property of the document authored for the run rather than of the engine.

## Options

- Rule the falsifier unevaluable a second time, because it names a phase this build does not implement
- Wire the unreachable SHIP and CI_PUBLISH cluster so the falsifier is measurable exactly as written
- Rule shipped equivalent to checkpointed and green for this build, and record the equivalence explicitly

## Outcome

For this build, a SHIPPED MSP means a unit that checkpointed a sha and went green, and the falsifier is measured as dispatches per completed unit. The equivalence is recorded here rather than left implicit, so the resulting number is never later read as covering a Ship phase that never ran; any future build that wires SHIP must re-measure rather than inherit this figure. Ruling it unevaluable a second time was rejected because the engine's terminal state is a real and observable one and a count over it answers the question the gate was asking, namely whether dispatch volume per unit of shipped work is bounded. Wiring SHIP first was rejected as substantially larger than the instrument work and as something that would open real pull requests during the measurement run, converting a local experiment into an outward-facing one. This ruling makes the falsifier evaluable for the first time; it does not make it binding, since 0358 requires three runs at pinned state before a baseline binds and the planned run is n=1.
