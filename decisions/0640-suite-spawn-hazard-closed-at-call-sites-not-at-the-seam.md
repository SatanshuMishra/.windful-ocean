---
Status: accepted
Date: 2026-08-20T06:24:30.396Z
Thread-Id: 01KZTEFMENXBW30ZE633YNFJHE
---

# 0640. The real-binary spawn hazard is closed at the call sites and the sandbox, not at the production seam that causes it

## Context

The c41 inventory found that the test suite can spawn the REAL billed claude binary. cli.mjs:487 and cli.mjs:677 default deps.dispatch to the real dispatcher whenever a caller omits it, and spawnChild converts a spawn failure into an ordinary spawn-failed verdict, so a suite that had started paying for real model calls would still report mostly green. The user directed that this be fixed ahead of everything else in c41.

## Options

- Close it at the production seam by making cli.mjs refuse to default to the real dispatcher
- Bind a test double at every call site and guard the set with a closed census
- Bind a refusing dispatch everywhere including the end-to-end harness
- Leave it filed and rely on sandbox PATH containment

## Outcome

Closed at the CALL SITES with a closed census, plus a sandbox-pinned dispatcher for the end-to-end harness; the production seam is deliberately left alone and filed. PR 253 bound 19 sites, not the 17 filed: the census found cli.test.mjs:116 unbound and a second binding sharing one line in dispatch-failure-report.test.mjs. Folding those in was correct rather than scope creep, because an acceptance criterion of the form the guard reds on any unbound site is UNSATISFIABLE while a known unbound site is excluded. unit-verdict-sha.test.mjs was named in the filing and is NOT a defect; it already binds a fake. Three tests genuinely depend on the real validateRequest for the stderr they assert, so inertDeps binds a dispatch that VALIDATES but never SPAWNS, and no assertion was weakened. PR 254 handled the end-to-end harness, where the orchestrator's instruction to bind a refusing dispatch was WRONG and the lead correctly refused it on measurement: refusing breaks 31 of 79 tests because e2e-fake-bin.mjs writes a fake claude onto a sandboxed PATH and the harness exists to drive the REAL dispatcher against it, so refusing would have deleted the only end-to-end coverage in the repository. It shipped a sandbox-pinned dispatcher instead, and two reviewers defeated its first attempt with an out-of-sandbox impostor that passed, because the guard checked only that a file NAMED claude existed; identity is now proven by file CONTENT with symlinks rejected. What is deliberately NOT done: cli.mjs:487 and :677 still default to the real dispatcher, which is the root cause, and closing it at that seam would retire the whole class rather than guarding instances. Also still open is the envWith PATH fallthrough in dispatch-fixtures.mjs, which ends the constructed PATH with the developer's real PATH and spreads the ambient environment, so a failed stub write or chmod falls through to a real billed run; it is latent, never observed firing, and its fix was interrupted before dispatch. Both are filed for their own unit.
