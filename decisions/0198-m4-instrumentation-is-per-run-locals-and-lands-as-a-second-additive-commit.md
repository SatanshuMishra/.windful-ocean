---
Status: accepted
Date: 2026-08-02T04:49:13.889Z
Thread-Id: 01KYR405KFXHM15J5XXK5BXTVT
---

# 0198. M4's divergence instrumentation is per-run locals logged once, not a durable delta kind, and lands as a second additive commit

## Context

0196 left open whether spec section 3.3's divergence count and rebuild-unit count are per-run locals logged once, or a durable new applyRunDelta record kind requiring a case in both twins. The grounding pass measured the landing site: planReconcile has exactly ONE production call site, mitosis.js:3947, inside the isRelaunch && reusable && builtUnits.length > 0 block at :3936-3989, so it is a pre-loop one-shot rather than a per-iteration call. Both counters are already-computed integers needing no new traversal and no timestamp - which matters because workflow-sandbox.mjs:39,46 traps the whole Date global and grep -c Date mitosis.js is 0, so the engine is genuinely Date-free. Section 12 item 3 states the purpose: fixed K may cost a rebuild burst on deep chains, and that cost is unmeasured. Section 11 additionally forbids a test here, because asserting on a log string is a change detector.

## Options

- Per-run locals accumulated at the existing reset loop and logged once, no applyRunDelta change
- A durable new applyRunDelta record kind so counts survive a relaunch, with a case in both twins
- Ride the existing 'window' delta kind rather than adding a new one

## Outcome

PER-RUN LOCALS, logged once at the existing per-id reset loop (mitosis.js:3949-3967, which already logs RESET by divergent-invalidation per unit). No applyRunDelta change, no new record kind, no twin obligation, no run-log.test.mjs change, and NO TEST - section 11 refuses one and the dispatch must not let an agent add one. The durable option is rejected on correctness before simplicity, and that ordering is the point: because planReconcile fires once per invocation, the per-run number IS the quantity section 12 item 3 asks for - the burst size of a single advance. A lifetime total summed across relaunches would BLUR that signal rather than sharpen it, so durability would buy a worse measurement at a higher cost. It is also self-contradictory to add journal-folded state inside the MSP whose whole purpose is deleting journal-folded state, and 0197 deletes the only existing window record kind in the same change. Riding the 'window' kind is rejected outright: 0197 kills its producer. TWO HONESTY CONSTRAINTS. The counters must be emitted only on the path where planReconcile actually ran; a fresh run never enters that block, and printing divergence=0 rebuilt=0 there would be the run reporting a measurement it never took - the section 1 defect class, reintroduced by the instrumentation meant to serve section 3.6, exactly as the M5 latency emitter had to be corrected for. And the counting site must be chosen to need NO twin change if possible: rebuildUnitCount is available mitosis.js-only as advance.toParkSubtree.length, while the divergence count may not be derivable from planReconcile's existing return shape. If it is not, adding ONE integer to that return shape is acceptable and lands in BOTH twins in that same commit - it is not a reason to reach for durability. LANDING SHAPE: the instrumentation is a SECOND, purely additive commit after the deletion commit, so each commit leaves the branch green on its own and the additive change is reviewable apart from the interlocked deletion.
