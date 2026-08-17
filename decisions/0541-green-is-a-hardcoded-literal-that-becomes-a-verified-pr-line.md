---
Status: accepted
Date: 2026-08-17T17:44:50.432Z
Thread-Id: 01KZTEFMENXBW30ZE633YNFJHE
---

# 0541. The unit green flag is a hardcoded literal that is rendered as a Verified line in the pull request body

## Context

cli.mjs:534 returns Done with green set to the literal true whenever the dispatch verdict is ok, and ok means only that the child exited cleanly and emitted a parseable JSON envelope, per dispatch.mjs:737 and :695. It does not mean the child reported DONE and it does not mean the scoped check command passed. That literal is journaled by engine.mjs:265, folded to msp.green at recovery.mjs:180, read by ship-plan.mjs:247, and composed into the pull request body as the verified line for the unit verdict. The sibling claim boundaryClean is likewise derived only from the integrate state being INTEGRATED rather than from any scope or lint measurement. A live unit demonstrated the consequence: it shipped green while violating its declared fileScope, editing index.mjs out of scope, committing an absolute-path symlink, and enshrining a spec violation in its own test.

## Options

- Treat green as a real signal because the tests that produced it passed
- Record that green is a constant and that the engine therefore fabricates a Verified line
- Fix the green derivation as part of this test run

## Outcome

Record it as a fabricated verification claim and rank it the most serious integrity finding of the audit. The honesty rule forbids writing a Verified line for a check that was not run, and this engine writes one automatically for every unit that merely produced parseable JSON. It must be fixed before the ship path is wired, because wiring ship first would turn the engine into an automated producer of false test-plan claims on real pull requests, which is strictly worse than the current state where no pull request opens at all. The fix belongs in the minimum change set ahead of the publish wiring, not after it.
