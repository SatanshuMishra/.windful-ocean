---
description: Open a pull request through the centralized pr-create tool. Use whenever you need to open a PR in this repo - ad-hoc `gh pr create` and the GitHub MCP create tool are denied at the gate.
---

Resolve `OWNER/REPO` (from the git remote), `HEAD-BRANCH` (the current branch) and `BASE-BRANCH` (the branch this targets), then run, quoting every value:

```
node .claude/lib/superpowers-parallel/mitosis-git.mjs pr-create \
  --repo OWNER/REPO --head HEAD-BRANCH --base BASE-BRANCH \
  --title "type(scope): lowercase imperative summary" \
  --origin human-or-machine [--provenance "agent=LABEL model=MODEL"] \
  --why "problem and why now" \
  --what "one behavioral change" \
  --not-verified "thing you did not check - not run"
```

`--provenance` is required when `--origin machine` and forbidden when `--origin human`. Never write a `--verified` line for a check you did not actually run. A `pull/new/<branch>` URL printed by `git push` is not an approved path either — always go through this tool.

Full field set, cardinalities, caps and the title grammar: `.claude/rules/common/git/pull-requests.md`.
