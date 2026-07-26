ADDENDUM after the hand-off, at user request. The thread was already paused; this adds a task and does not reopen it.

TASK ADDED, verbatim from the user:
"Second, the plugin's guard blocking my read-only grep is a live defect worth fixing alongside the hook matcher - it will keep blocking legitimate verification, and it's what pushed me to verify through the MCP tools instead. Both fixes need you to approve the edit directly at the prompt; the classifier denied it twice unprompted last session."

HOW IT WAS RECORDED
Promoted from a spine open_risk to a SIXTH completion criterion, so it is an acceptance requirement rather than a note that a future session can resume past. The thread now stands at 4 of 6 criteria met (criterion 5, the live-plugin verification, and the new criterion 6 both remain open).

THE DEFECT, CONCRETELY
The plugin's PreToolUse guard rejected `grep -l "" <store>/threads/*.md | xargs -n1 basename`, a strictly read-only command, with "a mutating Bash command targeting the session-continuity ledger store is not permitted". Nothing in that pipeline writes. The guard is pattern-matching the command text rather than classifying the operation, so it will keep refusing legitimate verification of the store. Two knock-on facts already observed: it forced store verification onto the MCP tools this session, and its refusal message still prints the PRE-fix `mcp__ledger__*` spelling, which is a cheap live probe for which plugin build is installed.

WHY IT PAIRS WITH THE HOOK MATCHER
Same file family (hooks/hooks.json, hooks/lib/pre-tool-use.mjs), same root cause shape - matching on names/patterns instead of on the actual tool or operation - and the same blocker: the Claude Code auto-mode classifier denied the hook-matcher edit TWICE last session without ever surfacing an interactive prompt. Neither fix can be delegated to a subagent by relay. Both need the user to approve the edit directly at the prompt.