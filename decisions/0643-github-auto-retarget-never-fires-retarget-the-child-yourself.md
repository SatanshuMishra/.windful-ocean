---
Status: accepted
Date: 2026-08-20T07:08:08.466Z
Thread-Id: 01KZTEFMENXBW30ZE633YNFJHE
---

# 0643. Auto-retarget never fired, so retarget a stacked child explicitly before deleting its parent branch

## Context

GitHub documents that deleting a head branch after its pull request merges retargets every open pull request based on that branch. Two independent measurements on 2026-08-20 contradict the documentation: a separate api ref delete closed the child, and gh pr merge --delete-branch closed the child too. Both timelines carry base_ref_deleted and closed at the same second with no retarget event.

## Options

- Trust the documented auto-retarget and delete the parent branch at merge time - measured to close the child, twice
- Turn on the repository's delete-branch-on-merge setting and hope GitHub deletes it with merge context - untested, and it asks every live user to change a repository setting
- Retarget the child explicitly with gh pr edit --base before deleting the parent branch - ratified as decision 0519 and now measured

## Outcome

Measured on a purpose-built probe pair: retargeting the child first, then deleting the old base branch, leaves the child OPEN, based on the trunk and MERGEABLE, with only a base_ref_changed event on its timeline. gh pr edit --base is permitted at the gate; only --title and --body are denied. gh pr merge --delete-branch is not deletion inside the merge - gh issues a separate ref delete afterwards - which is why it behaves identically to a manual delete. The runbook now carries the measured six-step sequence. Filed for the successor backlog, not fixed in flight: the engine emits deleteAfterMerge and a stacked base but expresses no retarget step, so its merge order cannot be executed safely as written.
