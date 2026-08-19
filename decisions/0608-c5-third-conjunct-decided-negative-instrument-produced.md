---
Status: accepted
Date: 2026-08-19T01:24:34.092Z
Thread-Id: 01M04HH9W6HVPQJDPW24WH48GC
---

# 0608. c5's third conjunct is decided negative: Lead share 24.23 to 26.60 percent at n of 421, instrument-produced

## Context

Round 1 could only bound Lead share by hand at a 38.24 percent ceiling, carrying unverified-reasoned on both the value and the verdict. The user ruled to fix the instrument and re-read rather than accept a hand-derived negative. The blocking defects were cleared: the LEFT JOIN cartesian fan-out in ran-and-duration, which reported 2872 start rows against a true 667 and produced a negative minimum duration by pairing a later start against an earlier stop; the absence of any halting agent-type census; the agent-type split hardcoded in contract.mjs; and an npm test glob that excluded the agent-audit suite entirely.

## Options

- Report the round-1 hand-derived ceiling as the answer
- Produce the figure end to end through the repaired instrument
- Leave the third conjunct unmeasured

## Outcome

FAIL, decided rather than refused, and now produced BY the instrument end to end. Leads are 102 of 421 dispatch groups; 10 groups across 3 values remain unclassifiable, so the figure is bounded at 24.23 to 26.60 percent. n of 421 clears the n of 20 minimum, and the 50 percent bar pinned in 0591 sits roughly 24 points above the ceiling, so no classification of the remaining 10 groups could reach it. The fan-out fix carries the full receipt: red on the parent commit with the assertion quoted, green after ordinal pairing at 77 pass and 0 fail, and an inertness mutation that turns the assertion red when only the rank predicate is removed, now committed as MUTATION 9 so the control is durable rather than a one-time demonstration. c5's second conjunct is also now GENUINELY met rather than inherited: the census hard-halts at exit 6 with empty stdout, observed in a test, with no residual bucket anywhere. A fresh unhashed corpus of 6093 rows independently read below-bar at 22.42 to 25.34 percent. Remaining ladder status: duration statistics for 17 measured overlapping re-entry groups are unverified-reasoned, and the counts do not carry that caveat.
