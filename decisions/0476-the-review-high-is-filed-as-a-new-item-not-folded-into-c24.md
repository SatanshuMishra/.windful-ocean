---
Status: accepted
Date: 2026-08-16T18:43:20.640Z
Thread-Id: 01KZTEFMENXBW30ZE633YNFJHE
---

# 0476. The review's HIGH is filed as a new item rather than reopening c24, and is fixed before the run

## Context

c24's wiring shipped as commit 5c7c509a with its declared ceiling met: red on the parent with three failing assertions, three scoped inertness mutations, the suite at 2610 tests with zero failures, and the determinism verb unchanged at ok true. An advisory review then tried to construct a miscount and could not, walking ledger.start as the sole running emitter, invoke's three branches each calling finish exactly once, censusOrThrow enforcing one terminal per node, and retry interleaving across sequential ticks. The dispatch COUNT is sound. It did find that the COST side under-reports on a reachable path: runEngine awaits record() after runUnit returns but before the pool settles, so a throw there settles dispatch-threw with a null envelope, and a child succeeding without a structured sha yields Done with a null sha whose disposition is in CHECKPOINTED, so writeRef runs and requireSha throws after the tokens were already spent. Two further findings bear on evidence integrity: usageRecorder is ordered behind a stderr writer that can EPIPE and abort the observer loop, losing a line outright, and the summary omits runKey and attempt while allocateAttempt increments per invocation, so a reader can silently consult a stale attempt directory.

## Options

- Reopen c24 and fold the review findings into it
- Run now, since the count is sound and only cost fidelity is degraded
- File the findings as a new item and clear it before the run

## Outcome

c24 stays met and is not reopened. Under receipts the enforcer is the gate and review is advisory, so a finding that breaks no declared criterion is filed rather than fixed in flight, and c24's criterion spoke to a durable per-attempt record with a correct count, which the review independently confirmed. The findings become a new criterion covering the evidence-integrity set: the billed-as-unbilled HIGH, the observer ordering that can lose a line, the missing runKey and attempt pointer, and the two divergent envelope schemas in the same file. The latent ADT-closure gap, the unfrozen objects, the dead injection seam and the two weak test assertions are filed and not worked. Running now was rejected on scarcity rather than on severity: the falsifier is a count and would have been answered correctly today, but this is the one clean first run, and capturing degraded cost fields would force a second run to recover numbers obtainable on the first.
