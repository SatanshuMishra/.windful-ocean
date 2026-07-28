---
Status: accepted
Date: 2026-07-28T06:44:53.552Z
Thread-Id: 01KYKNBCAE9EH8W1S6HJ8XB9XF
---

# 0066. Keep PR-open deferral; reject the industry stacked-PR pattern

## Context

The 2026-07-28 Fable fan-out resolved the thread's central design question. Research found that production stacked-PR tools (Git Town, Graphite, Aviator) do NOT open a child PR against base carrying parent commits, nor defer it: they target the child PR at the PARENT's branch, detect parent-merge via the forge API (squash-merge makes git-level detection impossible), then retarget to base and rebase --onto. The parallel design agent evaluated exactly that as its Option C and rejected it: retargeting requires force-pushing published heads, colliding with the engine's supersede-not-rewrite invariant (mitosis.js:4100-4135). The design's objection is mechanically correct - those tools force-push with --force-with-lease on restack. Decisively, the design also established that PR deferral is NOT the cause of the reported halt: between human events there is no agent work at a review boundary, and build-ahead already continues during review (isBuildable admits built|awaiting|done parents, mitosis.js:1905-1915). The halt comes from findings 2/3/4 - window floor, the 6-cycle bounded merge poll, and failure-shaped reporting of review latency. Finding 1 was therefore misattributed as the cause from the outset.

## Options

- Keep deferral: child PR opens only when every parent is merged, as today
- Adopt the industry stacked-PR pattern: child PR targets the parent's branch, retargeted on parent merge via the forge API
- Ship the non-stop fix with deferral intact and revisit stacked PRs later as a separate decision

## Outcome

USER RULING: keep deferral. The child's head physically contains its unmerged parents' commits (mitosis.js:4508), so the alternative buys parallel human review of a chain at the cost of relaxing no-force-push for run-owned unmerged branches and of the one-MSP-one-diff review contract. Since deferral is not what halts runs, keeping it does not compromise the target capability - it removes the riskiest change on the table while leaving the goal intact. The PR-open policy in any resulting spec is UNCHANGED from today. If stacked PRs are ever revisited, two constraints carry forward: retarget requires force-push (or a supersede-PR per parent merge), and merged-parent branch deletion must go through the forge API only, because GitHub's auto-retarget misfires and CLOSES child PRs when the parent branch is deleted via git CLI (github.com/orgs/community/discussions/131045).
