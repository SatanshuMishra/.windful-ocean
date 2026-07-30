---
Status: accepted
Date: 2026-07-30T05:41:25.925Z
Thread-Id: 01KYR405KFXHM15J5XXK5BXTVT
---

# 0116. Landing order amended to eight entries; task-edge derivation stays LSP-grounded pending one probe; the streaming flip is not a reversal of 0104

## Context

0113 and 0115 each imply a change to the six-step order fixed by 0112. Separately, the Fable architect's 0115 design derived task edges from fileScope overlap ALONE, dropping the LSP call-hierarchy pass, arguing a missed semantic edge surfaces as a loud integrate conflict or red gate rather than silent corruption.

## Options

- Accept fileScope-only edges and rely on downstream failure to catch missed semantic edges
- Keep edges LSP-grounded but move derivation from a model exploration into a deterministic verb
- Keep the third model exploration as-is

## Outcome

ORDER AMENDED and fileScope-only PARTIALLY REJECTED; both approved by the user. AMENDED ORDER, eight entries: (0) the worktree reaper per 0113 - engine-external, needs neither the sandbox harness nor the state model, fixes the live 78 MB leak at the next session start, and unblocks step 4; (1) a test harness reproducing the real sandbox global surface, unchanged, and a precondition for both the streaming flip and verb extraction; (1.5) the streaming-scheduler flip plus run-setup parallelization, NEW and cheap; (2) kill the 21-module twinning tax; (3) the durable state model, now also absorbing the journal-append verb and the piggyback rule; (4) restack as a deterministic activity, where unit-prep IS the primitive; (5) speculation depth, unchanged and settled; (6) the fix pipeline, now also landing the phase collapse. EDGE DERIVATION: fileScope-only rejected. tool-routing.md names native LSP call hierarchy as THE dependency oracle and states graphify call-graph recall is too low to gate parallel-safety; fileScope overlap is weaker than both and misses cross-file call dependencies, so accepting it trades Quality for Speed against the pillar order. The amendment is to DELETE THE EXPLORATION WITHOUT DELETING THE ORACLE - edges stay LSP-grounded but derivation becomes a deterministic verb driving LSP, not a third model exploration. OPEN, with its falsifier attached per 0112 rule 3: whether LSP call hierarchy can be driven from a CLI verb at all, or must remain one scoped model dispatch. That probe runs BEFORE the spec is written; the 0103-to-0107 sequence is the standing case study for what skipping it costs. THE STREAMING FLIP IS NOT A REVERSAL OF 0104 and must never be recorded as one: 0104 ruled STREAMING_DISPATCH_ENABLED irrelevant to MERGE-GATED throughput, still true because both schedulers share the isDispatchable readiness rule. The flip is taken for a different, separately-conceded cost - the tick join (:1992-1994, used :2031) holds a unit's slot through a CI watch of up to 1800 seconds (:4660), which is pure INTRA-TICK machine time, exactly the secondary cost 0104 acknowledged. Zero new code: the scheduler exists at :2080-2129, the constant at :2131, and runSchedule already accepts an opts.streaming override at :2133-2138 that the call site at :4814-4823 never passes. Safe because both paths share the identical readiness rule and lease table, acquiring at dispatch (:2098) and releasing per unit on settle (:2106); the precondition is that step 1's harness exercise the shared-readiness property first.
