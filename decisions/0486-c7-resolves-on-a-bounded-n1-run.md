---
Status: accepted
Date: 2026-08-16T22:02:57.129Z
Thread-Id: 01KZTEFMENXBW30ZE633YNFJHE
---

# 0486. The release gate resolves on a bounded n=1 run carrying the vacuity caveat in its verdict

## Context

0466 recorded the falsifier UNEVALUABLE, since a ratio with no denominator can neither pass nor fail, and left the gap between c7's cleared-or-falsified wording and that third outcome explicitly to a human. The denominator was structurally zero until 0484 repaired the unit verdict sha contract; with PR #147 the engine can drive a unit to done carrying a real sha. The measurable ratio is nonetheless near-vacuous: cli.mjs has exactly one claude-spawning site per unit at :182 via pool.mjs:311, plus one decompose child at decompose-emit.mjs:226, and none of the thirteen prompt kinds registered at prompt-registry.mjs:24-38 for plan, review, security, fix or redispatch is reachable from its import closure. The 10-dispatch ceiling was written against an engine that ran those loops.

## Options

- Rule on a bounded n=1 run against a disposable substrate
- Treat unevaluable as falsified and never merge the base
- Hold indefinitely until some future run exists
- Amend c7 by fiat so unevaluable permits the merge

## Outcome

The user ruled for a bounded n=1 run: two independent units under worktree isolation against a disposable substrate, roughly three dispatches. c7 then records cleared (n=1) or falsified against real usage.jsonl lines counted over units reaching done. The verdict text must carry the vacuity caveat in the verdict itself, not a footnote, so a later reader cannot mistake a ratio near 1.0 for a throughput win against a ceiling written for a richer engine. Fail-closed was rejected because it manufactures a falsification no evidence supports, the mirror of a false fixed on the honesty ladder; the indefinite hold was rejected as the unowned stall the receipts ladder exists to prevent; amendment by fiat was rejected as answering an evidence question by decree, consistent with 0473. The thread's standing constraint holds: every request.prompt reaches the user before anything executes, in two approval stops, the decompose prompt before decompose-emit and each emitted implement prompt before cli.mjs.
