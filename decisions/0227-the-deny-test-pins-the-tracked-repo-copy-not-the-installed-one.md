---
Status: accepted
Date: 2026-08-03T19:29:16.880Z
Thread-Id: 01KYR405KFXHM15J5XXK5BXTVT
---

# 0227. The deny-list test pins the tracked repo settings.json, not the installed copy under HOME

## Context

A security review ruled it a defect that no-self-merge-consent.test.mjs asserts merge/create/edit deny entries against repo/.claude/settings.json while the file Claude Code actually loads is ~/.claude/settings.json, and directed that the test be repointed at the installed copy. Audit established the two are INDEPENDENT regular files (inodes 129839372 vs 129889333, neither a symlink) - the lone exception in an otherwise fully symlinked install, since ~/.claude/lib, workflows, agents, skills, CLAUDE.md and hooks/block-destructive-bash.sh are all symlinks into this repo. Their permissions.deny blocks are byte-identical today, so no live gap exists; the defect is an unmonitored drift channel plus a failure message that did not say which file it spoke for.

## Options

- Repoint the test at ~/.claude/settings.json as the review directed
- Assert both paths in the same test
- Keep the pin on the tracked repo copy, make the message name that file explicitly, and widen the asserted entry list
- Symlink ~/.claude/settings.json to the repo copy so the drift channel ceases to exist

## Outcome

Keep the pin on the tracked repo copy; do NOT repoint. The review's remedy would have reddened the suite permanently: CI is ubuntu-latest with HOME=/home/runner (.github/workflows/test.yml:14,20), nothing creates ~/.claude, and the test is in the npm test glob, so readFileSync would throw ENOENT on every run. Asserting both paths fails the same way unless the HOME leg is conditionally skipped, and a leg that skips in the only place that gates merges adds no enforcement - it is assurance theatre. The repo copy is also the tracked, diffable, PR-gated artifact, which is where the realistic regression (a PR deleting a deny entry) actually occurs; ~/.claude is not a git repo, so a PR could never regress it. What shipped instead: the failure message now names the tracked repo path explicitly and disclaims the installed copy, and the asserted list widened from 3 merge entries to 10 covering the PR create and update surfaces pull-requests.md declares load-bearing. The drift channel is left OPEN and is filed as separate follow-up work, with symlinking ~/.claude/settings.json into the repo noted as the structural fix that deletes the channel rather than monitoring it - human-applied, not agent-applied. A future reviewer will flag this same pin again; this record is the answer.
