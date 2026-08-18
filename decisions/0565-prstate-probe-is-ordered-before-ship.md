---
Status: accepted
Date: 2026-08-18T05:55:27.914Z
Thread-Id: 01KZTEFMENXBW30ZE633YNFJHE
---

# 0565. The prState probe runs before Ship, so it cannot see the pull request the run opens

## Context

The run summary reported prState with exit status 1 and stderr "no pull requests found for branch feat/objects-pick-omit-helpers-integration", while that exact branch carried an OPEN pull request that I read back from GitHub minutes later. The journal records the quiescent-exit delta BEFORE the ship delta, and the done-oracle probe fires at quiescent-exit, so the probe queries for a pull request the run has not yet created.

## Options

- Read the empty prState as a genuine absence of a pull request
- Treat prState as structurally unable to observe a same-run pull request

## Outcome

Filed as an engine defect above this unit's ceiling, not fixed in flight. An operator reading prState alone would conclude no pull request was opened when one was. The reliable evidence is ship.prUrls plus a read-back from GitHub. This is the same family as the standing rule never to infer an outcome from an upstream step's own report.
