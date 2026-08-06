---
Status: accepted
Date: 2026-08-06T19:16:43.472Z
Thread-Id: 01KZC5TSBXJDM28F8ZCRXC9JQM
---

# 0265. Dependent MSP chains merge with merge-commit; standalone PRs keep squash

## Context

Stacked PRs are being adopted to replace the frontier-train mechanism for blocked MSPs. Squash-merge rewrites commit SHAs, so a squash-merged parent leaves every stacked child with a stale merge-base; a plain rebase then replays already-merged content as phantom conflicts. This is structural to Git, not a GitHub defect. GitHub's native stacked-PR product entered public preview 2026-07-30 and papers over it with a server-side cascading rebase, but its own troubleshooting doc concedes those rebases produce unsigned commits, and independent reports say squash and rebase merges break GitHub's stack identity tracking and require a manual `gh stack rebase`. Repo state measured 2026-08-06: SatanshuMishra/.windful-ocean allows all three merge methods, deleteBranchOnMerge is false (so GitHub's documented auto-retarget trigger does not fire), gh 2.97.0 with no gh-stack extension installed, git 2.55.0 so --update-refs is available. rules/common/git/branching.md currently states squash-on-merge as the integration default.

## Options

- Merge-commit for chains, squash elsewhere: parent commits stay reachable from main, child merge-base stays valid, no restack needed. Costs a branching.md amendment and requires the engine to reduce each MSP branch to one well-formed commit before merge to keep published history clean.
- Keep squash everywhere and have the engine own a cascading restack verb (git rebase --onto / --update-refs / gh stack rebase plus force-push-with-lease per descendant). No rule change, fully linear history, but the engine takes on the least-solved part of the pattern with no human reviewer as a safety net, plus branch-protection and unsigned-commit exposure.
- Merge the whole stack in one operation via gh stack merge and let GitHub compute the cascade. Least engine machinery, but main only advances when the whole chain lands, it depends on a six-day-old preview product and the async merge API, and it is unusable if merge queue is ever enabled.

## Outcome

Chosen by the user on 2026-08-06: merge-commit for dependent MSP chains, squash-on-merge retained for standalone non-chained PRs. Chosen because it removes the SHA-rewrite failure class at its root rather than automating a recovery around it, which is the Quality-over-Optimization reading of pillars.md. Two consequences the new SPEC must carry: rules/common/git/branching.md is amended to scope squash-on-merge to non-chained PRs, and the engine must guarantee each MSP branch is exactly one well-formed commit before merge so a merge commit per MSP still yields clean published history.
