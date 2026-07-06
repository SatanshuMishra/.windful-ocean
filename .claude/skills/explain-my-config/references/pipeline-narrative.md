# Feature pipeline narrative

Trace a generic "build feature X" request through the configured machine. Render as a Mermaid
`flowchart TD` inside visual-explainer's full zoom-enabled `diagram-shell` (never bare
`<pre class="mermaid">`). Below the diagram, show a step table annotating the hooks that fire and
the rules that constrain at each step.

RECONCILE BEFORE ASSERTING: for every skill, agent, or hook named below, confirm it appears in the
live inventory (from `audit-config.py`). If something is absent, omit or grey it out and note the
gap — never assert a piece that no longer exists.

## Steps

1. **Request arrives** — rule: skill-check first (using-superpowers); the orchestrator looks for a
   matching skill before acting.
2. **Brainstorm** — skill: brainstorming. Produces a design/spec; HARD-GATE blocks implementation
   until approved.
3. **Plan** — skill: writing-plans. Turns the spec into bite-sized tasks.
4. **Dispatch** — skills: subagent-driven-development / dispatching-parallel-agents. Rule:
   delegation-discipline (main thread orchestrates; subagents implement).
5. **Implement** — agent: implementer (or mechanical-editor for rote edits; test-engineer for
   tests). Rule: testing.md admission gate + scoped TDD; no-comments; coding-style (immutability).
   Hooks (PreToolUse on Edit/Write): block-env-edits, secret-scanner, protect-claude-config.
   Hooks (PostToolUse on Edit/Write): lint-on-edit, ui-ux-audit-on-edit.
6. **Review** — agents: code-reviewer, plus security-reviewer on security-relevant diffs. Rule:
   address CRITICAL/HIGH before proceeding.
7. **Verify** — skill: verification-before-completion; project `/verify-<project>` scoped by
   verification-strategist. Hook (PreToolUse on Bash at commit): pre-commit-scoped-verify.
8. **Commit** — plugin: commit-commands; rules: git/commits (Conventional Commits, atomic),
   git/branching (never commit to default branch). Hook (Bash): block-destructive-bash guards
   dangerous git.
9. **Persist context** — skill: session-handoff writes the continuity ledger; auto-memory stores
   durable decisions. Hook (Stop): graphify-refresh updates the codebase map; notify-complete pings.

## Cross-cutting throughout

- Tool routing (graphify -> Serena -> grep) governs how every read happens.
- no-direct-db-access forbids touching live databases/cloud at any step.
- Permissions (allow/deny/ask) gate which tool actions run, block, or prompt.
