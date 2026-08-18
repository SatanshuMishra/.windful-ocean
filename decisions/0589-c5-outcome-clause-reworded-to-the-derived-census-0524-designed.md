---
Status: accepted
Date: 2026-08-18T19:58:23.457Z
Thread-Id: 01M04HH9W6HVPQJDPW24WH48GC
---

# 0589. Reword c5's outcome clause to the derived closed census that 0524 deliberately designed

## Context

c5 required the observer to record an outcome. It does not, and decision 0524 made that deliberate: outcome, along with duration and token counts, is derived at audit time rather than stored as a field. What the log actually holds is a terminal EVENT for 84.35 percent of real dispatches, and a derived census that is closed over 100 percent of them into completed, inferred-dead and in-flight. It never records success versus failure, and no query can make it. So the clause as written was unsatisfiable against an architecture that had already decided otherwise, which makes it a defect in the criterion rather than in the observer. The other two clauses are met on evidence: Lead share 88.89 percent at n=27 against the pinned 50 percent, with independent out-of-repository traffic clearing it alone at 75 percent (0586); and attribution 100 percent over real dispatches in the window, once the 99.13 percent artifact-less population that never was a dispatch is correctly excluded from the denominator (0588). The user was given the plain-reading alternative, which leaves c5 open indefinitely pending a stored outcome field that would contradict 0524, and the split alternative. The user chose the amendment.

## Options

- Amend the clause to match what 0524 designed - a terminal event plus a closed derived census that halts on the unclassifiable
- Keep the literal wording, leaving c5 unmet until a stored success-or-failure field is built, contradicting 0524
- Split c5, closing the Lead-share and attribution halves now and carrying the outcome question as a new criterion

## Outcome

c5 is reworded to require what the architecture actually provides and what can actually be checked: the observer attributes every real dispatch, the audit derives a CLOSED outcome census that halts on anything it cannot classify, and the Lead share clears its pinned bar. The census requirement is the non-vacuous half - a census that halts on the unclassifiable cannot pass over nothing, which is the failure mode a reworded criterion would otherwise invite. Deliberately NOT folded into the rewrite: the 84.35 percent terminal-event coverage is reported rather than made a threshold, because pinning a bar for it now, after the figure has been seen, is exactly the post-hoc grading that 0579 and 0561 exist to prevent. The genuine dropped-start population of at least 23, and the pre-2026-08-17T19:00Z regime where the start hook emitted nothing while stops landed, remain filed as separate items and are not absorbed by this rewording.
