---
name: pr
description: Use when opening or creating a pull request in any repository, or immediately after pushing a branch that needs one. Every pull request is composed and opened by one centralized pr-create tool - ad-hoc gh pr create, gh api POSTs to the pulls endpoint, and the GitHub MCP create tool are all denied at the gate. Also covers the required title grammar and body fields, and the rule that a title or body is never rewritten after creation.
---

# PR

Resolve `OWNER/REPO` (from the git remote), `HEAD-BRANCH` (the current branch) and `BASE-BRANCH` (the branch this targets), then run, quoting every value:

```
node ~/.claude/lib/git/pr.mjs pr-create \
  --repo OWNER/REPO --head HEAD-BRANCH --base BASE-BRANCH \
  --title "type(scope): lowercase imperative summary" \
  --what "The behavior that is different now." \
  --why "The problem that existed before this change." \
  --not-verified "thing you did not check - not run"
```

A `--why`, `--what` or `--risk` value starts with a capital letter and ends with a full stop. Write for a reviewer who has never seen this code: no file names, no line numbers, no internal ids — the Files Changed tab already lists the files. `--why` is the problem that existed before; `--what` is the behavior that is different now. Never write a `--verified` line for a check you did not actually run. A `pull/new/<branch>` URL printed by `git push` is not an approved path either.

Full field set, cardinalities, caps and the title grammar: `~/.claude/rules/common/git/pull-requests.md`.
