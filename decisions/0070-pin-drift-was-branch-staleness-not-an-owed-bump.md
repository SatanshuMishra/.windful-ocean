---
Status: accepted
Date: 2026-07-28T19:18:24.661Z
Thread-Id: 01KYJTVMQ06B0NY6ENYKZCRYBP
---

# 0070. The p/default pin blocker is branch staleness, discharged by merging origin/main

## Context

0052 recorded the p/default pin as DRIFTED (canonical d9f73571 vs pinned 39e9e106) and treated a pin bump as an owed human ruling that blocked pushing fix/ledger-lint-boundary-guards. That framing was wrong about WHERE the stale pin lives. fix/ledger-lint-boundary-guards is based on cd5c65d, four commits behind origin/main. origin/main already pins d9f73571 - re-vendored by the human in PR #6 (b2f45bb). The stale 39e9e106 exists only on this branch's base. Evidence gathered this session: a fresh fetch of semgrep.dev/c/p/default canonicalized to d9f73571cb16f43a3a51b5c9c29d712a77bfe5133f684bd7d713347205a55c96, byte-identical to origin/main's pin, so upstream has NOT drifted again past it; all 4 nosemgrep rule ids across 21 pragmas still exist in the fetched ruleset (0 dead, 0 renamed); and the security workflow is GREEN on origin/main HEAD 7e2e7d7, which empirically settles the open question of whether that hash reproduces under CI's Python 3.12.

## Options

- Author a new pin bump on this branch (0052's framing) - would have re-derived a value the human already reviewed and merged, and would conflict with origin/main
- Merge origin/main into the branch so the already-reviewed pin arrives with it
- Vendor the canonical ruleset content to replace the hash-only pin - the durable fix, but explicitly out of this thread's scope

## Outcome

Merge origin/main. No new pin value is authored by an agent; the pin in force is the one the human re-vendored in PR #6. 0052 is discharged, not superseded by a fresh ruling - the blocker was staleness, and merging removes it. The vendoring recommendation stands unbuilt: the security review independently reached the same conclusion this thread had already scoped out, namely that a hash-with-no-content pin cannot diff old rules against new, so every drift forces a full-trust decision on a 1074-rule blob nobody read, and drift recurred within 8 days. That is now a user call, not an assumption.
