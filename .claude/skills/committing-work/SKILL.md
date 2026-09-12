---
name: committing-work
description: Use when committing code, shaping a commit message, or cutting a branch - covers Conventional Commits format, atomic commit cadence, diff size targets, and branch naming. Also covers the pathspec discipline that stops a concurrent agent's staged files landing in your commit.
---

## Message format

```
<type>: <description>

<optional body>
```

Types: feat, fix, refactor, docs, test, chore, perf, ci. Conventional Commits for the published commit.

On squash-merge the pull request title becomes the squashed commit subject, so it carries the same grammar. That title is composed and validated by the centralized pull request tool, never authored ad hoc.

## Cadence

Commit as each coherent increment lands - a test that now fails for the right reason, a function that works, a file that is finished. Do not wait to be asked and do not wait until the unit is done.

One logical change per commit. Separate refactor commits from behaviour-change commits; never mix a rename or move with a behaviour change. When the two genuinely cannot be split, the discharge is a characterization test pinning the surviving behaviour, written BEFORE the refactor, never one reconstructed afterwards from what the refactor happened to produce.

On a working branch, commit small increments freely. Squash-on-merge keeps the published history clean regardless of how messy the branch is. A clean working tree is part of your finishing condition.

## Commit with an explicit pathspec

Use `git commit -m "..." -- <the paths you changed>`, never a bare `git commit`. A bare commit takes the entire index, and another agent working in the same tree can stage its own files between your `git add` and your commit, so your commit carries work you never wrote. Read `git show --stat HEAD` afterwards and confirm it names only your files. The exit code is zero either way, so it cannot tell you this happened.

Prefer `git -C <path>` over changing directory first. A leading `cd` in a compound command can exit early and silently drop the commit while reporting success.

## Diff size

Target roughly 200 lines per reviewable change; treat 400 as a hard ceiling. Defect-finding per line declines continuously with size - there is no cliff - per the SmartBear/Cisco case study, whose measured breakpoint is around 200-250. Independent evidence is stricter: Google targets around 100-line changes, and measured medians across Google, Microsoft, AMD and open source are 11-44 lines.

## Branching

Never commit straight to the default branch. If you are on it and a change is needed, create a branch first.

One branch per logical line of work, named for it: `feat/...`, `fix/...`, `chore/...`, `docs/...`.

A branch created with `git worktree add -b` inherits the trunk as its upstream, so a bare `git push` targets the trunk. Always push with an explicit `-u origin <branch>`.

Squash-on-merge is the integration default.

## What you do not do

You do not push, rebase, amend, or open a pull request from inside a work increment. Publishing is a separate act with its own tool and its own format.
