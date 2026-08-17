---
Status: accepted
Date: 2026-08-17T17:19:47.979Z
Thread-Id: 01M04HH9W6HVPQJDPW24WH48GC
---

# 0537. Artifact-less internal subagents are most of the log, so every audit rate must separate them from real dispatches

## Context

U3.3's design was written against a measured 9.6 percent attribution coverage, reading the 90 percent of rows with a null agent_type as a platform sparsity in the sidecar. U3.2's implementation found the real cause and it is not sparsity. Of 55 rows the live observer logged, 52 name an agent that has NO transcript and NO sidecar at all. In one orchestrator session these arrived on a roughly 32 second cadence, 50 of them against 12 real Agent dispatches. They are artifact-less internal subagents the platform fires, not dispatches anyone made. Against the population that IS a real dispatch, sidecar-evidenced and replayed as start payloads, agent_type is empty on 0.00 percent of 1749. A second measurement lands the same way: 77 of 1747 sidecars carry no spawnDepth, so depth is null rather than 1, and reading null as a main-thread dispatch would be wrong.

## Options

- Leave U3.3 to report rates over all rows, where 90 percent of the denominator is internal noise and every published rate is wrong
- Require U3.3 to separate artifact-less internal rows from real dispatches, and to state which population each answer is over
- Filter the artifact-less rows out at write time in the observer, discarding evidence before anyone has decided it is noise

## Outcome

U3.3 must SEPARATE the two populations and name the population every answer is computed over. Rows with no transcript and no sidecar are internal subagent firings, not dispatches, and a rate whose denominator is 90 percent internal noise measures the noise. This supersedes the 9.6 percent coverage framing in 0536: the coverage label stays, but it is now a statement about which population a row belongs to rather than a claim that attribution is broken. Filtering at write time is rejected outright - the observer copies what it is given and classification is an audit-time judgment, exactly the derive-when-durable rule of 0524, and discarding rows at write time would destroy the only evidence that the two populations differ. Depth null is a third state, never a synonym for 1, and any query grouping by depth must carry it as its own bucket. A related process gap is filed rather than fixed: a unit lead has no authenticated channel to its own dispatched worker. The worker in this unit received a mid-task correction, could not verify it came from its task-giver, correctly declined to redesign on unverified say-so, and emitted CAPABILITY-BLOCKED for the missing capability - the instruction-source boundary behaving exactly as intended, at the cost of the lead having to apply the correction itself.
