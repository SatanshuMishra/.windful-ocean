---
Status: accepted
Date: 2026-08-20T17:09:05.796Z
Thread-Id: 01KZTEFMENXBW30ZE633YNFJHE
---

# 0645. A harness repo is archived before deletion, because it holds the only seed and the only live evidence

## Context

Asked to clean up both test repositories so a fresh session could proceed directly to e2e testing. Deleting them outright would have destroyed two irreplaceable things: the seed commit fe0dff16 existed only inside those repositories, so the substrate would have become unreconstructible and all future e2e work blocked; and the pull request bodies and closed-child timelines are the evidence decisions 0641 and 0643 cite, which would have become unverifiable claims.

## Options

- Delete both repositories as asked - destroys the seed and the cited evidence
- Keep both indefinitely - leaves spent substrates accumulating and the fresh session unsure which to use
- Archive the evidence and the seed to the artifacts directory, stage a pristine replacement, then hand the deletions to the human

## Outcome

m15/evidence-archive/ now holds all 11 pull request bodies across both harness repositories, both closed-child timelines, both branch listings, and substrate-seed-fe0dff16.bundle, verified as recording a complete history. The bundle is the load-bearing item: it makes the substrate rebuildable from artifacts alone, and the runbook carries the three commands. mitosis-live-pr-harness-r3 is staged pristine and run-live.sh points at it. Deletion of the two spent repositories is left to the human, since permanent deletion is not an agent action. Standing rule: a disposable test repository is never deleted until its seed is bundled and any evidence a decision record cites is archived by path rather than by url.
