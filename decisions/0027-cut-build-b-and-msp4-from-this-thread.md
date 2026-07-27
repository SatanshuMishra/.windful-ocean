---
Status: accepted
Date: 2026-07-27T03:39:25.600Z
Thread-Id: 01KYERCMSSYD9ZBF28B51HMRWW
---

# 0027. Build B (restack) and MSP-4 are cut from this thread; scope narrows to shipping Build A

## Context

The thread carried fourteen open risks and three workstreams, making every resume expensive and leaving no reachable definition of done. Build B (a `restack` verb driving `git rebase --onto`) has two unstarted prerequisites, both re-verified against code this session: reconcileShippedSet at mitosis.js:371 builds {prUrl, mergedAt} and silently discards mergedSha even though the reconcile agent is asked to return it, so a restack driver has no sha to rebase onto; and mitosis-git.mjs exposes only the verbs pr-create, pr-close, compare and exports execGh with no git exec primitive. Build B shares nothing with Build A beyond a decision record. MSP-4 was never defined in this thread — it traces to a v1 plan where it meant the target-aware ref-parsing hook (RC2), likely moot under 0009 — and an undefined item can only be defined or dropped, never completed.

## Options

- Keep all three workstreams in one thread — rejected: no reachable done, and every resume re-reads fourteen risks
- CHOSEN: narrow this thread to shipping Build A; cut Build B to a successor thread; drop MSP-4 until the user defines it
- Abandon the thread and reopen fresh — rejected: Build A is built, green, and worth landing as-is

## Outcome

USER-LOCKED. This thread's remaining scope is exactly one criterion: Build A reviewed, committed, and shipped as its own PR. Build B is CUT — it becomes a successor thread carrying its two verified prerequisites (restore mergedSha through reconcileShippedSet:371, and add a git exec primitive to mitosis-git.mjs) plus decisions 0010/0012/0017, which remain valid and are not reopened. MSP-4 is DROPPED, not deferred; it reopens only if the user defines it. Four defects also move out of this thread because they are unrelated to the server boundary: the squash-merge containment gap (mitosis.js:3004 and 4490 use `merge-base --is-ancestor` as the only containment check, defeated by a squash merge; 1197 is safe, 4631 partly exposed), the clean(undefined) TypeError, the conditional-host foreign-merged-PR gap, and the d57e233 codename scrub (which belongs to the mitosis-resilience thread). Applying runbook Sections 2-6 stays a human GitHub-UI task and is tracked as a delivery dependency, not code work: until it is done the preflight correctly halts every run, so Build A ships but is inert until a human applies the boundary.
