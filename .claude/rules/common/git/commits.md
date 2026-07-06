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
- This does NOT change the rule that commits and pushes happen only when the user asks. It governs how work is shaped into commits when they do.
