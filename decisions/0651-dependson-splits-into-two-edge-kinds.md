---
Status: accepted
Date: 2026-08-20T23:34:22.811Z
Thread-Id: 01KZTEFMENXBW30ZE633YNFJHE
---

# 0651. dependsOn splits into a machine-derived overlap edge and a semantic edge

## Context

dependsOn is emitted by the decomposer model on its own judgment; prompt-plan.mjs:20 tells it to express every cross-MSP dependency and never defines the word. The engine routes that one field into three consequences: the start gate (leases.mjs:65-68, :74-77), failure propagation to every transitive dependent (parking.mjs:44-60, engine.mjs:266-276), and merge ordering plus PR stacking (integrate-plan.mjs:103-122, :245-258, ship-plan.mjs:287-303, divergence.mjs:33,45). On the last live run the model linked two units that merely share src/strings.mjs. One hit two HTTP 429s and parked; the second parked as blocked-by-parked-prerequisite without ever being dispatched, after its plan was already written and paid for. Separately, the per-tick lease (leases.mjs:69,78) already refuses to co-dispatch overlapping edit scopes in a synchronous batch loop, so the edge buys no concurrency safety it does not already have. derive-edges.mjs:246-258 computes overlap deterministically and tags it fileScope-overlap, but is not wired into cli.mjs at all. The user ruled that dependsOn exists to serve safe parallel execution and must not hinder it.

## Options

- Keep blocking-at-start: no change, and accept that any transient dispatch failure parks the whole dependent subtree
- Merge-only ordering: drop the prereq check from the start gate; rejected because gateBaseChain and PR stacking would then claim a child was built on a parent it was not, and the lease already prevents co-dispatch so there is no throughput gain
- Semantic edges only: redefine dependsOn in the prompt and let file overlap rely on the lease; leaves same-file pairs with no merge ordering, so both PRs base on trunk
- Two edge kinds: machine-derive an overlap edge from fileScope that orders the merge only, and redefine dependsOn as semantic; overlap lands first because it is purely additive

## Outcome

Two edge kinds, each with exactly one job. An overlap edge is derived deterministically from fileScope, never from model judgment, and feeds only the gate base, the PR parent record and divergence; it never gates the start and never propagates a park. dependsOn is redefined as semantic only, meaning B cannot compile or run without A, and keeps the start gate and failure propagation where they are correct. Overlap computation fails CLOSED: a missing or unparseable fileScope is treated as overlapping. The two ship in that order, overlap first, because the prompt change alone would strip same-file pairs of merge ordering until the follow-up landed. The decisive argument is that today the only thing standing between two same-file units and lost work is an undefined word in a prompt, and a computation replaces a guess.
