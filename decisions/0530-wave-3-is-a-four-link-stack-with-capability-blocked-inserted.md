---
Status: accepted
Date: 2026-08-17T16:47:10.904Z
Thread-Id: 01M04HH9W6HVPQJDPW24WH48GC
---

# 0530. Wave 3 executes as a four-link linear stack, with capability_blocked inserted as U3.3b before the cutover

## Context

U3.1 merged as PR 192 at 16:33Z, so main at 8f7248c2 carries the observer write path and the remote branch feat/observer-write-path is already deleted. Three units remain from the SPEC, but decision 0527 adds a fourth obligation: capability_blocked must get its own event type before U3.4 retires the old analyzer, because that analyzer is its only emitter and the ten-field record of 0524 has no home for it. Placing that obligation inside U3.2's or U3.4's scope would breach the acceptance-as-ceiling rule, which forbids folding a discovery into a unit already scoped. File scope also forces the ordering: U3.2 and the capability_blocked work both modify the observer module, while U3.3 is a new skill directory and is file-disjoint from both.

## Options

- Fold capability_blocked into U3.4's scope, breaching acceptance-as-ceiling and making the only non-additive unit larger still
- Ship capability_blocked as a flat pull request off main in parallel with U3.2, accepting a merge conflict on the observer module both units edit
- Insert it as its own unit U3.3b in the linear stack, between U3.3 and U3.4
- Run U3.3 in parallel off main since it is file-disjoint, producing a diamond in the stack

## Outcome

Wave 3 executes as a strictly linear four-link stack: U3.2 off main, then U3.3, then U3.3b, then U3.4, each child branching off its parent and targeting it as the pull request base per decision 0521. U3.3b is a new unit carrying the capability_blocked event type, with its own declared acceptance, rather than an amendment to any existing unit's ceiling. The diamond option is rejected even though U3.3 is genuinely file-disjoint: stacked pull requests handle a diamond badly, and 0521's merge protocol - merge the parent, delete its branch, confirm the ref is gone with git ls-remote, confirm the child retargeted, re-run the child's CI - is defined over a linear chain only. Execution is by fan-out: one Opus general-purpose lead per unit carrying the unit's full brief and the FALLBACK-RATIONALE prefix per 0528, each free to dispatch Sonnet workers for mechanical work only after planning. Waves 4 to 7 stay out of scope and receive a ruling, not an execution.
