---
Status: accepted
Date: 2026-08-14T00:14:59.110Z
Thread-Id: 01KZY5ARMRK0S390J8Y25X8Z72
---

# 0408. Allow is broad by default; deny is the only narrow list (supersedes 0396)

## Context

0396 ratified that allow rules enumerate narrow command prefixes and that a broad Bash star rule is counterproductive. That holds only under the containment premise 0407 rejected, where a PreToolUse gate would carry the judgment an enumeration cannot. Without it the enumeration is the friction: every command shape not on the list produces a prompt, which is exactly the interrupt this thread exists to remove, and it is what drove settings.local.json to accumulate one-off rules (the accumulation c4 was meant to stop at source). The current lists are 33 allow and 47 deny entries and still prompt constantly. The decisive mechanic is that in Claude Code deny takes precedence over allow, so widening allow cannot weaken any deny: the guard strength is set entirely by the deny list, and a broad allow only removes prompts for everything the deny list does not name. The user's standing posture is maximum freedom with guards only on true catastrophes.

## Options

- Keep 0396: enumerate narrow prefixes and accept a prompt whenever a command shape is unlisted
- Widen to broad per-family prefixes (Bash(git:*), Bash(gh:*), Bash(npm:*), Bash(node:*)) plus mcp__* coverage
- Go fully tool-level: allow Bash and the MCP surface outright and let the deny list be the sole narrow guard

## Outcome

Overturned on the user's explicit instruction. Allow is broad and deny is the only narrow list. Any enumeration of allowed prefixes has gaps by construction, and each gap is an interrupt that breaks unattended operation, so per-family prefixes only shrink the gap rather than close it; the tool-level allow is the only shape that reaches zero prompts for ordinary work. Deny precedence is what makes this safe - the catastrophe guards keep working untouched, and nothing about widening allow weakens them. Retained deny categories, explicitly NOT loosened by this: the merge gates (gh pr merge, merge_pull_request), pr-create centralization, default-branch pushes per 0399, secret and credential reads, and the remote database commands that the separate no-direct-db-access project rule owns. Implementation note: the exact rule spelling for a tool-level allow is verified against live behavior when c4 is executed rather than assumed here, and settings.local.json is truncated in the same change so accumulation stops at source.
