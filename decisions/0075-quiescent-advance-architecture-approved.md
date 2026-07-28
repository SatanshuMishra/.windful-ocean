---
Status: accepted
Date: 2026-07-28T19:30:11.252Z
Thread-Id: 01KYKNBCAE9EH8W1S6HJ8XB9XF
---

# 0075. Quiescent-advance architecture approved; implementation dispatched in a fresh session

## Context

The 2026-07-28 spec had sat PROPOSED behind five approval asks. A six-agent research pass closed the four open technical questions on the thread (PAT vs App token, where a replay conflict surfaces, concurrency per child MSP, cost of determinizing the advance) and surfaced one blocker the spec had not seen: the MSP identity table is local-only, so the design's load-bearing durability claim was false anywhere except the originating machine.

## Options

- Approve the architecture as written and implement
- Approve with the durable run-identity addition, and rule the invoker question closed
- Hold for another research round before approving
- Reject and re-scope around a different waiting model

## Outcome

APPROVED with the durable run-identity addition. Spec status flipped PROPOSED -> APPROVED (architecture); 0069 added to binding decisions. Implementation explicitly deferred to a FRESH session, to be dispatched as a targeted dynamic workflow. Three sub-decisions remain open and gate only the MSPs named against them: (a) M0 standalone authorization, (b) BUILD_AHEAD_CAP value, (c) class-6 file-level vs line-level assertion guard. M1, M2, M6, M3, M5, M7 are ungated. M0 remains separately unauthorized and must not land silently under the architecture approval.
