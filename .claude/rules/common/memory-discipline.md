# Memory Discipline

Governs the per-project auto-memory directory: one file per fact, `MEMORY.md` as the index loaded each session.

## What qualifies

Store only facts that are durable and that the repository, its git history and CLAUDE.md do not already hold: decisions and their rationale, constraints not visible in code (compliance, vendor commitments, performance budgets), user preferences about how to work including the why, and external pointers such as dashboards or tickets. A good memory is something a fresh agent would need an hour of archaeology to rediscover. A fact that churns with normal development is not durable. Current task state and in-progress work go in a debrief.

## Recall

Treat a recalled memory as a hint that reflects what was true when written. Before acting on a file, function, flag or command it names, verify that it still exists. Where memory and code disagree, the code wins.

## Curation

Update the existing file rather than creating a duplicate, and delete memories found to be wrong. Write dates absolute (2026-06-11). Keep each project's memory small and high-altitude.
