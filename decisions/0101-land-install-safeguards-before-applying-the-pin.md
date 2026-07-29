---
Status: accepted
Date: 2026-07-29T03:49:31.401Z
Thread-Id: 01KYN9FH92YP5BPNG7ECCV9PJS
---

# 0101. Land the install safeguards before applying the pin

## Context

Decision 0100 chose the pinned main-tracking worktree, and the user then raised two blocking questions: the refresh must be robust enough that a long development session can never end with changes silently not live, and the consequences of an accidental direct edit inside ~/.claude-install had to be understood first. Investigation established three hazards for direct edits: the edit goes live INSTANTLY because ~/.claude resolves there, in a directory nobody opens, making it less visible than today's coupling; a commit made there lands on a detached HEAD, belongs to no branch, and is destroyed by the next refresh when HEAD moves; and an uncommitted edit can be carried forward across many refreshes by git checkout whenever it does not conflict with the inter-commit diff, remaining live and undetected. MSP A's landed fix already covers ~/.claude-install because it will be a registered worktree, but it yields ask, a prompt rather than a wall. Investigation also uncovered a hard prerequisite: superpowers-drift-check.sh:4 writes .drift-state.json, a TRACKED file inside the repo, so after migration the install worktree would be permanently dirty, which would make the cleanliness signal cry wolf every session, get ignored, and return the system to exactly the silent staleness the user requires be impossible. Applying the pin alone would therefore have delivered the pin without the properties that make it safe.

## Options

- Apply the pin now and add the safeguards afterwards
- Land the safeguards first, then apply the pin
- Apply the pin and rely on the documented two-command refresh recipe

## Outcome

Option 2, ratified by the user on 2026-07-28 with the standing instruction to proceed in this order in a fresh session. Order: (1) relocate .drift-state.json out of the tracked tree to ~/.claude/state/ and untrack it; (2) build the SessionStart freshness check; (3) add install-root protections; (4) only then apply the migration. The freshness check is specified as auto-when-safe, loud-when-not, never-silent: if the install is behind origin/main AND its tree is clean, auto-refresh and report the revision movement; if behind AND dirty, refuse to auto-refresh and warn loudly naming the dirty files; if the fetch fails, report that freshness could not be verified rather than staying quiet; additionally assert HEAD is still detached, that no ~/.claude symlink still points at the primary checkout, and that every symlink resolves. The single non-negotiable property is that it must NEVER exit 0 quietly when it cannot determine the answer - that is the exact fail-open bug class this thread has now recorded three times, and superpowers-drift-check.sh:7 still opens with [ -f "$RESOLVER" ] || exit 0, which is why the existing drift checker has been silently reporting nothing. SessionStart is the chosen trigger because config belongs at session boundaries rather than mid-session, and it is a surface the user already reads. Install-root protections are a hard DENY rather than ask for any path under ~/.claude-install - distinguishing the deployed copy, which has no legitimate reason to be edited, from ordinary worktrees which do - plus chmod -R a-w with the refresh briefly restoring write. With auto-refresh at every session start the worst case is one session of staleness and even that announces itself.
