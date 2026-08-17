---
Status: accepted
Date: 2026-08-17T19:14:00.311Z
Thread-Id: 01M04HH9W6HVPQJDPW24WH48GC
---

# 0543. Wave 3 closes; its three ladder downgrades share one shape and name a real capability gap

## Context

U3.4 shipped as PR 200 and completes wave 3. Its archive-freshness criterion earned its place: U0.1's snapshot held 16590 lines while live held 17384, so 794 rows were unarchived including 3 of the 4 capability_blocked rows, and deleting the writer without re-archiving would have stranded them. Its G11 coverage-moved-here claim was verified rather than asserted and came back only partly true - of 11 deleted tests, 6 covered, 3 partial, 2 not covered - and the gaps were closed before shipping. Three ladder downgrades were carried. Separately, the live observer log holds 202 rows and every one is a SubagentStop; not a single SubagentStart row exists, although the binding is present on main.

## Options

- Record the three downgrades individually and move on, treating them as unrelated per-gate misses
- Read the three together, name the shared shape as the aggregate capability gap G17 exists to surface, and escalate that rather than the individual gates
- Retry the unverifiable criteria until they pass, which is the extra review round the ladder exists to replace

## Outcome

All three downgrades share ONE shape: the thing to be verified lies outside version control or outside the agent's reach. Two are the human-applied global settings file; one is a CI workflow that cannot evaluate its own mandate. That is the aggregate capability gap G17 asks to be escalated - a unit which moves machine-global configuration has no way to observe the result and must hand a command to a human and stop - and it is escalated as one gap rather than three gate failures. A MERGE-ORDER HAZARD is created and must not be lost: once PR 200 merges and the primary checkout pulls, the global SubagentStop hook names a DELETED file, so subagent observation stops for every project on the machine until the human applies the settings edit. The edit is therefore not a follow-up, it is part of the merge. The zero-SubagentStart observation is NOT a new defect: Claude Code snapshots hooks at session start, every session now running predates the binding reaching main, and U3.2 already declared this exact residual as unverified-reasoned when no start row had ever been logged anywhere. It closes by starting one fresh session after the merge and dispatching any subagent - a one-command check, not an investigation. Until then duration remains underivable in practice, which was U3.2's whole justification, so the check is worth running deliberately rather than assuming.
