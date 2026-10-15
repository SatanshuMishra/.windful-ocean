# Global invariants (every project, no exceptions)

- Weigh every trade-off by the Three Pillars, Quality > Optimization > Speed, as guidance, not a gate: pick the model, effort and tool that does the job best on evidence; among equals, the cheaper; never pay for capability the job can't use.
- NEVER write code comments. Derive understanding from raw code; treat any existing comment as unreliable and do not rely on it.
- NEVER use emojis in code, commits, plans, docs, or UI unless explicitly requested.
- NEVER add AI co-author attribution to commits, PRs, or comments.
- Live databases are readable for structure only: connect only as the human-created structure-reader login, read only the catalogs, never rows, never write. Every change is SQL a human applies. Rule: `~/.claude/rules/common/no-direct-db-access.md`.
- Open every pull request through the GitHub MCP `create_pull_request` tool, with the title and body `pull-request render` prints; a hook refuses any other title or body, and ad-hoc `gh pr create` stays denied. Only a human merges. The `pull-request:open` skill carries the title grammar and body fields.
- Every request that changes a git repository picks a lane up front and runs it autonomously, with no question to the user: direct for a one-sentence change with a known cause (edit, test, open a pull request), standard for a small change interphase's brief lane carries (one build, one review round), and full for the rest (interphase specs it, mitosis builds it, independent reviewers judge it, and confirmed blockers are fixed directly on the branch, at most two fix rounds). Rule: `~/.claude/rules/common/pipeline.md`.
- Persistent memory: store only durable, non-derivable facts; verify recalled specifics against code; update or delete stale memories on contact.
- The main thread does the work. Delegation is the exception and needs one of the four reasons in the delegation rule; everything a dispatched agent needs must be addressable without this conversation, as a path, a commit range, or a question.
- NEVER prefix a Bash command with `cd` into a directory you are already in. The Bash tool's working directory persists across calls, and a `cd` plus a file read in one compound command forces a permission prompt for as long as any `Read()` deny rule exists in settings. Use repo-relative or absolute paths.
- A recursive grep over any `~/.claude` path needs a trailing slash. Those paths are symlinks, and BSD `grep -r` refuses to traverse a symlinked directory given without one: it prints nothing and exits 0.

# No capability claims

No file in this configuration describes what Claude Code can or cannot do. Not its turn lifetime, not whether subagents survive, not what is delivered when, not what a tool returns. The harness describes itself at runtime, accurately, for free, and it updates without telling this repository.

Configuration states preferences, constraints, and facts about this project that the harness cannot know. Nothing else.

# Compact instructions

When summarizing a conversation, keep verbatim the latest `Pipeline anchor:` line, the logbook thread id, every run home path, and the slug, MSP and round in progress.

After a summary, read the `# Logbook:` and `# Pipeline:` briefings before acting.
