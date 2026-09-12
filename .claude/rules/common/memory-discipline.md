# Memory Discipline

Governs the per-project auto-memory directory: one file per fact, `MEMORY.md` as the index loaded each session.

## What qualifies

Store only facts that are durable and not derivable from the repository: decisions and their rationale, constraints not visible in code (compliance, vendor commitments, performance budgets), user preferences about how to work including the why, and external pointers such as dashboards or tickets.

## What never qualifies

Code structure, file lists, function names, or anything derivable from the repo, git history, or CLAUDE.md. Current task state or in-progress work, which belongs in a debrief. Anything that changes daily - if a fact churns with normal development, it does not qualify.

## Recall

Treat a recalled memory as a hint, not a fact; it reflects what was true when written. If it names a file, function, flag, or command, verify that still exists before acting on it. Where memory and code disagree, the code wins.

## Curation

Update the existing file rather than creating a duplicate; delete memories found to be wrong. Write dates absolute (2026-06-11), never relative. Keep each project's memory small and high-altitude: a good memory is something a fresh agent would need an hour of archaeology to rediscover.
