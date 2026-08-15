---
Status: accepted
Date: 2026-08-15T18:52:41.113Z
Thread-Id: 01KZTEFMENXBW30ZE633YNFJHE
---

# 0440. The third filed defect does not reproduce, and its fix costs nothing like the filed estimate

## Context

The defect was filed as: renaming an export in journal-store.mjs raises a raw ERR_MODULE_NOT_FOUND from four verbs, pre-existing across a chain of twelve modules, and closing it makes runMitosisGate async, rewriting about 35 existing test rows. That async ripple was the stated reason it was ranked third and worst-cost. Every load-bearing part of the filing was checked against base ed5ccbb9 and found wrong: mitosis-gate.mjs imports ten specifiers and journal-store.mjs is not among them, with no transitive edge reaching it; journal-store.mjs has exactly one importer repo-wide, run-store.mjs:7, which nothing in the gate chain imports; there are zero dynamic import() call sites in lib/mitosis outside tests; ERR_MODULE_NOT_FOUND appears nowhere in source, only in stale planning docs naming superpowers-parallel, a path that no longer exists. The mechanism is wrong besides, since a renamed named export yields a SyntaxError about a missing export, never a resolver failure. The twelve figure is real but misattributed, being the size of mitosis-gate.mjs's own import closure, and the thirty-five test rows are really 21 call sites across 20 test blocks.

## Options

- Ship nothing and close the item as not-a-defect, leaving the gate's real diagnosability gap open
- Fix the defect as filed by introducing the coupling first, which inverts cause and effect and fails the inertness mutation
- Address the real adjacent property with a synchronous CLI framing boundary that keeps runMitosisGate synchronous
- Convert to dynamic import and absorb the async ripple across 20 test blocks

## Outcome

Chose the synchronous CLI framing boundary. The real, reproducible property is that any module-load failure in the gate's closure surfaces as an unframed Node stack trace, exit 1, naming neither mitosis-gate nor the requested verb, because ESM linking completes before parseMitosisGateArgv or VERB_RUNNERS ever run, so none of the file's own out.err framing can fire. A module cannot frame its own link failure, so the body moved to mitosis-gate-core.mjs and mitosis-gate.mjs became a 73-line entry that loads the core through createRequire inside a guard. runMitosisGate stays a plain synchronous function returning a number, zero existing test blocks changed signature, and the exit code is the file's existing GATE_UNRESOLVABLE_EXIT of 42. Verified red-before and green-after on the exact framed string, plus both directions of the inertness mutation. The async ripple that made this the worst-cost item never existed, so the filed cost estimate should not be carried forward anywhere. Shipped as PR-ready branch fix/gate-module-load-diagnosis, commit 0468d1cb.
