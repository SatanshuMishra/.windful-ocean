---
Status: accepted
Date: 2026-08-14T00:15:10.447Z
Thread-Id: 01KZY5ARMRK0S390J8Y25X8Z72
---

# 0409. A deny entry is removed when it guards no catastrophe; no replacement is required (supersedes 0401)

## Context

0401 ratified that no deny entry is removed until its replacement exists. Its replacement was always the Layer 3 PreToolUse gate, which would decide in code what a blunt deny string decided by pattern - for instance discriminating a local disposable Supabase container from a hosted project. 0407 cancelled Layer 3, so the replacement can never arrive, and read literally 0401 now forbids removing any deny entry ever. That makes c3 - prune deny to genuine catastrophes and retire the ask rules - permanently unreachable, which is the whole remaining point of the thread. The rule has already done concrete harm: the deny on supabase db reset defeats the ratified local-container carve-out, so the agent cannot validate migrations it writes, and 0401 is the reason that entry survived.

## Options

- Keep 0401 and accept that no deny entry is ever removed, abandoning c3
- Revive a minimal Layer 3 gate purely to serve as the replacement 0401 demands
- Replace the precondition: judge each deny entry on whether it guards a catastrophe, with no replacement required

## Outcome

Overturned on the user's explicit instruction. A deny entry is removed when it does not guard a catastrophe, and no replacement mechanism is required first. Reviving Layer 3 to satisfy 0401 was rejected outright as rebuilding the architecture 0407 just removed. The admission test for keeping a deny entry is now: does it guard an action that is irreversible or catastrophically expensive, or does it encode a deliberate human gate the user has affirmed? Keep on that test: the merge gates and pr-create centralization (user-affirmed), default-branch pushes per 0399, history-rewriting pushes and git reset --hard, secret and credential reads, and the remote database commands owned by the no-direct-db-access rule. Remove on that test: entries that are speed bumps, routing preferences or defensive habit rather than catastrophe guards - including supabase db reset, which the ratified local-container carve-out already permits, and the git -c and git --config-env denies, which exist only to stop bypass of gates that no longer exist and which today block an agent from signing its own commits.
