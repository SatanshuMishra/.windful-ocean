---
Status: accepted
Date: 2026-08-17T17:09:40.231Z
Thread-Id: 01M04HH9W6HVPQJDPW24WH48GC
---

# 0534. U3.4 must register the new observer in the global settings, not merely delete the old analyzer from it

## Context

The SPEC frames U3.4 as removing agent-run-analyzer.mjs and its hook registration so the new observer becomes sole writer, and the known caveat was only that the global settings file is outside version control and needs a hand edit. Inspecting the live file changes the picture. The global settings at the user level registers exactly one SubagentStop hook, the old analyzer, and carries NO SubagentStart entry and no reference to the new observer at all. The new observer is registered only in the repository-tracked project settings. So the new observer runs for sessions in this repository and nowhere else, while the old analyzer runs everywhere.

## Options

- Delete the old analyzer from both settings files as the SPEC literally says, which would leave every project outside this repository with no subagent observation at all
- Delete the old analyzer and register the new observer in the global settings in the same change, so coverage moves rather than disappears
- Leave the global settings alone and let the old analyzer keep running everywhere, which contradicts sole-writer and leaves the retired code live

## Outcome

U3.4's deliverable is a MOVE of coverage, not a deletion. The global settings edit registers the new observer on both SubagentStop and SubagentStart and removes the old analyzer entry in the same edit; deleting alone would silently end observation for every project except this one, which is the same class of defect as retiring the only emitter of capability_blocked. The SPEC's acceptance - the new log receives rows and the old path receives none, asserted after a real dispatch - must therefore be asserted from a session OUTSIDE this repository as well, since a same-repo assertion passes on the project settings alone and proves nothing about the global file. The global file stays a human-applied edit: it is outside version control, no pull request can carry it, and it governs every project on the machine. The session prepares the exact before-and-after and surfaces it for the user to apply, and the unit is not claimed done on the strength of the tracked half alone.
