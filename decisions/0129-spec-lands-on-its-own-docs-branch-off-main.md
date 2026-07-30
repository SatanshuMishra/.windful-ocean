---
Status: accepted
Date: 2026-07-30T07:15:45.902Z
Thread-Id: 01KYR405KFXHM15J5XXK5BXTVT
---

# 0129. The rebuild spec lands on its own docs branch off main, not bundled with MSP-0

## Context

The prior hand-off named branch choice as the first decision of this session: the spec was untracked on feat/centralized-pr-creation, a different line of work, and committing it there would pollute that branch's PR-creation diff. Three placements were available.

## Options

- Commit on feat/centralized-pr-creation where it already sat
- Bundle the spec into MSP-0's branch and PR
- Give it its own docs branch cut off freshly fetched origin/main

## Outcome

Own docs branch. Cut docs/mitosis-core-rebuild-spec off origin/main 6d19499, committed verbatim at d444797, pushed. Rejected the first option because it pollutes an unrelated PR's diff, which is the pollution the hand-off flagged. Rejected bundling into MSP-0 because it violates atomic commits — a docs artifact and a gate implementation are separate logical changes with separate reasons to change — and because it couples a document that every later MSP branch wants to inherit to the review latency of one code PR. Landing the spec on main first means every subsequent MSP branch carries it. Merge stays human-gated, so the spec PR does not block MSP-0: MSP-0 branches off origin/main independently. The spec was committed VERBATIM rather than corrected in the same commit; its section 15 provenance claim is known false off main (0128), and amending an approved spec is a decision reserved to the user, not a mechanical fix to fold into a placement commit. Operational note: the switch required stashing three tracked files belonging to feat/centralized-pr-creation and moving one untracked spec that was byte-identical to main's copy. Both are recorded in the spine as residue needing restoration.
