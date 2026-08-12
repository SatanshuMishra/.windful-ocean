---
Status: accepted
Date: 2026-08-12T16:37:23.156Z
Thread-Id: 01KZTEFMENXBW30ZE633YNFJHE
---

# 0380. SPEC acceptance lists are a floor, and inertness mutations simulate the unsafe rewrite

## Context

A0's code-reviewer returned a pass verdict on the grounds that the SPEC's five named throw paths were all covered. The orchestrator disagreed and found two HIGH depth gaps: the same-wave overlap refusal was pinned only for BYTE-IDENTICAL scope strings, leaving the directory-prefix and glob branches of pathsOverlap unpinned; and the refusal was only ever exercised in wave 1, because both fixtures had empty dependsOn. A DAG rewrite comparing scope sets by equality, or one hoisting the overlap check to the initial ready set, keeps every original test green while scheduling overlapping tasks in parallel — the exact unsafe direction A0 exists to catch.

## Options

- Ship A0 on the reviewer's pass verdict and note the gaps as follow-ups
- Overrule the reviewer, close both HIGHs before the PR, and prove the fix with mutations that simulate the specific unsafe rewrite - chosen
- Re-cut A0 entirely

## Outcome

The acceptance list in a SPEC section is a FLOOR, not a ceiling: SPEC residual 2 says an MSP that cannot be proven alone was wrongly cut, and a safety net with these holes does not prove the invariant it was cut to prove. Both HIGHs were closed before the PR. The method that made the fix real, and that now governs every remaining MSP: do not mutate by deleting a guard — mutate by simulating the specific plausible rewrite you are defending against, then require the asymmetry. Replacing scopesOverlap with set-equality reddened ONLY the directory and glob tests; hoisting the overlap check out of the loop reddened ONLY the wave-2 test while both wave-1 tests stayed green. Generic guard-deletion would have passed both fixes while proving nothing. Two corollaries: neutralizing one branch of a multi-branch helper must not cross-red another branch's test, or the tests are not isolating; and a defect is never pinned as intended behaviour — assert the desired contract and mark it todo, because a test encoding the broken behaviour goes red the day someone fixes it.
