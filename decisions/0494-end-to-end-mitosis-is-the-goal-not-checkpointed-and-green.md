---
Status: accepted
Date: 2026-08-17T03:54:07.953Z
Thread-Id: 01KZTEFMENXBW30ZE633YNFJHE
---

# 0494. End-to-end /mitosis is this thread's goal, and checkpointed-and-green does not satisfy it

## Context

Every declared criterion was met and the stack merged to main, but a state review established that the engine reaches only checkpointed and green. cli.mjs imports no prompt registry, so the thirteen registered prompt kinds covering plan, plan-review, replan, review, security, fix, boundary-fix, ci-fix, diagnose, redispatch and ci-fact-extract are all unreachable from the entry point. The engine's only network call is one read-only gh pr view done-oracle at engine.mjs:243, so it never opens a pull request, and gh-merge-shim.mjs refuses every merge verb. Of four modeled phases only Decompose and Execute were exercised; Integrate and Resume never ran. scope-fence isolation cannot complete a unit at all. Among 101 test files there is no automated end-to-end test: the single end-to-end proof was one manual n=1 run of two independent trivial units, with no dependency edge, no failure, no retry, no parking and no lock recovery. The eighteen-MSP stack itself shipped by manual subagent dispatch under 0378, so the staged-pull-request workflow has never once been executed by the engine.

## Options

- Treat the thread as complete because its declared criteria were met
- Re-scope the thread to its real goal, end-to-end /mitosis, and continue in this thread
- Close the thread and open a successor for the remaining engine work

## Outcome

The user ruled that end-to-end /mitosis is the goal of THIS thread rather than a successor, and that the thread has FAILED until the engine completes a full cycle with every aspect thoroughly tested. 0475, which defined shipped as checkpointed and green because this build could not reach Ship, is SUPERSEDED: it narrowed the goal to fit the build instead of measuring the build against the goal. 0489's CLEARED verdict stands as an accurate measurement of a vacuous quantity, since the falsifier could only ever return the architecture's structural floor of 1.0 dispatches per unit, so clearing it proved nothing about whether the engine works end to end. c6 and c7 stay marked done because they were met exactly as written, and retroactively unmarking met criteria would falsify the record; the defect was that the criteria under-specified the goal, and that is corrected by adding criteria rather than by rewriting history. New criteria carry the remaining engine work: reachability or explicit retirement of every prompt kind the flow needs, engine-driven pull request creation through the centralized tool, serialized merges, the Integrate and Resume phases, dependency edges, failure, retry, parking and lock recovery, and an automated end-to-end test that runs in CI. The two filed items, scope-fence checkpointing and the run-engine duplicate prompt, are carried as DEFERRED follow-ups behind that work.
