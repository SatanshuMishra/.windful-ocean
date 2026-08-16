---
Status: accepted
Date: 2026-08-16T17:37:46.787Z
Thread-Id: 01M04HH9W6HVPQJDPW24WH48GC
---

# 0469. Rebuild the observer to append one line per run and do everything else at audit time

## Context

A mechanical autopsy of the existing observer found every failure shares one cause: it tried to be intelligent at write time. It classified with an 18-word first-match substring scan; aggregated by re-reading the entire session transcript from byte 0 on every completion; cached broadcast state in 209 zero-byte files with no expiry; latched gap resolution permanently with no reopening path; and declared duration_ms and outcome as fields it hardcoded to null and never computed. The user requires useful non-abstract data, no broadcasting, near-zero disruption to real work, local-only storage, simple over complex, and expandability to skills and plugins later.

## Options

- Repair the existing pipeline in place - rejected: the data model and the write-time intelligence are the defect, not the implementation quality
- Use the native observer/observerMessage/observeSubagents frontmatter fields Claude Code ships - rejected: it spawns an LLM to watch an LLM on every dispatch, which is the opposite of the near-zero-disruption requirement
- SQLite as the store, per the research recommendation - rejected on the write path, see outcome
- Append-only JSONL written by hooks, queried with DuckDB at audit time - chosen

## Outcome

One rule governs the design: no write-time intelligence. The observer appends one JSON line per agent run and does nothing else. Classification, aggregation, clustering, gap detection and resolution all move to audit time, over the raw log, only when the user asks. Storage is append-only JSONL, departing from the research recommendation of SQLite: SQLite permits one writer at a time per file, and this user runs parallel sessions and worktrees, so a hook blocking on a write lock is exactly the disruption forbidden. A POSIX O_APPEND line write takes no lock, and DuckDB reads JSONL directly with no import step, so the dumb write path costs nothing in query power. Never sample - sampling exploits repetition inside short windows that a handful of daily dispatches does not have. Event shape is a CloudEvents-style envelope plus open payload, with a subject field as the expandability seam for skills and plugins later; no registration system, schema versioning or query abstraction is built now. Every recorded field must have a named question it answers - a field with no consumer is a defect, which is what makes duration_ms and outcome sitting empty for 46 days a defect rather than an oversight. Outcome is taken from the receipt verdict, never self-reported, because no bound hook payload carries a success signal. Gap 19 dissolves rather than gets fixed: resolution is never stored, so it is computed at audit time from whether a pattern has stopped appearing, which reopens by construction.
