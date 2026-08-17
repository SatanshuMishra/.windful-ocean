# Commits (form + cadence)

## Message format

```
<type>: <description>

<optional body>
```

Types: feat, fix, refactor, docs, test, chore, perf, ci. Conventional Commits for the published / squashed commit. No AI co-author attribution (disabled globally).

On GitHub squash-merge, the PR title becomes this squashed commit's subject, so it must carry the same grammar. The PR title is composed and validated by the centralized `pr-create` tool (`PR_TITLE_PATTERN`, max 72 characters) — see `git/pull-requests.md`, never authored ad hoc.

## Cadence

- **Atomic commits.** One logical change per commit. Separate refactor commits from behavior-change commits — never mix a rename or move with a behavior change. When the two genuinely cannot be split, the discharge is a characterization test pinning the surviving behavior, written BEFORE the refactor — never one reconstructed afterwards from what the refactor happened to produce.
- **Commit often, perfect later.** On the working branch, commit small increments freely (WIP is fine); squash-on-merge so the published history is clean. Keep Conventional Commits format for the squashed commit.
- **Small diffs.** Target ~200 LOC per reviewable change; treat 400 as a hard ceiling. Defect-finding per line declines *continuously* with size — there is no cliff — per the [SmartBear/Cisco case study](https://static0.smartbear.co/support/media/resources/cc/book/code-review-cisco-case-study.pdf), an observational single-customer study measuring defects per 1000 LOC, whose measured breakpoint is ~200-250; its 300-400 figure is an inference from reviewer fatigue, not a measurement. Independent evidence is stricter: [Google targets ~100-line CLs](https://google.github.io/eng-practices/review/developer/small-cls.html), and measured medians across Google, Microsoft, AMD and OSS are 11-44 lines ([Rigby and Bird, ESEC/FSE 2013](https://www.microsoft.com/en-us/research/wp-content/uploads/2016/02/rigby2013convergent.pdf)). DORA's ["work in small batches"](https://dora.dev/capabilities/working-in-small-batches/) measures delivery performance, not review defect detection; it is not evidence for this rule.
- **Autonomous cadence.** Commit and push without waiting to be asked — frequent atomic commits are the default, not a request. Many small commits beat one mega-commit: each is a checkpoint that keeps changes trackable and easy to revert when problems arise.
