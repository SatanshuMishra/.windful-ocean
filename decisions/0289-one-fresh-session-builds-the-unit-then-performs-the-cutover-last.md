---
Status: accepted
Date: 2026-08-08T03:23:47.171Z
Thread-Id: 01KZCF28RN4RMR46VDXFKSQZY3
---

# 0289. One fresh session builds the cutover unit and then performs the live cutover as its last act

## Context

0286 sequenced the work as build the unit, ship one PR, re-rehearse per 0281 against merged main, register converge, then swap on explicit user go, and c5 requires that go. The user gave it this session and directed that the fresh session both BUILD the tool and RUN the cutover. That directive meets a standing safety rule head on: SPEC section 7 and 0274 both require the cutover to run in a session doing nothing else, because the swap is itself a hot swap of the config serving the session performing it. A session that also authors the tool is, read literally, doing something else. The tension is real and cannot be resolved by reinterpreting either side. What can be arranged is the ORDER within that session, and the ordering matters more than the session count: the hazard 0274 names is concurrency with the swap, not authorship earlier in the same session. A second measured fact raises the stakes independently of session boundaries - the primary checkout serves live config and currently sits on feat/invariant-inert-registry, 64 commits behind origin/main with uncommitted edits from another thread, so the cutover moves live content from a 64-behind branch to main's content in one pass rather than merely changing a level of indirection.

## Options

- One fresh session: build, ship the PR, land it, re-rehearse per 0281 against merged main, and only then perform the swap as the session's last act with nothing else in flight - ADOPTED
- Two sessions, keeping the swap alone as 0286 implied. Rejected: the user gave an explicit contrary directive, and the split costs a full context rebuild of a plan that is now fully specified
- Build and swap interleaved, swapping as soon as each piece is ready. Rejected outright: this is precisely the concurrency hazard 0274 and SPEC section 7 exist to remove, and it would hot-swap the tool underneath the session running it
- Swap first from the current state and fix forward. Rejected: 0286 established the swap has no implementation at all, so there is nothing to run

## Outcome

Adopted on the user's explicit direction, with the ordering constraint stated rather than assumed. The build and the swap share a session; they do not share a moment. Everything authored, reviewed, shipped and merged happens first; the rehearsal against merged main happens next; the swap is last, alone, with no other work in flight and no background task running.

The safety rule is honored in substance - nothing else concurrent with the swap - while the session count follows the user's directive. Naming the divergence here rather than silently reinterpreting SPEC section 7 is the point of this record: a future reader comparing the SPEC to what happened will find the difference explained instead of appearing to be a lapse.

Two obligations this places on that session. The 0281 rehearsal must run against the sha that actually ships, after the PR merges, since 0286 already ruled that reasoning about an additive diff is not evidence and the prior green rehearsal validated a now-stale sha. And the operator should expect a large live content change, not a cosmetic relink, because live is currently served from a branch 64 commits behind main.
