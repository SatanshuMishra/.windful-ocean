---
Status: accepted
Date: 2026-08-06T20:36:30.943Z
Thread-Id: 01KZC5TSBXJDM28F8ZCRXC9JQM
---

# 0271. SPEC B is authored next in a fresh session, SPEC A is implemented before SPEC B, and SPEC B leads with the cost instrument

## Context

The user approved SPEC A on 2026-08-06 (c4 passed) and asked whether SPEC B is authored now or after SPEC A is implemented. Three facts bear on it. First, the research SPEC B rests on is perishable: the engine map, the stacked-PR research and the dispatch census cost roughly 340k subagent tokens, those subagent transcripts are gone, and the only surviving copies are the 2026-08-06T18-37 and 2026-08-06T19-31 session events on this thread. Second, the two SPECs touch disjoint surfaces - SPEC A is config promotion machinery, SPEC B is engine token/latency cost, monolith decomposition and stacked PRs - so nothing in SPEC A's implementation is a prerequisite for SPEC B's authoring. Third, there IS a real coupling, but it lives in implementation order rather than authoring order: SPEC B's MSPs write into .claude/lib, .claude/workflows and .claude/hooks, which is exactly the hot-swap hazard named in 0269's context, where rebuilding the engine swaps the engine and its guard hooks underneath the session doing the rebuild. Separately, the telemetry gap recorded in the 2026-08-06T19-31 event is unchanged and still blocking: no token or tool-call accounting exists anywhere in the engine, so every cost claim SPEC B wants to make is unmeasurable today.

## Options

- Author SPEC B next, before SPEC A is implemented. Converts the perishable 340k-token investigation into a durable reviewable artifact while it still exists, and costs nothing in correctness because the authoring dependency does not exist.
- Implement SPEC A first, then author SPEC B. Makes the environment safe for engine rebuilds before any SPEC B work, but delays authoring for the length of an implementation and leaves the investigation surviving only in ledger events for that whole period.
- Defer SPEC B authoring until the telemetry instrument has landed and produced real numbers. Maximally evidence-driven, but the instrument is itself SPEC B content, so this makes the SPEC wait on its own first unit of work.

## Outcome

Approved by the user on 2026-08-06, with the explicit added instruction that SPEC B is written in a FRESH session. Order is: SPEC B authored and approved next, then SPEC A implemented, then SPEC B implemented.

Chosen because the decisive asymmetry is perishability against a dependency that does not exist. Authoring SPEC B now costs nothing in correctness, and every session that passes without writing it is a session in which a compaction or a bad ledger write can cost the whole 340k-token investigation. Option 3 was rejected as circular: the instrument is SPEC B's own first unit of work, so waiting for its numbers makes the SPEC wait on itself.

Two consequences the next session carries. First, implementation order is NOT authoring order: SPEC A must LAND before SPEC B's MSPs start rewriting .claude/lib, .claude/workflows and .claude/hooks, because that is the hot-swap hazard 0269 exists to remove. Recording it here is the only place that ordering is written down, since implementing either SPEC is out of scope for this thread.

Second, a binding constraint on SPEC B's CONTENT, not merely its schedule: SPEC B must lead with the token and tool-call instrument and write every cost target as a falsifiable hypothesis with a named measurement, never as a budget. This is the precise defect that sank the 2026-07-30 document, which budgeted Ship at 1 dispatch against 13 observed conditional sites with no happy-path subset established anywhere, and whose Decompose fusion carried no falsifier at all. That document's own proposed instrument counted dispatches and wall-clock only, which would have scored both as wins even if token cost rose. The instrument must count TOKENS.
