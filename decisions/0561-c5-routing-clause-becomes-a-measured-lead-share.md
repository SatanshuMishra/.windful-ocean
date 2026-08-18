---
Status: accepted
Date: 2026-08-18T05:15:49.971Z
Thread-Id: 01M04HH9W6HVPQJDPW24WH48GC
---

# 0561. c5's routing clause becomes a measured Lead share, sequenced strictly after wave 7 ships

## Context

A direct observation during this session raised the question. Across roughly a dozen dispatches the main thread reached for implementer, test-engineer and codebase-analyst every time and never once for a Lead, even though the units dispatched - a scoped change, driven to green, handed back with a receipt - are precisely delivery-lead's description. Part of that is that the Leads only became dispatchable an hour before, but the pattern is the thing the design most needs to be false. Routing is judgment, not enforcement: the only hard constraint is the Agent tool grant, which stops a non-Lead fanning out but never obliges the orchestrator to choose a Lead. If the main thread does not reach for them, the entire Lead band is decorative and decision 0467's four-band shape delivers nothing. c5 already owns this: its first clause reads "dispatch routes to the intended agents". The defect is that the clause has NO FAILING STATE. Nothing in it can be graded, so it would pass by assertion whatever the dispatch log said - the same unfalsifiable-check shape SPEC section 4 names three times and this thread has now caught four. The user's instruction was explicit on two points: the measurement is a requirement of THIS thread rather than a successor, and no scope may be added ahead of the work already in flight.

## Options

- Insert a new criterion c8 for the routing measurement
- Rewrite c5 so its existing routing clause is measurable and explicitly last
- Open a successor thread for the measurement
- Leave c5 as written and grade the routing clause by judgement at close-out

## Outcome

Rewrite c5 rather than insert c8. The measurement is NOT new scope - it is the first clause of an existing criterion, stated too loosely to be closable - so the honest fix is to make the existing obligation falsifiable, not to grow the criteria list. A separate c8 was rejected because it would split one property across two criteria and would read as scope growth, which is exactly what the user ruled out. A successor thread was rejected on the same instruction. Leaving it to judgement was rejected because a criterion that cannot fail is the defect, not the remedy. The rewritten clause requires the observer log to be queried for the share of dispatches that reached a Lead, over the window after wave 7 ships, with a stated threshold pinned BEFORE the window opens so the result cannot be graded to whatever it happens to be. A share at or near zero is a real finding and closes the criterion honestly by naming the Lead band as unreached; it does not fail the thread, and the remedy if it occurs is the description text in the agent files, since the description is the only routing surface the orchestrator ever sees. ORDERING IS BINDING: the measurement window opens only once U7.1 has shipped and the nine retired agents are gone, because a log gathered while both rosters are live cannot distinguish a Lead not chosen from a retired agent still available. Nothing about this is started before waves 6 and 7 are complete.
