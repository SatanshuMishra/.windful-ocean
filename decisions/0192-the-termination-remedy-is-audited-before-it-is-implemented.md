---
Status: accepted
Date: 2026-08-02T01:24:51.044Z
Thread-Id: 01KYR405KFXHM15J5XXK5BXTVT
---

# 0192. The termination-observability remedy is independently audited, researched and verified before any implementation, rather than dispatched on the orchestrator's recommendation

## Context

0191 established that the one substantive M5 finding is that termination on the no-actions path is unobservable: removing the quiescent exit hangs the suite instead of reddening a test, because the spin is synchronous and node:test's timeout option cannot fire. The inertness verifier proposed two remedies — drive runScheduleTick in a child process with a hard kill and assert normal exit (or assert an observable bound such as dispatched-epoch set size or tick count on a fixture whose planTick output is non-empty forever), OR declare the limit candidly in the M3 receipt row. The orchestrator recommended the bounded test on the Quality pillar, reasoning that once maxSteps is deleted the termination claim is load-bearing for liveness and a declared limit leaves the central guarantee unpinned precisely where the change made it matter. The user read that recommendation and ruled on how it is to be handled. The recommendation is unproven in three specific ways: a child-process test is a new pattern for this suite with no precedent in it, the test must be proven able to FAIL against an exit-removed mutant or it proves nothing, and it must not introduce flakiness or a sleep dependency, which the project's testing discipline forbids outright.

## Options

- Dispatch the bounded-test remedy directly on the orchestrator's recommendation, as the next workflow's contract
- Audit, research and verify the recommended remedy with dedicated subagents FIRST, then dispatch a small targeted workflow to implement and ship
- Take the verifier's alternative and declare the limit in the M3 receipt row without a new test
- Defer the termination question entirely and ship M5 with the gap declared

## Outcome

AUDIT FIRST, THEN A SMALL TARGETED DISPATCH — explicit user directive at close, and it is a directive about METHOD, not about the answer. In a FRESH session, dedicated subagent(s) AUDIT, RESEARCH and VERIFY the recommended solution before a line of it is written; only then does a SMALL TARGETED dynamic workflow complete M5 and ship. The audit must weigh the bounded child-process test against the verifier's declare-the-limit alternative rather than assume the recommendation wins, and must establish: whether a child-process termination test is achievable in this suite at all; whether it can be PROVEN to fail against an engine mutated to remove the quiescent exit, since a test that has never failed proves nothing; whether any observable bound (dispatched-epoch set size, tick count) gives a cheaper in-process red than a child process; and whether the result is deterministic without sleeps, which testing discipline forbids. If the audit finds no bounded test is achievable, the honest fallback is already specified: state plainly in the M3 receipt row that exit-removal manifests as a full-suite hang with zero reddening, measured, rather than leaving the row implying termination is pinned. RATIONALE for auditing rather than dispatching: the recommendation is a Quality-pillar judgment resting on an untried pattern, and this thread's standing method rule — now nine instances deep — is that a confident finding is verified against the mechanism before it is acted on. That rule applies to the orchestrator's own recommendations, not only to subagents'.
