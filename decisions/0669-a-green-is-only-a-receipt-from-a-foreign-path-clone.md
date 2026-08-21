---
Status: accepted
Date: 2026-08-21T23:28:42.462Z
Thread-Id: 01M0JRG6E36RHFD08HD0K8PN84
---

# 0669. A local green counts only when produced where the guards can see the files

## Context

Three repair cycles ran this session and every one traced to the same mechanic rather than to reviewer thoroughness. The census and lint tests carry the literal segment /worktrees/ in their own excluded-segments list, and every agent worktree lives under .claude/worktrees/, so those tests exclude every candidate file and pass over an empty set. Agents verified honestly, reported green, and CI then reported the truth. The trunk reached seventeen failing tests while each contributing pull request looked green locally.

## Options

- Keep verifying inside the worktree and let CI catch what it catches
- Remove the /worktrees/ segment from the excluded list
- Require every pre-push verification to run from a disposable clone at the head SHA on a path with no /worktrees/ segment

## Outcome

Every pre-push verification runs from a disposable git clone --local checked out to the exact head SHA at a path containing no /worktrees/ segment, with git log -1 confirmed before the result is trusted. A green obtained inside a worktree is recorded as unverified for census, lint and gate files. The excluded segment is not removed, because it exists to stop the census walking sibling checkouts; the fix is where verification runs, not what the census skips.
