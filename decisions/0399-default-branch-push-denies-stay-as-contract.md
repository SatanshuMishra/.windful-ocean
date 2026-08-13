---
Status: accepted
Date: 2026-08-13T19:19:13.405Z
Thread-Id: 01KZY5ARMRK0S390J8Y25X8Z72
---

# 0399. Default-branch push denies stay, reclassified as delivery contract not catastrophe

## Context

Classifying all 47 deny entries against the five-guard set left three that map to no guard at all: pushes to main, master and development. A strict D1-D5 reading removes them, since pushing to one's own repository is revertible and reflog-recoverable. But unlike the force-push and reset --hard entries, which are independently backstopped by an ask verdict in the bash gate on the identical pattern, these three have no hook backstop anywhere - removing them is an unmitigated change from current behavior. They also sit directly against the user's stated delivery requirement that changes reach live by being merged into main via a pull request.

## Options

- Remove all three under a strict D1-D5 reading
- Keep all three, reclassified as delivery contract rather than catastrophe guard
- Keep them and add a hook predicate distinguishing shared from personal branches

## Outcome

Keep all three, reclassified as belonging to the centralized-PR and branching contract that the SPEC declares out of scope and unchanged, rather than to the D1-D5 catastrophe set. The guard set stays exactly D1-D5 as ratified; these entries simply are not part of it and are retained under a different justification. Surfaced to the user as an orchestrator call with an explicit invitation to overrule; no objection was raised. The eight genuine removals and two narrowings identified in the same pass proceed as planned.
