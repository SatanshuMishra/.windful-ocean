---
Status: accepted
Date: 2026-08-10T20:35:00.274Z
Thread-Id: 01KZCF28RN4RMR46VDXFKSQZY3
---

# 0319. A check the approved order schedules after the PR is disclosed in the body, never reordered to earn a verified line

## Context

The approved cutover order opens the PR first and runs the 0281 scratch-root rehearsal second. A PR body is fixed at creation and never rewritten, so at open time the rehearsal was a check that had not run. Two pressures collided. The honesty rule forbids a Verified line for a check not run, and treats an absent line as worse than a stated unknown because a reviewer's default is to assume the gap was covered. Against that, 0281 exists precisely because the rehearsal finds defects that reading cannot - it once found two that reject every candidate release permanently - which is an argument for running it before asking anyone to review.

## Options

- Open the PR on the approved order and disclose the unrun rehearsal as a third --not-verified line - ADOPTED
- Reorder: run the rehearsal first so the PR can carry it as a --verified line - rejected, it silently rewrites a sequence the human approved, and buys one body line at the cost of the approval meaning something
- Open the PR and say nothing, since the rehearsal will run before the human merges - rejected, that is exactly the absent-line failure the honesty rule names; the reviewer cannot distinguish not-yet-run from overlooked
- Hold the PR until the whole pre-merge sequence is complete - rejected, it collapses the review surface and the rehearsal into one step and delays the human gate for no gain

## Outcome

Disclosed. The body carries "0281 scratch-root promote rehearsal at this sha - not run at open" alongside the two disclosures round 3 prescribed. The PR is a review surface, not a merge gate - the human merge is the gate, and the rehearsal runs before it - so a body that states plainly what had not run at open is accurate rather than deficient. The general rule this fixes: when an approved order schedules a check after the PR, the body discloses it as not run; the order is not quietly rearranged so a body line can read better. A verified line is a claim about the past, and the fix for a claim you cannot make is to say so, never to reshape the work until the claim becomes sayable. Cost accepted: the merged PR permanently understates what was checked before merge, since the rehearsal result cannot be added afterwards. The session log and this record are where that result lives instead.
