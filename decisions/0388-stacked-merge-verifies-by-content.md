---
Status: accepted
Date: 2026-08-13T16:09:51.748Z
Thread-Id: 01KZTEFMENXBW30ZE633YNFJHE
---

# 0388. A stacked merge is verified by content, and its base worktree is removed before the merge

## Context

PR #79 reported MERGED and its payload never reached the stack base, repeating the #76 incident. #78 had already been merged when the merge command ran, so gh pr merge --delete-branch had nothing to delete, the base branch stayed alive, and GitHub never retargeted #79. The root cause was found only afterwards: every branch in this repo is held by a worktree under .claude/worktrees/, gh refuses to delete a worktree-held branch, and when that local delete fails the REMOTE branch survives too. The verification step meant to catch this made it worse. It used git merge-base --is-ancestor on the pre-squash SHA, but a squash merge rewrites the commit, so that check is guaranteed to report NO after any squash. It printed a false STOP that was correctly overridden, and the correct content-based check at the following step confirmed the payload was safe.

## Options

- Keep using ancestry checks and accept that squashes produce false alarms
- Verify by content, and remove the base worktree before merging so --delete-branch succeeds
- Stop stacking PRs entirely and serialize every MSP onto the base
- Switch the repo to merge commits instead of squash so ancestry checks work

## Outcome

VERIFY BY CONTENT, never by ancestry, whenever a squash merge is involved. git merge-base --is-ancestor only proves anything for true merge commits; after a squash the base holds the same content under a new SHA, so a NO is uninformative rather than a stop signal. Use git diff <head> origin/<base> over the touched paths, or compare the changed files directly. Before merging any PR whose branch is a base for another, REMOVE ITS WORKTREE first so --delete-branch can succeed, and afterwards confirm the ref is actually gone with git ls-remote --heads origin <branch> rather than trusting gh's exit. Squash stays the integration default; the fix is the verification method and the worktree ordering, not the merge strategy. Stacking also stays, because serializing every MSP would forfeit the parallelism the whole eighteen-MSP plan is built on.
