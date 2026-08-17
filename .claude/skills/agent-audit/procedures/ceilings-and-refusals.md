# What the log cannot answer, and what refuses

Two different kinds of gap. One is a permanent property of what a hook can see; the other is a
fact about this corpus that could change if something upstream started emitting a new event.

## The platform ceiling (decision 0510)

Cost, tokens, cache counts and turn counts are absent from every hook payload. They belong to
the Agent SDK's end-of-turn result message, and a hooks script never sees that message - it
fires and returns before the turn it is watching has finished accounting for itself.

They are therefore ABSENT from the output: not a null column, not a zero. The first question
is named for duration, `ran-and-duration`, not for cost, because a plausible-looking zero
sourced from nothing is exactly the failure this rebuild exists to end. A reading of zero cost
next to a real dispatch is worse than a reading with nothing in that cell at all.

## Absent source: two questions this log cannot answer

**Why a dispatch fell back.** The WHICH is answerable from `agent_type` - a fallback dispatch
is visible as such in the row itself. The WHY does not survive: it lives in the dispatch
description, the sidecar transcript carries that description, and the event writer does not
copy it into the log line. No event marks a fallback with its reason. Filed as U3.3c.

**Which downgrade reasons recur.** No field carries this, no event type carries this, and
nothing in this log carries it under any name. The candidate corpora live elsewhere - pull
request bodies and the enforcer's own run output. This question ships as a hard-failing stub
with its own exit code, so a caller can never mistake an empty result set for a count of zero.
Filed as U3.3d.

## The governing rule

A question with no source REFUSES loudly rather than returning an empty result that reads as
an answer. This is the same shape `receipts:gates` uses for a gate that cannot be cleared: a
named status, never a silent pass, and never another round spent trying to force an answer out
of a log that was never going to contain one.
