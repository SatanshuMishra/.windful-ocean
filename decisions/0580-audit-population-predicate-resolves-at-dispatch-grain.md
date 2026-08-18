---
Status: accepted
Date: 2026-08-18T18:50:50.725Z
Thread-Id: 01M04HH9W6HVPQJDPW24WH48GC
---

# 0580. Resolve the audit population predicate at dispatch grain, superseding 0537's refuted premise

## Context

The population defect reproduced against the live observer store, on a frozen 2479-row snapshot. 295 of 295 real SubagentStart rows carry a NULL agent_transcript_path, so reader.mjs:27's row-level test yields dispatch_starts = 0. Confirmed by running the instrument itself, not by reading it: run.mjs fell-back returns dispatch_starts 0, and never-observed labels 13 of 13 roster agents never-observed while reporting a healthy-looking 88.1 percent coverage over a population that is empty. The root cause is deeper than the reproduction hypothesis. Decision 0537 claimed 52 of 55 rows have NO transcript and NO sidecar; measured, 0 of 55 lack a transcript and 51 lack sidecar and agent_type. 0537 conflated no-sidecar with no-transcript, and reader.mjs implemented the half that was never true of any row. The deciding structural fact: transcript presence is an event-phase artifact, 0 percent on starts and 100 percent on stops, not a population signal, so every row-level predicate flips one dispatch's label between its own start and its own stop.

## Options

- A - keep the current transcript-only row test: dispatch_starts 0, structurally broken
- B - transcript OR agent_type: recovers 295 but reads a field that falls back to the payload when the sidecar is silent, so it can inflate the very denominator c5 grades on
- C - sidecar only: reclassifies 1923 stop rows as internal
- D - 0537 taken literally, transcript OR sidecar at row level: drops 3 real dispatches and still flips labels between phases
- E - D resolved per dispatch over a session_id plus agent_id partition: recovers 295 of 295

## Outcome

Predicate E. Population is resolved at dispatch grain with a window function over (session_id, agent_id), testing agent_transcript_path OR depth OR parent_agent_id. It recovers all 295 real start rows against 0 today, is stable across event phases, and NEVER reads agent_type - so the payload-fallback inflation risk is structurally excluded rather than merely absent from this corpus. 0537's factual premise is superseded: its intent, separating real dispatches from artifact-less internal ones, is what E encodes, and its stated measurement is refuted by execution. Two things are deliberately NOT settled here. Under E the internal population is 0 of 2479, so the partition currently separates nothing real and whether an internal population exists at all is a question this log cannot answer - it is left open rather than assumed either way. And 295 start rows produce 454 pairs, implying duplicate stop rows per agent_id, so c5's terminal coverage must be measured at dispatch grain and never by joining rows. The pinned bar in 0579 survives unchanged: its exclusion clause simply excludes nothing in this corpus, which moves neither the 50 percent bar nor the minimum window of 20.
