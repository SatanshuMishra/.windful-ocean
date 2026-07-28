---
Status: accepted
Date: 2026-07-28T03:18:27.964Z
Thread-Id: 01KYKBMK8J5TTXVV6PHDCHVCCR
---

# 0055. Centralize all PR creation behind one tool, one gate, one rule

## Context

Five independent paths could open a PR and four invented title and body ad hoc. Two of them are vendored plugin code that is overwritten on update and cannot be safely edited. Research established that only permissions.deny and PreToolUse hooks are harness-enforced, while rules and skills are advisory and cannot guarantee compliance.

## Options

- Patch each of the five paths separately
- Place one gate at the shell execution choke point, fed by one generating tool and one rule
- Rely on rules and a skill to instruct the model to use a common format

## Outcome

Gate at the execution choke point. Because the gate sits where the command actually runs, it is origin-agnostic and therefore covers the two vendored paths without editing vendored code — five patches collapse into one. The GitHub MCP path never touches the shell, so it is the one hole the Bash gate structurally cannot cover and it received its own deny rules. Residual risk accepted and documented rather than hidden: subprocess indirection (a script, sh -c, curl) cannot be closed by text matching; closing it would require sandboxing or a scoped token.
