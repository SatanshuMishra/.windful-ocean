---
Status: accepted
Date: 2026-08-17T15:41:03.217Z
Thread-Id: 01M04HH9W6HVPQJDPW24WH48GC
---

# 0524. The observer record is ten fields, with parent, depth and agent type read from the platform sidecar

## Context

SPEC unit U3.1 declared a 22-field observer record and stated that seven fields could not be read from a hook, which blocked wave 3. U3.2's deliverable asserted that SubagentStart is the only event carrying the parent, and its acceptance required the start row to name the dispatcher. Investigation against the shipping binary rather than the documentation found the premise false and the count low: no hook event carries a parent identifier, a nesting depth, a success signal, token usage, cost or a subagent duration, making thirteen fields unreachable, not seven. Hook-payload agent_type is the string unknown on 9218 of 16263 rows.

## Options

- Keep the 22-field record and write null for every field a hook cannot reach, producing a record that looks complete and is mostly empty.
- Cut the record to what hook payloads carry, and accept parent attribution and depth as permanently lost platform ceilings.
- Cut the record to what is reachable, and recover parent, depth and agent_type from the platform-written sidecar at a path derived from payload fields.

## Outcome

Ten fields, every one present on every row, unknown written as an explicit null rather than an omitted key: ts, subject, event, session_id, cwd, agent_id, agent_type, agent_transcript_path, parent_agent_id, depth. Output path is ~/.claude/observer/events/YYYY-MM.jsonl, root overridable by CLAUDE_OBSERVER_DIR so tests write in isolation; monthly UTC rotation, O_APPEND, no lock, no backward compatibility with the retiring path. agent_type, parent_agent_id and depth come from the platform sidecar at the transcript path minus .jsonl, plus /subagents/agent-<agent_id>.meta.json - a pure function of two payload fields. Sidecar agentType is populated on 4538 of 4538 files against the payload's 56.7 percent unknown, and parentAgentId is present on every nested dispatch and absent on every depth-1 one across 4536 files, so a null parent_agent_id discriminates a main-thread dispatch rather than signalling a missing value. The governing rule this establishes: derive at audit time when the source is durable, and copy at write time only when the source is ephemeral and the read is O(1) at a payload-derived path. duration_ms, tokens_in, tokens_out, cache_read, cache_creation, tool_calls, num_turns, outcome and receipt_verdict are not fields and are derived at audit time. fallback_reason and denial become their own event types, since denials are 0..N per run and a scalar would be lossy. project is replaced by raw cwd because basename collapses distinct worktrees; source is dropped as a constant on every row, the emitter defect verbatim. subject is a namespace discriminator that is constant by construction and must never be read as a measurement. U3.2's acceptance is restated to prove pairing, duration, depth-2 attribution against a nested fixture, and a measured rather than assumed agent_type empty-rate.
