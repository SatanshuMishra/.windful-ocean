---
Status: accepted
Date: 2026-08-13T19:19:23.010Z
Thread-Id: 01KZY5ARMRK0S390J8Y25X8Z72
---

# 0400. Merging to live stays an explicit human act with loud staleness reporting

## Context

The user requires that changes be merged into main via a pull request and released for the agent to use. Investigation found the chain has a manual gap: converge resolves local refs/heads/main only, never fetches, and local main is ten commits behind origin. So a merged PR does not become live until a human advances the local ref. Four ways to close the gap were weighed. The decisive finding is that local refs/heads/main is the deploy pointer, not a mirror of origin: converge promotes whenever live differs from it, and rollback moves the live pointer without touching the repo ref, so any automation that advances main silently destroys rollback - the rolled-back release is re-promoted at the very next session start or stop.

## Options

- SessionStart hook that fetches and fast-forwards local main
- Scheduled launchd job doing the same on an interval
- Keep adoption manual, add a staleness heartbeat plus an install-bootstrap verify verb
- Change converge to resolve origin/main instead of local main

## Outcome

Keep adoption an explicit human act, and make staleness loud instead. The adopt command is git fetch origin main:main, which was empirically confirmed to fast-forward cleanly when behind, refuse with exit 128 when main is checked out, and reject non-fast-forward when diverged - in every failing case leaving the local ref untouched. Add a SessionStart heartbeat that compares against the remote with ls-remote, writes no local ref, and reports without ever applying; and an install-bootstrap verify verb asserting the installed promotion machinery matches its tracked source. Automating the advance was rejected because all three automated options delete rollback as a capability, the fourth most severely.
