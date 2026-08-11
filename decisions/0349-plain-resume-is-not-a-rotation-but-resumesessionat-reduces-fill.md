---
Status: accepted
Date: 2026-08-11T21:33:44.084Z
Thread-Id: 01KZQ2BVF2386ATV5YFD43NQVX
---

# 0349. Plain resume is not a rotation, but resumeSessionAt is a measured fill-reducing primitive

## Context

0342 rejected the option "full transcript replay via the Agent SDK resume contract" as the mechanism for carrying state across an orchestrator context rotation, in favour of four tiers split by author trust. The 2026-08-11 probe measured both halves of that rejection. AVAILABILITY, overturned: full replay is available and complete. A trivial resumed turn in a new OS process billed 70,483 input-side tokens against a 163-token fresh baseline, a delta of 70,320 against the 70,368 originally loaded, roughly 99.93% returned. It was also cheaper and faster than a reading-based estimate predicted - those tokens arrived as cache_read_input_tokens, so the prompt cache survived process exit, costing $0.0074468 against the $0.211985 the same content cost to create, and the resumed turn completed in 2,144ms api against the fresh trivial baseline's 5,331ms. FILL, confirmed exactly: getContextUsage().totalTokens after resume equals the pre-rotation total to the token. NEW FACT not in the option set when 0342 was decided: Options.resumeSessionAt exists in 0.3.228 and measurably reduces fill. On a clean session the control taken BEFORE any rewind answered "PELICAN-11, MARLIN-42" at 494 input-side tokens; the rewound turn answered "PELICAN-11" only at 407. The dropped secret stayed physically on disk - the file GREW 16,141 to 23,349 bytes - and the session id did not change. The transcript becomes a tree: two records then share one parentUuid. A first attempt was discarded as ambiguous because its control ran after the rewind and was contaminated by it.

## Options

- Restate 0342's rejection on the fill ground and design-pass resumeSessionAt against the four tiers - chosen
- Adopt resumeSessionAt as the rotation mechanism and retire the four-tier design
- Leave 0342 as written

## Outcome

0342's REJECTION STANDS but its stated ground is corrected: full transcript replay is rejected not because the mechanism is unavailable or partial - it is neither - but because plain resume preserves 100% of prior fill and therefore relocates a conversation to a new process without shrinking it. Plain resume is not a rotation. The four-tier split by author trust stands as the state-carry model and is NOT retired. resumeSessionAt is ADMITTED as a newly-available, measured fill-reducing primitive that must be design-passed against the four tiers before any SPEC text is written; it is not adopted sight-unseen, because what it drops is a contiguous tail chosen by message uuid, whereas the four tiers drop by author trust, and those two selection rules are not interchangeable. The design pass must answer whether a tail-drop can preserve Tier 1 constraints that happen to live in the dropped tail - if it cannot, the two compose rather than compete, with resumeSessionAt shrinking the window and Tier 1 re-injection restoring what the tail-drop lost. Unmeasured and blocking that pass: forkSession combined with resumeSessionAt, the combination most relevant to branching a rotation, was never run.
