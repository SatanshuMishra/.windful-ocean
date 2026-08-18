---
Status: accepted
Date: 2026-08-18T20:50:14.129Z
Thread-Id: 01M04HH9W6HVPQJDPW24WH48GC
---

# 0592. The sensitivity test fired: Lead share inverts on agent-id reuse, so c5 stays open

## Context

The two Lead-share readings pinned in 0591 were computed through the unmodified instrument over the windowed corpus, both at n well above 20. Reading 1, multi-start groups included, is 164 of 270 start rows = 60.74 percent. Reading 2, those groups excluded entirely, is 43 of 147 = 29.25 percent, and there row grain and group grain coincide exactly, so its n is unambiguous. The readings do not merely differ, they INVERT across the 50 percent bar, because 111 of the 123 removed start rows are delivery-lead. Dropping the non-roster fork agent type moves neither side across. The other two verdicts came out clean: attribution is 100 percent at both grains, 165 of 165 groups and 270 of 270 start rows, established by the absence of any unattributed bucket rather than assumed; and the key census classified 1898 rows into two declared shapes with zero unclassifiable, with the halt OBSERVED - a single row carrying one extra key produced exit 6 and zero bytes of stdout. The worker also refused the dispatch-outcome census as the c5 census on principle, because its largest bucket is a residual computed by subtraction, which is the shape that silently absorbs an unclassifiable group rather than halting on it.

## Options

- Report reading 1, which clears the bar, and close c5
- Reconcile the two readings into a single preferred figure
- Apply the rule pinned in 0591 before the numbers existed

## Outcome

c5 STAYS OPEN. The rule pinned in 0591 said that if the two readings disagree on the bar or the minimum window, the disagreement is the finding - and they invert, which is the strongest form of that disagreement. Neither reading is reported as preferred and the two are not reconciled; doing either would be exactly the post-hoc grading the pre-commitment existed to prevent, and the pre-commitment is worth nothing if it is only honoured when it clears. Agent-id reuse at dispatch grain becomes its own unit: whether 19 start rows under one id are one dispatch logged repeatedly or nineteen distinct dispatches decides which reading is real, and until it is settled the Lead band's share is genuinely unknown rather than merely imprecise. Two clauses ARE met and are recorded as met so the reuse unit inherits them rather than re-deriving them: attribution complete at both grains, and the outcome census closed with its halt observed rather than asserted. The predicate and grain repair ships regardless - it is correct work on its own evidence, and its pull request must carry no claim that c5 closed.
