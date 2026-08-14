---
Status: accepted
Date: 2026-08-14T04:33:16.521Z
Thread-Id: 01KZY5ARMRK0S390J8Y25X8Z72
---

# 0413. R6 moves to the logbook plugin repository as a code defect

## Context

c9 bundled step 8, deleting inert or harmful hooks, with R6, disabling or patching the logbook plugin's fail-closed guard. Reading the plugin source established that the fail-closed behavior is a defect in the hook wrapper rather than a configuration problem this thread can properly solve. The handler is narrow and well-behaved: it auto-approves the ledger MCP tools, denies only Write-family calls whose target is inside the ledger store plus oversized Bash naming the store, asks on Bash that merely names the store, and is silent otherwise; the file states its own intent as prompting rather than blocking. The wrapper converts any internal exception into a deny across the whole Bash, Write, Edit, MultiEdit and NotebookEdit surface, far wider than the handler's own authority, with no circuit breaker, and hooks run in every permission mode so bypassPermissions does not clear it. Every config-side option was a workaround: a session-scoped plugin disable that costs the ledger for that run, or an untracked patch to a vendored copy that dies on the next plugin update. The user owns the plugin, so the upstream fix is available in a way it would not be for third-party code.

## Options

- Keep R6 in c9 and ship a config-side workaround, either the plugin disable or a vendored patch
- Leave c9 open indefinitely until the plugin ships a fix
- Amend c9 down to its step 8 scope and move R6 to the logbook plugin repository as a code defect

## Outcome

Amended on the user's instruction. c9 now covers only the step 8 scope, which is complete: the three inert or harmful hooks are gone, session-config-drift-check.sh and its orphaned test are deleted, the gate's dead release-tree tokens are pruned with the suite at 248 of 248 green, and the dead nested settings.local.json is removed. R6 leaves this thread and becomes a defect in the logbook plugin repository, handed off with a self-contained brief so it does not depend on this thread's context. The sequencing caveat is recorded rather than waved away: what executes is the vendored copy under ~/.claude/plugins/cache/, not the development source, so the freeze risk persists for unattended runs until a fixed version is both released and installed. Anything in this configuration that assumed R6 was closed before the first unattended run is therefore still open.
