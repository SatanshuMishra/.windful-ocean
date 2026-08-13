---
Status: accepted
Date: 2026-08-13T18:06:26.859Z
Thread-Id: 01KZ0D32M5MRY6TY6XV55AD62A
---

# 0390. Guard set is D1-D5 with destructive local operations reclassified to checkpoint

## Context

Under the maximum-autonomy goal, the guard set had to be derived from what is genuinely unrecoverable rather than from command names. Research established that almost nothing is technically unrecoverable: GitHub repository deletion has a 90-day self-service restore, branch deletion and reset --hard on committed work are reflog-recoverable for 90/30 days, npm version burns are irrelevant after a version bump, and card payments are refundable. What IS unrecoverable is narrower and different in kind.

## Options

- Gate on command names as before
- Gate on the three-question recovery test - does a copy survive, is the window long enough, do effects stay inside the workspace
- Gate nothing and rely on isolation plus snapshots alone

## Outcome

Ratified five guards: D1 secrets leaving the machine, D2 the recovery layer itself, D3 remote and production state, D4 irreversible outbound actions, D5 making private state public. D6 - destructive LOCAL operations such as reset --hard, clean -fd and rm -rf inside the repo - is deliberately NOT a guard: it is checkpointed and allowed to proceed, because a prompt at 3am is an abort while a checkpoint is a non-event. A pressure test the same day found the guard set sound in membership but amended three guards and rejected one mechanism, all applied: D1 gates OUTBOUND MOVEMENT not authorship (the write-side secret scanner is separate hygiene, not D1's implementation); D2 requires a mandatory age-based reaper running outside the agent's reach, since the agent may not prune what it may not touch; D4 narrows to actions with no retraction reaching parties outside the user's own accounts, so issue and PR comments on the user's own repositories are ungated; D6's git stash create is REJECTED because it cannot capture untracked files, which is precisely the class D6 exists to protect - a temp-index checkpoint is required and the 19ms measurement does not carry over.
