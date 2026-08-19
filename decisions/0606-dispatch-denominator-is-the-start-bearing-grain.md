---
Status: accepted
Date: 2026-08-19T01:24:10.097Z
Thread-Id: 01M04HH9W6HVPQJDPW24WH48GC
---

# 0606. The dispatch denominator is the start-bearing grain, and stop-only groups are reported as a coverage fact

## Context

The pre-registered band check fired on the first instrument-produced run: 22.97 to 25.45 percent at n of 444, below the pinned floor of 24.23 percent. Per the pre-registration that number was NOT reported as the answer. Diagnosis: the instrument contradicted itself. The new lead-share question counted groups holding a Start OR a Stop, giving 444, while ran-and-duration counted groups holding a Start, giving 421. The 23-group gap is entirely stop-only groups, all inside the corpus's first 3 hours 9 minutes, before the SubagentStart hook began emitting, and zero in the following 27 hours.

## Options

- Keep the start-or-stop grain at n of 444
- Rule to the start-bearing grain at n of 421
- Report the out-of-band figure and let the reader choose

## Outcome

The start-bearing grain is the dispatch denominator, n of 421, matching ran-and-duration so the instrument stops contradicting itself. Stop-only groups are surfaced as a reported coverage fact, stop_only_groups, and never silently dropped. Two disclosures attach because the ruling is self-serving in direction: it moves the figure UP, toward the bar, and clause 5 of the round-2 pre-registration was DEFECTIVE, its text and its pin disagreeing on the event predicate. Both are recorded as defects rather than amended to taste, mirroring the re-entry gap found in round 1. Set-level self-consistency was then checked rather than assumed: a full outer join of the two 421-group sets returned zero mismatches, and the recompute matched the pre-pinned expectation on 12 of 12 points including claude-code-guide dropping out, verified directly as stop-only rather than assumed.
