---
Status: accepted
Date: 2026-08-16T22:02:48.083Z
Thread-Id: 01KZTEFMENXBW30ZE633YNFJHE
---

# 0485. c6's pre-move baseline comparison is struck as unsatisfiable at any merge order

## Context

c6 demands a measured comparison against the pre-move baseline with cold and warm cache reported separately. Decision 0473 reasoned that the live legacy engine on origin/main was the only remaining source for that arm and that merging would destroy it. That premise is true only for a dispatch count. origin/main:.claude/workflows/mitosis.js contains zero occurrences of total_cost_usd, cache_read_input_tokens or cache_creation_input_tokens, and its dispatch at :1268-1277 delegates to the Workflow agent() primitive and records nothing durable. The cost, token and cache dimension of the comparison never existed, so no merge order recovers it; the arm is unsatisfiable by construction rather than merely inconvenient. Separately the cold/warm clause needs no second run: dispatch.mjs:570-594 normalizes cache_creation_input_tokens and cache_read_input_tokens as distinct per-dispatch fields, so the wired instrument separates cold from warm natively.

## Options

- Strike the baseline sub-clause as unsatisfiable
- Hold c6 open indefinitely against evidence that cannot exist
- Substitute a dispatch-count-only baseline reconstructed from a live log capture before merging

## Outcome

The user struck c6's pre-move baseline comparison sub-clause as unsatisfiable, on the record that the legacy engine captures no cost, token or cache field at any merge order. c6's remaining clauses stand: cold versus warm cache reported separately, which the wired instrument satisfies natively, and every cost claim paired with a fixed quality assertion. This corrects the premise of 0473, which treated the baseline as a live asset the merge would destroy. The dispatch-count-only substitute was rejected as fragile and already refused in 0474, and it yields no cost figure in any case. Recorded as a human scope ruling because receipts holds acceptance as a ceiling that an agent may propose against but never amend. 0358's three-run pinned-state baseline remains filed separately and is not what c6 or c7 gates on.
