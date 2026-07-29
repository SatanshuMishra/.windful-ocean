---
Status: accepted
Date: 2026-07-29T23:44:23.394Z
Thread-Id: 01KYR405KFXHM15J5XXK5BXTVT
---

# 0104. Per-run throughput is bounded by root-antichain width times human merge latency; no fan-out redesign can fix it

## Context

The user's primary complaint is that mitosis is slow (10hr+ and millions of tokens for a completion or partial failure) and asked that the two-layer fan-out be preserved through any rebuild. During the audit I briefly mischaracterized the disabled STREAMING_DISPATCH_ENABLED flag as an unexploited quick win for the slowness problem, which sent the investigation toward scheduler mechanics. A gap-close pass over git history, specs, and ledger decision records established the actual constraint, and the researcher independently confirmed the consequence from prior art.

## Options

- Treat the tick-join barrier as the throughput bottleneck and flip the streaming scheduler
- Treat scheduler width and wave barriers as the bottleneck and invest in parallelism redesign
- Accept that dependent readiness gated on human-approved merges is the binding constraint and target the cost of waiting instead

## Outcome

The DOMINANT constraint is that dependent units gate on their prerequisite reaching state done, done means MERGED, and every merge is human-gated. Per-run throughput therefore equals the width of the dependency graph's root antichain times human review latency. Both the tick and streaming schedulers share the isDispatchable readiness rule (leases.mjs:49-56), so the flag is irrelevant to it — a ratified 2026-07-16 decision states verbatim "Flipping STREAMING_DISPATCH_ENABLED does NOT fix it (shared readiness rule)" (.claude/ledger-archive-v1/decisions/2026-07-16-mitosis-frontier-train-architecture.md:6). The tick barrier was correctly assessed as a SECONDARY cause, and its penalty is narrower still: an awaiting (PR-open) parent does not block dependents, so the join cost is intra-tick wall-clock only, never across the merge gate. CONSEQUENCE, which must not be softened: the two-layer fan-out is safety-and-isolation machinery, not a throughput machine. Optimizing scheduler cleverness while each wait costs a full relaunch is optimizing the non-bottleneck. The only architectural lever is making WAITING FREE — a durable-execution engine parks on a human signal at zero compute and resumes where it stopped, whereas mitosis dies after roughly 30 minutes of polling (MERGE_POLL_MAX_CYCLES 6 x 300s), reports failed, and re-pays decompose-and-rebuild on relaunch. Measured wall-clock is an estimated 45-60% human latency plus relaunch re-payment. Expectation to set before any rebuild: wall-clock shipping speed will barely improve; the real wins are token cost and crash-loss.
