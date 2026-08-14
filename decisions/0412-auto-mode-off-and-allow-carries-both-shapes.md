---
Status: accepted
Date: 2026-08-14T04:13:12.738Z
Thread-Id: 01KZY5ARMRK0S390J8Y25X8Z72
---

# 0412. Auto mode is off, and allow deliberately carries both the broad and the narrow shape

## Context

0408 ratified a tool-level allow on the reasoning that any enumeration of prefixes has gaps by construction and each gap is an interrupt. Executing c4 exposed a condition 0408 did not know about: the session was running in auto mode, discovered when the auto mode classifier denied the c4 edit and named itself, with defaultMode null in all three settings files. M25 measured that auto mode SILENTLY discards broad allow rules, logging "Ignoring dangerous permission Bash(*) ... (bypasses classifier)" only at debug level, while narrow prefixes such as Bash(chmod:*) work normally. The official permissions documentation confirms bare Bash and Bash(*) are equivalent, so the ratified shape would have been inert in the mode actually in use, and 0408's reasoning inverts there: the enumeration it rejected is the only shape that functions. The same documentation pass established that "mcp__*" is skipped with a warning in an allow rule and that MCP allow rules require a literal mcp__server__ prefix, so c4's own wording, "broad tool-level allow plus mcp__* coverage", is unimplementable as written.

## Options

- Pin permissions.defaultMode to default and write the broad shape only
- Stay in auto mode and implement c4 as narrow per-family prefixes only, leaving 0408 unimplemented
- Move off auto mode and carry both shapes in the allow list

## Outcome

On the user's explicit instruction, auto mode is turned off at the session level rather than pinned in settings, and the allow list carries both shapes. The 33 narrow per-family prefixes are RETAINED alongside the 9 bare tool-level entries deliberately, not as leftovers: they are redundant under default and bypassPermissions but are the only rules that function if auto mode is ever selected again, and they cost nothing but list length. Do not delete them as duplicates. MCP is enumerated across 20 servers because the platform forbids a wildcard in an allow rule; that enumeration has gaps by construction and needs a line added whenever a server is added, which is a permanent maintenance cost the criterion did not anticipate. Two limits recorded with this: the mode is now session-selected rather than declared, so nothing in the repository asserts it; and the SPEC's claim that deny survives every permission mode is unverified for bypassPermissions, since the documentation is ambiguous and no U1-U7 experiment covers it, so "the merge gates still hold in an unattended run" is not established.
