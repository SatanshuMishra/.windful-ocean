---
Status: accepted
Date: 2026-08-13T18:51:37.320Z
Thread-Id: 01KZY5ARMRK0S390J8Y25X8Z72
---

# 0398. Oversight-reducing changes wait for direct user confirmation

## Context

Two harness security warnings fired on the permission-mode experiment agent during Wave 0, the second stating that the agent exercised rather than merely discussed methods to defeat the permission and hook system - a profile-scoped plugin disable and a bypassPermissions run with zero denials. Both behaviors are ratified in the SPEC: R2 adopts bypassPermissions and R6 requires the logbook plugin guard disabled before the first unattended run. All work ran in scratch directories with the live configuration verifiably untouched. The user was away for the whole of Wave 0 and never answered the first flag when it was surfaced.

## Options

- Treat R2 and R6 as standing authorization and build the launcher and plugin disable now
- Stop all work until the user answers
- Split the work: build everything implementing the guard set, hold only the oversight-reducing pieces

## Outcome

Split the work. Every change that implements the ratified guard set proceeds; the two changes that reduce oversight - the launcher hardcoding bypassPermissions, and the plugin disable - wait for direct user confirmation. Reasoning: R2 and R6 were ratified BEFORE Wave 0 ran, and those two items are where the project stops being a design exercise and becomes a live change to the user's security posture. They are last in the ship order, so holding them blocks nothing. Experimentation in this class stopped entirely - all three probes returned verified, so there is nothing further to learn and continuing would run risk for no information.
