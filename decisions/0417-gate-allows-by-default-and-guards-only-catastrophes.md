---
Status: accepted
Date: 2026-08-14T05:34:28.773Z
Thread-Id: 01KZY5ARMRK0S390J8Y25X8Z72
---

# 0417. The bash gate allows by default; only device, privileged-delete, exfiltration, PR and Supabase branches survive

## Context

A survey of what still prompts under auto mode found two ask sources and only two: the bash gate's ask branches, and the auto-mode classifier adjudicating every command outside the 33 narrow allow prefixes. No settings file carries an ask key, so no ask comes from a permission rule. The owner instructed that all git and gh actions outside merge, all rm -rf, all guardrail-path writes, and the entire classifier fallthrough class be allowed, with Supabase the single guard retained in that class. M25 established that broad allow rules are silently discarded under auto mode, so settings cannot express "allow all"; M24 established that a PreToolUse allow suppresses the classifier itself. The hook is therefore the only mechanism that can implement the instruction.

## Options

- Enumerate narrow allow prefixes per command family in settings
- Make the gate's terminal verdict allow and keep only catastrophe branches
- Pin defaultMode away from auto and rely on the bare tool-level allow entries

## Outcome

The gate's terminal verdict became allow rather than no-opinion, making it the sole arbiter of Bash under auto mode. Deleted: rm -rf, git force push, reset --hard, clean -f, filter-branch, reflog expire / gc --prune, stash clear, branch -D, and the guardrail-write verb set. Kept: dd to device, mkfs, raw-device redirect, sudo rm, chflags nouchg on a guardrail path, the fork bomb and credential-exfiltration asks, and both PR denies. Added: a Supabase deny inside the gate for the five hosted-project verbs, wrapper-tolerant, with the local disposable-container carve-out allowed. Edit, Write and NotebookEdit got their own allow hook because auto mode discards their bare allow entries. The PR-create centralization was explicitly preserved on the owner's ruling after being offered for removal: it costs zero prompts during compliant work since the documented path is the tool, and the gate is the only origin-agnostic catch for gh api POSTs, GraphQL mutations and at-file indirection. Three residual risks are recorded in the threat model rather than fixed: guardrail files are now freely writable by an unattended agent with git as the only recovery, the surviving chflags branch is close to vacuous, and a matcher bug now upgrades a command to allow instead of falling through to another layer. The fault path still fails to ask, which Definition of done item 2 now carries alone.
