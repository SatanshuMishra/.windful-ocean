---
Status: accepted
Date: 2026-08-19T01:24:45.951Z
Thread-Id: 01M04HH9W6HVPQJDPW24WH48GC
---

# 0609. The pass bar is a required flag with no default, after an empty value silently made every corpus pass

## Context

While shipping the lead-share question, the bar and the minimum window were accepted as flags that took any finite value. An empty string coerced to 0, which would have made every corpus on earth read as clearing the bar, silently and with exit 0. This is measurement integrity for the exact number c5 turns on, so it was fixed inside the unit rather than filed above the ceiling.

## Options

- File it above the ceiling and ship the question as built
- Fix it inside the unit as measurement-integrity critical
- Hardcode the bar as a constant so no flag can be passed wrong

## Outcome

Fixed inside the unit, and the bar is now a REQUIRED flag with no default rather than a constant. Requiring it means the bar appears verbatim in the recorded command, so a reader of the receipt sees which bar the verdict was graded against instead of trusting a value buried in source. A silent coercion to 0 on an integrity-critical threshold is the same failure family as a residual bucket computed by subtraction: both convert an unanswerable state into a passing one. Filed above the ceiling and deliberately NOT fixed: the unpaired_starts predicate, an absent unpaired_stops, a NULL-blind mixed-type halt, the hand-maintained sibling-file closure, and the LEAD-SHARE refusal sharing exit 6 with the census halt.
