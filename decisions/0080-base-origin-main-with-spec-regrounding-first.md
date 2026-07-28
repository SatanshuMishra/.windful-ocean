---
Status: accepted
Date: 2026-07-28T19:54:09.398Z
Thread-Id: 01KYKNBCAE9EH8W1S6HJ8XB9XF
---

# 0080. Base the run on origin/main and re-ground the spec's line cites before dispatch

## Context

The spec is grounded at 450804e, the tip of feat/centralized-pr-creation, which was squash-merged as PR #8 on 2026-07-28. origin/main's engine is 4920 lines vs 4847 at 450804e, moved by 457d6fa. Seven cites were verified to resolve to unrelated code on main. M3 and M5 are deletion MSPs operating under the mirror-guard byte-identity constraint, so a wrong cite means deleting the wrong block in two places.

## Options

- Base on origin/main and first land a docs-only pass re-grounding every cite against main
- Base on origin/main and dispatch immediately, instructing agents to locate targets by symbol name and treat all line numbers as advisory
- Keep the spent feat/centralized-pr-creation as base so the cites resolve exactly

## Outcome

Base on origin/main, re-ground the spec first. The spent branch was rejected because it is already squash-merged and would need a §3.7 restack anyway, and re-merging replays a resolved diff. Symbols-not-lines was rejected because it leaves the authority document wrong on disk while the deletion MSPs are the ones most exposed to a bad cite. Branch prefix for the MSPs is feat/mitosis-quiescent-&lt;msp&gt;.
