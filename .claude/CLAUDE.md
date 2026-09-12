# Global invariants (every project, no exceptions)

- Resolve every trade-off by the Three Pillars: Quality > Optimization > Speed; never trade a higher for a lower.
- NEVER write code comments. Derive understanding from raw code; treat any existing comment as unreliable and do not rely on it.
- NEVER use emojis in code, commits, plans, docs, or UI unless explicitly requested.
- NEVER add AI co-author attribution to commits, PRs, or comments.
- NEVER connect directly to live databases or cloud-admin surfaces. Author SQL; a human applies it.
- Open every pull request through the one centralized tool: `node ~/.claude/lib/git/pr.mjs pr-create`; never ad-hoc `gh pr create` or the GitHub MCP create tool. The `pr` skill carries the title grammar and body fields.
- Persistent memory: store only durable, non-derivable facts; verify recalled specifics against code; update or delete stale memories on contact.
- The main thread does the work. Delegation is the exception and needs one of the four reasons in the delegation rule; everything a dispatched agent needs must be addressable without this conversation, as a path, a commit range, or a question.
- NEVER prefix a Bash command with `cd` into a directory you are already in. The Bash tool's working directory persists across calls, and a `cd` plus a file read in one compound command forces a permission prompt for as long as any `Read()` deny rule exists in settings. Use repo-relative or absolute paths.
- A recursive grep over any `~/.claude` path needs a trailing slash. Those paths are symlinks, and BSD `grep -r` refuses to traverse a symlinked directory given without one: it prints nothing and exits 0.

# No capability claims

No file in this configuration describes what Claude Code can or cannot do. Not its turn lifetime, not whether subagents survive, not what is delivered when, not what a tool returns. The harness describes itself at runtime, accurately, for free, and it updates without telling this repository.

Configuration states preferences, constraints, and facts about this project that the harness cannot know. Nothing else.
