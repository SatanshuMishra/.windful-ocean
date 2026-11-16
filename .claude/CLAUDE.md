# Global invariants (every project, no exceptions)

- Weigh every trade-off by the Three Pillars, Quality > Optimization > Speed, as guidance, not a gate: pick the model, effort and tool that does the job best on evidence; among equals, the cheaper; pay only for capability the job can use.
- Write code, commits, plans, docs and UI in words and standard punctuation; use emojis only when the user asks for them.
- Author commits, pull requests and comments as the user alone; settings enforce it for commits with `includeCoAuthoredBy: false`.
- Live databases: read and export freely through the reader role, keeping PII out; explain every schema or data change in plain English and get my approval first. Rule: `~/.claude/rules/common/database-access.md`.
- Open every pull request with one plain `gh pr create --title <title> --body-file <file>` Bash command carrying the title and body `pull-request render` prints, so the desktop app arms Auto-fix on a pull request this session opens; hooks refuse any other form, title or body, gh api POSTs to the pulls endpoint stay denied, and the GitHub MCP `create_pull_request` tool with render's output is the fallback. Only a human merges. The `pull-request:open` skill carries the title grammar and body fields.
- Every request that changes a git repository picks a lane up front: direct for a one-sentence change with a known cause (edit, test, open a pull request), standard for a small change interphase's brief lane carries (one build, one review round), and full for the rest (an interview up front, then interphase specs it, mitosis builds it, independent reviewers judge it, and confirmed blockers are fixed directly on the branch until review is green or a diagnosis classes a blocker blocked, which opens it as a draft pull request, or stops the run with nothing pushed when the blocked blocker is CRITICAL). Only the full lane's interview asks the user anything; after its read-back is approved, the run goes to the last pull request without a question, filling any later gap from the recorded intent. Rule: `~/.claude/rules/common/pipeline.md`.
- Persistent memory: store only durable, non-derivable facts; verify recalled specifics against code; update or delete stale memories on contact.
- When a Bash command targets the directory the shell is already in, run it there directly with repo-relative or absolute paths: a `cd` into it plus a file read in one compound command forces a permission prompt for as long as any `Read()` deny rule exists in settings.
- A recursive grep over any `~/.claude` path needs a trailing slash. Those paths are symlinks, and BSD `grep -r` refuses to traverse a symlinked directory given without one: it prints nothing and exits 0.

# What configuration states

Configuration states preferences, constraints, and facts about this project that the harness cannot know. What Claude Code itself can do, from its turn lifetime and whether subagents survive to what is delivered when and what a tool returns, is the harness's to describe: it does so at runtime, accurately and for free, and it updates without telling this repository.

# Compact instructions

When summarizing a conversation, keep verbatim the latest `Pipeline anchor:` line, the logbook thread id, every run home path, and the slug, MSP and round in progress.

After a summary, read the `# Logbook:` and `# Pipeline:` briefings before acting.
