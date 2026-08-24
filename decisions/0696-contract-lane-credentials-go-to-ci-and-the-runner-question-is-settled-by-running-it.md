---
Status: accepted
Date: 2026-08-24T03:44:09.314Z
Thread-Id: 01M0QTN4YG3SWPQ1EMFT85M1K3
---

# 0696. The contract lane gets CI secrets and the hosted-runner question is settled by one dispatch, not by argument

## Context

The contract lane runs the real model CLI and the real forge on a daily schedule and on nine seam paths, which on a hosted runner needs two repository secrets. No runner on this project has ever installed or authenticated the model CLI, so the capability is unverified rather than known broken. A design rule forbids resolving this by probing at runtime: a missing secret must fail the lane, never skip it, so the wiring cannot be left optimistic. The target repository becomes public, which raises the question of secret exposure.

## Options

- Add both secrets and dispatch the contract workflow once to observe whether a hosted runner can authenticate
- Adopt the fallback up front: run the contract lane locally on a schedule, commit refreshed fixtures, and have CI verify only fixture freshness and the diff

## Outcome

Option 1, because the cost of finding out is one dispatch and the fallback is already specified. If installation or authentication fails, the observed error is recorded and the fallback is adopted with nothing lost, because the authority of the contract lane does not depend on where it runs; the freshness check in the replay lane is what enforces that a capture happened. Exposure on the public repository is bounded: fork pull requests do not receive repository secrets, so a fork sees a failing contract lane and nothing more. The forge token must be scoped to the substrate, which is a different repository than the one running the workflow, so the Actions-provided token cannot serve.
