---
Status: accepted
Date: 2026-08-23T22:21:38.721Z
Thread-Id: 01KZTEFMENXBW30ZE633YNFJHE
---

# 0692. The billed run parked on a failed review, making the missing fix loop the blocker that outranks the crash defect

## Context

The billed run executed against engine bfea5aa3 for 583 seconds and opened zero pull requests, the same headline number as the previous failure and an entirely different cause.

No crash occurred. The engine reached quiescence before the harness's deliberate kill point, and the harness declined to kill an already-quiescent run. That is the built-wait quiescence fix working as designed, and its consequence is that the boundary reclaim defect fixed over three rounds this session was never entered and remains unproven live.

The single declared unit parked as NeedsHuman because the review lens failed the implementation on verified grounds: the error classes for invalid input were swapped relative to the spec, and a boundary guard used strictly-greater where the spec requires greater-or-equal, letting one input return a degenerate value instead of throwing. Two tests cemented the deviation and the README documented the wrong contract. The engine refused to ship code that contradicts its own spec.

Nothing about that is a defect. It exposes a structural limit instead: a failed review ends the unit rather than handing the findings back for correction. Modules for planning and prompting a remediation exist in the tree, so it is not established whether this is deliberate policy, a threshold left unset, or an unwired path.

An implement worker making an ordinary mistake is the expected case, which is why a review lens exists. If every such mistake terminates the run, no spec can reach a merged trunk unattended, whatever else is repaired.

## Options

- Treat the park as a defect and fix the review lens
- Establish why remediation did not engage before building anything
- Re-run the billed lane and hope a cleaner implementation lands
- Accept human adjudication of failed reviews as the intended design

## Outcome

Establish why remediation did not engage, before building anything and before spending again.

This is now the top blocker for the criterion, ahead of every defect closed today. Crash recovery only matters once a run can finish; a run that halts on any ordinary worker mistake cannot. The question is cheap and read-only, and its answer decides between a setting, a wiring gap and a deliberate policy worth revisiting — three very different pieces of work.

Re-running is rejected: the lane would have to produce a flawless implementation by chance to get past the same gate, which is buying a coin flip.

Two consequences recorded for how this run is reported. The reclaim fix is proven by a test that drives the real derivation chain and is red under mutation, and is NOT proven live; the honest next move is a local zero-cost test that genuinely kills the engine mid-add, because a paid run only exercises that race when the timing happens to land. And the run's cost is a floor of 1.30 dollars drawn from one recorded dispatch of four, not a measurement — the declared-criteria comparison log was never regenerated and still describes the previous run, so it carries no verdict for this one.
