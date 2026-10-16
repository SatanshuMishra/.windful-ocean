# Global invariants (every project, no exceptions)

- Weigh every trade-off by the Three Pillars, Quality > Optimization > Speed, as guidance, not a gate: pick the model, effort and tool that does the job best on evidence; among equals, the cheaper; pay only for capability the job can use.
- Write code, commits, plans, docs and UI in words and standard punctuation; use emojis only when the user asks for them.
- Author commits, pull requests and comments as the user alone; settings enforce it for commits with `includeCoAuthoredBy: false`.
- Live databases: read and export freely through the PII-free reader role; explain every schema or data change in plain English and get my approval first. Rule: `~/.claude/rules/common/database-access.md`.
- Open every pull request through the GitHub MCP `create_pull_request` tool, with the title and body `pull-request render` prints; a hook refuses any other title or body, and ad-hoc `gh pr create` stays denied. Only a human merges. The `pull-request:open` skill carries the title grammar and body fields.
- Every request that changes a git repository picks a lane up front and runs it autonomously, with no question to the user: direct for a one-sentence change with a known cause (edit, test, open a pull request), standard for a small change interphase's brief lane carries (one build, one review round), and full for the rest (interphase specs it, mitosis builds it, independent reviewers judge it, and confirmed blockers are fixed directly on the branch, at most two fix rounds). Rule: `~/.claude/rules/common/pipeline.md`.
- Persistent memory: store only durable, non-derivable facts; verify recalled specifics against code; update or delete stale memories on contact.
- Run each Bash command in the directory the shell is already in, naming files by repo-relative or absolute path: a `cd` plus a file read in one compound command forces a permission prompt for as long as any `Read()` deny rule exists in settings.
- A recursive grep over any `~/.claude` path needs a trailing slash. Those paths are symlinks, and BSD `grep -r` refuses to traverse a symlinked directory given without one: it prints nothing and exits 0.

# What configuration states

Configuration states preferences, constraints, and facts about this project that the harness cannot know. What Claude Code itself can do, from its turn lifetime and whether subagents survive to what is delivered when and what a tool returns, is the harness's to describe: it does so at runtime, accurately and for free, and it updates without telling this repository.

# Compact instructions

When summarizing a conversation, keep verbatim the latest `Pipeline anchor:` line, the logbook thread id, every run home path, and the slug, MSP and round in progress.

After a summary, read the `# Logbook:` and `# Pipeline:` briefings before acting.
