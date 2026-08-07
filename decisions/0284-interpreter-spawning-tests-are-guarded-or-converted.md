---
Status: accepted
Date: 2026-08-07T23:58:17.070Z
Thread-Id: 01KZCF28RN4RMR46VDXFKSQZY3
---

# 0284. A test that spawns a real interpreter is either availability-guarded or converted to assert checker selection

## Context

The validator dispatches syntax checks to node, python3, bash, sh and zsh. Tests written end-to-end through promote() therefore inherit a hidden dependency on the validating host having that interpreter. Measured on 2026-08-07: a .zsh test passed locally and failed CI, because the GitHub Ubuntu runner has no zsh, with the log reading `zsh could not be run: spawnSync zsh ENOENT`. A sweep then found four more tests with the same shape, and two of them were WORSE than the zsh one: they passed with python3 entirely absent. A missing interpreter raises the same hook-syntax rule those tests asserted, so they were green while asserting nothing. Proven by running the pre-fix files under a python-less PATH mirror: two passed, only one was honest enough to fail. This is the vacuous-pass failure mode the validator itself was just hardened against, reproduced inside the test suite.

## Options

- Split by intent: a test about which checker is SELECTED asserts through resolveChecker with zero spawns, and a test about genuine syntax rejection keeps its real spawn behind an availability guard that prints why it skipped - ADOPTED
- Guard every interpreter-spawning test uniformly. Rejected: it puts a skip in front of most of the suite for bash, which cannot be missing because GitHub Actions runs every step through it, and it would leave the selection behavior with no assertion at all on a host lacking the interpreter
- Drop the end-to-end tests for the rarer interpreters and keep only selection assertions. Rejected: it retires the only tests that prove a real checker actually rejects broken syntax, which is the behavior the gate exists for
- Install the missing interpreters on CI. Rejected: it makes the suite's honesty depend on runner image contents rather than on the assertions, and it would not have surfaced the two tests that were already vacuous

## Outcome

Adopted 2026-08-07. Selection tests assert through resolveChecker and spawn nothing; two were made stronger in passing, moved onto a .mjs and an extensionless file so extension fallback can no longer supply the right answer for the wrong reason. Rejection tests keep a real spawn behind a guard, and the three formerly-vacuous ones now also assert the failure detail names the language, so they fail loudly even if a guard were bypassed. The helper scripts/config/tests/_interpreters.mjs probes with the validator's own checkerEnvironment and THROWS on an unknown interpreter name rather than silently skipping on a typo - a guard that can be defeated by a misspelling is the same vacuous-pass bug one level up.

bash and sh end-to-end tests are deliberately left unguarded, and that is reported rather than silently decided: GitHub Actions runs every run: step through bash, so npm test cannot start without it.

The rule this fixes for every future unit: verify a portability fix PATH-STRIPPED, never by local green. Measured normal 98 pass / 0 skip - which is what proves the end-to-end tests still really run per language when the interpreter IS present - against no-zsh 97/1 and no-python 94/4, 0 fail throughout. A mutation probe confirmed the new selection test is load-bearing on a zsh-less machine, which the end-to-end form could never have been there.

Generalized: a test whose subject is a dispatch DECISION should assert the decision, not the downstream effect of executing it. Asserting the effect silently converts an environment gap into a green test.
