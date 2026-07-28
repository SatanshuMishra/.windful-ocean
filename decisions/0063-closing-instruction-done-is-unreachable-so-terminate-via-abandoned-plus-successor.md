---
Status: accepted
Date: 2026-07-28T04:33:33.607Z
Thread-Id: 01KYG4AEKA6NM746BXVRAZ9DWE
---

# 0063. Closing instruction: done is unreachable by the DoD gate, so termination is abandoned-with-reason plus a successor

## Context

The user instructed at session close: continue as recommended in a fresh session, complete any CRITICAL tasks there, and otherwise mark the thread done. Two facts make the second half impossible as literally stated. First, there are no CRITICAL tasks: both confirming reviews returned no CRITICAL and no HIGH, and the orchestrator independently re-ran the suite on a quiet machine at 622 tests, 622 pass, 0 fail, check-packaging ok, clean tree. Second, the DoD gate requires every completion criterion checked before done, and criterion 5 reads 'Branch merged to main, plugin published to the marketplace, and re-installed globally - then a live end-to-end check against the real store shows a real evasion DENIED and ordinary read commands still ALLOWED.' That is unreachable rather than merely unfinished: the merge and marketplace publish are unauthorised and 0031 makes pushes to origin main human-run, and more fundamentally the shipped tripwire answers ask, never deny, by ratified design (0015, 0029), so the criterion asserts behaviour the system deliberately does not have. Criterion 3 names scanSegments, a function 0029 deleted, though its SUBSTANCE - fail closed on oversized or pathological input, with tests at the boundary - is delivered and tested. Criterion 4 is left false only because the final ten fix commits (351a931..d102fb8) landed after the confirming reviews. create_successor additionally requires a TERMINAL predecessor, so the successor path cannot start from a paused thread.

## Options

- Mark the thread done as instructed - IMPOSSIBLE, the DoD gate refuses while criterion 5 is unchecked, and criterion 5 is unsatisfiable by the shipped design rather than merely unfinished
- Retroactively rewrite or flip the stale criteria to force a done - REFUSED, criteria are fixed at thread CREATION and the gate exists precisely to stop this
- Transition paused -> abandoned with an explicit reason, then create_successor carrying criteria that match what shipped - chosen, the only gate-respecting terminal path
- Leave the thread paused indefinitely - rejected, the user asked for closure and an undisposed thread is exactly the WIP the finish-before-you-start rule targets

## Outcome

Terminate via paused -> abandoned with an explicit reason, then create_successor. The abandoned_reason must state plainly that the WORK shipped and was verified, and that it is the thread's SPECIFICATION that was abandoned when 0029 deleted the parser mid-thread and invalidated four of five criteria. Nothing about the delivered code is being abandoned. Before that disposition the next session should run ONE delta-only review pass over 351a931..d102fb8 - the ten commits no reviewer has seen - with a stated bar of no new CRITICAL or HIGH, which terminates the review recursion with a rule instead of another open-ended lap. If that pass is clean, dispose immediately; if it finds a CRITICAL or HIGH, fix it first, since that is the one task the user's instruction classes as CRITICAL. Recorded as a finding about the plugin under construction: a thread whose design legitimately changes mid-flight can only reach a terminal state labelled abandoned, which mislabels shipped work, and the lifecycle offers no superseded terminal state to distinguish the two.
