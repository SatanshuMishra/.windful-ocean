---
Status: accepted
Date: 2026-08-16T00:39:42.667Z
Thread-Id: 01KZTEFMENXBW30ZE633YNFJHE
---

# 0451. C7 keeps the tick and epoch loop and runs each tick's dispatchable set through the pool

## Context

The SPEC sentence at design.md:520 - runSchedule, runScheduleTick, joinTick and runEngine port onto A2's pool, and the Promise.allSettled tick loop is replaced by DAG scheduling - is under-specified against what A2 shipped. pool.mjs::runGraph takes a STATIC graph, settles every node exactly once (:213-216, :235-241), drains with Promise.race (:293-313) and takes a narrow-only integer cap (:158-164). The incumbent scheduler re-dispatches a unit on each new state epoch (leases.mjs:154-164), serializes units dynamically on overlapping fileScope.edit sets (:42-75, :121-128), gates admission on a live build-ahead window whose size may be re-resolved every iteration (:59-69, :112-114, :156), and awaits the whole tick before re-planning (leases.mjs:143). pool.test.mjs:633 and leases.test.mjs:431 assert directly contradictory properties. File-scope serialization is a safety property, not an optimization. D2 deletes mitosis.js, so keeping the incumbent as a fallback is unavailable.

## Options

- Shape A: the tick and epoch loop is retained in the new engine.mjs, and runGraph executes each tick's dispatchable set as a fresh edgeless graph. Nothing shipped is edited; no test is deleted.
- Shape B: one runGraph over the whole run, static dependency DAG as readyAfter, lease and window admission enforced inside dispatchFn. Disqualified: epoch re-dispatch is inexpressible because the epoch count is not statically bounded, and a dispatchFn awaiting a lease occupies a concurrency slot, so mutually overlapping units self-deadlock. It also requires deleting leases.test.mjs:275 and :290, which assert a real capability rather than a scheduler artifact.
- Shape C: extend pool.mjs with dynamic admission and node re-entry. Disqualified: re-entry makes censusOrThrow's exactly-one-record guarantee false and breaks the two determinism tests A2 shipped to prove it (pool.test.mjs:446, :802); fileScope.edit is also a mitosis domain rule that does not belong in a general CLI-exposed DAG runner.

## Outcome

Shape A. It is the only shape that keeps epoch re-dispatch, dynamic lease serialization and the live build-ahead window without editing a shipped green module or deleting a test that asserts a real capability. The apparent pool.test.mjs:633 versus leases.test.mjs:431 contradiction dissolves because the properties sit at different layers: the pool guarantees no barrier WITHIN a graph, the engine imposes a barrier BETWEEN ticks. Both stay green. Named cost, declared rather than discovered: A delivers the SPEC sentence only halfway - Promise.allSettled becomes a Promise.race drain over an edgeless set, and because planTick imposes no count limit on dispatchable units, a tick wider than the cap of 8 now serializes where it previously did not. That narrowing is intended behaviour and belongs in C7's acceptance. Falsifier: if C7's acceptance or D3's measured comparison ever requires cross-tick overlap, a throughput gain only a barrier-free engine produces, shape A is wrong. Checked at ratification: D3's falsifier counts dispatches per shipped MSP, not wall-clock, and C7's acceptance names journal, refs, PR calls, quiescent exit and abort recording - none requires cross-tick overlap.
