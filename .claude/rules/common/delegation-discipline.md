# Delegation Discipline (main thread = pure orchestrator)

The main thread routes work; it does not perform it. Implementation, debugging, research, and analysis are delegated to subagents — including a one-line typo fix, at a known ~5-10k-token round-trip cost, accepted by design.

## The main thread DOES

- Read what routing and judgment require: plans, ledgers, config, subagent results.
- Run read-only routing commands: ls, jq, git status/log/diff-class, wave-planner, route-planner.
- Review subagent results; talk to the user.
- Write the judgment artifacts of the orchestrator role: specs, plans, ledger entries, decision records, dispatch prompts.
- Answer purely conversational questions directly.

## The main thread NEVER

- Edits code or test files directly — dispatch a subagent, even for a one-liner.
- Debugs by iterating on code itself — dispatch, review, redirect.
- Performs multi-source research or codebase analysis inline — dispatch Explore/general-purpose agents and read their conclusions.

## Precedence

For code mutations this rule supersedes tool-routing.md's "stay native" guidance. Native tools remain correct for the orchestrator's own reads and the judgment artifacts above.
