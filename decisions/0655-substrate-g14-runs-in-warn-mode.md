---
Status: accepted
Date: 2026-08-21T02:06:55.296Z
Thread-Id: 01KZTEFMENXBW30ZE633YNFJHE
---

# 0655. The substrate's G14 runs in warn mode so the live run measures the engine

## Context

The disposable substrate repository carries receipts.config.json with gates.G14.mode block and max_mutants 12. Every pull request the engine opens there would be refereed by the mutation gate, and a billed child implementing a small string helper will not write mutation-proof tests. The everyOpenedPrChecksAreGreen criterion fails unless every check lands in the pass bucket, so the measurement run would read as a mitosis failure for a reason that has nothing to do with whether mitosis works. No pull request has ever been opened on this substrate, so this has never been observed; the prior live run died at built-wait before Ship.

## Options

- Set the substrate's G14 to warn, the standard's own default, so the run measures the engine rather than the billed child's test quality
- Leave G14 at block and accept that the run may fail on the child's mutation coverage, interpreting the receipt rather than the criterion
- Instruct the engine's implement prompt to write mutation-resistant tests, which is out of this scope

## Outcome

Set the substrate's G14 to warn. The substrate is a measurement fixture, not a production repository, and warn is what receipts/gates@1.1 defaults to for exactly this reason. Only gates.G14.mode changes, only on the substrate. The seed bundle in the evidence archive is regenerated so a freshly seeded substrate carries the setting and a re-seed cannot silently revert it. This is a fixture setting and never a precedent for the project repository, where G14 stays block.
