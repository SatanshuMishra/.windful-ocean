---
Status: accepted
Date: 2026-08-17T16:13:54.747Z
Thread-Id: 01KZTEFMENXBW30ZE633YNFJHE
---

# 0526. Two confirmed engine defects are filed: dependency chains never resume, and an unread CI reports all-shipped

## Context

The fault-injection track reproduced both defects deterministically against the engine's own e2e substrate, with inertness controls proving each assertion load-bearing. First, integratePhase at phase-driver.mjs:251-275 never passes mergedShas into integrateBuilt, so divergence.mjs:25-50 always reads an empty map, mergedSha is unconditionally null and divergedParents returns the parent whether or not divergence happened. The consequence is that the engine's own printed remedy, approve and merge the prerequisite then relaunch, does not work: the dependent folds to diverged and never ships, permanently across three relaunches, so a chain ships exactly one unit. Second, when the gh run-id read fails, watchUnit returns ci-unwatched with fixes zero, the pull request still opens, no CI fact is ever read, and because merge-policy counts only ciRedExhaustedCount the run reports all-shipped. A resolvable-but-red control correctly reaches ci-red-exhausted, isolating the unwatched path as the sole false green. The tracked test e2e-ci-green.test.mjs:112-126 already asserts all-shipped for this scenario, so the suite pins the false green as expected behaviour.

## Options

- Fix both defects now inside the e2e test run
- File both as new items with reproductions attached and finish the declared test scope
- Treat the passing suite as evidence and record neither

## Outcome

File both, fix neither in flight. The declared acceptance for this work is an end-to-end proof of the shipped engine, and acceptance is a ceiling, so a defect found above it becomes a new tracked item rather than being folded into the work in hand. Both findings ship with a deterministic reproduction under the scratch fault suite and a traced root cause, which is what a fix MSP needs as its red test. The ci-unwatched case additionally requires changing a tracked assertion, so its fix carries a test amendment rather than a pure code change, and that must be stated in the fix MSP rather than discovered during it.
