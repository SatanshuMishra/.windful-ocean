---
name: pr
description: Use when opening or creating a pull request in any repository, or immediately after pushing a branch that needs one. Every pull request is composed and opened by one centralized pr-create tool - ad-hoc gh pr create, gh api POSTs to the pulls endpoint, and the GitHub MCP create tool are all denied at the gate. Also covers the required title grammar and body fields, and the rule that a title or body is never rewritten after creation.
---

# PR

Resolve `OWNER/REPO` (from the git remote), `HEAD-BRANCH` (the current branch) and `BASE-BRANCH` (the branch this targets), then run, quoting every value:

```
node ~/.claude/lib/superpowers-parallel/mitosis-git.mjs pr-create \
  --repo OWNER/REPO --head HEAD-BRANCH --base BASE-BRANCH \
  --title "type(scope): lowercase imperative summary" \
  --origin human-or-machine [--provenance "agent=LABEL model=MODEL"] \
  --why "problem and why now" \
  --what "one behavioral change" \
  --not-verified "thing you did not check - not run"
```

`--provenance` is required when `--origin machine` and forbidden when `--origin human`. Never write a `--verified` line for a check you did not actually run. A `pull/new/<branch>` URL printed by `git push` is not an approved path either — always go through this tool.

Full field set, cardinalities, caps and the title grammar: `~/.claude/rules/common/git/pull-requests.md`.
