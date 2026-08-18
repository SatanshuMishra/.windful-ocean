---
Status: accepted
Date: 2026-08-18T05:27:39.191Z
Thread-Id: 01M04HH9W6HVPQJDPW24WH48GC
---

# 0563. Wave 6 lands as one pull request carrying U6.1 and U6.2 as atomic commits, wave 7 as its own

## Context

U6.2's acceptance is the retirement census at exit 0 over the whole configuration. That is unreachable unless U6.1's decompose-emit.mjs:16 is already repointed in the same tree, because the census counts all eighteen sites without regard to which unit owns them. So the two units cannot each prove themselves green as independent pull requests. Decision 0521 established stacked pull requests for blocked MSP chains, and decision 0560 recorded what that pattern cost hours earlier: PRs 205 through 208 merged into a base branch that still existed, reported MERGED, and delivered none of their content to main. Separately, the census resolves its scan root through git commondir, so wave 6 must execute in the primary checkout rather than a linked worktree, which removes worktree isolation as a reason to split the units across branches.

## Options

- One pull request for wave 6 carrying U6.1 and U6.2 as two atomic commits, wave 7 separate
- Two stacked pull requests per decision 0521 with mandatory parent-branch deletion
- Two sequential pull requests, merging U6.1 to main before U6.2 branches off it

## Outcome

User ruling: one pull request for wave 6, carrying U6.1 and U6.2 as two atomic commits on refactor/wave-6-repoint-retiring-agents, then a separate pull request for wave 7. Two human merges rather than three, no stacking hazard, and the unit decomposition survives in the commit graph. This is the shape decision 0560 landed on after the trap fired. Stacking was rejected as reintroducing the exact ordering hazard that had just cost four merges. Sequential merging was rejected because it blocks U6.2 behind a human merge for no gain the atomic-commit split does not already provide. Wave 7 stays a separate pull request on principle rather than convenience: the expand-migrate-contract invariant requires the check proving nothing references the nine to have RUN before the definitions are deleted, and folding both into one merge would collapse that proof into an assertion about its own change.
