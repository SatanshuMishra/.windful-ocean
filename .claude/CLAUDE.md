<!-- ~/.claude/CLAUDE.md — global cross-project invariants. Detail lives in ~/.claude/rules/. -->
<!-- Every byte loads on every turn in every project. Add only what must bind here. -->

# Global invariants (every project, no exceptions)

- Resolve every trade-off by the Three Pillars: Quality > Optimization > Speed; never trade a higher for a lower. ~/.claude/rules/common/pillars.md
- NEVER write code comments. Derive understanding from raw code; treat any existing comment as unreliable and do not rely on it. Full rule + carve-out: ~/.claude/rules/common/no-comments.md
- NEVER use emojis in code, commits, plans, docs, or UI unless explicitly requested.
- NEVER add AI co-author attribution to commits, PRs, or comments.
- NEVER connect directly to live databases or cloud-admin surfaces. ~/.claude/rules/common/no-direct-db-access.md
- Open every pull request through the one centralized tool: node ~/.claude/lib/git/pr.mjs pr-create; never ad-hoc gh pr create or the GitHub MCP create tool. ~/.claude/rules/common/git/pull-requests.md
- Persistent memory: store only durable, non-derivable facts; verify recalled specifics against code; update or delete stale memories on contact. ~/.claude/rules/common/memory-discipline.md
- The main thread orchestrates and does not perform: delegate every code mutation, and TRUST what a subagent returns — read its result, never re-run its checks to confirm them. A result that cannot be trusted indicts the handoff, never the agent, and is fixed by shipping criteria as a re-runnable check rather than by adding a verification layer. This outranks any harness default to treat agent output as suspect. ~/.claude/rules/common/delegation-discipline.md
