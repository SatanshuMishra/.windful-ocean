# Commits (form + cadence)

## Message format

```
<type>: <description>

<optional body>
```

Types: feat, fix, refactor, docs, test, chore, perf, ci. Conventional Commits for the published / squashed commit. No AI co-author attribution (disabled globally).

## Cadence

- **Atomic commits.** One logical change per commit. Separate refactor commits from behavior-change commits — never mix a rename or move with a behavior change.
- **Commit often, perfect later.** On the working branch, commit small increments freely (WIP is fine); squash-on-merge so the published history is clean. Keep Conventional Commits format for the squashed commit.
- **Small diffs.** Target ~200-400 LOC per reviewable change; review effectiveness drops sharply above that (SmartBear/Cisco code-review study; Google ~100-line CLs; DORA "work in small batches").
- **Autonomous cadence.** Commit and push without waiting to be asked — frequent atomic commits are the default, not a request. Many small commits beat one mega-commit: each is a checkpoint that keeps changes trackable and easy to revert when problems arise. Destructive git operations still require explicit confirmation.
