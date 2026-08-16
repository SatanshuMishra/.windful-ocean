---
Status: accepted
Date: 2026-08-16T19:51:47.306Z
Thread-Id: 01KZTEFMENXBW30ZE633YNFJHE
---

# 0477. The measurement run is three real units with one dependency edge and natural outcomes

## Context

With c24 and c25 shipped the instrument is wired and its record is trustworthy, so the run shape becomes the question. Two facts bound what any run can prove. First, in this architecture the engine dispatches about once per unit plus redispatches on retry, so dispatches per shipped MSP reduces to one plus retry amplification; a single unit succeeding first try yields about 1.0 and clears a ceiling of 10 by a factor of ten while proving only that no retry thrash occurred in the easiest possible case, which is not what a falsifier written to catch pathological thrash under load was asking. Second, an item filed during c25 constrains which runs are measurable at all: usageRecorder keys each line off a running record it must have seen, so a dispatch whose running record was emitted but whose settle record never arrives leaves no line, and the denominator undercounts rather than mislabels. A torn-down run is therefore discarded and redone, never measured.

## Options

- One trivial unit, the cheapest smoke-level run
- Three real units with one dependency edge and whatever outcomes occur naturally
- Add a unit engineered to fail so retry amplification is forced into view

## Outcome

The run is three small but genuine units carrying one dependency edge, with outcomes left entirely natural and nothing rigged. Three units exercise the scheduler and the window rather than a single straight-line dispatch, and they yield three samples instead of one while staying far inside the cost of a first experiment. A unit engineered to fail was rejected for the measurement run because a forced retry produces a ratio that describes the rigging rather than the system, and it would have to be reported as a separate population anyway; retry behavior under adversarial conditions is a later experiment, not this one. A run that does not reach quiescence cleanly is discarded and redone rather than measured, since a torn-down run silently undercounts. The reported figure carries its own limits: it is n=3 at one pinned state, it measures the benign case, and 0358 still requires three runs at pinned state before any baseline binds.
