---
Status: accepted
Date: 2026-08-24T06:31:33.924Z
Thread-Id: 01M0RZP75VCZJPP2R127YBFK3Z
---

# 0706. The required status check carries no bypass actor

## Context

A change merged over four failing checks, including the dedicated gate whose only job was the rule it violated and which named the offending file and line before the merge, and it broke the trunk. Nothing stopped it because the host repository has no required status checks at all. Roughly twenty more pull requests are about to land there. The existing ruleset governs the default branch, requires a pull request with zero approvals, and lists no bypass actors, so adding a required check without adding an actor makes the block absolute for the owner too.

## Options

- Require the test check with no bypass actor, so the merge button is genuinely blocked while it is red
- Add the repository-admin role as a bypass actor, so a red check warns but the merge button still works
- Leave the repository with no required checks and rely on reading the checks by hand

## Outcome

No bypass actor. The failure this guards against is seeing red and clicking merge anyway, and a bypass actor leaves exactly that path open with only a warning added. The owner is not locked out: enforcement is a one-click toggle on the ruleset, so a flaky check stalling the queue is recoverable in seconds. Only the test check is required, and the up-to-date-before-merging policy stays off, because forcing every pull request to rebase onto the tip invalidates its continuous-integration run and returns the cost as a re-run, which is actively harmful with a queue this long. Applying it is human work: the write was refused by the platform agent on charter and blocked by the permission classifier on a re-route, so the payload is handed over rather than dispatched.
