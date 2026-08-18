---
Status: accepted
Date: 2026-08-18T20:30:54.960Z
Thread-Id: 01M04HH9W6HVPQJDPW24WH48GC
---

# 0591. Settle the agent-id reuse doubt by a sensitivity test pinned before the number is recomputed

## Context

While preparing the windowed corpus, a worker filed that agent_id appears to be REUSED across dispatches: one (session_id, agent_id) group holds 9 start rows and 7 stop rows. Earlier readings recorded the same shape as duplicate start rows - one agent emitting 17, another 19. The two readings are not the same claim. Duplication leaves dispatch grain sound and the counts intact. Reuse means the grain MERGES distinct dispatches, which would undercount n, and would let one real dispatch promote an artifact-less sibling sharing its id through the bool_or - the exact inflation the sidecar predicate was chosen to prevent. Every c5 verdict is computed at that grain, so the doubt reaches the criterion's evidence rather than sitting above its ceiling. Resolving reuse definitively is a genuine investigation and would be scope growth on a closing unit; leaving it unexamined would close c5 on a grain nobody checked.

## Options

- Investigate agent-id reuse fully before closing c5, growing the closing unit into a new investigation
- File it and close c5 regardless, on a grain whose soundness is in doubt
- Test whether the VERDICT depends on the ambiguity, rather than resolving the ambiguity itself

## Outcome

A sensitivity test, pinned NOW and before any number is recomputed. The Lead share is computed twice over the window: once with the ambiguous multi-start groups included, once with them excluded entirely. If BOTH readings clear 50 percent at n of 20 or more, the verdict is robust to the ambiguity, c5 closes, and agent-id reuse is recorded as a bounded known limit on the grain rather than a blocker. If the two readings DISAGREE on either the bar or the minimum window, c5 STAYS OPEN and the reuse question becomes its own unit - that disagreement is then the finding, not a nuisance to be argued past. This tests whether the answer depends on the doubt instead of resolving the doubt, which is proportionate to a closing unit and cannot be graded to fit, because the rule is fixed before the numbers exist. Separately: the unexplained modification to audit-queries.test.mjs is almost certainly this unit's own red test, written by the sibling test-engineer into the shared checkout, and must be checked against that before any investigation is opened.
