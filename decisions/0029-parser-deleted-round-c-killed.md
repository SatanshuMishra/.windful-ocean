---
Status: accepted
Date: 2026-07-27T20:12:02.767Z
Thread-Id: 01KYG4AEKA6NM746BXVRAZ9DWE
---

# 0029. Round C killed and the shell parser deleted outright; replaced by a parse-free substring tripwire

## Context

Two research passes plus direct verification established that the parser defends the wrong layer. The authoritative store is git commits on refs/heads/_ledger inside the project's own .git, committed per mutation and pushed to origin at session end; the guarded $CLAUDE_PLUGIN_DATA directory is a disposable worktree the plugin itself rm -rf's and rebuilds on every init (git-ref-driver.mjs:209-213). Executed against classifyBashCommand, the parser ALLOWS git branch -D _ledger, git update-ref -d refs/heads/_ledger, git push origin :_ledger, git gc --prune=now and PATH=/tmp cat ROOT/f, while DENYING rm -rf ROOT - it blocks destruction of the recoverable copy and passes every kill-path for the durable one. Externally: Cursor shipped this architecture, was bypassed four ways, and deprecated its denylist in v1.3; Claude Code's own docs concede prefix rules miss /bin/rm and find -delete and point to the OS sandbox; git does not protect .git, relying on recoverability. The pattern is the named shotgun-parser / parser-differential anti-pattern, and all 23 commits on this branch are differentials. This supersedes the deny-by-default design direction of 0018 and the hardening authorization of 0023.

## Options

- Round C then a third re-review - the prior plan; rejected, since two rounds closed every old hole and each produced new ones in the fix code, and the exit condition was undefined
- Harden the parser but also extend it to cover the _ledger ref - rejected, it grows the surface that is already unwinnable and still cannot cover a directory the agent must write
- Delete the parser outright and replace it with a parse-free substring tripwire - chosen
- Delete the parser and add nothing - rejected, it drops the cheap accident coverage that the Write/Edit path check and a tripwire provide at near-zero cost

## Outcome

DELETE the parser: command-allowlist.mjs, command-scope.mjs, shell-tokens.mjs, shell-source.mjs, token-access.mjs and the unit/scope/overlay machinery in pre-tool-use.mjs, with their tests. KEEP the Write/Edit/MultiEdit/NotebookEdit path deny (one path comparison, no parsing), the ledger-tool auto-approve, resolveLedgerRoots, and hook-io's fail-closed behaviour. REPLACE with a substring tripwire: if a Bash command's text contains a ledger root or the ledger ref name _ledger, return ask. No tokenizing, no allowlist, no head normalization, roughly 15 lines. This RAISES coverage rather than lowering it - the four ref-deletion commands the parser allowed are caught by the tripwire. It is a guardrail that fails to a human prompt, explicitly NOT a security boundary, and must be documented as such. Do not reintroduce shell parsing in any form.
