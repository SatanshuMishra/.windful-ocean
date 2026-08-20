---
Status: accepted
Date: 2026-08-20T03:27:17.438Z
Thread-Id: 01KZTEFMENXBW30ZE633YNFJHE
---

# 0636. User waives c41's required-check precondition; the cleanup starts on M16 green alone

## Context

c41 is gated on M16 being green AND a required status check, per ruling 1 of 0618. M16 went green on the trunk when PR 250 merged at a44f5fac. Making the check required then proved to be a larger change than described: main carries NO branch protection at all, returning 404 Branch not protected, so requiring the check would create protection from scratch rather than flip a setting on existing protection.

## Options

- Create minimal branch protection requiring only the test check, admin enforcement off
- Hand the user the command and hold c41 until they run it
- Waive the required half and start c41 on M16 green alone

## Outcome

USER RULED: waive the required half. c41 proceeds with M16 green and running in CI on every pull request, without the check being made required, and no branch protection is created on main. This is an explicit amendment to the precondition the user set in ruling 1 of 0618, made by the user after being shown that main is unprotected; it is NOT an agent reinterpretation of the criterion, and it is recorded here so no later reader mistakes it for one. The substance the precondition protected is preserved: 0619 gated the cleanup because the suite is the only regression guard while it is being changed and M16 is what makes a post-cleanup green trustworthy. M16 does run on every pull request and does pass, so it remains that guard; the required flag would only have stopped someone from ignoring a red, which is a merge-discipline property rather than a coverage property. What the waiver gives up, stated plainly so it is not later read as free: nothing mechanically blocks merging a pull request whose M16 run is red, so the cleanup's own pull requests must have their per-check conclusions read individually rather than trusted to an aggregate or to a required gate. The branch-protection question is not closed by this, only decoupled from c41; it remains available to the user at any time.
