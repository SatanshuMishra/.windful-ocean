---
Status: accepted
Date: 2026-08-16T17:38:16.431Z
Thread-Id: 01M04HH9W6HVPQJDPW24WH48GC
---

# 0471. User rulings on the six open rebuild questions, and the addition of the observer to this thread

## Context

Round 1 of the report closed with six open decisions the design could not settle on the user's behalf. The user answered all six and simultaneously expanded the thread's scope to include a ground-up observer rebuild, which had previously been treated as a separate concern.

## Options

- Leave the six open and design around every branch - rejected: the branches lead to materially different work
- Take the user's rulings as binding and record them - chosen
- Split the observer into its own thread - rejected: the roster and the observer fail in the same places, and the prior audit's Fact 4 warns that rebuilding the roster blind is how the configuration arrived here

## Outcome

All six settled. (1) Rename freely - the legacy mitosis engine is being deleted and the new engine has no static allowlist, deriving its dispatch table by intersecting engine source literals with agent filenames, so there is no list a rename can break. (2) 13 is right for now, revisable by future audits run on the new observer's data. (3) Archive the 8.7 MB of telemetry; the new observer uses a new format and retains NO backward compatibility with the old data model. (4) No project-local agents this cycle - all 41 removed, with their domain knowledge moving into skills and rules as a SEPARATE task after the agent and observer rework. (5) Keep delivery-lead; revisit if telemetry contradicts its value. (6) Remove all four backup profiles. Scope: the observer rebuild is part of this thread's target architecture and teardown, not a successor thread. Sequencing: the new mitosis engine lands first; this work targets that engine, never the one being deleted.
