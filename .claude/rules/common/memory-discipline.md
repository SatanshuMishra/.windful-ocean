# Memory Discipline

Governs the auto-memory directory (`~/.claude/projects/<project-slug>/memory/`). Memory is per-project: one file per fact, `MEMORY.md` as the index loaded each session.

## Storage Filter (what qualifies)

Store ONLY facts that are durable and not derivable from the repository:

- Decisions and their rationale ("billing uses event sourcing because of the SOC2 audit")
- Constraints not visible in code (compliance requirements, vendor commitments, performance budgets)
- User preferences and feedback on how to work, including the why
- External pointers (staging URLs, dashboards, tickets, docs)

NEVER store:

- Code structure, file lists, function names, or anything derivable from the repo, git history, or CLAUDE.md
- Current task state or in-progress work — that belongs in a session-handoff, not memory
- Anything that changes daily; if a fact churns with normal development, it does not qualify

## Recall Discipline

- Treat recalled memories as hints, not facts; they reflect what was true when written
- If a memory names a file, function, flag, or command, verify it still exists before acting on it
- If memory and code disagree, the code wins (same principle as no-comments.md)

## Curation

- Update the existing memory file rather than creating a duplicate; delete memories found to be wrong
- Write dates as absolute (2026-06-11), never relative ("last week")
- Keep per-project memory small and high-altitude: roughly 20-40 short files even on large projects; small projects need far fewer
- A good memory is something a fresh agent would need an hour of archaeology to rediscover
