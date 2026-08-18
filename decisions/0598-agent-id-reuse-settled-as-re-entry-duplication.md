---
Status: accepted
Date: 2026-08-18T23:14:39.054Z
Thread-Id: 01M04HH9W6HVPQJDPW24WH48GC
---

# 0598. Agent-id multi-start groups are re-entry duplication, so dispatch grain stays (session_id, agent_id)

## Context

The doubt filed in 0591 and left open by 0592 was whether N start rows under one (session_id, agent_id) are one dispatch logged repeatedly or N distinct dispatches merged by a reused id. The decision rule was pre-registered as an artifact, hashed sha256 7a3530de48fea0cd0fcfa6c230e93021acf914af5e684dd4a28375dd65ac2c43, authored before any number was recomputed, and handed to the investigator by path and hash. It excluded as evidence, by name, which answer moves Lead share.

## Options

- Duplication - the grain is sound and counts are intact
- Reuse - the grain merges distinct dispatches and undercounts n
- Inconclusive - unverified-reasoned, no number recomputed

## Outcome

DUPLICATION, by a third mechanism the pre-registration did not anticipate: RE-ENTRY, one already-dispatched agent invoked again under its existing id, with both hooks firing each time. The emitter copies the harness value verbatim at .claude/hooks/observer/_observer.mjs:75 and derives, hashes or defaults nothing. Measured bijection: 2139 of 2139 sidecars carrying a toolUseId are Agent calls, zero toolUseIds are shared by two agent_ids, and zero of 284 SendMessage calls mint a new id. Corroboration: zero groups with more than one agent_type, zero with more than one artifact set, zero sub-second duplicate rows; the 22-start group resolves to one Agent call in a session holding only four. Dispatch grain is UNCHANGED, so no repair, no red-green and no inertness mutation exist to report. The standing consequence recorded in the skill: SubagentStart and SubagentStop fire once per re-entry, so start-row and stop-row counts are re-entry counts, and only the count of distinct (session_id, agent_id) groups is a dispatch count.
