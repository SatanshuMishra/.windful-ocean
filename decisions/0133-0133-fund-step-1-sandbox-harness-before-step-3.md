---
Status: accepted
Date: 2026-07-30T17:22:50.920Z
Thread-Id: 01KYR405KFXHM15J5XXK5BXTVT
---

# 0133. Fund Step 1 (sandbox-fidelity harness) next, ahead of Step 3, overriding the breadth-of-unblock argument

## Context

With MSP-0 merged (12053dc), the open question was which hard precondition to fund. Re-derived status against origin/main, independent of the spec's poisoned citations: Step 0 NOT-LANDED, Step 1 NOT-LANDED, Step 1.5 PARTIAL, Step 2 NOT-LANDED, Step 3 NOT-LANDED. This reproduces 0126's four-NOT-LANDED / one-PARTIAL split.

The carried planning note was "step 1.5 cheapest, step 3 unblocks most". Both halves check out arithmetically, but the note omits a dependency: 0116 states Step 1.5's own correctness depends on Step 1 landing first, to prove the shared-readiness property under streaming. Step 1 is NOT-LANDED, so Step 1.5 funded in isolation produces a flip that cannot be honestly verified.

The audit recommended Step 3 on breadth: it converts MSP-1's currently-unpayable falsifier into something gate-able and transitively clears the whole bottom-up MSP sequence, where Step 1.5 unblocks MSP-11 alone by direct citation.

The counter-argument, which won: Step 1 blocks all six collapse MSPs equally and more fundamentally. Every MSP's acceptance criterion is a test-suite assertion, and the suite currently reconstructs the engine via new AsyncFunction('args','agent','parallel','log','phase','workflow', mitosisBody) in real Node - a strictly more permissive context than the production sandbox, which has no import, fetch, process or filesystem. Today's green therefore certifies nothing about a rebuilt core. This thread's standing top risk is that a false-clean gate is worse than no gate, and 0130 recorded MSP-0 shipping three reproduced false-clean paths plus a tautological test. Funding Step 3 first means building a several-hundred-LOC journal subsystem across 4-6 files whose acceptance tests prove nothing - the same failure mode as 0130, one level up and at much larger scale.

Pillar resolution: Quality over Optimization over Speed. Step 3's broader unblock is an optimization of sequencing throughput; trustworthy verification is correctness. The higher pillar wins.

## Options

- Step 1 - sandbox-fidelity harness: broadest single blocker, makes every downstream acceptance criterion mean something, and is itself a prerequisite of Step 1.5
- Step 3 - durable state model and journal: the audit's pick on transitive unblock breadth; several hundred LOC across 4-6 files, all behind per-write approval
- Step 1.5 - streaming scheduler flip: cheapest by a wide margin, low tens of lines, but unblocks MSP-11 alone and is itself gated behind the NOT-LANDED Step 1
- Step 0 - worktree reaper: real operational friction (12 leaked worktrees, ~78 MB, reaper verb absent entirely) that taxes every MSP dispatch, but does not gate correctness

## Outcome

Fund Step 1, the sandbox-fidelity harness, next. Chosen by the user over the audit's Step 3 recommendation.

Rationale of record: no other precondition's work can be trusted until the harness stops certifying production behaviour with an over-permissive AsyncFunction reconstruction. Landing Step 3's journal subsystem on that harness would repeat 0130's false-clean failure at several hundred LOC instead of one gate.

Consequences: Step 1.5 stays parked and stops being described as "cheapest next" - it is not fundable in isolation until Step 1 lands. Step 3 remains the correct SECOND precondition to fund, and MSP-1 stays BLOCKED until it does. Step 0's leaked worktrees remain live operational friction to be dispositioned separately.

Every acceptance criterion written for Step 1 must be proved with a reproduced probe, never on green tests alone - the harness is itself a gate, and this thread's standing rule for gate MSPs applies to it with full force.
